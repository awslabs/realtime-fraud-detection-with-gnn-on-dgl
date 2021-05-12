# GNN Fraud detection on DGL

This folder contains below code,

- train RGCN model with DGL by container image in Amazon SageMaker;
- deploy the inference endpoint with code in Amazon SageMaker;
- [test client for inference endpoint](code/);
- Jupyter notebooks go through the process of training model and deploying inference endpoint

Requirements of Python packages for local env,
--------------
- DGL == 0.6.*
- SageMaker == 1.72.0
- awscli >= 1.18.140
- SageMaker PyTorch >= 1.6.0 < 1.7.0
- Python >= 3.6
- pandas
- sklearn
- matplotlib
