/* eslint import/no-unresolved: "off" */
import { _toMongoIndexRequest } from '../../../src/lambda.d/create-indexes/handler';

describe('convert indexes parameter to docdb index request', () => {

  test('convert indexes str parameter to docdb index request', async () => {
    const para = [{
      key: {
        isFraud: '1',
        timestamp: '-1',
      },
    }];
    expect(_toMongoIndexRequest(para)).toEqual([{
      key: {
        isFraud: 1,
        timestamp: -1,
      },
    }]);
  });

});
