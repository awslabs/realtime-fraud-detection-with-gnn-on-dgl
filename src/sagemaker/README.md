# GNN Fraud detection on DGL

This folder contains below code,

- train RGCN model with DGL by container image in Amazon SageMaker;
- deploy the inference endpoint with code in Amazon SageMaker;
- [test client for inference endpoint](code/);
- Jupyter notebooks go through the process of training model, deploying inference endpoint and testing the inference endpoint. NOTE: make sure using the EC2(such as `c5.4xlarge`, `m5.2xlarge` or `r5.xlarge`), SageMaker notebook or local env with 32G+ memory and 100G+ free disk space.

Requirements of Python packages for local env,
--------------
- DGL == 0.6.*
- SageMaker >= 2.40.0 < 3.0.0
- awscli >= 1.18.140
- PyTorch >= 1.6.0 < 1.7.0
- Python >= 3.6
- pandas
- sklearn
- matplotlib
