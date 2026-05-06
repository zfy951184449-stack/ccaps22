import React from 'react';
import './SearchInput.css';

export interface WxbSearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onSearch?: (value: string) => void;
  onChange?: (value: string) => void;
  allowClear?: boolean;
  value?: string;
  defaultValue?: string;
}

export const WxbSearchInput: React.FC<WxbSearchInputProps> = ({
  onSearch, onChange, allowClear = true, value: controlledValue,
  defaultValue = '', className = '', placeholder = 'Search...', ...props
}) => {
  const [internal, setInternal] = React.useState(defaultValue);
  const val = controlledValue !== undefined ? controlledValue : internal;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (controlledValue === undefined) setInternal(v);
    onChange?.(v);
  };
  const handleClear = () => {
    if (controlledValue === undefined) setInternal('');
    onChange?.('');
    onSearch?.('');
  };
  return (
    <div className={`wxb-search-input ${className}`}>
      <svg className="wxb-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>
      </svg>
      <input
        className="wxb-search-field"
        type="text" value={val} onChange={handleChange} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') onSearch?.(val); }}
        {...props}
      />
      {allowClear && val && (
        <span className="wxb-search-clear" onClick={handleClear}>×</span>
      )}
    </div>
  );
};
