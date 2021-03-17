import argparse
import logging
import os

import pandas as pd
import numpy as np
from itertools import combinations


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', type=str, default='/opt/ml/processing/input')
    parser.add_argument('--output-dir', type=str, default='/opt/ml/processing/output')
    parser.add_argument('--transactions', type=str, default='transaction.csv', help='name of file with transactions')
    parser.add_argument('--identity', type=str, default='identity.csv', help='name of file with identity info')
    parser.add_argument('--id-cols', type=str, default='', help='comma separated id cols in transactions table')
    parser.add_argument('--cat-cols', type=str, default='', help='comma separated categorical cols in transactions')
    parser.add_argument('--train-data-ratio', type=float, default=0.8, help='fraction of data to use in training set')
    parser.add_argument('--construct-homogeneous', action="store_true", default=False,
                        help='use bipartite graphs edgelists to construct homogenous graph edgelist')
    return parser.parse_args()


def get_logger(name):
    logger = logging.getLogger(name)
    log_format = '%(asctime)s %(levelname)s %(name)s: %(message)s'
    logging.basicConfig(format=log_format, level=logging.INFO)
    logger.setLevel(logging.INFO)
    return logger


def load_data(data_dir, transaction_data, identity_data, train_data_ratio, output_dir):
    transaction_df = pd.read_csv(os.path.join(data_dir, transaction_data))
    logging.info("Shape of transaction data is {}".format(transaction_df.shape))
    logging.info("# Tagged transactions: {}".format(len(transaction_df) - transaction_df.isFraud.isnull().sum()))

    identity_df = pd.read_csv(os.path.join(data_dir, identity_data))
    logging.info("Shape of identity data is {}".format(identity_df.shape))

    # extract out transactions for test/validation
    n_train = int(transaction_df.shape[0]*train_data_ratio)
    test_ids = transaction_df.TransactionID.values[n_train:]

    get_fraud_frac = lambda series: 100 * sum(series)/len(series)
    logging.info("Percent fraud for train transactions: {}".format(get_fraud_frac(transaction_df.isFraud[:n_train])))
    logging.info("Percent fraud for test transactions: {}".format(get_fraud_frac(transaction_df.isFraud[n_train:])))
    logging.info("Percent fraud for all transactions: {}".format(get_fraud_frac(transaction_df.isFraud)))

    with open(os.path.join(output_dir, 'test.csv'), 'w') as f:
        f.writelines(map(lambda x: str(x) + "\n", test_ids))
    logging.info("Wrote test to file: {}".format(os.path.join(output_dir, 'test.csv')))

    return transaction_df, identity_df, test_ids


def get_features_and_labels(transactions_df, transactions_id_cols, transactions_cat_cols, output_dir):
    # Get features
    non_feature_cols = ['isFraud', 'TransactionDT'] + transactions_id_cols.split(",")
    feature_cols = [col for col in transactions_df.columns if col not in non_feature_cols]
    logging.info("Categorical columns: {}".format(transactions_cat_cols.split(",")))
    features = pd.get_dummies(transactions_df[feature_cols], columns=transactions_cat_cols.split(",")).fillna(0)
    features['TransactionAmt'] = features['TransactionAmt'].apply(np.log10)
    logging.info("Transformed feature columns: {}".format(list(features.columns)))
    logging.info("Shape of features: {}".format(features.shape))
    features.to_csv(os.path.join(output_dir, 'features.csv'), index=False, header=False)
    logging.info("Wrote features to file: {}".format(os.path.join(output_dir, 'features.csv')))

    # Get labels
    transactions_df[['TransactionID', 'isFraud']].to_csv(os.path.join(output_dir, 'tags.csv'), index=False)
    logging.info("Wrote labels to file: {}".format(os.path.join(output_dir, 'tags.csv')))


def get_relations_and_edgelist(transactions_df, identity_df, transactions_id_cols, output_dir):
    # Get relations
    edge_types = transactions_id_cols.split(",") + list(identity_df.columns)
    logging.info("Found the following distinct relation types: {}".format(edge_types))
    id_cols = ['TransactionID'] + transactions_id_cols.split(",")
    full_identity_df = transactions_df[id_cols].merge(identity_df, on='TransactionID', how='left')
    logging.info("Shape of identity columns: {}".format(full_identity_df.shape))

    # extract edges
    edges = {}
    for etype in edge_types:
        edgelist = full_identity_df[['TransactionID', etype]].dropna()
        edgelist.to_csv(os.path.join(output_dir, 'relation_{}_edgelist.csv').format(etype), index=False, header=True)
        logging.info("Wrote edgelist to: {}".format(os.path.join(output_dir, 'relation_{}_edgelist.csv').format(etype)))
        edges[etype] = edgelist
    return edges


def create_homogeneous_edgelist(edges, output_dir):
    homogeneous_edges = []
    for etype, relations in edges.items():
        for edge_relation, frame in relations.groupby(etype):
            new_edges = [(a, b) for (a, b) in combinations(frame.TransactionID.values, 2)
                         if (a, b) not in homogeneous_edges and (b, a) not in homogeneous_edges]
            homogeneous_edges.extend(new_edges)

    with open(os.path.join(output_dir, 'homogeneous_edgelist.csv'), 'w') as f:
        f.writelines(map(lambda x: "{}, {}\n".format(x[0], x[1]), homogeneous_edges))
    logging.info("Wrote homogeneous edgelist to file: {}".format(os.path.join(output_dir, 'homogeneous_edgelist.csv')))


if __name__ == '__main__':
    logging = get_logger(__name__)

    args = parse_args()

    transactions, identity, test_transactions = load_data(args.data_dir,
                                                          args.transactions,
                                                          args.identity,
                                                          args.train_data_ratio,
                                                          args.output_dir)

    get_features_and_labels(transactions, args.id_cols, args.cat_cols, args.output_dir)
    relational_edges = get_relations_and_edgelist(transactions, identity, args.id_cols, args.output_dir)

    if args.construct_homogeneous:
        create_homogeneous_edgelist(relational_edges, args.output_dir)



