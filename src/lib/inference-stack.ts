import * as path from 'path';
import { IVpc, ISecurityGroup, SecurityGroup } from '@aws-cdk/aws-ec2';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { IFunction, Runtime } from '@aws-cdk/aws-lambda';
import { PythonFunction, PythonLayerVersion } from '@aws-cdk/aws-lambda-python';
import { IQueue } from '@aws-cdk/aws-sqs';
import { Construct, Duration, Stack, NestedStack, NestedStackProps, Aws } from '@aws-cdk/core';

export interface InferenceProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly neptune: {
    endpoint: string;
    port: string;
    clusterResourceId: string;
  };
  readonly queue:IQueue;
  readonly dataColumnsArg: {
    id_cols: string;
    identity_cols: string;
    vertex_values_cols: string;
    dummies_cols: string;
  };
}

export class InferenceStack extends NestedStack {
  readonly inferenceSG: ISecurityGroup;
  readonly inferenceStatsFn: IFunction;

  constructor(scope: Construct, id: string, props: InferenceProps) {
    super(scope, id, props);

    const endpointName = 'FraudDetection'.toLowerCase();

    this.inferenceStatsFn = new PythonFunction(this, 'InferenceStatsFn', {
      entry: path.join(__dirname, '../lambda.d/inference/func'),
      layers: [
        new PythonLayerVersion(this, 'InferenceDataLayer', {
          entry: path.join(__dirname, '../lambda.d/inference/layer'),
          compatibleRuntimes: [Runtime.PYTHON_3_8],
        }),
        new PythonLayerVersion(this, 'InferenceNeptuneLibLayer', {
          entry: path.join(__dirname, '../script-libs/amazon-neptune-tools/neptune-python-utils'),
          compatibleRuntimes: [Runtime.PYTHON_3_8],
        }),
      ],
      index: 'inferenceApi.py',
      runtime: Runtime.PYTHON_3_8,
      handler: 'handler',
      timeout: Duration.minutes(2),
      memorySize: 512,
      environment: {
        MAX_FEATURE_NODE: String(30),
        CLUSTER_ENDPOINT: props.neptune.endpoint,
        CLUSTER_PORT: props.neptune.port,
        CLUSTER_REGION: Aws.REGION,
        ENDPOINT_NAME: endpointName,
        MODEL_BTW: String(0.9),
        QUEUE_URL: props.queue.queueUrl,
        TRANSACTION_ID_COLS: props.dataColumnsArg.id_cols,
        IDENTITIES_COLS: props.dataColumnsArg.identity_cols,
        NEIGHBOR_COLS: props.dataColumnsArg.vertex_values_cols,
        DUMMIED_COL: props.dataColumnsArg.dummies_cols,
      },
      vpc: props.vpc,
      securityGroup: this.inferenceSG = new SecurityGroup(this, 'inferenceSG', {
        vpc: props.vpc,
        allowAllOutbound: true,
      }),
    });
    props.queue.grantSendMessages(this.inferenceStatsFn);

    this.inferenceStatsFn.addToRolePolicy(new PolicyStatement({
      actions: ['neptune-db:connect'],
      resources: [
        Stack.of(this).formatArn({
          service: 'neptune-db',
          resource: props.neptune.clusterResourceId,
          resourceName: '*',
        }),
      ],
    }),
    );

    this.inferenceStatsFn.addToRolePolicy(new PolicyStatement({
      actions: ['sagemaker:InvokeEndpoint'],
      resources: [
        Stack.of(this).formatArn({
          service: 'sagemaker',
          resource: 'endpoint',
          resourceName: endpointName,
        }),
      ],
    }),
    );

  }
}

