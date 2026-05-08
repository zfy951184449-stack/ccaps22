import React from 'react';
import { Table as AntdTable } from 'antd';
import type { MenuProps, TableProps as AntdTableProps } from 'antd';
import { WxbButton } from '../Button/Button';
import type { WxbButtonProps } from '../Button/Button';
import { WxbDropdown } from '../Dropdown/Dropdown';
import { WxbEmpty } from '../Empty/Empty';
import { WxbPopconfirm } from '../Popconfirm/Popconfirm';
import { WxbSelectionSummary } from '../FilterBar/FilterBar';
import './DataTable.css';

export type WxbDataTableDensity = 'compact' | 'standard' | 'comfortable';

export interface WxbDataTableEmptyState {
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export interface WxbDataTableErrorState extends WxbDataTableEmptyState {
  title?: React.ReactNode;
}

export interface WxbDataTableProps<T = any> extends AntdTableProps<T> {
  density?: WxbDataTableDensity;
  emptyState?: WxbDataTableEmptyState;
  errorState?: WxbDataTableErrorState;
  containered?: boolean;
}

export interface WxbTableActionConfirm {
  title: React.ReactNode;
  description?: React.ReactNode;
  okText?: string;
  cancelText?: string;
}

export interface WxbTableActionItem {
  key: React.Key;
  label: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  confirm?: WxbTableActionConfirm;
}

export interface WxbTableActionCellProps extends React.HTMLAttributes<HTMLDivElement> {
  actions: WxbTableActionItem[];
  maxInline?: number;
  size?: WxbButtonProps['size'];
  moreLabel?: React.ReactNode;
}

export interface WxbBulkActionItem {
  key: React.Key;
  label: React.ReactNode;
  onClick?: () => void;
  variant?: WxbButtonProps['variant'];
  disabled?: boolean;
  confirm?: WxbTableActionConfirm;
}

export interface WxbBulkActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  selectedCount: number;
  actions: WxbBulkActionItem[];
  onClear?: () => void;
  summary?: React.ReactNode;
  clearLabel?: string;
  size?: WxbButtonProps['size'];
}

const joinClasses = (...classes: Array<string | false | undefined>) =>
  classes.filter(Boolean).join(' ');

const toActionKey = (key: React.Key) => String(key);

const WxbDataTableErrorStateView: React.FC<WxbDataTableErrorState> = ({
  title = '数据加载失败',
  description,
  action,
}) => (
  <div className="wxb-data-table-state wxb-data-table-error-state" role="status">
    <div className="wxb-data-table-error-title">{title}</div>
    {description && <div className="wxb-data-table-error-desc">{description}</div>}
    {action && <div className="wxb-data-table-error-action">{action}</div>}
  </div>
);

export function WxbDataTable<T extends object>({
  className = '',
  density = 'standard',
  emptyState,
  errorState,
  containered = true,
  locale,
  ...props
}: WxbDataTableProps<T>) {
  const emptyText =
    errorState ? (
      <WxbDataTableErrorStateView {...errorState} />
    ) : (
      locale?.emptyText ?? (
        <WxbEmpty
          className="wxb-data-table-empty-state"
          description={emptyState?.description}
          action={emptyState?.action}
        />
      )
    );

  return (
    <AntdTable<T>
      {...props}
      locale={{ ...locale, emptyText }}
      className={joinClasses(
        'wxb-data-table',
        `wxb-data-table-density-${density}`,
        containered ? 'wxb-data-table-containered' : 'wxb-data-table-plain',
        errorState && 'wxb-data-table-has-error',
        className,
      )}
    />
  );
}

export const WxbTableActionCell: React.FC<WxbTableActionCellProps> = ({
  actions,
  maxInline = 2,
  size = 'sm',
  moreLabel = '更多',
  className = '',
  onClick,
  ...props
}) => {
  const [pendingConfirmAction, setPendingConfirmAction] = React.useState<WxbTableActionItem | null>(null);
  const visibleActions = actions.slice(0, maxInline);
  const overflowActions = actions.slice(maxInline);

  const renderInlineAction = (action: WxbTableActionItem) => {
    const button = (
      <WxbButton
        type="button"
        size={size}
        variant={action.variant === 'danger' ? 'danger' : 'ghost'}
        disabled={action.disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (!action.confirm) action.onClick?.();
        }}
      >
        {action.label}
      </WxbButton>
    );

    if (!action.confirm) {
      return <React.Fragment key={toActionKey(action.key)}>{button}</React.Fragment>;
    }

    return (
      <WxbPopconfirm
        key={toActionKey(action.key)}
        title={action.confirm.title}
        description={action.confirm.description}
        okText={action.confirm.okText}
        cancelText={action.confirm.cancelText}
        disabled={action.disabled}
        onConfirm={() => action.onClick?.()}
      >
        {button}
      </WxbPopconfirm>
    );
  };

  const overflowMenu: MenuProps = {
    items: overflowActions.map((action) => ({
      key: toActionKey(action.key),
      label: <span className="wxb-table-action-menu-label">{action.label}</span>,
      danger: action.variant === 'danger',
      disabled: action.disabled,
    })),
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation();
      const action = overflowActions.find((item) => toActionKey(item.key) === key);
      if (!action || action.disabled) return;
      if (action.confirm) {
        setPendingConfirmAction(action);
        return;
      }
      action.onClick?.();
    },
  };

  const pendingConfirm = pendingConfirmAction?.confirm;

  return (
    <div
      {...props}
      className={joinClasses('wxb-table-action-cell', className)}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    >
      {visibleActions.map(renderInlineAction)}
      {overflowActions.length > 0 && (
        <>
          <WxbPopconfirm
            open={Boolean(pendingConfirmAction)}
            title={pendingConfirm?.title}
            description={pendingConfirm?.description}
            okText={pendingConfirm?.okText}
            cancelText={pendingConfirm?.cancelText}
            onConfirm={() => {
              pendingConfirmAction?.onClick?.();
              setPendingConfirmAction(null);
            }}
            onCancel={() => setPendingConfirmAction(null)}
            onOpenChange={(open) => {
              if (!open) setPendingConfirmAction(null);
            }}
          >
            <span className="wxb-table-action-confirm-anchor" aria-hidden="true" />
          </WxbPopconfirm>
          <WxbDropdown menu={overflowMenu} placement="bottomRight">
            <WxbButton
              type="button"
              size={size}
              variant="ghost"
              aria-label="更多表格操作"
              onClick={(event) => event.stopPropagation()}
            >
              {moreLabel}
            </WxbButton>
          </WxbDropdown>
        </>
      )}
    </div>
  );
};

export const WxbBulkActionBar: React.FC<WxbBulkActionBarProps> = ({
  selectedCount,
  actions,
  onClear,
  summary,
  clearLabel = '清除',
  size = 'sm',
  className = '',
  ...props
}) => {
  if (selectedCount <= 0) return null;

  const renderAction = (action: WxbBulkActionItem) => {
    const button = (
      <WxbButton
        type="button"
        size={size}
        variant={action.variant ?? 'secondary'}
        disabled={action.disabled}
        onClick={() => {
          if (!action.confirm) action.onClick?.();
        }}
      >
        {action.label}
      </WxbButton>
    );

    if (!action.confirm) {
      return <React.Fragment key={toActionKey(action.key)}>{button}</React.Fragment>;
    }

    return (
      <WxbPopconfirm
        key={toActionKey(action.key)}
        title={action.confirm.title}
        description={action.confirm.description}
        okText={action.confirm.okText}
        cancelText={action.confirm.cancelText}
        disabled={action.disabled}
        onConfirm={() => action.onClick?.()}
      >
        {button}
      </WxbPopconfirm>
    );
  };

  return (
    <div className={joinClasses('wxb-bulk-action-bar', className)} {...props}>
      {summary ?? (
        <WxbSelectionSummary
          selectedCount={selectedCount}
          label={`${selectedCount} 项`}
          onClear={onClear}
          clearLabel={clearLabel}
        />
      )}
      <div className="wxb-bulk-action-bar-actions">{actions.map(renderAction)}</div>
    </div>
  );
};
