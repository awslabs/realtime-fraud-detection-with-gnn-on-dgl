import * as path from 'path';
import { IVpc, ISecurityGroup, InstanceType, InstanceClass, InstanceSize, SecurityGroup, SubnetType } from '@aws-cdk/aws-ec2';
import { Repository } from '@aws-cdk/aws-ecr';
import { DockerImageAsset, DockerImageAssetProps } from '@aws-cdk/aws-ecr-assets';
import { Cluster, FargateTaskDefinition, ContainerImage, LogDrivers, FargatePlatformVersion } from '@aws-cdk/aws-ecs';
import { FileSystem, LifecyclePolicy } from '@aws-cdk/aws-efs';
import { PolicyStatement, Effect, Role, ServicePrincipal, PolicyDocument } from '@aws-cdk/aws-iam';
import { Runtime, LayerVersion, Code, Tracing, FileSystem as LambdaFileSystem } from '@aws-cdk/aws-lambda';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { PythonFunction, PythonLayerVersion } from '@aws-cdk/aws-lambda-python';
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs';
import { IBucket } from '@aws-cdk/aws-s3';
import { BucketDeployment, Source } from '@aws-cdk/aws-s3-deployment';
import { IntegrationPattern, StateMachine, Fail, Errors, TaskInput, LogLevel, JsonPath, Choice, Condition } from '@aws-cdk/aws-stepfunctions';
import { LambdaInvoke, S3DataType, GlueStartJobRun, SageMakerCreateModel, S3Location, ContainerDefinition, Mode, DockerImage, SageMakerCreateEndpointConfig, SageMakerCreateEndpoint, SageMakerUpdateEndpoint, EcsRunTask, EcsFargateLaunchTarget, SageMakerCreateTrainingJob, InputMode } from '@aws-cdk/aws-stepfunctions-tasks';
import { Construct, Duration, NestedStack, NestedStackProps, Arn, Stack, CfnMapping, Aws, RemovalPolicy, IgnoreMode, Size } from '@aws-cdk/core';
import { AwsCliLayer } from '@aws-cdk/lambda-layer-awscli';
import { getDatasetMapping, IEEE } from './dataset';
import { ETLByGlue } from './etl-glue';
import { dirArtifactHash } from './utils';

export interface TrainingStackProps extends NestedStackProps {
  readonly bucket: IBucket;
  readonly vpc: IVpc;
  readonly neptune: {
    endpoint: string;
    port: string;
    clusterResourceId: string;
    loadRole: string;
    loadObjectPrefix: string;
  };
  readonly dataPrefix: string;
}

export class TrainingStack extends NestedStack {
  readonly glueJobSG: ISecurityGroup;
  readonly loadPropsSG: ISecurityGroup;
  readonly preprocessingJob_id_cols: String;

  constructor(scope: Construct, id: string, props: TrainingStackProps) {
    super(scope, id, props);

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
        new PythonLayerVersion(this, 'DataIngestLayer', {
          entry: path.join(__dirname, '../lambda.d/layer.d/awswrangler'),
          compatibleRuntimes: [Runtime.PYTHON_3_8],
        }),
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
    });
    props.bucket.grantWrite(dataIngestFn);

    const etlConstruct = new ETLByGlue(this, 'ETLComp', {
      s3Prefix: dataPrefix,
      transactionPrefix,
      identityPrefix,
      bucket: props.bucket,
      vpc: props.vpc,
      neptune: props.neptune,
    });
    this.glueJobSG = etlConstruct.glueJobSG;
    this.preprocessingJob_id_cols = etlConstruct.preprocessingJob_id_cols;

    const dataCatalogCrawlerFn = new NodejsFunction(this, 'DataCatalogCrawler', {
      entry: path.join(__dirname, '../lambda.d/crawl-data-catalog/index.ts'),
      handler: 'crawler',
      timeout: stateTimeout,
      memorySize: 128,
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
        json.Parameters['HyperParameters.$'] = '$.parameters.trainingJob.hyperparameters';
        json.Parameters.ResourceConfig['InstanceCount.$'] = '$.parameters.trainingJob.instanceCount';
        json.Parameters.ResourceConfig['InstanceType.$'] = '$.parameters.trainingJob.instanceType';
        delete json.Parameters.ResourceConfig.InstanceCount;
        delete json.Parameters.ResourceConfig.InstanceType;
        return json;
      }
    }(this, 'Train model', {
      integrationPattern: IntegrationPattern.RUN_JOB,
      resultPath: '$.trainingJobOutput',
      trainingJobName: TaskInput.fromJsonPathAt('$.dataProcessOutput.CompletedOn').value,
      algorithmSpecification: {
        trainingInputMode: InputMode.FILE,
        trainingImage: DockerImage.fromAsset(this, 'TrainingImage', this._trainingImageAssets()),
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

    const fileSystem = new FileSystem(this, 'TempFilesystem', {
      vpc: props.vpc,
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

    const sg = new SecurityGroup(this, 'ModelRepackageSG', {
      allowAllOutbound: true,
      description: 'SG for Model Repackage SG',
      vpc: props.vpc,
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
      securityGroup: sg,
      tracing: Tracing.ACTIVE,
    });

    fileSystem.connections.allowDefaultPortFrom(sg, 'allow requests from Model Repackage Func');
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

    const loadPropTaskRole = new Role(this, 'LoadPropertiesECSTaskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        neptune: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['neptune-db:connect'],
              resources: [
                Stack.of(this).formatArn({
                  service: 'neptune-db',
                  resource: props.neptune.clusterResourceId,
                  resourceName: '*',
                }),
              ],
            }),
          ],
        }),
      },
    });
    props.bucket.grantRead(loadPropTaskRole, `${modelOutputPrefix}/*`);
    props.bucket.grantWrite(loadPropTaskRole, `${props.neptune.loadObjectPrefix}/*`);

    const taskVolumeName = 'efs-volume';
    const loadPropTaskDefinition = new FargateTaskDefinition(this, 'LoadPropertiesToGraphTask', {
      family: 'training-pipeline-load-props',
      taskRole: loadPropTaskRole,
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

    const loadPropertiesImage = new DockerImageAsset(this, 'LoadPropertiesImage', {
      directory: path.join(__dirname, '../'),
      file: 'container.d/load-properties/Dockerfile',
      exclude: [
        'container.d/(!load-properties)',
        'lambda.d/**',
        'lib/**',
        'sagemaker/**',
        'schema/**',
        'script-libs/**/(!neptune_python_utils.zip)',
        'scripts/**',
      ],
      ignoreMode: IgnoreMode.GLOB,
    });
    const loadPropTaskContainer = loadPropTaskDefinition.addContainer('container', {
      image: ContainerImage.fromDockerImageAsset(loadPropertiesImage),
      memoryLimitMiB: 512,
      logging: LogDrivers.awsLogs({
        streamPrefix: 'fraud-detection-training-pipeline-load-prop-to-graph-dbs',
      }),
    });
    loadPropTaskContainer.addMountPoints({
      containerPath: mountPoint,
      readOnly: false,
      sourceVolume: taskVolumeName,
    });

    this.loadPropsSG = new SecurityGroup(this, 'LoadPropsSG', {
      allowAllOutbound: true,
      description: 'SG for Loading props to graph dbs in training pipeline',
      vpc: props.vpc,
    });
    fileSystem.connections.allowDefaultPortFrom(this.loadPropsSG, 'allow requests from Load Props Fargate');
    const runLoadPropsTask = new EcsRunTask(this, 'Load the props to graph', {
      integrationPattern: IntegrationPattern.RUN_JOB,
      cluster: ecsCluster,
      taskDefinition: loadPropTaskDefinition,
      assignPublicIp: false,
      subnets: {
        subnetType: SubnetType.PRIVATE,
      },
      securityGroups: [this.loadPropsSG],
      containerOverrides: [{
        containerDefinition: loadPropTaskContainer,
        command: [
          '--data_prefix',
          props.bucket.s3UrlForObject(props.neptune.loadObjectPrefix),
          '--temp_folder',
          mountPoint,
          '--neptune_endpoint',
          props.neptune.endpoint,
          '--neptune_port',
          props.neptune.port,
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
          }), '1.4.0-cpu-py36-ubuntu16.04'),
        mode: Mode.SINGLE_MODEL,
        modelS3Location: S3Location.fromJsonExpression('$.modelPackagingOutput.RepackagedArtifact'),
        environmentVariables: TaskInput.fromObject({
          SAGEMAKER_PROGRAM: 'fd_sl_deployment_entry_point.py',
        }),
      }),
      resultPath: '$.modelOutput',
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

    const endpointName = 'FraudDetection'.toLowerCase();
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
          resourceName: endpointName,
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
        EndpointName: endpointName,
      }),
      resultPath: '$.checkEndpointOutput',
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const createEndpointTask = new SageMakerCreateEndpoint(this, 'Create endpoint', {
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      endpointName: endpointName,
      endpointConfigName: JsonPath.stringAt('$.trainingJobOutput.TrainingJobName'),
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const updateEndpointTask = new SageMakerUpdateEndpoint(this, 'Update endpoint', {
      integrationPattern: IntegrationPattern.REQUEST_RESPONSE,
      endpointName: endpointName,
      endpointConfigName: JsonPath.stringAt('$.trainingJobOutput.TrainingJobName'),
    }).addCatch(failure, {
      errors: [Errors.ALL],
      resultPath: '$.error',
    });

    const endpointChoice = new Choice(this, 'Create or update endpoint');
    endpointChoice.when(Condition.booleanEquals(`\$.checkEndpointOutput.Endpoint.${endpointName}`, false), createEndpointTask);
    endpointChoice.otherwise(updateEndpointTask);

    const definition = parametersNormalizeTask
      .next(dataIngestTask)
      .next(dataCatalogCrawlerTask)
      .next(dataProcessTask)
      .next(trainingJobTask)
      .next(runLoadPropsTask)
      .next(modelRepackagingTask)
      .next(createModelTask)
      .next(createEndpointConfigTask)
      .next(checkEndpointTask)
      .next(endpointChoice);

    const pipelineStateMachine = new StateMachine(this, 'ModelTrainingPipeline', {
      definition,
      logs: {
        destination: new LogGroup(this, 'FraudDetectionLogGroup', {
          retention: RetentionDays.SIX_MONTHS,
        }),
        includeExecutionData: true,
        level: LogLevel.ERROR,
      },
      tracingEnabled: true,
    });
    // TODO: dirty fix, removed it when https://github.com/aws/aws-cdk/issues/11594 is resolved
    pipelineStateMachine.addToRolePolicy(new PolicyStatement({
      actions: ['sagemaker:UpdateEndpoint'],
      resources: [Arn.format({
        service: 'sagemaker',
        resource: 'endpoint-config',
        resourceName: '*',
      }, Stack.of(this))],
    }));
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
          (this.node.tryGetContext('targetPartition') === 'aws-cn' ? '727897471807.dkr.ecr.cn-northwest-1.amazonaws.com.cn' : undefined),
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