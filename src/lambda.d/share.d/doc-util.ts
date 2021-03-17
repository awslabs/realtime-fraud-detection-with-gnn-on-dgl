/* eslint @typescript-eslint/no-require-imports: "off" */
import * as fs from 'fs';
import { MongoClient } from 'mongodb';
const { SecretsManager } = require('@aws-sdk/client-secrets-manager');

const secretsManager = new SecretsManager();

interface DocDBSecret {
  readonly host: string;
  readonly dbClusterIdentifier: string;
  readonly password: string;
  readonly engine: string;
  readonly username: string;
  readonly port: number;
}

export const initMongoClient = async () => {
  console.log('fetching db pass from secrets...');
  const secret = await secretsManager.getSecretValue({
    SecretId: process.env.DB_SECRET_ARN,
  });
  const dbSecret: DocDBSecret = JSON.parse(secret.SecretString!);
  console.log('fetched db pass from secrets...');

  console.log('connecting to mongo');
  const ca = [fs.readFileSync(`/opt/etc/${process.env.CA_FILE}`)];
  const uri = `mongodb://${dbSecret.username}:${encodeURIComponent(dbSecret.password)}@${dbSecret.host}:${dbSecret.port}/?ssl=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;
  try {
    return await MongoClient.connect(uri, {
      sslValidate: true,
      sslCA: ca,
      useNewUrlParser: true,
    });
  } catch (error) {
    console.error('error during connecting to mongo: ');
    console.error(error);
    throw error;
  }
};