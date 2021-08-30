To uninstall the **Real-time Fraud Detection with Graph Neural Network on DGL** solution, delete the AWS CloudFormation stack. This will delete all the resources created by the template except the S3 buckets starting with `realtime-fraud-detection-frauddetectiondatabucket` and `realtime-fraud-detection-bucketaccesslog`. These two buckets will be retained when the solution stack is deleted in order to help prevent accidental data loss. You can use either the AWS Management Console or the AWS Command Line Interface (AWS CLI) to empty, then delete those S3 buckets after deleting the CloudFormation stack.

### Using the AWS Management Console

1. Sign in to the [AWS CloudFormation][cloudformation-console] console.
1. Select this solution’s installation parent stack, the default is `realtime-fraud-detection-with-gnn-on-dgl`.
1. Choose **Delete**.

### Using AWS Command Line Interface

Determine whether the AWS Command Line Interface (AWS CLI) is available in your environment. For installation instructions, refer to [What Is the AWS Command Line Interface][aws-cli] in the *AWS CLI User Guide*. After confirming that the AWS CLI is available, run the following command.

```bash
aws cloudformation delete-stack --stack-name <installation-stack-name> --region <aws-region>
```

### Deleting the Amazon S3 buckets

Real-time Fraud Detection with Graph Neural Network on DGL solution creates two S3 buckets that are not automatically deleted. To delete these buckets, use the steps below.

1. Sign in to the [Amazon S3][s3-console] console.
1. Select the bucket name starting with `realtime-fraud-detection-frauddetectiondatabucket`.
1. Choose **Empty**.
1. Choose **Delete**.
1. Select the bucket name starting with `realtime-fraud-detection-bucketaccesslog`.
1. Choose **Empty**.
1. Choose **Delete**.

To delete the S3 bucket using AWS CLI, run the following command:

```bash
aws s3 rb s3://<bucket-name> --force
```

[cloudformation-console]: https://console.aws.amazon.com/cloudformation/home
[aws-cli]: https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html
[s3-console]: https://console.aws.amazon.com/s3/