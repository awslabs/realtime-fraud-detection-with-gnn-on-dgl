import os
import re
import dgl
import numpy as np
import torch as th
import glob

from data import parse_edgelist, get_features, read_edges, read_masked_nodes
from estimator_fns import get_logger

logging = get_logger(__name__)

def get_files(filename_pattern, root_dir):
    return glob.iglob(os.path.join(root_dir, '') + filename_pattern, recursive=True)

def construct_graph(edges, nodes, target_node_type):

    print("Getting relation graphs from the following edge lists : {} ".format(edges))
    edgelists, id_to_node = {}, {}
    for i, edge in enumerate(edges):
        edgelist, rev_edgelist, id_to_node, src, dst = parse_edgelist(edge, id_to_node, header=True)
        if src == target_node_type:
            src = 'target'
        if dst == target_node_type:
            dst = 'target'

        if src == 'target' and dst == 'target':
            print("Will add self loop for target later......")
        else:
            edgelists[(src, src + '<>' + dst, dst)] = edgelist
            edgelists[(dst, dst + '<>' + src, src)] = rev_edgelist
            print("Read edges for {} from edgelist: {}".format(src + '<>' + dst, edge))

    # get features for target nodes
    features, new_nodes = get_features(id_to_node[target_node_type], nodes)
    print("Read in features for target nodes")

    # add self relation
    edgelists[('target', 'self_relation', 'target')] = [(t, t) for t in id_to_node[target_node_type].values()]

    g = dgl.heterograph(edgelists)
    print(
        "Constructed heterograph with the following metagraph structure: Node types {}, Edge types{}".format(
            g.ntypes, g.canonical_etypes))
    print("Number of nodes of type target : {}".format(g.number_of_nodes('target')))

    g.nodes['target'].data['features'] = th.from_numpy(features)

    target_id_to_node = id_to_node[target_node_type]
    id_to_node['target'] = target_id_to_node

    del id_to_node[target_node_type]

    return g, features, target_id_to_node, id_to_node
