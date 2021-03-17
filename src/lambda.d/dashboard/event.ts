/* eslint import/no-unresolved: "off" */
import { SQSHandler } from 'aws-lambda';
import { MongoClient } from 'mongodb';
import { initMongoClient } from '../share.d/doc-util';

export interface Transaction {
  readonly id: string;
  readonly amount: number;
  readonly timestamp: number;
  readonly productCD: string;
  readonly card1?: string;
  readonly card2?: string;
  readonly card3?: string;
  readonly card4?: string;
  readonly card5?: string;
  readonly card6?: string;
  readonly addr1?: string;
  readonly addr2?: string;
  readonly dist1?: string;
  readonly dist2?: string;
  readonly pEmaildomain?: string;
  readonly rEmaildomain?: string;
  readonly isFraud: boolean;
}

let cachedClient: MongoClient;

export const handler: SQSHandler = async (event, _context) => {
  console.info(`Receiving transaction request ${JSON.stringify(event, null, 2)}.`);

  if (!cachedClient) {
    cachedClient = await initMongoClient();
  }

  const database = cachedClient.db(process.env.DB_DATABASE!);
  const collection = database.collection<Transaction>(process.env.DB_COLLECTION!);

  const result = await collection.insertMany(event.Records.map(r => JSON.parse(r.body) as Transaction));

  console.info(`Transactions are inserted with result ${JSON.stringify(result, null, 2)}.`);
};