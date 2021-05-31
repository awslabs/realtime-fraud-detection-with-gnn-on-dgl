import * as cdk from '@aws-cdk/core';
import { CfnFeatureGroup } from '@aws-cdk/aws-sagemaker';
// import { Column } from '@aws-cdk/aws-glue/lib/schema';
// import { Schema } from '@aws-cdk/aws-glue';

export const FEATURE_DEFINITIONS: Array<CfnFeatureGroup.FeatureDefinitionProperty | cdk.IResolvable> | cdk.IResolvable = [
    {
        "featureName": 'TransactionID',
        "featureType": 'String',
    },
    {
        "featureName": 'TransactionAmt',
        "featureType": 'String',
    },
    {
        "featureName": 'dist1',
        "featureType": 'String',
    },
    {
        "featureName": 'dist2',
        "featureType": 'String',
    },
    {
        "featureName": 'C1',
        "featureType": 'String',
    },
    {
        "featureName": 'C2',
        "featureType": 'String',
    },
    {
        "featureName": 'C3',
        "featureType": 'String',
    },
    {
        "featureName": 'C4',
        "featureType": 'String',
    },
    {
        "featureName": 'C5',
        "featureType": 'String',
    },
    {
        "featureName": 'C6',
        "featureType": 'String',
    },
    {
        "featureName": 'C7',
        "featureType": 'String',
    },
    {
        "featureName": 'C8',
        "featureType": 'String',
    },
    {
        "featureName": 'C9',
        "featureType": 'String',
    },
    {
        "featureName": 'C10',
        "featureType": 'String',
    },
    {
        "featureName": 'C11',
        "featureType": 'String',
    },
    {
        "featureName": 'C12',
        "featureType": 'String',
    },
    {
        "featureName": 'C13',
        "featureType": 'String',
    },
    {
        "featureName": 'C14',
        "featureType": 'String',
    },
    {
        "featureName": 'D1',
        "featureType": 'String',
    },
    {
        "featureName": 'D2',
        "featureType": 'String',
    },
    {
        "featureName": 'D3',
        "featureType": 'String',
    },
    {
        "featureName": 'D4',
        "featureType": 'String',
    },
    {
        "featureName": 'D5',
        "featureType": 'String',
    },
    {
        "featureName": 'D6',
        "featureType": 'String',
    },
    {
        "featureName": 'D7',
        "featureType": 'String',
    },
    {
        "featureName": 'D8',
        "featureType": 'String',
    },
    {
        "featureName": 'D9',
        "featureType": 'String',
    },
    {
        "featureName": 'D10',
        "featureType": 'String',
    },
    {
        "featureName": 'D11',
        "featureType": 'String',
    },
    {
        "featureName": 'D12',
        "featureType": 'String',
    },
    {
        "featureName": 'D13',
        "featureType": 'String',
    },
    {
        "featureName": 'D14',
        "featureType": 'String',
    },
    {
        "featureName": 'D15',
        "featureType": 'String',
    },
    {
        "featureName": 'V1',
        "featureType": 'String',
    },
    {
        "featureName": 'V2',
        "featureType": 'String',
    },
    {
        "featureName": 'V3',
        "featureType": 'String',
    },
    {
        "featureName": 'V4',
        "featureType": 'String',
    },
    {
        "featureName": 'V5',
        "featureType": 'String',
    },
    {
        "featureName": 'V6',
        "featureType": 'String',
    },
    {
        "featureName": 'V7',
        "featureType": 'String',
    },
    {
        "featureName": 'V8',
        "featureType": 'String',
    },
    {
        "featureName": 'V9',
        "featureType": 'String',
    },
    {
        "featureName": 'V10',
        "featureType": 'String',
    },
    {
        "featureName": 'V11',
        "featureType": 'String',
    },
    {
        "featureName": 'V12',
        "featureType": 'String',
    },
    {
        "featureName": 'V13',
        "featureType": 'String',
    },
    {
        "featureName": 'V14',
        "featureType": 'String',
    },
    {
        "featureName": 'V15',
        "featureType": 'String',
    },
    {
        "featureName": 'V16',
        "featureType": 'String',
    },
    {
        "featureName": 'V17',
        "featureType": 'String',
    },
    {
        "featureName": 'V18',
        "featureType": 'String',
    },
    {
        "featureName": 'V19',
        "featureType": 'String',
    },
    {
        "featureName": 'V20',
        "featureType": 'String',
    },
    {
        "featureName": 'V21',
        "featureType": 'String',
    },
    {
        "featureName": 'V22',
        "featureType": 'String',
    },
    {
        "featureName": 'V23',
        "featureType": 'String',
    },
    {
        "featureName": 'V24',
        "featureType": 'String',
    },
    {
        "featureName": 'V25',
        "featureType": 'String',
    },
    {
        "featureName": 'V26',
        "featureType": 'String',
    },
    {
        "featureName": 'V27',
        "featureType": 'String',
    },
    {
        "featureName": 'V28',
        "featureType": 'String',
    },
    {
        "featureName": 'V29',
        "featureType": 'String',
    },
    {
        "featureName": 'V30',
        "featureType": 'String',
    },
    {
        "featureName": 'V31',
        "featureType": 'String',
    },
    {
        "featureName": 'V32',
        "featureType": 'String',
    },
    {
        "featureName": 'V33',
        "featureType": 'String',
    },
    {
        "featureName": 'V34',
        "featureType": 'String',
    },
    {
        "featureName": 'V35',
        "featureType": 'String',
    },
    {
        "featureName": 'V36',
        "featureType": 'String',
    },
    {
        "featureName": 'V37',
        "featureType": 'String',
    },
    {
        "featureName": 'V38',
        "featureType": 'String',
    },
    {
        "featureName": 'V39',
        "featureType": 'String',
    },
    {
        "featureName": 'V40',
        "featureType": 'String',
    },
    {
        "featureName": 'V41',
        "featureType": 'String',
    },
    {
        "featureName": 'V42',
        "featureType": 'String',
    },
    {
        "featureName": 'V43',
        "featureType": 'String',
    },
    {
        "featureName": 'V44',
        "featureType": 'String',
    },
    {
        "featureName": 'V45',
        "featureType": 'String',
    },
    {
        "featureName": 'V46',
        "featureType": 'String',
    },
    {
        "featureName": 'V47',
        "featureType": 'String',
    },
    {
        "featureName": 'V48',
        "featureType": 'String',
    },
    {
        "featureName": 'V49',
        "featureType": 'String',
    },
    {
        "featureName": 'V50',
        "featureType": 'String',
    },
    {
        "featureName": 'V51',
        "featureType": 'String',
    },
    {
        "featureName": 'V52',
        "featureType": 'String',
    },
    {
        "featureName": 'V53',
        "featureType": 'String',
    },
    {
        "featureName": 'V54',
        "featureType": 'String',
    },
    {
        "featureName": 'V55',
        "featureType": 'String',
    },
    {
        "featureName": 'V56',
        "featureType": 'String',
    },
    {
        "featureName": 'V57',
        "featureType": 'String',
    },
    {
        "featureName": 'V58',
        "featureType": 'String',
    },
    {
        "featureName": 'V59',
        "featureType": 'String',
    },
    {
        "featureName": 'V60',
        "featureType": 'String',
    },
    {
        "featureName": 'V61',
        "featureType": 'String',
    },
    {
        "featureName": 'V62',
        "featureType": 'String',
    },
    {
        "featureName": 'V63',
        "featureType": 'String',
    },
    {
        "featureName": 'V64',
        "featureType": 'String',
    },
    {
        "featureName": 'V65',
        "featureType": 'String',
    },
    {
        "featureName": 'V66',
        "featureType": 'String',
    },
    {
        "featureName": 'V67',
        "featureType": 'String',
    },
    {
        "featureName": 'V68',
        "featureType": 'String',
    },
    {
        "featureName": 'V69',
        "featureType": 'String',
    },
    {
        "featureName": 'V70',
        "featureType": 'String',
    },
    {
        "featureName": 'V71',
        "featureType": 'String',
    },
    {
        "featureName": 'V72',
        "featureType": 'String',
    },
    {
        "featureName": 'V73',
        "featureType": 'String',
    },
    {
        "featureName": 'V74',
        "featureType": 'String',
    },
    {
        "featureName": 'V75',
        "featureType": 'String',
    },
    {
        "featureName": 'V76',
        "featureType": 'String',
    },
    {
        "featureName": 'V77',
        "featureType": 'String',
    },
    {
        "featureName": 'V78',
        "featureType": 'String',
    },
    {
        "featureName": 'V79',
        "featureType": 'String',
    },
    {
        "featureName": 'V80',
        "featureType": 'String',
    },
    {
        "featureName": 'V81',
        "featureType": 'String',
    },
    {
        "featureName": 'V82',
        "featureType": 'String',
    },
    {
        "featureName": 'V83',
        "featureType": 'String',
    },
    {
        "featureName": 'V84',
        "featureType": 'String',
    },
    {
        "featureName": 'V85',
        "featureType": 'String',
    },
    {
        "featureName": 'V86',
        "featureType": 'String',
    },
    {
        "featureName": 'V87',
        "featureType": 'String',
    },
    {
        "featureName": 'V88',
        "featureType": 'String',
    },
    {
        "featureName": 'V89',
        "featureType": 'String',
    },
    {
        "featureName": 'V90',
        "featureType": 'String',
    },
    {
        "featureName": 'V91',
        "featureType": 'String',
    },
    {
        "featureName": 'V92',
        "featureType": 'String',
    },
    {
        "featureName": 'V93',
        "featureType": 'String',
    },
    {
        "featureName": 'V94',
        "featureType": 'String',
    },
    {
        "featureName": 'V95',
        "featureType": 'String',
    },
    {
        "featureName": 'V96',
        "featureType": 'String',
    },
    {
        "featureName": 'V97',
        "featureType": 'String',
    },
    {
        "featureName": 'V98',
        "featureType": 'String',
    },
    {
        "featureName": 'V99',
        "featureType": 'String',
    },
    {
        "featureName": 'V100',
        "featureType": 'String',
    },
    {
        "featureName": 'V101',
        "featureType": 'String',
    },
    {
        "featureName": 'V102',
        "featureType": 'String',
    },
    {
        "featureName": 'V103',
        "featureType": 'String',
    },
    {
        "featureName": 'V104',
        "featureType": 'String',
    },
    {
        "featureName": 'V105',
        "featureType": 'String',
    },
    {
        "featureName": 'V106',
        "featureType": 'String',
    },
    {
        "featureName": 'V107',
        "featureType": 'String',
    },
    {
        "featureName": 'V108',
        "featureType": 'String',
    },
    {
        "featureName": 'V109',
        "featureType": 'String',
    },
    {
        "featureName": 'V110',
        "featureType": 'String',
    },
    {
        "featureName": 'V111',
        "featureType": 'String',
    },
    {
        "featureName": 'V112',
        "featureType": 'String',
    },
    {
        "featureName": 'V113',
        "featureType": 'String',
    },
    {
        "featureName": 'V114',
        "featureType": 'String',
    },
    {
        "featureName": 'V115',
        "featureType": 'String',
    },
    {
        "featureName": 'V116',
        "featureType": 'String',
    },
    {
        "featureName": 'V117',
        "featureType": 'String',
    },
    {
        "featureName": 'V118',
        "featureType": 'String',
    },
    {
        "featureName": 'V119',
        "featureType": 'String',
    },
    {
        "featureName": 'V120',
        "featureType": 'String',
    },
    {
        "featureName": 'V121',
        "featureType": 'String',
    },
    {
        "featureName": 'V122',
        "featureType": 'String',
    },
    {
        "featureName": 'V123',
        "featureType": 'String',
    },
    {
        "featureName": 'V124',
        "featureType": 'String',
    },
    {
        "featureName": 'V125',
        "featureType": 'String',
    },
    {
        "featureName": 'V126',
        "featureType": 'String',
    },
    {
        "featureName": 'V127',
        "featureType": 'String',
    },
    {
        "featureName": 'V128',
        "featureType": 'String',
    },
    {
        "featureName": 'V129',
        "featureType": 'String',
    },
    {
        "featureName": 'V130',
        "featureType": 'String',
    },
    {
        "featureName": 'V131',
        "featureType": 'String',
    },
    {
        "featureName": 'V132',
        "featureType": 'String',
    },
    {
        "featureName": 'V133',
        "featureType": 'String',
    },
    {
        "featureName": 'V134',
        "featureType": 'String',
    },
    {
        "featureName": 'V135',
        "featureType": 'String',
    },
    {
        "featureName": 'V136',
        "featureType": 'String',
    },
    {
        "featureName": 'V137',
        "featureType": 'String',
    },
    {
        "featureName": 'V138',
        "featureType": 'String',
    },
    {
        "featureName": 'V139',
        "featureType": 'String',
    },
    {
        "featureName": 'V140',
        "featureType": 'String',
    },
    {
        "featureName": 'V141',
        "featureType": 'String',
    },
    {
        "featureName": 'V142',
        "featureType": 'String',
    },
    {
        "featureName": 'V143',
        "featureType": 'String',
    },
    {
        "featureName": 'V144',
        "featureType": 'String',
    },
    {
        "featureName": 'V145',
        "featureType": 'String',
    },
    {
        "featureName": 'V146',
        "featureType": 'String',
    },
    {
        "featureName": 'V147',
        "featureType": 'String',
    },
    {
        "featureName": 'V148',
        "featureType": 'String',
    },
    {
        "featureName": 'V149',
        "featureType": 'String',
    },
    {
        "featureName": 'V150',
        "featureType": 'String',
    },
    {
        "featureName": 'V151',
        "featureType": 'String',
    },
    {
        "featureName": 'V152',
        "featureType": 'String',
    },
    {
        "featureName": 'V153',
        "featureType": 'String',
    },
    {
        "featureName": 'V154',
        "featureType": 'String',
    },
    {
        "featureName": 'V155',
        "featureType": 'String',
    },
    {
        "featureName": 'V156',
        "featureType": 'String',
    },
    {
        "featureName": 'V157',
        "featureType": 'String',
    },
    {
        "featureName": 'V158',
        "featureType": 'String',
    },
    {
        "featureName": 'V159',
        "featureType": 'String',
    },
    {
        "featureName": 'V160',
        "featureType": 'String',
    },
    {
        "featureName": 'V161',
        "featureType": 'String',
    },
    {
        "featureName": 'V162',
        "featureType": 'String',
    },
    {
        "featureName": 'V163',
        "featureType": 'String',
    },
    {
        "featureName": 'V164',
        "featureType": 'String',
    },
    {
        "featureName": 'V165',
        "featureType": 'String',
    },
    {
        "featureName": 'V166',
        "featureType": 'String',
    },
    {
        "featureName": 'V167',
        "featureType": 'String',
    },
    {
        "featureName": 'V168',
        "featureType": 'String',
    },
    {
        "featureName": 'V169',
        "featureType": 'String',
    },
    {
        "featureName": 'V170',
        "featureType": 'String',
    },
    {
        "featureName": 'V171',
        "featureType": 'String',
    },
    {
        "featureName": 'V172',
        "featureType": 'String',
    },
    {
        "featureName": 'V173',
        "featureType": 'String',
    },
    {
        "featureName": 'V174',
        "featureType": 'String',
    },
    {
        "featureName": 'V175',
        "featureType": 'String',
    },
    {
        "featureName": 'V176',
        "featureType": 'String',
    },
    {
        "featureName": 'V177',
        "featureType": 'String',
    },
    {
        "featureName": 'V178',
        "featureType": 'String',
    },
    {
        "featureName": 'V179',
        "featureType": 'String',
    },
    {
        "featureName": 'V180',
        "featureType": 'String',
    },
    {
        "featureName": 'V181',
        "featureType": 'String',
    },
    {
        "featureName": 'V182',
        "featureType": 'String',
    },
    {
        "featureName": 'V183',
        "featureType": 'String',
    },
    {
        "featureName": 'V184',
        "featureType": 'String',
    },
    {
        "featureName": 'V185',
        "featureType": 'String',
    },
    {
        "featureName": 'V186',
        "featureType": 'String',
    },
    {
        "featureName": 'V187',
        "featureType": 'String',
    },
    {
        "featureName": 'V188',
        "featureType": 'String',
    },
    {
        "featureName": 'V189',
        "featureType": 'String',
    },
    {
        "featureName": 'V190',
        "featureType": 'String',
    },
    {
        "featureName": 'V191',
        "featureType": 'String',
    },
    {
        "featureName": 'V192',
        "featureType": 'String',
    },
    {
        "featureName": 'V193',
        "featureType": 'String',
    },
    {
        "featureName": 'V194',
        "featureType": 'String',
    },
    {
        "featureName": 'V195',
        "featureType": 'String',
    },
    {
        "featureName": 'V196',
        "featureType": 'String',
    },
    {
        "featureName": 'V197',
        "featureType": 'String',
    },
    {
        "featureName": 'V198',
        "featureType": 'String',
    },
    {
        "featureName": 'V199',
        "featureType": 'String',
    },
    {
        "featureName": 'V200',
        "featureType": 'String',
    },
    {
        "featureName": 'V201',
        "featureType": 'String',
    },
    {
        "featureName": 'V202',
        "featureType": 'String',
    },
    {
        "featureName": 'V203',
        "featureType": 'String',
    },
    {
        "featureName": 'V204',
        "featureType": 'String',
    },
    {
        "featureName": 'V205',
        "featureType": 'String',
    },
    {
        "featureName": 'V206',
        "featureType": 'String',
    },
    {
        "featureName": 'V207',
        "featureType": 'String',
    },
    {
        "featureName": 'V208',
        "featureType": 'String',
    },
    {
        "featureName": 'V209',
        "featureType": 'String',
    },
    {
        "featureName": 'V210',
        "featureType": 'String',
    },
    {
        "featureName": 'V211',
        "featureType": 'String',
    },
    {
        "featureName": 'V212',
        "featureType": 'String',
    },
    {
        "featureName": 'V213',
        "featureType": 'String',
    },
    {
        "featureName": 'V214',
        "featureType": 'String',
    },
    {
        "featureName": 'V215',
        "featureType": 'String',
    },
    {
        "featureName": 'V216',
        "featureType": 'String',
    },
    {
        "featureName": 'V217',
        "featureType": 'String',
    },
    {
        "featureName": 'V218',
        "featureType": 'String',
    },
    {
        "featureName": 'V219',
        "featureType": 'String',
    },
    {
        "featureName": 'V220',
        "featureType": 'String',
    },
    {
        "featureName": 'V221',
        "featureType": 'String',
    },
    {
        "featureName": 'V222',
        "featureType": 'String',
    },
    {
        "featureName": 'V223',
        "featureType": 'String',
    },
    {
        "featureName": 'V224',
        "featureType": 'String',
    },
    {
        "featureName": 'V225',
        "featureType": 'String',
    },
    {
        "featureName": 'V226',
        "featureType": 'String',
    },
    {
        "featureName": 'V227',
        "featureType": 'String',
    },
    {
        "featureName": 'V228',
        "featureType": 'String',
    },
    {
        "featureName": 'V229',
        "featureType": 'String',
    },
    {
        "featureName": 'V230',
        "featureType": 'String',
    },
    {
        "featureName": 'V231',
        "featureType": 'String',
    },
    {
        "featureName": 'V232',
        "featureType": 'String',
    },
    {
        "featureName": 'V233',
        "featureType": 'String',
    },
    {
        "featureName": 'V234',
        "featureType": 'String',
    },
    {
        "featureName": 'V235',
        "featureType": 'String',
    },
    {
        "featureName": 'V236',
        "featureType": 'String',
    },
    {
        "featureName": 'V237',
        "featureType": 'String',
    },
    {
        "featureName": 'V238',
        "featureType": 'String',
    },
    {
        "featureName": 'V239',
        "featureType": 'String',
    },
    {
        "featureName": 'V240',
        "featureType": 'String',
    },
    {
        "featureName": 'V241',
        "featureType": 'String',
    },
    {
        "featureName": 'V242',
        "featureType": 'String',
    },
    {
        "featureName": 'V243',
        "featureType": 'String',
    },
    {
        "featureName": 'V244',
        "featureType": 'String',
    },
    {
        "featureName": 'V245',
        "featureType": 'String',
    },
    {
        "featureName": 'V246',
        "featureType": 'String',
    },
    {
        "featureName": 'V247',
        "featureType": 'String',
    },
    {
        "featureName": 'V248',
        "featureType": 'String',
    },
    {
        "featureName": 'V249',
        "featureType": 'String',
    },
    {
        "featureName": 'V250',
        "featureType": 'String',
    },
    {
        "featureName": 'V251',
        "featureType": 'String',
    },
    {
        "featureName": 'V252',
        "featureType": 'String',
    },
    {
        "featureName": 'V253',
        "featureType": 'String',
    },
    {
        "featureName": 'V254',
        "featureType": 'String',
    },
    {
        "featureName": 'V255',
        "featureType": 'String',
    },
    {
        "featureName": 'V256',
        "featureType": 'String',
    },
    {
        "featureName": 'V257',
        "featureType": 'String',
    },
    {
        "featureName": 'V258',
        "featureType": 'String',
    },
    {
        "featureName": 'V259',
        "featureType": 'String',
    },
    {
        "featureName": 'V260',
        "featureType": 'String',
    },
    {
        "featureName": 'V261',
        "featureType": 'String',
    },
    {
        "featureName": 'V262',
        "featureType": 'String',
    },
    {
        "featureName": 'V263',
        "featureType": 'String',
    },
    {
        "featureName": 'V264',
        "featureType": 'String',
    },
    {
        "featureName": 'V265',
        "featureType": 'String',
    },
    {
        "featureName": 'V266',
        "featureType": 'String',
    },
    {
        "featureName": 'V267',
        "featureType": 'String',
    },
    {
        "featureName": 'V268',
        "featureType": 'String',
    },
    {
        "featureName": 'V269',
        "featureType": 'String',
    },
    {
        "featureName": 'V270',
        "featureType": 'String',
    },
    {
        "featureName": 'V271',
        "featureType": 'String',
    },
    {
        "featureName": 'V272',
        "featureType": 'String',
    },
    {
        "featureName": 'V273',
        "featureType": 'String',
    },
    {
        "featureName": 'V274',
        "featureType": 'String',
    },
    {
        "featureName": 'V275',
        "featureType": 'String',
    },
    {
        "featureName": 'V276',
        "featureType": 'String',
    },
    {
        "featureName": 'V277',
        "featureType": 'String',
    },
    {
        "featureName": 'V278',
        "featureType": 'String',
    },
    {
        "featureName": 'V279',
        "featureType": 'String',
    },
    {
        "featureName": 'V280',
        "featureType": 'String',
    },
    {
        "featureName": 'V281',
        "featureType": 'String',
    },
    {
        "featureName": 'V282',
        "featureType": 'String',
    },
    {
        "featureName": 'V283',
        "featureType": 'String',
    },
    {
        "featureName": 'V284',
        "featureType": 'String',
    },
    {
        "featureName": 'V285',
        "featureType": 'String',
    },
    {
        "featureName": 'V286',
        "featureType": 'String',
    },
    {
        "featureName": 'V287',
        "featureType": 'String',
    },
    {
        "featureName": 'V288',
        "featureType": 'String',
    },
    {
        "featureName": 'V289',
        "featureType": 'String',
    },
    {
        "featureName": 'V290',
        "featureType": 'String',
    },
    {
        "featureName": 'V291',
        "featureType": 'String',
    },
    {
        "featureName": 'V292',
        "featureType": 'String',
    },
    {
        "featureName": 'V293',
        "featureType": 'String',
    },
    {
        "featureName": 'V294',
        "featureType": 'String',
    },
    {
        "featureName": 'V295',
        "featureType": 'String',
    },
    {
        "featureName": 'V296',
        "featureType": 'String',
    },
    {
        "featureName": 'V297',
        "featureType": 'String',
    },
    {
        "featureName": 'V298',
        "featureType": 'String',
    },
    {
        "featureName": 'V299',
        "featureType": 'String',
    },
    {
        "featureName": 'V300',
        "featureType": 'String',
    },
    {
        "featureName": 'V301',
        "featureType": 'String',
    },
    {
        "featureName": 'V302',
        "featureType": 'String',
    },
    {
        "featureName": 'V303',
        "featureType": 'String',
    },
    {
        "featureName": 'V304',
        "featureType": 'String',
    },
    {
        "featureName": 'V305',
        "featureType": 'String',
    },
    {
        "featureName": 'V306',
        "featureType": 'String',
    },
    {
        "featureName": 'V307',
        "featureType": 'String',
    },
    {
        "featureName": 'V308',
        "featureType": 'String',
    },
    {
        "featureName": 'V309',
        "featureType": 'String',
    },
    {
        "featureName": 'V310',
        "featureType": 'String',
    },
    {
        "featureName": 'V311',
        "featureType": 'String',
    },
    {
        "featureName": 'V312',
        "featureType": 'String',
    },
    {
        "featureName": 'V313',
        "featureType": 'String',
    },
    {
        "featureName": 'V314',
        "featureType": 'String',
    },
    {
        "featureName": 'V315',
        "featureType": 'String',
    },
    {
        "featureName": 'V316',
        "featureType": 'String',
    },
    {
        "featureName": 'V317',
        "featureType": 'String',
    },
    {
        "featureName": 'V318',
        "featureType": 'String',
    },
    {
        "featureName": 'V319',
        "featureType": 'String',
    },
    {
        "featureName": 'V320',
        "featureType": 'String',
    },
    {
        "featureName": 'V321',
        "featureType": 'String',
    },
    {
        "featureName": 'V322',
        "featureType": 'String',
    },
    {
        "featureName": 'V323',
        "featureType": 'String',
    },
    {
        "featureName": 'V324',
        "featureType": 'String',
    },
    {
        "featureName": 'V325',
        "featureType": 'String',
    },
    {
        "featureName": 'V326',
        "featureType": 'String',
    },
    {
        "featureName": 'V327',
        "featureType": 'String',
    },
    {
        "featureName": 'V328',
        "featureType": 'String',
    },
    {
        "featureName": 'V329',
        "featureType": 'String',
    },
    {
        "featureName": 'V330',
        "featureType": 'String',
    },
    {
        "featureName": 'V331',
        "featureType": 'String',
    },
    {
        "featureName": 'V332',
        "featureType": 'String',
    },
    {
        "featureName": 'V333',
        "featureType": 'String',
    },
    {
        "featureName": 'V334',
        "featureType": 'String',
    },
    {
        "featureName": 'V335',
        "featureType": 'String',
    },
    {
        "featureName": 'V336',
        "featureType": 'String',
    },
    {
        "featureName": 'V337',
        "featureType": 'String',
    },
    {
        "featureName": 'V338',
        "featureType": 'String',
    },
    {
        "featureName": 'V339',
        "featureType": 'String',
    },
    {
        "featureName": 'M1_F',
        "featureType": 'String',
    },
    {
        "featureName": 'M1_T',
        "featureType": 'String',
    },
    {
        "featureName": 'M2_F',
        "featureType": 'String',
    },
    {
        "featureName": 'M2_T',
        "featureType": 'String',
    },
    {
        "featureName": 'M3_F',
        "featureType": 'String',
    },
    {
        "featureName": 'M3_T',
        "featureType": 'String',
    },
    {
        "featureName": 'M4_M0',
        "featureType": 'String',
    },
    {
        "featureName": 'M4_M1',
        "featureType": 'String',
    },
    {
        "featureName": 'M4_M2',
        "featureType": 'String',
    },
    {
        "featureName": 'M5_F',
        "featureType": 'String',
    },
    {
        "featureName": 'M5_T',
        "featureType": 'String',
    },
    {
        "featureName": 'M6_F',
        "featureType": 'String',
    },
    {
        "featureName": 'M6_T',
        "featureType": 'String',
    },
    {
        "featureName": 'M7_F',
        "featureType": 'String',
    },
    {
        "featureName": 'M7_T',
        "featureType": 'String',
    },
    {
        "featureName": 'M8_F',
        "featureType": 'String',
    },
    {
        "featureName": 'M8_T',
        "featureType": 'String',
    },
    {
        "featureName": 'M9_F',
        "featureType": 'String',
    },
    {
        "featureName": 'M9_T',
        "featureType": 'String',
    },
    {
        "featureName": 'EventTime',
        "featureType": 'Fractional',
    },
];

// export const FEATURE_COLUMNS: Column[] = [
//     {
//         name: 'card_id',
//         type: Schema.STRING,
//     },
//     {
//         name: 'card_num',
//         type: Schema.INTEGER,
//     },
//     {
//         name: 'card_amt',
//         type: Schema.DOUBLE,
//     },
//     {
//         name: 'EventTime',
//         type: Schema.DOUBLE,
//     },
// ];