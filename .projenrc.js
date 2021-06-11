const { AwsCdkTypeScriptApp, web } = require('projen');

const tsExcludeConfig = {
  compilerOptions: {
    lib: ['dom', 'es2018'],
  },
  exclude: ['src/frontend'],
};

const project = new AwsCdkTypeScriptApp({
  cdkVersion: '1.102.0',
  name: 'realtime-fraud-detection-with-gnn-on-dgl',
  /* AwsCdkTypeScriptAppOptions */
  // appEntrypoint: 'main.ts',                                                 /* The CDK app's entrypoint (relative to the source directory, which is "src" by default). */
  cdkDependencies: [
    '@aws-cdk/aws-apigatewayv2',
    '@aws-cdk/aws-apigatewayv2-integrations',
    '@aws-cdk/aws-appsync',
    '@aws-cdk/aws-certificatemanager',
    '@aws-cdk/aws-cloudfront',
    '@aws-cdk/aws-cloudfront-origins',
    '@aws-cdk/aws-docdb',
    '@aws-cdk/aws-ec2',
    '@aws-cdk/aws-ecs',
    '@aws-cdk/aws-ecr',
    '@aws-cdk/aws-ecr-assets',
    '@aws-cdk/aws-efs',
    '@aws-cdk/aws-glue',
    '@aws-cdk/aws-iam',
    '@aws-cdk/aws-lambda',
    '@aws-cdk/aws-lambda-event-sources',
    '@aws-cdk/aws-lambda-python',
    '@aws-cdk/aws-lambda-nodejs',
    '@aws-cdk/aws-logs',
    '@aws-cdk/aws-neptune',
    '@aws-cdk/aws-route53',
    '@aws-cdk/aws-route53-targets',
    '@aws-cdk/aws-s3',
    '@aws-cdk/aws-s3-deployment',
    '@aws-cdk/aws-sqs',
    '@aws-cdk/aws-stepfunctions',
    '@aws-cdk/aws-stepfunctions-tasks',
    '@aws-cdk/cx-api',
    '@aws-cdk/cloud-assembly-schema',
    '@aws-cdk/custom-resources',
    '@aws-cdk/lambda-layer-awscli',
  ] /* Which AWS CDK modules (those that start with "@aws-cdk/") this app uses. */,
  cdkVersionPinning: true /* Use pinned version instead of caret version for CDK. */,
  // context: undefined,                                                       /* Additional context to include in `cdk.json`. */
  // requireApproval: CdkApprovalLevel.BROADENING,                             /* To protect you against unintended changes that affect your security posture, the AWS CDK Toolkit prompts you to approve security-related changes before deploying them. */

  /* NodePackageOptions */
  // allowLibraryDependencies: true,                                           /* Allow the project to include `peerDependencies` and `bundledDependencies`. */
  // authorEmail: undefined,                                                   /* Author's e-mail. */
  // authorName: undefined,                                                    /* Author's name. */
  // authorOrganization: undefined,                                            /* Author's Organization. */
  // authorUrl: undefined,                                                     /* Author's URL / Website. */
  // autoDetectBin: true,                                                      /* Automatically add all executables under the `bin` directory to your `package.json` file under the `bin` section. */
  // bin: undefined,                                                           /* Binary programs vended with your module. */
  // bundledDeps: undefined,                                                   /* List of dependencies to bundle into this module. */
  deps: [
    'object-hash',
    '@aws-sdk/client-glue@^3.16.0',
    '@aws-sdk/client-secrets-manager@^3.16.0',
    '@aws-sdk/client-sts@^3.16.0',
    '@aws-sdk/client-serverlessapplicationrepository@^3.16.0',
    '@aws-sdk/client-lambda@^3.16.0',
    '@aws-sdk/client-cloudformation@^3.16.0',
    'cfn-custom-resource@^5.0.12',
    'sync-fetch@^0.3.0',
    'mongodb@^3.6.6',
    'mongodb-client-encryption@^1.2.3',
  ] /* Runtime dependencies of this module. */,
  description:
    'Real-time Fraud Detection with Graph Neural Network on DGL' /* The description is just a string that helps people understand the purpose of the package. */,
  devDeps: [
    '@types/aws-lambda@^8.10.76',
    '@types/mongodb@^3.6.8',
    'typescript@^4.2.0',
  ] /* Build dependencies for this module. */,
  // entrypoint: 'lib/index.js',                                               /* Module entrypoint (`main` in `package.json`). */
  // homepage: undefined,                                                      /* Package's Homepage / Website. */
  keywords: [
    'GNN',
    'DGL',
    'AWS-CDK',
    'GraphDB',
    'Neptune',
    'Fraud Detection',
  ] /* Keywords to include in `package.json`. */,
  license: 'Apache-2.0' /* License's SPDX identifier. */,
  licensed: false /* Indicates if a license should be added. */,
  // maxNodeVersion: undefined,                                                /* Minimum node.js version to require via `engines` (inclusive). */
  // minNodeVersion: undefined,                                                /* Minimum Node.js version to require via package.json `engines` (inclusive). */
  // npmTaskExecution: NpmTaskExecution.PROJEN,                                /* Determines how tasks are executed when invoked as npm scripts (yarn/npm run xyz). */
  // packageManager: NodePackageManager.YARN,                                  /* The Node Package Manager used to execute scripts. */
  // packageName: undefined,                                                   /* The "name" in package.json. */
  // peerDependencyOptions: undefined,                                         /* Options for `peerDeps`. */
  // peerDeps: [],                                                             /* Peer dependencies for this module. */
  // projenCommand: 'npx projen',                                              /* The shell command to use in order to run the projen CLI. */
  // repository: undefined,                                                    /* The repository is the location where the actual code for your package lives. */
  // repositoryDirectory: undefined,                                           /* If the package.json for your package is not in the root directory (for example if it is part of a monorepo), you can specify the directory in which it lives. */
  // scripts: {},                                                              /* npm scripts to include. */
  // stability: undefined,                                                     /* Package's Stability. */

  /* NodeProjectOptions */
  // antitamper: true,                                                         /* Checks that after build there are no modified files on git. */
  buildWorkflow: false /* Define a GitHub workflow for building PRs. */,
  // codeCov: false,                                                           /* Define a GitHub workflow step for sending code coverage metrics to https://codecov.io/ Uses codecov/codecov-action@v1 A secret is required for private repos. Configured with @codeCovTokenSecret. */
  // codeCovTokenSecret: undefined,                                            /* Define the secret name for a specified https://codecov.io/ token A secret is required to send coverage for private repositories. */
  // copyrightOwner: undefined,                                                /* License copyright owner. */
  // copyrightPeriod: undefined,                                               /* The copyright years to put in the LICENSE file. */
  defaultReleaseBranch: 'main' /* The name of the main release branch. */,
  // dependabot: true,                                                         /* Include dependabot configuration. */
  // dependabotOptions: undefined,                                             /* Options for dependabot. */
  gitignore: [
    '.idea/',
    '.vscode/',
    'cdk.context.json',
    '.DS_Store',
  ] /* Additional entries to .gitignore. */,
  // jest: true,                                                               /* Setup jest unit tests. */
  // jestOptions: {
  //   typescriptConfig: jestTsConfig,
  // } /* Jest options. */,
  // libdir: 'lib',                                                            /* Compiler artifacts output directory. */
  // mergify: true,                                                            /* Adds mergify configuration. */
  // mergifyAutoMergeLabel: 'auto-merge',                                      /* Automatically merge PRs that build successfully and have this label. */
  // mergifyOptions: undefined,                                                /* Options for mergify. */
  // npmDistTag: 'latest',                                                     /* The dist-tag to use when releasing to npm. */
  // npmignore: undefined,                                                     /* Additional entries to .npmignore. */
  // npmignoreEnabled: true,                                                   /* Defines an .npmignore file. Normally this is only needed for libraries that are packaged as tarballs. */
  // npmRegistry: 'registry.npmjs.org',                                        /* The registry url to use when releasing packages. */
  // projenDevDependency: true,                                                /* Indicates of "projen" should be installed as a devDependency. */
  // projenUpgradeAutoMerge: undefined,                                        /* Automatically merge projen upgrade PRs when build passes. */
  // projenUpgradeSchedule: [ '0 6 * * *' ],                                   /* Customize the projenUpgrade schedule in cron expression. */
  // projenUpgradeSecret: undefined,                                           /* Periodically submits a pull request for projen upgrades (executes `yarn projen:upgrade`). */
  // projenVersion: Semver.latest(),                                           /* Version of projen to install. */
  pullRequestTemplate: true /* Include a GitHub pull request template. */,
  pullRequestTemplateContents: [
    '',
    '----',
    '',
    '*By submitting this pull request, I confirm that my contribution is made under the terms of the Apache-2.0 license*',
  ] /* The contents of the pull request template. */,
  // rebuildBot: undefined,                                                    /* Installs a GitHub workflow which is triggered when the comment "@projen rebuild" is added to a pull request. */
  // rebuildBotCommand: 'rebuild',                                             /* The pull request bot command to use in order to trigger a rebuild and commit of the contents of the branch. */
  // releaseBranches: [ 'master' ],                                            /* Branches which trigger a release. */
  // releaseEveryCommit: true,                                                 /* Automatically release new versions every commit to one of branches in `releaseBranches`. */
  // releaseSchedule: undefined,                                               /* CRON schedule to trigger new releases. */
  // releaseToNpm: false,                                                      /* Automatically release to npm when new versions are introduced. */
  // releaseWorkflow: undefined,                                               /* Define a GitHub workflow for releasing from "master" when new versions are bumped. */
  // srcdir: 'src',                                                            /* Typescript sources directory. */
  // testdir: 'test',                                                          /* Tests directory. */
  // workflowBootstrapSteps: 'yarn install --frozen-lockfile && yarn projen',  /* Workflow steps to use in order to bootstrap this repo. */
  // workflowContainerImage: undefined,                                        /* Container image to use for GitHub workflows. */
  // workflowNodeVersion: undefined,                                           /* The node version to use in GitHub workflows. */

  /* ProjectOptions */
  // clobber: true,                                                            /* Add a `clobber` task which resets the repo to origin. */
  // gitpod: false,                                                            /* Adds a gitpod configuration. */
  // outdir: '.',                                                              /* The root directory of the project. */
  // parent: undefined,                                                        /* The parent project, if this project is part of a bigger project. */
  // projectType: ProjectType.UNKNOWN,                                         /* Which type of project this is (library/app). */
  // readme: undefined,                                                        /* The README setup. */

  /* TypeScriptProjectOptions */
  // compileBeforeTest: undefined,                                             /* Compile the code before running tests. */
  // disableTsconfig: false,                                                   /* Do not generate a `tsconfig.json` file (used by jsii projects since tsconfig.json is generated by the jsii compiler). */
  // docgen: false,                                                            /* Docgen by Typedoc. */
  // docsDirectory: 'docs',                                                    /* Docs directory. */
  // entrypointTypes: undefined,                                               /* The .d.ts file that includes the type declarations for this module. */
  // eslint: true,                                                             /* Setup eslint. */
  // eslintOptions: undefined,                                                 /* Eslint options. */
  // package: true,                                                            /* Defines a `yarn package` command that will produce a tarball and place it under `dist/js`. */
  // sampleCode: true,                                                         /* Generate one-time sample in `src/` and `test/` if there are no files there. */
  tsconfig: tsExcludeConfig /* Custom TSConfig. */,
  // typescriptVersion: '^3.9.5',                                              /* TypeScript version to use. */
});

project.addTask('deploy-to-default-vpc', {
  exec: 'cdk deploy -c vpcId=default',
});
project.addTask('cdk-init', {
  exec: 'cdk bootstrap',
});
project.addTask('postinstall', {
  exec:
    'git submodule init && git submodule sync && git submodule update && docker run --rm -v `pwd`/src/script-libs/amazon-neptune-tools/neptune-python-utils:/src --workdir /src python:3.8-buster bash -c "apt update && apt install -y sudo zip && rm -rf /src/target && /src/build.sh"',
});
project.package.addField('resolutions', {
  'trim-newlines': '^3.0.1',
});

const tsReactConfig = {
  compilerOptions: {
    lib: ['dom', 'dom.iterable', 'esnext'],
    target: 'es5',
    module: 'esnext',
    allowJs: true,
    skipLibCheck: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    forceConsistentCasingInFileNames: true,
    moduleResolution: 'node',
    isolatedModules: true,
    noEmit: true,
  },
};

const reactPrj = new web.ReactTypeScriptProject({
  deps: [
    '@material-ui/core@^4.11.3',
    '@material-ui/icons@^4.11.2',
    '@material-ui/lab@^5.0.0-alpha.25',
    '@testing-library/jest-dom@^5.11.4',
    '@testing-library/react@^11.1.0',
    '@testing-library/user-event@^12.1.10',
    '@types/jest@^26.0.15',
    '@types/node@^12.0.0',
    '@types/react@^17.0.0',
    '@types/react-dom@^17.0.0',
    'apexcharts@^3.25.0',
    'aws-sdk@^2.141.0',
    'aws-appsync@^1.0.0',
    'graphql-tag@^2.5.0',
    'i18next@^20.1.0',
    'i18next-browser-languagedetector@^6.1.0',
    'i18next-http-backend@^1.2.1',
    'axios@^0.21.1',
    'aws-amplify@^3.3.22',
    'best-queue@^2.0.1',
    'moment@^2.29.1',
    'node-sass@^5.0.0',
    'react@^17.0.1',
    'react-apexcharts@^1.3.7',
    'react-dom@^17.0.1',
    'react-i18next@^11.8.13',
    'react-loader-spinner@^4.0.0',
    'react-minimal-pie-chart@^8.1.0',
    'react-router-dom@^5.2.0',
    'react-scripts@4.0.3',
    'sweetalert2@^10.15.5',
    'typescript@^4.1.2',
    'web-vitals@^1.0.1',
  ],
  devDeps: [
    '@types/react-loader-spinner@^3.1.3',
    '@types/react-router-dom@^5.1.7',
  ],
  gitignore: ['src/aws-exports.js'],
  description: 'Dashboard frontend power by react.',
  version: '0.1.0',
  name: 'fraud-detection-solution-dashboard',
  jsiiFqn: 'projen.web.ReactTypeScriptProject',
  license: 'Apache-2.0',
  licensed: false,
  outdir: 'src/frontend',
  readme: undefined,
  defaultReleaseBranch: 'main',
  parent: project,
  tsconfig: tsReactConfig /* Custom TSConfig. */,
});
reactPrj.addTask('postinstall', {
  exec: 'npx projen build',
});
reactPrj.package.addField('resolutions', {
  'trim-newlines': '^3.0.1',
});

project.synth();
