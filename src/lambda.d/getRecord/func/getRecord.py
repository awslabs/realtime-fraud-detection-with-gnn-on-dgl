from __future__  import print_function
import boto3
import os
import logging
import asyncio
import functools

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TRANSACTION_FEATURE_GROUP_NAME = os.environ['FEATURE_GROUP_NAME']

region = boto3.Session().region_name
boto_session = boto3.Session(region_name=region)
sagemaker_client = boto_session.client(service_name='sagemaker', region_name=region)
featurestore_runtime = boto_session.client(service_name='sagemaker-featurestore-runtime', region_name=region)

async def runrun():
    loop = asyncio.get_running_loop()
    await asyncio.gather(
        *[loop.run_in_executor(None, functools.partial(featurestore_runtime.get_record, FeatureGroupName=TRANSACTION_FEATURE_GROUP_NAME, RecordIdentifierValueAsString=str(indd))) for indd in range(100)]
    ) 

def handler(event, context):
    loop = asyncio.get_event_loop()
    loop.run_until_complete(runrun())

    return 'done'