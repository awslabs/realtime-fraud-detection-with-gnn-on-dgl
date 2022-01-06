/* tslint:disable */
/* eslint-disable */
//  This file was automatically generated and should not be edited.

export type TransactionStats = {
  __typename: "TransactionStats",
  totalCount?: number,
  totalAmount?: number,
  fraudCount?: number,
  totalFraudAmount?: number,
};

export type Transaction = {
  __typename: "Transaction",
  id?: string,
  amount?: number,
  timestamp?: number,
  productCD?: string | null,
  card1?: string | null,
  card2?: string | null,
  card3?: string | null,
  card4?: string | null,
  card5?: string | null,
  card6?: string | null,
  addr1?: string | null,
  addr2?: string | null,
  dist1?: string | null,
  dist2?: string | null,
  pEmaildomain?: string | null,
  rEmaildomain?: string | null,
  isFraud?: boolean,
};

export type GetTransactionStatsQueryVariables = {
  start?: number | null,
  end?: number | null,
};

export type GetTransactionStatsQuery = {
  getTransactionStats?:  {
    __typename: "TransactionStats",
    totalCount: number,
    totalAmount: number,
    fraudCount: number,
    totalFraudAmount: number,
  } | null,
};

export type GetFraudTransactionsQueryVariables = {
  start?: number | null,
  end?: number | null,
};

export type GetFraudTransactionsQuery = {
  getFraudTransactions?:  Array< {
    __typename: "Transaction",
    id: string,
    amount: number,
    timestamp: number,
    productCD?: string | null,
    card1?: string | null,
    card2?: string | null,
    card3?: string | null,
    card4?: string | null,
    card5?: string | null,
    card6?: string | null,
    addr1?: string | null,
    addr2?: string | null,
    dist1?: string | null,
    dist2?: string | null,
    pEmaildomain?: string | null,
    rEmaildomain?: string | null,
    isFraud: boolean,
  } | null > | null,
};
