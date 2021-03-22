import React from 'react';
import Chart from 'react-apexcharts';

interface DataProps {
  height: number;
  series: number[];
  totalData: number[];
  categories: string[];
}

const RealtimeChart: React.FC<DataProps> = (props: DataProps) => {
  const { height, series, categories } = props;

  const chartData = {
    series: [
      {
        // color: '#f00',
        name: 'Fraud',
        data: series,
      },
      // {
      //   name: 'total',
      //   data: totalData,
      // },
    ],
    options: {
      chart: {
        height: height,
        type: 'line',
        animations: {
          enabled: true,
          easing: 'linear',
          dynamicAnimation: {
            speed: 1000,
          },
        },
        zoom: {
          enabled: false,
        },
      },
      dataLabels: {
        enabled: false,
      },
      stroke: {
        curve: 'straight',
      },
      title: {
        text: 'Fraud Trends by Time',
        align: 'left',
      },
      grid: {
        padding: {
          left: 30,
        },
        row: {
          colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
          opacity: 0.5,
        },
      },
      yaxis: {
        labels: {
          formatter: function (val: number) {
            return val.toFixed(0);
          },
        },
      },
      xaxis: {
        categories: categories,
      },
    },
  };

  return (
    <div id="chart" style={{ paddingLeft: 10, height: height - 20 }}>
      <Chart options={chartData.options} series={chartData.series} type="line" height="100%" />
    </div>
  );
};

export default RealtimeChart;
