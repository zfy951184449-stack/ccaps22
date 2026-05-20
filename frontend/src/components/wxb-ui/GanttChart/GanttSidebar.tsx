/**
 * WxbGanttChart v2 — Virtual-scrolling Sidebar
 */
import React, { useRef, useEffect, useCallback } from 'react';
import type { FlatRow } from './types';
import type { GanttAction } from './useGanttStore';
import { ROW_HEIGHT, HEADER_HEIGHT, HEATMAP_HEIGHT, THEME, FONT_SANS } from './constants';
import { hexToRgba } from './ganttUtils';

interface GanttSidebarProps {
  flatRows: FlatRow[];
  scrollY: number;
  hoveredRow: number;
  canvasH: number;
  showHeatmap: boolean;
  dispatch: React.Dispatch<GanttAction>;
  sidebarWidth: number;
  selectedTaskIds: Set<string>;
  onGroupToggle?: (groupId: string, collapsed: boolean) => void;
  /** Task IDs in the hovered share component (for cross-highlight) */
  shareHighlightTaskIds?: Set<string>;
  /** Color of the hovered share component */
  shareHighlightColor?: string;
}

const GanttSidebar: React.FC<GanttSidebarProps> = ({
  flatRows, scrollY, hoveredRow, canvasH, showHeatmap, dispatch, sidebarWidth, selectedTaskIds, onGroupToggle,
  shareHighlightTaskIds, shareHighlightColor,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isSync = useRef(false);
  const totalHeaderH = HEADER_HEIGHT + (showHeatmap ? HEATMAP_HEIGHT : 0);
  const totalHeight = flatRows.length * ROW_HEIGHT;

  // Sync scroll from canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el || isSync.current) return;
    el.scrollTop = scrollY;
  }, [scrollY]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isSync.current = true;
    dispatch({ type: 'SET_SCROLL', y: el.scrollTop });
    requestAnimationFrame(() => { isSync.current = false; });
  }, [dispatch]);

  const handleToggle = useCallback((groupId: string, isExpanded: boolean) => {
    dispatch({ type: 'TOGGLE_GROUP', groupId });
    onGroupToggle?.(groupId, !isExpanded);
  }, [dispatch, onGroupToggle]);

  // Sidebar row hover → dispatch to canvas
  const handleRowMouseEnter = useCallback((rowIndex: number) => {
    dispatch({ type: 'HOVER_ROW', row: rowIndex, colX: -1 });
  }, [dispatch]);

  const handleRowMouseLeave = useCallback(() => {
    dispatch({ type: 'HOVER_ROW', row: -1, colX: -1 });
  }, [dispatch]);

  // Virtualization
  const visibleStart = Math.floor(scrollY / ROW_HEIGHT);
  const visibleCount = Math.ceil((canvasH - totalHeaderH) / ROW_HEIGHT);
  const overscan = 5;
  const renderStart = Math.max(0, visibleStart - overscan);
  const renderEnd = Math.min(flatRows.length, visibleStart + visibleCount + overscan);

  return (
    <div
      className="wxb-gantt-sidebar"
      style={{
        width: sidebarWidth,
        flexShrink: 0,
        minHeight: 0,
        borderRight: `1px solid ${THEME.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="wxb-gantt-sidebar-header"
        style={{
          height: totalHeaderH,
          background: THEME.surface2,
          borderBottom: `1px solid ${THEME.border}`,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 12,
          font: `600 12px ${FONT_SANS}`,
          color: THEME.ink,
          flexShrink: 0,
        }}
      >
        名称
      </div>

      {/* Scrollable row list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {flatRows.slice(renderStart, renderEnd).map((row, idx) => {
            const i = renderStart + idx;
            const top = i * ROW_HEIGHT;
            const isGroup = row.type === 'group';
            const canToggleGroup = isGroup && row.hasChildren && !row.isSubRow;
                  const isSelected = row.taskId ? selectedTaskIds.has(row.taskId) : false;
                  const isHovered = i === hoveredRow;
                  const isShareHighlighted = row.taskId ? (shareHighlightTaskIds?.has(row.taskId) ?? false) : false;
                  let rowBg: string;
                  if (isSelected) {
                    rowBg = 'rgba(31, 111, 235, 0.08)';
                  } else if (isShareHighlighted && shareHighlightColor) {
                    rowBg = hexToRgba(shareHighlightColor, 0.10);
                  } else if (isHovered) {
                    rowBg = hexToRgba('#E6F2FB', 0.45);
                  } else {
                    rowBg = i % 2 === 0 ? THEME.surface1 : THEME.bg;
                  }
                  // Left border: selected > share-highlight > transparent
                  let leftBorder: string;
                  if (isSelected) {
                    leftBorder = '2px solid rgba(31, 111, 235, 0.5)';
                  } else if (isShareHighlighted && shareHighlightColor) {
                    leftBorder = `2px solid ${hexToRgba(shareHighlightColor, 0.7)}`;
                  } else {
                    leftBorder = '2px solid transparent';
                  }
                  return (
              <div
                key={row.id}
                className="wxb-gantt-sidebar-row"
                style={{
                  position: 'absolute',
                  top,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 8 + row.depth * 16,
                  background: rowBg,
                  cursor: canToggleGroup ? 'grab' : 'default',
                  borderBottom: `1px solid ${THEME.divider}`,
                  borderLeft: leftBorder,
                  userSelect: 'none',
                  transition: 'background 0.1s ease',
                }}
                onClick={() => canToggleGroup && handleToggle(row.id, row.isExpanded)}
                onMouseEnter={() => handleRowMouseEnter(i)}
                onMouseLeave={handleRowMouseLeave}
              >
                {/* Sub-row: vertical connector line instead of content */}
                {row.isSubRow ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      color: THEME.fg4,
                      fontSize: 11,
                      fontStyle: 'italic',
                      opacity: 0.6,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 1,
                        height: ROW_HEIGHT - 8,
                        background: THEME.fg4,
                        marginRight: 6,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.label}
                    </span>
                  </span>
                ) : (
                  <>
                    {/* Expand/collapse arrow */}
                    {canToggleGroup && (
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          color: THEME.fg3,
                          marginRight: 4,
                          transition: 'transform 0.15s',
                          transform: row.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        }}
                      >
                        ▶
                      </span>
                    )}
                    {!canToggleGroup && <span style={{ width: 20 }} />}

                    {/* Drag handle for group rows */}
                    {canToggleGroup && (
                      <span
                        style={{
                          fontSize: 10,
                          color: THEME.fg4,
                          marginRight: 4,
                          opacity: isHovered ? 0.8 : 0,
                          transition: 'opacity 0.15s',
                        }}
                        title="拖拽移动"
                      >
                        ⠿
                      </span>
                    )}

                    {/* Color dot */}
                    {row.color && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: row.color,
                          marginRight: 6,
                          flexShrink: 0,
                        }}
                      />
                    )}

                    {/* Equipment type badge */}
                    {row.equipmentType && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: '1px 4px',
                          borderRadius: 3,
                          background: 'rgba(11, 61, 127, 0.08)',
                          color: '#0B3D7F',
                          marginRight: 4,
                          flexShrink: 0,
                          fontWeight: 500,
                        }}
                      >
                        {row.equipmentType}
                      </span>
                    )}

                    {/* Label */}
                    <span
                      style={{
                        font: `${isGroup ? '500' : '400'} 12px ${FONT_SANS}`,
                        color: isGroup ? THEME.ink : THEME.fg2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.label}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default React.memo(GanttSidebar);
