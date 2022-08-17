# Real-time Fraud Detection with Graph Neural Network on DGL

It's an end-to-end blueprint architecture for **real-time** fraud detection 
using graph database [Amazon Neptune][neptune], [Amazon SageMaker][sagemaker] and 
[Deep Graph Library (DGL)][dgl] to construct a heterogeneous graph from tabular data 
and train a Graph Neural Network(GNN) model to detect fraudulent transactions 
in the [IEEE-CIS Fraud detection dataset][ieee-fraud-detection]. 
See the more detail in [blog post][blog].

## Architecutre of solution

This solution consists of below [stacks][cfn-stack],

- Fraud Detection solution stack
- nested model training and deployment stack
- nested real-time fraud detection stack
- nested transaction dashboard stack

### Model training and deployment stack

The model training & deployment pipeline is orchestrated by [AWS Step Functions][step-functions] like below graph,
![model training](./docs/en/images/model-training.png)

### Dashboard stack

It creates a React based web portal that observes the recent fraud transactions detected by this solution. This web application also is orchestrated by [Amazon CloudFront][cloudfront], [AWS Amplify][amplify], [AWS AppSync][appsync], [Amazon API Gateway][api], [AWS Step Functions][step-functions] and [Amazon DocumentDB][docdb].
![business system](./docs/en/images/system-arch.png)

#### How to train model and deploy inference endpoint

After [deploying](#how-to-deploy-the-solution) this solution, go to AWS Step Functions in AWS console, then start the state machine starting with `ModelTrainingPipeline`.

You can input below parameters to overrride the default parameters of model training,

```json
{
  "trainingJob": {
    "hyperparameters": {
    "n-hidden": "64",
    "n-epochs": "100",
    "lr":"1e-3"
    },
    "instanceType": "ml.c5.9xlarge",
    "timeoutInSeconds": 10800    
  }
}
```

## How to deploy the solution

### Regions

The solution is using graph database [Amazon Neptune][neptune] for real-time fraud detection and [Amazon DocumentDB][docdb] for dashboard. Due to the availability of those services, the solution supports to be deployed to below regions,

- US East (N. Virginia):   us-east-1
- US East (Ohio):   us-east-2
- US West (Oregon):   us-west-2
- Canada (Central):   ca-central-1
- South America (São Paulo):   sa-east-1
- Europe (Ireland):   eu-west-1
- Europe (London):   eu-west-2
- Europe (Paris):   eu-west-3
- Europe (Frankfurt):   eu-central-1
- Asia Pacific (Tokyo):   ap-northeast-1
- Asia Pacific (Seoul):   ap-northeast-2
- Asia Pacific (Singapore):   ap-southeast-1
- Asia Pacific (Sydney):   ap-southeast-2
- Asia Pacific (Mumbai):   ap-south-1
- China (Beijing):   cn-north-1
- China (Ningxia):   cn-northwest-1

### Quick deployment

Region name | Region code | Launch
--- | --- | ---
Global regions(switch to above region you want to deploy) | us-east-1(default) | [Launch](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=fraud-detection-on-dgl&templateURL=https://aws-gcr-solutions.s3.amazonaws.com/Realtime-fraud-detection-with-gnn-on-dgl-rel/latest/default/realtime-fraud-detection-with-gnn-on-dgl.template.json)
AWS China(Beijing) Region | cn-north-1 | [Launch](https://cn-north-1.console.amazonaws.cn/cloudformation/home?region=cn-north-1#/stacks/create/template?stackName=fraud-detection-on-dgl&templateURL=https://aws-gcr-solutions.s3.cn-north-1.amazonaws.com.cn/Realtime-fraud-detection-with-gnn-on-dgl-rel/latest/cn/realtime-fraud-detection-with-gnn-on-dgl.template.json)
AWS China(Ningxia) Region | cn-northwest-1 | [Launch](https://cn-northwest-1.console.amazonaws.cn/cloudformation/home?region=cn-northwest-1#/stacks/create/template?stackName=fraud-detection-on-dgl&templateURL=https://aws-gcr-solutions.s3.cn-north-1.amazonaws.com.cn/Realtime-fraud-detection-with-gnn-on-dgl-rel/latest/cn/realtime-fraud-detection-with-gnn-on-dgl.template.json)

See [deployment guide][deployment-guide] for detail steps.

### Deploy from source

#### Prerequisites

- An AWS account
- Configure [credential of aws cli][configure-aws-cli]
- Install node.js LTS version, such as 12.x
- Install Docker Engine
- Install the dependencies of solution via executing command `yarn install && npx projen`
- Initialize the CDK toolkit stack into AWS environment(only for deploying via [AWS CDK][aws-cdk] first time), run `yarn cdk-init`
- [Optional] [Public hosted zone in Amazon Route 53][create-public-hosted-zone]
- Authenticate with below ECR repository in your AWS partition
```shell
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 763104351884.dkr.ecr.us-east-1.amazonaws.com
```
Run below command if you are deployed to China regions
```shell
aws ecr get-login-password --region cn-northwest-1 | docker login --username AWS --password-stdin 727897471807.dkr.ecr.cn-northwest-1.amazonaws.com.cn
```

#### Deploy it in a new VPC
The deployment will create a new VPC acrossing two AZs at least and NAT gateways. Then the solution will be deployed into the newly created VPC.
```shell
yarn deploy
```

#### Deploy it into existing VPC
If you want to deploy the solution to default VPC, use below command.
```shell
yarn deploy-to-default-vpc
```
Or deploy an existing VPC by specifying the VPC Id,
```shell
npx cdk deploy -c vpcId=<your vpc id>
```

**NOTE: please make sure your existing VPC having both public subnets and private subnets with NAT gateway.**

#### Deploy it with custom Neptune instance class and replica count

The solution will deploy Neptune cluster with instance class `db.r5.xlarge` and `1` read replica by default. You can override the instance class and replica count like below,

```shell
npx cdk deploy --parameters NeptuneInstaneType=db.r5.4xlarge -c NeptuneReplicaCount=2 
```

#### Deploy it with using [SageMaker Serverless Inference][serverless-inference](experimental)
```shell
npx cdk deploy -c ServerlessInference=true -c ServerlessInferenceConcurrency=50 -c ServerlessInferenceMemorySizeInMB=2048
```

#### Deploy it with custom domain of dashboard

If you want use custom domain to access the dashbaord of solution, you can use below options when deploying the solution. NOTE: you need already create a public hosted zone in Route 53, see [Solution prerequisites](#prerequisites) for detail.
```shell
npx cdk deploy -c EnableDashboardCustomDomain=true --parameters DashboardDomain=<the custom domain> --parameters Route53HostedZoneId=<hosted zone id of your domain>
```

#### Deploy it to China regions
Add below additional context parameters,
```shell
npx cdk deploy -c TargetPartition=aws-cn
```
**NOTE**: deploying to China region also require below domain parameters, because the CloudFront distribution must be accessed via custom domain.
```shell
--parameters DashboardDomain=<the custom domain> --parameters Route53HostedZoneId=<hosted zone id of your domain>
```

## How to test
```shell
yarn test
```

## Data engineering/scientist
There are [Jupyter notebooks](./src/sagemaker/) for data engineering/scientist playing with the data featuring, model training and deploying inference endpoint without deploying this solution.

## FAQ

### What’s the benefits of using the graph neural network in the scenario Fraud Detection?
In the scenario of fraud detection, fraudsters can work collaboratively as groups to hide their abnormal features but leave some traces of relations. Traditional machine leaning models utilize various features of samples. However, the relations among different samples are normally ignored, either because of no direct feature can represent these relations, or the unique values of a feature is too big to be encoded for models. For example, IP addresses and physical addresses can be a link of two accounts. But normally the unique values of these addresses are too big to be one-hot encoded. Many feature-based models, hence, fail to leverage these potential relations.

Graph Neural Network models, on the other hand, directly benefit from links built among different samples, once reconstruct some categorical features of a sample into different nodes in a graph structure. Via using message pass and aggregation mechanism, GNN-based models can not only utilize features of samples, but also capture the relations among samples. With the advantages of capture relations, Graph Neural Network is more capable of detecting collaborated fraud event compared to traditional models.

### Why using graph database in this solution?
We use graph database to store the relationships between entities. The graph database provides the microseconds query performance to query the sub-graph of entities for real-time fraud detection inference.

###	How differentiate this solution and Amazon Fraud Detector?
This solution is based on Graph Neural Network and graph-structured data while the Amazon Fraud Detector use time-serial models and take advantage of Amazon’s own data on fraudsters. 

In addition, this solution also serves as a reference architecture of graph analytics and real-time graph machine learning scenarios. Users can take this solution as a base and fit into their own environments.

### How differentiate this solution and Amazon Neptune ML?
This solution has a few additional components and features than the current Amazon Neptune ML, including but not limited:

-	An end-to-end data process pipeline to show how a real-world data pipeline could be. This will help industrial customer to quickly hand on a total solution of graph neural network model-based system.
-	Real-time online inference sub-system, while the Neptune ML supports offline batch inference mode.
-	A demo GUI to show how the solution can solve real-world business problems, while the Neptune ML primarily uses graph database queries to show results.

While this solution gives an overall architecture of an end-to-end real-time inference solution, the Amazon Neptune ML has been optimized for scalability and system-level performance, e.g. query latency. Therefore, later on when the Amazon Neptune ML supports real-time inference, it could be integrated into this solution as the main training and inference sub-system for customers who requires better scalability and low latency.

### Deployment failure on creating `CloudWatch LogGroup`
The deployment might fail due to creating CloudWatch log group with error message like below,

```
Cannot enable logging. Policy document length breaking Cloudwatch Logs Constraints, either < 1 or > 5120 (Service: AmazonApiGatewayV2; Status Code: 400; Error Code: BadRequestException; Request ID: xxx-yyy-zzz; Proxy: null)
```

It's caused by [CloudWatch Logs resource policies are limited to 5120 characters][cloudwatch-logs-limit]. The remediation is merging or removing useless policies then update the resource policy of CloudWatch logs to reduce the characters of policies.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the Apache-2.0 License.

[dgl]: https://www.dgl.ai/
[neptune]: https://aws.amazon.com/neptune/
[sagemaker]: https://aws.amazon.com/sagemaker/
[cloudfront]: https://aws.amazon.com/cloudfront/
[amplify]: https://aws.amazon.com/amplify/
[appsync]: https://aws.amazon.com/appsync/
[docdb]: https://aws.amazon.com/documentdb/
[api]: https://aws.amazon.com/api-gateway/
[step-functions]: https://aws.amazon.com/stepfunctions/
[ieee-fraud-detection]: https://www.kaggle.com/c/ieee-fraud-detection/
[configure-aws-cli]: https://docs.aws.amazon.com/zh_cn/cli/latest/userguide/cli-chap-configure.html
[aws-cdk]: https://aws.amazon.com/cdk/
[cfn-stack]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacks.html
[create-public-hosted-zone]: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/CreatingHostedZone.html
[deployment-guide]: https://awslabs.github.io/realtime-fraud-detection-with-gnn-on-dgl/en/deployment/
[cloudwatch-logs-limit]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AWS-logs-and-resource-policy.html#AWS-logs-infrastructure-CWL
[serverless-inference]: https://docs.aws.amazon.com/sagemaker/latest/dg/serverless-endpoints.html
[blog]: https://aws.amazon.com/blogs/machine-learning/build-a-gnn-based-real-time-fraud-detection-solution-using-amazon-sagemaker-amazon-neptune-and-the-deep-graph-library/