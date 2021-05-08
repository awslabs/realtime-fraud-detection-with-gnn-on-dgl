// https://github.com/wchaws/cdk-bootstrapless-synthesizer/blob/26cc2dc9e4a9b63095f481e6239afed572b9b01a/src/index.ts
import * as fs from 'fs';
import * as path from 'path';
import * as cxschema from '@aws-cdk/cloud-assembly-schema';
import { DockerImageAssetLocation, DockerImageAssetSource, FileAssetLocation, FileAssetPackaging, FileAssetSource, Fn, ISynthesisSession, Stack, StackSynthesizer, Token } from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';


const REGION_PLACEHOLDER = '${AWS::Region}';
const ERR_MSG_CALL_BIND_FIRST = 'You must call bind() first';

/**
 * Configuration properties for BootstraplessStackSynthesizer
 */
export interface BootstraplessStackSynthesizerProps {
  /**
   * Name of the S3 bucket to hold file assets
   *
   * You must supply this if you have given a non-standard name to the staging bucket.
   *
   * The placeholders `${AWS::AccountId}` and `${AWS::Region}` will
   * be replaced with the values of qualifier and the stack's account and region,
   * respectively.
   *
   * @required if you have file assets
   * @default - process.env.BSS_FILE_ASSET_BUCKET_NAME
   */
  readonly fileAssetBucketName?: string;

  /**
   * Name of the ECR repository to hold Docker Image assets
   *
   * You must supply this if you have given a non-standard name to the ECR repository.
   *
   * The placeholders `${AWS::AccountId}` and `${AWS::Region}` will
   * be replaced with the values of qualifier and the stack's account and region,
   * respectively.
   *
   * @required if you have docker image assets
   * @default - process.env.BSS_IMAGE_ASSET_REPOSITORY_NAME
   */
  readonly imageAssetRepositoryName?: string;

  /**
   * The role to use to publish file assets to the S3 bucket in this environment
   *
   * You must supply this if you have given a non-standard name to the publishing role.
   *
   * The placeholders `${AWS::AccountId}` and `${AWS::Region}` will
   * be replaced with the values of qualifier and the stack's account and region,
   * respectively.
   *
   * @default - process.env.BSS_FILE_ASSET_PUBLISHING_ROLE_ARN
   */
  readonly fileAssetPublishingRoleArn?: string;

  /**
   * The role to use to publish image assets to the ECR repository in this environment
   *
   * You must supply this if you have given a non-standard name to the publishing role.
   *
   * The placeholders `${AWS::AccountId}` and `${AWS::Region}` will
   * be replaced with the values of qualifier and the stack's account and region,
   * respectively.
   *
   * @default - process.env.BSS_IMAGE_ASSET_PUBLISHING_ROLE_ARN
   */
  readonly imageAssetPublishingRoleArn?: string;

  /**
   * Object key prefix to use while storing S3 Assets
   *
   * @default - process.env.BSS_FILE_ASSET_PREFIX
   */
  readonly fileAssetPrefix?: string;

  /**
   * The regions set of file assets to be published only when `fileAssetBucketName` contains `${AWS::Region}`
   *
   * For examples:
   * `['us-east-1', 'us-west-1']`
   *
   * @default - process.env.BSS_FILE_ASSET_REGION_SET // comma delimited list
   */
  readonly fileAssetRegionSet?: string[];

  /**
   * Override the name of the S3 bucket to hold Cloudformation template
   *
   * @default - process.env.BSS_TEMPLATE_BUCKET_NAME
   */
  readonly templateBucketName?: string;

  /**
   * Override the tag of the Docker Image assets
   *
   * @default - process.env.BSS_IMAGE_ASSET_TAG
   */
  readonly imageAssetTag?: string;

  /**
   * Override the ECR repository region of the Docker Image assets
   *
   * @default - process.env.BSS_IMAGE_ASSET_REGION
   */
  readonly imageAssetRegion?: string;

  /**
   * Override the ECR repository account id of the Docker Image assets
   *
   * @default - process.env.BSS_IMAGE_ASSET_ACCOUNT_ID
   */
  readonly imageAssetAccountId?: string;
}

/**
 * A Bootstrapless stack synthesizer that is designated to generate templates
 * that can be directly used by Cloudformation
 */
export class BootstraplessStackSynthesizer extends StackSynthesizer {
  private _stack?: Stack;
  private bucketName?: string;
  private repositoryName?: string;
  private fileAssetPublishingRoleArn?: string;
  private imageAssetPublishingRoleArn?: string;
  private fileAssetPrefix?: string;
  private fileAssetRegionSet?: string[];
  private templateBucketName?: string;
  private imageAssetTag?: string;
  private imageAssetRegion?: string;
  private imageAssetAccountId?: string;


  private readonly files: NonNullable<cxschema.AssetManifest['files']> = {};
  private readonly dockerImages: NonNullable<cxschema.AssetManifest['dockerImages']> = {};

  constructor(props: BootstraplessStackSynthesizerProps = {}) {
    super();
    const {
      BSS_FILE_ASSET_BUCKET_NAME,
      BSS_IMAGE_ASSET_REPOSITORY_NAME,

      BSS_FILE_ASSET_PUBLISHING_ROLE_ARN,
      BSS_IMAGE_ASSET_PUBLISHING_ROLE_ARN,

      BSS_FILE_ASSET_PREFIX,
      BSS_FILE_ASSET_REGION_SET,

      BSS_TEMPLATE_BUCKET_NAME,
      BSS_IMAGE_ASSET_TAG,
      BSS_IMAGE_ASSET_REGION,
      BSS_IMAGE_ASSET_ACCOUNT_ID,
    } = process.env;
    this.bucketName = props.fileAssetBucketName ?? BSS_FILE_ASSET_BUCKET_NAME;
    this.repositoryName = props.imageAssetRepositoryName ?? BSS_IMAGE_ASSET_REPOSITORY_NAME;
    this.fileAssetPublishingRoleArn = props.fileAssetPublishingRoleArn ?? BSS_FILE_ASSET_PUBLISHING_ROLE_ARN;
    this.imageAssetPublishingRoleArn = props.imageAssetPublishingRoleArn ?? BSS_IMAGE_ASSET_PUBLISHING_ROLE_ARN;
    this.fileAssetPrefix = props.fileAssetPrefix ?? BSS_FILE_ASSET_PREFIX;
    this.fileAssetRegionSet = props.fileAssetRegionSet ?? (BSS_FILE_ASSET_REGION_SET ? BSS_FILE_ASSET_REGION_SET.split(',') : undefined);
    this.templateBucketName = props.templateBucketName ?? BSS_TEMPLATE_BUCKET_NAME;
    this.imageAssetTag = props.imageAssetTag ?? BSS_IMAGE_ASSET_TAG;
    this.imageAssetRegion = props.imageAssetRegion ?? BSS_IMAGE_ASSET_REGION;
    this.imageAssetAccountId = props.imageAssetAccountId ?? BSS_IMAGE_ASSET_ACCOUNT_ID;

    this.imageAssetRegion = this.imageAssetRegion?.trim();
  }

  public bind(stack: Stack): void {
    if (this._stack !== undefined) {
      throw new Error('A StackSynthesizer can only be used for one Stack: create a new instance to use with a different Stack');
    }

    this._stack = stack;

    // Function to replace placeholders in the input string as much as possible
    //
    // We replace:
    // - ${AWS::AccountId}, ${AWS::Region}: only if we have the actual values available
    // - ${AWS::Partition}: never, since we never have the actual partition value.
    const specialize = (s: string | undefined) => {
      if (s === undefined) {
        return undefined;
      }
      return cxapi.EnvironmentPlaceholders.replace(s, {
        region: resolvedOr(stack.region, cxapi.EnvironmentPlaceholders.CURRENT_REGION),
        accountId: resolvedOr(stack.account, cxapi.EnvironmentPlaceholders.CURRENT_ACCOUNT),
        partition: cxapi.EnvironmentPlaceholders.CURRENT_PARTITION,
      });
    };

    /* eslint-disable max-len */
    this.bucketName = specialize(this.bucketName);
    this.repositoryName = specialize(this.repositoryName);
    this.fileAssetPublishingRoleArn = specialize(this.fileAssetPublishingRoleArn);
    this.imageAssetPublishingRoleArn = specialize(this.imageAssetPublishingRoleArn);
    this.fileAssetPrefix = specialize(this.fileAssetPrefix ?? '');
    /* eslint-enable max-len */
  }

  public addFileAsset(asset: FileAssetSource): FileAssetLocation {
    return this._addFileAsset(asset);
  }

  private _addFileAsset(asset: FileAssetSource, overrideBucketname?: string): FileAssetLocation {
    assertNotNull(this.stack, ERR_MSG_CALL_BIND_FIRST);
    assertNotNull(this.bucketName, 'The bucketName is null');

    const bucketName = overrideBucketname ?? this.bucketName;
    const objectKey = this.fileAssetPrefix + asset.sourceHash + (asset.packaging === FileAssetPackaging.ZIP_DIRECTORY ? '.zip' : '');
    const destinations: { [id: string]: cxschema.FileDestination } = {};

    if (this.fileAssetRegionSet?.length && bucketName.includes(REGION_PLACEHOLDER)) {
      for (let region of this.fileAssetRegionSet) {
        region = region.trim();
        if (!region) { continue; }
        destinations[region] = {
          bucketName: replaceAll(bucketName, REGION_PLACEHOLDER, region),
          objectKey,
          region,
          assumeRoleArn: this.fileAssetPublishingRoleArn,
        };
      }
    } else {
      destinations[this.manifestEnvName] = {
        bucketName,
        objectKey,
        region: resolvedOr(this.stack.region, undefined),
        assumeRoleArn: this.fileAssetPublishingRoleArn,
      };
    }

    // Add to manifest
    this.files[asset.sourceHash] = {
      source: {
        path: asset.fileName,
        packaging: asset.packaging,
      },
      destinations,
    };

    const { region, urlSuffix } = stackLocationOrInstrinsics(this.stack);
    const httpUrl = cfnify(`https://s3.${region}.${urlSuffix}/${bucketName}/${objectKey}`);
    const s3ObjectUrl = cfnify(`s3://${bucketName}/${objectKey}`);

    // Return CFN expression
    return {
      bucketName: cfnify(bucketName),
      objectKey,
      httpUrl,
      s3ObjectUrl,
      s3Url: httpUrl,
    };
  }

  public addDockerImageAsset(asset: DockerImageAssetSource): DockerImageAssetLocation {
    assertNotNull(this.stack, ERR_MSG_CALL_BIND_FIRST);
    assertNotNull(this.repositoryName, 'The repositoryName is null');

    const imageTag = this.imageAssetTag ?? asset.sourceHash;

    // Add to manifest
    this.dockerImages[asset.sourceHash] = {
      source: {
        directory: asset.directoryName,
        dockerBuildArgs: asset.dockerBuildArgs,
        dockerBuildTarget: asset.dockerBuildTarget,
        dockerFile: asset.dockerFile,
      },
      destinations: {
        [this.manifestEnvName]: {
          repositoryName: this.repositoryName,
          imageTag,
          region: this.imageAssetRegion ?? resolvedOr(this.stack.region, undefined),
          assumeRoleArn: this.imageAssetPublishingRoleArn,
        },
      },
    };

    let { account, region, urlSuffix } = stackLocationOrInstrinsics(this.stack);
    region = this.imageAssetRegion ?? region;
    account = this.imageAssetAccountId ?? account;

    // Return CFN expression
    return {
      repositoryName: cfnify(this.repositoryName),
      imageUri: cfnify(`${account}.dkr.ecr.${region}.${urlSuffix}/${this.repositoryName}:${imageTag}`),
    };
  }

  /**
   * Dumps current manifest into JSON format
   */
  public dumps(): string {
    const manifest: cxschema.AssetManifest = {
      version: cxschema.Manifest.version(),
      files: this.files,
      dockerImages: this.dockerImages,
    };
    return JSON.stringify(manifest, undefined, 2);
  }

  /**
   * Synthesize the associated stack to the session
   */
  public synthesize(session: ISynthesisSession): void {
    assertNotNull(this.stack, ERR_MSG_CALL_BIND_FIRST);

    this.synthesizeStackTemplate(this.stack, session);

    // Add the stack's template to the artifact manifest
    const templateManifestUrl = this.addStackTemplateToAssetManifest(session);

    const artifactId = this.writeAssetManifest(session);

    this.emitStackArtifact(this.stack, session, {
      stackTemplateAssetObjectUrl: templateManifestUrl,
      additionalDependencies: [artifactId],
    });
  }

  protected get stack(): Stack | undefined {
    return this._stack;
  }

  /**
   * Add the stack's template as one of the manifest assets
   *
   * This will make it get uploaded to S3 automatically by S3-assets. Return
   * the manifest URL.
   *
   * (We can't return the location returned from `addFileAsset`, as that
   * contains CloudFormation intrinsics which can't go into the manifest).
   */
  private addStackTemplateToAssetManifest(_: ISynthesisSession) {
    assertNotNull(this.stack, ERR_MSG_CALL_BIND_FIRST);

    const sourceHash = this.stack.templateFile;

    this._addFileAsset({
      fileName: this.stack.templateFile,
      packaging: FileAssetPackaging.FILE,
      sourceHash,
    }, this.templateBucketName);

    // We should technically return an 'https://s3.REGION.amazonaws.com[.cn]/name/hash' URL here,
    // because that is what CloudFormation expects to see.
    //
    // However, there's no way for us to actually know the UrlSuffix a priori, so we can't construct it here.
    //
    // Instead, we'll have a protocol with the CLI that we put an 's3://.../...' URL here, and the CLI
    // is going to resolve it to the correct 'https://.../' URL before it gives it to CloudFormation.
    return `s3://${this.bucketName}/${sourceHash}`;
  }

  /**
   * Write an asset manifest to the Cloud Assembly, return the artifact IDs written
   */
  private writeAssetManifest(session: ISynthesisSession): string {
    assertNotNull(this.stack, ERR_MSG_CALL_BIND_FIRST);

    const artifactId = `${this.stack.artifactId}.assets`;
    const manifestFile = `${artifactId}.json`;
    const outPath = path.join(session.assembly.outdir, manifestFile);

    fs.writeFileSync(outPath, this.dumps());
    session.assembly.addArtifact(artifactId, {
      type: cxschema.ArtifactType.ASSET_MANIFEST,
      properties: {
        file: manifestFile,
      },
    });

    return artifactId;
  }

  private get manifestEnvName(): string {
    assertNotNull(this.stack, ERR_MSG_CALL_BIND_FIRST);

    return [
      resolvedOr(this.stack.account, 'current_account'),
      resolvedOr(this.stack.region, 'current_region'),
    ].join('-');
  }
}

/**
 * Return the given value if resolved or fall back to a default
 */
function resolvedOr<A>(x: string, def: A): string | A {
  return Token.isUnresolved(x) ? def : x;
}

/**
 * A "replace-all" function that doesn't require us escaping a literal string to a regex
 */
function replaceAll(s: string, search: string, replace: string) {
  return s.split(search).join(replace);
}

/**
 * If the string still contains placeholders, wrap it in a Fn::Sub so they will be substituted at CFN deployment time
 *
 * (This happens to work because the placeholders we picked map directly onto CFN
 * placeholders. If they didn't we'd have to do a transformation here).
 */
function cfnify(s: string): string {
  return s.indexOf('${') > -1 ? Fn.sub(s) : s;
}

/**
 * Return the stack locations if they're concrete, or the original CFN intrisics otherwise
 *
 * We need to return these instead of the tokenized versions of the strings,
 * since we must accept those same ${AWS::AccountId}/${AWS::Region} placeholders
 * in bucket names and role names (in order to allow environment-agnostic stacks).
 *
 * We'll wrap a single {Fn::Sub} around the final string in order to replace everything,
 * but we can't have the token system render part of the string to {Fn::Join} because
 * the CFN specification doesn't allow the {Fn::Sub} template string to be an arbitrary
 * expression--it must be a string literal.
 */
function stackLocationOrInstrinsics(stack: Stack) {
  return {
    account: resolvedOr(stack.account, '${AWS::AccountId}'),
    region: resolvedOr(stack.region, '${AWS::Region}'),
    urlSuffix: resolvedOr(stack.urlSuffix, '${AWS::URLSuffix}'),
  };
}


// function range(startIncl: number, endExcl: number) {
//     const ret = new Array<number>();
//     for (let i = startIncl; i < endExcl; i++) {
//     ret.push(i);
//     }
//     return ret;
// }


function assertNotNull<A>(x: A | undefined, msg:string = 'Null value error'): asserts x is NonNullable<A> {
  if (x === null || x === undefined) {
    throw new Error(msg);
  }
}