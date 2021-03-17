# Real-time Fraud Detection with Graph Neural Network on DGL

It's a end-to-end solution for **real-time** fraud detection using  [Amazon SageMaker][sagemaker] and [Deep Graph Library (DGL)][dgl] to construct a heterogeneous graph from tabular data and train a Graph Neural Network(GNN) model to detect fraudulent transactions in the [IEEE-CIS dataset][ieee-fraud-detection].

## Architecutre of solution

This solution consists of below [stacks][cfn-stack],

- Fraud Detection solution stack
- nested model training and deployment stack
- nested real-time fraud detection stack
- nested transaction dashboard stack

### Model training and deployment stack

The model training & deployment pipeline is orchestrated by [AWS Step Functions][step-functions] like below graph,
![model training](./docs/model-training.png)

#### How to train model and deploy inference endpoint

After [deploying](#how-to-deploy-the-solution) this solution, go to AWS Step Functions in AWS console, then start the state machine starting with `ModelTrainingPipeline`.

You can input below parameters to overrride the default parameters of model training,

```json
{
  "trainingJob": {
    "hyperparameters": {
      "n-epochs": "1"
    },
    "instanceType": "ml.c5.9xlarge"
  }
}
```

## How to deploy the solution

### Prerequisites

- An AWS account
- Configure [credential of aws cli][configure-aws-cli]
- Install node.js LTS version, such as 12.x
- Install Docker Engine
- Install the dependencies of solution via executing command `yarn install && npx projen`
- Initialize the CDK toolkit stack into AWS environment(only for deploying via [AWS CDK][aws-cdk] first time), run `yarn cdk-init`
- Authenticate with below ECR repository in your AWS partition
```shell
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 763104351884.dkr.ecr.us-east-1.amazonaws.com
```
Run below command if you are deployed to China regions
```shell
aws ecr get-login-password --region cn-northwest-1 | docker login --username AWS --password-stdin 727897471807.dkr.ecr.cn-northwest-1.amazonaws.com.cn
```

### Deploy it in a new VPC
The deployment will create a new VPC acrossing two AZs at least and NAT gateways. Then the solution will be deployed into the newly created VPC.
```shell
yarn deploy
```

### Deploy it into existing default VPC
Please make sure your default VPC having both public subnets and private subnets with NAT gateway.
```shell
yarn deploy-to-default-vpc
```

### Deploy it with custom Neptune instance class and replica count

The solution will deploy Neptune cluster with instance class `db.r5.8xlarge` and `1` read replica by default. You can override the instance class and replica count like below,

```shell
npx cdk deploy --parameters NeptuneInstaneType=db.r5.12xlarge -c NeptuneReplicaCount=2 
```

### Deploy it to China regions
Add below context parameters
```
npx cdk deploy -c targetPartition=aws-cn
```

## How to test
```shell
yarn test
```

## FAQ
TBA

[dgl]: https://www.dgl.ai/
[sagemaker]: https://aws.amazon.com/sagemaker/
[ieee-fraud-detection]: https://www.kaggle.com/c/ieee-fraud-detection/
[configure-aws-cli]: https://docs.aws.amazon.com/zh_cn/cli/latest/userguide/cli-chap-configure.html
[aws-cdk]: https://aws.amazon.com/cdk/
[cfn-stack]: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacks.html
[step-functions]: https://aws.amazon.com/step-functions/
