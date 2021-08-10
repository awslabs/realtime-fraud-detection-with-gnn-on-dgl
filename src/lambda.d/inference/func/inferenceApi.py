from __future__  import print_function
import boto3
import os, sys
import json
from collections import OrderedDict
from neptune_python_utils.gremlin_utils import GremlinUtils
from neptune_python_utils.endpoints import Endpoints
from gremlin_python.process.graph_traversal import __
from gremlin_python.process.traversal import Cardinality
from gremlin_python.process.traversal import Column
from io import BytesIO, StringIO
from datetime import datetime as dt
import numpy as np
import pandas as pd
import time
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MAX_FEATURE_NODE = int(os.environ['MAX_FEATURE_NODE'])
CLUSTER_ENDPOINT = os.environ['CLUSTER_ENDPOINT']
CLUSTER_PORT = os.environ['CLUSTER_PORT']
CLUSTER_REGION = os.environ['CLUSTER_REGION']
ENDPOINT_NAME = os.environ['ENDPOINT_NAME']
MODEL_BTW = float(os.environ['MODEL_BTW'])
QUEUE_URL = os.environ['QUEUE_URL']

transactions_id_cols = os.environ['TRANSACTION_ID_COLS']
transactions_cat_cols = os.environ['TRANSACTION_CAT_COLS']
dummied_col = os.environ['DUMMIED_COL']

sqs = boto3.client('sqs')
runtime = boto3.client('runtime.sagemaker')

attr_version_key = 'props_values'

endpoints = Endpoints(neptune_endpoint = CLUSTER_ENDPOINT, neptune_port = CLUSTER_PORT, region_name = CLUSTER_REGION)

def load_data_from_event(input_event, transactions_id_cols, transactions_cat_cols, dummied_col):
    """Load and transform event data into correct format for next step subgraph loading and model inference input. 
        input event keys should come from related dataset.]
    
    Example:
    >>> load_data_from_event(event = {"transaction_data":[{"TransactionID":"3163166", "V1":1, ...]}, 'card1,card2,,...', 'M2_T,M3_F,M3_T,...')
    """
    TRANSACTION_ID = 'TransactionID'

    transactions_id_cols = transactions_id_cols.split(',') 
    transactions_cat_cols = transactions_cat_cols.split(',') 
    transactions_no_value_cols = [TRANSACTION_ID, 'TransactionDT'] + transactions_id_cols + transactions_cat_cols
    dummied_col = dummied_col.split(',')

    if input_event['identity_data'] != []:
        identities_cols = list(input_event['identity_data'][0].keys())
        identities_cols.remove(TRANSACTION_ID)
    else:
        identities_cols = []

    neighbor_cols = [x for x in list(input_event['transaction_data'][0].keys()) if x not in transactions_no_value_cols]

    if input_event['identity_data'] != []:
        input_event = {**input_event['transaction_data'][0], **input_event['identity_data'][0]} 
    else:
        input_event = {**input_event['transaction_data'][0]}
    
    input_event[TRANSACTION_ID] = f't-{input_event[TRANSACTION_ID]}'
    input_event['TransactionAmt'] = np.log10(input_event['TransactionAmt'])
    
    inputDF = pd.DataFrame.from_dict(input_event, orient='index').transpose()

    union_id_cols = transactions_id_cols + identities_cols 

    target_id = inputDF[TRANSACTION_ID].iloc[0]

    for dummy in dummied_col:
        col_name = dummy[:2]
        if inputDF[col_name].iloc[0] == dummy[3:]:
            inputDF[dummy] = 1.0
        else:
            inputDF[dummy] = 0.0
            
    transaction_value_cols = neighbor_cols+dummied_col
    
    transformedDF = inputDF[transaction_value_cols].fillna(0.0).apply(lambda row: json.dumps(dict(row), default=str), axis=1).to_frame('json') 
    trans_dict = [{TRANSACTION_ID:target_id,
                    'props_values': transformedDF.iloc[0]['json']}]
    logger.debug(f'transformed trans dict is {trans_dict}')

    identity_dict = [inputDF[union_id_cols].iloc[0].fillna(0.0).to_dict()]
    return trans_dict, identity_dict, target_id, transaction_value_cols, union_id_cols

class GraphModelClient:
    def __init__(self, endpoint):
        self.gremlin_utils = GremlinUtils(endpoint)
        GremlinUtils.init_statics(globals())

    def insert_new_transaction_vertex_and_edge(self, tr_dict, connectted_node_dict, target_id, vertex_type = 'Transaction'):
        """Load transaction data, insert transaction object and related domain objects into GraphDB as vertex,
        with their properties as values, and insert their relation as edges.
            
        Example:
        >>> insert_new_transaction_vertex_and_edge(tr_dict, connectted_node_dict, target_id, vertex_type = 'Transaction')
        """
        def insert_attr(graph_conn, attr_val_dict, target_id, node_id, vertex_type): 

            if (not g.V().has(id,node_id).hasNext()):
                logger.info(f'Insert_Vertex: {node_id}.')
                g.inject(attr_val_dict).unfold().as_(vertex_type).\
                addV(vertex_type).as_('v').property(id,node_id).\
                sideEffect(__.select(vertex_type).unfold().as_('kv').select('v').\
                    property(Cardinality.single, __.select('kv').by(Column.keys),
                                __.select('kv').by(Column.values)
                                )
                    ).iterate()
            else:
                logger.debug(f'Ignore inserting existing Vertex with id {node_id}')

            # Insert_edge

            to_node = g.V().has(id,node_id).next()
            edgeId = target_id+'-'+node_id
            if(not g.E().has(id,edgeId).hasNext()):
                logger.info(f'Insert_Edge: {target_id} --> {node_id}.')
                g.V().has(id,target_id).addE('CATEGORY').to(to_node).property(id,edgeId).iterate() 
            else:
                logger.debug(f'Ignore inserting existing edge with id {edgeId}')                
        
        conn = self.gremlin_utils.remote_connection()
        g = self.gremlin_utils.traversal_source(connection=conn) 

        if (not g.V().has(id, target_id).hasNext()):
            logger.info(f'Insert_Vertex: {target_id}.')
            g.inject(tr_dict).unfold().as_(vertex_type).\
            addV(vertex_type).as_('v').property(id,target_id).\
            sideEffect(__.select(vertex_type).unfold().as_('kv').select('v').\
                property(Cardinality.single, __.select('kv').by(Column.keys),
                            __.select('kv').by(Column.values)
                            )
                ).iterate()         
                
        cols = {'val' + str(i + 1): '0.0' for i in range(390)}
        for node_k, node_v in connectted_node_dict[0].items():
            node_id = node_k + '-' + str(node_v)
            empty_node_dict = {}
            empty_node_dict[attr_version_key] = json.dumps(cols)
            empty_node_dict = [empty_node_dict]
            insert_attr(g, empty_node_dict, target_id, node_id, vertex_type = node_k)   

        conn.close()                    
                    
    def query_target_subgraph(self, target_id, tr_dict, transaction_value_cols, union_id_cols, dummied_col):
        """Extract 2nd degree subgraph of target transaction.Dump data into subgraph dict and n_feats dict.
        subgraph_dict:  related transactions' id list and values through edges
        n_feats dict: related 1 degree vertex and transactions' embeded elements vectors. 
        Usually after insert new test sample's vertex and edges into graphDB. 
        
        Example:
        >>> query_target_subgraph('3661635', load_data_from_event(), 'M2_T,M3_F,M3_T,...')
        """
        subgraph_dict = {}
        neighbor_list = []
        neighbor_dict = {}
        transaction_embed_value_dict = {}
        
        ii = 0
        s_t = dt.now()
        
        conn = self.gremlin_utils.remote_connection()
        g = self.gremlin_utils.traversal_source(connection=conn) 

        target_name = target_id[(target_id.find('-')+1):]
        feature_list = g.V().has(id,target_id).out().id().toList()
        for feat in feature_list:
            ii += 1
            feat_name = feat[:feat.find('-')]
            feat_value = feat[(feat.find('-')+1):]
            node_list = g.V().has(id,feat).both().limit(MAX_FEATURE_NODE).id().toList()
            target_and_conn_node_list = [int(target_name)]+[int(target_conn_node[(target_conn_node.find('-')+1):]) for target_conn_node in node_list]
            target_and_conn_node_list = list(set(target_and_conn_node_list))
            neighbor_list += target_and_conn_node_list
            nodes_and_feature_value_array = (target_and_conn_node_list,[feat_value]*len(target_and_conn_node_list))
            subgraph_dict['target<>'+feat_name] = nodes_and_feature_value_array
        
        e_t = dt.now()
        logger.info(f'INSIDE query_target_subgraph: subgraph_dict used {(e_t - s_t).total_seconds()} seconds')
        new_s_t = e_t

        union_li = [__.V().has(id,target_id).both().hasLabel(label).both().limit(MAX_FEATURE_NODE) for label in union_id_cols]

        if len(union_id_cols) == 51:
            node_dict = g.V().has(id,target_id).union(__.both().hasLabel('card1').both().limit(MAX_FEATURE_NODE),\
                    union_li[1], union_li[2], union_li[3], union_li[4], union_li[5],\
                    union_li[6], union_li[7], union_li[8], union_li[9], union_li[10],\
                    union_li[11], union_li[12], union_li[13], union_li[14], union_li[15],\
                    union_li[16], union_li[17], union_li[18], union_li[19], union_li[20],\
                    union_li[21], union_li[22], union_li[23], union_li[24], union_li[25],\
                    union_li[26], union_li[27], union_li[28], union_li[29], union_li[30],\
                    union_li[31], union_li[32], union_li[33], union_li[34], union_li[35],\
                    union_li[36], union_li[37], union_li[38], union_li[39], union_li[40],\
                    union_li[41], union_li[42], union_li[43], union_li[44], union_li[45],\
                    union_li[46], union_li[47], union_li[48], union_li[49], union_li[50]).elementMap().toList()
        else:
            node_dict = g.V().has(id,target_id).union(__.both().hasLabel('card1').both().limit(MAX_FEATURE_NODE),\
                    union_li[1], union_li[2], union_li[3], union_li[4], union_li[5],\
                    union_li[6], union_li[7], union_li[8], union_li[9], union_li[10]).elementMap().toList()

        e_t = dt.now()
        logger.info(f'INSIDE query_target_subgraph: node_dict used {(e_t - new_s_t).total_seconds()} seconds.')
        new_s_t = e_t

        logger.debug(f'Found {len(node_dict)} nodes from graph dbs...')
        
        class Item():
            def __init__(self, item):
                self.item = item
        
            def __hash__(self):
                return hash(self.item.get(list(self.item)[0]))
        
            def __eq__(self,other):
                if isinstance(other, self.__class__):
                    return self.__hash__() == other.__hash__()
                else:
                    return NotImplemented
        
            def __repr__(self):
                return "Item(%s)" % (self.item)
                
        node_dict = list(set([Item(node) for node in node_dict]))
        logger.debug(f'Found {len(node_dict)} nodes without duplication')
        for item in node_dict:
            item = item.item
            node = item.get(list(item)[0])
            node_value = node[(node.find('-')+1):]
            try:
                logger.debug(f'the props of node {node} is {item.get(attr_version_key)}')
                jsonVal = json.loads(item.get(attr_version_key))
                neighbor_dict[node_value] = [jsonVal[key] for key in transaction_value_cols]
                logger.debug(f'neighbor pair is {node_value}, {neighbor_dict[node_value]}')
            except json.JSONDecodeError:
                logger.warn(f'Malform node value {node} is {item.get(attr_version_key)}, run below cmd to remove it')
                logger.info(f'g.V(\'{node}\').drop()')

        target_value = target_id[(target_id.find('-')+1):]
        jsonVal = json.loads(tr_dict[0].get(attr_version_key))
        neighbor_dict[target_value] = [jsonVal[key] for key in transaction_value_cols]
        
        logger.info(f'INSIDE query_target_subgraph: neighbor_dict used {(e_t - new_s_t).total_seconds()} seconds.')

        attr_cols = ['val'+str(x) for x in range(1,391)]
        for attr in feature_list:
            attr_name = attr[:attr.find('-')]
            attr_value = attr[(attr.find('-')+1):]
            attr_dict = g.V().has(id,attr).valueMap().toList()[0]
            logger.debug(f'attr is {attr}, dict is {attr_dict}')
            jsonVal = json.loads(attr_dict.get(attr_version_key)[0])
            attr_dict = [float(jsonVal[key]) for key in attr_cols]
            attr_input_dict = {}
            attr_input_dict[attr_value] = attr_dict
            transaction_embed_value_dict[attr_name] = attr_input_dict
        
        e_t = dt.now()
        logger.info(f'INSIDE query_target_subgraph: transaction_embed_value_dict used {(e_t - new_s_t).total_seconds()} seconds. Total test cost {(e_t - s_t).total_seconds()} seconds.')
        new_s_t = e_t
        
        transaction_embed_value_dict['target'] = neighbor_dict

        conn.close()   

        return subgraph_dict, transaction_embed_value_dict    

def invoke_endpoint_with_idx(endpointname, target_id, subgraph_dict, n_feats):
    """
    Post data input to and request response from sagemaker inference endpoint.
    
    Example:
    >>> invoke_endpoint_with_idx('frauddetection', '3636131', subgraph_dict, transaction_embed_value_dict)

    Args:
    
    endpointname: Neptune endpoint string from environ
    target_id: transaction id for inference. default to be event['TransactionID']
    subgraph_dict: testgraphpath
    n_feats: transaction_embed_values

    """
    
    payload = {
        'graph': subgraph_dict,
        'n_feats': n_feats,
        'target_id': target_id
    }
    
    logger.debug(f'Invoke endpoint with data {payload}')
    
    response = runtime.invoke_endpoint(EndpointName=endpointname,
                                            ContentType='application/json',
                                            Body=json.dumps(payload))

    res_body = response['Body'].read()
    
    logger.debug(f'Invoke endpoint with response {res_body}')
    
    results = json.loads(res_body)
    
    pred_prob = results

    return pred_prob


def handler(event, context):
    
    logger.info('Endpoint name: {}'.format(ENDPOINT_NAME))
    
    logger.info(f'Receive event: {event}')

    G_s_t = dt.now()

    trans_dict, identity_dict, target_id, transaction_value_cols, union_li_cols = load_data_from_event(event, transactions_id_cols, transactions_cat_cols, dummied_col)
    
    G_e_t = dt.now()
    logger.info(f'load_data_from_event used {(G_e_t - G_s_t).total_seconds()} seconds. ')
    G_new_s_t = G_e_t
    
    graph_input = GraphModelClient(endpoints)
    graph_input.insert_new_transaction_vertex_and_edge(trans_dict, identity_dict , target_id, vertex_type = 'Transaction')
    
    G_e_t = dt.now()
    logger.info(f'insert_new_transaction_vertex_and_edge used {(G_e_t - G_new_s_t).total_seconds()} seconds. Total test cost {(G_e_t - G_s_t).total_seconds()} seconds.')
    G_new_s_t = G_e_t
    
    subgraph_dict, transaction_embed_value_dict = graph_input.query_target_subgraph(target_id, trans_dict, transaction_value_cols, union_li_cols, dummied_col)
    
    G_e_t = dt.now()
    logger.info(f'query_target_subgraph used {(G_e_t - G_new_s_t).total_seconds()} seconds. Total test cost {(G_e_t - G_s_t).total_seconds()} seconds.')
    G_new_s_t = G_e_t

    transaction_id = int(target_id[(target_id.find('-')+1):])
    
    pred_prob = invoke_endpoint_with_idx(endpointname = ENDPOINT_NAME, target_id = transaction_id, subgraph_dict = subgraph_dict, n_feats = transaction_embed_value_dict)
    
    e_t = dt.now()
    logger.info(f'invoke_endpoint_with_idx used {(G_e_t - G_new_s_t).total_seconds()} seconds. Total test cost {(G_e_t - G_s_t).total_seconds()} seconds.')
    G_new_s_t = G_e_t

    data_output = {
                    'timestamp': int(time.time()),
                    'isFraud': pred_prob > MODEL_BTW,
                    'id': transaction_id, #event['transaction_data'][0]['TransactionID'],
                    'amount': event['transaction_data'][0]['TransactionAmt'],
                    'productCD': event['transaction_data'][0]['ProductCD'],
                    'card1': event['transaction_data'][0]['card1'],
                    'card2': event['transaction_data'][0]['card2'],
                    'card3': event['transaction_data'][0]['card3'],
                    'card4': event['transaction_data'][0]['card4'],
                    'card5': event['transaction_data'][0]['card5'],
                    'card6': event['transaction_data'][0]['card6'],
                    'addr1': event['transaction_data'][0]['addr1'],
                    'addr2': event['transaction_data'][0]['addr2'],
                    'dist1': event['transaction_data'][0]['dist1'],
                    'dist2': event['transaction_data'][0]['dist2'],
                    'pEmaildomain': event['transaction_data'][0]['P_emaildomain'],
                    'rEmaildomain': event['transaction_data'][0]['R_emaildomain'],
                }

    logger.debug(f'Send transaction {data_output} to queue.')
    response = sqs.send_message(
        QueueUrl=QUEUE_URL,
        DelaySeconds=0,
        MessageBody=json.dumps(data_output),
        MessageGroupId=context.aws_request_id,
    )
    
    function_res = {
                    'id': event['transaction_data'][0]['TransactionID'],
                    'flag': pred_prob > MODEL_BTW,
                    'pred_prob': pred_prob,
                    'time': (G_e_t - G_s_t).total_seconds()
                    }
    
    logger.info(f'Return function_res {function_res}.')
    
    return function_res