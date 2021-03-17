import os
import sys
curPath = os.path.abspath(os.path.dirname(__file__))
sys.path.append(curPath)

os.environ['DGLBACKEND'] = 'pytorch'

import torch as th
import dgl
print('DLG version: {}'.format(dgl.__version__))
import numpy as np
import pandas as pd
import time
import pickle

from sklearn.metrics import confusion_matrix
from estimator_fns import parse_args, get_logger
from graph_utils import get_edgelists, construct_graph
from data import get_features, get_labels, read_masked_nodes, parse_edgelist, read_edges
from utils import get_metrics
from pytorch_model import HeteroRGCN


def normalize(feature_matrix):
    mean = th.mean(feature_matrix, axis=0)
    stdev = th.sqrt(th.sum((feature_matrix - mean)**2, axis=0)/feature_matrix.shape[0])
    return mean, stdev, (feature_matrix - mean) / stdev


def train_fg(model, optim, loss, features, labels, train_g, test_g, test_mask,
             device, n_epochs, thresh, compute_metrics=True):
    """
    A full graph verison of RGCN training
    """

    duration = []
    for epoch in range(n_epochs):
        tic = time.time()
        loss_val = 0.

        pred = model(train_g, features.to(device))

        l = loss(pred, labels)

        optim.zero_grad()
        l.backward()
        optim.step()

        loss_val += l

        duration.append(time.time() - tic)
        metric = evaluate(model, train_g, features, labels, device)
        print("Epoch {:05d} | Time(s) {:.4f} | Loss {:.4f} | f1 {:.4f} ".format(
                epoch, np.mean(duration), loss_val, metric))

    class_preds, pred_proba = get_model_class_predictions(model,
                                                          test_g,
                                                          features,
                                                          labels,
                                                          device,
                                                          threshold=thresh)

    if compute_metrics:
        acc, f1, p, r, roc, pr, ap, cm = get_metrics(class_preds, pred_proba, labels.numpy(), test_mask.numpy(), './')
        print("Metrics")
        print("""Confusion Matrix:
                                {}
                                f1: {:.4f}, precision: {:.4f}, recall: {:.4f}, acc: {:.4f}, roc: {:.4f}, pr: {:.4f}, ap: {:.4f}
                             """.format(cm, f1, p, r, acc, roc, pr, ap))

    return model, class_preds, pred_proba


def get_f1_score(y_true, y_pred):
    """
    Only works for binary case.
    Attention!
    tn, fp, fn, tp = cf_m[0,0],cf_m[0,1],cf_m[1,0],cf_m[1,1]

    :param y_true: A list of labels in 0 or 1: 1 * N
    :param y_pred: A list of labels in 0 or 1: 1 * N
    :return:
    """
    # print(y_true, y_pred)

    cf_m = confusion_matrix(y_true, y_pred)
    # print(cf_m)

    precision = cf_m[1,1] / (cf_m[1,1] + cf_m[0,1] + 10e-5)
    recall = cf_m[1,1] / (cf_m[1,1] + cf_m[1,0])
    f1 = 2 * (precision * recall) / (precision + recall + 10e-5)

    return precision, recall, f1


def evaluate(model, g, features, labels, device):
    "Compute the F1 value in a binary classification case"

    preds = model(g, features.to(device))
    preds = th.argmax(preds, axis=1).numpy()
    precision, recall, f1 = get_f1_score(labels, preds)

    return f1


def get_model_class_predictions(model, g, features, labels, device, threshold=None):
    unnormalized_preds = model(g, features.to(device))
    pred_proba = th.softmax(unnormalized_preds, dim=-1)
    if not threshold:
        return unnormalized_preds.argmax(axis=1).detach().numpy(), pred_proba[:,1].detach().numpy()
    return np.where(pred_proba.detach().numpy() > threshold, 1, 0), pred_proba[:,1].detach().numpy()


def save_model(g, model, model_dir, id_to_node, mean, stdev):

    # Save Pytorch model's parameters to model.pth
    th.save(model.state_dict(), os.path.join(model_dir, 'model.pth'))

    # Save graph's structure information to metadata.pkl for inference codes to initialize RGCN model.
    etype_list = g.canonical_etypes
    ntype_cnt = {ntype: g.number_of_nodes(ntype) for ntype in g.ntypes}
    with open(os.path.join(model_dir, 'metadata.pkl'), 'wb') as f:
        pickle.dump({'etypes': etype_list,
                     'ntype_cnt': ntype_cnt,
                     'feat_mean': mean,
                     'feat_std': stdev}, f)

    # Save original IDs to Node_ids, and trained embedding for non-target node type
    # Covert id_to_node into pandas dataframes
    for ntype, mapping in id_to_node.items():

        # ignore target node
        if ntype == 'target':
            continue

        # retrieve old and node id list
        old_id_list, node_id_list = [], []
        for old_id, node_id in mapping.items():
            old_id_list.append(old_id)
            node_id_list.append(node_id)

        # retrieve embeddings of a node type
        node_feats = model.embed[ntype].detach().numpy()

        # get the number of nodes and the dimension of features
        num_nodes = node_feats.shape[0]
        num_feats = node_feats.shape[1]

        # create id dataframe
        node_ids_df = pd.DataFrame({'~label': [ntype] * num_nodes})
        node_ids_df['~id_tmp'] = old_id_list
        node_ids_df['~id'] = node_ids_df['~label'] + '-' + node_ids_df['~id_tmp']
        node_ids_df['node_id'] = node_id_list

        # create feature dataframe columns
        cols = {'val' + str(i + 1) + ':Double': node_feats[:, i] for i in range(num_feats)}
        node_feats_df = pd.DataFrame(cols)

        # merge id with feature, where feature_df use index
        node_id_feats_df = node_ids_df.merge(node_feats_df, left_on='node_id', right_on=node_feats_df.index)
        # drop the id_tmp and node_id columns to follow the Grelim format requirements
        node_id_feats_df = node_id_feats_df.drop(['~id_tmp', 'node_id'], axis=1)

        # dump the embeddings to files
        node_id_feats_df.to_csv(os.path.join(model_dir, ntype + '.csv'),
                                index=False, header=True, encoding='utf-8')


def get_model(ntype_dict, etypes, hyperparams, in_feats, n_classes, device):

    model = HeteroRGCN(ntype_dict, etypes, in_feats, hyperparams['n_hidden'], n_classes, hyperparams['n_layers'], in_feats)
    model = model.to(device)

    return model


if __name__ == '__main__':
    logging = get_logger(__name__)

    print('numpy version:{} PyTorch version:{} DGL version:{}'.format(np.__version__,
                                                                      th.__version__,
                                                                      dgl.__version__))

    args = parse_args()
    print(args)

    args.edges = get_edgelists('relation*', args.training_dir)

    g, features, target_id_to_node, id_to_node = construct_graph(args.training_dir,
                                                                 args.edges,
                                                                 args.nodes,
                                                                 args.target_ntype)

    mean, stdev, features = normalize(th.from_numpy(features))

    print('feature mean shape:{}, std shape:{}'.format(mean.shape, stdev.shape))

    g.nodes['target'].data['features'] = features

    print("Getting labels")
    n_nodes = g.number_of_nodes('target')

    labels, _, test_mask = get_labels(target_id_to_node,
                                               n_nodes,
                                               args.target_ntype,
                                               os.path.join(args.training_dir, args.labels),
                                               os.path.join(args.training_dir, args.new_accounts))
    print("Got labels")

    labels = th.from_numpy(labels).float()
    test_mask = th.from_numpy(test_mask).float()

    n_nodes = th.sum(th.tensor([g.number_of_nodes(n_type) for n_type in g.ntypes]))
    n_edges = th.sum(th.tensor([g.number_of_edges(e_type) for e_type in g.etypes]))

    print("""----Data statistics------'
                #Nodes: {}
                #Edges: {}
                #Features Shape: {}
                #Labeled Test samples: {}""".format(n_nodes,
                                                      n_edges,
                                                      features.shape,
                                                      test_mask.sum()))

    if args.num_gpus:
        cuda = True
        device = th.device('cuda:0')
    else:
        cuda = False
        device = th.device('cpu')

    print("Initializing Model")
    in_feats = features.shape[1]
    n_classes = 2

    ntype_dict = {n_type: g.number_of_nodes(n_type) for n_type in g.ntypes}

    model = get_model(ntype_dict, g.etypes, vars(args), in_feats, n_classes, device)
    print("Initialized Model")

    features = features.to(device)

    labels = labels.long().to(device)
    test_mask = test_mask.to(device)

    loss = th.nn.CrossEntropyLoss()

    # print(model)
    optim = th.optim.Adam(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    print("Starting Model training")
    model, class_preds, pred_proba = train_fg(model, optim, loss, features, labels, g, g,
                                              test_mask, device, args.n_epochs,
                                              args.threshold,  args.compute_metrics)
    print("Finished Model training")

    print("Saving model")
    save_model(g, model, args.model_dir, id_to_node, mean, stdev)
    print("Model and metadata saved")