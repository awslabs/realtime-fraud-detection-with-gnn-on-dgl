/* eslint import/no-unresolved: "off" */
/* eslint @typescript-eslint/no-require-imports: "off" */
import * as crypto from 'crypto';
import { CloudFormation } from '@aws-sdk/client-cloudformation';
import { Lambda } from '@aws-sdk/client-lambda';
import { ServerlessApplicationRepository } from '@aws-sdk/client-serverlessapplicationrepository';
import { CloudFormationCustomResourceHandler, CloudFormationCustomResourceUpdateEvent, CloudFormationCustomResourceDeleteEvent } from 'aws-lambda';
const cfnCR = require('cfn-custom-resource');
const { configure, sendResponse, LOG_VERBOSE, SUCCESS, FAILED } = cfnCR;

configure({ logLevel: LOG_VERBOSE });

export const handler: CloudFormationCustomResourceHandler = async (event, _context) => {
  console.info(`Receiving SAR deployment event ${JSON.stringify(event, null, 2)}`);
  var responseData: any;
  var result = SUCCESS;
  var reason: any = '';
  var resourceId: string | undefined = undefined;
  try {
    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        const applicationId = event.ResourceProperties.APPLICATION;
        const sematicVersion = event.ResourceProperties.SEMATIC_VERSION;
        const region = event.ResourceProperties.REGION;
        const outputAtt = event.ResourceProperties.OUTPUT_ATT;
        const name = event.ResourceProperties.NAME;

        const id = crypto.randomBytes(16).toString('hex');

        if (event.RequestType == 'Update') {
          const updateEvent = event as CloudFormationCustomResourceUpdateEvent;
          resourceId = updateEvent.PhysicalResourceId;
        } else {
          resourceId = `${name}-${id}`;
        }

        const sarClient = new ServerlessApplicationRepository({
          region,
        });
        const cfnClient = new CloudFormation({
          region,
        });
        const lambdaClient = new Lambda({
          region,
        });

        const app = await sarClient.getApplication({
          ApplicationId: applicationId,
          SemanticVersion: sematicVersion,
        });

        console.info(`Creating change set for SAR app ${applicationId}...`);
        const changeSetId = (await sarClient.createCloudFormationChangeSet({
          ApplicationId: applicationId,
          StackName: `${name}-${id}`.substring(0, 127),
          SemanticVersion: sematicVersion,
          Capabilities: app.Version?.RequiredCapabilities,
          ParameterOverrides: event.ResourceProperties.Parameters,
        })).ChangeSetId;
        console.info(`Changeset ${changeSetId} is created.`);

        var waitInterval = 3000;
        for (var i = 0; i < 10; i++) {
          await sleep(waitInterval);

          const changeSetStatus = (await cfnClient.describeChangeSet({
            ChangeSetName: changeSetId,
          })).Status;

          if (changeSetStatus == 'CREATE_COMPLETE') {break;} else {
            console.log(`Changeset status is ${changeSetStatus}, wait for another ${waitInterval/1000} seconds.`);
          }
        }

        await cfnClient.executeChangeSet({
          ChangeSetName: changeSetId,
        });

        var waitInterval = 10000;
        for (var i = 0; i < 50; i++) {
          await sleep(waitInterval);

          const changeset = (await cfnClient.describeChangeSet({
            ChangeSetName: changeSetId,
          }));
          const exeStatus = changeset.ExecutionStatus;
          if ( exeStatus == 'EXECUTE_COMPLETE') {
            const funcArn = (await cfnClient.describeStacks({
              StackName: changeset.StackId,
            })).Stacks?.pop()?.Outputs?.filter(out => out.OutputKey == outputAtt).pop()?.OutputValue;

            console.log(`The func ${funcArn} is created in SAR application.`);

            const funcVersionArn = (await lambdaClient.publishVersion({
              FunctionName: funcArn,
            })).FunctionArn;

            responseData = {
              FuncArn: funcArn,
              FuncVersionArn: funcVersionArn,
            };
            break;
          } else {
            console.log(`The execution status of changeset is ${exeStatus}, wait for another ${waitInterval/1000} seconds.`);
            if (exeStatus == 'EXECUTE_FAILED') {
              result = FAILED;
              reason = `The execution status of changeset '${changeSetId}' is failure.`;
              console.error('The execution status of changeset is failure, exiting.');
              break;
            }
          }
        }

        break;
      case 'Delete':
        const deleteEvent = event as CloudFormationCustomResourceDeleteEvent;
        resourceId = deleteEvent.PhysicalResourceId;
        break;
    }
  } catch (err) {
    if (err instanceof Error) {
      console.error(`Failed to deploy SAR application due to ${err}.`);
      responseData = err.message;
      result = FAILED;
      reason = err.message;
      console.log(err.stack);
    }
  }
  return sendResponse({
    Status: result,
    Reason: reason,
    PhysicalResourceId: (resourceId ? resourceId : _context.logStreamName),
    Data: responseData,
  }, event);
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}