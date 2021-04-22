import '@aws-cdk/assert/jest';
import { ResourcePart } from '@aws-cdk/assert/lib/assertions/have-resource';
import { App, Stack, Construct, GetContextValueOptions, GetContextValueResult } from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import { FraudDetectionStack } from '../src/lib/stack';
import * as mock from './context-provider-mock';

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
    expect(stack).toHaveResourceLike('AWS::S3::Bucket', {
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
    }, ResourcePart.CompleteDefinition);

    expect(stack).toHaveResourceLike('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16',
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
    expect(stack).toHaveResourceLike('AWS::EC2::VPCEndpoint', {
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
  });

  test('Neptune cluster and dbs created', () => {

    expect(stack).toHaveResourceLike('AWS::Neptune::DBClusterParameterGroup', {
      Family: 'neptune1',
      Parameters: {
        neptune_enable_audit_log: 1,
      },
    });

    expect(stack).toHaveResourceLike('AWS::Neptune::DBCluster', {
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
          Ref: 'ClusterParamGroup',
        },
        DBSubnetGroupName: {
          Ref: 'DBSubnetGroup',
        },
        IamAuthEnabled: true,
        Port: 8182,
        StorageEncrypted: true,
        VpcSecurityGroupIds: [
          {
            'Fn::GetAtt': [
              'NeptuneSG31D2E08E',
              'GroupId',
            ],
          },
        ],
      },
      DependsOn: [
        'ClusterParamGroup',
        'DBSubnetGroup',
      ],
    }, ResourcePart.CompleteDefinition);

    expect(stack).toHaveResourceLike('AWS::Neptune::DBInstance', {
      Properties: {
        DBInstanceClass: {
          Ref: 'NeptuneInstaneType',
        },
        DBClusterIdentifier: {
          Ref: 'TransactionGraphCluster',
        },
        DBParameterGroupName: {
          Ref: 'DBParamGroup',
        },
      },
      DependsOn: [
        'DBParamGroup',
        'TransactionGraphCluster',
      ],
    }, ResourcePart.CompleteDefinition);

    expect(stack).toCountResources('AWS::Neptune::DBInstance', 2);
    expect(stack).toHaveResourceLike('AWS::Neptune::DBInstance', {
      Properties: {
        DBInstanceClass: {
          Ref: 'NeptuneInstaneType',
        },
        DBClusterIdentifier: {
          Ref: 'TransactionGraphCluster',
        },
        DBInstanceIdentifier: 'replica-0',
      },
      DependsOn: [
        'primaryinstance',
        'TransactionGraphCluster',
      ],
    }, ResourcePart.CompleteDefinition);
  });

  test('overriding replica count of Neptune cluster', () => {
    ({ app, stack } = initializeStackWithContextsAndEnvs({
      NeptuneReplicaCount: 0,
    }));
    expect(stack).toCountResources('AWS::Neptune::DBInstance', 1);

    ({ app, stack } = initializeStackWithContextsAndEnvs({
      NeptuneReplicaCount: 3,
    }));
    expect(stack).toCountResources('AWS::Neptune::DBInstance', 4);
  });

  test('ingress rules of neptune SG', () => {
    expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 8182,
      GroupId: {
        'Fn::GetAtt': [
          'NeptuneSG31D2E08E',
          'GroupId',
        ],
      },
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'trainingNestedStacktrainingNestedStackResourceAA446BCB',
          'Outputs.TestStacktrainingLoadPropsSG17993BE1GroupId',
        ],
      },
      ToPort: 8182,
    });

    expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 8182,
      GroupId: {
        'Fn::GetAtt': [
          'NeptuneSG31D2E08E',
          'GroupId',
        ],
      },
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'trainingNestedStacktrainingNestedStackResourceAA446BCB',
          'Outputs.TestStacktrainingETLCompGlueJobSG3879196AGroupId',
        ],
      },
      ToPort: 8182,
    });
  });

  test('nested stacks', () => {
    expect(stack).toCountResources('AWS::CloudFormation::Stack', 2);
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
    expect(stack).toHaveResourceLike('AWS::SQS::Queue', {
      ContentBasedDeduplication: true,
      FifoQueue: true,
      KmsMasterKeyId: 'alias/aws/sqs',
      VisibilityTimeout: 60,
    });
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
  return { app, stack };
}
