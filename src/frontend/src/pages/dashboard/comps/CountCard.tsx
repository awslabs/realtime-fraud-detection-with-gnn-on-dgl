import React from 'react';

interface CardProps {
  title: string;
  bgColor: string;
  value: string | number;
}

const CountCard: React.FC<CardProps> = (props: CardProps) => {
  const { bgColor, title, value } = props;
  return (
    <div className="fds-count-card" style={{ backgroundColor: `${bgColor}` }}>
      <div className="title">{title}</div>
      <div className="number">{value}</div>
      <div className="view"></div>
    </div>
  );
};

export default CountCard;
