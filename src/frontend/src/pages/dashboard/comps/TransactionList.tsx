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

import React, { useEffect, useState } from 'react';

// import { momentFormatData } from '../../../assets/js/const';
import moment from 'moment';
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
      // backgroundColor: '#fefefe',
      // color: '#444',
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
  const { transList } = props;
  const classes = useStyles();
  const [tableHeight, settableHeight] = useState(100);

  const size = useWindowSize();

  useEffect(() => {
    console.info('size:', size);
    settableHeight(size.height - size.height * 0.5);
  }, [size]);

  return (
    <div>
      <TableContainer style={{ maxHeight: tableHeight }} component={Paper}>
        <Table className={classes.table} stickyHeader aria-label="sticky table">
          <TableHead>
            <TableRow>
              <StyledTableCell>
                <b>Transaction ID</b>
              </StyledTableCell>
              <StyledTableCell align="right">
                <b>Product CD</b>
              </StyledTableCell>
              <StyledTableCell align="right">
                <b>Card Type</b>
              </StyledTableCell>
              <StyledTableCell align="right">
                <b>Card Number</b>
              </StyledTableCell>
              <StyledTableCell align="right">
                <b>Amount</b>
              </StyledTableCell>
              <StyledTableCell align="right">
                <b>Transaction Time</b>
              </StyledTableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transList.map((row, index) => (
              // <StyledTableRow key={index} className={row.isNew ? 'active' : ''}>
              <StyledTableRow key={index}>
                <TableCell component="th" scope="row">
                  <HtmlTooltip
                    placement="right"
                    title={
                      <React.Fragment>
                        <Typography color="inherit" style={{ fontSize: 18 }}>
                          <b>{row.id}</b>
                        </Typography>
                        <div>
                          <b>{'Transtion Time:'}</b> <span>{'2021-02-28 12:12:12'}</span>
                        </div>
                        <div>
                          <b>{'Amount:'}</b> <span>${row.amount}</span>
                        </div>
                        <div>
                          <b>{'Product CD:'}</b> <span>{row.productCD}</span>
                        </div>
                        <div>
                          <b>{'Card Info:'}</b>{' '}
                          <span>{`${row.card4} ${row.card1} ${row.card2} ${row.card3} ${row.card5}`}</span>
                        </div>
                        <div>
                          <b>{'Address:'}</b> <span>{`${row.addr1} ${row.addr2}`}</span>
                        </div>
                      </React.Fragment>
                    }
                  >
                    <span style={{ position: 'relative' }} className="link" color="primary">
                      <b>{row.id}</b> {row.isNew && <span className="new new-active">NEW</span>}
                    </span>
                  </HtmlTooltip>
                  {/* {row.id} */}
                </TableCell>
                <TableCell align="right">{row.productCD}</TableCell>
                <TableCell align="right">{row.card4}</TableCell>
                <TableCell align="right">{`${row.card1} ${row.card2} ${row.card3} ${row.card5}`}</TableCell>
                <TableCell align="right">${row.amount}</TableCell>
                <TableCell align="right">{moment(new Date(row.timestamp * 1000)).fromNow()}</TableCell>
              </StyledTableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {/* <div style={{ fontSize: 12, color: '#777', paddingTop: 2 }}>Total: {transList.length} transcations</div> */}
    </div>
  );
};

export default TransactionList;
