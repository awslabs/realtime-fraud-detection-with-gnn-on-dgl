import NotificationsIcon from '@material-ui/icons/Notifications';
import Amplify from 'aws-amplify';
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import { HashRouter, Route, Switch } from 'react-router-dom';

import logo from './assets/images/logo.svg';

import DataLoading from './common/Loading';

import Dashboard from './pages/dashboard/Dashboard';
import NotFound from './pages/error/NotFound';
import SearchList from './pages/list/SearchList';

import { SYS_GATEWAY_API_URL } from './assets/js/const';

// Amplify.configure(awsconfig);
// loading component for suspense fallback
const Loader = () => (
  <div className="App">
    <div className="app-loading">
      <DataLoading />
      Real-time Fraud Detection Demo is loading...
    </div>
  </div>
);

const App: React.FC = () => {
  const [appLoading, setAppLoading] = useState(true);

  useEffect(() => {
    const timeStamp = new Date().getTime();
    axios
      .get('/aws-exports.json?timeStamp=' + timeStamp)
      .then((res) => {
        const ConfigObj = res.data;
        // Set API_GATEWAY_URL to localstorage
        localStorage.setItem(SYS_GATEWAY_API_URL, ConfigObj.api_path);
        // Amplify Configure
        Amplify.configure(res.data);
        setAppLoading(false);
        console.info(res);
      })
      .catch((err) => {
        setAppLoading(false);
        console.error(err);
      });
    return () => {
      console.info('clean');
    };
  }, []);

  if (appLoading) {
    return <Loader />;
  }

  return (
    <div className="App">
      <div className="container">
        <div className="fs-header">
          <div className="logo">
            <img className="img" width="30" alt="solutions" src={logo} />
            Real-time Fraud Detection with Graph Neural Network on DGL(Demo)
          </div>
          <div className="user text-right">
            <div style={{ fontSize: '14px', marginTop: 7 }}>
              <NotificationsIcon />
            </div>
            {/* <div>Admin User</div> */}
          </div>
        </div>
        <div className="fs-body">
          <HashRouter>
            <Switch>
              <Route exact path="/" component={Dashboard} />
              <Route exact path="/list" component={SearchList} />
              <Route component={NotFound} />
            </Switch>
          </HashRouter>
        </div>
        {/* <div className="fs-footer">
          © 2008 - 2021, Amazon Web Services, Inc. or its affiliates. All rights reserved.
        </div> */}
      </div>
    </div>
  );
};

const DetectionApp: React.FC = () => {
  return <App />;
};

export default DetectionApp;
