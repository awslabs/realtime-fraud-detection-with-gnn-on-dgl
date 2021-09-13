import Paper from '@material-ui/core/Paper';
import { makeStyles } from '@material-ui/core/styles';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableContainer from '@material-ui/core/TableContainer';
import TableHead from '@material-ui/core/TableHead';
import TablePagination from '@material-ui/core/TablePagination';
import TableRow from '@material-ui/core/TableRow';

import React from 'react';

const useStyles = makeStyles({
  table: {
    minWidth: 650,
  },
});

function createData(
  id: string,
  name: string,
  cardType: string,
  cardNo: string,
  amount: string,
  time: string,
  isNew?: boolean,
) {
  return { id, name, cardType, cardNo, amount, time, isNew };
}

const rows = [
  createData('abcd-xx2-22', 'Jack Ma', 'Master', '2002 112 xxxx 112', '$123.00', 'seconds ago'),
  createData('221-xs2-12', 'Peter Bell', 'AE', '4001 333 xxxx 334', '$432.00', '2 minutes ago'),
  createData('44dx-213-23', 'Wukong Sun', 'VISA', '5002 333 xxxx 114', '$78.00', '5 minutes ago'),
  createData('abcd-xx2-22', 'Jack Ma', 'Master', '2002 112 xxxx 112', '$123.00', 'seconds ago'),
  createData('221-xs2-12', 'Peter Bell', 'AE', '4001 333 xxxx 334', '$432.00', '2 minutes ago'),
  createData('44dx-213-23', 'Wukong Sun', 'VISA', '5002 333 xxxx 114', '$78.00', '5 minutes ago'),
  createData('abcd-xx2-22', 'Jack Ma', 'Master', '2002 112 xxxx 112', '$123.00', 'seconds ago'),
  createData('221-xs2-12', 'Peter Bell', 'AE', '4001 333 xxxx 334', '$432.00', '2 minutes ago'),
  createData('44dx-213-23', 'Wukong Sun', 'VISA', '5002 333 xxxx 114', '$78.00', '5 minutes ago'),
];

const List: React.FC = () => {
  const classes = useStyles();

  const handleChangePage = () => {
    console.info('handleChangePage');
  };

  const handleChangeRowsPerPage = () => {
    console.info('handleChangeRowsPerPage');
  };

  return (
    <TableContainer component={Paper}>
      <Table className={classes.table} aria-label="simple table">
        <TableHead>
          <TableRow>
            <TableCell>
              <b>Transaction ID</b>
            </TableCell>
            <TableCell align="right">
              <b>User Name</b>
            </TableCell>
            <TableCell align="right">
              <b>Card Type</b>
            </TableCell>
            <TableCell align="right">
              <b>Card Number</b>
            </TableCell>
            <TableCell align="right">
              <b>Amount</b>
            </TableCell>
            <TableCell align="right">
              <b>Transaction Time</b>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              <TableCell component="th" scope="row">
                <span className="link" color="primary">
                  <b>{row.id}</b>
                </span>
              </TableCell>
              <TableCell align="right">{row.name}</TableCell>
              <TableCell align="right">{row.cardType}</TableCell>
              <TableCell align="right">{row.cardNo}</TableCell>
              <TableCell align="right">{row.amount}</TableCell>
              <TableCell align="right">{row.time}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination
        rowsPerPageOptions={[10, 25, 100]}
        component="div"
        count={100}
        rowsPerPage={10}
        page={1}
        onPageChange={handleChangePage}
        onChangeRowsPerPage={handleChangeRowsPerPage}
      />
    </TableContainer>
  );
};

export default List;
