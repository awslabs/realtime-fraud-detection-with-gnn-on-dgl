import sys
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.dynamicframe import DynamicFrame
from awsglue.transforms import DropFields, SelectFields
from io import BytesIO, StringIO
import pandas as pd
import numpy as np
import boto3
from urllib.parse import urlparse
from neptune_python_utils.gremlin_utils import GremlinUtils
from neptune_python_utils.endpoints import Endpoints
from neptune_python_utils.glue_gremlin_client import GlueGremlinClient
from neptune_python_utils.glue_gremlin_csv_transforms import GlueGremlinCsvTransforms

# TODO: use glue transform and spark ml instead of pandas
def get_features_and_labels(transactions_df, transactions_id_cols, transactions_cat_cols):
    # Get features
    non_feature_cols = ['isFraud', 'TransactionDT'] + transactions_id_cols.split(",")
    feature_cols = [col for col in transactions_df.columns if col not in non_feature_cols]
    logger.info(f'Feature columns: {feature_cols}')
    logger.info("Categorical columns: {}".format(transactions_cat_cols.split(",")))
    features = pd.get_dummies(transactions_df[feature_cols], columns=transactions_cat_cols.split(",")).fillna(0)
    features['TransactionAmt'] = features['TransactionAmt'].apply(np.log10)
    logger.info("Transformed feature columns: {}".format(list(features.columns)))
    logger.info("Shape of features: {}".format(features.shape))
    # Get labels
    labels = transactions_df[[TRANSACTION_ID, 'isFraud']]
    logger.info("Transformed label columns: {}".format(list(labels.columns)))
    logger.info("Shape of label: {}".format(labels.shape))
    
    return features, labels


def get_relations_and_edgelist(transactions_df, identity_df, transactions_id_cols):
    # Get relations
    edge_types = transactions_id_cols.split(",") + list(identity_df.columns)
    logger.info("Found the following distinct relation types: {}".format(edge_types))
    new_id_cols = [TRANSACTION_ID] + transactions_id_cols.split(",")
    full_identity_df = transactions_df[new_id_cols].merge(identity_df, on=TRANSACTION_ID, how='left')
    logger.info("Shape of identity columns: {}".format(full_identity_df.shape))

    # extract edges
    edges = {}
    for etype in edge_types:
        edgelist = full_identity_df[[TRANSACTION_ID, etype]].dropna()
        edges[etype] = edgelist
    return edges

#TODO: for dev purpose only, will be removed
def dump_df_to_s3(df, objectName, header = True):
    objectKey = f"{args['output_prefix']}{objectName}.csv"
    logger.info(f'Dumping df to s3 object {objectKey}')
    stream = StringIO()
    df.to_csv(stream, index=False, header=header)
    s3Url = urlparse(objectKey, allow_fragments=False)
    object = s3.Object(s3Url.netloc, s3Url.path.lstrip('/'))
    object.put(Body=BytesIO(stream.getvalue().encode()))
    
def create_catagory_and_relation(name, dataframe, gremlin_client):
    # upsert category vertices
    cateDF = pd.DataFrame(dataframe[name].unique(), columns=[name])
    spark_df = spark.createDataFrame(cateDF)
    dynamic_df = DynamicFrame.fromDF(spark_df, glueContext, f'{name}DF')
    category_df = GlueGremlinCsvTransforms.create_prefixed_columns(dynamic_df, [('~id', name, name)])
    logger.info(f'Upserting category \'{name}\' as vertices of graph...')
    category_df.toDF().foreachPartition(gremlin_client.upsert_vertices(name, batch_size=100))

    # upsert edge
    spark_df = spark.createDataFrame(dataframe)
    logger.info(f'Creating glue dynamic frame from spark dataframe for the relation between transaction and {name}...')
    dynamic_df = DynamicFrame.fromDF(spark_df, glueContext, f'{name}EdgeDF')
    relation = GlueGremlinCsvTransforms.create_prefixed_columns(dynamic_df, [('~from', TRANSACTION_ID, 't'),('~to', name, name)])
    relation = GlueGremlinCsvTransforms.create_edge_id_column(relation, '~from', '~to')
    relation = SelectFields.apply(frame = relation, paths = ["~id", '~from', '~to'], transformation_ctx = f'selection_{name}')
    logger.info(f'Upserting edges between \'{name}\' and transaction...')
    relation.toDF().foreachPartition(gremlin_client.upsert_edges('CATEGORY', batch_size=100))

sc = SparkContext.getOrCreate()
sc.setLogLevel("INFO")
glueContext = GlueContext(sc)
logger = glueContext.get_logger()

logger.info(f'Before resolving options...')

args = getResolvedOptions(sys.argv,
                          ['database',
                           'transaction_table',
                           'identity_table',
                           'id_cols',
                           'cat_cols',
                           'output_prefix',
                           'region',
                           'neptune_endpoint',
                           'neptune_port'])

logger.info(f'Resolved options are: {args}')

GremlinUtils.init_statics(globals())
endpoints = Endpoints(neptune_endpoint=args['neptune_endpoint'], neptune_port=args['neptune_port'], region_name=args['region'])
logger.info(f'Initializing gremlin client to Neptune ${endpoints.gremlin_endpoint()}.')
gremlin_client = GlueGremlinClient(endpoints)

TRANSACTION_ID = 'TransactionID'

transactions = glueContext.create_dynamic_frame.from_catalog(database=args['database'], table_name=args['transaction_table'])
identities = glueContext.create_dynamic_frame.from_catalog(database=args['database'], table_name=args['identity_table'])

s3 = boto3.resource('s3', region_name=args['region'])

transaction_df = transactions.toDF().toPandas()

train_data_ratio = 0.8
# extract out transactions for test/validation
n_train = int(transaction_df.shape[0]*train_data_ratio)
test_ids = transaction_df[TRANSACTION_ID].values[n_train:]
get_fraud_frac = lambda series: 100 * sum(series)/len(series)
logger.info("Percent fraud for train transactions: {}".format(get_fraud_frac(transaction_df.isFraud[:n_train])))
logger.info("Percent fraud for test transactions: {}".format(get_fraud_frac(transaction_df.isFraud[n_train:])))
logger.info("Percent fraud for all transactions: {}".format(get_fraud_frac(transaction_df.isFraud)))
dump_df_to_s3(pd.DataFrame(test_ids), 'test', header=False)

id_cols = args['id_cols']
cat_cols = args['cat_cols']
features_df, labels_df = get_features_and_labels(transaction_df, id_cols, cat_cols)

spark = glueContext.spark_session

spark_dataframe = spark.createDataFrame(features_df)
logger.info(f'Creating glue dynamic frame from spark dataframe...')
features_dynamic_df = DynamicFrame.fromDF(spark_dataframe, glueContext, 'FeaturesDF')
features_dynamic_df = GlueGremlinCsvTransforms.create_prefixed_columns(features_dynamic_df, [('~id', TRANSACTION_ID, 't')])
logger.info(f'Upserting transactions as vertices of graph...')
features_dynamic_df.toDF().foreachPartition(gremlin_client.upsert_vertices('Transaction', batch_size=50))
logger.info(f'Creating glue DF from labels dataframe')
spark_dataframe_labels = spark.createDataFrame(labels_df)
labels_dynamic_df = DynamicFrame.fromDF(spark_dataframe_labels, glueContext, 'LabelsDF')
labels_dynamic_df = GlueGremlinCsvTransforms.create_prefixed_columns(labels_dynamic_df, [('~id', TRANSACTION_ID, 't')])
logger.info(f'Upserting transactions with isFraud property...')
labels_dynamic_df.toDF().foreachPartition(gremlin_client.upsert_vertices('Transaction', batch_size=100))

dump_df_to_s3(features_df, 'features')
dump_df_to_s3(labels_df, 'tags')
relational_edges = get_relations_and_edgelist(transaction_df, identities.toDF().toPandas(), id_cols)
for name, df in relational_edges.items():
    if name != TRANSACTION_ID:
        dump_df_to_s3(df, f'relation_{name}_edgelist')
        create_catagory_and_relation(name, df, gremlin_client)