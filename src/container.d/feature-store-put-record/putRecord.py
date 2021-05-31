from __future__  import print_function
import boto3
import os
import numpy as np
import pandas as pd
from datetime import datetime as dt
import time
import logging
import sagemaker
from sagemaker.session import Session
from sagemaker import get_execution_role
from sagemaker.feature_store.feature_group import FeatureGroup
# import awswrangler as wr

logger = logging.getLogger()
logger.setLevel(logging.INFO)


RAW_DATA_URL = os.environ['DATASET_URL']
TRANSACTION_FILE_URL = f'{RAW_DATA_URL}train_transaction.csv'

TRANSACTION_FEATURE_GROUP_NAME = os.environ['FEATURE_GROUP_NAME']
# S3_BUCKET_NAME = os.environ['S3_BUCKET_NAME']
transactions_cat_cols = os.environ['TRANSACTION_CAT_COLS']


tranDF = pd.read_table(TRANSACTION_FILE_URL, sep=',', header=0)
tranDF = tranDF.fillna(0)
        
logger.info(f'Loaded train dataset from {TRANSACTION_FILE_URL}.')
    

region = boto3.Session().region_name

boto_session = boto3.Session(region_name=region)

sagemaker_client = boto_session.client(service_name='sagemaker', region_name=region)
featurestore_runtime = boto_session.client(service_name='sagemaker-featurestore-runtime', region_name=region)

feature_store_session = Session(
    boto_session=boto_session,
    sagemaker_client=sagemaker_client,
    sagemaker_featurestore_runtime_client=featurestore_runtime
)

# default_s3_bucket_name = S3_BUCKET_NAME  # feature_store_session.default_bucket()
# prefix = 'sagemaker-featurestore-demo'
# logger.info(default_s3_bucket_name)

# You can modify the following to use a role of your choosing. See the documentation for how to create this.
# role = get_execution_role()
# print (role)

transaction_feature_group = FeatureGroup(name=TRANSACTION_FEATURE_GROUP_NAME, sagemaker_session=feature_store_session)

current_time_sec = int(round(time.time()))

def cast_object_to_string(data_frame):
    for label in data_frame.columns:
        if data_frame.dtypes[label] == 'object':
            data_frame[label] = data_frame[label].astype("str").astype("string")

cols = ['TransactionID','TransactionAmt','dist1','dist2','C1','C2','C3','C4','C5','C6','C7','C8','C9',
'C10','C11','C12','C13','C14','D1','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12','D13','D14',
'D15','V1','V2','V3','V4','V5','V6','V7','V8','V9','V10','V11','V12','V13','V14','V15','V16','V17','V18',
'V19','V20','V21','V22','V23','V24','V25','V26','V27','V28','V29','V30','V31','V32','V33','V34','V35',
'V36','V37','V38','V39','V40','V41','V42','V43','V44','V45','V46','V47','V48','V49','V50','V51','V52',
'V53','V54','V55','V56','V57','V58','V59','V60','V61','V62','V63','V64','V65','V66','V67','V68','V69',
'V70','V71','V72','V73','V74','V75','V76','V77','V78','V79','V80','V81','V82','V83','V84','V85','V86',
'V87','V88','V89','V90','V91','V92','V93','V94','V95','V96','V97','V98','V99','V100','V101','V102',
'V103','V104','V105','V106','V107','V108','V109','V110','V111','V112','V113','V114','V115','V116',
'V117','V118','V119','V120','V121','V122','V123','V124','V125','V126','V127','V128','V129','V130',
'V131','V132','V133','V134','V135','V136','V137','V138','V139','V140','V141','V142','V143','V144',
'V145','V146','V147','V148','V149','V150','V151','V152','V153','V154','V155','V156','V157','V158',
'V159','V160','V161','V162','V163','V164','V165','V166','V167','V168','V169','V170','V171','V172',
'V173','V174','V175','V176','V177','V178','V179','V180','V181','V182','V183','V184','V185','V186',
'V187','V188','V189','V190','V191','V192','V193','V194','V195','V196','V197','V198','V199','V200',
'V201','V202','V203','V204','V205','V206','V207','V208','V209','V210','V211','V212','V213','V214',
'V215','V216','V217','V218','V219','V220','V221','V222','V223','V224','V225','V226','V227','V228',
'V229','V230','V231','V232','V233','V234','V235','V236','V237','V238','V239','V240','V241','V242',
'V243','V244','V245','V246','V247','V248','V249','V250','V251','V252','V253','V254','V255','V256',
'V257','V258','V259','V260','V261','V262','V263','V264','V265','V266','V267','V268','V269','V270',
'V271','V272','V273','V274','V275','V276','V277','V278','V279','V280','V281','V282','V283','V284',
'V285','V286','V287','V288','V289','V290','V291','V292','V293','V294','V295','V296','V297','V298',
'V299','V300','V301','V302','V303','V304','V305','V306','V307','V308','V309','V310','V311','V312',
'V313','V314','V315','V316','V317','V318','V319','V320','V321','V322','V323','V324','V325','V326',
'V327','V328','V329','V330','V331','V332','V333','V334','V335','V336','V337','V338','V339','M1_F',
'M1_T','M2_F','M2_T','M3_F','M3_T','M4_M0','M4_M1','M4_M2','M5_F','M5_T','M6_F','M6_T','M7_F','M7_T',
'M8_F','M8_T','M9_F','M9_T']


# record identifier and event time feature names
record_identifier_feature_name = "TransactionID"
event_time_feature_name = "EventTime"

# # tranDF
# dummied_col = DUMMIED_COL.split(',')
# for dummy in dummied_col:
#     col_name = dummy[:2]
#     tranDF[dummy] = 0.0
#     tranDF.loc[tranDF[col_name] == dummy[3:], dummy] = 1.0
tranDF = pd.get_dummies(tranDF, columns=transactions_cat_cols.split(",")).fillna(0)

transformed_transaction_data = tranDF[cols]

# cast object dtype to string. The SageMaker FeatureStore Python SDK will then map the string dtype to String feature type.
cast_object_to_string(transformed_transaction_data)

# append EventTime feature
transformed_transaction_data[event_time_feature_name] = pd.Series([current_time_sec]*len(transformed_transaction_data), dtype="float64")

# load feature definitions to the feature group. SageMaker FeatureStore Python SDK will auto-detect the data schema based on input data.
transaction_feature_group.load_feature_definitions(data_frame=transformed_transaction_data); # output is suppressed

def wait_for_feature_group_creation_complete(feature_group):
    status = feature_group.describe().get("FeatureGroupStatus")
    while status == "Creating":
        print("Waiting for Feature Group Creation")
        time.sleep(5)
        status = feature_group.describe().get("FeatureGroupStatus")
    if status != "Created":
        raise RuntimeError(f"Failed to create feature group {feature_group.name}")
    print(f"FeatureGroup {feature_group.name} successfully created.")


def handler(event, context):

    
    wait_for_feature_group_creation_complete(feature_group=transaction_feature_group)

    transaction_feature_group.ingest(data_frame=transformed_transaction_data, max_workers=5, wait=True)

    logger.info(transaction_feature_group)

    return 'done'