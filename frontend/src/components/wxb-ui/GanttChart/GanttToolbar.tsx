/**
 * WxbGanttChart v2 — Toolbar
 */
import React, { useCallback } from 'react';
import type { ViewMode } from './types';
import type { GanttAction } from './useGanttStore';
import { MIN_DAY_WIDTH, MAX_DAY_WIDTH } from './constants';

interface GanttToolbarProps {
  dayWidth: number;
  viewMode: ViewMode;
  dispatch: React.Dispatch<GanttAction>;
  enableFullscreen: boolean;
  isFullscreen?: boolean;
  onFullscreenToggle?: () => void;
  onViewModeChange?: (mode: ViewMode) => void;
}

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'hour', label: '时' },
  { key: 'day',  label: '天' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
];

const GanttToolbar: React.FC<GanttToolbarProps> = ({
  dayWidth, viewMode, dispatch, enableFullscreen, isFullscreen, onFullscreenToggle, onViewModeChange,
}) => {
  const handleViewChange = useCallback((mode: ViewMode) => {
    dispatch({ type: 'SET_VIEW', mode });
    onViewModeChange?.(mode);
  }, [dispatch, onViewModeChange]);

  const handleZoom = useCallback((delta: number) => {
    dispatch({ type: 'ZOOM', dayWidth: dayWidth + delta });
  }, [dispatch, dayWidth]);

  const handleScrollToToday = useCallback(() => {
    dispatch({ type: 'SET_SCROLL', x: 0, y: 0 });
  }, [dispatch]);

  const zoomPercent = Math.max(0, Math.min(100, Math.round(((dayWidth - MIN_DAY_WIDTH) / (MAX_DAY_WIDTH - MIN_DAY_WIDTH)) * 100)));

  return (
    <div className="wxb-gantt-toolbar">
      {/* View mode buttons */}
      <div className="wxb-gantt-toolbar-group">
        {VIEW_MODES.map(vm => (
          <button
            key={vm.key}
            className={`wxb-gantt-toolbar-btn ${viewMode === vm.key ? 'active' : ''}`}
            onClick={() => handleViewChange(vm.key)}
          >
            {vm.label}
          </button>
        ))}
      </div>

      {/* Zoom controls */}
      <div className="wxb-gantt-toolbar-group">
        <button className="wxb-gantt-toolbar-btn" onClick={() => handleZoom(-20)} title="缩小">−</button>
        <span className="wxb-gantt-toolbar-label">{zoomPercent}%</span>
        <button className="wxb-gantt-toolbar-btn" onClick={() => handleZoom(20)} title="放大">+</button>
      </div>

      {/* Actions */}
      <div className="wxb-gantt-toolbar-group">
        <button className="wxb-gantt-toolbar-btn" onClick={handleScrollToToday} title="回到起点">
          ⟳
        </button>
        {enableFullscreen && (
          <button
            className="wxb-gantt-toolbar-btn"
            onClick={onFullscreenToggle}
            title={isFullscreen ? '退出全屏' : '全屏'}
            aria-pressed={isFullscreen || undefined}
          >
            {isFullscreen ? '⤡' : '⤢'}
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(GanttToolbar);
