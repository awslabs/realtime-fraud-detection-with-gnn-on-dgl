from os import environ
import logging
import pandas as pd
import awswrangler as wr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

RAW_DATA_URL = environ['DATASET_URL']
TargetBucket = environ['TargetBucket']
TransactionPrefix = environ['TransactionPrefix']
IdentityPrefix = environ['IdentityPrefix']

TRANSACTION_FILE_URL = f'{RAW_DATA_URL}train_transaction.csv'
IDENTITY_FILE_URL = f'{RAW_DATA_URL}train_identity.csv'

def ingestToS3(url, prefix):
    chunks = pd.read_table(url,chunksize=100000,sep=',',header=0)
    for i, chunk in enumerate(chunks):
        targetFilePath = f's3://{TargetBucket}/{prefix}/{i}.parquet'
        logger.info(f'Dumping {len(chunk.index)} records to {targetFilePath}.')
        wr.s3.to_parquet(chunk, targetFilePath)
        
def handler(event, context):
    logger.info(event)

    logger.info(f'Ingest transactions from {TRANSACTION_FILE_URL}')
    ingestToS3(TRANSACTION_FILE_URL, TransactionPrefix)

    logger.info(f'Ingest identities from {IDENTITY_FILE_URL}')
    ingestToS3(IDENTITY_FILE_URL, IdentityPrefix)