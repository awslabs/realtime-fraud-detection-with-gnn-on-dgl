import sys
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.dynamicframe import DynamicFrame
from awsglue.transforms import DropFields, SelectFields
import pyspark.sql.functions as fc
from io import BytesIO, StringIO
import boto3
from urllib.parse import urlparse
from neptune_python_utils.gremlin_utils import GremlinUtils
from neptune_python_utils.endpoints import Endpoints
from neptune_python_utils.glue_gremlin_client import GlueGremlinClient
from neptune_python_utils.glue_gremlin_csv_transforms import GlueGremlinCsvTransforms

def join_all(dfs, keys):
    if len(dfs) > 1:
        return dfs[0].join(join_all(dfs[1:], keys), on=keys, how='inner')
    else:
        return dfs[0]


dfs = []
combined = []

def get_features_and_labels(transactions_df, transactions_id_cols, transactions_cat_cols):
    # Get features
    non_feature_cols = ['isFraud', 'TransactionDT'] + transactions_id_cols.split(",")
    feature_cols = [col for col in transactions_df.columns if col not in non_feature_cols]
    logger.info(f'transactions_df columns: {transactions_df}')
    logger.info(f'transactions_id_cols columns: {transactions_id_cols}')
    logger.info(f'Feature columns: {feature_cols}')
    logger.info("Categorical columns: {}".format(transactions_cat_cols.split(",")))
    features = transactions_df.select(feature_cols)
    for pivot_col in transactions_cat_cols.split(","):
        pivot_df = features.fillna(0).groupBy(feature_cols).pivot(pivot_col).count().drop('null')
        new_names = pivot_df.columns[:len(feature_cols)] + ["{0}_{1}".format(pivot_col, c) for c in pivot_df.columns[len(feature_cols):]]
        df = pivot_df.toDF(*new_names).fillna(0)
        combined.append(df)

    features = join_all(combined, feature_cols).drop(*non_feature_cols)
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

def dump_df_to_s3(df, objectName, header = True):
    objectKey = f"{args['output_prefix']}{args['JOB_RUN_ID']}/{objectName}"
    logger.info(f'Dumping df to s3 object {objectKey}')
    glueContext.write_dynamic_frame.from_options(
        frame=DynamicFrame.fromDF(df, glueContext, f"{objectName}DF"),
        connection_type="s3",
        connection_options={"path": objectKey},
        format_options={"writeHeader": header},
        format="csv")

def create_catagory_and_relation(name, dataframe, gremlin_client):
    # upsert category vertices
    cateDF = dataframe.select(name).distinct()
    dynamic_df = DynamicFrame.fromDF(cateDF, glueContext, f'{name}DF')
    category_df = GlueGremlinCsvTransforms.create_prefixed_columns(dynamic_df, [('~id', name, name)])
    logger.info(f'Upserting category \'{name}\' as vertices of graph...')
    category_df.toDF().foreachPartition(gremlin_client.upsert_vertices(name, batch_size=100))

    # upsert edge
    logger.info(f'Creating glue dynamic frame from spark dataframe for the relation between transaction and {name}...')
    dynamic_df = DynamicFrame.fromDF(dataframe, glueContext, f'{name}EdgeDF')
    relation = GlueGremlinCsvTransforms.create_prefixed_columns(dynamic_df, [('~from', TRANSACTION_ID, 't'),('~to', name, name)])
    relation = GlueGremlinCsvTransforms.create_edge_id_column(relation, '~from', '~to')
    relation = SelectFields.apply(frame = relation, paths = ["~id", '~from', '~to'], transformation_ctx = f'selection_{name}')
    logger.info(f'Upserting edges between \'{name}\' and transaction...')
    relation.toDF().foreachPartition(gremlin_client.upsert_edges('CATEGORY', batch_size=100))

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

# Creating glue dynamic frame from spark dataframe
features_dynamic_df = DynamicFrame.fromDF(features_df, glueContext, 'FeaturesDF')
features_dynamic_df = GlueGremlinCsvTransforms.create_prefixed_columns(features_dynamic_df, [('~id', TRANSACTION_ID, 't')])
logger.info(f'Upserting transactions as vertices of graph...')
features_dynamic_df.toDF().foreachPartition(gremlin_client.upsert_vertices('Transaction', batch_size=50))
logger.info(f'Creating glue DF from labels dataframe')
labels_dynamic_df = DynamicFrame.fromDF(labels_df, glueContext, 'LabelsDF')
labels_dynamic_df = GlueGremlinCsvTransforms.create_prefixed_columns(labels_dynamic_df, [('~id', TRANSACTION_ID, 't')])
logger.info(f'Upserting transactions with isFraud property...')
labels_dynamic_df.toDF().foreachPartition(gremlin_client.upsert_vertices('Transaction', batch_size=100))

dump_df_to_s3(features_df, 'features')
dump_df_to_s3(labels_df, 'tags')
relational_edges = get_relations_and_edgelist(transactions.toDF(), identities.toDF(), id_cols)
for name, df in relational_edges.items():
    if name != TRANSACTION_ID:
        dump_df_to_s3(df, f'relation_{name}_edgelist')
        create_catagory_and_relation(name, df, gremlin_client)