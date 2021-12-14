import { App, Tags } from 'aws-cdk-lib';
import { BootstraplessStackSynthesizer } from './BootstraplessStackSynthesizer';
import { FraudDetectionStack } from './lib/stack';

const app = new App();

const vpcId = app.node.tryGetContext('vpcId');
const env = vpcId ? {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
} : undefined;

const stack = new FraudDetectionStack(app, 'realtime-fraud-detection-with-gnn-on-dgl', {
  env: env,
  synthesizer: synthesizer(),
  tags: {
    app: 'realtime-fraud-detection-with-gnn-on-dgl',
  },
});

Tags.of(stack).add('app', 'realtime-fraud-detection-with-gnn-on-dgl', {
  includeResourceTypes: [
    'AWS::Neptune::DBClusterParameterGroup',
    'AWS::Neptune::DBParameterGroup',
    'AWS::Neptune::DBCluster',
    'AWS::Neptune::DBInstance',
    'AWS::Neptune::DBSubnetGroup',
    'AWS::DocDB::DBClusterParameterGroup',
    'AWS::DocDB::DBCluster',
    'AWS::DocDB::DBInstance',
    'AWS::DocDB::DBSubnetGroup',
  ],
});

app.synth();

function synthesizer() {
  return process.env.USE_BSS ? new BootstraplessStackSynthesizer(): undefined;
}
