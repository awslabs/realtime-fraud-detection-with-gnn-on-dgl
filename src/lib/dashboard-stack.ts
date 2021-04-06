import * as path from 'path';
import {
  HttpApi,
  CfnIntegration,
  HttpIntegrationType,
  HttpConnectionType,
  PayloadFormatVersion,
  HttpMethod,
  CfnRoute,
  HttpStage,
} from '@aws-cdk/aws-apigatewayv2';
import { LambdaProxyIntegration } from '@aws-cdk/aws-apigatewayv2-integrations';
import {
  GraphqlApi,
  Schema,
  MappingTemplate,
  FieldLogLevel,
  AuthorizationType,
} from '@aws-cdk/aws-appsync';
import { Certificate, DnsValidatedCertificate } from '@aws-cdk/aws-certificatemanager';
import {
  Distribution,
  ViewerProtocolPolicy,
  CachePolicy,
  OriginProtocolPolicy,
  AllowedMethods,
  PriceClass,
  IDistribution,
  CloudFrontWebDistribution,
  OriginAccessIdentity,
  CloudFrontAllowedMethods,
  ViewerCertificate,
} from '@aws-cdk/aws-cloudfront';
import { S3Origin, HttpOrigin } from '@aws-cdk/aws-cloudfront-origins';
import { DatabaseCluster } from '@aws-cdk/aws-docdb';
import {
  IVpc,
  SubnetType,
  InstanceType,
  InstanceClass,
  InstanceSize,
  SecurityGroup,
  Port,
} from '@aws-cdk/aws-ec2';
import {
  Role,
  ServicePrincipal,
  PolicyDocument,
  PolicyStatement,
  ArnPrincipal,
  ManagedPolicy,
} from '@aws-cdk/aws-iam';
import { LayerVersion, Code, Runtime } from '@aws-cdk/aws-lambda';
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { PythonFunction, PythonLayerVersion } from '@aws-cdk/aws-lambda-python';
import { RetentionDays, LogGroup } from '@aws-cdk/aws-logs';
import { IHostedZone, ARecord, RecordTarget } from '@aws-cdk/aws-route53';
import { CloudFrontTarget } from '@aws-cdk/aws-route53-targets';
import { Bucket, BucketEncryption, BlockPublicAccess } from '@aws-cdk/aws-s3';
import {
  BucketDeployment,
  Source,
  CacheControl,
  StorageClass,
} from '@aws-cdk/aws-s3-deployment';
import { IQueue } from '@aws-cdk/aws-sqs';
import {
  IntegrationPattern,
  StateMachine,
  LogLevel,
  Map as SfnMap,
  Errors,
  Pass,
  DISCARD,
} from '@aws-cdk/aws-stepfunctions';
import { LambdaInvoke } from '@aws-cdk/aws-stepfunctions-tasks';
import {
  Construct,
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
  CfnOutput,
  Duration,
  CustomResource,
  CfnMapping,
  Aws,
  Expiration,
  Fn,
  Resource,
  Stack,
} from '@aws-cdk/core';
import {
  Provider,
  AwsCustomResource,
  PhysicalResourceId,
  AwsCustomResourcePolicy,
} from '@aws-cdk/custom-resources';
import { IEEE, getDatasetMapping } from './dataset';
import { artifactsHash } from './utils';

export interface TransactionDashboardStackStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly queue: IQueue;
  readonly inferenceArn: String;
  readonly customDomain?: string;
  readonly r53HostZoneId?: string;
}

export class TransactionDashboardStack extends NestedStack {
  constructor(
    scope: Construct,
    id: string,
    props: TransactionDashboardStackStackProps,
  ) {
    super(scope, id, props);

    const dbUser = 'dashboard';
    const docDBCluster = new DatabaseCluster(this, 'DashboardDatabase', {
      masterUser: {
        username: dbUser,
      },
      storageEncrypted: true,
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE,
      },
      vpc: props.vpc,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const docDBCertLayer = new DocumentDBCertLayer(this, 'CertLayer');
    const caFileKey = 'CAFile';
    const rdsCAMapping = new CfnMapping(this, 'RDSCA', {
      mapping: {
        'aws': {
          [caFileKey]: DocDB_CA,
        },
        'aws-cn': {
          [caFileKey]: DocDB_CN_CA,
        },
      },
    });

    const dbDatabase = 'fraud-detection';
    const dbCollection = 'transaction';

    const dashboardSG = new SecurityGroup(this, 'DashboardToDocDBSG', {
      allowAllOutbound: true,
      description: 'SG for Dashboard handlers connecting DocDB',
      vpc: props.vpc,
    });
    docDBCluster.connections.allowDefaultPortFrom(
      dashboardSG,
      'Allow access from dashboard handlers',
    );
    dashboardSG.connections.allowTo(
      docDBCluster.connections,
      Port.tcp(docDBCluster.clusterEndpoint.port),
      'Allow dashboard handlers to access docDB.',
    );

    const transacationFn = new NodejsFunction(this, 'TransacationFunc', {
      entry: path.join(__dirname, '../lambda.d/dashboard/api.ts'),
      handler: 'handler',
      timeout: Duration.seconds(60), // should be less than or equal to the visibilityTimeout of queue
      environment: {
        DB_SECRET_ARN: docDBCluster.secret!.secretArn,
        DB_DATABASE: dbDatabase,
        DB_COLLECTION: dbCollection,
        CA_FILE: rdsCAMapping.findInMap(Aws.PARTITION, caFileKey),
      },
      memorySize: 256,
      runtime: Runtime.NODEJS_14_X,
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE,
      }),
      securityGroup: dashboardSG,
      layers: [docDBCertLayer],
    });
    docDBCluster.secret!.grantRead(transacationFn);

    const createIndexesFn = new NodejsFunction(this, 'CreateIndexFunc', {
      entry: path.join(__dirname, '../lambda.d/create-indexes/handler.ts'),
      handler: 'createIndexes',
      timeout: Duration.seconds(100),
      environment: {
        DB_SECRET_ARN: docDBCluster.secret!.secretArn,
        CA_FILE: rdsCAMapping.findInMap(Aws.PARTITION, caFileKey),
      },
      memorySize: 256,
      runtime: Runtime.NODEJS_14_X,
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE,
      }),
      securityGroup: dashboardSG,
      layers: [docDBCertLayer],
    });
    docDBCluster.secret!.grantRead(createIndexesFn);

    const createIndexesProvider = new Provider(
      this,
      'DocDBCustomResourceProvider',
      {
        onEventHandler: createIndexesFn,
        logRetention: RetentionDays.ONE_MONTH,
      },
    );
    const customCreateIndexResource = new CustomResource(
      this,
      `CustomResource-DocDB-${dbDatabase}-${dbCollection}-CreateIndexes`,
      {
        serviceToken: createIndexesProvider.serviceToken,
        resourceType: 'Custom::DocDB-CreateIndexes',
        properties: {
          Database: dbDatabase,
          Collection: dbCollection,
          Indexes: [
            {
              key: {
                isFraud: 1,
                timestamp: -1,
              },
            },
          ],
        },
      },
    );
    customCreateIndexResource.node.addDependency(docDBCluster);

    const logRole = new Role(this, 'CloudWatchLogRole', {
      assumedBy: new ServicePrincipal('appsync.amazonaws.com'),
      inlinePolicies: {
        logs: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });
    const dashboardApi = new GraphqlApi(this, 'FraudDetectionDashboardAPI', {
      name: 'FraudDetectionDashboardAPI',
      schema: Schema.fromAsset(
        path.join(__dirname, '../schema/dashboard.graphql'),
      ),
      logConfig: {
        fieldLogLevel: FieldLogLevel.ALL,
        role: logRole,
      },
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.IAM,
        },
        additionalAuthorizationModes: [
          {
            authorizationType: AuthorizationType.API_KEY,
            apiKeyConfig: {
              expires: Expiration.after(Duration.days(30)),
            },
          },
        ],
      },
      xrayEnabled: true,
    });
    const statsSource = dashboardApi.addLambdaDataSource(
      'TransactionSource',
      transacationFn,
    );
    statsSource.createResolver({
      typeName: 'Query',
      fieldName: 'getTransactionStats',
      requestMappingTemplate: MappingTemplate.lambdaRequest(`
        {
          "field": "getStats",
          "data":  {
            "start": $context.arguments.start,
            "end": $context.arguments.end
          }
        }
      `),
      responseMappingTemplate: MappingTemplate.lambdaResult(),
    });
    statsSource.createResolver({
      typeName: 'Query',
      fieldName: 'getFraudTransactions',
      requestMappingTemplate: MappingTemplate.lambdaRequest(`
        {
          "field": "getFraudTransactions",
          "data":  {
            "start": $context.arguments.start,
            "end": $context.arguments.end
          }
        }
      `),
      responseMappingTemplate: MappingTemplate.lambdaResult(),
    });

    const tranEventFn = new NodejsFunction(this, 'TransacationEventFunc', {
      entry: path.join(__dirname, '../lambda.d/dashboard/event.ts'),
      handler: 'handler',
      timeout: Duration.seconds(60),
      environment: {
        DB_SECRET_ARN: docDBCluster.secret!.secretArn,
        DB_DATABASE: dbDatabase,
        DB_COLLECTION: dbCollection,
        CA_FILE: rdsCAMapping.findInMap(Aws.PARTITION, caFileKey),
      },
      memorySize: 256,
      runtime: Runtime.NODEJS_14_X,
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE,
      }),
      securityGroup: dashboardSG,
      layers: [docDBCertLayer],
    });
    docDBCluster.secret!.grantRead(tranEventFn);
    tranEventFn.addEventSource(
      new SqsEventSource(props.queue, {
        batchSize: 10,
        enabled: true,
      }),
    );

    const simEnd = new Pass(this, 'Stop generation');

    const inferenceStatsFnArn = String(props.inferenceArn);

    const tranSimFn = new PythonFunction(this, 'TransactionSimulatorFunc', {
      entry: path.join(__dirname, '../lambda.d/simulator'),
      layers: [
        new PythonLayerVersion(this, 'AwsDataWranglerLayer', {
          entry: path.join(__dirname, '../lambda.d/layer.d/awswrangler'),
          compatibleRuntimes: [Runtime.PYTHON_3_8],
        }),
      ],
      index: 'gen.py',
      runtime: Runtime.PYTHON_3_8,
      environment: {
        INFERENCE_ARN: inferenceStatsFnArn,
        DATASET_URL: getDatasetMapping(this).findInMap(Aws.PARTITION, IEEE),
      },
      timeout: Duration.minutes(15),
      memorySize: 3008,
    });
    tranSimFn.addToRolePolicy(new PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [inferenceStatsFnArn],
    }),
    );
    const tranSimTask = new (class extends LambdaInvoke {
      public toStateJson(): object {
        return {
          ...super.toStateJson(),
          TimeoutSecondsPath: '$.duration',
        };
      }
    })(this, 'Generate live transactions', {
      lambdaFunction: tranSimFn,
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
    }).addCatch(simEnd, {
      errors: [Errors.TIMEOUT],
      resultPath: DISCARD,
    });

    const map = new SfnMap(this, 'Concurrent simulation', {
      inputPath: '$.parameters',
      itemsPath: '$.iter',
      maxConcurrency: 0,
    });
    map.iterator(tranSimTask);

    const paraFn = new NodejsFunction(this, 'ParametersFunc', {
      entry: path.join(__dirname, '../lambda.d/simulator/parameter.ts'),
      handler: 'iter',
      timeout: Duration.seconds(30),
      memorySize: 128,
      runtime: Runtime.NODEJS_14_X,
    });
    const parameterTask = new (class extends LambdaInvoke {
      public toStateJson(): object {
        return {
          ...super.toStateJson(),
          ResultSelector: {
            'parameters.$': '$.Payload',
          },
        };
      }
    })(this, 'Simulation prepare', {
      lambdaFunction: paraFn,
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
    });

    const definition = parameterTask.next(map);
    const transactionGenerator = new StateMachine(
      this,
      'TransactionGenerator',
      {
        definition,
        logs: {
          destination: new LogGroup(this, 'FraudDetectionSimulatorLogGroup', {
            retention: RetentionDays.SIX_MONTHS,
          }),
          includeExecutionData: true,
          level: LogLevel.ERROR,
        },
        tracingEnabled: true,
      },
    );

    const httpApi = new HttpApi(this, 'FraudDetectionDashboardApi');
    const apiRole = new Role(this, 'FraudDetectionDashboardApiRole', {
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
    });
    const generatorStartIntegration = new CfnIntegration(
      this,
      'GeneratorStartIntegration',
      {
        apiId: httpApi.httpApiId,
        integrationType: HttpIntegrationType.LAMBDA_PROXY,
        integrationSubtype: 'StepFunctions-StartExecution',
        connectionType: HttpConnectionType.INTERNET,
        credentialsArn: apiRole.roleArn,
        description:
          'integrate with the generator implmented by step functions',
        payloadFormatVersion: PayloadFormatVersion.VERSION_1_0.version,
        requestParameters: {
          StateMachineArn: transactionGenerator.stateMachineArn,
          Input: '$request.body.input',
        },
        timeoutInMillis: 1000 * 10,
      },
    );
    const generatorPath = '/start';
    new CfnRoute(this, 'GeneratorRoute', {
      apiId: httpApi.httpApiId,
      routeKey: `${HttpMethod.POST} ${generatorPath}`,
      authorizationType: 'NONE',
      target: `integrations/${generatorStartIntegration.ref}`,
    });
    transactionGenerator.grantStartExecution(apiRole);

    const tokenFnRole = new Role(this, 'TokenFuncRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });
    const dashboardGraphqlExecRole = new Role(this, 'AppSyncExeRole', {
      assumedBy: new ArnPrincipal(tokenFnRole.roleArn),
    });
    dashboardApi.grantQuery(dashboardGraphqlExecRole);

    const tokenFn = new NodejsFunction(this, 'DashboardGraphqlToken', {
      entry: path.join(__dirname, '../lambda.d/dashboard/token.ts'),
      handler: 'getToken',
      timeout: Duration.seconds(30),
      environment: {
        RoleArn: dashboardGraphqlExecRole.roleArn,
      },
      memorySize: 256,
      role: tokenFnRole,
      runtime: Runtime.NODEJS_14_X,
    });
    const tokenFnIntegration = new LambdaProxyIntegration({
      handler: tokenFn,
      payloadFormatVersion: PayloadFormatVersion.VERSION_2_0,
    });
    httpApi.addRoutes({
      path: '/token',
      methods: [HttpMethod.GET],
      integration: tokenFnIntegration,
    });
    const apiStageName = 'api';
    const apiStage = new HttpStage(this, 'ApiStage', {
      httpApi: httpApi,
      stageName: apiStageName,
      autoDeploy: true,
    });

    this._deployFrontend(
      dashboardApi.graphqlUrl,
      httpApi.apiEndpoint,
      apiStage.stageName,
      undefined,
      props.customDomain,
      props.r53HostZoneId,
    );

    new CfnOutput(this, 'DashboardDBEndpoint', {
      value: `${docDBCluster.clusterEndpoint.socketAddress}`,
      description: 'endpoint of documentDB for dashboard',
    });
    new CfnOutput(this, 'DashboardGrapqlEndpoint', {
      value: `${dashboardApi.graphqlUrl}`,
      description: 'graphql endpoint of dashboard',
    });
  }

  _deployFrontend(
    graphqlEndpoint: string,
    httpEndpoint: string,
    stageName: string,
    apiKey?: string,
    customDomain?: string,
    r53HostZoneId?: string,
  ) {
    const websiteBucket = new Bucket(this, 'DashboardUI', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    let distribution: IDistribution;
    const isTargetCN = process.env.CDK_DEFAULT_REGION?.startsWith('cn-') || 'aws-cn' === this.node.tryGetContext('TargetPartition');

    //TODO: improve this tricky for DnsValidatedCertificate's validate
    class Import extends Resource implements IHostedZone {
      public readonly hostedZoneId = r53HostZoneId!;

      public get zoneName(): string {
        return customDomain!;
      }

      public get hostedZoneArn(): string {
        return Stack.of(this).formatArn({
          account: '',
          region: '',
          service: 'route53',
          resource: 'hostedzone',
          resourceName: r53HostZoneId,
        });
      }
    }
    const hostedZone = r53HostZoneId ? new Import(this, 'ImportHostedZone') : undefined;

    //TODO: use `Distribution` when https://github.com/aws/aws-cdk/issues/13584 is resolved
    if (isTargetCN) {
      const oai = new OriginAccessIdentity(this, 'DashboardWebsiteOAI', {
        comment: 'OAI for s3 bucket dashboard website',
      });
      distribution = new CloudFrontWebDistribution(this, 'DashboardDistribution', {
        enableIpV6: false,
        priceClass: PriceClass.PRICE_CLASS_ALL,
        defaultRootObject: 'index.html',
        errorConfigurations: [
          {
            errorCode: 500,
            errorCachingMinTtl: 30,
          },
          {
            errorCode: 502,
            errorCachingMinTtl: 0,
          },
          {
            errorCode: 503,
            errorCachingMinTtl: 0,
          },
        ],
        viewerProtocolPolicy: ViewerProtocolPolicy.ALLOW_ALL,
        viewerCertificate: ViewerCertificate.fromCloudFrontDefaultCertificate(customDomain!),
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: websiteBucket,
              originAccessIdentity: oai,
            },
            behaviors: [{
              isDefaultBehavior: true,
              forwardedValues: {
                queryString: false,
              },
              defaultTtl: Duration.days(7),
              maxTtl: Duration.days(30),
              allowedMethods: CloudFrontAllowedMethods.GET_HEAD,
              compress: true,
            }],
          },
          {
            customOriginSource: {
              domainName: Fn.select(2, Fn.split('/', httpEndpoint)),
              originProtocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
            },
            behaviors: [{
              forwardedValues: {
                queryString: false,
              },
              defaultTtl: Duration.seconds(0),
              maxTtl: Duration.seconds(0),
              allowedMethods: CloudFrontAllowedMethods.ALL,
              compress: true,
              pathPattern: `/${stageName}/*`,
            }],
          },
        ],
      });
    } else {
      let cert: Certificate | undefined;
      if (customDomain && hostedZone) {
        cert = new DnsValidatedCertificate(this, 'CustomDomainCertificateForCloudFront', {
          domainName: customDomain,
          hostedZone: hostedZone,
          region: 'us-east-1',
        });
      }
      distribution = new Distribution(this, 'Distribution', {
        certificate: cert,
        domainNames: customDomain ? [customDomain] : [],
        defaultBehavior: {
          origin: new S3Origin(websiteBucket),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: new CachePolicy(this, 'defaultCachePolicy', {
            cachePolicyName: `cachepolicy-${this.stackName}`,
            defaultTtl: Duration.days(7),
            minTtl: Duration.seconds(0),
            maxTtl: Duration.days(30),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
          }),
        },
        additionalBehaviors: {
          [`/${stageName}/*`]: {
            origin: new HttpOrigin(Fn.select(2, Fn.split('/', httpEndpoint)), {
              protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
            }),
            viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: CachePolicy.CACHING_DISABLED,
            allowedMethods: AllowedMethods.ALLOW_ALL,
          },
        },
        defaultRootObject: 'index.html',
        enableIpv6: true,
        priceClass: PriceClass.PRICE_CLASS_ALL,
        enableLogging: true,
        errorResponses: [
          {
            httpStatus: 500,
            ttl: Duration.seconds(30),
          },
          {
            httpStatus: 502,
            ttl: Duration.seconds(0),
          },
          {
            httpStatus: 503,
            ttl: Duration.seconds(0),
          },
        ],
      });
    }

    if (hostedZone) {
      new ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName: `${customDomain}.`,
        target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      });
    }

    const amplifyConfFile = 'aws-exports.json';
    const sdkCall = {
      service: 'S3',
      action: 'putObject',
      parameters: {
        Body: `{
            "api_path": "/${stageName}",
            "aws_project_region": "${Aws.REGION}",
            "aws_appsync_graphqlEndpoint": "${graphqlEndpoint}",
            "aws_appsync_region": "${Aws.REGION}",
            "aws_appsync_authenticationType": "${apiKey ? AuthorizationType.API_KEY : AuthorizationType.IAM}",
            "aws_appsync_apiKey": "${apiKey}"
          }`,
        Bucket: websiteBucket.bucketName,
        Key: amplifyConfFile,
      },
      physicalResourceId: PhysicalResourceId.fromResponse('ETag'),
    };
    const createAwsExportsJson = new AwsCustomResource(
      this,
      'CreateAwsExports',
      {
        onCreate: sdkCall,
        onUpdate: sdkCall,
        installLatestAwsSdk: false,
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: [websiteBucket.arnForObjects(amplifyConfFile)],
        }),
      },
    );

    const websiteDeployment = new BucketDeployment(this, 'DeployWebsite', {
      sources: [
        Source.asset(path.join(__dirname, '../frontend/build/'), {
          exclude: [amplifyConfFile],
        }),
      ],
      destinationBucket: websiteBucket,
      destinationKeyPrefix: '/',
      prune: false,
      retainOnDelete: false,
      cacheControl: [CacheControl.maxAge(Duration.days(7))],
      storageClass: StorageClass.INTELLIGENT_TIERING,
      distribution,
      distributionPaths: ['/index.html', '/locales/*', `/${amplifyConfFile}`],
    });

    websiteDeployment.node.addDependency(createAwsExportsJson);

    new CfnOutput(this, 'DashboardWebsiteUrl', {
      value: `${distribution.distributionDomainName}`,
      description: 'url of dashboard website',
    });
  }
}

export const DocDB_CA = 'rds-combined-ca-bundle.pem';
export const DocDB_CN_CA = 'rds-combined-ca-cn-bundle.pem';

export class DocumentDBCertLayer extends LayerVersion {
  constructor(scope: Construct, id: string) {
    const certPath =
      'https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem';
    const certPathForAwsCN =
      'https://s3.cn-north-1.amazonaws.com.cn/rds-downloads/rds-combined-ca-cn-bundle.pem';
    super(scope, id, {
      code: Code.fromAsset(path.join(__dirname, '../lambda.d/dashboard/'), {
        bundling: {
          image: Runtime.PROVIDED.bundlingDockerImage,
          user: 'root',
          command: [
            'bash',
            '-c',
            `
            mkdir -p /asset-output/etc &&
            curl ${certPath} -o /asset-output/etc/${DocDB_CA} &&
            curl ${certPathForAwsCN} -o /asset-output/etc/${DocDB_CN_CA}
            `,
          ],
        },
        assetHash: artifactsHash([certPath, certPathForAwsCN]),
      }),
      description: '/RDS CAs',
    });
  }
}
