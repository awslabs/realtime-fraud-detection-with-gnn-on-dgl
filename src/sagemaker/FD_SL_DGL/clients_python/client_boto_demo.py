
import boto3
import argparse
import json

from datetime import datetime as dt
import numpy as np
import pickle


def load_subgraph(file_path):
    """
    Revise this function to fit with new input format
    :param file_path:
    :return:
    """
    print('------------------ Loading Graph -------------------')
    with open(file_path, 'rb') as f:
        graph_dict = pickle.load(f)
        # print(subgraph_dict)
        subgraph_dict = graph_dict['subgraph_dict']
        n_feat_dict = graph_dict['n_feat_dict']

        # generate fake node features
        # new_subgraph_dict = {}
        # n_lists = {}
        # for can_etype, e_lists in subgraph_dict.items():
        #     src_type, etype, dst_type = can_etype
        #     src_list, dst_list = e_lists
        #     src_list = [src_type + '-' + str(nid) for nid in src_list]
        #     dst_list = [dst_type + '-' + str(nid) for nid in dst_list]
        #
        #     # change canonical etype from tuple to string
        #     new_subgraph_dict['{}<>{}'.format(src_type, dst_type)] = (src_list.tolist(), dst_list.tolist())
        #
        #     if n_lists.get(src_type) is not None:
        #         n_lists[src_type] = np.append(n_lists.get(src_type), src_list)
        #     else:
        #         n_lists[src_type] = src_list
        #
        #     if n_lists.get(dst_type) is not None:
        #         n_lists[dst_type] = np.append(n_lists.get(dst_type), dst_list)
        #     else:
        #         n_lists[dst_type] = dst_list
        #
        # n_feats = {}
        # for ntype, n_list in n_lists.items():
        #     # print(np.unique(n_list))
        #     num_nodes = np.unique(n_list).size
        #     print(ntype, num_nodes)
        #     # n_feats[ntype] = np.random.randint(0,100, size=(num_nodes, 390)).tolist()
        #     n_feats[ntype] = np.random.rand(size=(num_nodes, 390)).astype(np.float32).tolist()

    return subgraph_dict, n_feat_dict


class smBotoClient(object):
    
    def __init__(self, endpointname=None, testgraphpath=None):
        self.endpointname = endpointname
        self.runtime = boto3.client('runtime.sagemaker')
        self.subgraph_dict, self.n_feats = load_subgraph(testgraphpath)

    def invoke_endpoint_with_idx(self, target_id=100, test_rounds=10):

        s_t = dt.now()

        for i in range(test_rounds):

            payload = {
                'graph': self.subgraph_dict,
                'n_feats': self.n_feats,
                'target_id': target_id
            }

            response = self.runtime.invoke_endpoint(EndpointName=self.endpointname,
                                                    ContentType='application/json',
                                                    Body=json.dumps(payload))

            res_body = response['Body'].read()
            results = json.loads(res_body)

            pred_prob = results
            print(pred_prob)

        e_t = dt.now()
        print(f'Total test {test_rounds} rounds, using {(e_t - s_t).total_seconds()} seconds')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SageMaker Client Single Process')
    parser.add_argument('--endpoint_name', type=str, default='', help='SageMaker endpoint name')
    parser.add_argument('--test_graph_path', type=str, default='./subgraph.pkl', help='Test graph path')
    parser.add_argument('--target_id', type=int, default='3189753', help='Target node ID for prediction')
    parser.add_argument('--test_round', type=int, default=1, help='Test round times')

    args = parser.parse_args()

    EP_NAME = args.endpoint_name
    TEST_GRAPH_PATH=args.test_graph_path
    TARGET_ID = args.target_id
    TEST_ROUND = args.test_round

    print('Endpoint name: {}'.format(EP_NAME))
    print('Target ID: {}'.format(TARGET_ID))
    print('Test rounds: {}'.format(TEST_ROUND))

    # load_subgraph(args.test_graph_path)
    sm_client = smBotoClient(endpointname=EP_NAME, testgraphpath=TEST_GRAPH_PATH)
    sm_client.invoke_endpoint_with_idx(TARGET_ID, TEST_ROUND)
