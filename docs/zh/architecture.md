使用默认参数部署此解决方案会在 AWS 云中构建以下环境。

![architecture of model training](./images/model-training.png)
      
图 1：构建图结构化数据、模型训练及部署的架构

![architecture of real-time inference and business dashboard](./images/system-arch.png)

图 2：实时反欺诈检测及业务监控系统的架构

此解决方案在您的 AWS 账户中部署五个 AWS CloudFormation 模板并设置以下内容：

1. 第一个 AWS CloudFormation 模板 `realtime-fraud-detection-with-gnn-on-dgl` 创建了：
    - 包含运行 [NAT 网关][nat-gateway] 和 [Internet 网关][igw]的 [Amazon Virtual Private Cloud][vpc] (Amazon VPC)。
    - 包含一个只读副本的图数据库 [Amazon Neptune][neptune] 集群，默认为 `db.r5.xlarge` 实例。
    - [Amazon SQS][sqs] 消息队列。
2. 第二个 CloudFormation 模板名为 `realtime-fraud-detection-with-gnn-on-dgl-trainingNestedStack` 开头，创建了：
    - [AWS Step Functions][step-functions] 工作流从原始表格金融交易数据到训练基于图神经网络的模型，且部署为在线推理接口。
    - [AWS Glue][glue] 数据目录及 ETL 作业，用于转换原始表格数据为图结构化数据。
    - 运行在 [Amazon ECS][ecs] 上的 [AWS Fargate][fargate] 容器将图结构数据导入到图数据库 Amazon Neptune。
    - [Amazon SageMaker][sagemaker] 训练模型且部署模型为在线推理接口。
    - [AWS Lambda][lambda] 函数完成原始数据注入、模型训练后处理等工作流步骤。
3. 第三个 CloudFormation 模板名为 `realtime-fraud-detection-with-gnn-on-dgl-inferenceNestedStack` 开头，创建了：
    - AWS Lambda 函数实现了实时反欺诈推理接口。
4. 第四个 CloudFormation 模板名为 `realtime-fraud-detection-with-gnn-on-dgl-dashboardNestedStack` 开头，创建了： 
    - [Amazon DocumentDB][documentdb] 用于存储实时反欺诈检测过的在线交易及欺诈交易的属性，其用户秘钥保存在 [AWS Secrets Manager][secrets-manager]。
    - [AWS Lambda][lambda] 函数接收实时在线交易，并将它们保存在 DocumentDB 。
    - 部署在 [Amazon S3][s3] 且通过 [Amazon CloudFront][cloudfront] 分发的业务监控系统 Web 程序。
    - 使用 [Amazon API Gateway][api-gateway] 和 [AWS AppSync][appsync] 实现的业务监控系统后端程序。
5. 第五个 CloudFormation 模板名为 `realtime-fraud-detection-with-gnn-on-dgl-DashboardDatabaseRotation` 开头，创建了： 
    - [AWS Lambda][lambda] 函数周期性的轮换保存在 Secrets Manager 中的 DocumentDB 用户及秘钥。

为了实现冗余，Amazon VPC 使用两个可用区 (AZ) 中的子网创建，以实现高可用性。 NAT 网关、 Amazon Neptune 、 Amazon DocumentDB 、 AWS Glue 等资源部署在这两个可用区中。

[vpc]: https://aws.amazon.com/cn/vpc/
[nat-gateway]: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html
[igw]: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html
[neptune]: https://aws.amazon.com/cn/neptune/
[sqs]: https://aws.amazon.com/cn/sqs/
[step-functions]: https://aws.amazon.com/cn/step-functions/
[glue]: https://aws.amazon.com/cn/glue/
[ecs]: https://aws.amazon.com/cn/ecs/
[fargate]: https://aws.amazon.com/cn/fargate/
[sagemaker]: https://aws.amazon.com/cn/sagemaker/
[lambda]: https://aws.amazon.com/cn/lambda/
[documentdb]: https://aws.amazon.com/cn/documentdb/
[s3]: https://aws.amazon.com/cn/s3/
[cloudfront]: https://aws.amazon.com/cn/cloudfront/
[api-gateway]: https://aws.amazon.com/cn/api-gateway/
[appsync]: https://aws.amazon.com/cn/appsync/
[secrets-manager]: https://aws.amazon.com/cn/secrets-manager/