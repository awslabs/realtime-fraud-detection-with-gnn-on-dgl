import { ClusterParameterGroup, ParameterGroup, DatabaseCluster, InstanceType, IDatabaseCluster, EngineVersion, ParameterGroupFamily } from '@aws-cdk/aws-neptune-alpha';
import { RemovalPolicy, Stack, StackProps, Duration, CfnParameter, CfnOutput, CfnResource } from 'aws-cdk-lib';
import { GatewayVpcEndpointAwsService, Vpc, FlowLogDestination, SubnetType, IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnDBInstance } from 'aws-cdk-lib/aws-neptune';
import { Bucket, BucketEncryption, IBucket } from 'aws-cdk-lib/aws-s3';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { TransactionDashboardStack } from './dashboard-stack';
import { InferenceStack } from './inference-stack';
import { TrainingStack } from './training-stack';
import * as pjson from '../../package.json';

export class FraudDetectionStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const accessLogBucket = new Bucket(this, 'BucketAccessLog', {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      serverAccessLogsPrefix: 'accessLogBucketAccessLog',
    });

    const vpcId = this.node.tryGetContext('vpcId');
    const vpc = vpcId ? Vpc.fromLookup(this, 'FraudDetectionVpc', {
      vpcId: vpcId === 'default' ? undefined : vpcId,
      isDefault: vpcId === 'default' ? true : undefined,
    }) : (() => {
      const newVpc = new Vpc(this, 'FraudDetectionVpc', {
        maxAzs: 2,
        gatewayEndpoints: {
          s3: {
            service: GatewayVpcEndpointAwsService.S3,
          },
          dynamodb: {
            service: GatewayVpcEndpointAwsService.DYNAMODB,
          },
        },
      });
      newVpc.addFlowLog('VpcFlowlogs', {
        destination: FlowLogDestination.toS3(accessLogBucket, 'vpcFlowLogs'),
      });
      return newVpc;
    })();
    if (vpc.privateSubnets.length < 1) {
      throw new Error('The VPC must have PRIVATE subnet.');
    }

    const bucket = new Bucket(this, 'FraudDetectionDataBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
      serverAccessLogsBucket: accessLogBucket,
      serverAccessLogsPrefix: 'dataBucketAccessLog',
    });

    const neptuneInstanceType = new CfnParameter(this, 'NeptuneInstaneType', {
      description: 'Instance type of graph database Neptune',
      type: 'String',
      allowedValues: [
        'db.r5.xlarge',
        'db.r5.2xlarge',
        'db.r5.4xlarge',
        'db.r5.8xlarge',
        'db.r5.12xlarge',
      ],
      default: 'db.r5.xlarge',
    });

    const dataPrefix = 'fraud-detection/';
    const replicaCount = this.node.tryGetContext('NeptuneReplicaCount');
    const neptuneInfo = this._createGraphDB_Neptune(vpc, bucket, dataPrefix,
      neptuneInstanceType.valueAsString,
      (replicaCount === undefined) ? 1 : parseInt(replicaCount),
    );

    const dataColumnsArg = {
      id_cols: 'card1,card2,card3,card4,card5,card6,ProductCD,addr1,addr2,P_emaildomain,R_emaildomain',
      cat_cols: 'M1,M2,M3,M4,M5,M6,M7,M8,M9',
      dummies_cols: 'M1_F,M1_T,M2_F,M2_T,M3_F,M3_T,M4_M0,M4_M1,M4_M2,M5_F,M5_T,M6_F,M6_T,M7_F,M7_T,M8_F,M8_T,M9_F,M9_T',
    };

    const trainingStack = new TrainingStack(this, 'training', {
      vpc,
      bucket,
      accessLogBucket,
      neptune: neptuneInfo,
      dataPrefix,
      dataColumnsArg: dataColumnsArg,
    });

    const tranQueue = new Queue(this, 'TransQueue', {
      contentBasedDeduplication: true,
      encryption: QueueEncryption.KMS_MANAGED,
      fifo: true,
      removalPolicy: RemovalPolicy.DESTROY,
      visibilityTimeout: Duration.seconds(60),
      deadLetterQueue: {
        queue: new Queue(this, 'TransDLQ', {
          contentBasedDeduplication: true,
          encryption: QueueEncryption.KMS_MANAGED,
          fifo: true,
          visibilityTimeout: Duration.seconds(60),
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        maxReceiveCount: 5,
      },
    });

    const inferenceStack = new InferenceStack(this, 'inference', {
      vpc,
      neptune: neptuneInfo.cluster,
      queue: tranQueue,
      sagemakerEndpointName: trainingStack.endpointName,
      dataColumnsArg: dataColumnsArg,
    });

    const inferenceFnArn = inferenceStack.inferenceFn.functionArn;
    const interParameterGroups = [
      {
        Label: { default: 'The configuration of graph database Neptune' },
        Parameters: [neptuneInstanceType.logicalId],
      },
    ];

    let customDomain: string | undefined;
    let r53HostZoneId: string | undefined;
    if ('aws-cn' === this.node.tryGetContext('TargetPartition') ||
      (/true/i).test(this.node.tryGetContext('EnableDashboardCustomDomain'))) {
      const dashboardDomainNamePara = new CfnParameter(this, 'DashboardDomain', {
        description: 'Custom domain name for dashboard',
        type: 'String',
        allowedPattern: '(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]',
      });
      const r53HostZoneIdPara = new CfnParameter(this, 'Route53HostedZoneId', {
        type: 'AWS::Route53::HostedZone::Id',
        description: 'Route53 public hosted zone ID of given domain',
      });
      interParameterGroups.push({
        Label: { default: 'The dashboard configuration' },
        Parameters: [dashboardDomainNamePara.logicalId, r53HostZoneIdPara.logicalId],
      });
      customDomain = dashboardDomainNamePara.valueAsString;
      r53HostZoneId = r53HostZoneIdPara.valueAsString;
    }

    const dashboardStack = new TransactionDashboardStack(this, 'dashboard', {
      vpc,
      queue: tranQueue,
      inferenceArn: inferenceFnArn,
      accessLogBucket,
      customDomain: customDomain,
      r53HostZoneId: r53HostZoneId,
    });

    this.templateOptions.metadata = {
      'AWS::CloudFormation::Interface': {
        ParameterGroups: interParameterGroups,
      },
    };
    this.templateOptions.description = `(SO9076) - Real-time Fraud Detection with Graph Neural Network on DGL. Template version ${pjson.version}`;

    new CfnOutput(this, 'DashboardWebsiteUrl', {
      value: customDomain ?? dashboardStack.distribution.distributionDomainName,
      description: 'url of dashboard website',
    });
  }

  private _createGraphDB_Neptune(vpc: IVpc, bucket: IBucket, dataPrefix: string, instanceType: string, replicaCount: number): {
    cluster: IDatabaseCluster;
    loadObjectPrefix: string;
    loadRole: string;
  } {
    const clusterPort = 8182;
    const clusterParams = new ClusterParameterGroup(this, 'ClusterParams', {
      description: 'Cluster parameter group',
      parameters: {
        neptune_enable_audit_log: '1',
        neptune_streams: '1',
      },
      family: ParameterGroupFamily.NEPTUNE_1_2,
    });

    const dbParams = new ParameterGroup(this, 'DBParamGroup', {
      description: 'Neptune DB Param Group',
      parameters: {
        neptune_query_timeout: '600000',
      },
      family: ParameterGroupFamily.NEPTUNE_1_2,
    });

    const neptuneRole = new Role(this, 'NeptuneBulkLoadRole', {
      assumedBy: new ServicePrincipal('rds.amazonaws.com'),
    });
    const neptuneLoadObjectPrefix = `${dataPrefix}neptune/bulk-load`;
    bucket.grantRead(neptuneRole, `${neptuneLoadObjectPrefix}/*`);

    const graphDBSG = new SecurityGroup(this, 'NeptuneSG', {
      vpc,
      allowAllOutbound: true,
    });
    (graphDBSG.node.defaultChild as CfnResource).addMetadata('cfn_nag', {
      rules_to_suppress: [
        {
          id: 'W40',
          reason: 'Neptune bulk load need internet access to query S3 endpoint',
        },
        {
          id: 'W5',
          reason: 'Neptune bulk load need internet access to query S3 endpoint',
        },
      ],
    });
    const graphDBCluster = new DatabaseCluster(this, 'TransactionGraphCluster', {
      vpc,
      instanceType: InstanceType.of(instanceType),
      clusterParameterGroup: clusterParams,
      parameterGroup: dbParams,
      associatedRoles: [neptuneRole],
      iamAuthentication: true,
      storageEncrypted: true,
      port: clusterPort,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_NAT,
      },
      instances: 1 + replicaCount,
      removalPolicy: RemovalPolicy.DESTROY,
      backupRetention: Duration.days(7),
      securityGroups: [graphDBSG],
      engineVersion: new EngineVersion('1.2.0.1'),
    });
    graphDBCluster.node.findAll().filter(c => (c as CfnDBInstance).cfnOptions)
      .forEach(c => (c as CfnDBInstance).autoMinorVersionUpgrade = true);

    return {
      cluster: graphDBCluster,
      loadObjectPrefix: neptuneLoadObjectPrefix,
      loadRole: neptuneRole.roleArn,
    };
  }
}