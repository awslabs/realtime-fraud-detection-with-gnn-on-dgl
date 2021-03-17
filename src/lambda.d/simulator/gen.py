from os import environ
import logging
import awswrangler as wr
import pandas as pd
import time
import boto3
import json
import random

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sqs = boto3.client('sqs')

QUEUE_URL = environ['QUEUE_URL']
RAW_DATA_URL = environ['DATASET_URL']

TRANSACTION_FILE_URL = f'{RAW_DATA_URL}test_transaction.csv'
IDENTITY_FILE_URL = f'{RAW_DATA_URL}test_identity.csv'

def getValue(value):
    return None if pd.isna(value) else (value if isinstance(value, str) else value.item())

def handler(event, context):
    start = time.time()
    logger.info(f'Receiving simulating event {event}.')
    
    tranDF = pd.read_table(TRANSACTION_FILE_URL, skiprows=range(1, 3000*random.randint(0,150)), nrows=3000, sep=',', header=0)
    idDF = pd.read_table(IDENTITY_FILE_URL, sep=',', header=0)
    
    logger.info(f'Loaded test dataset from {TRANSACTION_FILE_URL} and {IDENTITY_FILE_URL}.')
    
    mergedDF = pd.merge(tranDF, idDF, on='TransactionID', how='left')
    
    while True:
        if (time.time() - start) >= int(event['duration']) * 1000:
            logger.info(f'The simulation will be interruptted after exceeding the specified duration {event["duration"]} seconds.')
            break
        
        sampleDF = mergedDF.sample()
        
        sampleData = sampleDF.iloc[0]

        # TODO: replace by send request to real-time inference endpoint        
        data = {
                    'timestamp': int(time.time()),
                    'isFraud': random.randint(0, 1000) < 33,
                    'id': sampleData['TransactionID'].item(),
                    'amount': sampleData['TransactionAmt'].item(),
                    'productCD': getValue(sampleData['ProductCD']),
                    'card1': getValue(sampleData['card1']),
                    'card2': getValue(sampleData['card2']),
                    'card3': getValue(sampleData['card3']),
                    'card4': getValue(sampleData['card4']),
                    'card5': getValue(sampleData['card5']),
                    'card6': getValue(sampleData['card6']),
                    'addr1': getValue(sampleData['addr1']),
                    'addr2': getValue(sampleData['addr2']),
                    'dist1': getValue(sampleData['dist1']),
                    'dist2': getValue(sampleData['dist2']),
                    'pEmaildomain': getValue(sampleData['P_emaildomain']),
                    'rEmaildomain': getValue(sampleData['R_emaildomain']),
                }
        logger.info(f'Send transaction {data} to queue.')
        response = sqs.send_message(
            QueueUrl=QUEUE_URL,
            DelaySeconds=0,
            MessageBody=json.dumps(data),
            MessageGroupId=context.aws_request_id,
        )
        
        logger.info(f'Trascation is sent with response message {response}.')
        time.sleep(event['interval'] / 1000)
    
    logger.info(f'Completed the simulating event {event}.')
    