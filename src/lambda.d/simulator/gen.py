from os import environ
import logging
import awswrangler as wr
import numpy as np
import pandas as pd
import time
import boto3
import json
import random

logger = logging.getLogger()
logger.setLevel(logging.INFO)

inference = boto3.client('lambda')

RAW_DATA_URL = environ['DATASET_URL']
INFERENCE_ARN = environ['INFERENCE_ARN']

TRANSACTION_FILE_URL = f'{RAW_DATA_URL}test_transaction.csv'
IDENTITY_FILE_URL = f'{RAW_DATA_URL}test_identity.csv'

class NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.int_, np.intc, np.intp, np.int8,
                            np.int16, np.int32, np.int64, np.uint8,
                            np.uint16, np.uint32, np.uint64)):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        else:
            return super(NpEncoder, self).default(obj)

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
        if int(time.time() - start) >= int(event['duration']):
            logger.info(f'The simulation will be interruptted after exceeding the specified duration {event["duration"]} seconds.')
            break
        
        sample_tran_DF = tranDF.sample()

        sample_id_DF = idDF.loc[idDF['TransactionID'] == sample_tran_DF['TransactionID'].values[0]]
        
        sample_id_DF.columns = [x.replace('-','_') if '-' in x else x for x in sample_id_DF.columns]

        sample_tran_DF = sample_tran_DF.fillna(0)
        sample_id_DF = sample_id_DF.fillna(0)

        sample_tran_DF = sample_tran_DF.to_dict('records')
        sample_id_DF = sample_id_DF.to_dict('records')
        inference_input_event = {
            'transaction_data':sample_tran_DF,
            'identity_data':sample_id_DF
        }

        logger.info(f'Send event {inference_input_event} to inference.')

        inference_response = inference.invoke(FunctionName=INFERENCE_ARN,
                                                InvocationType='RequestResponse',
                                                Payload=json.dumps(inference_input_event, cls=NpEncoder))

        inference_result = inference_response["Payload"].read().decode()
        
        logger.info(f'Get result {inference_result} from inference.')
        
        time.sleep(event['interval'] / 1000)
    
    logger.info(f'Completed the simulating event {event}.')
    