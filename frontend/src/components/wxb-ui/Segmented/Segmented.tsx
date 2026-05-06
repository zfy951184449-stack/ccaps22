import React from 'react';
import './Segmented.css';

export interface WxbSegmentedOption { label: React.ReactNode; value: string; disabled?: boolean; icon?: React.ReactNode; }
export interface WxbSegmentedProps { options: WxbSegmentedOption[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; className?: string; size?: 'sm' | 'md'; }

export const WxbSegmented: React.FC<WxbSegmentedProps> = ({
  options, value: cv, defaultValue, onChange, className = '', size = 'md',
}) => {
  const [internal, setInternal] = React.useState(defaultValue || options[0]?.value || '');
  const current = cv !== undefined ? cv : internal;
  const ref = React.useRef<HTMLDivElement>(null);
  const [pill, setPill] = React.useState({ left: 0, width: 0 });

  React.useEffect(() => {
    if (ref.current) {
      const el = ref.current.querySelector('.is-active') as HTMLElement;
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [current]);

  const select = (v: string, d?: boolean) => {
    if (d) return;
    if (cv === undefined) setInternal(v);
    onChange?.(v);
  };

  return (
    <div className={`wxb-segmented wxb-segmented-${size} ${className}`} ref={ref}>
      <span className="wxb-segmented-pill" style={{ left: pill.left, width: pill.width }} />
      {options.map(o => (
        <button key={o.value} type="button"
          className={`wxb-segmented-item ${current === o.value ? 'is-active' : ''} ${o.disabled ? 'is-disabled' : ''}`}
          onClick={() => select(o.value, o.disabled)}>
          {o.icon && <span className="wxb-segmented-icon">{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
};
