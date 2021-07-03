import logging
import os
import subprocess
from os import environ
from urllib.parse import urlparse
from pathlib import Path
import argparse
from neptune_python_utils.endpoints import Endpoints
from neptune_python_utils.bulkload import BulkLoad

logger = logging.getLogger()
logger.setLevel(logging.INFO)

parser = argparse.ArgumentParser(description='Bulk load properties of vertices into Neptune.')
parser.add_argument('--data_prefix', help='s3 object prefix for uploading graph data')
parser.add_argument('--temp_folder', help='temp folder for processing the data')
parser.add_argument('--neptune_endpoint', help='neptune endpoint')
parser.add_argument('--neptune_port', help='neptune port')
parser.add_argument('--region', help='the region of neptune is running')
parser.add_argument('--neptune_iam_role_arn', help='arn of iam role of Neptune for loading data')

args = parser.parse_args()

modelS3Url = urlparse(environ['MODEL_PACKAGE'], allow_fragments=False)
originModelArtifact = f's3:/{modelS3Url.path}'
targetDataPath = f"{args.data_prefix}/{environ['JOB_NAME']}"
tempFolder = args.temp_folder

dataArgs = (originModelArtifact, targetDataPath, tempFolder)

prepareDataCmd=Path(os.path.abspath(__file__)).parent.joinpath('prepare-data.sh')
logger.info(f"| {prepareDataCmd} {' '.join(dataArgs)}")
subprocess.check_call([prepareDataCmd] + list(dataArgs))

endpoints = Endpoints(neptune_endpoint=args.neptune_endpoint, neptune_port=args.neptune_port, region_name=args.region)

bulkload = BulkLoad(
        source=targetDataPath,
        endpoints=endpoints,
        role=args.neptune_iam_role_arn,
        region=args.region,
        update_single_cardinality_properties=True)
        
load_status = bulkload.load_async()
logger.info('Bulk load request is submmitted.')

status, json = load_status.status(details=True, errors=True)
logger.info(f"Bulk load status is {json}...")

load_status.wait()
logger.info('Bulk load request is completed.')

bulkload_2 = BulkLoad(
        source=args.data_prefix,
        endpoints=endpoints,
        role=args.neptune_iam_role_arn,
        region=args.region,
        update_single_cardinality_properties=True)
        
load_status_2 = bulkload_2.load_async()
logger.info('Bulk load request is submmitted.')

status, json = load_status_2.status(details=True, errors=True)
logger.info(f"Bulk load status is {json}...")

load_status_2.wait()
logger.info('Bulk load request is completed.')