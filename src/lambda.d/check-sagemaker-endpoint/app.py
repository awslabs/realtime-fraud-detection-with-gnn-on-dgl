import logging
import botocore
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sagemaker_client = boto3.client('sagemaker')

def handler(event, context):
    logger.info(f'Receiving event {event}.')
    
    try:
        response = sagemaker_client.describe_endpoint(
            EndpointName=event['EndpointName']
        )
        return {
            'Endpoint': {
                event['EndpointName']: True,
            }
        }
    except botocore.exceptions.ClientError as err:
        if err.response['Error']['Code'] == 'ValidationException' and 'Could not find endpoint' in err.response['Error']['Message']:
            logger.info(f'Endpoint with name "{event["EndpointName"]}" does not exist.')
            return {
                'Endpoint': {
                    event['EndpointName']: False,
                }
            }
        logger.error(f'Exception is {err}.')
        raise err