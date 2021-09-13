Before you launch the solution, review the supported region, architecture and components in this guide. Follow the step-by-step instructions in this section to configure and deploy the solution into your account.

**Time to deploy**: Approximately 30 minutes

## Deployment overview

The procedure of deploying this architecture on AWS consists of the following steps. For detailed instructions, follow the links for each step.

[Step 1. Launch the stack](#step-1-launch-the-stack)

- Launch the AWS CloudFormation template into your AWS account.
- Review the template parameters, and adjust if necessary.

[Step 2. Launch the pipeline of data processing, model training and deploying](#step-2-launch-the-pipeline-of-data-processing-model-training-and-deploying)

- Start the pipeline of model training and deployment.

[Step 3. simulate the online transactions](#step-3-simulate-the-online-transactions)

- Get the visualization stats result of real-time fraud detection.

## Step 1. Launch the stack

This automated AWS CloudFormation template deploys the solution in the AWS Cloud.

1. Sign in to the AWS Management Console and use one of the buttons below to launch the AWS CloudFormation template.
    - [Launch solution][launch-template]
    - [Launch solution with custom domain of business system][launch-template-with-custom-domain]
    
    Optionally, you can [download the template][template-url] as a starting point for your own implementation.

2. The template launches in the US East (N. Virginia) Region by default. To launch this solution in a different AWS Region, use the Region selector in the console navigation bar.
3. On the **Create stack** page, verify that the correct template URL shows in the **Amazon S3 URL** text box and choose **Next**.
4. On the **Specify stack details** page, assign a valid and account level unique name to your solution stack. This ensures all the resources in the stack remain under the maximum length allowed by CloudFormation. For information about naming character limitations, refer to [IAM and STS Limits][iam-limit] in the `AWS Identity and Access Management User Guide`.
5. Under **Parameters**, review the parameters for the template and modify them as necessary. This solution uses the following default values.

    |      Parameter      |    Default   |                                                      Description                                                      |
    |:-------------------:|:------------:|:--------------------------------------------------------------------------------------------------------------|
    |  NeptuneInstaneType | db.r5.xlarge | Specify the instance size of Neptune, the available value contains, db.r5.xlarge、db.r5.2xlarge、db.r5.4xlarge、db.r5.8xlarge、db.r5.12xlarge |

    Below parameters only are required when deploying the solution with custom domain name of business system.
    
    |      Parameter      |    Default   |                                                      Description                                                      |
    |:-------------------:|:------------:|:--------------------------------------------------------------------------------------------------------------|
    |   DashboardDomain   |              |            Special the custom domain of business system deployed by solution. **Note**: it must be the sub-domain of the domain given by below public zone of R53            |
    | Route53HostedZoneId |              |                                  select the public hosted zone of `Route 53` in account                               |

6. Choose **Next**.
7. On the **Configure stack options** page, choose **Next**.
8. On the **Review** page, review and confirm the settings. Check the box acknowledging that the template will create AWS Identity and Access Management (IAM) resources.
9. Choose **Create stack** to deploy the stack.

You can view the status of the stack in the AWS CloudFormation Console in the **Status** column. You should receive a CREATE_COMPLETE status in approximately thirty minutes.

## Step 2. Launch the pipeline of data processing, model training and deploying

Using AWS Step Functions workflow deployed by the solution processes the transaction data, trains the GNN model and deploys the inference endpoint.

1. Sign in to the AWS Management Console.
2. Go to AWS Step Functions service, choose **State machines**。
3. Choose the name of state machine starting with **ModelTrainingPipeline**, choose **Start execution**, use the default input to start execution.

You can view the **execution status** of details of execution. You should receive a Succeeded status in approximately three hours.

> **Note**：
> The complete execution time of pipeline depends on the instance size of Amazon Neptune, choose `db.r5.8xlarge` or above size，the execution is approximately two hours.

## Step 3. simulate the online transactions

1. Access the business system deployed by the solution. The url of business system can be found in the output of AWS CloudFormation stack. Go to AWS CloudFormation console, choose the stack name starting with `realtime-fraud-detection-with-gnn-on-dgl` or the custom name specified in deployment time, choose **Outputs**, find the key `DashboardWebsiteUrl`, its value is the url of business system that is either the CloudFront domain name or custom domain name.
2. Choose **SIMULATE DATA** button, input the valid parameters of simulation, including the duration(seconds) of simulation, concurrent number and the interval(seconds) between two simuated requests. If using the default parameters, it will use ten concurrent programs to simulate the online transactions five minutes with three seconds interval between two requests. After setting the parameters, choose **SIMULATE** button to start the simulation.
3. It might cost about two minutes to prepare transactions data in simulation backend program, after approximately three minutes, the monitor system will receive the stats of online transactions, including the number of transactions requesting in system, the number of fraudulent transactions in latest five minutes.

[launch-template]: https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=fraud-detection-on-dgl&templateURL=https://aws-gcr-solutions.s3.amazonaws.com/Realtime-fraud-detection-with-gnn-on-dgl-rel/latest/realtime-fraud-detection-with-gnn-on-dgl.template.json
[launch-template-with-custom-domain]: https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=fraud-detection-on-dgl&templateURL=https://aws-gcr-solutions.s3.amazonaws.com/Realtime-fraud-detection-with-gnn-on-dgl-rel/latest/realtime-fraud-detection-with-gnn-on-dgl-with-custom-domain.template.json
[template-url]: https://aws-gcr-solutions.s3.amazonaws.com/fraud-detection-on-dgl/latest/realtime-fraud-detection-with-gnn-on-dgl.template.json
[iam-limit]: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html