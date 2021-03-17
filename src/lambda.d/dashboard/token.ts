/* eslint import/no-unresolved: "off" */
import { STSClient, AssumeRoleCommand, Credentials } from '@aws-sdk/client-sts';
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';

export type TokenHandler = APIGatewayProxyHandlerV2<Credentials>;

interface TokenRequest {
  readonly client?: string;
}

const client = new STSClient({});

const roleArn = process.env.RoleArn;

export const getToken: TokenHandler = async (event, context) => {
  console.info(`Receiving token request ${JSON.stringify(event, null, 2)}.`);

  const request: TokenRequest = event.body ? JSON.parse(event.body) : undefined;
  const command = new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: `${context.awsRequestId}-${request?.client}`,
  });
  const data = await client.send(command);

  console.info(`Got sts token ${JSON.stringify(data, null, 2)}.`);

  return data.Credentials!;
};