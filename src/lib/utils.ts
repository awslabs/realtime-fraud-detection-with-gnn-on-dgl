/* eslint @typescript-eslint/no-require-imports: "off" */
import * as crypto from 'crypto';
import * as fs from 'fs';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { IAspect, CfnResource, Arn, Stack, ArnFormat } from 'aws-cdk-lib/core';
import { IConstruct } from 'constructs';
const hash = require('object-hash');
const fetch = require('sync-fetch');

const urlPattern = /^((http|https|ftp):\/\/)/;

export function artifactHash(path: string): string {
  let file_buffer;
  if (urlPattern.test(path)) {file_buffer = fetch(path).buffer();} else {file_buffer = fs.readFileSync(path);}
  const sum = crypto.createHash('sha256');
  sum.update(file_buffer);
  return sum.digest('hex');
}

export function artifactsHash(pathes: string[]): string {
  const filesHash: { [key: string]: string } = {};
  for (const path of pathes) {
    filesHash[path] = artifactHash(path);
  }
  return hash(filesHash);
}

export function dirArtifactHash(folderpath: string): string {
  const filesHash: {[key: string]: string} = {};
  const filenames = fs.readdirSync(folderpath, { withFileTypes: true });
  filenames.forEach(file => {
    if (file.isDirectory()) {filesHash[file.name] = dirArtifactHash(`${folderpath}/${file.name}`);} else {filesHash[file.name] = artifactHash(`${folderpath}/${file.name}`);}
  });
  return hash(filesHash);
}

export function grantKmsKeyPerm(key: IKey, logGroupName: string): void {
  key.addToResourcePolicy(new PolicyStatement({
    principals: [new ServicePrincipal('logs.amazonaws.com')],
    actions: [
      'kms:Encrypt*',
      'kms:ReEncrypt*',
      'kms:Decrypt*',
      'kms:GenerateDataKey*',
      'kms:Describe*',
    ],
    resources: [
      '*',
    ],
    conditions: {
      ArnLike: {
        'kms:EncryptionContext:aws:logs:arn': Arn.format({
          service: 'logs',
          resource: 'log-group',
          resourceName: logGroupName,
          arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        }, Stack.of(key)),
      },
    },
  }));
}

interface CfnNagMetadata {
  readonly rules_to_suppress: [{
    readonly id: string;
    readonly reason: string;
  }];
}
export class CfnNagWhitelist implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof Function) {
      const res = ((node as Function).node.tryFindChild('ServiceRole')?.node
        .tryFindChild('DefaultPolicy')?.node.defaultChild as CfnResource);
      const existing = (res?.getMetadata('cfn_nag') as CfnNagMetadata)?.rules_to_suppress || [];
      res?.addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W12',
            reason: 'wildcard resource is used for x-ray in Lambda Function',
          },
          ...existing,
        ],
      });
    } else if (node.node.id == 'LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a') {
      (node.node.findChild('ServiceRole').node.findChild('DefaultPolicy').node
        .findChild('Resource') as CfnResource).addMetadata('cfn_nag', {
        rules_to_suppress: [
          {
            id: 'W12',
            reason: 'wildcard in policy is built by CDK for Lambda Function for x-ray',
          },
        ],
      });
    }
  }
}