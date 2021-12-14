import * as path from 'path';
import { Database, DataFormat, Table, Schema, SecurityConfiguration, S3EncryptionMode, JobBookmarksEncryptionMode, CloudWatchEncryptionMode } from '@aws-cdk/aws-glue-alpha';
import { Aws, RemovalPolicy, Stack, CfnResource, ArnFormat } from 'aws-cdk-lib';
import { IVpc, SecurityGroup, Port } from 'aws-cdk-lib/aws-ec2';
import { CfnJob, CfnConnection, CfnCrawler } from 'aws-cdk-lib/aws-glue';
import { CompositePrincipal, ManagedPolicy, PolicyDocument, PolicyStatement, ServicePrincipal, Role } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { IBucket, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { artifactHash } from './utils';

export interface ETLProps {
  bucket: IBucket;
  accessLogBucket: IBucket;
  s3Prefix?: string;
  vpc: IVpc;
  key: IKey;
  transactionPrefix: string;
  identityPrefix: string;
  dataColumnsArg: {
    id_cols: string;
    cat_cols: string;
  };
}

export class ETLByGlue extends Construct {
  readonly crawlerName: string;
  readonly jobName: string;
  readonly processedOutputPrefix: string;

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

    const glueJobSG = new SecurityGroup(this, 'GlueJobSG', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });
    glueJobSG.addIngressRule(glueJobSG, Port.allTcp(), 'allow all TCP from same SG');
    (glueJobSG.node.defaultChild as CfnResource).addMetadata('cfn_nag', {
      rules_to_suppress: [
        {
          id: 'W40',
          reason: 'etl job need internet access to install pip packages',
        },
        {
          id: 'W5',
          reason: 'etl job need internet access to install pip packages',
        },
        {
          id: 'W27',
          reason: 'SG of glue job need open ingress required by Glue',
        },
      ],
    });

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
            glueJobSG.securityGroupId,
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
        kmsKey: props.key,
      },
      jobBookmarksEncryption: {
        mode: JobBookmarksEncryptionMode.CLIENT_SIDE_KMS,
        kmsKey: props.key,
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
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
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
                  arnFormat: ArnFormat.COLON_RESOURCE_NAME,
                }),
              ],
            }),
          ],
        }),

      },
    });
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
        '--job-language': 'python',
        '--job-bookmark-option': 'job-bookmark-disable',
        '--TempDir': glueJobBucket.s3UrlForObject('tmp/'),
        '--enable-continuous-cloudwatch-log': 'true',
        '--enable-continuous-log-filter': 'false',
        '--enable-metrics': '',
        '--extra-py-files': [glueJobBucket.s3UrlForObject(`${libPrefix}/${neptuneGlueConnectorLibName}`)].join(','),
        '--additional-python-modules': 'koalas==1.8.1',
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