import * as path from 'path';
import { IVpc, InstanceType, InstanceClass, InstanceSize, SecurityGroup, SubnetType } from '@aws-cdk/aws-ec2';
import { Repository } from '@aws-cdk/aws-ecr';
import { DockerImageAssetProps } from '@aws-cdk/aws-ecr-assets';
import { Cluster, FargateTaskDefinition, ContainerImage, LogDrivers, FargatePlatformVersion } from '@aws-cdk/aws-ecs';
import { FileSystem, LifecyclePolicy } from '@aws-cdk/aws-efs';
import { PolicyStatement, Effect, Role, ServicePrincipal } from '@aws-cdk/aws-iam';
import { Key } from '@aws-cdk/aws-kms';
import { Runtime, LayerVersion, Code, Tracing, FileSystem as LambdaFileSystem } from '@aws-cdk/aws-lambda';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { PythonFunction } from '@aws-cdk/aws-lambda-python';
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs';
import { IDatabaseCluster } from '@aws-cdk/aws-neptune';
import { IBucket } from '@aws-cdk/aws-s3';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';
import { IntegrationPattern, StateMachine, Fail, Errors, TaskInput, LogLevel, JsonPath, Choice, Condition } from '@aws-cdk/aws-stepfunctions';
import { LambdaInvoke, S3DataType, GlueStartJobRun, SageMakerCreateModel, S3Location, ContainerDefinition, Mode, DockerImage, SageMakerCreateEndpointConfig, SageMakerCreateEndpoint, SageMakerUpdateEndpoint, EcsRunTask, EcsFargateLaunchTarget, SageMakerCreateTrainingJob, InputMode } from '@aws-cdk/aws-stepfunctions-tasks';
import { Construct, Duration, NestedStack, NestedStackProps, Arn, Stack, CfnMapping, Aws, RemovalPolicy, IgnoreMode, Size, Token, CfnResource, Aspects } from '@aws-cdk/core';
import { AwsCliLayer } from '@aws-cdk/lambda-layer-awscli';
import { getDatasetMapping, IEEE } from './dataset';
import { ETLByGlue } from './etl-glue';
import { WranglerLayer } from './layer';
import { dirArtifactHash, CfnNagWhitelist, grantKmsKeyPerm } from './utils';

export interface TrainingStackProps extends NestedStackProps {
  readonly bucket: IBucket;
  readonly accessLogBucket: IBucket;
  readonly vpc: IVpc;
  readonly neptune: {
    cluster: IDatabaseCluster;
    loadObjectPrefix: string;
    loadRole: string;
  };
  readonly dataPrefix: string;
  readonly dataColumnsArg: {
    id_cols: string;
    cat_cols: string;
  };
}

export class TrainingStack extends NestedStack {
  readonly endpointName = 'FraudDetection'.toLowerCase();

  constructor(scope: Construct, id: string, props: TrainingStackProps) {
    super(scope, id, props);

    const kmsKey = new Key(this, 'realtime-fraud-detection-with-gnn-on-dgl-training', {
      alias: 'realtime-fraud-detection-with-gnn-on-dgl/training',
      enableKeyRotation: true,
      trustAccountIdentities: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const dataPrefix = props.dataPrefix;
    const transactionPrefix = `${dataPrefix}transactions`;
    const identityPrefix = `${dataPrefix}identity`;

    // create states of step functions for pipeline
    const failure = new Fail(this, 'Fail', {
      comment: 'The model training & deployment pipeline failed.',
    });

    const parametersNormalizeFn = new NodejsFunction(this, 'ParametersNormalizeFunc', {
      entry: path.join(__dirname, '../lambda.d/parameters-normalize/index.ts'),
      handler: 'normalize',
      timeout: Duration.seconds(60),
      memorySize: 128,
      runtime: Runtime.NODEJS_14_X,
      tracing: Tracing.ACTIVE,
    });
    const parametersNormalizeTask = new class extends LambdaInvoke {
      public toStateJson(): object {
        return {
          ...super.toStateJson(),
          ResultSelector: {
            'parameters.$': '$.Payload.parameters',
          },
        };
      }
    }(this, 'Parameters normalize', {
      lambdaFunction: parametersNormalizeFn,
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const stateTimeout = Duration.minutes(15);
    const dataIngestFn = new PythonFunction(this, 'DataIngestFunc', {
      entry: path.join(__dirname, '../lambda.d/ingest'),
      layers: [
        new WranglerLayer(this, 'DataIngestLayer'),
      ],
      index: 'import.py',
      runtime: Runtime.PYTHON_3_8,
      environment: {
        TargetBucket: props.bucket.bucketName,
        TransactionPrefix: transactionPrefix,
        IdentityPrefix: identityPrefix,
        DATASET_URL: getDatasetMapping(this).findInMap(Aws.PARTITION, IEEE),
      },
      timeout: stateTimeout,
      memorySize: 3008,
      tracing: Tracing.ACTIVE,
    });
    props.bucket.grantWrite(dataIngestFn);

    const etlConstruct = new ETLByGlue(this, 'ETLComp', {
      s3Prefix: dataPrefix,
      accessLogBucket: props.accessLogBucket,
      transactionPrefix,
      identityPrefix,
      bucket: props.bucket,
      vpc: props.vpc,
      key: kmsKey,
      dataColumnsArg: props.dataColumnsArg,
    });

    const dataCatalogCrawlerFn = new NodejsFunction(this, 'DataCatalogCrawler', {
      entry: path.join(__dirname, '../lambda.d/crawl-data-catalog/index.ts'),
      handler: 'crawler',
      timeout: stateTimeout,
      memorySize: 128,
      runtime: Runtime.NODEJS_14_X,
      tracing: Tracing.ACTIVE,
    });
    dataCatalogCrawlerFn.role?.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'glue:StartCrawler',
      ],
      resources: [Arn.format({
        service: 'glue',
        resource: 'crawler',
        resourceName: etlConstruct.crawlerName,
      }, Stack.of(this))],
    }));
    dataCatalogCrawlerFn.role?.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'glue:GetCrawlerMetrics',
      ],
      resources: ['*'],
    }));

    const dataIngestTask = new LambdaInvoke(this, 'Data Ingest', {
      lambdaFunction: dataIngestFn,
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      timeout: stateTimeout,
      resultPath: JsonPath.DISCARD,
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const dataCatalogCrawlerTask = new LambdaInvoke(this, 'Data Catalog Crawl', {
      lambdaFunction: dataCatalogCrawlerFn,
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      timeout: stateTimeout,
      payload: TaskInput.fromObject({
        crawlerName: etlConstruct.crawlerName,
      }),
      resultPath: JsonPath.DISCARD,
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const dataProcessTask = new GlueStartJobRun(this, 'Data Process', {
      integrationPattern: IntegrationPattern.RUN_JOB,
      glueJobName: etlConstruct.jobName,
      timeout: Duration.hours(5),
      resultPath: '$.dataProcessOutput',
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const imageAccountMapping = new CfnMapping(this, 'ImageAccountsMapping', {
      mapping: {
        'aws': {
          accountId: '366590864501',
        },
        'aws-cn': {
          accountId: '753680513547',
        },
      },
    });
    const trainingImageName = 'fraud-detection-with-gnn-on-dgl/training';
    const trainingImageTag = '1.0.0.202108111000';
    const hyperParaFn = new NodejsFunction(this, 'HyperParametersFunc', {
      entry: path.join(__dirname, '../lambda.d/training-hyperparam/index.ts'),
      handler: 'build',
      timeout: Duration.seconds(60),
      memorySize: 128,
      runtime: Runtime.NODEJS_14_X,
      tracing: Tracing.ACTIVE,
      environment: {
        InputDataRoot: props.bucket.urlForObject(etlConstruct.processedOutputPrefix),
      },
    });
    const hyperParaTask = new class extends LambdaInvoke {
      public toStateJson(): object {
        return {
          ...super.toStateJson(),
          ResultSelector: {
            'hyperParameters.$': '$.Payload.hyperParameters',
            'inputDataUri.$': '$.Payload.inputDataUri',
          },
        };
      }
    }(this, 'Build hyperparameters', {
      lambdaFunction: hyperParaFn,
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      resultPath: '$.trainingParametersOutput',
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const modelOutputPrefix = `${dataPrefix}model_output`;
    const trainingJobTask = new class extends SageMakerCreateTrainingJob {
      public toStateJson(): object {
        const json:{[key: string]: any} = {
          ...super.toStateJson(),
          ResultSelector: {
            'TrainingJobName.$': '$.TrainingJobName',
            'ModelArtifacts.$': '$.ModelArtifacts',
          },
        };
        json.Parameters['TrainingJobName.$'] =
          "States.Format('fraud-detection-model-{}', $.dataProcessOutput.CompletedOn)";
        json.Parameters['HyperParameters.$'] = '$.trainingParametersOutput.hyperParameters';
        json.Parameters.ResourceConfig['InstanceCount.$'] = '$.parameters.trainingJob.instanceCount';
        json.Parameters.ResourceConfig['InstanceType.$'] = '$.parameters.trainingJob.instanceType';
        json.Parameters.StoppingCondition['MaxRuntimeInSeconds.$'] = '$.parameters.trainingJob.timeoutInSeconds';
        json.Parameters.InputDataConfig[0].DataSource.S3DataSource['S3Uri.$'] = '$.trainingParametersOutput.inputDataUri';
        delete json.Parameters.ResourceConfig.InstanceCount;
        delete json.Parameters.ResourceConfig.InstanceType;
        delete json.Parameters.StoppingCondition.MaxRuntimeInSeconds;
        delete json.Parameters.InputDataConfig[0].DataSource.S3DataSource.S3Uri;
        return json;
      }
    }(this, 'Train model', {
      integrationPattern: IntegrationPattern.RUN_JOB,
      resultPath: '$.trainingJobOutput',
      trainingJobName: TaskInput.fromJsonPathAt('$.dataProcessOutput.CompletedOn').value,
      algorithmSpecification: {
        trainingInputMode: InputMode.FILE,
        trainingImage: DockerImage.fromEcrRepository(
          Repository.fromRepositoryAttributes(this, 'CustomTrainingImage', {
            repositoryArn: Repository.arnForLocalRepository(trainingImageName, this,
              imageAccountMapping.findInMap(Aws.PARTITION, 'accountId')),
            repositoryName: trainingImageName,
          }), trainingImageTag),
      },
      inputDataConfig: [
        {
          channelName: 'train',
          dataSource: {
            s3DataSource: {
              s3Location: S3Location.fromBucket(props.bucket, etlConstruct.processedOutputPrefix),
              s3DataType: S3DataType.S3_PREFIX,
            },
          },
        },
      ],
      outputDataConfig: {
        s3OutputLocation: S3Location.fromBucket(props.bucket, modelOutputPrefix),
      },
      resourceConfig: {
        instanceCount: 1, // PLACEHOLDER, will use from value from parameters
        instanceType: InstanceType.of(InstanceClass.C5, InstanceSize.XLARGE4), // PLACEHOLDER, will use from value from parameters
        volumeSize: Size.gibibytes(50),
      },
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });
    (trainingJobTask.node.findChild('SagemakerRole').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W11',
            reason: 'wildcard in IAM policy is used for creating training job of SageMaker by CDK',
          },
        ],
      });

    const efsSG = new SecurityGroup(this, 'TrainingEFSSG', {
      vpc: props.vpc,
      allowAllOutbound: false,
    });
    const fileSystem = new FileSystem(this, 'TempFilesystem', {
      vpc: props.vpc,
      securityGroup: efsSG,
      encrypted: true,
      removalPolicy: RemovalPolicy.DESTROY,
      lifecyclePolicy: LifecyclePolicy.AFTER_14_DAYS,
    });
    const accessPoint = fileSystem.addAccessPoint('TempFSAccessPoint', {
      path: '/',
      createAcl: {
        ownerUid: '0',
        ownerGid: '0',
        permissions: '750',
      },
      posixUser: {
        uid: '0',
        gid: '0',
      },
    });

    const codeHex = dirArtifactHash(path.join(__dirname, '../sagemaker/FD_SL_DGL/code'));
    const codePrefix = `${dataPrefix}model/code/${codeHex}`;
    new BucketDeployment(this, `Model-Code-${codePrefix.substring(0, 8)}`, {
      sources: [Source.asset(path.join(__dirname, '../sagemaker/FD_SL_DGL/code'))],
      destinationBucket: props.bucket,
      destinationKeyPrefix: codePrefix,
      prune: false,
      retainOnDelete: false,
    });

    const modelRepackageSG = new SecurityGroup(this, 'ModelRepackageSG', {
      allowAllOutbound: true,
      description: 'SG for Model Repackage SG',
      vpc: props.vpc,
    });
    (modelRepackageSG.node.defaultChild as CfnResource).addMetadata('cfn_nag', {
      rules_to_suppress: [
        {
          id: 'W40',
          reason: 'Model repackage func need internet access to query S3 endpoint',
        },
        {
          id: 'W5',
          reason: 'Model repackage func need internet access to query S3 endpoint',
        },
      ],
    });
    const mountPoint = '/mnt/efs';
    const modelRepackageFunc = new PythonFunction(this, 'ModelRepackageFunc', {
      entry: path.join(__dirname, '../lambda.d/repackage-model/'),
      index: 'app.py',
      layers: [
        new AwsCliLayer(this, 'AwsCliLayer'),
        new TarLayer(this, 'TarLayer'),
      ],
      runtime: Runtime.PYTHON_3_7,
      environment: {
        CodePackage: props.bucket.s3UrlForObject(codePrefix),
        TempFolder: mountPoint,
      },
      memorySize: 3008,
      timeout: Duration.minutes(15),
      logRetention: RetentionDays.ONE_WEEK,
      filesystem: LambdaFileSystem.fromEfsAccessPoint(accessPoint, mountPoint),
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE,
      }),
      securityGroup: modelRepackageSG,
      tracing: Tracing.ACTIVE,
    });

    fileSystem.connections.allowDefaultPortFrom(modelRepackageSG, 'allow requests from Model Repackage Func');
    props.bucket.grantRead(modelRepackageFunc, `${codePrefix}/*`);
    props.bucket.grantReadWrite(modelRepackageFunc, `${modelOutputPrefix}/*`);

    const modelRepackagingTask = new class extends LambdaInvoke {
      public toStateJson(): object {
        return {
          ...super.toStateJson(),
          ResultSelector: {
            'RepackagedArtifact.$': '$.Payload.RepackagedArtifact',
          },
        };
      }
    }(this, 'Package model with code', {
      lambdaFunction: modelRepackageFunc,
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      timeout: stateTimeout,
      payload: TaskInput.fromObject({
        ModelArtifact: TaskInput.fromJsonPathAt('$.trainingJobOutput.ModelArtifacts.S3ModelArtifacts').value,
      }),
      resultPath: '$.modelPackagingOutput',
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const ecsCluster = new Cluster(this, 'FraudDetectionCluster', {
      vpc: props.vpc,
      containerInsights: true,
    });

    const loadGraphDataTaskRole = new Role(this, 'LoadGraphDataECSTaskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    props.neptune.cluster.grantConnect(loadGraphDataTaskRole);
    props.bucket.grantRead(loadGraphDataTaskRole, `${modelOutputPrefix}/*`);
    props.bucket.grantRead(loadGraphDataTaskRole, `${etlConstruct.processedOutputPrefix}*`);
    props.bucket.grantWrite(loadGraphDataTaskRole, `${props.neptune.loadObjectPrefix}/*`);
    (loadGraphDataTaskRole.node.findChild('DefaultPolicy').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'F4',
            reason: 'neptune only has connect action',
          },
        ],
      });

    const taskVolumeName = 'efs-volume';
    const loadGraphDataTaskDefinition = new FargateTaskDefinition(this, 'LoadGraphDataToGraphDBsTask', {
      family: 'training-pipeline-load-graph-data',
      taskRole: loadGraphDataTaskRole,
      memoryLimitMiB: 1024,
      cpu: 256,
      volumes: [
        {
          name: taskVolumeName,
          efsVolumeConfiguration: {
            fileSystemId: fileSystem.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              accessPointId: accessPoint.accessPointId,
            },
          },
        },
      ],
    });

    const bulkLoadImageName = 'fraud-detection-with-gnn-on-dgl/bulk-load-graph-data';
    const bulkLoadImageTag = '1.0.0.202108111000';
    const bulkLoadGraphLogGroupName = `/realtime-fraud-detection-with-gnn-on-dgl/training/BulkLoadGraphData-${this.stackName}`;
    grantKmsKeyPerm(kmsKey, bulkLoadGraphLogGroupName);
    const loadGraphDataTaskContainer = loadGraphDataTaskDefinition.addContainer('container', {
      image: ContainerImage.fromEcrRepository(
        Repository.fromRepositoryAttributes(this, 'LoadPropertiesImage', {
          repositoryArn: Repository.arnForLocalRepository(bulkLoadImageName, this,
            imageAccountMapping.findInMap(Aws.PARTITION, 'accountId')),
          repositoryName: bulkLoadImageName,
        }), bulkLoadImageTag),
      memoryLimitMiB: 512,
      logging: LogDrivers.awsLogs({
        streamPrefix: 'fraud-detection-training-pipeline-load-graph-data-to-graph-dbs',
        logGroup: new LogGroup(this, 'TrainingBulkLoadGraph', {
          logGroupName: bulkLoadGraphLogGroupName,
          encryptionKey: kmsKey,
          retention: RetentionDays.SIX_MONTHS,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      }),
    });
    loadGraphDataTaskContainer.addMountPoints({
      containerPath: mountPoint,
      readOnly: false,
      sourceVolume: taskVolumeName,
    });

    const loadPropsSG = new SecurityGroup(this, 'LoadGraphDataSG', {
      allowAllOutbound: true,
      description: 'SG for Loading graph data to graph dbs in training pipeline',
      vpc: props.vpc,
    });
    props.neptune.cluster.connections.allowDefaultPortFrom(loadPropsSG, 'access from load props fargate task.');
    (loadPropsSG.node.defaultChild as CfnResource).addMetadata('cfn_nag', {
      rules_to_suppress: [
        {
          id: 'W40',
          reason: 'bulk load task need internet access to connect Neptune endpoint',
        },
        {
          id: 'W5',
          reason: 'bulk load task need internet access to connect Neptune endpoint',
        },
      ],
    });
    fileSystem.connections.allowDefaultPortFrom(loadPropsSG, 'allow requests from loading graph data Fargate');
    const runLoadGraphDataTask = new EcsRunTask(this, 'Load the graph data to Graph database', {
      integrationPattern: IntegrationPattern.RUN_JOB,
      cluster: ecsCluster,
      taskDefinition: loadGraphDataTaskDefinition,
      assignPublicIp: false,
      subnets: {
        subnetType: SubnetType.PRIVATE,
      },
      securityGroups: [loadPropsSG],
      containerOverrides: [{
        containerDefinition: loadGraphDataTaskContainer,
        command: [
          '--data_prefix',
          props.bucket.s3UrlForObject(props.neptune.loadObjectPrefix),
          '--temp_folder',
          mountPoint,
          '--neptune_endpoint',
          props.neptune.cluster.clusterEndpoint.hostname,
          '--neptune_port',
          Token.asString(props.neptune.cluster.clusterEndpoint.port),
          '--region',
          Aws.REGION,
          '--neptune_iam_role_arn',
          props.neptune.loadRole,
        ],
        environment: [
          {
            name: 'MODEL_PACKAGE',
            value: TaskInput.fromJsonPathAt('$.trainingJobOutput.ModelArtifacts.S3ModelArtifacts').value,
          },
          {
            name: 'JOB_NAME',
            value: TaskInput.fromJsonPathAt('$.trainingJobOutput.TrainingJobName').value,
          },
          {
            name: 'GRAPH_DATA_PATH',
            value: TaskInput.fromJsonPathAt('$.trainingParametersOutput.inputDataUri').value,
          },
        ],
      }],
      launchTarget: new EcsFargateLaunchTarget({
        platformVersion: FargatePlatformVersion.VERSION1_4,
      }),
      resultPath: JsonPath.DISCARD,
      timeout: Duration.hours(2),
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const deepLearningImagesMapping = new CfnMapping(this, 'DeepLearningImagesMapping', {
      mapping: {
        'us-east-1': {
          accountId: '763104351884',
        },
        'us-east-2': {
          accountId: '763104351884',
        },
        'us-west-1': {
          accountId: '763104351884',
        },
        'us-west-2': {
          accountId: '763104351884',
        },
        'af-south-1': {
          accountId: '626614931356',
        },
        'ap-east-1': {
          accountId: '871362719292',
        },
        'ap-south-1': {
          accountId: '763104351884',
        },
        'ap-northeast-2': {
          accountId: '763104351884',
        },
        'ap-southeast-1': {
          accountId: '763104351884',
        },
        'ap-southeast-2': {
          accountId: '763104351884',
        },
        'ap-northeast-1': {
          accountId: '763104351884',
        },
        'ca-central-1': {
          accountId: '763104351884',
        },
        'eu-central-1': {
          accountId: '763104351884',
        },
        'eu-west-1': {
          accountId: '763104351884',
        },
        'eu-west-2': {
          accountId: '763104351884',
        },
        'eu-south-1': {
          accountId: '692866216735',
        },
        'eu-west-3': {
          accountId: '763104351884',
        },
        'eu-north-1': {
          accountId: '763104351884',
        },
        'me-south-1': {
          accountId: '217643126080',
        },
        'sa-east-1': {
          accountId: '763104351884',
        },
        'cn-north-1': {
          accountId: '727897471807',
        },
        'cn-northwest-1': {
          accountId: '727897471807',
        },
      },
    });
    const createModelTask = new class extends SageMakerCreateModel {
      public toStateJson(): object {
        return {
          ...super.toStateJson(),
          ResultSelector: {
            'ModelArn.$': '$.ModelArn',
          },
        };
      }
    }(this, 'Create model', {
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      modelName: TaskInput.fromJsonPathAt('$.trainingJobOutput.TrainingJobName').value,
      primaryContainer: new ContainerDefinition({
        image: DockerImage.fromEcrRepository(
          Repository.fromRepositoryAttributes(this, 'DeepLearningECRRepo', {
            repositoryArn: Repository.arnForLocalRepository('pytorch-inference', this,
              deepLearningImagesMapping.findInMap(Aws.REGION, 'accountId')),
            repositoryName: 'pytorch-inference',
          }), '1.6.0-cpu-py36-ubuntu16.04'),
        mode: Mode.SINGLE_MODEL,
        modelS3Location: S3Location.fromJsonExpression('$.modelPackagingOutput.RepackagedArtifact'),
        environmentVariables: TaskInput.fromObject({
          SAGEMAKER_PROGRAM: 'fd_sl_deployment_entry_point.py',
          HIDDEN_SIZE: TaskInput.fromJsonPathAt('$.parameters.trainingJob.hyperparameters[\'n-hidden\']').value,
        }),
      }),
      resultPath: '$.modelOutput',
    });
    (createModelTask.node.findChild('SagemakerRole').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W11',
            reason: 'wildcard in IAM policy is used for creating model of SageMaker by CDK',
          },
        ],
      });

    const createEndpointConfigTask = new class extends SageMakerCreateEndpointConfig {
      public toStateJson(): object {
        return {
          ...super.toStateJson(),
          ResultSelector: {
            'EndpointConfigArn.$': '$.EndpointConfigArn',
          },
        };
      }
    }(this, 'Create endpoint config', {
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      endpointConfigName: TaskInput.fromJsonPathAt('$.trainingJobOutput.TrainingJobName').value,
      productionVariants: [{
        initialInstanceCount: 1,
        instanceType: InstanceType.of(InstanceClass.C5, InstanceSize.XLARGE4),
        modelName: TaskInput.fromJsonPathAt('$.trainingJobOutput.TrainingJobName').value,
        variantName: 'c5-4x',
      }],
      resultPath: '$.endpointConfigOutput',
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const checkEndpointFn = new PythonFunction(this, 'CheckEndpointFunc', {
      entry: path.join(__dirname, '../lambda.d/check-sagemaker-endpoint/'),
      index: 'app.py',
      runtime: Runtime.PYTHON_3_8,
      timeout: Duration.seconds(30),
      memorySize: 128,
    });
    checkEndpointFn.addToRolePolicy(new PolicyStatement({
      actions: ['sagemaker:DescribeEndpoint'],
      resources: [
        Arn.format({
          service: 'sagemaker',
          resource: 'endpoint',
          resourceName: this.endpointName,
        }, Stack.of(this)),
      ],
    }));
    const checkEndpointTask = new class extends LambdaInvoke {
      public toStateJson(): object {
        return {
          ...super.toStateJson(),
          ResultSelector: {
            'Endpoint.$': '$.Payload.Endpoint',
          },
        };
      }
    }(this, 'Check the existence of endpoint', {
      lambdaFunction: checkEndpointFn,
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      timeout: Duration.seconds(30),
      payload: TaskInput.fromObject({
        EndpointName: this.endpointName,
      }),
      resultPath: '$.checkEndpointOutput',
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const createEndpointTask = new SageMakerCreateEndpoint(this, 'Create endpoint', {
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      endpointName: this.endpointName,
      endpointConfigName: JsonPath.stringAt('$.trainingJobOutput.TrainingJobName'),
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const updateEndpointTask = new SageMakerUpdateEndpoint(this, 'Update endpoint', {
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      endpointName: this.endpointName,
      endpointConfigName: JsonPath.stringAt('$.trainingJobOutput.TrainingJobName'),
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const endpointChoice = new Choice(this, 'Create or update endpoint');
    endpointChoice.when(Condition.booleanEquals(`\$.checkEndpointOutput.Endpoint.${this.endpointName}`, false), createEndpointTask);
    endpointChoice.otherwise(updateEndpointTask);

    const definition = parametersNormalizeTask
      .next(dataIngestTask)
      .next(dataCatalogCrawlerTask)
      .next(dataProcessTask)
      .next(hyperParaTask)
      .next(trainingJobTask)
      .next(runLoadGraphDataTask)
      .next(modelRepackagingTask)
      .next(createModelTask)
      .next(createEndpointConfigTask)
      .next(checkEndpointTask)
      .next(endpointChoice);

    const pipelineLogGroupName = `/aws/vendedlogs/realtime-fraud-detection-with-gnn-on-dgl/training/pipeline/${this.stackName}`;
    grantKmsKeyPerm(kmsKey, pipelineLogGroupName);
    const pipeline = new StateMachine(this, 'ModelTrainingPipeline', {
      definition,
      logs: {
        destination: new LogGroup(this, 'FraudDetectionLogGroup', {
          retention: RetentionDays.SIX_MONTHS,
          logGroupName: pipelineLogGroupName,
          encryptionKey: kmsKey,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        includeExecutionData: true,
        level: LogLevel.ALL,
      },
      tracingEnabled: true,
    });

    (pipeline.role.node.findChild('DefaultPolicy').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W12',
            reason: 'wildcard resource in IAM policy(x-ray/logs) is used for step functions state machine',
          },
        ],
      });
    (createModelTask.node.findChild('SagemakerRole').node.findChild('DefaultPolicy').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W12',
            reason: 'wildcard resource in IAM policy(ECR auth) is used for creating training job of SageMaker by CDK',
          },
        ],
      });
    (trainingJobTask.node.findChild('SagemakerRole').node.findChild('DefaultPolicy').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W12',
            reason: 'wildcard resource in IAM policy(ECR auth) is used for creating training job of SageMaker by CDK',
          },
        ],
      });
    (loadGraphDataTaskDefinition.node.findChild('ExecutionRole').node
      .findChild('DefaultPolicy').node.defaultChild as CfnResource)
      .addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W12',
            reason: 'wildcard in IAM policy(ECR auth) is used for bulk loading graph',
          },
        ],
      });

    Aspects.of(this).add(new CfnNagWhitelist());

    this.templateOptions.description = '(SO8013) - Real-time Fraud Detection with Graph Neural Network on DGL -- model training and deployment stack.';
  }

  _trainingImageAssets(): DockerImageAssetProps {
    return {
      directory: path.join(__dirname, '../sagemaker/FD_SL_DGL/gnn_fraud_detection_dgl'),
      exclude: [
        'build_and_push.sh',
        'Dockerfile',
      ],
      ignoreMode: IgnoreMode.GLOB,
      buildArgs: {
        IMAGE_REPO: this.node.tryGetContext('TRAINING_IMAGE_REPO') ??
          (this.node.tryGetContext('TargetPartition') === 'aws-cn' ? '727897471807.dkr.ecr.cn-northwest-1.amazonaws.com.cn' : undefined),
      },
    };
  }
}

export class TarLayer extends LayerVersion {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      code: Code.fromAsset(path.join(__dirname, '../lambda.d/repackage-model/'), {
        bundling: {
          image: Runtime.PROVIDED.bundlingDockerImage,
          user: 'root',
          command: [
            'bash', '-c', `
            mkdir -p /asset-output/bin &&
            yum update -y && yum install -y zip tar gzip &&
            cp /bin/tar /usr/bin/gzip /asset-output/bin
            `,
          ],
        },
        assetHash: dirArtifactHash(path.join(__dirname, '../lambda.d/repackage-model/')),
      }),
      description: '/bin/tar',
    });
  }
}