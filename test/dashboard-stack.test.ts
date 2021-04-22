import '@aws-cdk/assert/jest';
import { ResourcePart } from '@aws-cdk/assert/lib/assertions/have-resource';
import { Vpc } from '@aws-cdk/aws-ec2';
import { Bucket } from '@aws-cdk/aws-s3';
import { Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { App, Stack, RemovalPolicy, Duration, CfnParameter } from '@aws-cdk/core';
import { TransactionDashboardStack } from '../src/lib/dashboard-stack';

describe('dashboard stack test suite', () => {
  let stack: Stack;

  beforeAll(() => {
    ({ stack } = initializeStackWithContextsAndEnvs({}));
  });

  beforeEach(() => {
  });

  test('docdb is created.', () => {
    expect(stack).toHaveResourceLike('AWS::DocDB::DBCluster', {
      Properties: {
        MasterUsername: {
          'Fn::Join': [
            '',
            [
              '{{resolve:secretsmanager:',
              {
                Ref: 'DashboardDatabaseSecretCF9F4299',
              },
              ':SecretString:username::}}',
            ],
          ],
        },
        MasterUserPassword: {
          'Fn::Join': [
            '',
            [
              '{{resolve:secretsmanager:',
              {
                Ref: 'DashboardDatabaseSecretCF9F4299',
              },
              ':SecretString:password::}}',
            ],
          ],
        },
        StorageEncrypted: true,
      },
      UpdateReplacePolicy: 'Delete',
      DeletionPolicy: 'Delete',
    }, ResourcePart.CompleteDefinition);
  });

  test('SG of docdb.', () => {
    expect(stack).toHaveResourceLike('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: {
        'Fn::GetAtt': [
          'DashboardDatabaseF93C7646',
          'Port',
        ],
      },
      GroupId: {
        'Fn::GetAtt': [
          'DashboardDatabaseSecurityGroupECDE0B4B',
          'GroupId',
        ],
      },
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          'DashboardToDocDBSGD91501D9',
          'GroupId',
        ],
      },
      ToPort: {
        'Fn::GetAtt': [
          'DashboardDatabaseF93C7646',
          'Port',
        ],
      },
    });
  });

  test('disable the feature of rotating password of DocDB', () => {
    expect(stack).toCountResources('AWS::SecretsManager::RotationSchedule', 0);

    expect(stack).toCountResources('AWS::SecretsManager::ResourcePolicy', 0);

    expect(stack).toCountResources('AWS::Serverless::Application', 0);
  });

  test('layer for docdb cert is created', () => {
    expect(stack).toHaveResourceLike('AWS::Lambda::LayerVersion', {
      Description: '/RDS CAs',
    });
  });

  test('custom resource for creating indexes of docdb', () => {
    expect(stack).toHaveResourceLike('Custom::DocDB-CreateIndexes', {
      Properties: {
        ServiceToken: {
          'Fn::GetAtt': [
            'DocDBCustomResourceProviderframeworkonEvent30301157',
            'Arn',
          ],
        },
        Database: 'fraud-detection',
        Collection: 'transaction',
        Indexes: [
          {
            key: {
              isFraud: 1,
              timestamp: -1,
            },
          },
        ],
      },
      DependsOn: [
        'DashboardDatabaseInstance186709BD9',
        'DashboardDatabaseF93C7646',
        'DashboardDatabaseSecretAttachmentB749CF34',
        'DashboardDatabaseSecretCF9F4299',
        'DashboardDatabaseSecurityGroupfromTestStackDashboardStackDashboardToDocDBSG004411E5IndirectPortF0F1D237',
        'DashboardDatabaseSecurityGroupECDE0B4B',
        'DashboardDatabaseSubnetsD80E6AA1',
      ],
    }, ResourcePart.CompleteDefinition);
  });

  test('dashboard graphql is created', () => {
    expect(stack).toHaveResourceLike('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'appsync.amazonaws.com',
            },
          },
        ],
      },
      Policies: [
        {
          PolicyDocument: {
            Statement: [
              {
                Action: [
                  'logs:CreateLogGroup',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                ],
                Effect: 'Allow',
                Resource: '*',
              },
            ],
          },
        },
      ],
    });

    expect(stack).toHaveResourceLike('AWS::AppSync::GraphQLApi', {
      AuthenticationType: 'AWS_IAM',
      AdditionalAuthenticationProviders: [
        {
          AuthenticationType: 'API_KEY',
        },
      ],
      LogConfig: {
        CloudWatchLogsRoleArn: {
          'Fn::GetAtt': [
            'CloudWatchLogRoleE3242F1C',
            'Arn',
          ],
        },
        FieldLogLevel: 'ALL',
      },
      XrayEnabled: true,
    });

    expect(stack).toHaveResourceLike('AWS::AppSync::GraphQLSchema', {
      ApiId: {
        'Fn::GetAtt': [
          'FraudDetectionDashboardAPID13F00C7',
          'ApiId',
        ],
      },
      Definition: 'type Transaction @aws_iam @aws_api_key {\n  id: String!\n  amount: Float!\n  timestamp: AWSTimestamp!\n  productCD: String\n  card1: String\n  card2: String\n  card3: String\n  card4: String\n  card5: String\n  card6: String\n  addr1: String\n  addr2: String\n  dist1: String\n  dist2: String\n  pEmaildomain: String\n  rEmaildomain: String\n  isFraud: Boolean!\n}\n\ntype TransactionStats @aws_iam @aws_api_key {\n  totalCount: Int!\n  totalAmount: Float!\n  fraudCount: Int!\n  totalFraudAmount: Float!\n}\n\ntype Query @aws_iam @aws_api_key {\n  getTransactionStats(start: Int, end: Int): TransactionStats\n  getFraudTransactions(start: Int, end: Int): [ Transaction ]\n}',
    });

    expect(stack).toHaveResourceLike('AWS::AppSync::DataSource', {
      ApiId: {
        'Fn::GetAtt': [
          'FraudDetectionDashboardAPID13F00C7',
          'ApiId',
        ],
      },
      Name: 'TransactionSource',
      Type: 'AWS_LAMBDA',
      LambdaConfig: {
        LambdaFunctionArn: {
          'Fn::GetAtt': [
            'TransacationFunc54612B5F',
            'Arn',
          ],
        },
      },
      ServiceRoleArn: {
        'Fn::GetAtt': [
          'FraudDetectionDashboardAPITransactionSourceServiceRole03443E92',
          'Arn',
        ],
      },
    });

    expect(stack).toHaveResourceLike('AWS::AppSync::Resolver', {
      ApiId: {
        'Fn::GetAtt': [
          'FraudDetectionDashboardAPID13F00C7',
          'ApiId',
        ],
      },
      FieldName: 'getTransactionStats',
      TypeName: 'Query',
      DataSourceName: 'TransactionSource',
      Kind: 'UNIT',
      RequestMappingTemplate: '{"version": "2017-02-28", "operation": "Invoke", "payload": \n        {\n          "field": "getStats",\n          "data":  {\n            "start": $context.arguments.start,\n            "end": $context.arguments.end\n          }\n        }\n      }',
      ResponseMappingTemplate: '$util.toJson($ctx.result)',
    });

    expect(stack).toHaveResourceLike('AWS::AppSync::Resolver', {
      ApiId: {
        'Fn::GetAtt': [
          'FraudDetectionDashboardAPID13F00C7',
          'ApiId',
        ],
      },
      FieldName: 'getFraudTransactions',
      TypeName: 'Query',
      DataSourceName: 'TransactionSource',
      Kind: 'UNIT',
      RequestMappingTemplate: '{"version": "2017-02-28", "operation": "Invoke", "payload": \n        {\n          "field": "getFraudTransactions",\n          "data":  {\n            "start": $context.arguments.start,\n            "end": $context.arguments.end\n          }\n        }\n      }',
      ResponseMappingTemplate: '$util.toJson($ctx.result)',
    });
  });

  test('transaction generator is created', () => {
    expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          QUEUE_URL: {
            Ref: 'referencetoTestStackTransQueue6E481EC7Ref',
          },
          DATASET_URL: {
            'Fn::FindInMap': [
              'DataSet',
              {
                Ref: 'AWS::Partition',
              },
              'ieee',
            ],
          },
        },
      },
      Handler: 'gen.handler',
      Layers: [
        {
          Ref: 'AwsDataWranglerLayer73D7C4F6',
        },
      ],
      MemorySize: 3008,
      Runtime: 'python3.8',
      Timeout: 900,
    });

    expect(stack).toHaveResourceLike('AWS::StepFunctions::StateMachine', {
      DefinitionString: {
        'Fn::Join': [
          '',
          [
            '{"StartAt":"Simulation prepare","States":{"Simulation prepare":{"Next":"Concurrent simulation","Retry":[{"ErrorEquals":["Lambda.ServiceException","Lambda.AWSLambdaException","Lambda.SdkClientException"],"IntervalSeconds":2,"MaxAttempts":6,"BackoffRate":2}],"Type":"Task","Resource":"arn:',
            {
              Ref: 'AWS::Partition',
            },
            ':states:::lambda:invoke","Parameters":{"FunctionName":"',
            {
              'Fn::GetAtt': [
                'ParametersFuncDFE97108',
                'Arn',
              ],
            },
            '","Payload.$":"$"},"ResultSelector":{"parameters.$":"$.Payload"}},"Concurrent simulation":{"Type":"Map","End":true,"InputPath":"$.parameters","Iterator":{"StartAt":"Generate live transactions","States":{"Generate live transactions":{"End":true,"Retry":[{"ErrorEquals":["Lambda.ServiceException","Lambda.AWSLambdaException","Lambda.SdkClientException"],"IntervalSeconds":2,"MaxAttempts":6,"BackoffRate":2}],"Catch":[{"ErrorEquals":["States.Timeout"],"ResultPath":null,"Next":"Stop generation"}],"Type":"Task","Resource":"arn:',
            {
              Ref: 'AWS::Partition',
            },
            ':states:::lambda:invoke","Parameters":{"FunctionName":"',
            {
              'Fn::GetAtt': [
                'TransactionSimulatorFunc26BB1228',
                'Arn',
              ],
            },
            '","Payload.$":"$"},"TimeoutSecondsPath":"$.duration"},"Stop generation":{"Type":"Pass","End":true}}},"ItemsPath":"$.iter","MaxConcurrency":0}}}',
          ],
        ],
      },
      TracingConfiguration: {
        Enabled: true,
      },
    });
  });

  // see https://docs.aws.amazon.com/step-functions/latest/dg/bp-cwl.html for detail
  test('log group of states is applied the best practise.', () => {
    expect(stack).toHaveResourceLike('AWS::Logs::LogGroup', {
      Properties: {
        LogGroupName: {
          'Fn::Join': [
            '',
            [
              '/aws/vendedlogs/states/fraud-detetion/dashboard-simulator/',
              {
                Ref: 'AWS::StackName',
              },
            ],
          ],
        },
        RetentionInDays: 180,
      },
      UpdateReplacePolicy: 'Retain',
      DeletionPolicy: 'Retain',
    }, ResourcePart.CompleteDefinition);
    expect(stack).toHaveResourceLike('AWS::StepFunctions::StateMachine', {
      LoggingConfiguration: {
        Destinations: [
          {
            CloudWatchLogsLogGroup: {
              LogGroupArn: {
                'Fn::GetAtt': [
                  'FraudDetectionSimulatorLogGroupDAA20302',
                  'Arn',
                ],
              },
            },
          },
        ],
        IncludeExecutionData: true,
        Level: 'ERROR',
      },
    });
  });

  test('fn processes the sqs events', () => {
    expect(stack).toHaveResourceLike('AWS::Lambda::Function', {
      Role: {
        'Fn::GetAtt': [
          'TransacationEventFuncServiceRoleE7060D37',
          'Arn',
        ],
      },
      Environment: {
        Variables: {
          DB_SECRET_ARN: {
            Ref: 'DashboardDatabaseSecretAttachmentB749CF34',
          },
          DB_DATABASE: 'fraud-detection',
          DB_COLLECTION: 'transaction',
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
          CA_FILE: {
            'Fn::FindInMap': [
              'RDSCA',
              {
                Ref: 'AWS::Partition',
              },
              'CAFile',
            ],
          },
        },
      },
      Handler: 'index.handler',
      Layers: [
        {
          Ref: 'CertLayerDEBF0D9A',
        },
      ],
      MemorySize: 256,
      Runtime: 'nodejs14.x',
      Timeout: 60,
      VpcConfig: {
        SecurityGroupIds: [
          {
            'Fn::GetAtt': [
              'DashboardToDocDBSGD91501D9',
              'GroupId',
            ],
          },
        ],
        SubnetIds: [
          {
            Ref: 'referencetoTestStackVpcPrivateSubnet1Subnet707BB947Ref',
          },
          {
            Ref: 'referencetoTestStackVpcPrivateSubnet2Subnet5DE74951Ref',
          },
        ],
      },
    });

    expect(stack).toHaveResourceLike('AWS::Lambda::EventSourceMapping', {
      FunctionName: {
        Ref: 'TransacationEventFuncE6A7AC47',
      },
      BatchSize: 10,
      Enabled: true,
      EventSourceArn: {
        Ref: 'referencetoTestStackTransQueue6E481EC7Arn',
      },
    });
  });

  test('http api for dashboard', () => {
    expect(stack).toHaveResourceLike('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
    });

    expect(stack).toHaveResourceLike('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
    });

    expect(stack).toHaveResourceLike('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'AWS_PROXY',
      ConnectionType: 'INTERNET',
      CredentialsArn: {
        'Fn::GetAtt': [
          'FraudDetectionDashboardApiRole4337F0C9',
          'Arn',
        ],
      },
      IntegrationSubtype: 'StepFunctions-StartExecution',
      PayloadFormatVersion: '1.0',
      RequestParameters: {
        StateMachineArn: {
          Ref: 'TransactionGenerator2F77AC65',
        },
        Input: '$request.body.input',
      },
      TimeoutInMillis: 10000,
    });

    expect(stack).toHaveResourceLike('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /start',
      AuthorizationType: 'NONE',
      Target: {
        'Fn::Join': [
          '',
          [
            'integrations/',
            {
              Ref: 'GeneratorStartIntegration',
            },
          ],
        ],
      },
    });

    expect(stack).toHaveResourceLike('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'states:StartExecution',
            Effect: 'Allow',
            Resource: {
              Ref: 'TransactionGenerator2F77AC65',
            },
          },
        ],
      },
    });
  });

  test('http api for getting token of appsync', () => {
    expect(stack).toHaveResourceLike('AWS::ApiGatewayV2::Integration', {
      ApiId: {
        Ref: 'FraudDetectionDashboardApiE395505A',
      },
      IntegrationType: 'AWS_PROXY',
      IntegrationUri: {
        'Fn::GetAtt': [
          'DashboardGraphqlToken4C5EDC8B',
          'Arn',
        ],
      },
      PayloadFormatVersion: '2.0',
    });

    expect(stack).toHaveResourceLike('AWS::ApiGatewayV2::Route', {
      ApiId: {
        Ref: 'FraudDetectionDashboardApiE395505A',
      },
      RouteKey: 'GET /token',
    });

    expect(stack).toHaveResourceLike('AWS::ApiGatewayV2::Stage', {
      ApiId: {
        Ref: 'FraudDetectionDashboardApiE395505A',
      },
      StageName: 'api',
      AutoDeploy: true,
    });
  });

  test('dashboard stack output', () => {
    expect(stack).toHaveOutput({
      outputName: 'DashboardDBEndpoint',
    });

    expect(stack).toHaveOutput({
      outputName: 'DashboardGrapqlEndpoint',
    });

    expect(stack).toHaveOutput({
      outputName: 'DashboardWebsiteUrl',
    });
  });

  test('distributed dashboard website by s3 and cloudfront in standarnd partition', () => {
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
            Ref: 'referencetoTestStackAccessLogF5229892Ref',
          },
          LogFilePrefix: 'dashboardUIBucketAccessLog',
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      },
      UpdateReplacePolicy: 'Delete',
      DeletionPolicy: 'Delete',
    }, ResourcePart.CompleteDefinition);

    expect(stack).toHaveResourceLike('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: [
          {
            Action: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:List*',
              's3:DeleteObject*',
            ],
            Effect: 'Allow',
            Principal: {
              AWS: {
                'Fn::GetAtt': [
                  'CustomS3AutoDeleteObjectsCustomResourceProviderRole3B1BD092',
                  'Arn',
                ],
              },
            },
            Resource: [
              {
                'Fn::GetAtt': [
                  'DashboardUI1FD1D9B2',
                  'Arn',
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        'DashboardUI1FD1D9B2',
                        'Arn',
                      ],
                    },
                    '/*',
                  ],
                ],
              },
            ],
          },
          {
            Action: 's3:GetObject',
            Effect: 'Allow',
            Principal: {
              CanonicalUser: {
                'Fn::GetAtt': [
                  'DistributionOrigin1S3Origin5F5C0696',
                  'S3CanonicalUserId',
                ],
              },
            },
            Resource: {
              'Fn::Join': [
                '',
                [
                  {
                    'Fn::GetAtt': [
                      'DashboardUI1FD1D9B2',
                      'Arn',
                    ],
                  },
                  '/*',
                ],
              ],
            },
          },
        ],
      },
    });

    expect(stack).toHaveResourceLike('AWS::CloudFront::CachePolicy', {
      CachePolicyConfig: {
        DefaultTTL: 604800,
        MaxTTL: 2592000,
        MinTTL: 0,
        Name: {
          'Fn::Join': [
            '',
            [
              'cachepolicy-',
              {
                Ref: 'AWS::StackName',
              },
            ],
          ],
        },
        ParametersInCacheKeyAndForwardedToOrigin: {
          CookiesConfig: {
            CookieBehavior: 'none',
          },
          EnableAcceptEncodingBrotli: true,
          EnableAcceptEncodingGzip: true,
          HeadersConfig: {
            HeaderBehavior: 'none',
          },
          QueryStringsConfig: {
            QueryStringBehavior: 'none',
          },
        },
      },
    });

    expect(stack).toHaveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CacheBehaviors: [
          {
            AllowedMethods: [
              'GET',
              'HEAD',
              'OPTIONS',
              'PUT',
              'PATCH',
              'POST',
              'DELETE',
            ],
            CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
            Compress: true,
            PathPattern: '/api/*',
            TargetOriginId: 'TestStackDashboardStackDistributionOrigin2073DB050',
            ViewerProtocolPolicy: 'redirect-to-https',
          },
        ],
        DefaultCacheBehavior: {
          AllowedMethods: [
            'GET',
            'HEAD',
          ],
          CachePolicyId: {
            Ref: 'defaultCachePolicy2969DB4C',
          },
          Compress: true,
          TargetOriginId: 'TestStackDashboardStackDistributionOrigin1D3E29DD1',
          ViewerProtocolPolicy: 'redirect-to-https',
        },
        DefaultRootObject: 'index.html',
        Enabled: true,
        HttpVersion: 'http2',
        IPV6Enabled: true,
        PriceClass: 'PriceClass_All',
        Logging: {
          Bucket: {
            'Fn::GetAtt': [
              'DistributionLoggingBucketEC62F627',
              'RegionalDomainName',
            ],
          },
        },
        CustomErrorResponses: [
          {
            ErrorCachingMinTTL: 30,
            ErrorCode: 500,
          },
          {
            ErrorCachingMinTTL: 0,
            ErrorCode: 502,
          },
          {
            ErrorCachingMinTTL: 0,
            ErrorCode: 503,
          },
        ],
        Origins: [
          {
            DomainName: {
              'Fn::GetAtt': [
                'DashboardUI1FD1D9B2',
                'RegionalDomainName',
              ],
            },
            Id: 'TestStackDashboardStackDistributionOrigin1D3E29DD1',
            S3OriginConfig: {
              OriginAccessIdentity: {
                'Fn::Join': [
                  '',
                  [
                    'origin-access-identity/cloudfront/',
                    {
                      Ref: 'DistributionOrigin1S3Origin5F5C0696',
                    },
                  ],
                ],
              },
            },
          },
          {
            CustomOriginConfig: {
              OriginProtocolPolicy: 'https-only',
              OriginSSLProtocols: [
                'TLSv1.2',
              ],
            },
            DomainName: {
              'Fn::Select': [
                2,
                {
                  'Fn::Split': [
                    '/',
                    {
                      'Fn::GetAtt': [
                        'FraudDetectionDashboardApiE395505A',
                        'ApiEndpoint',
                      ],
                    },
                  ],
                },
              ],
            },
            Id: 'TestStackDashboardStackDistributionOrigin2073DB050',
          },
        ],
      },
    });

    expect(stack).toHaveResourceLike('Custom::AWS', {
      Create: {
        'Fn::Join': [
          '',
          [
            '{"service":"S3","action":"putObject","parameters":{"Body":"{\\n            \\"api_path\\": \\"/api\\",\\n            \\"aws_project_region\\": \\"',
            {
              Ref: 'AWS::Region',
            },
            '\\",\\n            \\"aws_appsync_graphqlEndpoint\\": \\"',
            {
              'Fn::GetAtt': [
                'FraudDetectionDashboardAPID13F00C7',
                'GraphQLUrl',
              ],
            },
            '\\",\\n            \\"aws_appsync_region\\": \\"',
            {
              Ref: 'AWS::Region',
            },
            '\\",\\n            \\"aws_appsync_authenticationType\\": \\"AWS_IAM\\",\\n            \\"aws_appsync_apiKey\\": \\"undefined\\"\\n          }","Bucket":"',
            {
              Ref: 'DashboardUI1FD1D9B2',
            },
            '","Key":"aws-exports.json"},"physicalResourceId":{"responsePath":"ETag"}}',
          ],
        ],
      },
      Update: {
        'Fn::Join': [
          '',
          [
            '{"service":"S3","action":"putObject","parameters":{"Body":"{\\n            \\"api_path\\": \\"/api\\",\\n            \\"aws_project_region\\": \\"',
            {
              Ref: 'AWS::Region',
            },
            '\\",\\n            \\"aws_appsync_graphqlEndpoint\\": \\"',
            {
              'Fn::GetAtt': [
                'FraudDetectionDashboardAPID13F00C7',
                'GraphQLUrl',
              ],
            },
            '\\",\\n            \\"aws_appsync_region\\": \\"',
            {
              Ref: 'AWS::Region',
            },
            '\\",\\n            \\"aws_appsync_authenticationType\\": \\"AWS_IAM\\",\\n            \\"aws_appsync_apiKey\\": \\"undefined\\"\\n          }","Bucket":"',
            {
              Ref: 'DashboardUI1FD1D9B2',
            },
            '","Key":"aws-exports.json"},"physicalResourceId":{"responsePath":"ETag"}}',
          ],
        ],
      },
      InstallLatestAwsSdk: false,
    });

    expect(stack).toHaveResourceLike('Custom::CDKBucketDeployment', {
      Properties: {
        DestinationBucketName: {
          Ref: 'DashboardUI1FD1D9B2',
        },
        DestinationBucketKeyPrefix: '/',
        RetainOnDelete: false,
        Prune: false,
        SystemMetadata: {
          'cache-control': 'max-age=604800',
          'storage-class': 'INTELLIGENT_TIERING',
        },
        DistributionId: {
          Ref: 'Distribution830FAC52',
        },
        DistributionPaths: [
          '/index.html',
          '/locales/*',
          '/aws-exports.json',
        ],
      },
      DependsOn: [
        'CreateAwsExportsCustomResourcePolicyE986A674',
        'CreateAwsExports353D691F',
      ],
    }, ResourcePart.CompleteDefinition);
  });

  test('cloudfront with custom domain in standarnd partition', () => {
    const app = new App({});
    const parentStack = new Stack(app, 'TestStack');
    const dashboardDomainNamePara = new CfnParameter(parentStack, 'DashboardDomain', {
      type: 'String',
    });
    const r53HostZoneIdPara = new CfnParameter(parentStack, 'Route53HostedZoneId', {
      type: 'AWS::Route53::HostedZone::Id',
    });

    ({ stack } = initializeStackWithContextsAndEnvs({}, undefined, parentStack,
      dashboardDomainNamePara.valueAsString, r53HostZoneIdPara.valueAsString));

    expect(stack).toHaveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        ViewerCertificate: {
          AcmCertificateArn: {
            'Fn::GetAtt': [
              'CustomDomainCertificateForCloudFrontCertificateRequestorResource54BD7C29',
              'Arn',
            ],
          },
          MinimumProtocolVersion: 'TLSv1.2_2019',
          SslSupportMethod: 'sni-only',
        },
      },
    });

    //TODO: Stack.resolve does not work if there is no a precede expection!!!
    expect(stack).toHaveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Aliases: [
          stack.resolve(dashboardDomainNamePara.valueAsString),
        ],

      },
    });
  });

  test('distributed dashboard website by s3 and cloudfront in aws-cn regions', () => {
    const app = new App({
      context: {
        TargetPartition: 'aws-cn',
      },
    });
    const parentStack = new Stack(app, 'TestStack');
    const dashboardDomainNamePara = new CfnParameter(parentStack, 'DashboardDomain', {
      type: 'String',
    });
    const r53HostZoneIdPara = new CfnParameter(parentStack, 'Route53HostedZoneId', {
      type: 'AWS::Route53::HostedZone::Id',
    });

    ({ stack } = initializeStackWithContextsAndEnvs({
      TargetPartition: 'aws-cn',
    }, undefined, parentStack, dashboardDomainNamePara.valueAsString, r53HostZoneIdPara.valueAsString));

    expect(stack).toHaveResourceLike('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: [
          {
            Action: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:List*',
              's3:DeleteObject*',
            ],
            Effect: 'Allow',
            Principal: {
              AWS: {
                'Fn::GetAtt': [
                  'CustomS3AutoDeleteObjectsCustomResourceProviderRole3B1BD092',
                  'Arn',
                ],
              },
            },
            Resource: [
              {
                'Fn::GetAtt': [
                  'DashboardUI1FD1D9B2',
                  'Arn',
                ],
              },
              {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        'DashboardUI1FD1D9B2',
                        'Arn',
                      ],
                    },
                    '/*',
                  ],
                ],
              },
            ],
          },
          {
            Action: 's3:GetObject',
            Effect: 'Allow',
            Principal: {
              CanonicalUser: {
                'Fn::GetAtt': [
                  'DashboardWebsiteOAIB75F781F',
                  'S3CanonicalUserId',
                ],
              },
            },
            Resource: {
              'Fn::Join': [
                '',
                [
                  {
                    'Fn::GetAtt': [
                      'DashboardUI1FD1D9B2',
                      'Arn',
                    ],
                  },
                  '/*',
                ],
              ],
            },
          },
        ],
      },
    });

    expect(stack).toHaveResourceLike('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Aliases: [
          stack.resolve(dashboardDomainNamePara.valueAsString),
        ],
        ViewerCertificate: {
          CloudFrontDefaultCertificate: true,
        },
        CacheBehaviors: [
          {
            AllowedMethods: [
              'DELETE',
              'GET',
              'HEAD',
              'OPTIONS',
              'PATCH',
              'POST',
              'PUT',
            ],
            Compress: true,
            DefaultTTL: 0,
            ForwardedValues: {
              QueryString: false,
            },
            MaxTTL: 0,
            PathPattern: '/api/*',
            TargetOriginId: 'origin2',
            ViewerProtocolPolicy: 'allow-all',
          },
        ],
        DefaultCacheBehavior: {
          AllowedMethods: [
            'GET',
            'HEAD',
          ],
          Compress: true,
          DefaultTTL: 604800,
          ForwardedValues: {
            QueryString: false,
          },
          MaxTTL: 2592000,
          TargetOriginId: 'origin1',
          ViewerProtocolPolicy: 'allow-all',
        },
        DefaultRootObject: 'index.html',
        Enabled: true,
        HttpVersion: 'http2',
        IPV6Enabled: false,
        PriceClass: 'PriceClass_All',
        CustomErrorResponses: [
          {
            ErrorCachingMinTTL: 30,
            ErrorCode: 500,
          },
          {
            ErrorCachingMinTTL: 0,
            ErrorCode: 502,
          },
          {
            ErrorCachingMinTTL: 0,
            ErrorCode: 503,
          },
        ],
        Origins: [
          {
            DomainName: {
              'Fn::GetAtt': [
                'DashboardUI1FD1D9B2',
                'RegionalDomainName',
              ],
            },
            Id: 'origin1',
            S3OriginConfig: {
              OriginAccessIdentity: {
                'Fn::Join': [
                  '',
                  [
                    'origin-access-identity/cloudfront/',
                    {
                      Ref: 'DashboardWebsiteOAIB75F781F',
                    },
                  ],
                ],
              },
            },
          },
          {
            CustomOriginConfig: {
              OriginProtocolPolicy: 'https-only',
              OriginSSLProtocols: [
                'TLSv1.2',
              ],
            },
            DomainName: {
              'Fn::Select': [
                2,
                {
                  'Fn::Split': [
                    '/',
                    {
                      'Fn::GetAtt': [
                        'FraudDetectionDashboardApiE395505A',
                        'ApiEndpoint',
                      ],
                    },
                  ],
                },
              ],
            },
            Id: 'origin2',
          },
        ],
      },
    });

    expect(stack).toHaveResourceLike('AWS::Route53::RecordSet', {
      Name: {
        'Fn::Join': [
          '',
          [
            stack.resolve(dashboardDomainNamePara.valueAsString),
            '.',
          ],
        ],
      },
      Type: 'A',
      AliasTarget: {
        DNSName: {
          'Fn::GetAtt': [
            'DashboardDistributionCFDistributionEFC4B3CE',
            'DomainName',
          ],
        },
        HostedZoneId: {
          'Fn::FindInMap': [
            'AWSCloudFrontPartitionHostedZoneIdMap',
            {
              Ref: 'AWS::Partition',
            },
            'zoneId',
          ],
        },
      },
      HostedZoneId: stack.resolve(r53HostZoneIdPara),
    });

  });
});

function initializeStackWithContextsAndEnvs(context: {} | undefined, env?: {} | undefined,
  _parentStack?: Stack, customDomain?: string, r53HostZoneId?: string) {
  const app = new App({
    context,
  });
  const parentStack = _parentStack ?? new Stack(app, 'TestStack', { env: env });
  const vpc = new Vpc(parentStack, 'Vpc');
  const queue = new Queue(parentStack, 'TransQueue', {
    contentBasedDeduplication: true,
    encryption: QueueEncryption.KMS_MANAGED,
    fifo: true,
    removalPolicy: RemovalPolicy.DESTROY,
    visibilityTimeout: Duration.seconds(60),
  });
  const accessLogBucket = new Bucket(parentStack, 'AccessLog');

  const stack = new TransactionDashboardStack(parentStack, 'DashboardStack', {
    vpc,
    queue,
    accessLogBucket,
    customDomain,
    r53HostZoneId,
  });
  return { stack };
}
