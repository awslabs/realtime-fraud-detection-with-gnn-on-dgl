import { App, Tags } from '@aws-cdk/core';
import { FraudDetectionStack } from './lib/stack';
import { BootstraplessStackSynthesizer } from './BootstraplessStackSynthesizer';

const app = new App();

const vpcId = app.node.tryGetContext('vpcId');
const env = vpcId ? {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
} : undefined;

new FraudDetectionStack(app, 'realtime-fraud-detection-with-gnn-on-dgl', {
  env: env,
  synthesizer: synthesizer(),
});

app.synth();

Tags.of(app).add('app', 'realtime-fraud-detection-with-gnn-on-dgl');

function synthesizer() {
  return process.env.USE_BSS ? new BootstraplessStackSynthesizer(): undefined;
}
