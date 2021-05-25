import React from 'react';
import Chart from 'react-apexcharts';
import { useTranslation } from 'react-i18next';

interface DataProps {
  // height: number;
  series: number[];
  totalData: number[];
  categories: string[];
}

const RealtimeChart: React.FC<DataProps> = (props: DataProps) => {
  const { t } = useTranslation();
  const { series, categories } = props;

  const chartData = {
    series: [
      {
        // color: '#f00',
        name: t('fraudChart'),
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
        text: t('chartTitle'),
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
    <div id="chart" className="csp-pl-10 csp-chart-height">
      <Chart options={chartData.options} series={chartData.series} type="line" height="100%" />
    </div>
  );
};

export default RealtimeChart;
