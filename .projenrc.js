const { awscdk, typescript } = require('projen');

const tsExcludeConfig = {
  compilerOptions: {
    lib: ['dom', 'es2018'],
  },
  exclude: [
    'cdk.out/**/*',
  ],
};

const cdkAlphaDeps = [
  '@aws-cdk/aws-apigatewayv2-alpha',
  '@aws-cdk/aws-apigatewayv2-integrations-alpha',
  '@aws-cdk/aws-appsync-alpha',
  '@aws-cdk/aws-glue-alpha',
  '@aws-cdk/aws-lambda-python-alpha',
  '@aws-cdk/aws-neptune-alpha',
].map(dep => `${dep}@2.0.0-alpha.11`);
const awsSDKDeps = [
  '@aws-sdk/client-glue',
  '@aws-sdk/client-secrets-manager',
  '@aws-sdk/client-sts',
  '@aws-sdk/client-serverlessapplicationrepository',
  '@aws-sdk/client-lambda',
  '@aws-sdk/client-cloudformation',
].map(dep => `${dep}@^3.30.0`);
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.0.0',
  name: 'realtime-fraud-detection-with-gnn-on-dgl',
  /* AwsCdkTypeScriptAppOptions */
  // appEntrypoint: 'main.ts',                                                 /* The CDK app's entrypoint (relative to the source directory, which is "src" by default). */
  cdkVersionPinning: false /* Use pinned version instead of caret version for CDK. */,
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
    '@types/aws-lambda@^8.10.83',
    'cfn-custom-resource@^5.0.14',
    'sync-fetch@^0.3.0',
    'mongodb@^3.7.0',
    'mongodb-client-encryption@^1.2.6',
    'cdk-bootstrapless-synthesizer@^2.1.1',
    ...awsSDKDeps,
    ...cdkAlphaDeps,
  ] /* Runtime dependencies of this module. */,
  description:
    'Real-time Fraud Detection with Graph Neural Network on DGL' /* The description is just a string that helps people understand the purpose of the package. */,
  devDeps: [
    '@types/mongodb@^3.6.20',
    '@types/bson@^4.2.0',
    'constructs@^10.0.5',
    '@aws-cdk/cloud-assembly-schema@^2',
    '@aws-cdk/cx-api@^2',
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
  minNodeVersion: '14.17.0', /* Minimum Node.js version to require via package.json `engines` (inclusive). */
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
  buildWorkflow: true /* Define a GitHub workflow for building PRs. */,
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
    'docs/site/',
    'frontend/amplify',
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
  typescriptVersion: '~4.6.0', /* TypeScript version to use. */
  depsUpgradeOptions: {
    ignoreProjen: false,
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
    },
  },
});

project.addTask('deploy-to-default-vpc', {
  exec: 'cdk deploy -c vpcId=default',
});
project.addTask('cdk-init', {
  exec: 'cdk bootstrap',
});
project.addTask('postinstall', {
  exec:
    'git submodule init && git submodule sync && git submodule update && docker run --rm -v `pwd`/src/script-libs/amazon-neptune-tools/neptune-python-utils:/src --workdir /src python:3.8-buster bash -c "apt update && apt install -y sudo zip && rm -rf /src/target && /src/build.sh" && yarn --cwd frontend install --check-files --frozen-lockfile',
});
project.package.addField('resolutions',
  Object.assign({}, project.package.manifest.resolutions ? project.package.manifest.resolutions : {}, {
    'trim-newlines': '^3.0.1',
    'pac-resolver': '^5.0.0',
    'set-value': '^4.0.1',
    'ansi-regex': '^5.0.1',
  }));
project.addFields({
  version: '2.0.2-mainline',
});

const tsReactConfig = {
  compilerOptions: {
    rootDir: './',
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
    jsx: 'react-jsx',
    noEmit: true,
  },
  include: [
    'src/**/*.tsx',
    'test/**/*.tsx',
  ],
};

const reactPrj = new typescript.TypeScriptAppProject({
  deps: [
    'react@^17.0.2',
    'react-dom@^17.0.2',
    'web-vitals@^1.1.2',
    '@material-ui/core@^4.11.4',
    '@material-ui/icons@^4.11.2',
    '@material-ui/lab@^5.0.0-alpha.25',
    'apexcharts@^3.27.1',
    'aws-sdk@^2.1058.0',
    'aws-appsync@^4.0.3',
    'graphql-tag@^2.12.4',
    'i18next@^20.3.1',
    'i18next-browser-languagedetector@^6.1.1',
    'i18next-http-backend@^1.2.6',
    'axios@^0.24.0',
    'aws-amplify@^4.3.12',
    'best-queue@^2.0.1',
    'moment@^2.29.4',
    'react-apexcharts@^1.3.9',
    'react-i18next@^11.11.0',
    'react-loader-spinner@^4.0.0',
    'react-router-dom@^5.2.0',
    'react-scripts@^4.0.0',
    'sweetalert2@^10.16.9',
    '@testing-library/jest-dom@^5.14.1',
    '@testing-library/react@^11.2.7',
    '@testing-library/user-event@^13.1.9',
  ],
  devDeps: [
    '@types/node@^14',
    '@types/react@^17.0.11',
    '@types/react-dom@^17.0.8',
    '@types/jest@^26.0.23',
    '@types/react-loader-spinner@^3.1.3',
    '@types/react-router-dom@^5.1.7',
    'eslint-plugin-react-hooks@next',
    'eventsource@^2.0.2',
  ],
  gitignore: [
    'src/aws-exports.js',
    'build/',
  ],
  description: 'Dashboard frontend power by react.',
  version: '0.1.0',
  name: 'fraud-detection-solution-dashboard',
  license: 'Apache-2.0',
  licensed: false,
  outdir: 'frontend',
  readme: undefined,
  defaultReleaseBranch: 'main',
  parent: project,
  tsconfig: tsReactConfig /* Custom TSConfig. */,
});
reactPrj.addTask('postinstall', {
  exec: 'npx projen build',
});
reactPrj.postCompileTask.exec('react-scripts --max_old_space_size=4096 build');
reactPrj.addTask('dev', {
  description: 'Starts the react application',
  exec: 'react-scripts start',
});
reactPrj.addFields({
  browserslist: {
    production: [
      '>0.2%',
      'not dead',
      'not op_mini all',
    ],
    development: [
      'last 1 chrome version',
      'last 1 firefox version',
      'last 1 safari version',
    ],
  },
});
reactPrj.package.addField('resolutions',
  Object.assign({}, reactPrj.package.manifest.resolutions ? reactPrj.package.manifest.resolutions : {}, {
    'got': '^11.8.5',
    'shell-quote': '^1.7.3',
    'trim-newlines': '^3.0.1',
    'glob-parent': '^5.1.2',
    'normalize-url': '^4.5.1',
    'browserslist': '^4.16.5',
    'css-what': '^5.0.1',
    'immer': '^9.0.6',
    'set-value': '^4.0.1',
    'ansi-regex': '^5.0.1',
    'nth-check': '^2.0.1',
    'json-schema': '^0.4.0',
    'node-forge': '^1.2.1',
    'follow-redirects': '^1.14.7',
    'shelljs': '^0.8.5',
    'url-parse': '^1.5.9',
    'follow-redirects': '^1.14.8',
    'node-fetch': '^2.6.7',
    'cross-fetch': '^3.1.5',
    'ejs': '^3.1.7',
    'async': '^2.6.4',
    'ansi-html': 'https://registry.npmjs.org/ansi-html-community/-/ansi-html-community-0.0.8.tgz',
    'eventsource': '^2.0.2',
  }));

project.synth();
