/**
 * WxbGanttChart v2 — Context Menu
 * WXB enterprise-style dropdown context menu for task operations
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GanttTask } from './types';
import { THEME, FONT_SANS } from './constants';

export interface ContextMenuItem {
  /** Unique action key */
  key: string;
  /** Display label */
  label: string;
  /** Icon (emoji or text) */
  icon?: string;
  /** Whether this item is disabled */
  disabled?: boolean;
  /** Danger action (red text) */
  danger?: boolean;
  /** Divider after this item */
  divider?: boolean;
}

export interface GanttContextMenuProps {
  /** Whether the menu is visible */
  visible: boolean;
  /** Screen position */
  x: number;
  y: number;
  /** The task that was right-clicked (null = background click) */
  task: GanttTask | null;
  /** Menu items */
  items: ContextMenuItem[];
  /** Callback when an item is clicked */
  onAction: (key: string, task: GanttTask | null) => void;
  /** Close handler */
  onClose: () => void;
}

const GanttContextMenu: React.FC<GanttContextMenuProps> = ({
  visible, x, y, task, items, onAction, onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  // Adjust position to avoid overflow
  useEffect(() => {
    if (!visible || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x, ny = y;
    if (x + rect.width > vw - 8) nx = vw - rect.width - 8;
    if (y + rect.height > vh - 8) ny = vh - rect.height - 8;
    if (nx < 8) nx = 8;
    if (ny < 8) ny = 8;
    setAdjustedPos({ x: nx, y: ny });
  }, [visible, x, y]);

  // Close on click outside or Escape
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Delay to avoid immediate close from the triggering right-click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [visible, onClose]);

  const handleItemClick = useCallback((key: string, disabled?: boolean) => {
    if (disabled) return;
    onAction(key, task);
    onClose();
  }, [onAction, task, onClose]);

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 10002,
        minWidth: 180,
        background: THEME.bg,
        border: `1px solid ${THEME.border}`,
        borderRadius: 6,
        boxShadow: '0 6px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
        padding: '4px 0',
        fontFamily: FONT_SANS,
        animation: 'wxb-ctx-fadein 0.12s ease-out',
      }}
    >
      {/* Header: task name */}
      {task && (
        <div
          style={{
            padding: '6px 12px 4px',
            fontSize: 11,
            fontWeight: 600,
            color: THEME.fg3,
            borderBottom: `1px solid ${THEME.divider}`,
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          {task.label}
        </div>
      )}

      {items.map((item) => (
        <React.Fragment key={item.key}>
          <div
            role="menuitem"
            tabIndex={item.disabled ? -1 : 0}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              color: item.disabled ? THEME.fg4 : item.danger ? THEME.danger : THEME.ink,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: item.disabled ? 0.5 : 1,
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) (e.currentTarget as HTMLDivElement).style.background = THEME.surface1;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
            onClick={() => handleItemClick(item.key, item.disabled)}
          >
            {item.icon && (
              <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>
                {item.icon}
              </span>
            )}
            <span style={{ flex: 1 }}>{item.label}</span>
          </div>
          {item.divider && (
            <div style={{ height: 1, background: THEME.divider, margin: '4px 0' }} />
          )}
        </React.Fragment>
      ))}

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes wxb-ctx-fadein {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

// Default menu items for task context
export const DEFAULT_TASK_MENU_ITEMS: ContextMenuItem[] = [
  { key: 'edit', label: '编辑任务', icon: '✏️' },
  { key: 'duplicate', label: '复制任务', icon: '📋' },
  { key: 'split', label: '拆分任务', icon: '✂️', divider: true },
  { key: 'move-earlier', label: '提前排程', icon: '⏪' },
  { key: 'move-later', label: '延后排程', icon: '⏩', divider: true },
  { key: 'lock', label: '锁定时间', icon: '🔒' },
  { key: 'unlock', label: '解锁时间', icon: '🔓', divider: true },
  { key: 'delete', label: '删除任务', icon: '🗑️', danger: true },
];

// Default menu items for background (no task) context
export const DEFAULT_BG_MENU_ITEMS: ContextMenuItem[] = [
  { key: 'add-task', label: '新建任务', icon: '➕' },
  { key: 'paste', label: '粘贴任务', icon: '📋', divider: true },
  { key: 'zoom-fit', label: '适配视图', icon: '🔍' },
  { key: 'expand-all', label: '全部展开', icon: '📂' },
  { key: 'collapse-all', label: '全部折叠', icon: '📁' },
];

export default React.memo(GanttContextMenu);
