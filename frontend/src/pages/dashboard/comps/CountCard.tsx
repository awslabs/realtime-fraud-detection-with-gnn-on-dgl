import React from 'react';

interface CardProps {
  classIndex: string;
  title: string;
  value: string | number;
}

const CountCard: React.FC<CardProps> = (props: CardProps) => {
  const { classIndex, title, value } = props;
  return (
    <div className={`fds-count-card csp-card-bg-${classIndex}`}>
      <div className="title">{title}</div>
      <div className="number">{value}</div>
      <div className="view"></div>
    </div>
  );
};

export default CountCard;
