#-*- coding:utf-8 -*-

# Author:james Zhang
# Datetime: Jan-10th 2021 19:10
# Project: GCR Fraud_detection_on_DGL Solution
"""
    This is the entry point of SageMaker inference endpoint, it fulfills:
    1. Receive request and parse out the heterogeneous graph and target node
    2. But a DGL heterogeneous graph
    3. Use the RGCN model to perform inference
    4. Send the score back to requesters
"""


import os
import json
import dgl
from datetime import datetime as dt
import pickle

import torch as th
import torch.nn as nn
import torch.nn.functional as F

import dgl.function as fn
import numpy as np

INPUT_SIZE = 390
HIDDEN_SIZE = int(os.getenv('HIDDEN_SIZE', '16'))
N_LAYERS = 2
OUT_SIZE = 2
EMBEDDING_SIZE = 390
BASE_PATH = '/opt/ml/model/code/'
TARGET_FEAT_MEAN = None
TARGET_FEAT_STD = None


def load_train_graph_info(file_path):

    with open(file_path, 'rb') as f:
        info_dict = pickle.load(f)

    etypes = [can_etype for src_type, can_etype, dst_type in info_dict['etypes']]
    ntype_dict = info_dict['ntype_cnt']

    global TARGET_FEAT_MEAN
    TARGET_FEAT_MEAN = info_dict['feat_mean']
    global TARGET_FEAT_STD
    TARGET_FEAT_STD = info_dict['feat_std']

    return etypes, ntype_dict


# Initialize model construction arguments
def initialize_arguments(metadata_file):

    etypes, ntype_dict = load_train_graph_info(metadata_file)

    input_size = INPUT_SIZE
    hidden_size = HIDDEN_SIZE
    n_layers = N_LAYERS
    out_size = OUT_SIZE
    embedding_size = EMBEDDING_SIZE

    return ntype_dict, etypes, input_size, hidden_size, out_size, n_layers, embedding_size


# RGCN models
class HeteroRGCNLayer(nn.Module):
    def __init__(self, in_size, out_size, etypes):
        super(HeteroRGCNLayer, self).__init__()
        # W_r for each relation
        self.weight = nn.ModuleDict({
                name: nn.Linear(in_size, out_size) for name in etypes
            })

    def forward(self, G, feat_dict):
        # The input is a dictionary of node features for each type
        funcs = {}
        for srctype, etype, dsttype in G.canonical_etypes:
            # Compute W_r * h
            if srctype in feat_dict:
                Wh = self.weight[etype](feat_dict[srctype])
                # Save it in graph for message passing
                G.nodes[srctype].data['Wh_%s' % etype] = Wh
                # Specify per-relation message passing functions: (message_func, reduce_func).
                funcs[etype] = (fn.copy_u('Wh_%s' % etype, 'm'), fn.mean('m', 'h'))
        # Trigger message passing of multiple types.
        G.multi_update_all(funcs, 'sum')
        # return the updated node feature dictionary
        return {ntype: G.nodes[ntype].data['h'] for ntype in G.ntypes if 'h' in G.nodes[ntype].data}


class HeteroRGCN(nn.Module):
    def __init__(self, ntype_dict, etypes, in_size, hidden_size, out_size, n_layers, embedding_size):
        super(HeteroRGCN, self).__init__()
        # Use trainable node embeddings as featureless inputs.
        embed_dict = {ntype: nn.Parameter(th.Tensor(num_nodes, in_size))
                      for ntype, num_nodes in ntype_dict.items() if ntype != 'target'}
        for key, embed in embed_dict.items():
            nn.init.xavier_uniform_(embed)
        self.embed = nn.ParameterDict(embed_dict)
        # create layers
        self.layers = nn.ModuleList()
        self.layers.append(HeteroRGCNLayer(embedding_size, hidden_size, etypes))
        # hidden layers
        for i in range(n_layers - 1):
            self.layers.append(HeteroRGCNLayer(hidden_size, hidden_size, etypes))

        # output layer
        self.layers.append(nn.Linear(hidden_size, out_size))

    def forward(self, g, features):

        # To use in real-time case, need to set embedding with input embeddings that are extracted from GrahpDB.
        # h_dict = self.embed
        h_dict = features

        # pass through all layers
        for i, layer in enumerate(self.layers[:-1]):
            if i != 0:
                h_dict = {k: F.leaky_relu(h) for k, h in h_dict.items()}
            h_dict = layer(g, h_dict)

        # get user binary logits
        bin_logist = self.layers[-1](h_dict['target'])

        # compute softmax value of binary logits
        softmax_logits = bin_logist.softmax(dim=-1)

        # return the probability to be One
        return softmax_logits


# SageMaker inference functions
def model_fn(model_dir):

    print('------------------ Loading model -------------------')
    # --- load saved model ---
    s_t = dt.now()

    ntype_dict, etypes, in_size, hidden_size, out_size, n_layers, embedding_size = \
    initialize_arguments(os.path.join(BASE_PATH, 'metadata.pkl'))

    rgcn_model = HeteroRGCN(ntype_dict, etypes, in_size, hidden_size, out_size, n_layers, embedding_size)

    stat_dict = th.load('model.pth')

    rgcn_model.load_state_dict(stat_dict)

    e_t = dt.now()
    print('--Load Model: {}'.format((e_t - s_t).microseconds))

    return rgcn_model


def recreate_grpha_data(graph_dict, n_feats, target_id):
    """
    From the graph dictionary, build the input graph and node features for model.

    :param
    graph_dict: a Python dictionary, where key is a tuple containing source type and destination type, like ('target',
                'card1'), and the value is a tuple of two Python lists, containing the original ids of source and
                destination nodes.
    n_feats: a Python dictionary, where key is node type string, and value is another dictionary with node ids as key and
             value is a list of 390 dimension floats.
    target_id: an id of a node in the graph to be inferred.

    :return:
    graph: a DGL heterogeneous graph, including reversed edges.

    new_n_feats: a Tensor in the order of new id nodes.

    new_pred_target_id: an integer for the target node in the new graph

    """
    print('------------------ Convert to DLG Graph -------------------')
    # --- Step 1: collect all types of nodes together
    rel_list = []
    node_id_list = {}
    for can_etype, src_dst_tuple in graph_dict.items():

        src_type, dst_type = can_etype.split('<>')
        src_origin, dst_origin = np.array(src_dst_tuple[0]), np.array(src_dst_tuple[1])

        rel_list.append(((src_type, dst_type), (src_origin, dst_origin)))
        # rel_list.append(((dst_type, dst_type + '<>' + src_type, src_type), (dst_origin, src_origin)))

        if node_id_list.get(src_type) is not None:
            node_id_list[src_type] = np.append(node_id_list.get(src_type), src_origin)
        else:
            node_id_list[src_type] = src_origin

        if node_id_list.get(dst_type) is not None:
            node_id_list[dst_type] = np.append(node_id_list.get(dst_type), dst_origin)
        else:
            node_id_list[dst_type] = dst_origin

    # --- Step 2: for each type of node, unique their IDs and store
    node_new_list = {}
    for ntype, nid_list in node_id_list.items():
        # get new id
        nid_old, nid_new = np.unique(nid_list, return_inverse=True)
        node_new_list[ntype] = (nid_old, nid_new)

    # ---  Step 3: map new node IDs to old node IDs
    rel_dict = {}
    node_type_idx = {}
    for rel in rel_list:
        src_type, dst_type = rel[0]
        src, dst = rel[1]

        _, nid_new = node_new_list[src_type]
        if node_type_idx.get(src_type) is not None:
            src_new = nid_new[node_type_idx.get(src_type):node_type_idx.get(src_type) + src.size]
            node_type_idx[src_type] = node_type_idx.get(src_type) + src.size
        else:
            src_new = nid_new[0: 0 + src.size]
            node_type_idx[src_type] = 0 + src.size

        _, nid_new = node_new_list[dst_type]
        if node_type_idx.get(dst_type) is not None:
            dst_new = nid_new[node_type_idx.get(dst_type):node_type_idx.get(dst_type) + dst.size]
            node_type_idx[dst_type] = node_type_idx.get(dst_type) + dst.size
        else:
            dst_new = nid_new[0: 0 + dst.size]
            node_type_idx[dst_type] = 0 + dst.size

        rel_dict[(src_type, src_type + '<>' + dst_type, dst_type)] = (th.from_numpy(src_new), th.from_numpy(dst_new))
        rel_dict[(dst_type, dst_type + '<>' + src_type, src_type)] = (th.from_numpy(dst_new), th.from_numpy(src_new))

    # Add target self-loop
    target_nid_old = node_new_list['target'][0]
    target_nid_new = np.arange(target_nid_old.shape[0])
    rel_dict[('target', 'self_relation', 'target')] = (th.from_numpy(target_nid_new),
                                                       th.from_numpy(target_nid_new))

    # Extract the new target node id
    new_pred_target_id = th.tensor(np.searchsorted(target_nid_old, target_id)).long()

    print("New target node id: {}".format(new_pred_target_id))

    # --- Step 4: process n_feats dictionary to get feature tensor
    new_n_feats = {}
    for in_ntype, in_feat_dict in n_feats.items():
        old_ids, _ = node_new_list[in_ntype]

        feats = []
        for old_id in old_ids:
            feats.append(in_feat_dict[str(old_id)])

        if in_ntype == 'target':
            global TARGET_FEAT_MEAN, TARGET_FEAT_STD
            np_feats = np.array(feats).astype(np.float32)
            th_feat = th.from_numpy(np_feats)
            norm_feat = (th_feat - TARGET_FEAT_MEAN) / TARGET_FEAT_STD

            new_n_feats[in_ntype] = norm_feat
        else:
            new_n_feats[in_ntype] = th.Tensor(feats)

    # --- Step 5: build DGL graph
    graph = dgl.heterograph(rel_dict)
    print(graph)

    return graph, new_n_feats, new_pred_target_id


def input_fn(request_body, request_content_type='application/json'):
    """
    Preprocessing request_body that is in JSON format.
    :param request_body:
    :param request_content_type:
    :return:
    """
    print('--START a session... ')

    # --------------------- receive request ------------------------------------------------ #
    input_data = json.loads(request_body)

    s_t = dt.now()

    subgraph_dict = input_data['graph']
    n_feats = input_data['n_feats']
    target_id = input_data['target_id']

    # print(n_feats)

    graph, new_n_feats, new_pred_target_id = recreate_grpha_data(subgraph_dict, n_feats, target_id)

    e_t = dt.now()
    print('--DP: {}'.format((e_t - s_t).microseconds))

    return (graph, new_n_feats, new_pred_target_id)


def predict_fn(input_data, model):

    # ---------------------  Inference ------------------------------------------------ #
    s_t = dt.now()

    graph, new_n_feats, new_pred_target_id = input_data

    with th.no_grad():
        logits = model(graph, new_n_feats)
        res = logits[new_pred_target_id].cpu().detach().numpy()

    e_t = dt.now()
    print('--MI: {} --END'.format((e_t - s_t).microseconds))

    return res[1]


if __name__ == '__main__':
    # method for local testing

    # --- load saved model ---
    # s_t = dt.now()
    #
    # model = model_fn('../')
    #
    # e_t = dt.now()
    # print('--Load Model: {}'.format((e_t - s_t).microseconds))

    # --- load subgraph data ---
    s_t = dt.now()

    subgraph_file = 'subgraph_100_101.pkl'
    with open('../clients_python/subgraph_100_101.pkl', 'rb') as f:
        subgraph_dict = pickle.load(f)

    e_t = dt.now()
    print('--Load Graph Data: {}'.format((e_t - s_t).microseconds))

    # --- build a new subgraph ---
    s_t = dt.now()

    g, n_feats, new_pred_target_id = recreate_grpha_data(subgraph_dict, None, 100)


    e_t = dt.now()
    print('--Convert Graph: {}'.format((e_t - s_t).microseconds))

    # --- use saved model to run prediction ---
    # print('------------------ Predict Logits -------------------')
    # s_t = dt.now()
    #
    # logits = model(g, n_feats)
    #
    # e_t = dt.now()
    # print('--Convert Graph: {}'.format((e_t - s_t).microseconds))
    #
    # print(logits[new_pred_target_id])
