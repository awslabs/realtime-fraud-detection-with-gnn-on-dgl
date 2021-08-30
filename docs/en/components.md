## the pipeline of data processing, model training and deployment

![architecture of model training](./images/model-training.png)

The solution uses [AWS Step Functions][step-functions] [workflow][workflow] orchestrate the pipeline from raw [IEEE-CIS dataset][dataset], graph data processing, training GNN model and inference endpoint deployment. Below is the detail for each workflow step,

1. Use [AWS Lambda][lambda] function [downloads dataset][download-raw-data] to [Amazon S3][s3] bucket
2. Execute [AWS Glue][glue] [crawler][glue-crawler] to build [Glue Data Catalog][data-catalog] from dataset
3. Execute [AWS Glue ETL job][glue-etl] processing the raw data, converting the tabular data to graph structure data, then write to S3 bucket
4. Use [Amazon SageMaker][sagemaker] [trains][sagemaker-training-job] the [GNN model][training-src] on [DGL][dgl]
5. After training the model, [loading graph structure data into graph database Neptune][import-neptune] [Amazon Neptune][neptune]
6. Package the custom [inference code with model][repackage-model]
7. Use [Amazon SageMaker][sagemaker] to create model, configure endpoint configuration and deploying inference endpoint

## real-time fraud detection and business monitor system

![architecture of real-time inference and business dashboard](./images/system-arch.png)

### real-time fraud detection

The solution follows below steps for [implementing real-time fraud detection][realtime-inference],

1. Process the online transaction data as the graph structure data
2. Insert the graph data(vertices, edges and relationships) into graph database Neptune
3. Query the sub-graph of current transaction vertice and its 2nd connected vertices
4. Send the data of sub-graph to inference endpoint to get the possibility of fraudulent of the transaction. Then publish the transaction and its fraudulent possibility to [Amazon SQS][sqs] queue

### business monitor system

The solution uses below services consisting of the monitor system of fraudulent transactions,

- Use [AWS Lambda function][transactions-deposit] to process the online transaction in SQS queue, then store them into [Amazon DocumentDB][documentdb]
- Provide the [transaction stats interface][transactions-stats-api] via [AWS AppSync][appsync]
- The web app of monitor system is deployed on [Amazon S3][s3], and it's distributed by CDN [Amazon CloudFront][cloudfront]
- Mock up the online transactions via [AWS Step Functions][step-functions], which uses [test data in IEEE-CIS dataset][dataset] [requesting the API of fraud detection of transactions][sim-online-transactions]
- [Amazon API Gateway][api-gateway] provides the authentication for AppSync interface and trigger the simulation of online transactions

[dataset]: https://www.kaggle.com/c/ieee-fraud-detection/
[vpc]: https://aws.amazon.com/en/vpc/
[nat-gateway]: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html
[igw]: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html
[neptune]: https://aws.amazon.com/en/neptune/
[sqs]: https://aws.amazon.com/en/sqs/
[step-functions]: https://aws.amazon.com/en/step-functions/
[glue]: https://aws.amazon.com/en/glue/
[ecs]: https://aws.amazon.com/en/ecs/
[fargate]: https://aws.amazon.com/en/fargate/
[sagemaker]: https://aws.amazon.com/en/sagemaker/
[lambda]: https://aws.amazon.com/en/lambda/
[documentdb]: https://aws.amazon.com/en/documentdb/
[s3]: https://aws.amazon.com/en/s3/
[cloudfront]: https://aws.amazon.com/en/cloudfront/
[api-gateway]: https://aws.amazon.com/en/api-gateway/
[appsync]: https://aws.amazon.com/en/appsync/
[secrets-manager]: https://aws.amazon.com/en/secrets-manager/
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