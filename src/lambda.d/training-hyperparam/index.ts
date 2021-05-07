/* eslint import/no-unresolved: "off" */
import { URL } from 'url';
import { Handler } from 'aws-lambda';

export type TrainingHyperParametersHandler = Handler<ParametersIn, ParametersOut>;

export interface ParametersIn {
  readonly parameters: {
    readonly trainingJob: {
      hyperparameters: {
        [key: string]: string;
      };
    };
  };
  readonly dataProcessOutput: {
    readonly Id: string;
  };
}

export interface ParametersOut {
  readonly hyperParameters: { [key: string]: string };
  readonly inputDataUri: string;
}

export const build: TrainingHyperParametersHandler = async (para, _context) => {
  console.info(`Receiving hyper parameters event ${JSON.stringify(para, null, 2)}.`);

  const parameters: ParametersOut = {
    hyperParameters: {
      ...para.parameters.trainingJob.hyperparameters,
      'edges': 'relation_*_edgelist/*',
      'labels': 'tags/*',
      'nodes': 'features/*',
      'new-account': 'test/*',
    },
    inputDataUri: new URL(para.dataProcessOutput.Id, process.env.InputDataRoot).href,
  };

  console.info(`Built the training parameters as ${JSON.stringify(parameters, null, 2)}.`);

  return parameters;
};