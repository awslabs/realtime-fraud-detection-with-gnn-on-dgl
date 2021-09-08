# SageMaker PyTorch image v1.4.0
ARG IMAGE_REPO=763104351884.dkr.ecr.us-east-1.amazonaws.com
FROM $IMAGE_REPO/pytorch-training:1.6.0-cpu-py36-ubuntu16.04

ENV PATH="/opt/ml/code:${PATH}"

# this environment variable is used by the SageMaker PyTorch container to determine our user code directory.
ENV SAGEMAKER_SUBMIT_DIRECTORY /opt/ml/code

# /opt/ml and all subdirectories are utilized by SageMaker, use the /code subdirectory to store your user code.
# COPY cifar10.py /opt/ml/code/cifar10.py
COPY * /opt/ml/code/

# Defines fd_sl_train_entry_point.py as script entrypoint 
ENV SAGEMAKER_PROGRAM fd_sl_train_entry_point.py

# Install requirements
RUN pip install dgl==0.6.*