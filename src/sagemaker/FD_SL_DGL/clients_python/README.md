# Endpoint Test Client

This folder contains a python based client that can test the deployed SageMaker endpoint,
and a subgraph file for testing by the client codes.

Requirements
--------------
- Python >= 3.6
- DGL == 0.6.*
- Boto3
- Json5
- Numpy

How to run the test client
---------------------------
In the clients_python folder, run
```bash
python client_boto_demo.py --endpoint_name <yourdeployedendpointname> --test_round 10
```

The output would be a tuple with two values, which indicate the logits of being 0 (negative) or 1 (positive).
If the logit of 1 is larger than 0, then the node has higher possibility to be a fraud transaction.

The output also has an average response time of the number of endpoint calls. The argument --test_round specified the
number of calls.




