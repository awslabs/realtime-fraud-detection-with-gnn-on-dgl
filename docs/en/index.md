The solution **Real-time Fraud Detection with Graph Neural Network on DGL** is an end-to-end solution for real-time fraud detection which leverages graph database [Amazon Neptune][neptune], [Amazon SageMaker][sagemaker] and [Deep Graph Library][dgl] (DGL) to construct a heterogeneous graph from tabular data and train a Graph Neural Network(GNN) model to detect fraudulent transactions in the [IEEE-CIS dataset][ieee-cis-dataset].

The solutions consists of below major features:

- uses the [Deep Graph Library][dgl](DGL) to build machine learning model. DGL is an advanced open source framework designed for graph neural network
- has a complete workflow pipeline for model training and updating, including data ingesting, data processing, model training, model rolling update
- leverages Graph database to do real-time fraud detection

This implementation guide discusses architectural considerations and configuration steps for deploying the Real-time Fraud Detection with Graph Neural Network on DGL solution in the Amazon Web Services (AWS) Cloud. It includes a link to an AWS CloudFormation template that launches and configures the AWS services required to deploy this solution using AWS best practices for security and availability.

The guide is intended for IT architects, developers, DevOps and data analysts who have practical experience architecting in the AWS Cloud and data scientists and algorithm engineers with few AWS knowledge.

[ieee-cis-dataset]: https://www.kaggle.com/c/ieee-fraud-detection/
[dgl]: https://www.dgl.ai/
[neptune]: https://aws.amazon.com/en/neptune/
[sagemaker]: https://aws.amazon.com/en/sagemaker/
[cloudformation]: https://aws.amazon.com/en/cloudformation/