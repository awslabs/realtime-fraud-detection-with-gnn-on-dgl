import logging
import os
import subprocess
from os import environ
from urllib.parse import urlparse
from pathlib import Path

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CodePackage = environ['CodePackage']
TempFolder = environ['TempFolder'] if 'TempFolder' in environ else '/efs'

def handler(event, context):
    logger.info(f'Receiving event {event}.')
    
    modelS3Url = urlparse(event['ModelArtifact'], allow_fragments=False)
    originModelArtifact = f's3:/{modelS3Url.path}'
    targetModelArtifact = '/'.join([originModelArtifact.rsplit('/', 1)[0], 'model-repackaged.tar.gz'])
    
    args = (originModelArtifact, targetModelArtifact, CodePackage, TempFolder)
    
    repackageCmd=Path(os.path.abspath(__file__)).parent.joinpath('repackage.sh')
    logger.info(f"| {repackageCmd} {' '.join(args)}")
    subprocess.check_call([repackageCmd] + list(args))
    
    return {
        'RepackagedArtifact': targetModelArtifact,
    }