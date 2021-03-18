import { GatewayVpcEndpointAwsService, Vpc, SecurityGroup, IVpc, ISecurityGroup, Port } from '@aws-cdk/aws-ec2';
import { Role, ServicePrincipal, PolicyDocument, PolicyStatement } from '@aws-cdk/aws-iam';
import { CfnDBCluster, CfnDBSubnetGroup, CfnDBClusterParameterGroup, CfnDBParameterGroup, CfnDBInstance } from '@aws-cdk/aws-neptune';
import { Bucket, BucketEncryption, IBucket } from '@aws-cdk/aws-s3';
import { Queue, QueueEncryption } from '@aws-cdk/aws-sqs';
import { Construct, RemovalPolicy, Stack, StackProps, Duration, CfnParameter } from '@aws-cdk/core';
import * as pjson from '../../package.json';
import { TransactionDashboardStack } from './dashboard-stack';
import { InferenceStack } from './inference-stack';
import { TrainingStack } from './training-stack';

export class FraudDetectionStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const vpcId = this.node.tryGetContext('vpcId');
    const vpc = vpcId ? Vpc.fromLookup(this, 'FraudDetectionVpc', {
      vpcId: vpcId === 'default' ? undefined : vpcId,
      isDefault: vpcId === 'default' ? true : undefined,
    }) : new Vpc(this, 'FraudDetectionVpc', {
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
    if (vpc.privateSubnets.length < 1) {
      throw new Error('The VPC must have PRIVATE subnet.');
    }

    const bucket = new Bucket(this, 'FraudDetectionDataBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
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
      default: 'db.r5.8xlarge',
    });

    const dataPrefix = 'fraud-detection/';
    const replicaCount = this.node.tryGetContext('NeptuneReplicaCount');
    const neptuneInfo = this._createGraphDB_Neptune(vpc, bucket, dataPrefix,
      neptuneInstanceType.valueAsString,
      (replicaCount === undefined) ? 1 : parseInt(replicaCount),
    );

    const trainingStack = new TrainingStack(this, 'training', {
      vpc,
      bucket,
      neptune: neptuneInfo,
      dataPrefix,
    });

    neptuneInfo.neptuneSG.addIngressRule(trainingStack.glueJobSG,
      Port.tcp(Number(neptuneInfo.port)), 'access from glue job.');
    neptuneInfo.neptuneSG.addIngressRule(trainingStack.loadPropsSG,
      Port.tcp(Number(neptuneInfo.port)), 'access from load props fargate task.');

    const tranQueue = new Queue(this, 'TransQueue', {
      contentBasedDeduplication: true,
      encryption: QueueEncryption.KMS_MANAGED,
      fifo: true,
      removalPolicy: RemovalPolicy.DESTROY,
      visibilityTimeout: Duration.seconds(60),
    });

    const inferenceStack = new InferenceStack(this, 'inference', {
      vpc,
      neptune: neptuneInfo,
      queue: tranQueue,
    });

    neptuneInfo.neptuneSG.addIngressRule(inferenceStack.inferenceSG,
      Port.tcp(Number(neptuneInfo.port)), 'access from inference job.');

    const inferenceStatsFnArn = String(inferenceStack.inferenceStatsFn.functionArn);

    new TransactionDashboardStack(this, 'dashboard', {
      vpc,
      queue: tranQueue,
      inferenceArn: inferenceStatsFnArn,
    });

    this.templateOptions.metadata = {
      'AWS::CloudFormation::Interface': {
        ParameterGroups: [
          {
            Label: { default: 'The configuration of graph database Neptune' },
            Parameters: [neptuneInstanceType.logicalId],
          },
        ],
      },
    };
    this.templateOptions.description = `(SO8013) - Real-time Fraud Detection with Graph Neural Network on DGL. Template version ${pjson.version}`;
  }

  private _createGraphDB_Neptune(vpc: IVpc, bucket: IBucket, dataPrefix: string, instanceType: string, replicaCount: number): {
    endpoint: string;
    port: string;
    clusterResourceId: string;
    neptuneSG: ISecurityGroup;
    loadRole: string;
    loadObjectPrefix: string;
  } {
    const clusterPort = 8182;
    const dbSubnetGroup = new CfnDBSubnetGroup(this, 'DBSubnetGroup', {
      dbSubnetGroupDescription: 'Neptune Subnet Group',
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
    });
    const neptuneSG = new SecurityGroup(this, 'NeptuneSG', {
      vpc: vpc,
      allowAllOutbound: true,
    });
    const clusterParamGroup = new CfnDBClusterParameterGroup(this, 'ClusterParamGroup', {
      description: 'Neptune Cluster Param Group',
      family: 'neptune1',
      parameters: {
        neptune_enable_audit_log: 1,
        neptune_streams: 1,
      },
    });
    const neptuneRole = new Role(this, 'NeptuneBulkLoadRole', {
      assumedBy: new ServicePrincipal('rds.amazonaws.com'),
      inlinePolicies: {
        kms: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: [
                'kms:Decrypt',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });
    const neptuneLoadObjectPrefix = `${dataPrefix}neptune/bulk-load`;
    bucket.grantRead(neptuneRole, `${neptuneLoadObjectPrefix}/*`);
    const graphDBCluster = new CfnDBCluster(this, 'TransactionGraphCluster', {
      associatedRoles: [{
        roleArn: neptuneRole.roleArn,
      }],
      dbSubnetGroupName: dbSubnetGroup.ref,
      vpcSecurityGroupIds: [neptuneSG.securityGroupId],
      dbClusterParameterGroupName: clusterParamGroup.ref,
      port: clusterPort,
      iamAuthEnabled: true,
      storageEncrypted: true,
    });
    graphDBCluster.addDependsOn(clusterParamGroup);
    graphDBCluster.addDependsOn(dbSubnetGroup);
    const dbParamGroup = new CfnDBParameterGroup(this, 'DBParamGroup', {
      family: clusterParamGroup.family,
      description: 'Neptune DB Param Group',
      parameters: {
        neptune_query_timeout: 600000,
      },
    });

    const primaryDB = new CfnDBInstance(this, 'primary-instance', {
      dbClusterIdentifier: graphDBCluster.ref,
      dbInstanceClass: instanceType,
      dbParameterGroupName: dbParamGroup.ref,
    });
    primaryDB.addDependsOn(graphDBCluster);
    primaryDB.addDependsOn(dbParamGroup);
    [...Array(replicaCount).keys()].forEach(idx => {
      const replica = new CfnDBInstance(this, `replica-${idx}`, {
        dbClusterIdentifier: graphDBCluster.ref,
        dbInstanceClass: instanceType,
        dbInstanceIdentifier: `replica-${idx}`,
      });
      replica.addDependsOn(primaryDB);
      replica.addDependsOn(graphDBCluster);
    });
    return {
      endpoint: graphDBCluster.attrEndpoint,
      port: String(clusterPort),
      clusterResourceId: graphDBCluster.attrClusterResourceId,
      neptuneSG,
      loadRole: neptuneRole.roleArn,
      loadObjectPrefix: neptuneLoadObjectPrefix,
    };
  }
}