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
    timeoutInSeconds?: number;
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
      timeoutInSeconds: number;
    };
  };
}

export const DEFAULT_TRAINING_TIMEOUT = 90 * 60;
export const normalize: ParameterNormalizeHandler = async (para, _context) => {
  console.info(`Receiving parameter normalize event ${JSON.stringify(para, null, 2)}.`);

  const hyperparameters = _normalizeTrainingJobHyperparameters(para);
  const parameters: ParametersOutput = {
    parameters: {
      trainingJob: {
        hyperparameters,
        instanceType: para?.trainingJob?.instanceType ?? 'ml.c5.4xlarge',
        instanceCount: para?.trainingJob?.instanceCount ?? 1,
        timeoutInSeconds: para?.trainingJob?.timeoutInSeconds ?? DEFAULT_TRAINING_TIMEOUT,
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
  hyperparameters['n-hidden'] = para?.trainingJob?.hyperparameters?.['n-hidden'] ?? '16';
  hyperparameters['embedding-size'] = para?.trainingJob?.hyperparameters?.['embedding-size'] ?? '64';
  hyperparameters['n-layers'] = '2';
  hyperparameters['n-epochs'] = para?.trainingJob?.hyperparameters?.['n-epochs'] ?? '100';
  hyperparameters.optimizer = para?.trainingJob?.hyperparameters?.optimizer ?? 'adam';
  hyperparameters.lr = para?.trainingJob?.hyperparameters?.lr ?? '4e-3';
  return hyperparameters;
}