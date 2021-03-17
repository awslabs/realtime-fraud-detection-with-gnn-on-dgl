import json
import os
import boto3
import sagemaker
from pathlib import Path


def get_current_folder(global_variables):
    # if calling from a file
    if "__file__" in global_variables:
        current_file = Path(global_variables["__file__"])
        current_folder = current_file.parent.resolve()
    # if calling from a notebook
    else:
        current_folder = Path(os.getcwd())
    return current_folder

region = boto3.session.Session().region_name
account_id = boto3.client('sts').get_caller_identity().get('Account')
default_bucket = sagemaker.session.Session(boto3.session.Session()).default_bucket()
default_role = sagemaker.get_execution_role()

cfn_stack_outputs = {}
current_folder = get_current_folder(globals())
cfn_stack_outputs_filepath = Path(current_folder, '../stack_outputs.json').resolve()

if os.path.exists(cfn_stack_outputs_filepath):
    with open(cfn_stack_outputs_filepath) as f:
        cfn_stack_outputs = json.load(f)

aws_account = cfn_stack_outputs.get('AccountID', account_id)
region_name = cfn_stack_outputs.get('AWSRegion', region)

solution_prefix = cfn_stack_outputs.get('SolutionPrefix', 'sagemaker-soln-graph-fraud')
solution_bucket = cfn_stack_outputs.get('SolutionS3Bucket', default_bucket)

s3_data_prefix = cfn_stack_outputs.get('S3InputDataPrefix', 'raw-data')
s3_processing_output = cfn_stack_outputs.get('S3ProcessingJobOutputPrefix', 'processed-data')
s3_train_output = cfn_stack_outputs.get('S3TrainingJobOutputPrefix', 'training-output')

ecr_repository = cfn_stack_outputs.get('SageMakerProcessingJobContainerName', 'sagemaker-soln-graph-fraud-preprocessing')
container_build_project = cfn_stack_outputs.get('SageMakerProcessingJobContainerBuild', 'local')

role = cfn_stack_outputs.get('IamRole', default_role)