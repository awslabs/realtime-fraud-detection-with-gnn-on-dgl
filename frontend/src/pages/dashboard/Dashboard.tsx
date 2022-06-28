/* eslint @typescript-eslint/no-floating-promises: "off" */

import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControl from '@material-ui/core/FormControl';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import TextField from '@material-ui/core/TextField';
import WbIncandescentIcon from '@material-ui/icons/WbIncandescent';

import axios from 'axios';
import { createQueue } from 'best-queue';
import gql from 'graphql-tag';
import React, { useState, useEffect, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import Loader from 'react-loader-spinner';
import { useParams } from 'react-router-dom';

import Swal from 'sweetalert2';

import {
  momentFormatData,
  numberFormatter,
  DURATION_TIME_LIST,
  POLLING_INTERVAL_LIST,
  SYS_GATEWAY_API_URL,
  DEFAULT_PULLING_INTERVAL,
  DEFAULT_DURATION_TIME,
  TIME_TYPE,
} from '../../assets/js/const';
import ClientContext from '../../common/ClientContext';
import { getTransactionStats, getFraudTransactions } from '../../graphql/queries';

import CountCard from './comps/CountCard';
import RealtimeChart from './comps/RealtimeChart';
import TransactionList from './comps/TransactionList';

interface FraudType {
  id: number;
  amount: number;
  isFraud: boolean;
  timestamp: number;
  isNew?: boolean;
}

interface ParamType {
  lang: string;
}

const CHART_INIT_COUNT = 10;
const Dashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const param: ParamType = useParams();
  const client: any = React.useContext(ClientContext);
  const [transList, setTransList] = useState<FraudType[]>([]);
  const [fraudCount, setFraudCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [fraudAmount, setFraudAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [fraudCountArr, setFraudCountArr] = useState<number[]>([]);
  const [totalCountArr, setTotalCountArr] = useState<number[]>([]);
  const [dateTimeArr, setDateTimeArr] = useState<string[]>([]);
  const [hasNew, setHasNew] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [pollingInterval, setPollingInterval] = useState(DEFAULT_PULLING_INTERVAL);
  const [pollingChartInterval, setPollingChartInterval] = useState((DEFAULT_DURATION_TIME * 1000) / CHART_INIT_COUNT);
  const [dataDurationTime, setDataDurationTime] = useState(DEFAULT_DURATION_TIME);

  // Simulate Input Data
  const [loadingSimulate, setLoadingSimulate] = useState(false);
  const [duration, setDuration] = useState<string | number>(300); // Unit Seconds
  const [concurrent, setConcurrent] = useState<string | number>(10); // Unit Time (并发个数)
  const [dataInterval, setDataInterval] = useState<string | number>(3); // Unit Seconds, 传给后端需转换成 毫秒

  // const size = useWindowSize();

  useEffect(() => {
    if (param.lang) {
      i18n.changeLanguage(param.lang);
    }
  }, []);

  const simulateData = () => {
    if (duration < 300 || duration > 900) {
      Swal.fire('Duration is invalid');
      return;
    }
    if (concurrent < 1 || concurrent > 40) {
      Swal.fire('Concurrent is invalid');
      return;
    }
    if (dataInterval < 1 || dataInterval > 60) {
      Swal.fire('Interval is invalid');
      return;
    }
    const API_URL = localStorage.getItem(SYS_GATEWAY_API_URL);
    const data = {
      input: {
        duration: typeof duration === 'string' ? parseInt(duration) : duration,
        concurrent: typeof concurrent === 'string' ? parseInt(concurrent) : concurrent,
        interval: parseInt(dataInterval as string) * 1000,
      },
    };
    setLoadingSimulate(true);
    axios
      .post(`${API_URL}/start`, data)
      .then((res) => {
        console.info('res:', res);
        setLoadingSimulate(false);
        setOpenDialog(false);
        Swal.fire({
          title: t('tips.success'),
          text: t('tips.wait'),
          icon: 'success',
          confirmButtonText: t('btn.ok'),
        });
      })
      .catch((err) => {
        setLoadingSimulate(false);
        console.error(err);
      });
  };

  const getTransStatData = async (start: number, end: number) => {
    const query = gql(getTransactionStats);
    const statData: any = await client?.query({
      query: query,
      variables: {
        start: Math.floor(start),
        end: Math.round(end),
      },
    });
    const tmpData = statData.data.getTransactionStats;
    tmpData.start = start;
    tmpData.end = end;
    return tmpData;
  };

  const buildQueueList = () => {
    const now = new Date();
    const endTime = now.getTime() / 1000;
    const avgTime = dataDurationTime / CHART_INIT_COUNT;
    const asyncTasks = [];
    for (let i = 1; i <= CHART_INIT_COUNT; i++) {
      asyncTasks.push(getTransStatData(endTime - avgTime * i, endTime - avgTime * (i - 1)));
    }
    const queue = createQueue(asyncTasks, {
      max: 20,
      interval: 1 * 1000,
      recordError: false,
    });
    queue.resume();
    queue.then((result) => {
      let formatStr = TIME_TYPE.SECOND;
      if (avgTime >= 60) {
        formatStr = TIME_TYPE.MINUTE;
      }
      result.sort((a: any, b: any) => (a.start > b.start ? 1 : -1));
      const tmpFraudCountArr: any = [];
      const tmpTotalCountArr: any = [];
      const tmpDataTimeArr: any = [];
      result.forEach((element: any) => {
        tmpFraudCountArr.push(element.fraudCount);
        tmpTotalCountArr.push(element.totalCount);
        tmpDataTimeArr.push(momentFormatData(new Date(element.end * 1000), formatStr));
      });
      setFraudCountArr(tmpFraudCountArr);
      setTotalCountArr(tmpTotalCountArr);
      setDateTimeArr(tmpDataTimeArr);
    });
  };

  // Get Chart Data By Interval: durationTime/10
  const getChartNextData = useCallback(async () => {
    const now = new Date();
    const prevChartTime = momentFormatData(new Date(), TIME_TYPE.WITH_YEAR, -pollingChartInterval / 1000);
    const startChartTime = new Date(prevChartTime.replace(/-/g, '/')).getTime();
    const endTime = now.getTime();
    console.info('start:end:', prevChartTime, endTime);
    const queryChart = gql(getTransactionStats);
    const chartData: any = await client?.query({
      query: queryChart,
      variables: {
        start: Math.floor(startChartTime / 1000),
        end: Math.round(endTime / 1000),
      },
    });
    setFraudCountArr((prev) => {
      return [...prev, chartData.data.getTransactionStats.fraudCount];
    });
    setTotalCountArr((prev) => {
      return [...prev, chartData.data.getTransactionStats.totalCount];
    });
    setDateTimeArr((prev) => {
      let formatStr = TIME_TYPE.SECOND;
      console.info('pollingChartInterval:', pollingChartInterval);
      if (pollingChartInterval >= 60 * 1000) {
        formatStr = TIME_TYPE.MINUTE;
      }
      return [...prev, momentFormatData(new Date(endTime), formatStr)];
    });
  }, [pollingChartInterval, client]);

  const getDashboardData = useCallback(async () => {
    const now = new Date();
    const prevTime = momentFormatData(new Date(), TIME_TYPE.WITH_YEAR, -dataDurationTime);
    const startTime = new Date(prevTime.replace(/-/g, '/')).getTime();
    const endTime = now.getTime();
    const query = gql(getTransactionStats);
    const statData: any = await client?.query({
      query: query,
      variables: {
        start: Math.floor(startTime / 1000),
        end: Math.round(endTime / 1000),
      },
    });

    if (statData && statData.data && statData.data.getTransactionStats) {
      setFraudCount(statData.data.getTransactionStats.fraudCount);
      setTotalCount(statData.data.getTransactionStats.totalCount);
      setFraudAmount(statData.data.getTransactionStats.totalFraudAmount);
      setTotalAmount(statData.data.getTransactionStats.totalAmount);
    }

    const queryList = gql(getFraudTransactions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fraudList: any = await client?.query({
      query: queryList,
      variables: {
        start: Math.floor(startTime / 1000),
        end: Math.round(endTime / 1000),
      },
    });
    if (fraudList && fraudList.data && fraudList.data.getFraudTransactions) {
      const tmpTransList = fraudList.data.getFraudTransactions;
      setTransList((prev: FraudType[]) => {
        if (prev && prev.length > 0) {
          const idArr = prev.map((a) => a.id);
          const tmpArr: FraudType[] = [];
          tmpTransList.forEach((ele: FraudType) => {
            if (idArr.indexOf(ele.id) < 0) {
              ele.isNew = true;
              tmpArr.push(ele);
            }
          });
          setHasNew(true);
          return [...tmpArr, ...prev];
        } else {
          return [...tmpTransList, ...prev];
        }
      });
    }
  }, [dataDurationTime, client]);

  // Interval to polling Dashboard data
  useEffect(() => {
    const id = setInterval(() => {
      getDashboardData();
    }, pollingInterval);
    return () => clearInterval(id);
  }, [pollingInterval, dataDurationTime]);

  // Interval to Polling Chart Data
  useEffect(() => {
    const chartIntervalId = setInterval(() => {
      console.info('GET CHART DATA');
      getChartNextData();
    }, pollingChartInterval);
    return () => clearInterval(chartIntervalId);
  }, [pollingChartInterval]);

  // Change Duration
  const handleChangeDuration = (event: any) => {
    setDataDurationTime(event.target.value);
  };

  // Change Polling Time Interval
  const handleChangeTimeInterval = (event: any) => {
    setPollingInterval(event.target.value);
  };

  // Show New Fraud Transcation
  useEffect(() => {
    if (hasNew) {
      setTimeout(() => {
        setHasNew(false);
        setTransList((prevList) => {
          const tmpData = [...prevList];
          tmpData.forEach((element) => {
            element.isNew = false;
          });
          return tmpData;
        });
      }, 5000);
    }
  }, [transList, hasNew]);

  // Get Dashboard Date when duration changed
  useEffect(() => {
    getDashboardData();
    buildQueueList();
    setPollingChartInterval((dataDurationTime / CHART_INIT_COUNT) * 1000);
  }, [dataDurationTime]);

  const handleClickOpen = () => {
    setOpenDialog(true);
  };

  const handleClose = () => {
    setOpenDialog(false);
  };

  return (
    <div>
      <div className="fds-dashboard-search">
        <div className="select">
          <b>{t('durationLabel')}: </b>
          <Select
            className="csp-mr-15"
            id="transcation-in-select"
            labelId="transcation-in-label"
            variant="outlined"
            value={dataDurationTime}
            onChange={handleChangeDuration}
          >
            {DURATION_TIME_LIST.map((element, index) => {
              return (
                <MenuItem key={index} value={element.value}>
                  <Trans i18nKey={`duration.${element.name}`} />
                </MenuItem>
              );
            })}
          </Select>

          <b>{t('intervalLabel')}: </b>
          <Select
            variant="outlined"
            labelId="polling-interval"
            id="polling-interval-select"
            value={pollingInterval}
            onChange={handleChangeTimeInterval}
          >
            {POLLING_INTERVAL_LIST.map((element, index) => {
              return (
                <MenuItem key={index} value={element.value}>
                  <Trans i18nKey={`interval.${element.name}`} />
                </MenuItem>
              );
            })}
          </Select>
        </div>
        <div className="search">
          <Button
            onClick={() => {
              handleClickOpen();
            }}
            className="csp-ml-10"
            variant="outlined"
            size="small"
            color="primary"
          >
            {t('btn.simulateData')}
          </Button>
        </div>
      </div>
      <div className="fds-dashboard-summury">
        <CountCard title={t('card.fraudCount')} value={fraudCount} classIndex="1" />
        <CountCard title={t('card.transcationCount')} value={totalCount} classIndex="2" />
        <CountCard title={t('card.fraudAmount')} value={`$${numberFormatter(fraudAmount, 2)}`} classIndex="3" />
        <CountCard
          title={t('card.transcationAmount')}
          value={`$${numberFormatter(totalAmount, 2)}`}
          classIndex="4"
        />
      </div>
      <div>
        <div className="black-item-title">
          <WbIncandescentIcon className="icon" />
          {t('recentFraudTransactions')}
        </div>
        <div className="fds-data-table">
          <div className="fds-linechart">
            <RealtimeChart
              totalData={totalCountArr}
              series={fraudCountArr}
              categories={dateTimeArr}
            />
          </div>
          <div className="fds-data-list">
            <TransactionList transList={transList} />
          </div>
        </div>
      </div>
      <Dialog
        open={openDialog}
        onClose={handleClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{t('simulate.title')}</DialogTitle>
        <DialogContent className="csp-w-500">
          <FormControl fullWidth variant="outlined">
            <div className="form-title">
              {t('simulate.durationTitle')}: <span>({t('simulate.durationTips')})</span>
            </div>
            <TextField
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                setDuration(event.target.value);
              }}
              type="number"
              InputProps={{ inputProps: { min: 300, max: 900 } }}
              value={duration}
              size="small"
              variant="outlined"
              id="Duration"
            />
          </FormControl>
          <FormControl fullWidth variant="outlined" className="csp-mt-10">
            <div className="form-title">
              {t('simulate.concurrentTitle')}:<span>({t('simulate.concurrentTips')})</span>
            </div>
            <TextField
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                setConcurrent(event.target.value);
              }}
              type="number"
              InputProps={{ inputProps: { min: 1, max: 40 } }}
              value={concurrent}
              size="small"
              variant="outlined"
              id="Concurrent"
            />
          </FormControl>
          <FormControl fullWidth variant="outlined" className="csp-mt-10">
            <div className="form-title">
              {t('simulate.intervalTitle')}:<span>({t('simulate.intervalTips')})</span>
            </div>
            <TextField
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                setDataInterval(event.target.value);
              }}
              type="number"
              InputProps={{ inputProps: { min: 1, max: 60 } }}
              value={dataInterval}
              size="small"
              variant="outlined"
              id="Interval"
            />
          </FormControl>
        </DialogContent>
        <DialogActions className="padding20">
          <Button variant="outlined" onClick={handleClose} color="primary">
            {t('btn.cancel')}
          </Button>
          {loadingSimulate ? (
            <Button variant="contained" disabled={true}>
              <Loader type="ThreeDots" color="#888" height={10} />
            </Button>
          ) : (
            <Button variant="contained" onClick={simulateData} color="primary" autoFocus>
              {t('btn.simulate')}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default Dashboard;
