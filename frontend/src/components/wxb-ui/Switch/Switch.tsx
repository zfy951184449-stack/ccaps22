import React, { useCallback, useId } from 'react';
import './Switch.css';

export interface WxbSwitchProps {
  /** 当前选中状态 */
  checked?: boolean;
  /** 默认选中状态（非受控模式） */
  defaultChecked?: boolean;
  /** 状态切换回调 */
  onChange?: (checked: boolean, event: React.MouseEvent<HTMLButtonElement>) => void;
  /** 禁用状态 */
  disabled?: boolean;
  /** 选中时显示的文字 */
  checkedChildren?: React.ReactNode;
  /** 未选中时显示的文字 */
  unCheckedChildren?: React.ReactNode;
  /** 尺寸 */
  size?: 'sm' | 'md';
  /** 自定义类名 */
  className?: string;
  /** 用于 Antd Form 绑定的 id */
  id?: string;
}

export const WxbSwitch: React.FC<WxbSwitchProps> = ({
  checked: controlledChecked,
  defaultChecked = false,
  onChange,
  disabled = false,
  checkedChildren,
  unCheckedChildren,
  size = 'md',
  className = '',
  id,
}) => {
  const autoId = useId();
  const switchId = id || autoId;
  
  // 受控 / 非受控
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
  const isControlled = controlledChecked !== undefined;
  const isChecked = isControlled ? controlledChecked : internalChecked;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const next = !isChecked;
      if (!isControlled) setInternalChecked(next);
      onChange?.(next, e);
    },
    [disabled, isChecked, isControlled, onChange]
  );

  const hasLabel = checkedChildren || unCheckedChildren;

  return (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={isChecked}
      disabled={disabled}
      className={[
        'wxb-switch',
        `wxb-switch-${size}`,
        isChecked ? 'wxb-switch-checked' : '',
        disabled ? 'wxb-switch-disabled' : '',
        hasLabel ? 'wxb-switch-labeled' : '',
        className,
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
    >
      {hasLabel && (
        <span className="wxb-switch-label">
          {isChecked ? checkedChildren : unCheckedChildren}
        </span>
      )}
      <span className="wxb-switch-handle" />
    </button>
  );
};
