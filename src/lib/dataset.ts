import { CfnMapping } from 'aws-cdk-lib';
import { Construct } from 'constructs';

const DATASET_BASE_URL_CN = 'https://aws-gcr-solutions-assets.s3.cn-northwest-1.amazonaws.com.cn/open-dataset/ieee-fraud-detection/';
const DATASET_BASE_URL = 'https://aws-gcr-solutions-assets.s3.amazonaws.com/open-dataset/ieee-fraud-detection/';
export const IEEE = 'ieee';

export function getDatasetMapping(construct: Construct): CfnMapping {
  return new CfnMapping(construct, 'DataSet', {
    mapping: {
      'aws': {
        ieee: DATASET_BASE_URL,
      },
      'aws-cn': {
        ieee: DATASET_BASE_URL_CN,
      },
    },
  });
}