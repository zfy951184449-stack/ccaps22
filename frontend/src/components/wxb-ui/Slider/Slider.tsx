import React from 'react';
import './Slider.css';

export interface WxbSliderProps { min?: number; max?: number; step?: number; value?: number; defaultValue?: number; onChange?: (value: number) => void; disabled?: boolean; className?: string; showValue?: boolean; }

export const WxbSlider: React.FC<WxbSliderProps> = ({
  min = 0, max = 100, step = 1, value: cv, defaultValue = 0, onChange, disabled = false, className = '', showValue = true,
}) => {
  const [internal, setInternal] = React.useState(defaultValue);
  const val = cv !== undefined ? cv : internal;
  const pct = ((val - min) / (max - min)) * 100;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (cv === undefined) setInternal(v);
    onChange?.(v);
  };
  return (
    <div className={`wxb-slider ${disabled ? 'is-disabled' : ''} ${className}`}>
      <div className="wxb-slider-track-wrap">
        <div className="wxb-slider-track"><div className="wxb-slider-fill" style={{ width: `${pct}%` }} /></div>
        <input type="range" className="wxb-slider-input" min={min} max={max} step={step} value={val} onChange={handleChange} disabled={disabled} />
      </div>
      {showValue && <span className="wxb-slider-value">{val}</span>}
    </div>
  );
};
