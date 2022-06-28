import Paper from '@material-ui/core/Paper';
import { withStyles, Theme, createStyles, makeStyles } from '@material-ui/core/styles';

import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';


import moment from 'moment';
import React, { useEffect, useState } from 'react';
import 'moment/locale/zh-cn';
import 'moment/locale/en-gb';
import { useTranslation } from 'react-i18next';
import { momentFormatData, TIME_TYPE } from '../../../assets/js/const';

import LanguageContext from '../../../common/LanguageContext';
import useWindowSize from '../../../hooks/useWindowSize';

const HtmlTooltip = withStyles((theme: Theme) => ({
  tooltip: {
    padding: '12px',
    backgroundColor: '#f5f5f9',
    color: 'rgba(0, 0, 0, 0.87)',
    maxWidth: 320,
    fontSize: theme.typography.pxToRem(14),
    border: '1px solid #dadde9',
  },
}))(Tooltip);

const useStyles = makeStyles({
  table: {
    minWidth: 650,
  },
});

const StyledTableRow = withStyles((theme: Theme) =>
  createStyles({
    root: {
      '&:nth-of-type(odd)': {
        backgroundColor: theme.palette.action.hover,
      },
    },
  }),
)(TableRow);

const StyledTableCell = withStyles((theme: Theme) =>
  createStyles({
    head: {
      backgroundColor: theme.palette.common.black,
      color: theme.palette.common.white,
    },
    body: {
      fontSize: 14,
    },
  }),
)(TableCell);

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transList: any[];
}

const TransactionList: React.FC<Props> = (props: Props) => {
  const language: any = React.useContext(LanguageContext);
  const { t } = useTranslation();
  const { transList } = props;
  const classes = useStyles();
  const [curMomentLang, setCurMomentLang] = useState('');

  const size = useWindowSize();

  useEffect(() => {
    console.info('size:', size);
  }, [size]);

  useEffect(() => {
    if (language === 'zh') {
      setCurMomentLang('zh-cn');
    }
    if (language === 'en') {
      setCurMomentLang('en-gb');
    }
  }, [language]);

  return (
    <div>
      <TableContainer className="csp-table-height" component={Paper}>
        <Table className={classes.table} stickyHeader aria-label="sticky table">
          <TableHead>
            <TableRow>
              <StyledTableCell>
                <b>{t('table.transactionID')}</b>
              </StyledTableCell>
              <StyledTableCell align="right">
                <b>{t('table.productCD')}</b>
              </StyledTableCell>
              <StyledTableCell align="right">
                <b>{t('table.cardType')}</b>
              </StyledTableCell>
              <StyledTableCell align="right">
                <b>{t('table.cardNumber')}</b>
              </StyledTableCell>
              <StyledTableCell align="right">
                <b>{t('table.amount')}</b>
              </StyledTableCell>
              <StyledTableCell align="right">
                <b>{t('table.transactionTime')}</b>
              </StyledTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transList.map((row, index) => (
              <StyledTableRow key={index}>
                <TableCell component="th" scope="row">
                  <HtmlTooltip
                    placement="right"
                    title={
                      <React.Fragment>
                        <Typography color="inherit" className="csp-fontsize-18">
                          <b>{t('table.transactionID')}</b>
                        </Typography>
                        <div>
                          <b>{t('table.transactionTime')}:</b>{' '}
                          <span>{momentFormatData(new Date(row.timestamp * 1000), TIME_TYPE.WITH_YEAR)}</span>
                        </div>
                        <div>
                          <b>{t('table.amount')}:</b> <span>${row.amount}</span>
                        </div>
                        <div>
                          <b>{t('table.productCD')}:</b> <span>{row.productCD}</span>
                        </div>
                        <div>
                          <b>{t('table.cardInfo')}:</b>{' '}
                          <span>{`${row?.card4 || ''} ${row?.card1 || ''} ${row?.card2 || ''} ${row?.card3 || ''} ${
                            row?.card5 || ''
                          }`}</span>
                        </div>
                        <div>
                          <b>{t('table.address')}:</b> <span>{`${row?.addr1 || ''} ${row?.addr2 || ''}`}</span>
                        </div>
                      </React.Fragment>
                    }
                  >
                    <span className="csp-pr link" color="primary">
                      <b>{row.id}</b> {row.isNew && <span className="new new-active">NEW</span>}
                    </span>
                  </HtmlTooltip>
                </TableCell>
                <TableCell align="right">{row.productCD}</TableCell>
                <TableCell align="right">{row.card4}</TableCell>
                <TableCell align="right">{`${row.card1} ${row.card2} ${row.card3} ${row.card5}`}</TableCell>
                <TableCell align="right">${row.amount}</TableCell>
                <TableCell align="right">
                  {moment(new Date(row.timestamp * 1000))
                    .locale(curMomentLang)
                    .fromNow()}
                </TableCell>
              </StyledTableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

export default TransactionList;
