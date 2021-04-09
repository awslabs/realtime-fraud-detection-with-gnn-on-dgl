/* eslint import/no-unresolved: "off" */
import { Callback, Context } from 'aws-lambda';
import { ParametersOutput, normalize, DEFAULT_TRAINING_TIMEOUT } from '../../../src/lambda.d/parameters-normalize/index';

describe('parameters normalize tests', () => {

  let callback: Callback<ParametersOutput>;
  let context: Context;
  let defaultParameter: ParametersOutput;

  beforeAll(() => {
  });

  beforeEach(() => {
    defaultParameter = {
      parameters: {
        trainingJob: {
          hyperparameters: {
            'nodes': 'features.csv',
            'edges': 'relation*',
            'labels': 'tags.csv',
            'embedding-size': '64',
            'n-layers': '2',
            'n-epochs': '50',
            'optimizer': 'adam',
            'lr': '1e-2',
          },
          instanceType: 'ml.c5.4xlarge',
          instanceCount: 1,
          timeoutInSeconds: DEFAULT_TRAINING_TIMEOUT,
        },
      },
    };
  });

  test('empty parameters', async () => {
    const para = await normalize({}, context, callback);
    expect(para).toEqual(defaultParameter);
  });

  test('override hyperparameters', async () => {
    const expectedData = defaultParameter;
    expectedData.parameters.trainingJob!.hyperparameters['n-epochs'] = '1';
    const para = await normalize({
      trainingJob: {
        hyperparameters: {
          'n-epochs': '1',
          'n-layers': '3',
        },
      },
    }, context, callback);
    expect(para).toEqual(expectedData);
  });

  test('override instance type', async () => {
    const expectedData = defaultParameter;
    expectedData.parameters.trainingJob.instanceType = 'ml.c5.9xlarge';
    expectedData.parameters.trainingJob.instanceCount = 2;
    const para = await normalize({
      trainingJob: {
        instanceType: 'ml.c5.9xlarge',
        instanceCount: 2,
      },
    }, context, callback);
    expect(para).toEqual(expectedData);
  });

});
