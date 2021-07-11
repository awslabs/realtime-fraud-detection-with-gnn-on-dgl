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
from neptune_python_utils.gremlin_utils import GremlinUtils
from neptune_python_utils.endpoints import Endpoints
from neptune_python_utils.glue_gremlin_client import GlueGremlinClient
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

def dump_df_to_s3(df, objectName, header = True, bulk_load = False):
    if bulk_load == False:
        objectKey = f"{args['output_prefix']}{args['JOB_RUN_ID']}/{objectName}"
        logger.info(f'[Process-Data]Dumping df to s3 object {objectKey}')
    else:
        objectKey = f"{args['bulk_load_prefix']}/{objectName}.csv"
        logger.info(f'[Pre Bulk Load] Dumping df to s3 object {objectKey}')
    glueContext.write_dynamic_frame.from_options(
        frame=DynamicFrame.fromDF(df, glueContext, f"{objectName}DF"),
        connection_type="s3",
        connection_options={"path": objectKey},
        format_options={"writeHeader": header},
        format="csv")

def create_catagory_and_relation(name, dataframe, gremlin_client):
    # upsert category vertices
    # cateDF = dataframe.select(name).distinct()
    # dynamic_df = DynamicFrame.fromDF(cateDF, glueContext, f'{name}DF')
    # category_df = GlueGremlinCsvTransforms.create_prefixed_columns(dynamic_df, [('~id', name, name)])
    # logger.info(f'Upserting category \'{name}\' as vertices of graph...')
    # category_df.toDF().foreachPartition(gremlin_client.upsert_vertices(name, batch_size=100))

    # upsert edge
    logger.info(f'Creating glue dynamic frame from spark dataframe for the relation between transaction and {name}...')
    dynamic_df = DynamicFrame.fromDF(dataframe, glueContext, f'{name}EdgeDF')
    relation = GlueGremlinCsvTransforms.create_prefixed_columns(dynamic_df, [('~from', TRANSACTION_ID, 't'),('~to', name, name)])
    relation = GlueGremlinCsvTransforms.create_edge_id_column(relation, '~from', '~to')
    relation = GlueGremlinCsvTransforms.addLabel(relation,'CATEGORY')
    relation = SelectFields.apply(frame = relation, paths = ["~id",'~label', '~from', '~to'], transformation_ctx = f'selection_{name}')
    logger.info(f'Upserting edges between \'{name}\' and transaction...')
    # relation = relation.toDF().toPandas()
    dump_df_to_s3(relation.toDF(), f'relation_{name}_edgelist', bulk_load = True)
    # relation.toDF().foreachPartition(gremlin_client.upsert_edges('CATEGORY', batch_size=100))

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
                           'bulk_load_prefix',
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

# spark = glueContext.spark_session

# Creating glue dynamic frame from spark dataframe
# spark_dataframe = spark.createDataFrame(features_df)
spark_dataframe = features_df
spark_dataframe = spark_dataframe.withColumn('props_values:String', concat_ws("_",spark_dataframe.TransactionAmt,spark_dataframe.dist1,spark_dataframe.dist2,spark_dataframe.C1,spark_dataframe.C2,spark_dataframe.C3,spark_dataframe.C4,spark_dataframe.C5,spark_dataframe.C6,spark_dataframe.C7,spark_dataframe.C8,spark_dataframe.C9,spark_dataframe.C10,spark_dataframe.C11,spark_dataframe.C12,spark_dataframe.C13,spark_dataframe.C14,spark_dataframe.D1,spark_dataframe.D2,spark_dataframe.D3,spark_dataframe.D4,spark_dataframe.D5,spark_dataframe.D6,spark_dataframe.D7,spark_dataframe.D8,spark_dataframe.D9,spark_dataframe.D10,spark_dataframe.D11,spark_dataframe.D12,spark_dataframe.D13,spark_dataframe.D14,spark_dataframe.D15,spark_dataframe.V1,spark_dataframe.V2,spark_dataframe.V3,spark_dataframe.V4,spark_dataframe.V5,spark_dataframe.V6,spark_dataframe.V7,spark_dataframe.V8,spark_dataframe.V9,spark_dataframe.V10,spark_dataframe.V11,spark_dataframe.V12,spark_dataframe.V13,spark_dataframe.V14,spark_dataframe.V15,spark_dataframe.V16,spark_dataframe.V17,spark_dataframe.V18,spark_dataframe.V19,spark_dataframe.V20,spark_dataframe.V21,spark_dataframe.V22,spark_dataframe.V23,spark_dataframe.V24,spark_dataframe.V25,spark_dataframe.V26,spark_dataframe.V27,spark_dataframe.V28,spark_dataframe.V29,spark_dataframe.V30,spark_dataframe.V31,spark_dataframe.V32,spark_dataframe.V33,spark_dataframe.V34,spark_dataframe.V35,spark_dataframe.V36,spark_dataframe.V37,spark_dataframe.V38,spark_dataframe.V39,spark_dataframe.V40,spark_dataframe.V41,spark_dataframe.V42,spark_dataframe.V43,spark_dataframe.V44,spark_dataframe.V45,spark_dataframe.V46,spark_dataframe.V47,spark_dataframe.V48,spark_dataframe.V49,spark_dataframe.V50,spark_dataframe.V51,spark_dataframe.V52,spark_dataframe.V53,spark_dataframe.V54,spark_dataframe.V55,spark_dataframe.V56,spark_dataframe.V57,spark_dataframe.V58,spark_dataframe.V59,spark_dataframe.V60,spark_dataframe.V61,spark_dataframe.V62,spark_dataframe.V63,spark_dataframe.V64,spark_dataframe.V65,spark_dataframe.V66,spark_dataframe.V67,spark_dataframe.V68,spark_dataframe.V69,spark_dataframe.V70,spark_dataframe.V71,spark_dataframe.V72,spark_dataframe.V73,spark_dataframe.V74,spark_dataframe.V75,spark_dataframe.V76,spark_dataframe.V77,spark_dataframe.V78,spark_dataframe.V79,spark_dataframe.V80,spark_dataframe.V81,spark_dataframe.V82,spark_dataframe.V83,spark_dataframe.V84,spark_dataframe.V85,spark_dataframe.V86,spark_dataframe.V87,spark_dataframe.V88,spark_dataframe.V89,spark_dataframe.V90,spark_dataframe.V91,spark_dataframe.V92,spark_dataframe.V93,spark_dataframe.V94,spark_dataframe.V95,spark_dataframe.V96,spark_dataframe.V97,spark_dataframe.V98,spark_dataframe.V99,spark_dataframe.V100,spark_dataframe.V101,spark_dataframe.V102,spark_dataframe.V103,spark_dataframe.V104,spark_dataframe.V105,spark_dataframe.V106,spark_dataframe.V107,spark_dataframe.V108,spark_dataframe.V109,spark_dataframe.V110,spark_dataframe.V111,spark_dataframe.V112,spark_dataframe.V113,spark_dataframe.V114,spark_dataframe.V115,spark_dataframe.V116,spark_dataframe.V117,spark_dataframe.V118,spark_dataframe.V119,spark_dataframe.V120,spark_dataframe.V121,spark_dataframe.V122,spark_dataframe.V123,spark_dataframe.V124,spark_dataframe.V125,spark_dataframe.V126,spark_dataframe.V127,spark_dataframe.V128,spark_dataframe.V129,spark_dataframe.V130,spark_dataframe.V131,spark_dataframe.V132,spark_dataframe.V133,spark_dataframe.V134,spark_dataframe.V135,spark_dataframe.V136,spark_dataframe.V137,spark_dataframe.V138,spark_dataframe.V139,spark_dataframe.V140,spark_dataframe.V141,spark_dataframe.V142,spark_dataframe.V143,spark_dataframe.V144,spark_dataframe.V145,spark_dataframe.V146,spark_dataframe.V147,spark_dataframe.V148,spark_dataframe.V149,spark_dataframe.V150,spark_dataframe.V151,spark_dataframe.V152,spark_dataframe.V153,spark_dataframe.V154,spark_dataframe.V155,spark_dataframe.V156,spark_dataframe.V157,spark_dataframe.V158,spark_dataframe.V159,spark_dataframe.V160,spark_dataframe.V161,spark_dataframe.V162,spark_dataframe.V163,spark_dataframe.V164,spark_dataframe.V165,spark_dataframe.V166,spark_dataframe.V167,spark_dataframe.V168,spark_dataframe.V169,spark_dataframe.V170,spark_dataframe.V171,spark_dataframe.V172,spark_dataframe.V173,spark_dataframe.V174,spark_dataframe.V175,spark_dataframe.V176,spark_dataframe.V177,spark_dataframe.V178,spark_dataframe.V179,spark_dataframe.V180,spark_dataframe.V181,spark_dataframe.V182,spark_dataframe.V183,spark_dataframe.V184,spark_dataframe.V185,spark_dataframe.V186,spark_dataframe.V187,spark_dataframe.V188,spark_dataframe.V189,spark_dataframe.V190,spark_dataframe.V191,spark_dataframe.V192,spark_dataframe.V193,spark_dataframe.V194,spark_dataframe.V195,spark_dataframe.V196,spark_dataframe.V197,spark_dataframe.V198,spark_dataframe.V199,spark_dataframe.V200,spark_dataframe.V201,spark_dataframe.V202,spark_dataframe.V203,spark_dataframe.V204,spark_dataframe.V205,spark_dataframe.V206,spark_dataframe.V207,spark_dataframe.V208,spark_dataframe.V209,spark_dataframe.V210,spark_dataframe.V211,spark_dataframe.V212,spark_dataframe.V213,spark_dataframe.V214,spark_dataframe.V215,spark_dataframe.V216,spark_dataframe.V217,spark_dataframe.V218,spark_dataframe.V219,spark_dataframe.V220,spark_dataframe.V221,spark_dataframe.V222,spark_dataframe.V223,spark_dataframe.V224,spark_dataframe.V225,spark_dataframe.V226,spark_dataframe.V227,spark_dataframe.V228,spark_dataframe.V229,spark_dataframe.V230,spark_dataframe.V231,spark_dataframe.V232,spark_dataframe.V233,spark_dataframe.V234,spark_dataframe.V235,spark_dataframe.V236,spark_dataframe.V237,spark_dataframe.V238,spark_dataframe.V239,spark_dataframe.V240,spark_dataframe.V241,spark_dataframe.V242,spark_dataframe.V243,spark_dataframe.V244,spark_dataframe.V245,spark_dataframe.V246,spark_dataframe.V247,spark_dataframe.V248,spark_dataframe.V249,spark_dataframe.V250,spark_dataframe.V251,spark_dataframe.V252,spark_dataframe.V253,spark_dataframe.V254,spark_dataframe.V255,spark_dataframe.V256,spark_dataframe.V257,spark_dataframe.V258,spark_dataframe.V259,spark_dataframe.V260,spark_dataframe.V261,spark_dataframe.V262,spark_dataframe.V263,spark_dataframe.V264,spark_dataframe.V265,spark_dataframe.V266,spark_dataframe.V267,spark_dataframe.V268,spark_dataframe.V269,spark_dataframe.V270,spark_dataframe.V271,spark_dataframe.V272,spark_dataframe.V273,spark_dataframe.V274,spark_dataframe.V275,spark_dataframe.V276,spark_dataframe.V277,spark_dataframe.V278,spark_dataframe.V279,spark_dataframe.V280,spark_dataframe.V281,spark_dataframe.V282,spark_dataframe.V283,spark_dataframe.V284,spark_dataframe.V285,spark_dataframe.V286,spark_dataframe.V287,spark_dataframe.V288,spark_dataframe.V289,spark_dataframe.V290,spark_dataframe.V291,spark_dataframe.V292,spark_dataframe.V293,spark_dataframe.V294,spark_dataframe.V295,spark_dataframe.V296,spark_dataframe.V297,spark_dataframe.V298,spark_dataframe.V299,spark_dataframe.V300,spark_dataframe.V301,spark_dataframe.V302,spark_dataframe.V303,spark_dataframe.V304,spark_dataframe.V305,spark_dataframe.V306,spark_dataframe.V307,spark_dataframe.V308,spark_dataframe.V309,spark_dataframe.V310,spark_dataframe.V311,spark_dataframe.V312,spark_dataframe.V313,spark_dataframe.V314,spark_dataframe.V315,spark_dataframe.V316,spark_dataframe.V317,spark_dataframe.V318,spark_dataframe.V319,spark_dataframe.V320,spark_dataframe.V321,spark_dataframe.V322,spark_dataframe.V323,spark_dataframe.V324,spark_dataframe.V325,spark_dataframe.V326,spark_dataframe.V327,spark_dataframe.V328,spark_dataframe.V329,spark_dataframe.V330,spark_dataframe.V331,spark_dataframe.V332,spark_dataframe.V333,spark_dataframe.V334,spark_dataframe.V335,spark_dataframe.V336,spark_dataframe.V337,spark_dataframe.V338,spark_dataframe.V339,spark_dataframe.M1_F,spark_dataframe.M1_T,spark_dataframe.M2_F,spark_dataframe.M2_T,spark_dataframe.M3_F,spark_dataframe.M3_T,spark_dataframe.M4_M0,spark_dataframe.M4_M1,spark_dataframe.M4_M2,spark_dataframe.M5_F,spark_dataframe.M5_T,spark_dataframe.M6_F,spark_dataframe.M6_T,spark_dataframe.M7_F,spark_dataframe.M7_T,spark_dataframe.M8_F,spark_dataframe.M8_T,spark_dataframe.M9_F,spark_dataframe.M9_T))
# spark_dataframe = spark_dataframe.withColumn('props_values:String', to_json(struct(list(filter(lambda x: (x != TRANSACTION_ID), spark_dataframe.schema.names)))))
# spark_dataframe = features_df.select('TransactionID', to_json(struct(list(filter(lambda x: (x != TRANSACTION_ID), spark_dataframe.schema.names)))).alias('props_values:String'))
spark_dataframe = spark_dataframe.select('TransactionID','props_values:String')

logger.info(f'Creating glue dynamic frame from spark dataframe...')
features_dynamic_df = DynamicFrame.fromDF(spark_dataframe, glueContext, 'FeaturesDF')
features_dynamic_df = GlueGremlinCsvTransforms.create_prefixed_columns(features_dynamic_df, [('~id', TRANSACTION_ID, 't')])
features_dynamic_df = GlueGremlinCsvTransforms.addLabel(features_dynamic_df,'Transaction')
features_dynamic_df = SelectFields.apply(frame = features_dynamic_df, paths = ["~id",'~label', 'props_values:String'])
logger.info(f'Upserting transactions as vertices of graph...')
dump_df_to_s3(features_dynamic_df.toDF(), f'features_dynamic_df', bulk_load = True) #.toDF().toPandas(), f'features_dynamic_df')

logger.info(f'Creating glue DF from labels dataframe')
labels_dynamic_df = DynamicFrame.fromDF(labels_df, glueContext, 'LabelsDF')
labels_dynamic_df = GlueGremlinCsvTransforms.addLabel(labels_dynamic_df,'Transaction')
labels_dynamic_df = GlueGremlinCsvTransforms.create_prefixed_columns(labels_dynamic_df, [('~id', TRANSACTION_ID, 't')])
logger.info(f'Upserting transactions with isFraud property...')
dump_df_to_s3(labels_dynamic_df.toDF(), f'labels_dynamic_df', bulk_load = True) #.toDF().toPandas(), f'labels_dynamic_df')

dump_df_to_s3(features_df, 'features')
dump_df_to_s3(labels_df, 'tags')
relational_edges = get_relations_and_edgelist(transactions.toDF(), identities.toDF(), id_cols)
for name, df in relational_edges.items():
    if name != TRANSACTION_ID:
        dump_df_to_s3(df, f'relation_{name}_edgelist')
        create_catagory_and_relation(name, df, gremlin_client)