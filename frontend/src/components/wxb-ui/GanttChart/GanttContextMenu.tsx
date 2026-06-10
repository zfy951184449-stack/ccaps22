/**
 * WxbGanttChart v2.1 — Context Menu
 * Enterprise-grade context menu aligned with WXB design system.
 *
 * - Uses CSS classes (.wxb-gantt-ctx-*) instead of inline styles
 * - Uses inline SVG icons instead of emoji (project policy)
 * - Multi-select batch awareness (selectedCount)
 * - Optional sub-menus with overflow detection
 * - Keyboard shortcut hints in monospace
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GanttTask } from './types';

// ===== Inline SVG Icon Helpers (16×16 stroke icons) =====
const S = { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const Icons = {
  edit:      <svg {...S}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  copy:      <svg {...S}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  forward:   <svg {...S}><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>,
  backward:  <svg {...S}><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>,
  link:      <svg {...S}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  linkPlus:  <svg {...S}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/><path d="M12 17v4M10 19h4"/></svg>,
  linkMinus: <svg {...S}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/><path d="M10 19h4"/></svg>,
  highlight: <svg {...S}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  lock:      <svg {...S}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  unlock:    <svg {...S}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>,
  check:     <svg {...S}><polyline points="20 6 9 17 4 12"/></svg>,
  x:         <svg {...S}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  trash:     <svg {...S}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  plus:      <svg {...S}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  folderOpen:<svg {...S}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
  folderClose:<svg {...S}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><path d="M2 10h20"/></svg>,
  selectAll: <svg {...S}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>,
} as const;

export interface ContextMenuItem {
  /** Unique action key */
  key: string;
  /** Display label */
  label: string;
  /** Icon — React node (SVG element). Use Icons.xxx from this module. */
  icon?: React.ReactNode;
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
  visible: boolean;
  x: number;
  y: number;
  task: GanttTask | null;
  items: ContextMenuItem[];
  selectedCount: number;
  contextType: 'task' | 'group' | 'background';
  onAction: (key: string, task: GanttTask | null) => void;
  onClose: () => void;
}

const GanttContextMenu: React.FC<GanttContextMenuProps> = ({
  visible, x, y, task, items, selectedCount, contextType, onAction, onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });
  const [openSubKey, setOpenSubKey] = useState<string | null>(null);
  const [subDirection, setSubDirection] = useState<'left' | 'right'>('right');

  // Adjust position to avoid viewport overflow
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
    // Determine sub-menu direction based on available space
    setSubDirection(nx + rect.width + 160 > vw ? 'left' : 'right');
  }, [visible, x, y]);

  useEffect(() => {
    if (visible) setOpenSubKey(null);
  }, [visible]);

  // Close on click outside or Escape
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
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

  const resolveLabel = (item: ContextMenuItem): string => {
    if (isBatchMode && item.batchLabel) {
      return item.batchLabel.replace('{n}', String(selectedCount));
    }
    return item.label;
  };

  const headerText = (() => {
    if (contextType === 'group' && task) return task.label;
    if (isBatchMode) return `已选中 ${selectedCount} 个任务`;
    if (task) return task.label;
    return null;
  })();

  if (!visible) return null;

  const itemClass = (item: ContextMenuItem) =>
    `wxb-gantt-ctx-item${item.disabled ? ' disabled' : ''}${item.danger ? ' danger' : ''}`;

  return (
    <div ref={menuRef} className="wxb-gantt-ctx" style={{ left: adjustedPos.x, top: adjustedPos.y }}>
      {/* Header */}
      {headerText && (
        <div className={`wxb-gantt-ctx-header${isBatchMode ? ' batch' : ''}`}>
          {headerText}
        </div>
      )}

      {/* Menu items */}
      {items.map((item) => (
        <React.Fragment key={item.key}>
          {item.children && item.children.length > 0 ? (
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => setOpenSubKey(item.key)}
              onMouseLeave={() => setOpenSubKey(null)}
            >
              <div className={itemClass(item)}>
                {item.icon && <span className="wxb-gantt-ctx-icon">{item.icon}</span>}
                <span className="wxb-gantt-ctx-label">{resolveLabel(item)}</span>
                <span className="wxb-gantt-ctx-sub-arrow">▸</span>
              </div>
              {openSubKey === item.key && (
                <div className={`wxb-gantt-ctx-sub ${subDirection}`}>
                  {item.children.map(child => (
                    <div key={child.key} className={itemClass(child)} onClick={() => handleItemClick(child.key, child.disabled)}>
                      {child.icon && <span className="wxb-gantt-ctx-icon">{child.icon}</span>}
                      <span className="wxb-gantt-ctx-label">{child.label}</span>
                      {child.shortcut && <span className="wxb-gantt-ctx-shortcut">{child.shortcut}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={itemClass(item)} onClick={() => handleItemClick(item.key, item.disabled)}>
              {item.icon && <span className="wxb-gantt-ctx-icon">{item.icon}</span>}
              <span className="wxb-gantt-ctx-label">{resolveLabel(item)}</span>
              {item.shortcut && <span className="wxb-gantt-ctx-shortcut">{item.shortcut}</span>}
            </div>
          )}
          {item.divider && <div className="wxb-gantt-ctx-divider" />}
        </React.Fragment>
      ))}
    </div>
  );
};

// ===== Default Menu Presets (no emoji — all SVG icons) =====

/** Single task menu (generic — consumer can override via taskMenuItems prop) */
export const DEFAULT_TASK_MENU_ITEMS: ContextMenuItem[] = [
  { key: 'edit', label: '编辑任务', batchLabel: '批量编辑', icon: Icons.edit, shortcut: '⏎' },
  { key: 'duplicate', label: '复制任务', batchLabel: '批量复制', icon: Icons.copy, divider: true },
  { key: 'move-earlier', label: '提前排程', batchLabel: '批量提前', icon: Icons.backward },
  { key: 'move-later', label: '延后排程', batchLabel: '批量延后', icon: Icons.forward, divider: true },
  { key: 'share-group', label: '共享组', icon: Icons.link, children: [
    { key: 'share-create', label: '创建共享组', icon: Icons.linkPlus },
    { key: 'share-add', label: '加入共享组', icon: Icons.link },
    { key: 'share-remove', label: '移出共享组', icon: Icons.linkMinus },
    { key: 'share-highlight', label: '高亮共享组', icon: Icons.highlight },
  ], divider: true },
  { key: 'lock', label: '锁定时间', batchLabel: '批量锁定', icon: Icons.lock },
  { key: 'unlock', label: '解锁时间', batchLabel: '批量解锁', icon: Icons.unlock, divider: true },
  { key: 'select-all', label: '全选同组', icon: Icons.selectAll, shortcut: 'Ctrl+A' },
  { key: 'clear-selection', label: '清除选择', icon: Icons.x, shortcut: 'Esc', divider: true },
  { key: 'delete', label: '删除任务', batchLabel: '删除 {n} 个任务', icon: Icons.trash, danger: true, shortcut: 'Del' },
];

/** Group row menu */
export const DEFAULT_GROUP_MENU_ITEMS: ContextMenuItem[] = [
  { key: 'expand-group', label: '展开所有子组', icon: Icons.folderOpen },
  { key: 'collapse-group', label: '折叠所有子组', icon: Icons.folderClose, divider: true },
  { key: 'select-children', label: '选中所有子任务', icon: Icons.selectAll },
  { key: 'deselect-children', label: '取消选中子任务', icon: Icons.x, divider: true },
];

/** Background (no target) menu */
export const DEFAULT_BG_MENU_ITEMS: ContextMenuItem[] = [
  { key: 'add-task', label: '新建任务', icon: Icons.plus },
  { key: 'expand-all', label: '全部展开', icon: Icons.folderOpen },
  { key: 'collapse-all', label: '全部折叠', icon: Icons.folderClose, divider: true },
  { key: 'select-all', label: '全选', icon: Icons.selectAll, shortcut: 'Ctrl+A' },
  { key: 'clear-selection', label: '清除选择', icon: Icons.x, shortcut: 'Esc' },
];

export { Icons as CtxIcons };
export default React.memo(GanttContextMenu);
