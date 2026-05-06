import React, { useId } from 'react';
import './Radio.css';

export interface WxbRadioOption { label: React.ReactNode; value: string; disabled?: boolean; }

export interface WxbRadioGroupProps {
  options: WxbRadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  direction?: 'horizontal' | 'vertical';
  disabled?: boolean;
  className?: string;
  name?: string;
}

export const WxbRadioGroup: React.FC<WxbRadioGroupProps> = ({
  options, value: controlledValue, defaultValue = '', onChange,
  direction = 'horizontal', disabled = false, className = '', name,
}) => {
  const autoName = useId();
  const radioName = name || autoName;
  const [internal, setInternal] = React.useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : internal;

  const handleClick = (val: string, optDisabled?: boolean) => {
    if (disabled || optDisabled) return;
    if (!isControlled) setInternal(val);
    onChange?.(val);
  };

  return (
    <div className={`wxb-radio-group wxb-radio-${direction} ${className}`}>
      {options.map((opt) => (
        <label key={opt.value} className={`wxb-radio ${currentValue === opt.value ? 'is-checked' : ''} ${disabled || opt.disabled ? 'is-disabled' : ''}`}>
          <span className="wxb-radio-dot" onClick={() => handleClick(opt.value, opt.disabled)} />
          <span className="wxb-radio-label">{opt.label}</span>
        </label>
      ))}
    </div>
  );
};
