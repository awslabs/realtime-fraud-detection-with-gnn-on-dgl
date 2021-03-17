/* eslint import/no-unresolved: "off" */
import { Handler } from 'aws-lambda';

export type ParameterNormalizeHandler = Handler<Parameters, ParametersOutput>;

export interface Parameters {
  readonly trainingJob?: {
    hyperparameters?: {
      [key: string]: string;
    };
    instanceType?: string;
    instanceCount?: number;
  };
}

export interface ParametersOutput {
  readonly parameters: {
    readonly trainingJob: {
      hyperparameters: {
        [key: string]: string;
      };
      instanceType: string;
      instanceCount: number;
    };
  };
}

export const normalize: ParameterNormalizeHandler = async (para, _context) => {
  console.info(`Receiving parameter normalize event ${JSON.stringify(para, null, 2)}.`);

  const hyperparameters = _normalizeTrainingJobHyperparameters(para);
  const parameters: ParametersOutput = {
    parameters: {
      trainingJob: {
        hyperparameters,
        instanceType: para?.trainingJob?.instanceType ?? 'ml.c5.4xlarge',
        instanceCount: para?.trainingJob?.instanceCount ?? 1,
      },
    },
  };
  console.info(`Normalize the parameters as ${JSON.stringify(parameters, null, 2)}.`);

  return parameters;
};

function _normalizeTrainingJobHyperparameters(para: Parameters) : {
  [key: string]: string;
} {
  const hyperparameters = para?.trainingJob?.hyperparameters ?? {
  };
  hyperparameters.nodes = para?.trainingJob?.hyperparameters?.nodes ?? 'features.csv';
  hyperparameters.edges = para?.trainingJob?.hyperparameters?.edges ?? 'relation*';
  hyperparameters.labels = para?.trainingJob?.hyperparameters?.labels ?? 'tags.csv';
  hyperparameters['embedding-size'] = para?.trainingJob?.hyperparameters?.['embedding-size'] ?? '64';
  hyperparameters['n-layers'] = para?.trainingJob?.hyperparameters?.['n-layers'] ?? '2';
  hyperparameters['n-epochs'] = para?.trainingJob?.hyperparameters?.['n-epochs'] ?? '10';
  hyperparameters.optimizer = para?.trainingJob?.hyperparameters?.optimizer ?? 'adam';
  hyperparameters.lr = para?.trainingJob?.hyperparameters?.lr ?? '1e-2';
  return hyperparameters;
}