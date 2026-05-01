/**
 * WxbGanttChart v2 — Virtual-scrolling Sidebar
 */
import React, { useRef, useEffect, useCallback } from 'react';
import type { FlatRow } from './types';
import type { GanttAction } from './useGanttStore';
import { ROW_HEIGHT, HEADER_HEIGHT, HEATMAP_HEIGHT, THEME, FONT_SANS } from './constants';

interface GanttSidebarProps {
  flatRows: FlatRow[];
  scrollY: number;
  canvasH: number;
  showHeatmap: boolean;
  dispatch: React.Dispatch<GanttAction>;
  sidebarWidth: number;
  onGroupToggle?: (groupId: string, collapsed: boolean) => void;
}

const GanttSidebar: React.FC<GanttSidebarProps> = ({
  flatRows, scrollY, canvasH, showHeatmap, dispatch, sidebarWidth, onGroupToggle,
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
    dispatch({ type: 'SET_SCROLL', x: -1, y: el.scrollTop });
    requestAnimationFrame(() => { isSync.current = false; });
  }, [dispatch]);

  // Override SET_SCROLL to not change x when x is -1
  // This is a simple approach; in practice the reducer handles it

  const handleToggle = useCallback((groupId: string, isExpanded: boolean) => {
    dispatch({ type: 'TOGGLE_GROUP', groupId });
    onGroupToggle?.(groupId, !isExpanded);
  }, [dispatch, onGroupToggle]);

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
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {flatRows.slice(renderStart, renderEnd).map((row, idx) => {
            const i = renderStart + idx;
            const top = i * ROW_HEIGHT;
            const isGroup = row.type === 'group';
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
                  background: i % 2 === 0 ? THEME.surface1 : THEME.bg,
                  cursor: isGroup ? 'pointer' : 'default',
                  borderBottom: `1px solid ${THEME.divider}`,
                  userSelect: 'none',
                }}
                onClick={() => isGroup && handleToggle(row.id, row.isExpanded)}
              >
                {/* Expand/collapse arrow */}
                {row.hasChildren && (
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
                {!row.hasChildren && <span style={{ width: 20 }} />}

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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default React.memo(GanttSidebar);
