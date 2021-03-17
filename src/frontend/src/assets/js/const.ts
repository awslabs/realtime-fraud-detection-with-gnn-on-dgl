import moment from 'moment';

export const SYS_GATEWAY_API_URL = '__FRAUD_DETECTION_SYS_APIGATEWAY_URL__';

export const DEFAULT_PULLING_INTERVAL = 20 * 1000;

export const POLLING_INTERVAL_LIST = [
  { value: 10 * 1000, name: '10 seconds' },
  { value: 20 * 1000, name: '20 seconds' },
  { value: 30 * 1000, name: '30 seconds' },
  { value: 60 * 1000, name: '1 minute' },
  { value: 5 * 60 * 1000, name: '5 minute' },
];

export const DEFAULT_DURATION_TIME = 5 * 60;

export const DURATION_TIME_LIST = [
  { value: 1 * 60, name: 'last 1 minutes' },
  { value: 5 * 60, name: 'last 5 minutes' },
  { value: 10 * 60, name: 'last 10 minutes' },
  { value: 30 * 60, name: 'last 30 minutes' },
];

export const momentFormatData = (time: Date | string, isInput = false, spanTime = 0): string => {
  let formatStr = 'MM-DD HH:mm:ss';
  if (isInput) {
    formatStr = 'yyyy-MM-DD HH:mm:ss';
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tmpTime: any = time;
  if (typeof time === 'string' && time.indexOf('T') < 0) {
    tmpTime = new Date(time.replace(/-/g, '/'));
  } else {
    tmpTime = new Date(time);
  }

  if (spanTime !== 0) {
    tmpTime = tmpTime.setSeconds(new Date(tmpTime).getSeconds() + spanTime);
  }
  return moment(new Date(tmpTime)).format(formatStr);
};

export const numberFormatter = (num: number, digits: number) => {
  var si = [
    { value: 1, symbol: '' },
    { value: 1e3, symbol: 'k' },
    { value: 1e6, symbol: 'M' },
    { value: 1e9, symbol: 'G' },
    { value: 1e12, symbol: 'T' },
    { value: 1e15, symbol: 'P' },
    { value: 1e18, symbol: 'E' },
  ];
  var rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  var i;
  for (i = si.length - 1; i > 0; i--) {
    if (num >= si[i].value) {
      break;
    }
  }
  return (num / si[i].value).toFixed(digits).replace(rx, '$1') + ' ' + si[i].symbol;
};
