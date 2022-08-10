import * as path from 'path';
import { Aws, Duration, Arn, Stack, CustomResource, CfnResource, ArnFormat } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime, IFunction, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface SARDeploymentProps {
  application: string;
  sematicVersion: string;
  /**
   * The region of the sar is deployed.
   *
   * @default Aws.Region
   */
  region?: string;
  outputAtt: string;
  /**
   * The prefix of stack name of SAR deployment.
   *
   * @defualt the id of construct
   */
  name?: string;
  /**
   * The parameters to be overrided.
   *
   * @defualt no overrided parameters
   */
  parameters?: [
    {
      name: string;
      value: string;
    }
  ];
}

/**
 * Deploy the application of SAR with given sematice version to given AWS region.
 */
export class SARDeployment extends Construct {

  readonly funcArn: string;
  readonly funcVersionArn: string;
  readonly deployFunc: IFunction;

  constructor(scope: Construct, id: string, props: SARDeploymentProps) {
    super(scope, id);

    this.deployFunc = new NodejsFunction(this, 'TransacationFunc', {
      entry: path.join(__dirname, '../lambda.d/sar-deployment/sar.ts'),
      handler: 'handler',
      timeout: Duration.minutes(10),
      memorySize: 128,
      runtime: Runtime.NODEJS_16_X,
      tracing: Tracing.ACTIVE,
    });
    this.deployFunc.addToRolePolicy(new PolicyStatement({
      actions: [
        'serverlessrepo:GetApplication',
        'serverlessrepo:CreateCloudFormationChangeSet',
      ],
      resources: [props.application],
    }));
    this.deployFunc.addToRolePolicy(new PolicyStatement({
      actions: [
        'cloudformation:DescribeChangeSet',
        'cloudformation:DescribeStacks',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:CreateChangeSet',
      ],
      resources: [
        Arn.format({
          region: props.region ?? Aws.REGION,
          service: 'cloudformation',
          resource: 'stack',
          resourceName: `*-${props.name ?? id}-*`,
        }, Stack.of(this)),
        Arn.format({
          region: props.region ?? Aws.REGION,
          service: 'cloudformation',
          resource: 'transform',
          account: 'aws',
          resourceName: '*',
        }, Stack.of(this)),
      ],
    }));
    this.deployFunc.addToRolePolicy(new PolicyStatement({
      actions: [
        'lambda:CreateFunction',
        'lambda:GetFunction',
        'lambda:PublishVersion',
        'lambda:TagResource',
      ],
      resources: [
        Arn.format({
          region: props.region ?? Aws.REGION,
          service: 'lambda',
          resource: 'function',
          resourceName: '*',
          arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        }, Stack.of(this)),
      ],
    }));
    this.deployFunc.addToRolePolicy(new PolicyStatement({
      actions: [
        's3:GetObject',
      ],
      resources: ['*'],
    }));
    this.deployFunc.addToRolePolicy(new PolicyStatement({
      actions: [
        'iam:GetRole',
        'iam:CreateRole',
        'iam:AttachRolePolicy',
        'iam:TagRole',
      ],
      resources: ['*'],
    }));
    this.deployFunc.addToRolePolicy(new PolicyStatement({
      actions: [
        'iam:PassRole',
      ],
      resources: ['*'],
    }));
    (this.deployFunc.node.findChild('ServiceRole').node.findChild('DefaultPolicy').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W12',
            reason: 'wildcard resource in IAM policy for create role for sar function',
          },
          {
            id: 'F39',
            reason: 'PassRole action to all resources due to no way to know the role of third party SAR function',
          },
        ],
      });

    const sarAppDeployment = new CustomResource(this, `SarDeploymentResource-${id}`, {
      serviceToken: this.deployFunc.functionArn,
      properties: {
        APPLICATION: props.application,
        SEMATIC_VERSION: props.sematicVersion,
        REGION: props.region ?? Aws.REGION,
        OUTPUT_ATT: props.outputAtt,
        NAME: props.name ?? id,
        Parameters: props.parameters?.map(p => {
          return {
            Name: p.name,
            Value: p.value,
          };
        }),
      },
    });

    this.funcArn = sarAppDeployment.getAttString('FuncArn');
    this.funcVersionArn = sarAppDeployment.getAttString('FuncVersionArn');
  }
}