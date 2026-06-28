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
  /** Consumer-provided controls rendered inline at the start of the toolbar row.
   *  A flex spacer keeps the built-in view/zoom/fullscreen controls right-aligned.
   *  When omitted, the toolbar renders exactly as before. */
  extraContent?: React.ReactNode;
  /** Show the visible undo button (editable gantts only). */
  showUndo?: boolean;
  /** Number of drags that can be undone; the button disables at 0 and shows the count. */
  undoCount?: number;
  /** Rewind the most-recent drag (same as Ctrl+Z / the cascade toast). */
  onUndo?: () => void;
}

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'hour', label: '时' },
  { key: 'day',  label: '天' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
];

const GanttToolbar: React.FC<GanttToolbarProps> = ({
  dayWidth, viewMode, dispatch, enableFullscreen, isFullscreen, onFullscreenToggle, onViewModeChange, extraContent,
  showUndo = false, undoCount = 0, onUndo,
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
      {/* Consumer-injected controls (folded into the toolbar row). A spacer pushes
          the built-in view/zoom/fullscreen controls to the right edge. */}
      {extraContent != null && (
        <>
          <div className="wxb-gantt-toolbar-extra">{extraContent}</div>
          <div className="wxb-gantt-toolbar-spacer" />
        </>
      )}

      {/* Undo — visible affordance for the drag undo stack (also Ctrl+Z). */}
      {showUndo && (
        <div className="wxb-gantt-toolbar-group">
          <button
            type="button"
            className="wxb-gantt-toolbar-btn wxb-gantt-toolbar-undo"
            onClick={onUndo}
            disabled={undoCount === 0}
            title={undoCount > 0 ? `撤销上一步拖动 · 还可撤销 ${undoCount} 步（Ctrl+Z）` : '没有可撤销的拖动'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
            </svg>
            <span>撤销</span>
            {undoCount > 0 && <span className="wxb-gantt-toolbar-undo-count">{undoCount}</span>}
          </button>
        </div>
      )}

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
