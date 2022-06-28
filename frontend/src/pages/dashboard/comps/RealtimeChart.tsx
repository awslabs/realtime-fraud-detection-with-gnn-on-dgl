import React from 'react';
import Chart from 'react-apexcharts';
import { useTranslation } from 'react-i18next';

interface DataProps {
  series: number[];
  totalData: number[];
  categories: string[];
}

const RealtimeChart: React.FC<DataProps> = (props: DataProps) => {
  const { t } = useTranslation();
  const { series, categories } = props;

  const options = {
    id: 'basic-bar',
    type: 'line',
    chart: {
      title: {
        text: t('chartTitle'),
        align: 'left',
      },
      toolbar: {
        tools: {
          download: true,
          selection: false,
          zoom: false,
          zoomin: false,
          zoomout: false,
          pan: false,
        },
      },
      dataLabels: {
        enabled: false,
      },
      stroke: {
        curve: 'straight',
      },
    },
    animations: {
      enabled: true,
      easing: 'linear',
      dynamicAnimation: {
        speed: 1000,
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
    grid: {
      padding: {
        left: 30,
      },
      row: {
        colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
        opacity: 0.5,
      },
    },
  };
  const seriesData = [
    {
      name: t('fraudChart'),
      data: series,
    },
  ];

  return (
    <div id="chart" className="csp-pl-10 csp-chart-height">
      <Chart options={options} series={seriesData} type="line" height="100%" />
    </div>
  );
};

export default RealtimeChart;
