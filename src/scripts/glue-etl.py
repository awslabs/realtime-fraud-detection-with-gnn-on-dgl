import sys

from pandas.core.frame import DataFrame
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from pyspark.sql.functions import concat_ws, to_json, struct
from awsglue.context import GlueContext
from awsglue.dynamicframe import DynamicFrame
from awsglue.transforms import DropFields, SelectFields
import pyspark.sql.functions as fc
from io import BytesIO, StringIO
import boto3
from urllib.parse import urlparse
from neptune_python_utils.glue_gremlin_csv_transforms import GlueGremlinCsvTransforms
import databricks.koalas as ks

def join_all(dfs, keys):
    if len(dfs) > 1:
        return dfs[0].join(join_all(dfs[1:], keys), on=keys, how='inner')
    else:
        return dfs[0]

def get_features_and_labels(transactions_df, transactions_id_cols, transactions_cat_cols):
    # Get features
    non_feature_cols = ['isFraud', 'TransactionDT'] + transactions_id_cols.split(",")
    feature_cols = [col for col in transactions_df.columns if col not in non_feature_cols]
    logger.info(f'transactions_df columns: {transactions_df}')
    logger.info(f'transactions_id_cols columns: {transactions_id_cols}')
    logger.info(f'Feature columns: {feature_cols}')
    logger.info("Categorical columns: {}".format(transactions_cat_cols.split(",")))
    features = transactions_df.select(feature_cols)
    
    kdf_features = features.to_koalas()
    kdf_features = ks.get_dummies(kdf_features, columns = transactions_cat_cols.split(",")).fillna(0)
    
    features = kdf_features.to_spark()
    features = features.withColumn('TransactionAmt', fc.log10(fc.col('TransactionAmt')))
    logger.info("Transformed feature columns: {}".format(list(features.columns)))
    logger.info("Transformed feature count: {}".format(features.count()))
    # Get labels
    labels = transactions_df.select('TransactionID', 'isFraud')
    logger.info("Transformed label columns: {}".format(list(labels.columns)))
    logger.info("Shape of label: {}".format(labels.count()))

    return features, labels


def get_relations_and_edgelist(transactions_df, identity_df, transactions_id_cols):
    # Get relations
    edge_types = transactions_id_cols.split(",") + list(identity_df.columns)
    logger.info("Found the following distinct relation types: {}".format(edge_types))
    new_id_cols = [TRANSACTION_ID] + transactions_id_cols.split(",")
    full_identity_df = transactions_df.select(new_id_cols).join(identity_df, on=TRANSACTION_ID, how='left')
    logger.info("Shape of identity columns: {}".format(full_identity_df.columns))

    # extract edges
    edges = {}
    for etype in edge_types:
        edgelist = full_identity_df[[TRANSACTION_ID, etype]].dropna()
        edges[etype] = edgelist
    return edges

def dump_df_to_s3(df, objectName, header = True, graph = False):
    if graph == False:
        objectKey = f"{args['output_prefix']}{args['JOB_RUN_ID']}/{objectName}"
        logger.info(f'Dumping edge "{objectName}"" to bucekt prefix {objectKey}')
    else:
        objectKey = f"{args['output_prefix']}{args['JOB_RUN_ID']}/graph/{objectName}"
        logger.info(f'Dumping edge "{objectName}" as graph to bucket prefix {objectKey}')
    glueContext.write_dynamic_frame.from_options(
        frame=DynamicFrame.fromDF(df, glueContext, f"{objectName}DF"),
        connection_type="s3",
        connection_options={"path": objectKey},
        format_options={"writeHeader": header},
        format="csv")

def dump_edge_as_graph(name, dataframe):
    # upsert edge
    logger.info(f'Creating glue dynamic frame from spark dataframe for the relation between transaction and {name}...')
    dynamic_df = DynamicFrame.fromDF(dataframe, glueContext, f'{name}EdgeDF')
    relation = GlueGremlinCsvTransforms.create_prefixed_columns(dynamic_df, [('~from', TRANSACTION_ID, 't'),('~to', name, name)])
    relation = GlueGremlinCsvTransforms.create_edge_id_column(relation, '~from', '~to')
    relation = GlueGremlinCsvTransforms.addLabel(relation,'CATEGORY')
    relation = SelectFields.apply(frame = relation, paths = ["~id",'~label', '~from', '~to'], transformation_ctx = f'selection_{name}')
    logger.info(f'Upserting edges between \'{name}\' and transaction...')
    dump_df_to_s3(relation.toDF(), f'relation_{name}_edgelist', graph = True)

def sum_col(df, col):
    return df.select(fc.sum(col)).collect()[0][0]

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
                           'region'])

logger.info(f'Resolved options are: {args}')

TRANSACTION_ID = 'TransactionID'

transactions = glueContext.create_dynamic_frame.from_catalog(database=args['database'], table_name=args['transaction_table'])
identities = glueContext.create_dynamic_frame.from_catalog(database=args['database'], table_name=args['identity_table'])

s3 = boto3.resource('s3', region_name=args['region'])

train_data_ratio = 0.8
# extract out transactions for test/validation
n_train = int(transactions.count()*train_data_ratio)
test_ids = transactions.select_fields(TRANSACTION_ID)
get_fraud_frac = lambda series: 100 * sum(series)/len(series)
isfraud_df: DynamicFrame = transactions.select_fields("isFraud")
logger.info("Percent fraud for train transactions: {}".format(sum_col(transactions.toDF(), "isFraud")))
dump_df_to_s3(test_ids.toDF(), 'test', header=False)

id_cols = args['id_cols']
cat_cols = args['cat_cols']
features_df, labels_df = get_features_and_labels(transactions.toDF(), id_cols, cat_cols)

logger.info(f'Dumping features and labels for training...')
dump_df_to_s3(features_df, 'features')
dump_df_to_s3(labels_df, 'tags')

featurs_graph_df = features_df.withColumn('props_values:String', to_json(struct(list(filter(lambda x: (x != TRANSACTION_ID), features_df.schema.names)))))
featurs_graph_df = featurs_graph_df.select('TransactionID','props_values:String')

logger.info(f'Creating glue dynamic frame from spark dataframe...')
features_graph_dynamic_df = DynamicFrame.fromDF(featurs_graph_df, glueContext, 'FeaturesDF')
features_graph_dynamic_df = GlueGremlinCsvTransforms.create_prefixed_columns(features_graph_dynamic_df, [('~id', TRANSACTION_ID, 't')])
features_graph_dynamic_df = GlueGremlinCsvTransforms.addLabel(features_graph_dynamic_df,'Transaction')
features_graph_dynamic_df = SelectFields.apply(frame = features_graph_dynamic_df, paths = ["~id",'~label', 'props_values:String'])
logger.info(f'Dumping transaction data as graph data...')
dump_df_to_s3(features_graph_dynamic_df.toDF(), f'transaction', graph = True)

relational_edges = get_relations_and_edgelist(transactions.toDF(), identities.toDF(), id_cols)
for name, df in relational_edges.items():
    if name != TRANSACTION_ID:
        logger.info(f'Dumping edge {name} for training...')
        dump_df_to_s3(df, f'relation_{name}_edgelist')
        logger.info(f'Dumping edge {name} as graph data...')
        dump_edge_as_graph(name, df)