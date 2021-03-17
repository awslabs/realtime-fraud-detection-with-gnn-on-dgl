/* eslint import/no-unresolved: "off" */
import { Handler } from 'aws-lambda';

export type IterateHandler = Handler<Input, IterOutput>;

export interface Input {
  readonly interval: number;
  readonly duration: number;
  readonly concurrent: number;
}

export interface Parameter {
  readonly interval: number;
  readonly duration: number;
}

export interface IterOutput {
  readonly duration: number;
  readonly concurrent: number;
  readonly iter: Parameter[];
}

export const iter: IterateHandler = async (para, _context) => {
  console.info(`Receiving input event ${JSON.stringify(para, null, 2)}.`);

  const output: IterOutput = {
    duration: para.duration,
    concurrent: para.concurrent,
    iter: Array(para.concurrent).fill({
      interval: para.interval,
      duration: para.duration,
    }),
  };
  console.info(`Iter output is ${JSON.stringify(output, null, 2)}.`);

  return output;
};
