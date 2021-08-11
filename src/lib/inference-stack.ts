import * as path from 'path';
import { IVpc, SecurityGroup } from '@aws-cdk/aws-ec2';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { IFunction, Runtime, Tracing } from '@aws-cdk/aws-lambda';
import { PythonFunction, PythonLayerVersion } from '@aws-cdk/aws-lambda-python';
import { IDatabaseCluster } from '@aws-cdk/aws-neptune';
import { IQueue } from '@aws-cdk/aws-sqs';
import { Construct, Duration, Stack, NestedStack, NestedStackProps, Aws, Token, CfnResource, Aspects } from '@aws-cdk/core';
import { NeptuneUtilLayer } from './layer';
import { CfnNagWhitelist } from './utils';

export interface InferenceProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly neptune: IDatabaseCluster;
  readonly queue:IQueue;
  readonly sagemakerEndpointName: string;
  readonly dataColumnsArg: {
    id_cols: string;
    cat_cols: string;
    dummies_cols: string;
  };
}

export class InferenceStack extends NestedStack {
  readonly inferenceFn: IFunction;

  constructor(scope: Construct, id: string, props: InferenceProps) {
    super(scope, id, props);

    const inferenceSG = new SecurityGroup(this, 'inferenceSG', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });
    this.inferenceFn = new PythonFunction(this, 'InferenceFn', {
      entry: path.join(__dirname, '../lambda.d/inference/func'),
      layers: [
        new PythonLayerVersion(this, 'InferenceDataLayer', {
          entry: path.join(__dirname, '../lambda.d/inference/layer'),
          compatibleRuntimes: [Runtime.PYTHON_3_8],
        }),
        new NeptuneUtilLayer(this, 'NeptuneUtilLayer'),
      ],
      index: 'inferenceApi.py',
      runtime: Runtime.PYTHON_3_8,
      handler: 'handler',
      timeout: Duration.minutes(2),
      memorySize: 512,
      tracing: Tracing.ACTIVE,
      environment: {
        MAX_FEATURE_NODE: '50',
        CLUSTER_ENDPOINT: props.neptune.clusterEndpoint.hostname,
        CLUSTER_PORT: Token.asString(props.neptune.clusterEndpoint.port),
        CLUSTER_REGION: Aws.REGION,
        ENDPOINT_NAME: props.sagemakerEndpointName,
        MODEL_BTW: '0.2',
        QUEUE_URL: props.queue.queueUrl,
        TRANSACTION_ID_COLS: props.dataColumnsArg.id_cols,
        TRANSACTION_CAT_COLS: props.dataColumnsArg.cat_cols,
        DUMMIED_COL: props.dataColumnsArg.dummies_cols,
      },
      vpc: props.vpc,
      securityGroup: inferenceSG,
    });
    props.queue.grantSendMessages(this.inferenceFn);

    props.neptune.grantConnect(this.inferenceFn);
    props.neptune.connections.allowDefaultPortFrom(inferenceSG, 'access from inference job.');

    this.inferenceFn.addToRolePolicy(new PolicyStatement({
      actions: ['sagemaker:InvokeEndpoint'],
      resources: [
        Stack.of(this).formatArn({
          service: 'sagemaker',
          resource: 'endpoint',
          resourceName: props.sagemakerEndpointName,
        }),
      ],
    }),
    );

    Aspects.of(this).add(new CfnNagWhitelist());
    (this.inferenceFn.node.findChild('ServiceRole').node
      .findChild('DefaultPolicy').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'F4',
            reason: 'neptune only has connect action',
          },
        ],
      });
    (inferenceSG.node.defaultChild as CfnResource).addMetadata('cfn_nag', {
      rules_to_suppress: [
        {
          id: 'W40',
          reason: 'inference func need internet access to connect Neptune endpoint',
        },
        {
          id: 'W5',
          reason: 'inference func need internet access to connect Neptune endpoint',
        },
      ],
    });

    this.templateOptions.description = '(SO8013) - Real-time Fraud Detection with Graph Neural Network on DGL -- real-time inference for fraudulent transactions stack.';
  }
}

