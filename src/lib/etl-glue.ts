import * as path from 'path';
import { IVpc, Port, SecurityGroup, ISecurityGroup } from '@aws-cdk/aws-ec2';
import { Database, DataFormat, Table, Schema, CfnJob, CfnConnection, CfnCrawler, SecurityConfiguration, S3EncryptionMode, CloudWatchEncryptionMode, JobBookmarksEncryptionMode } from '@aws-cdk/aws-glue';
import { CompositePrincipal, ManagedPolicy, PolicyDocument, PolicyStatement, ServicePrincipal, Role } from '@aws-cdk/aws-iam';
import { IDatabaseCluster } from '@aws-cdk/aws-neptune';
import { IBucket, Bucket, BucketEncryption } from '@aws-cdk/aws-s3';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';
import { Aws, Construct, RemovalPolicy, Stack } from '@aws-cdk/core';
import { artifactHash } from './utils';

export interface ETLProps {
  bucket: IBucket;
  accessLogBucket: IBucket;
  s3Prefix?: string;
  vpc: IVpc;
  transactionPrefix: string;
  identityPrefix: string;
  neptune: {
    cluster: IDatabaseCluster;
    loadObjectPrefix: string;
  },
  dataColumnsArg: {
    id_cols: string;
    cat_cols: string;
  };
}

export class ETLByGlue extends Construct {
  readonly crawlerName: string;
  readonly jobName: string;
  readonly processedOutputPrefix: string;
  readonly glueJobSG: ISecurityGroup;

  constructor(scope: Construct, id: string, props: ETLProps) {
    super(scope, id);

    const glueJobBucket = new Bucket(this, 'GlueJobBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      serverAccessLogsBucket: props.accessLogBucket,
      serverAccessLogsPrefix: 'glueJobBucketAccessLog',
    });

    const transactionDatabase = new Database(this, 'FraudDetectionDatabase', {
      databaseName: 'frand_detection_db',
    });

    const transactionTable = new Table(this, 'TransactionTable', {
      database: transactionDatabase,
      tableName: 'transaction',
      description: 'Transaction Table',
      columns: [
        { name: 'transactionid', type: Schema.STRING },
      ],
      dataFormat: DataFormat.PARQUET,
      bucket: props.bucket,
      s3Prefix: props.transactionPrefix,
      storedAsSubDirectories: true,
    });

    const identityTable = new Table(this, 'IdentityTable', {
      database: transactionDatabase,
      tableName: 'identity',
      description: 'Identity Table',
      columns: [
        { name: 'transactionid', type: Schema.STRING },
      ],
      dataFormat: DataFormat.PARQUET,
      bucket: props.bucket,
      s3Prefix: props.identityPrefix,
      storedAsSubDirectories: true,
    });

    // create crawler to update tables
    const crawlerRole = new Role(this, 'DataCrawlerRole', {
      assumedBy: new CompositePrincipal(
        new ServicePrincipal('glue.amazonaws.com')),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole')],
    });
    props.bucket.grantRead(crawlerRole, `${props.s3Prefix ?? '/'}*`);
    const crawler = new CfnCrawler(this, 'DataCrawler', {
      role: crawlerRole.roleArn,
      targets: {
        catalogTargets: [{
          databaseName: transactionDatabase.databaseName,
          tables: [
            transactionTable.tableName,
            identityTable.tableName,
          ],
        }],
      },
      databaseName: transactionDatabase.databaseName,
      description: 'The crawler updates tables in Data Catalog.',
      schemaChangePolicy: {
        updateBehavior: 'UPDATE_IN_DATABASE',
        deleteBehavior: 'LOG',
      },
    });
    this.crawlerName = crawler.ref;

    this.glueJobSG = new SecurityGroup(this, 'GlueJobSG', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });
    this.glueJobSG.addIngressRule(this.glueJobSG, Port.allTraffic());

    var connCount = 1;
    const networkConntions = props.vpc.privateSubnets.map(sub => new CfnConnection(this, `NetworkConnection-${connCount++}`, {
      catalogId: transactionDatabase.catalogId,
      connectionInput: {
        connectionType: 'NETWORK',
        connectionProperties: {},
        physicalConnectionRequirements: {
          availabilityZone: sub.availabilityZone,
          subnetId: sub.subnetId,
          securityGroupIdList: [
            this.glueJobSG.securityGroupId,
          ],
        },
      },
    }));

    const securityConfName = `SecConf-${Stack.of(this).stackName}`;
    const securityConf = new SecurityConfiguration(this, 'FraudDetectionSecConf', {
      securityConfigurationName: securityConfName,
      s3Encryption: {
        mode: S3EncryptionMode.S3_MANAGED,
      },
      cloudWatchEncryption: {
        mode: CloudWatchEncryptionMode.KMS,
      },
      jobBookmarksEncryption: {
        mode: JobBookmarksEncryptionMode.CLIENT_SIDE_KMS,
      },
    });
    securityConf.cloudWatchEncryptionKey?.addToResourcePolicy(new PolicyStatement({
      principals: [new ServicePrincipal('logs.amazonaws.com')],
      actions: [
        'kms:Encrypt*',
        'kms:Decrypt*',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey*',
        'kms:Describe*',
      ],
      resources: ['*'],
      conditions: {
        ArnLike: {
          'kms:EncryptionContext:aws:logs:arn': Stack.of(this).formatArn({
            service: 'logs',
            resource: 'log-group',
            resourceName: `/aws-glue/jobs/${securityConfName}*`,
            sep: ':',
          }),
        },
      },
    }));

    const glueJobRole = new Role(this, 'GlueJobRole', {
      assumedBy: new CompositePrincipal(
        new ServicePrincipal('glue.amazonaws.com')),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole')],
      inlinePolicies: {
        glue: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['glue:GetConnection'],
              resources: [
                transactionDatabase.catalogArn,
                ...networkConntions.map(conn => Stack.of(this).formatArn({
                  service: 'glue',
                  resource: 'connection',
                  resourceName: conn.ref,
                })),
              ],
            }),
          ],
        }),
        logs: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['logs:AssociateKmsKey'],
              resources: [
                Stack.of(this).formatArn({
                  service: 'logs',
                  resource: 'log-group',
                  resourceName: `/aws-glue/jobs/${securityConfName}*`,
                  sep: ':',
                }),
              ],
            }),
          ],
        }),

      },
    });
    props.neptune.cluster.grantConnect(glueJobRole);
    identityTable.grantRead(glueJobRole);
    transactionTable.grantRead(glueJobRole);

    glueJobBucket.grantReadWrite(glueJobRole, 'tmp/*');
    const scriptPrefix = this._deployGlueArtifact(glueJobBucket,
      path.join(__dirname, '../scripts/glue-etl.py'), 'src/scripts/');
    glueJobBucket.grantRead(glueJobRole, `${scriptPrefix}/*`);

    const neptuneGlueConnectorLibName = 'neptune_python_utils.zip';
    const libPrefix = this._deployGlueArtifact(glueJobBucket,
      path.join(__dirname, `../script-libs/amazon-neptune-tools/neptune-python-utils/target/${neptuneGlueConnectorLibName}`),
      'src/script-libs/amazon-neptune-tools/neptune-python-utils/target/');
    glueJobBucket.grantRead(glueJobRole, `${libPrefix}/*`);

    props.bucket.grantReadWrite(glueJobRole, `${props.neptune.loadObjectPrefix}/*`);

    const outputPrefix = `${props.s3Prefix ?? ''}processed-data/`;
    const etlJob = new CfnJob(this, 'PreprocessingJob', {
      command: {
        name: 'glueetl',
        pythonVersion: '3',
        scriptLocation: glueJobBucket.s3UrlForObject(`${scriptPrefix}/glue-etl.py`),
      },
      defaultArguments: {
        '--region': Aws.REGION,
        '--database': transactionDatabase.databaseName,
        '--transaction_table': transactionTable.tableName,
        '--identity_table': identityTable.tableName,
        '--id_cols': props.dataColumnsArg.id_cols,
        '--cat_cols': props.dataColumnsArg.cat_cols,
        '--output_prefix': props.bucket.s3UrlForObject(outputPrefix),
        '--bulk_load_prefix':props.bucket.s3UrlForObject(props.neptune.loadObjectPrefix),
        '--job-language': 'python',
        '--job-bookmark-option': 'job-bookmark-disable',
        '--TempDir': glueJobBucket.s3UrlForObject('tmp/'),
        '--enable-continuous-cloudwatch-log': 'true',
        '--enable-continuous-log-filter': 'false',
        '--enable-metrics': '',
        '--extra-py-files': [glueJobBucket.s3UrlForObject(`${libPrefix}/${neptuneGlueConnectorLibName}`)].join(','),
        '--additional-python-modules': 'koalas==1.8.1',
        '--neptune_endpoint': props.neptune.cluster.clusterEndpoint.hostname,
        '--neptune_port': props.neptune.cluster.clusterEndpoint.port,
      },
      role: glueJobRole.roleArn,
      maxCapacity: 8,
      glueVersion: '2.0',
      connections: {
        connections: networkConntions.map(conn => conn.ref),
      },
      securityConfiguration: securityConf.securityConfigurationName,
    });
    props.bucket.grantWrite(glueJobRole, `${outputPrefix}*`);
    this.jobName = etlJob.ref;
    this.processedOutputPrefix = outputPrefix;
  }

  private _deployGlueArtifact(targetBucket: IBucket, artifactPath: string, assetPath: string): string {
    const hex = artifactHash(artifactPath);
    const scriptPrefix = `artifacts/${hex}`;
    new BucketDeployment(this, `GlueJobArtifact-${hex.substring(0, 8)}`, {
      sources: [Source.asset(assetPath)],
      destinationBucket: targetBucket,
      destinationKeyPrefix: scriptPrefix,
      prune: false,
      retainOnDelete: false,
    });
    return scriptPrefix;
  }
}