基于深度学习图神经网络的实时反欺诈解决方案是一个端到端的实时反欺诈解决方案参考实现，它使用 [Deep Graph Library][dgl](DGL) ，图数据库 [Amazon Neptune][neptune] , 机器学习服务 [Amazon SageMaker][sagemaker] 等AWS服务，将 [IEEE-CIS][ieee-cis-dataset] 在线金融交易的表格数据转化为异构图数据，并训练图神经网络模型来实现欺诈交易的检测。

该解决方案包括以下主要功能：

- 基于 [Deep Graph Library][dgl](DGL) 构建领先的图神经网络模型
- 提供完整的模型训练及迭代流水线，各步骤包括数据注入、数据清洗、模型训练、模型更新上线
- 利用图数据库支持实时反欺诈的检测


本实施指南介绍了在 Amazon Web Services (AWS) 云中部署基于深度学习图神经网络的实时反欺诈解决方案的架构注意事项和配置步骤。 它包含指向 [AWS CloudFormation][cloudformation] 模板的链接，这些模板使用 AWS 安全性和可用性最佳实践来启动和配置部署此解决方案所需的 AWS 服务。

本指南面向具有 AWS 云架构实践经验的 IT 架构师、开发人员、DevOps、数据科学家和算法工程师等专业人士。

[ieee-cis-dataset]: https://www.kaggle.com/c/ieee-fraud-detection/
[dgl]: https://www.dgl.ai/
[neptune]: https://aws.amazon.com/neptune/
[sagemaker]: https://aws.amazon.com/sagemaker/
[cloudformation]: https://aws.amazon.com/cn/cloudformation/