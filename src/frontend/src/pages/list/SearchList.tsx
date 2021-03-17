import Breadcrumbs from '@material-ui/core/Breadcrumbs';
import Link from '@material-ui/core/Link';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import ViewHeadlineIcon from '@material-ui/icons/ViewHeadline';

import React from 'react';
import List from './List';

const SearchList: React.FC = () => {
  return (
    <div>
      <Breadcrumbs aria-label="breadcrumb">
        <Link color="inherit" href="/">
          Home
        </Link>
        <Typography color="textPrimary">Fraud Transaction List</Typography>
      </Breadcrumbs>
      <div className="item-title-big" style={{ marginTop: 10 }}>
        <ViewHeadlineIcon className="icon" />
        Fraud Transaction List
        <div
          style={{
            position: 'absolute',
            right: 10,
            marginTop: -24,
            // marginBottom: 5,
            // textAlign: "right",
          }}
        >
          <TextField
            id="datetime-local"
            type="datetime-local"
            defaultValue="2021-01-24T10:30"
            style={{ width: 250 }}
            InputLabelProps={{
              shrink: true,
            }}
          />
          <span style={{ display: 'inline-block', padding: '5px 4px 0' }}>to</span>
          <TextField
            id="datetime-local"
            type="datetime-local"
            defaultValue="2021-02-24T10:30"
            style={{ width: 250 }}
            InputLabelProps={{
              shrink: true,
            }}
          />
        </div>
      </div>
      <div>
        <List />
      </div>
    </div>
  );
};

export default SearchList;
