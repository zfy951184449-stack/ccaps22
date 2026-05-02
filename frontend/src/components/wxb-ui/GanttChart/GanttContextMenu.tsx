/**
 * WxbGanttChart v2.1 — Context Menu
 * WXB enterprise-style dropdown context menu for task operations
 *
 * Features:
 *   - Multi-select batch awareness (selectedCount)
 *   - Optional sub-menus (children)
 *   - Keyboard shortcut hints
 *   - batchLabel with {n} placeholder
 *   - 3 context types: task / group / background
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
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Label to show in batch/multi-select mode (supports {n} placeholder) */
  batchLabel?: string;
  /** Sub-menu items */
  children?: ContextMenuItem[];
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
  /** Number of currently selected tasks */
  selectedCount: number;
  /** Context type: what was right-clicked */
  contextType: 'task' | 'group' | 'background';
  /** Callback when an item is clicked */
  onAction: (key: string, task: GanttTask | null) => void;
  /** Close handler */
  onClose: () => void;
}

const GanttContextMenu: React.FC<GanttContextMenuProps> = ({
  visible, x, y, task, items, selectedCount, contextType, onAction, onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });
  const [openSubKey, setOpenSubKey] = useState<string | null>(null);

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

  // Reset sub-menu on open
  useEffect(() => {
    if (visible) setOpenSubKey(null);
  }, [visible]);

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

  const isBatchMode = selectedCount > 1;

  /** Resolve display label: batch mode with {n} replacement */
  const resolveLabel = (item: ContextMenuItem): string => {
    if (isBatchMode && item.batchLabel) {
      return item.batchLabel.replace('{n}', String(selectedCount));
    }
    return item.label;
  };

  /** Header text */
  const headerText = (() => {
    if (contextType === 'group' && task) return task.label;
    if (isBatchMode) return `已选中 ${selectedCount} 个任务`;
    if (task) return task.label;
    return null;
  })();

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 10002,
        minWidth: 200,
        background: THEME.bg,
        border: `1px solid ${THEME.border}`,
        borderRadius: 6,
        boxShadow: '0 6px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
        padding: '4px 0',
        fontFamily: FONT_SANS,
        animation: 'wxb-ctx-fadein 0.12s ease-out',
      }}
    >
      {/* Header */}
      {headerText && (
        <div
          style={{
            padding: '6px 12px 4px',
            fontSize: 11,
            fontWeight: 600,
            color: isBatchMode ? THEME.blue500 : THEME.fg3,
            borderBottom: `1px solid ${THEME.divider}`,
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '0.02em',
            textTransform: isBatchMode ? 'none' : 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {isBatchMode && <span style={{ fontSize: 13 }}>☑</span>}
          {contextType === 'group' && !isBatchMode && <span style={{ fontSize: 13 }}>📂</span>}
          {headerText}
        </div>
      )}

      {/* Menu items */}
      {items.map((item) => (
        <React.Fragment key={item.key}>
          {item.children && item.children.length > 0 ? (
            /* Sub-menu trigger */
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => setOpenSubKey(item.key)}
              onMouseLeave={() => setOpenSubKey(null)}
            >
              <div
                role="menuitem"
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  color: item.disabled ? THEME.fg4 : THEME.ink,
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: item.disabled ? 0.5 : 1,
                  background: openSubKey === item.key ? THEME.surface1 : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                {item.icon && (
                  <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>
                    {item.icon}
                  </span>
                )}
                <span style={{ flex: 1 }}>{resolveLabel(item)}</span>
                <span style={{ fontSize: 10, color: THEME.fg4 }}>▶</span>
              </div>

              {/* Sub-menu panel */}
              {openSubKey === item.key && (
                <div
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: -4,
                    minWidth: 160,
                    background: THEME.bg,
                    border: `1px solid ${THEME.border}`,
                    borderRadius: 6,
                    boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
                    padding: '4px 0',
                    zIndex: 10003,
                    animation: 'wxb-ctx-fadein 0.1s ease-out',
                  }}
                >
                  {item.children.map(child => (
                    <div
                      key={child.key}
                      role="menuitem"
                      tabIndex={child.disabled ? -1 : 0}
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        color: child.disabled ? THEME.fg4 : child.danger ? THEME.danger : THEME.ink,
                        cursor: child.disabled ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        opacity: child.disabled ? 0.5 : 1,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        if (!child.disabled) (e.currentTarget as HTMLDivElement).style.background = THEME.surface1;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                      }}
                      onClick={() => handleItemClick(child.key, child.disabled)}
                    >
                      {child.icon && (
                        <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>
                          {child.icon}
                        </span>
                      )}
                      <span style={{ flex: 1 }}>{child.label}</span>
                      {child.shortcut && (
                        <span style={{ fontSize: 10, color: THEME.fg4, letterSpacing: '0.02em' }}>
                          {child.shortcut}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Regular menu item */
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
              <span style={{ flex: 1 }}>{resolveLabel(item)}</span>
              {item.shortcut && (
                <span style={{ fontSize: 10, color: THEME.fg4, letterSpacing: '0.02em' }}>
                  {item.shortcut}
                </span>
              )}
            </div>
          )}
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

// ===== Default Menu Presets =====

/** Single task menu */
export const DEFAULT_TASK_MENU_ITEMS: ContextMenuItem[] = [
  { key: 'edit', label: '编辑任务', batchLabel: '批量编辑', icon: '✏️', shortcut: '⏎' },
  { key: 'duplicate', label: '复制任务', batchLabel: '批量复制', icon: '📋' },
  { key: 'split', label: '拆分任务', icon: '✂️', divider: true },
  { key: 'move-earlier', label: '提前排程', batchLabel: '批量提前', icon: '⏪' },
  { key: 'move-later', label: '延后排程', batchLabel: '批量延后', icon: '⏩', divider: true },
  { key: 'share-group', label: '共享组', icon: '🔗', children: [
    { key: 'share-create', label: '创建共享组', icon: '➕' },
    { key: 'share-add', label: '加入共享组', icon: '📎' },
    { key: 'share-remove', label: '移出共享组', icon: '🚫' },
    { key: 'share-highlight', label: '高亮共享组', icon: '🔦' },
  ], divider: true },
  { key: 'lock', label: '锁定时间', batchLabel: '批量锁定', icon: '🔒' },
  { key: 'unlock', label: '解锁时间', batchLabel: '批量解锁', icon: '🔓', divider: true },
  { key: 'select-all', label: '全选同组', icon: '✅', shortcut: 'Ctrl+A' },
  { key: 'clear-selection', label: '清除选择', icon: '❎', shortcut: 'Esc', divider: true },
  { key: 'delete', label: '删除任务', batchLabel: '删除 {n} 个任务', icon: '🗑️', danger: true, shortcut: 'Del' },
];

/** Group row menu */
export const DEFAULT_GROUP_MENU_ITEMS: ContextMenuItem[] = [
  { key: 'expand-group', label: '展开所有子组', icon: '📂' },
  { key: 'collapse-group', label: '折叠所有子组', icon: '📁', divider: true },
  { key: 'select-children', label: '选中所有子任务', icon: '✅' },
  { key: 'deselect-children', label: '取消选中子任务', icon: '❎', divider: true },
  { key: 'cascade-later', label: '级联延后排程', icon: '⏩' },
  { key: 'cascade-earlier', label: '级联提前排程', icon: '⏪' },
];

/** Background (no target) menu */
export const DEFAULT_BG_MENU_ITEMS: ContextMenuItem[] = [
  { key: 'add-task', label: '新建任务', icon: '➕' },
  { key: 'paste', label: '粘贴任务', icon: '📋', divider: true },
  { key: 'zoom-fit', label: '适配视图', icon: '🔍' },
  { key: 'expand-all', label: '全部展开', icon: '📂' },
  { key: 'collapse-all', label: '全部折叠', icon: '📁', divider: true },
  { key: 'select-all', label: '全选', icon: '✅', shortcut: 'Ctrl+A' },
  { key: 'clear-selection', label: '清除选择', icon: '❎', shortcut: 'Esc' },
];

export default React.memo(GanttContextMenu);
