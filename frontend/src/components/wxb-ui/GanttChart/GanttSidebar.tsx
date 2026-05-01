/**
 * WxbGanttChart — GanttSidebar Component
 * DOM-based tree sidebar for group/task labels
 */
import React, { useCallback } from 'react';
import { FlatRow } from './types';

interface GanttSidebarProps {
  flatRows: FlatRow[];
  rowHeight: number;
  sidebarWidth: number;
  scrollY: number;
  containerHeight: number;
  onGroupToggle: (groupId: string) => void;
}

export const GanttSidebar: React.FC<GanttSidebarProps> = ({
  flatRows,
  rowHeight,
  sidebarWidth,
  scrollY,
  containerHeight,
  onGroupToggle,
}) => {
  const headerHeight = 48;
  const visibleStart = Math.max(0, Math.floor(scrollY / rowHeight) - 2);
  const visibleEnd = Math.min(flatRows.length, Math.ceil((scrollY + containerHeight) / rowHeight) + 2);

  const handleClick = useCallback(
    (row: FlatRow) => {
      if (row.type === 'group' && row.groupId) {
        onGroupToggle(row.groupId);
      }
    },
    [onGroupToggle]
  );

  return (
    <div
      className="wxb-gantt-sidebar"
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        height: '100%',
        borderRight: '1px solid var(--wx-border, #E4EAF1)',
        overflow: 'hidden',
        position: 'relative',
        background: '#FFFFFF',
      }}
    >
      {/* Header */}
      <div
        className="wxb-gantt-sidebar-header"
        style={{
          height: headerHeight,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          borderBottom: '1px solid var(--wx-border, #E4EAF1)',
          background: 'var(--wx-surface-2, #F5F8FB)',
        }}
      >
        <span
          style={{
            font: '500 12px/1 var(--wx-font-sans, Inter, sans-serif)',
            color: 'var(--wx-fg-3, #5A6B7E)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          结构
        </span>
      </div>

      {/* Rows */}
      <div
        style={{
          position: 'relative',
          height: flatRows.length * rowHeight,
          transform: `translateY(${-scrollY}px)`,
        }}
      >
        {flatRows.slice(visibleStart, visibleEnd).map((row, idx) => {
          const actualIdx = visibleStart + idx;
          const y = actualIdx * rowHeight;
          const indentPx = row.depth * 16 + 12;

          return (
            <div
              key={row.id}
              className={`wxb-gantt-sidebar-row ${row.type === 'group' ? 'wxb-gantt-sidebar-group' : ''}`}
              style={{
                position: 'absolute',
                top: y,
                left: 0,
                right: 0,
                height: rowHeight,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: indentPx,
                cursor: row.type === 'group' ? 'pointer' : 'default',
                userSelect: 'none',
                borderLeft: row.type === 'task' ? `3px solid ${row.color || 'transparent'}` : 'none',
              }}
              onClick={() => handleClick(row)}
            >
              {/* Expand/Collapse icon */}
              {row.type === 'group' && row.hasChildren && (
                <span
                  className="wxb-gantt-sidebar-arrow"
                  style={{
                    display: 'inline-flex',
                    width: 16,
                    height: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 4,
                    fontSize: 10,
                    color: 'var(--wx-fg-4, #8898A8)',
                    transition: 'transform 180ms ease',
                    transform: row.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  }}
                >
                  ▶
                </span>
              )}

              {/* Label */}
              <span
                style={{
                  font:
                    row.type === 'group'
                      ? row.depth === 0
                        ? '600 13px/1 var(--wx-font-sans, Inter, sans-serif)'
                        : '500 13px/1 var(--wx-font-sans, Inter, sans-serif)'
                      : '400 12px/1 var(--wx-font-sans, Inter, sans-serif)',
                  color:
                    row.type === 'group'
                      ? row.depth === 0
                        ? 'var(--wx-ink, #0F1B2D)'
                        : 'var(--wx-fg-2, #3A4A5C)'
                      : 'var(--wx-fg-3, #5A6B7E)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
