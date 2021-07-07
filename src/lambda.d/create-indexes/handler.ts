/* eslint @typescript-eslint/no-require-imports: "off" */
import { MongoClient } from 'mongodb';
import { initMongoClient } from '../share.d/doc-util';
const hash = require('object-hash');

let cachedClient: MongoClient;

export const createIndexes: AWSCDKAsyncCustomResource.OnEventHandler =
  async (event: AWSCDKAsyncCustomResource.OnEventRequest) : Promise<AWSCDKAsyncCustomResource.OnEventResponse> => {
    console.info(`Receiving create indexes event ${JSON.stringify(event, null, 2)}`);

    var resourceId: string | undefined = undefined;
    try {
      switch (event.RequestType) {
        case 'Create':
          // only connect to mongo when it's the event of creating resource
          if (!cachedClient) {
            cachedClient = await initMongoClient();
          }
          const databaseStr = event.ResourceProperties.Database;
          const collectionStr = event.ResourceProperties.Collection;

          const database = cachedClient.db(databaseStr);
          const collection = database.collection(collectionStr);

          const indexes = _toMongoIndexRequest(event.ResourceProperties.Indexes);
          console.info(`Creating indexes ${JSON.stringify(indexes, null, 2)} on collection ${collectionStr} using db ${databaseStr}.`);

          await collection.createIndexes(indexes);

          resourceId = hash(event.ResourceProperties);
          break;
        case 'Update':
        case 'Delete':
          // never connects to mongo, there is no guarantee of db secret in secret manager still exists
          resourceId = event.PhysicalResourceId;
          // TODO: implement it if necessary
          break;
      }
    } catch (err) {
      console.error(`Failed to create indexes due to ${err}.`);
      throw err;
    } finally {
      if (cachedClient) {await cachedClient.close();}
    }

    return {
      PhysicalResourceId: resourceId,
    };
  };

export function _toMongoIndexRequest(indexes: { key : { [key: string]: string } }[]): { key : { [key: string]: number } }[] {
  let indexReq: [ { key: { [key: string]: number } } ];
  indexes.forEach(idx => {
    const idxReq: { key : { [key: string]: number } } = {
      key: {},
    };
    Object.keys(idx.key).forEach((k: string) => {
      idxReq.key[k] = parseInt(idx.key[k]);
    });
    if (indexReq) {indexReq.push(idxReq);} else {indexReq = [idxReq];}
  });
  return indexReq!;
}