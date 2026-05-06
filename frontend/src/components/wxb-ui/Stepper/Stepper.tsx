import React from 'react';
import './Stepper.css';

export interface WxbStep {
  label: string;
  desc?: string;
  status: 'done' | 'curr' | 'todo';
}

export interface WxbStepperProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: WxbStep[];
}

export const WxbStepper: React.FC<WxbStepperProps> = ({
  steps,
  className = '',
  ...props
}) => {
  return (
    <div className={`wxb-stepper ${className}`} {...props}>
      {steps.map((step, idx) => (
        <div key={idx} className={`wxb-stepper-stage is-${step.status}`}>
          <span className="wxb-stepper-ic">
            {step.status === 'done' ? '✓' : step.status === 'curr' ? '●' : ''}
          </span>
          <span className="wxb-stepper-lbl">{step.label}</span>
          {step.desc && <span className="wxb-stepper-desc">{step.desc}</span>}
        </div>
      ))}
    </div>
  );
};
