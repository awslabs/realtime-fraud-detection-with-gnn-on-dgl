import * as path from 'path';
import { IVpc, ISecurityGroup, SecurityGroup } from '@aws-cdk/aws-ec2';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { IFunction, Runtime } from '@aws-cdk/aws-lambda';
import { PythonFunction, PythonLayerVersion } from '@aws-cdk/aws-lambda-python';
import { IQueue } from '@aws-cdk/aws-sqs';
import { Construct, Duration, Stack, NestedStack, NestedStackProps } from '@aws-cdk/core';

export interface InferenceProps extends NestedStackProps {
  readonly vpc: IVpc;
  readonly neptune: {
    endpoint: string;
    port: string;
    clusterResourceId: string;
  };
  readonly queue:IQueue;
  readonly preprocessingJob_id_cols: String;
}

export class InferenceStack extends NestedStack {
  readonly inferenceSG: ISecurityGroup;
  readonly inferenceStatsFn: IFunction;

  constructor(scope: Construct, id: string, props: InferenceProps) {
    super(scope, id, props);

    const endpointName = 'FraudDetection'.toLowerCase();

    this.inferenceStatsFn = new PythonFunction(this, 'InferenceStatsFn', {
      entry: path.join(__dirname, '../lambda.d/inference/func'),
      layers: [
        new PythonLayerVersion(this, 'InferenceDataLayer', {
          entry: path.join(__dirname, '../lambda.d/inference/layer'),
          compatibleRuntimes: [Runtime.PYTHON_3_8],
        }),
        new PythonLayerVersion(this, 'InferenceNeptuneLibLayer', {
          entry: path.join(__dirname, '../script-libs/amazon-neptune-tools/neptune-python-utils'),
          compatibleRuntimes: [Runtime.PYTHON_3_8],
        }),
      ],
      index: 'inferenceApi.py',
      runtime: Runtime.PYTHON_3_8,
      handler: 'handler',
      timeout: Duration.minutes(2),
      memorySize: 512,
      environment: {
        MAX_FEATURE_NODE: String(30),
        CLUSTER_ENDPOINT: props.neptune.endpoint,
        CLUSTER_PORT: props.neptune.port,
        CLUSTER_REGION: String(this.region),
        ENDPOINT_NAME: endpointName,
        MODEL_BTW: String(0.9),
        QUEUE_URL: props.queue.queueUrl,
        TRANSACTION_ID_COLS: String(props.preprocessingJob_id_cols),
        IDENTITIES_COLS: 'id_01,id_02,id_03,id_04,id_05,id_06,id_07,id_08,id_09,id_10,id_11,id_12,id_13,id_14,id_15,id_16,id_17,id_18,id_19,id_20,id_21,id_22,id_23,id_24,id_25,id_26,id_27,id_28,id_29,id_30,id_31,id_32,id_33,id_34,id_35,id_36,id_37,id_38',
        NEIGHBOR_COLS: 'TransactionAmt,dist1,dist2,C1,C2,C3,C4,C5,C6,C7,C8,C9,C10,C11,C12,C13,C14,D1,D2,D3,D4,D5,D6,D7,D8,D9,D10,D11,D12,D13,D14,D15,V1,V2,V3,V4,V5,V6,V7,V8,V9,V10,V11,V12,V13,V14,V15,V16,V17,V18,V19,V20,V21,V22,V23,V24,V25,V26,V27,V28,V29,V30,V31,V32,V33,V34,V35,V36,V37,V38,V39,V40,V41,V42,V43,V44,V45,V46,V47,V48,V49,V50,V51,V52,V53,V54,V55,V56,V57,V58,V59,V60,V61,V62,V63,V64,V65,V66,V67,V68,V69,V70,V71,V72,V73,V74,V75,V76,V77,V78,V79,V80,V81,V82,V83,V84,V85,V86,V87,V88,V89,V90,V91,V92,V93,V94,V95,V96,V97,V98,V99,V100,V101,V102,V103,V104,V105,V106,V107,V108,V109,V110,V111,V112,V113,V114,V115,V116,V117,V118,V119,V120,V121,V122,V123,V124,V125,V126,V127,V128,V129,V130,V131,V132,V133,V134,V135,V136,V137,V138,V139,V140,V141,V142,V143,V144,V145,V146,V147,V148,V149,V150,V151,V152,V153,V154,V155,V156,V157,V158,V159,V160,V161,V162,V163,V164,V165,V166,V167,V168,V169,V170,V171,V172,V173,V174,V175,V176,V177,V178,V179,V180,V181,V182,V183,V184,V185,V186,V187,V188,V189,V190,V191,V192,V193,V194,V195,V196,V197,V198,V199,V200,V201,V202,V203,V204,V205,V206,V207,V208,V209,V210,V211,V212,V213,V214,V215,V216,V217,V218,V219,V220,V221,V222,V223,V224,V225,V226,V227,V228,V229,V230,V231,V232,V233,V234,V235,V236,V237,V238,V239,V240,V241,V242,V243,V244,V245,V246,V247,V248,V249,V250,V251,V252,V253,V254,V255,V256,V257,V258,V259,V260,V261,V262,V263,V264,V265,V266,V267,V268,V269,V270,V271,V272,V273,V274,V275,V276,V277,V278,V279,V280,V281,V282,V283,V284,V285,V286,V287,V288,V289,V290,V291,V292,V293,V294,V295,V296,V297,V298,V299,V300,V301,V302,V303,V304,V305,V306,V307,V308,V309,V310,V311,V312,V313,V314,V315,V316,V317,V318,V319,V320,V321,V322,V323,V324,V325,V326,V327,V328,V329,V330,V331,V332,V333,V334,V335,V336,V337,V338,V339',
        DUMMIED_COL: 'M1_F,M1_T,M2_F,M2_T,M3_F,M3_T,M4_M0,M4_M1,M4_M2,M5_F,M5_T,M6_F,M6_T,M7_F,M7_T,M8_F,M8_T,M9_F,M9_T',
      },
      vpc: props.vpc,
      securityGroup: this.inferenceSG = new SecurityGroup(this, 'inferenceSG', {
        vpc: props.vpc,
        allowAllOutbound: true,
      }),
    });
    props.queue.grantSendMessages(this.inferenceStatsFn);

    this.inferenceStatsFn.addToRolePolicy(new PolicyStatement({
      actions: ['neptune-db:connect'],
      resources: [
        Stack.of(this).formatArn({
          service: 'neptune-db',
          resource: props.neptune.clusterResourceId,
          resourceName: '*',
        }),
      ],
    }),
    );

    this.inferenceStatsFn.addToRolePolicy(new PolicyStatement({
      actions: ['sagemaker:InvokeEndpoint'],
      resources: [
        Stack.of(this).formatArn({
          service: 'sagemaker',
          resource: 'endpoint',
          resourceName: endpointName,
        }),
      ],
    }),
    );

  }
}

