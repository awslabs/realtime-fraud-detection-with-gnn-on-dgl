在启动解决方案之前，请查看本指南中区域支持、架构和组件。 按照本节中的分步说明配置解决方案并将其部署到您的帐户中。

部署时间：约 30 分钟

## 部署概述
在 AWS 上部署此架构的过程包括以下步骤。有关详细说明，请按照每个步骤的链接进行操作。

[步骤 1. 启动堆栈](#1)

- 在您的 AWS 账户中启动 AWS CloudFormation 模板。
- 查看模板参数，并在必要时进行调整。

[步骤 2. 启动数据处理、模型训练及部署流水线](#2)

- 启动模型训练及发布流水线。

[步骤 3. 模拟在线交易请求](#3)

- 可视化实时反欺诈接口的检测结果

## 步骤 1. 启动堆栈

此自动化 AWS CloudFormation 模板在 AWS 云中部署基于深度学习图神经网络的实时反欺诈解决方案。

1. 登录 AWS 管理控制台并选择下面链接以启动 AWS CloudFormation 模板。
    - [启动模板][launch-template]
    - [启动模板，业务系统支持自定义域名][launch-template-with-custom-domain]
    
    或者，您可以[下载模板][template-url]开始您自己自定义实施。

2. 默认情况下，模板在美国东部（弗吉尼亚北部）区域启动。 要在不同的 AWS 区域中启动解决方案，请使用控制台导航栏中的区域选择器。
3. 在**创建堆栈**页面上，验证正确的模板 URL 位于 Amazon S3 URL 文本框中，然后选择下一步。
4. 在**指定堆栈详细信息**页面上，为您的解决方案堆栈分配一个账户内唯一且符合命名要求的名称。有关命名字符限制的信息，请参阅 `AWS Identity and Access Management 用户指南`中的 [IAM 和 STS 限制][iam-limit]。
5. 在**参数**部分，查看此解决方案模板的参数并根据需要进行修改。 此解决方案使用以下默认值。

    |         参数        |    默认值    |                                                      描述                                                      |
    |:-------------------:|:------------:|:--------------------------------------------------------------------------------------------------------------|
    |  NeptuneInstaneType | db.r5.xlarge | 指定 Neptune 实例的类型，可选值包括，db.r5.xlarge、db.r5.2xlarge、db.r5.4xlarge、db.r5.8xlarge、db.r5.12xlarge |

    以下参数仅当部署可自定义域名模板时需指定。
    
    |         参数        |    默认值    |                                                      描述                                                      |
    |:-------------------:|:------------:|:--------------------------------------------------------------------------------------------------------------|
    |   DashboardDomain   |              |            指定解决方案部署的业务系统的自定义域名。**注意**：必须是下面选择的托管区域可解析的子域名            |
    | Route53HostedZoneId |              |                                  选择当前部署账户的 `Route 53` 中公共托管区域                                  |

6. 选择**下一步**。
7. 在**配置堆栈选项**页面上，选择**下一步**。
8. 在**审核**页面上，查看并确认设置。 选中确认模板将创建 AWS Identity and Access Management (IAM) 资源的框。
9. 选择**创建堆栈**以部署堆栈。

您可以在 AWS CloudFormation 控制台的状态列中查看堆栈的状态。 您应该会在大约三十分钟内收到 `CREATE_COMPLETE` 状态。

## 步骤 2. 启动数据处理、模型训练及部署流水线

通过解决方案部署的 AWS Step Functions 工作流来处理交易数据、训练基于图神经网络的深度学习反欺诈模型，最终部署模型推理节点。

1. 登录 AWS 管理控制台。
2. 控制台中打开 AWS Step Functions 服务，选择**状态机**。
3. 打开 **ModelTrainingPipeline** 名称开头的状态机，选择**启动执行**，使用默认输入值启动执行。

您可以在状态机执行任务详情信息查看执行状态。您会在大约三个小时内收到 `已成功` 状态。

> **注意**：
> 流水线完整的执行时间跟部署时指定的 Amazon Neptune 实例大小相关，选用 `db.r5.8xlarge` 或之上的实例，流水线执行时间在两个小时之内。

## 步骤 3. 模拟在线交易请求

1. 访问解决方案部署时创建的业务监控系统。业务系统的访问域名可以在 AWS CloudFormation 堆栈输出中找到。AWS 管理控制台中打开 AWS CloudFormation 服务，打开堆栈 `realtime-fraud-detection-with-gnn-on-dgl` 或您自定义的堆栈名称，点击**输出**，查找键 `DashboardWebsiteUrl`，它的值是业务系统的 CloudFront 域名或您指定的自定义域名。
2. 点击**模拟数据**按钮，输入符合要求的模拟数据参数来指定模拟数据持续时间、并发个数以及模拟数据请求之间的间隔时间。或使用默认参数，将使用十个并发程序持续模拟在线交易请求五分钟，每个并发程序将间隔三秒发送一次在线交易请求。设置参数完成后，点击**模拟**按钮开始模拟在线交易。
3. 模拟程序后台将花费小于两分钟时间准备测试交易数据，在约三分钟后，监控系统将统计到在线交易的情况，包括默认最近五分钟内收到的交易请求笔数，以及实时反欺诈解决方案检测出的欺诈交易笔数。

[launch-template]: https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=fraud-detection-on-dgl&templateURL=https://aws-gcr-solutions.s3.amazonaws.com/Realtime-fraud-detection-with-gnn-on-dgl-rel/latest/realtime-fraud-detection-with-gnn-on-dgl.template.json
[launch-template-with-custom-domain]: https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=fraud-detection-on-dgl&templateURL=https://aws-gcr-solutions.s3.amazonaws.com/Realtime-fraud-detection-with-gnn-on-dgl-rel/latest/realtime-fraud-detection-with-gnn-on-dgl-with-custom-domain.template.json
[template-url]: https://aws-gcr-solutions.s3.amazonaws.com/fraud-detection-on-dgl/latest/realtime-fraud-detection-with-gnn-on-dgl.template.json
[iam-limit]: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html