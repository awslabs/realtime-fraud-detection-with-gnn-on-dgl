/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const getTransactionStats = /* GraphQL */ `
  query GetTransactionStats($start: Int, $end: Int) {
    getTransactionStats(start: $start, end: $end) {
      totalCount
      totalAmount
      fraudCount
      totalFraudAmount
    }
  }
`;
export const getFraudTransactions = /* GraphQL */ `
  query GetFraudTransactions($start: Int, $end: Int) {
    getFraudTransactions(start: $start, end: $end) {
      id
      amount
      timestamp
      productCD
      card1
      card2
      card3
      card4
      card5
      card6
      addr1
      addr2
      dist1
      dist2
      pEmaildomain
      rEmaildomain
      isFraud
    }
  }
`;
