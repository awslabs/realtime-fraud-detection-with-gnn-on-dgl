## 数据处理及模型训练发布的流水线

![architecture of model training](./images/model-training.png)

解决方案使用 [AWS Step Functions][step-functions] [工作流编排][workflow]从[IEEE-CIS数据集][dataset]到图数据的处理、图神经网络模型训练，到推理接口的部署。详细工作流程如下，

1. 使用 [AWS Lambda][lambda] 函数[下载数据集][download-raw-data]到 [Amazon S3][s3] 桶
2. 执行 [AWS Glue][glue] [爬网程序][glue-crawler]从数据集构建 [Glue Data Catalog][data-catalog]
3. 执行 [AWS Glue 作业][glue-etl]对原始数据处理，将表格数据转换为图结构化数据，并写入到 S3 桶
4. 调用 [Amazon SageMaker][sagemaker] 来[训练][sagemaker-training-job]基于 [DGL][dgl] 开发的[图神经网络模型][training-src]
5. 模型训练之后，将所有转换后的[图结构化数据导入图数据库][import-neptune] [Amazon Neptune][neptune]
6. 将自定义[推理代码同模型打包][repackage-model]
7. [Amazon SageMaker][sagemaker] 中创建模型，推理配置，部署推理节点

## 实时反欺诈检测及业务监控系统

![architecture of real-time inference and business dashboard](./images/system-arch.png)

### 实时反欺诈检测

解决方案按照以下步骤[实现实时反欺诈检测][realtime-inference]，

1. 将在线交易请求数据进行预处理，转换为图数据结构
2. 将图数据（顶点和边）插入到图数据库 Neptune
3. 以当前交易作为顶点在图数据库中查询有2度关联的交易顶点子图集
4. 将查询的子图数据发送到推理节点进行推理预测，得到该笔交易的欺诈可能性。把交易信息及欺诈预测结果发送到 [Amazon SQS][sqs] 队列，最终把交易欺诈的可能性返回

### 交易欺诈监控系统

解决方案使用以下服务实现交易欺诈监控系统，

- 使用 [AWS Lambda 函数][transactions-deposit] 读取 SQS 队列中的在线交易，并存储在 [Amazon DocumentDB][documentdb]
- 通过 [AWS AppSync][appsync] 提供[在线交易的统计接口][transactions-stats-api]
- 监控系统的Web程序部署在 [Amazon S3][s3] ，并通过 [Amazon CloudFront][cloudfront] CDN 网络分发
- 通过 [AWS Step Functions][step-functions] 工作流模拟在线交易的提交，将 [IEEE-CIS 中的测试数据集][dataset] [提交到在线反欺诈推理接口][sim-online-transactions]
- [Amazon API Gateway][api-gateway] 为 AppSync 接口提供认证接口及发起模拟在线交易的请求

[dataset]: https://www.kaggle.com/c/ieee-fraud-detection/
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
[data-catalog]: https://docs.aws.amazon.com/zh_cn/glue/latest/dg/populate-data-catalog.html
[glue-crawler]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/blob/main/src/lambda.d/crawl-data-catalog/index.ts
[download-raw-data]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/blob/main/src/lambda.d/ingest/import.py
[glue-etl]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/blob/main/src/scripts/glue-etl.py
[sagemaker-training-job]: https://docs.aws.amazon.com/zh_cn/sagemaker/latest/dg/train-model.html
[dgl]: https://www.dgl.ai/
[training-src]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/tree/main/src/sagemaker/FD_SL_DGL/gnn_fraud_detection_dgl
[import-neptune]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/tree/main/src/container.d/load-graph-data
[repackage-model]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/blob/main/src/lambda.d/repackage-model/app.py
[workflow]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/blob/661c3af67f13d2c7ab5028936e8fd0168ad65a96/src/lib/training-stack.ts#L714-L725
[realtime-inference]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/blob/main/src/lambda.d/inference/func/inferenceApi.py
[transactions-deposit]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/blob/main/src/lambda.d/dashboard/event.ts
[transactions-stats-api]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/blob/main/src/lambda.d/dashboard/api.ts
[sim-online-transactions]: https://github.com/awslabs/realtime-fraud-detection-with-gnn-on-dgl/blob/main/src/lambda.d/simulator/gen.py