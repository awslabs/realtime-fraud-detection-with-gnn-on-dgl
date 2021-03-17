/* eslint import/no-unresolved: "off" */
import { Handler } from 'aws-lambda';
import { MongoClient } from 'mongodb';
import { initMongoClient } from '../share.d/doc-util';

export type TransactionHandler = Handler<Payload, Result>;

export interface Payload {
  readonly field: string;
  readonly data: Range;
}

export interface Amount {
  readonly sum: number;
  readonly count: number;
}

type Result = TransactionStats | Transaction[] | void;

export interface Range {
  readonly start: number;
  readonly end: number;
  readonly limit?: number;
}

export interface TransactionStats {
  readonly totalCount: number;
  readonly totalAmount: number;
  readonly fraudCount: number;
  readonly totalFraudAmount: number;
  readonly range: Range;
}

export interface Transaction {
  readonly id: string;
  readonly amount: number;
  readonly timestamp: number;
  readonly productCD?: string;
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

export const handler: TransactionHandler = async (payload, _context) => {
  console.info(`Receiving transaction request ${JSON.stringify(payload, null, 2)}.`);

  if (!cachedClient) {
    cachedClient = await initMongoClient();
  }

  let result: Result;

  const range: Range = payload.data;
  const database = cachedClient.db(process.env.DB_DATABASE!);
  const collection = database.collection<Transaction>(process.env.DB_COLLECTION!);

  switch (payload.field) {
    case 'getStats':
      const allTransQuery = collection.aggregate<Transaction>()
        .match({ timestamp: { $gte: range.start, $lte: range.end } })
        .group({ _id: null, sum: { $sum: '$amount' }, count: { $sum: 1 } })
        .project<Amount>({ _id: 0, sum: 1, count: 1 }).next();
      const fraudTransQuery = collection.aggregate<Transaction>()
        .match({ isFraud: true, timestamp: { $gte: range.start, $lte: range.end } })
        .group({ _id: null, sum: { $sum: '$amount' }, count: { $sum: 1 } })
        .project<Amount>({ _id: 0, sum: 1, count: 1 }).next();

      const rts = await Promise.all([allTransQuery, fraudTransQuery]);

      result = {
        totalCount: rts[0]?.count ?? 0,
        totalAmount: rts[0]?.sum ?? 0,
        fraudCount: rts[1]?.count ?? 0,
        totalFraudAmount: rts[1]?.sum ?? 0,
        range: range,
      };
      break;
    case 'getFraudTransactions':
      const fraudQuery = { isFraud: true, timestamp: { $gte: range.start, $lte: range.end } };

      result = await collection.find(fraudQuery).sort({ timestamp: -1 }).limit(range.limit ?? 10).toArray();
      break;
    default:
      throw new Error(`Unregconized request field '${payload.field}'!`);
  }

  console.info(`Query result is ${JSON.stringify(result, null, 2)}.`);

  return result;
};