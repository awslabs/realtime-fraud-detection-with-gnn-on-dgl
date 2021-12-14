import '@aws-cdk/assert/jest';
import { DatabaseCluster, InstanceType } from '@aws-cdk/aws-neptune-alpha';
import { App, Stack, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { InferenceStack } from '../src/lib/inference-stack';

describe('inference stack', () => {
  let stack: Stack;

  beforeAll(() => {
    ({ stack } = initializeStackWithContextsAndEnvs({}));
  });

  beforeEach(() => {
  });

  test('inference generator is created', () => {
    expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          QUEUE_URL: {
            Ref: 'referencetoTestStackTransQueue6E481EC7Ref',
          },
          CLUSTER_PORT: {
            Ref: 'referencetoTestStackDatabase1EBED910Port',
          },
        },
      },
      Handler: 'inferenceApi.handler',
      Layers: [
        {
          Ref: 'InferenceDataLayer6B4E00D0',
        },
        {
          Ref: 'NeptuneUtilLayer79E71FD3',
        },
      ],
      MemorySize: 512,
      Runtime: 'python3.8',
      Timeout: 120,
      TracingConfig: {
        Mode: 'Active',
      },
    });

  });

});

function initializeStackWithContextsAndEnvs(context: {} | undefined, env?: {} | undefined) {
  const app = new App({
    context,
  });
  const parentStack = new Stack(app, 'TestStack', { env: env });
  const vpc = new Vpc(parentStack, 'Vpc');
  const queue = new Queue(parentStack, 'TransQueue', {
    contentBasedDeduplication: true,
    encryption: QueueEncryption.KMS_MANAGED,
    fifo: true,
    removalPolicy: RemovalPolicy.DESTROY,
    visibilityTimeout: Duration.seconds(60),
  });
  const cluster = new DatabaseCluster(parentStack, 'Database', {
    vpc,
    instanceType: InstanceType.R5_LARGE,
    port: 8182,
  });

  const stack = new InferenceStack(parentStack, 'inferenceStack', {
    vpc,
    neptune: cluster,
    queue,
    sagemakerEndpointName: 'frauddetection',
    dataColumnsArg: {
      id_cols: 'card1,card2,card3,card4,card5,card6,ProductCD,addr1,addr2,P_emaildomain,R_emaildomain',
      cat_cols: 'M1,M2,M3,M4,M5,M6,M7,M8,M9',
      dummies_cols: 'M1_F,M1_T,M2_F,M2_T,M3_F,M3_T,M4_M0,M4_M1,M4_M2,M5_F,M5_T,M6_F,M6_T,M7_F,M7_T,M8_F,M8_T,M9_F,M9_T',
    },
  });
  return { stack };
}
