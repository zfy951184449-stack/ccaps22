import React, { useCallback, useEffect, useId, useRef } from 'react';
import './Checkbox.css';

export interface WxbCheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  children?: React.ReactNode;
  className?: string;
  id?: string;
}

export const WxbCheckbox: React.FC<WxbCheckboxProps> = ({
  checked: controlledChecked, defaultChecked = false, onChange,
  disabled = false, indeterminate = false, children, className = '', id,
}) => {
  const autoId = useId();
  const cbId = id || autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [internal, setInternal] = React.useState(defaultChecked);
  const isControlled = controlledChecked !== undefined;
  const isChecked = isControlled ? controlledChecked : internal;

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const next = event.target.checked;
    if (!isControlled) setInternal(next);
    onChange?.(next);
  }, [disabled, isControlled, onChange]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLLabelElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <label className={`wxb-checkbox ${isChecked ? 'is-checked' : ''} ${indeterminate ? 'is-indeterminate' : ''} ${disabled ? 'is-disabled' : ''} ${className}`} htmlFor={cbId} onClick={handleClick}>
      <input
        ref={inputRef}
        id={cbId}
        className="wxb-checkbox-input"
        type="checkbox"
        checked={isChecked}
        disabled={disabled}
        aria-checked={indeterminate ? 'mixed' : isChecked}
        onChange={handleChange}
      />
      <span className="wxb-checkbox-box" aria-hidden="true">
        {isChecked && !indeterminate && <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6l2.5 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        {indeterminate && <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 6h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
      </span>
      {children && <span className="wxb-checkbox-label">{children}</span>}
    </label>
  );
};
