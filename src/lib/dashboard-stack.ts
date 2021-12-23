import * as path from 'path';
import {
  HttpApi,
  HttpIntegrationType,
  HttpConnectionType,
  PayloadFormatVersion,
  HttpMethod,
  HttpStage,
} from '@aws-cdk/aws-apigatewayv2-alpha';
import { LambdaProxyIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import {
  GraphqlApi,
  Schema,
  MappingTemplate,
  FieldLogLevel,
  AuthorizationType,
} from '@aws-cdk/aws-appsync-alpha';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import {
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
  CfnOutput,
  Duration,
  CustomResource,
  CfnMapping,
  Aws,
  Fn,
  Resource,
  Stack,
  Arn,
  CfnResource,
  Aspects,
  ArnFormat,
} from 'aws-cdk-lib';
import {
  CfnIntegration,
  CfnRoute,
  CfnStage,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { Certificate, DnsValidatedCertificate } from 'aws-cdk-lib/aws-certificatemanager';
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
  LambdaEdgeEventType,
  CfnDistribution,
  SecurityPolicyProtocol,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin, HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { ClusterParameterGroup, DatabaseCluster } from 'aws-cdk-lib/aws-docdb';
import {
  IVpc,
  SubnetType,
  InstanceType,
  InstanceClass,
  InstanceSize,
  SecurityGroup,
  Port,
} from 'aws-cdk-lib/aws-ec2';
import {
  Role,
  ServicePrincipal,
  PolicyDocument,
  PolicyStatement,
  ArnPrincipal,
  ManagedPolicy,
} from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LayerVersion, Code, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays, LogGroup } from 'aws-cdk-lib/aws-logs';
import { IHostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Bucket, BucketEncryption, BlockPublicAccess, IBucket } from 'aws-cdk-lib/aws-s3';
import {
  BucketDeployment,
  Source,
  CacheControl,
  StorageClass,
} from 'aws-cdk-lib/aws-s3-deployment';
import { IQueue } from 'aws-cdk-lib/aws-sqs';
import {
  IntegrationPattern,
  StateMachine,
  LogLevel,
  Map as SfnMap,
  Errors,
  Pass,
  DISCARD,
} from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import {
  Provider,
  AwsCustomResource,
  PhysicalResourceId,
  AwsCustomResourcePolicy,
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { IEEE, getDatasetMapping } from './dataset';
import { WranglerLayer } from './layer';
import { SARDeployment } from './sar';
import { artifactsHash, CfnNagWhitelist, grantKmsKeyPerm } from './utils';

export interface TransactionDashboardStackStackProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly queue: IQueue;
  readonly inferenceArn: string;
  readonly accessLogBucket: IBucket;
  readonly customDomain?: string;
  readonly r53HostZoneId?: string;
}

export class TransactionDashboardStack extends NestedStack {

  readonly distribution: IDistribution;

  constructor(
    scope: Construct,
    id: string,
    props: TransactionDashboardStackStackProps,
  ) {
    super(scope, id, props);

    const kmsKey = new Key(this, 'realtime-fraud-detection-with-gnn-on-dgl-dashboard', {
      alias: 'realtime-fraud-detection-with-gnn-on-dgl/dashboard',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const engine = '4.0.0';
    const docDBParameterGroup = new ClusterParameterGroup(this, 'DashboardDBParameterGroup', {
      family: 'docdb4.0', // peer to engine
      description: 'Parameter group of Dashboard DB.',
      parameters: {
        audit_logs: 'enabled',
      },
    });
    const dbUser = 'dashboard';
    const dashboardDBSG = new SecurityGroup(this, 'DashboardDatabaseSG', {
      vpc: props.vpc,
      allowAllOutbound: false,
    });
    const docDBCluster = new DatabaseCluster(this, 'DashboardDatabase', {
      masterUser: {
        username: dbUser,
      },
      engineVersion: engine,
      port: 27117,
      storageEncrypted: true,
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM),
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE,
      },
      vpc: props.vpc,
      securityGroup: dashboardDBSG,
      backup: {
        retention: Duration.days(7),
      },
      parameterGroup: docDBParameterGroup,
      removalPolicy: RemovalPolicy.DESTROY,
      kmsKey,
    });
    (docDBCluster.node.findChild('Secret').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W77',
            reason: 'use default KMS key created by secretmanager',
          },
        ],
      });
    const secretRotation = docDBCluster.addRotationSingleUser();
    (secretRotation.node.findChild('SecurityGroup').node.findChild('Resource') as CfnResource)
      .addPropertyOverride('SecurityGroupEgress', [
        {
          CidrIp: '255.255.255.255/32',
          Description: 'Disallow all traffic',
          FromPort: 252,
          IpProtocol: 'icmp',
          ToPort: 86,
        },
      ]);

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
    (dashboardSG.node.defaultChild as CfnResource).addMetadata('cfn_nag', {
      rules_to_suppress: [
        {
          id: 'W40',
          reason: 'dashboard func need internet access to connect secretsmanager endpoint',
        },
        {
          id: 'W5',
          reason: 'dashboard func need internet access to connect secretsmanager endpoint',
        },
      ],
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
      securityGroups: [dashboardSG],
      layers: [docDBCertLayer],
      tracing: Tracing.ACTIVE,
    });
    docDBCluster.secret!.grantRead(transacationFn);

    const createIndexSG = new SecurityGroup(this, 'CreateIndexOfDocDBSG', {
      allowAllOutbound: true,
      description: 'SG for creating index CR connecting DocDB',
      vpc: props.vpc,
    });
    createIndexSG.connections.allowTo(
      docDBCluster.connections,
      Port.tcp(docDBCluster.clusterEndpoint.port),
      'Allow Custom Resource creating index to access docDB.',
    );
    (createIndexSG.node.defaultChild as CfnResource).addMetadata('cfn_nag', {
      rules_to_suppress: [
        {
          id: 'W40',
          reason: 'creating index func need internet access to connect secretsmanager endpoint',
        },
        {
          id: 'W5',
          reason: 'creating index func need internet access to connect secretsmanager endpoint',
        },
      ],
    });
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
      securityGroups: [createIndexSG],
      layers: [docDBCertLayer],
      tracing: Tracing.ACTIVE,
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
    (logRole.node.defaultChild as CfnResource).addMetadata('cfn_nag', {
      rules_to_suppress: [
        {
          id: 'W11',
          reason: 'wildcard is used for putting logs',
        },
      ],
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
      securityGroups: [dashboardSG],
      layers: [docDBCertLayer],
      tracing: Tracing.ACTIVE,
    });
    docDBCluster.secret!.grantRead(tranEventFn);
    tranEventFn.addEventSource(
      new SqsEventSource(props.queue, {
        batchSize: 10,
        enabled: true,
      }),
    );

    const simEnd = new Pass(this, 'Stop generation');

    const tranSimFn = new PythonFunction(this, 'TransactionSimulatorFunc', {
      entry: path.join(__dirname, '../lambda.d/simulator'),
      layers: [
        new WranglerLayer(this, 'AwsDataWranglerLayer'),
      ],
      index: 'gen.py',
      runtime: Runtime.PYTHON_3_8,
      environment: {
        INFERENCE_ARN: props.inferenceArn,
        DATASET_URL: getDatasetMapping(this).findInMap(Aws.PARTITION, IEEE),
      },
      timeout: Duration.minutes(15),
      memorySize: 3008,
      tracing: Tracing.ACTIVE,
    });
    tranSimFn.addToRolePolicy(new PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [props.inferenceArn],
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
      tracing: Tracing.ACTIVE,
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
    const genLogGroupName = `/aws/vendedlogs/realtime-fraud-detection-with-gnn-on-dgl/dashboard/simulator/${this.stackName}`;
    grantKmsKeyPerm(kmsKey, genLogGroupName);
    const transactionGenerator = new StateMachine(
      this,
      'TransactionGenerator',
      {
        definition,
        logs: {
          destination: new LogGroup(this, 'FraudDetectionSimulatorLogGroup', {
            encryptionKey: kmsKey,
            retention: RetentionDays.SIX_MONTHS,
            logGroupName: genLogGroupName,
            removalPolicy: RemovalPolicy.DESTROY,
          }),
          includeExecutionData: true,
          level: LogLevel.ALL,
        },
        tracingEnabled: true,
      },
    );
    (transactionGenerator.node.findChild('Role').node.findChild('DefaultPolicy')
      .node.defaultChild as CfnResource).addMetadata('cfn_nag', {
      rules_to_suppress: [
        {
          id: 'W12',
          reason: 'wildcard in policy is used for x-ray and logs',
        },
      ],
    });

    const httpApi = new HttpApi(this, 'FraudDetectionDashboardApi', {
      createDefaultStage: false,
    });
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
      tracing: Tracing.ACTIVE,
    });
    (tokenFnRole.node.findChild('DefaultPolicy').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W12',
            reason: 'wildcard in policy is built by CDK for x-ray',
          },
        ],
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
    // TODO: update it when https://github.com/aws/aws-cdk/issues/11100 is resolved
    const apiCfnStage = apiStage.node.defaultChild as CfnStage;
    const apiAccessLogGroupName = `/aws/vendedlogs/realtime-fraud-detection-with-gnn-on-dgl/dashboard/api/${httpApi.apiId}/stage/${apiStageName}/${this.stackName}`;
    const apiAccessLog = new LogGroup(this, `Stage${apiStageName}Log`, {
      encryptionKey: kmsKey,
      logGroupName: apiAccessLogGroupName,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    grantKmsKeyPerm(kmsKey, apiAccessLogGroupName);
    apiCfnStage.accessLogSettings = {
      destinationArn: apiAccessLog.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        ip: '$context.identity.sourceIp',
        caller: '$context.identity.caller',
        user: '$context.identity.user',
        requestTime: '$context.requestTime',
        httpMethod: '$context.httpMethod',
        resourcePath: '$context.resourcePath',
        status: '$context.status',
        protocol: '$context.protocol',
        responseLength: '$context.responseLength',
      }),
    };

    this.distribution = this._deployFrontend(
      props.accessLogBucket,
      dashboardApi.graphqlUrl,
      httpApi.apiEndpoint,
      apiStage.stageName,
      undefined,
      props.customDomain,
      props.r53HostZoneId,
    );

    this.templateOptions.description = '(SO8013) - Real-time Fraud Detection with Graph Neural Network on DGL -- Dashboard stack.';

    new CfnOutput(this, 'DashboardDBEndpoint', {
      value: `${docDBCluster.clusterEndpoint.socketAddress}`,
      description: 'endpoint of documentDB for dashboard',
    });
    new CfnOutput(this, 'DashboardGrapqlEndpoint', {
      value: `${dashboardApi.graphqlUrl}`,
      description: 'graphql endpoint of dashboard',
    });
  }

  _targetCNRegion(): boolean {
    return process.env.CDK_DEFAULT_REGION?.startsWith('cn-') || 'aws-cn' === this.node.tryGetContext('TargetPartition');
  }

  _deployFrontend(
    accessLogBucket: IBucket,
    graphqlEndpoint: string,
    httpEndpoint: string,
    stageName: string,
    apiKey?: string,
    customDomain?: string,
    r53HostZoneId?: string,
  ): IDistribution {
    const websiteBucket = new Bucket(this, 'DashboardUI', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: accessLogBucket,
      serverAccessLogsPrefix: 'dashboardUIBucketAccessLog',
    });

    let distribution: IDistribution;
    const isTargetCN = this._targetCNRegion();

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
        loggingConfig: {
          bucket: accessLogBucket,
          prefix: 'cfAccessLog',
        },
      });
      (distribution.node.defaultChild as CfnResource)
        .addMetadata('cfn_nag', {
          rules_to_suppress: [
            {
              id: 'W70',
              reason: 'suppress minium TLSv1.2 warning when using default certificate of cloudfront',
            },
          ],
        });
    } else {
      const addSecurityHeaderSar = new SARDeployment(this, 'AddSecurityHeader', {
        application: 'arn:aws:serverlessrepo:us-east-1:418289889111:applications/add-security-headers',
        sematicVersion: '1.0.6',
        region: 'us-east-1',
        outputAtt: 'AddSecurityHeaderFunction',
        parameters: [{
          name: 'SecPolicy',
          value: `default-src \\\'none\\\'; base-uri \\\'self\\\'; img-src \\\'self\\\'; script-src \\\'self\\\'; style-src \\\'self\\\' \\\'unsafe-inline\\\' https:; object-src \\\'none\\\'; frame-ancestors \\\'none\\\'; font-src \\\'self\\\' https:; form-action \\\'self\\\'; manifest-src \\\'self\\\'; connect-src \\\'self\\\' https://${Fn.select(2, Fn.split('/', graphqlEndpoint))}/`,
        }],
      });
      addSecurityHeaderSar.deployFunc.addToRolePolicy(new PolicyStatement({
        actions: [
          'lambda:InvokeFunction',
        ],
        resources: [
          Arn.format({
            region: 'us-east-1',
            service: 'lambda',
            resource: 'function',
            resourceName: 'serverlessrepo-AddSecurityH-UpdateEdgeCodeFunction-*',
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
          }, Stack.of(this)),
        ],
      }));

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
        minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2019,
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
        logBucket: accessLogBucket,
        logFilePrefix: 'cfAccessLog',
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
      const dist = distribution.node.defaultChild as CfnDistribution;
      dist.addPropertyOverride('DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations', [
        {
          EventType: LambdaEdgeEventType.ORIGIN_RESPONSE,
          LambdaFunctionARN: addSecurityHeaderSar.funcVersionArn,
        },
      ]);
      if (!customDomain) {
        (distribution.node.defaultChild as CfnResource)
          .addMetadata('cfn_nag', {
            rules_to_suppress: [
              {
                id: 'W70',
                reason: 'suppress minium TLSv1.2 warning when using default domain name of cloudfront',
              },
            ],
          });
      }
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

    Aspects.of(this).add(new CfnNagWhitelist());

    new CfnOutput(this, 'DashboardWebsiteUrl', {
      value: `${distribution.distributionDomainName}`,
      description: 'url of dashboard website',
    });

    return distribution;
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
          image: Runtime.PROVIDED.bundlingImage,
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
