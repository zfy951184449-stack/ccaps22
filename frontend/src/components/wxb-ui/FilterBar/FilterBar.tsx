import React from 'react';
import { WxbButton } from '../Button/Button';
import type { WxbButtonProps } from '../Button/Button';
import { WxbSearchInput } from '../SearchInput/SearchInput';
import type { WxbSearchInputProps } from '../SearchInput/SearchInput';
import { WxbPageToolbar } from '../PageLayout/PageLayout';
import type { WxbPageToolbarProps } from '../PageLayout/PageLayout';
import './FilterBar.css';

type StyleWithVars = React.CSSProperties & Record<`--${string}`, string | number | undefined>;

export interface WxbFilterSearchConfig
  extends Pick<WxbSearchInputProps, 'value' | 'defaultValue' | 'placeholder' | 'allowClear' | 'onChange' | 'onSearch'> {
  width?: number | string;
  className?: string;
  inputProps?: Omit<
    WxbSearchInputProps,
    'value' | 'defaultValue' | 'placeholder' | 'allowClear' | 'onChange' | 'onSearch' | 'className'
  >;
}

export interface WxbFilterBarProps extends Omit<WxbPageToolbarProps, 'filters' | 'summary' | 'actions'> {
  search?: React.ReactNode | WxbFilterSearchConfig;
  filters?: React.ReactNode;
  sort?: React.ReactNode;
  view?: React.ReactNode;
  selection?: React.ReactNode;
  resultCount?: number;
  resultLabel?: string;
  summary?: React.ReactNode;
  actions?: React.ReactNode;
}

const isSearchConfig = (search: WxbFilterBarProps['search']): search is WxbFilterSearchConfig =>
  !!search && typeof search === 'object' && !Array.isArray(search) && !React.isValidElement(search);

const renderSearch = (search: WxbFilterBarProps['search']) => {
  if (!search) return null;
  if (!isSearchConfig(search)) return <div className="wxb-filter-bar-search">{search}</div>;

  const { width = 240, className = '', inputProps, ...searchProps } = search;
  const style: StyleWithVars = {
    '--wxb-filter-search-width': typeof width === 'number' ? `${width}px` : width,
  };

  return (
    <div className="wxb-filter-bar-search" style={style}>
      <WxbSearchInput className={className} {...searchProps} {...inputProps} />
    </div>
  );
};

export const WxbFilterBar: React.FC<WxbFilterBarProps> = ({
  search,
  filters,
  sort,
  view,
  selection,
  resultCount,
  resultLabel = '项',
  summary,
  actions,
  className = '',
  ...toolbarProps
}) => {
  const resultSummary = typeof resultCount === 'number'
    ? <span className="wxb-filter-result-count">共 {resultCount} {resultLabel}</span>
    : null;

  const composedSummary = (selection || resultSummary || summary) ? (
    <>
      {selection}
      {resultSummary}
      {summary}
    </>
  ) : undefined;

  return (
    <WxbPageToolbar
      className={`wxb-filter-bar ${className}`}
      filters={(
        <>
          {renderSearch(search)}
          {filters && <div className="wxb-filter-bar-group">{filters}</div>}
          {sort && <div className="wxb-filter-bar-sort">{sort}</div>}
          {view && <div className="wxb-filter-bar-view">{view}</div>}
        </>
      )}
      summary={composedSummary}
      actions={actions}
      {...toolbarProps}
    />
  );
};

export interface WxbToolbarButtonAction {
  key: string;
  label: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  variant?: WxbButtonProps['variant'];
  size?: WxbButtonProps['size'];
  disabled?: boolean;
  loading?: boolean;
  buttonProps?: Omit<WxbButtonProps, 'children' | 'onClick' | 'variant' | 'size' | 'disabled'>;
}

export interface WxbToolbarCustomAction {
  key: string;
  render: React.ReactNode;
}

export type WxbToolbarActionItem = WxbToolbarButtonAction | WxbToolbarCustomAction;

export interface WxbToolbarActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  items: WxbToolbarActionItem[];
  size?: WxbButtonProps['size'];
}

const isCustomAction = (item: WxbToolbarActionItem): item is WxbToolbarCustomAction => 'render' in item;

export const WxbToolbarActions: React.FC<WxbToolbarActionsProps> = ({
  items,
  size = 'sm',
  className = '',
  ...props
}) => (
  <div className={`wxb-toolbar-actions ${className}`} {...props}>
    {items.map((item) => {
      if (isCustomAction(item)) {
        return <React.Fragment key={item.key}>{item.render}</React.Fragment>;
      }

      const {
        key,
        label,
        onClick,
        variant = 'ghost',
        size: itemSize,
        disabled,
        loading,
        buttonProps,
      } = item;

      return (
        <WxbButton
          key={key}
          variant={variant}
          size={itemSize ?? size}
          onClick={onClick}
          disabled={disabled || loading}
          aria-busy={loading || undefined}
          {...buttonProps}
        >
          {loading ? '处理中...' : label}
        </WxbButton>
      );
    })}
  </div>
);

export interface WxbSelectionSummaryProps extends React.HTMLAttributes<HTMLDivElement> {
  selectedCount: number;
  label?: React.ReactNode;
  onClear?: () => void;
  clearLabel?: string;
  actions?: React.ReactNode;
  showWhenEmpty?: boolean;
}

export const WxbSelectionSummary: React.FC<WxbSelectionSummaryProps> = ({
  selectedCount,
  label,
  onClear,
  clearLabel = '清除',
  actions,
  showWhenEmpty = false,
  className = '',
  ...props
}) => {
  if (selectedCount <= 0 && !showWhenEmpty) return null;

  const selectedText = label ?? `${selectedCount} 项`;

  return (
    <div className={`wxb-selection-summary ${selectedCount > 0 ? 'is-active' : 'is-empty'} ${className}`} {...props}>
      <span className="wxb-selection-summary-label">已选</span>
      <span className="wxb-selection-summary-value">{selectedText}</span>
      {actions && <span className="wxb-selection-summary-actions">{actions}</span>}
      {onClear && selectedCount > 0 && (
        <button type="button" className="wxb-selection-summary-clear" onClick={onClear}>
          {clearLabel}
        </button>
      )}
    </div>
  );
};
