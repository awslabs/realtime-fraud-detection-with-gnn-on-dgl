import * as path from 'path';
import { LayerVersion, Runtime, RuntimeFamily, Code } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { artifactsHash } from './utils';

export interface WranglerLayerProps {
  readonly version?: string;
}

export class WranglerLayer extends LayerVersion {
  constructor(scope: Construct, id: string, props?: WranglerLayerProps) {
    const version = props?.version ?? '2.16.1';
    const wranglerLayerZip = `https://github.com/awslabs/aws-data-wrangler/releases/download/${version}/awswrangler-layer-${version}-py3.9.zip`;

    super(scope, id, {
      compatibleRuntimes: [Runtime.PYTHON_3_9],
      code: Code.fromAsset(path.join(__dirname, '../lambda.d/layer.d/awswrangler'), {
        bundling: {
          image: new Runtime('busybox', RuntimeFamily.OTHER, {
            bundlingDockerImage: 'public.ecr.aws/runecast/busybox:1.32.1',
          }).bundlingImage,
          command: [
            'sh',
            '-c',
            `
                mkdir -p /asset-output/ &&
                wget -qO- ${wranglerLayerZip} | unzip - -d /asset-output
                `,
          ],
        },
        assetHash: artifactsHash([wranglerLayerZip]),
      }),
      description: `wrangler-${version}`,
    });
  }
}

export class NeptuneUtilLayer extends LayerVersion {
  constructor(scope: Construct, id: string) {

    super(scope, id, {
      compatibleRuntimes: [Runtime.PYTHON_3_9, Runtime.PYTHON_3_8, Runtime.PYTHON_3_7],
      code: Code.fromAsset(path.join(__dirname, '../script-libs/amazon-neptune-tools/neptune-python-utils/target'), {
        bundling: {
          image: new Runtime('busybox', RuntimeFamily.OTHER, {
            bundlingDockerImage: 'public.ecr.aws/runecast/busybox:1.32.1',
          }).bundlingImage,
          command: [
            'sh',
            '-c',
            `
              mkdir -p /asset-output/python/ &&
              unzip neptune_python_utils.zip -d /asset-output/python
            `,
          ],
        },
        assetHash: artifactsHash([path.join(__dirname, '../script-libs/amazon-neptune-tools/neptune-python-utils/target/neptune_python_utils.zip')]),
      }),
      description: 'neptune-python-utils',
    });
  }
}