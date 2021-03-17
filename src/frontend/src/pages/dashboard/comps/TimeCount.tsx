import React from 'react';
// import { makeStyles, createStyles, Theme } from "@material-ui/core/styles";
import { PieChart } from 'react-minimal-pie-chart';
import Paper from '@material-ui/core/Paper';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timeDataList: any[];
}

const TimeCount: React.FC<Props> = (props: Props) => {
  const { timeDataList } = props;
  const gotolist = () => {
    window.location.href = '/list';
  };

  return (
    <div className="fs-time-count">
      {timeDataList.map((element, index) => {
        return (
          <div key={index} className="paper-wrap">
            <Paper>
              <div className="date-item">
                <div className="img">
                  <PieChart
                    radius={PieChart.defaultProps.radius}
                    data={[
                      { title: 'One', value: element.tCount, color: '#68a85f' },
                      { title: 'Two', value: element.fCount, color: '#C13C37' },
                    ]}
                  />
                </div>
                <div className="info">
                  <div className="text-right count">
                    <span>{element.fCount}</span>/ {element.fCount + element.tCount}
                  </div>
                  <div className="text-right time">in {element.time}</div>
                  <div className="text-right">
                    <span
                      onClick={() => {
                        gotolist();
                      }}
                      className="more"
                    >
                      View More
                    </span>
                  </div>
                </div>
              </div>
            </Paper>
          </div>
        );
      })}
    </div>
  );
};

export default TimeCount;
