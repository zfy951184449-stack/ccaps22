/**
 * WxbGanttChart — Main Component
 * High-performance Gantt chart with Canvas 2D + DOM hybrid rendering
 */
import React, { useMemo, useCallback, useEffect, useState } from 'react';
import './GanttChart.css';
import { WxbGanttChartProps, ThemeColors } from './types';
import { useGanttLayout } from './useGanttLayout';
import { useGanttInteraction } from './useGanttInteraction';
import { computeTimeRange, readThemeColors } from './ganttUtils';
import { GanttSidebar } from './GanttSidebar';
import { GanttCanvas } from './GanttCanvas';

export const WxbGanttChart: React.FC<WxbGanttChartProps> = ({
  tasks,
  groups = [],
  dependencies = [],
  links = [],
  timeRange,
  timeUnit = 'day',
  rowHeight = 32,
  sidebarWidth = 180,
  showGrid = true,
  showToday = true,
  showProgress = true,
  zoomRange = [40, 600],
  onTaskClick,
  onTaskDoubleClick,
  onTaskDragEnd,
  onGroupToggle,
  className = '',
  style,
}) => {
  // ─── Theme Colors ───
  const [theme, setTheme] = useState<ThemeColors>(() => readThemeColors());

  useEffect(() => {
    // Re-read theme on mount (CSS vars might not be available during SSR)
    setTheme(readThemeColors());
  }, []);

  // ─── Layout ───
  const { flatRows, taskRowMap, toggleGroup } = useGanttLayout(tasks, groups);

  const handleGroupToggle = useCallback(
    (groupId: string) => {
      toggleGroup(groupId);
      if (onGroupToggle) {
        onGroupToggle(groupId, true); // TODO: pass actual state
      }
    },
    [toggleGroup, onGroupToggle]
  );

  // ─── Time Range ───
  const { startHour, endHour } = useMemo(() => {
    if (timeRange) {
      return { startHour: timeRange.start, endHour: timeRange.end };
    }
    return computeTimeRange(tasks);
  }, [tasks, timeRange]);

  const totalHours = endHour - startHour;

  // ─── Today ───
  const todayHour = useMemo(() => {
    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
    return dayOfYear * 24 + now.getHours() + now.getMinutes() / 60;
  }, []);

  // ─── Interaction ───
  const interaction = useGanttInteraction(
    {
      zoomRange,
      rowHeight,
      totalRows: flatRows.length,
      totalHours,
      startHour,
      sidebarWidth,
    },
    onTaskDragEnd
  );

  // ─── View mode (for toolbar) ───
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');

  const handleViewModeChange = useCallback(
    (mode: 'day' | 'week' | 'month') => {
      setViewMode(mode);
      switch (mode) {
        case 'day':
          interaction.setDayWidth(120);
          break;
        case 'week':
          interaction.setDayWidth(60);
          break;
        case 'month':
          interaction.setDayWidth(20);
          break;
      }
    },
    [interaction.setDayWidth]
  );

  // ─── Stats ───
  const taskCount = tasks.length;
  const groupCount = groups.filter(g => !g.parentId || groups.every(gg => gg.id !== g.parentId)).length;
  const totalDuration = tasks.reduce((sum, t) => sum + (t.end - t.start), 0);

  return (
    <div
      className={`wxb-gantt-chart ${className}`}
      style={{ height: 420, ...style }}
    >
      {/* ─── Toolbar ─── */}
      <div className="wxb-gantt-toolbar">
        <span className="wxb-gantt-toolbar-title">工序甘特图</span>

        <div className="wxb-gantt-toolbar-group">
          <button
            className="wxb-gantt-zoom-btn"
            onClick={() => interaction.handleZoom(-20)}
            title="缩小"
          >
            −
          </button>
          <input
            type="range"
            className="wxb-gantt-zoom-slider"
            min={zoomRange[0]}
            max={zoomRange[1]}
            value={interaction.dayWidth}
            onChange={e => interaction.setDayWidth(Number(e.target.value))}
          />
          <button
            className="wxb-gantt-zoom-btn"
            onClick={() => interaction.handleZoom(20)}
            title="放大"
          >
            +
          </button>
        </div>

        <div className="wxb-gantt-toolbar-group">
          {(['day', 'week', 'month'] as const).map(mode => (
            <button
              key={mode}
              className={`wxb-gantt-view-btn ${viewMode === mode ? 'active' : ''}`}
              onClick={() => handleViewModeChange(mode)}
            >
              {mode === 'day' ? '天' : mode === 'week' ? '周' : '月'}
            </button>
          ))}
        </div>

        <button
          className="wxb-gantt-today-btn"
          onClick={() => {
            // Scroll to today
            const todayX = (todayHour - startHour) * interaction.hourWidth;
            interaction.setScrollX(Math.max(0, todayX - 200));
          }}
        >
          Today
        </button>
      </div>

      {/* ─── Body ─── */}
      <div className="wxb-gantt-body">
        <GanttSidebar
          flatRows={flatRows}
          rowHeight={rowHeight}
          sidebarWidth={sidebarWidth}
          scrollY={interaction.scrollY}
          containerHeight={420 - 44 - 28}
          onGroupToggle={handleGroupToggle}
        />
        <GanttCanvas
          tasks={tasks}
          flatRows={flatRows}
          taskRowMap={taskRowMap}
          dependencies={dependencies}
          links={links}
          theme={theme}
          rowHeight={rowHeight}
          startHour={startHour}
          endHour={endHour}
          hourWidth={interaction.hourWidth}
          scrollX={interaction.scrollX}
          scrollY={interaction.scrollY}
          showGrid={showGrid}
          showToday={showToday}
          showProgress={showProgress}
          todayHour={todayHour}
          onWheel={interaction.handleWheel}
          onPanStart={interaction.handlePanStart}
          onPanMove={interaction.handlePanMove}
          onPanEnd={interaction.handlePanEnd}
          isPanning={interaction.isPanningRef}
          onTaskClick={onTaskClick}
          onTaskDoubleClick={onTaskDoubleClick}
        />
      </div>

      {/* ─── Footer ─── */}
      <div className="wxb-gantt-footer">
        <span className="wxb-gantt-footer-text">
          {taskCount} 个工序 · {groupCount} 个阶段 · 总时长 {totalDuration.toFixed(0)}h
        </span>
      </div>
    </div>
  );
};
