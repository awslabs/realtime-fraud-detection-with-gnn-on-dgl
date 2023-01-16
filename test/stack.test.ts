import * as cxapi from '@aws-cdk/cx-api';
import { App, Stack, GetContextValueOptions, GetContextValueResult, Tags } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import * as mock from './context-provider-mock';
import { FraudDetectionStack } from '../src/lib/stack';

describe('fraud detection stack test suite', () => {
  let app: App;
  let stack: Stack;

  beforeAll(() => {
    ({ app, stack } = initializeStackWithContextsAndEnvs({}));
  });

  beforeEach(() => {
  });

  test.skip('Snapshot', () => {
    expect(app?.synth().getStackArtifact(stack?.artifactId).template).toMatchSnapshot();
  });

  test('vpc and bucket are created', () => {
    Template.fromStack(stack).hasResource('AWS::S3::Bucket', {
      Properties: {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
        LoggingConfiguration: {
          DestinationBucketName: {
            Ref: 'BucketAccessLog9C13C446',
          },
          LogFilePrefix: 'dataBucketAccessLog',
        },
      },
      UpdateReplacePolicy: 'Retain',
      DeletionPolicy: 'Retain',
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16',
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: {
        'Fn::Join': [
          '',
          [
            'com.amazonaws.',
            {
              Ref: 'AWS::Region',
            },
            '.s3',
          ],
        ],
      },
      VpcEndpointType: 'Gateway',
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'VPC',
      TrafficType: 'ALL',
      LogDestination: {
        'Fn::Join': [
          '',
          [
            {
              'Fn::GetAtt': [
                'BucketAccessLog9C13C446',
                'Arn',
              ],
            },
            '/vpcFlowLogs',
          ],
        ],
      },
      LogDestinationType: 's3',
    });
  });

  test('Neptune cluster and dbs created', () => {

    Template.fromStack(stack).hasResourceProperties('AWS::Neptune::DBClusterParameterGroup', {
      Family: 'neptune1.2',
      Parameters: {
        neptune_enable_audit_log: '1',
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::Neptune::DBParameterGroup', {
      Family: 'neptune1.2',
    });

    Template.fromStack(stack).hasResource('AWS::Neptune::DBCluster', {
      Properties: {
        AssociatedRoles: [
          {
            RoleArn: {
              'Fn::GetAtt': [
                'NeptuneBulkLoadRole819075D5',
                'Arn',
              ],
            },
          },
        ],
        DBClusterParameterGroupName: {
          Ref: 'ClusterParams0B94958F',
        },
        DBSubnetGroupName: {
          Ref: 'TransactionGraphClusterSubnetsC68CE06F',
        },
        IamAuthEnabled: true,
        Port: 8182,
        BackupRetentionPeriod: 7,
        StorageEncrypted: true,
        EngineVersion: '1.2.0.1',
        VpcSecurityGroupIds: [
          {
            'Fn::GetAtt': [
              'NeptuneSG31D2E08E',
              'GroupId',
            ],
          },
        ],
        Tags: [
          {
            Key: 'app',
            Value: 'test-app',
          },
        ],
      },
      UpdateReplacePolicy: 'Delete',
      DeletionPolicy: 'Delete',
    });

    Template.fromStack(stack).hasResource('AWS::Neptune::DBInstance', {
      Properties: {
        DBInstanceClass: {
          Ref: 'NeptuneInstaneType',
        },
        AutoMinorVersionUpgrade: true,
        DBClusterIdentifier: {
          Ref: 'TransactionGraphClusterA4FB4FE0',
        },
        DBParameterGroupName: {
          Ref: 'DBParamGroupF0CBD6D8',
        },
      },
      UpdateReplacePolicy: 'Delete',
      DeletionPolicy: 'Delete',
    });

    Template.fromStack(stack).resourceCountIs('AWS::Neptune::DBInstance', 2);
  });

  test('overriding replica count of Neptune cluster', () => {
    ({ app, stack } = initializeStackWithContextsAndEnvs({
      NeptuneReplicaCount: 0,
    }));
    Template.fromStack(stack).resourceCountIs('AWS::Neptune::DBInstance', 1);

    ({ app, stack } = initializeStackWithContextsAndEnvs({
      NeptuneReplicaCount: 3,
    }));
    Template.fromStack(stack).resourceCountIs('AWS::Neptune::DBInstance', 4);
  });

  test('ingress rules of neptune SG', () => {
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: {
        'Fn::GetAtt': [
          'TransactionGraphClusterA4FB4FE0',
          'Port',
        ],
      },
      GroupId: {
        'Fn::GetAtt': [
          'NeptuneSG31D2E08E',
          'GroupId',
        ],
      },
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'trainingNestedStacktrainingNestedStackResourceAA446BCB',
          'Outputs.TestStacktrainingLoadGraphDataSG75C7D514GroupId',
        ],
      },
      ToPort: {
        'Fn::GetAtt': [
          'TransactionGraphClusterA4FB4FE0',
          'Port',
        ],
      },
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: {
        'Fn::GetAtt': [
          'TransactionGraphClusterA4FB4FE0',
          'Port',
        ],
      },
      GroupId: {
        'Fn::GetAtt': [
          'NeptuneSG31D2E08E',
          'GroupId',
        ],
      },
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'inferenceNestedStackinferenceNestedStackResourceB0DA9D8F',
          'Outputs.TestStackinferenceinferenceSGF28A5C19GroupId',
        ],
      },
      ToPort: {
        'Fn::GetAtt': [
          'TransactionGraphClusterA4FB4FE0',
          'Port',
        ],
      },
    });
  });

  test('nested stacks', () => {
    Template.fromStack(stack).resourceCountIs('AWS::CloudFormation::Stack', 3);
  });

  test('report error when the specified vpc is without private subnet', () => {
    const previous = _mockVpcWithoutPrivateSubnet();
    try {
      expect(() => initializeStackWithContextsAndEnvs({
        vpcId: 'default',
      })).toThrow('The VPC must have PRIVATE subnet.');
    } finally {
      mock.restoreContextProvider(previous);
    }
  });

  test('sqs queue is created', () => {
    Template.fromStack(stack).hasResourceProperties('AWS::SQS::Queue', {
      ContentBasedDeduplication: true,
      FifoQueue: true,
      KmsMasterKeyId: 'alias/aws/sqs',
      VisibilityTimeout: 60,
      RedrivePolicy: {
        deadLetterTargetArn: {
          'Fn::GetAtt': [
            'TransDLQ2CB8C42A',
            'Arn',
          ],
        },
        maxReceiveCount: 5,
      },
    });

    Template.fromStack(stack).resourceCountIs('AWS::SQS::Queue', 2);
  });

  function _mockVpcWithoutPrivateSubnet(): (scope: Construct, options: GetContextValueOptions) => GetContextValueResult {
    return mock.mockContextProviderWith({
      vpcId: 'vpc-123456',
      vpcCidrBlock: '10.58.0.0/16',
      subnetGroups: [
        {
          name: 'ingress',
          type: cxapi.VpcSubnetGroupType.PUBLIC,
          subnets: [
            {
              subnetId: 'subnet-000f2b20b0ebaef37',
              cidr: '10.58.0.0/22',
              availabilityZone: 'cn-northwest-1a',
              routeTableId: 'rtb-0f5312df5fe3ae508',
            },
            {
              subnetId: 'subnet-0b2cce92f08506a9a',
              cidr: '10.58.4.0/22',
              availabilityZone: 'cn-northwest-1b',
              routeTableId: 'rtb-07e969fe93b6edd9a',
            },
            {
              subnetId: 'subnet-0571b340c9f28375c',
              cidr: '10.58.8.0/22',
              availabilityZone: 'cn-northwest-1c',
              routeTableId: 'rtb-02ae139a60f628b5c',
            },
          ],
        },
      ],
    }, options => {
      expect(options.filter).toEqual({
        isDefault: 'true',
      });
    });
  }
});

function initializeStackWithContextsAndEnvs(context: {} | undefined, env?: {} | undefined) {
  const app = new App({
    context,
  });

  const stack = new FraudDetectionStack(app, 'TestStack', {
    env: env,
  });
  Tags.of(stack).add('app', 'test-app', {
    includeResourceTypes: [
      'AWS::Neptune::DBClusterParameterGroup',
      'AWS::Neptune::DBParameterGroup',
      'AWS::Neptune::DBCluster',
      'AWS::Neptune::DBInstance',
      'AWS::Neptune::DBSubnetGroup',
    ],
  });
  return { app, stack };
}
