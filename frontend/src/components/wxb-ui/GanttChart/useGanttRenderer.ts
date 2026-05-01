/**
 * WxbGanttChart — useGanttRenderer Hook
 * Canvas 2D drawing engine with 3-layer architecture
 */
import { useCallback, useRef } from 'react';
import { GanttTask, GanttDependency, GanttLink, FlatRow, ThemeColors, CanvasViewport } from './types';
import { timeToX, roundRect, truncateText, darkenColor, hexToRgba } from './ganttUtils';

interface RendererConfig {
  rowHeight: number;
  startHour: number;
  endHour: number;
  hourWidth: number;
  showGrid: boolean;
  showToday: boolean;
  showProgress: boolean;
  todayHour: number;
  dpr: number;
}

export function useGanttRenderer(theme: ThemeColors) {
  const fontBase = '500 11px Inter, "PingFang SC", system-ui, sans-serif';
  const fontHeader = '500 12px Inter, "PingFang SC", system-ui, sans-serif';
  const fontSmall = '400 10px Inter, "PingFang SC", system-ui, sans-serif';
  // Cache to avoid creating new gradient objects every frame
  const gradientCacheRef = useRef<Map<string, CanvasGradient>>(new Map());

  // ─── Layer 0: Grid + Time Header ────────────────────────────────
  const drawGridLayer = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      viewport: CanvasViewport,
      config: RendererConfig,
      totalRows: number
    ) => {
      const { width, height, scrollX } = viewport;
      const { startHour, endHour, hourWidth, rowHeight, dpr, showGrid, showToday, todayHour } = config;

      ctx.clearRect(0, 0, width * dpr, height * dpr);
      ctx.save();
      ctx.scale(dpr, dpr);

      const totalHeight = totalRows * rowHeight;
      const headerHeight = 48;

      // ── Header background ──
      ctx.fillStyle = theme.surface2;
      ctx.fillRect(0, 0, width, headerHeight);
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, headerHeight);
      ctx.lineTo(width, headerHeight);
      ctx.stroke();

      if (!showGrid) {
        ctx.restore();
        return;
      }

      // ── Alternating row stripes ──
      for (let i = 0; i < totalRows; i++) {
        const y = headerHeight + i * rowHeight - viewport.scrollY;
        if (y + rowHeight < headerHeight || y > height) continue;
        if (i % 2 === 1) {
          ctx.fillStyle = theme.surface1;
          ctx.fillRect(0, Math.max(headerHeight, y), width, rowHeight);
        }
      }

      // ── Day columns ──
      const startDay = Math.floor(startHour / 24);
      const endDay = Math.ceil(endHour / 24);

      for (let day = startDay; day <= endDay; day++) {
        const dayHour = day * 24;
        const x = timeToX(dayHour, startHour, hourWidth) - scrollX;

        if (x < -hourWidth * 24 || x > width + hourWidth * 24) continue;

        // Weekend tinting (Saturday=6, Sunday=0)
        const dayOfWeek = ((day % 7) + 7) % 7;
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          const dayWidth = hourWidth * 24;
          ctx.fillStyle = hexToRgba(theme.blue100, 0.35);
          ctx.fillRect(x, headerHeight, dayWidth, Math.min(totalHeight, height - headerHeight));
        }

        // Day vertical line
        ctx.strokeStyle = theme.divider;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, headerHeight);
        ctx.lineTo(Math.round(x) + 0.5, height);
        ctx.stroke();

        // Day header text
        ctx.fillStyle = theme.fg3;
        ctx.font = fontHeader;
        ctx.textAlign = 'center';
        const dayLabelX = x + (hourWidth * 24) / 2;
        ctx.fillText(`Day ${day}`, dayLabelX, 18);

        // Hour subdivisions
        ctx.font = fontSmall;
        ctx.fillStyle = theme.fg4;
        for (let h = 0; h < 24; h += 6) {
          const hx = x + h * hourWidth;
          if (hx < -50 || hx > width + 50) continue;
          ctx.fillText(`${h.toString().padStart(2, '0')}`, hx, 36);

          // Hour gridlines (thin)
          if (h > 0) {
            ctx.strokeStyle = hexToRgba(theme.divider, 0.5);
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(Math.round(hx) + 0.5, headerHeight);
            ctx.lineTo(Math.round(hx) + 0.5, height);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      // ── Today marker ──
      if (showToday) {
        const todayX = timeToX(todayHour, startHour, hourWidth) - scrollX;
        if (todayX >= 0 && todayX <= width) {
          ctx.strokeStyle = theme.blue500;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(Math.round(todayX) + 0.5, 0);
          ctx.lineTo(Math.round(todayX) + 0.5, height);
          ctx.stroke();
          ctx.setLineDash([]);

          // Badge
          const badgeText = 'TODAY';
          ctx.font = '600 9px Inter, sans-serif';
          const bw = ctx.measureText(badgeText).width + 8;
          const bx = todayX - bw / 2;
          ctx.fillStyle = theme.blue500;
          roundRect(ctx, bx, 2, bw, 16, 3);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText(badgeText, todayX, 13);
        }
      }

      ctx.restore();
    },
    [theme]
  );

  // ─── Layer 1: Task Bars ─────────────────────────────────────────
  const drawBarsLayer = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      viewport: CanvasViewport,
      config: RendererConfig,
      tasks: GanttTask[],
      taskRowMap: Map<string, number>,
      flatRows: FlatRow[],
      hoveredTaskId: string | null
    ) => {
      const { width, height, scrollX, scrollY } = viewport;
      const { rowHeight, startHour, hourWidth, showProgress, dpr } = config;
      const headerHeight = 48;

      ctx.clearRect(0, 0, width * dpr, height * dpr);
      ctx.save();
      ctx.scale(dpr, dpr);

      const barPadding = 6;
      const barHeight = rowHeight - barPadding * 2;
      const barRadius = 4;

      for (const task of tasks) {
        const rowIndex = taskRowMap.get(task.id);
        if (rowIndex === undefined) continue;

        const y = headerHeight + rowIndex * rowHeight - scrollY;
        // Row-level culling
        if (y + rowHeight < headerHeight || y > height) continue;

        const x = timeToX(task.start, startHour, hourWidth) - scrollX;
        const xEnd = timeToX(task.end, startHour, hourWidth) - scrollX;
        const w = xEnd - x;

        // Horizontal culling
        if (x + w < 0 || x > width) continue;

        const taskColor = task.color || theme.blue500;
        const barY = y + barPadding;

        // ── Time window (dashed border behind bar) ──
        if (task.windowStart !== undefined && task.windowEnd !== undefined) {
          const winX = timeToX(task.windowStart, startHour, hourWidth) - scrollX;
          const winXEnd = timeToX(task.windowEnd, startHour, hourWidth) - scrollX;
          const winW = winXEnd - winX;

          ctx.fillStyle = hexToRgba(taskColor, 0.08);
          roundRect(ctx, winX, barY, winW, barHeight, barRadius);
          ctx.fill();

          ctx.strokeStyle = hexToRgba(taskColor, 0.3);
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          roundRect(ctx, winX, barY, winW, barHeight, barRadius);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // ── Bar body ──
        ctx.fillStyle = taskColor;
        roundRect(ctx, x, barY, w, barHeight, barRadius);
        ctx.fill();

        // ── Progress fill ──
        if (showProgress && task.progress !== undefined && task.progress > 0) {
          const progressWidth = w * Math.min(task.progress, 100) / 100;
          ctx.fillStyle = darkenColor(taskColor, 0.2);
          // Clip to bar shape
          ctx.save();
          roundRect(ctx, x, barY, w, barHeight, barRadius);
          ctx.clip();
          ctx.fillRect(x, barY, progressWidth, barHeight);
          ctx.restore();
        }

        // ── Hover glow ──
        if (hoveredTaskId === task.id) {
          ctx.shadowColor = hexToRgba(taskColor, 0.5);
          ctx.shadowBlur = 10;
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          roundRect(ctx, x, barY, w, barHeight, barRadius);
          ctx.stroke();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }

        // ── Text label ──
        if (w > 36) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = fontBase;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const label = truncateText(ctx, task.label, w - 10);
          if (label) {
            ctx.fillText(label, x + 5, barY + barHeight / 2);
          }
        }
      }

      // ── Group summary bars (collapsed groups show span line) ──
      for (let i = 0; i < flatRows.length; i++) {
        const row = flatRows[i];
        if (row.type !== 'group' || row.isExpanded) continue;

        // Find time span of all tasks in this group
        const groupId = row.groupId!;
        let minStart = Infinity;
        let maxEnd = -Infinity;
        for (const task of tasks) {
          if (task.groupId === groupId) {
            if (task.start < minStart) minStart = task.start;
            if (task.end > maxEnd) maxEnd = task.end;
          }
        }

        if (minStart === Infinity) continue;

        const y = headerHeight + i * rowHeight - scrollY;
        if (y + rowHeight < headerHeight || y > height) continue;

        const x = timeToX(minStart, startHour, hourWidth) - scrollX;
        const xEnd = timeToX(maxEnd, startHour, hourWidth) - scrollX;
        const w = xEnd - x;

        if (x + w < 0 || x > width) continue;

        // Diamond + thin line summary
        const midY = y + rowHeight / 2;
        const color = row.color || theme.primary;

        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        // Start diamond
        ctx.beginPath();
        ctx.moveTo(x, midY - 4);
        ctx.lineTo(x + 4, midY);
        ctx.lineTo(x, midY + 4);
        ctx.lineTo(x - 4, midY);
        ctx.closePath();
        ctx.fill();

        // End diamond
        ctx.beginPath();
        ctx.moveTo(x + w, midY - 4);
        ctx.lineTo(x + w + 4, midY);
        ctx.lineTo(x + w, midY + 4);
        ctx.lineTo(x + w - 4, midY);
        ctx.closePath();
        ctx.fill();

        // Connecting line
        ctx.beginPath();
        ctx.moveTo(x, midY);
        ctx.lineTo(x + w, midY);
        ctx.stroke();
      }

      ctx.restore();
    },
    [theme]
  );

  // ─── Layer 2: Dependency Lines + Share Links ────────────────────
  const drawLinesLayer = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      viewport: CanvasViewport,
      config: RendererConfig,
      tasks: GanttTask[],
      taskRowMap: Map<string, number>,
      dependencies: GanttDependency[],
      links: GanttLink[]
    ) => {
      const { width, height, scrollX, scrollY } = viewport;
      const { rowHeight, startHour, hourWidth, dpr } = config;
      const headerHeight = 48;

      ctx.clearRect(0, 0, width * dpr, height * dpr);
      ctx.save();
      ctx.scale(dpr, dpr);

      const taskMap = new Map<string, GanttTask>();
      for (const t of tasks) taskMap.set(t.id, t);

      // ── Dependencies ──
      for (const dep of dependencies) {
        const fromTask = taskMap.get(dep.from);
        const toTask = taskMap.get(dep.to);
        if (!fromTask || !toTask) continue;

        const fromRow = taskRowMap.get(dep.from);
        const toRow = taskRowMap.get(dep.to);
        if (fromRow === undefined || toRow === undefined) continue;

        // Culling
        const fromY = headerHeight + fromRow * rowHeight - scrollY + rowHeight / 2;
        const toY = headerHeight + toRow * rowHeight - scrollY + rowHeight / 2;
        if (Math.max(fromY, toY) < headerHeight && Math.min(fromY, toY) > height) continue;

        // Determine anchor points based on dependency type
        let fromX: number, toX: number;
        switch (dep.type) {
          case 'SS':
            fromX = timeToX(fromTask.start, startHour, hourWidth) - scrollX;
            toX = timeToX(toTask.start, startHour, hourWidth) - scrollX;
            break;
          case 'FF':
            fromX = timeToX(fromTask.end, startHour, hourWidth) - scrollX;
            toX = timeToX(toTask.end, startHour, hourWidth) - scrollX;
            break;
          case 'SF':
            fromX = timeToX(fromTask.start, startHour, hourWidth) - scrollX;
            toX = timeToX(toTask.end, startHour, hourWidth) - scrollX;
            break;
          case 'FS':
          default:
            fromX = timeToX(fromTask.end, startHour, hourWidth) - scrollX;
            toX = timeToX(toTask.start, startHour, hourWidth) - scrollX;
            break;
        }

        const lineColor = dep.color || theme.primary;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);

        // Draw polyline path
        const midX = fromX + (toX - fromX) / 2;
        ctx.beginPath();
        if (fromRow === toRow) {
          const offsetY = fromY + (toX >= fromX ? rowHeight * 0.3 : -rowHeight * 0.3);
          ctx.moveTo(fromX, offsetY);
          ctx.lineTo(toX, offsetY);
        } else {
          ctx.moveTo(fromX, fromY);
          ctx.lineTo(midX, fromY);
          ctx.lineTo(midX, toY);
          ctx.lineTo(toX, toY);
        }
        ctx.stroke();

        // Arrow head
        const arrowSize = 6;
        const arrowDir = toX >= midX ? 1 : -1;
        const arrowY = fromRow === toRow
          ? fromY + (toX >= fromX ? rowHeight * 0.3 : -rowHeight * 0.3)
          : toY;
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.moveTo(toX, arrowY);
        ctx.lineTo(toX - arrowDir * arrowSize, arrowY - arrowSize / 2);
        ctx.lineTo(toX - arrowDir * arrowSize, arrowY + arrowSize / 2);
        ctx.closePath();
        ctx.fill();

        // Label badge
        const labelText = dep.label || dep.type;
        const lagText = dep.lag ? `${dep.lag > 0 ? '+' : ''}${dep.lag}h` : '';
        const fullLabel = lagText ? `${labelText} ${lagText}` : labelText;

        ctx.font = '600 9px Inter, sans-serif';
        const labelW = ctx.measureText(fullLabel).width + 10;
        const labelH = 16;
        const labelMidX = fromRow === toRow ? (fromX + toX) / 2 : midX;
        const labelMidY = fromRow === toRow
          ? arrowY - labelH / 2 - 4
          : toY + (fromY < toY ? -rowHeight * 0.25 : rowHeight * 0.25) - labelH / 2;

        // Badge background
        ctx.fillStyle = 'rgba(8,42,92,0.85)';
        roundRect(ctx, labelMidX - labelW / 2, labelMidY, labelW, labelH, 8);
        ctx.fill();

        // Badge text
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fullLabel, labelMidX, labelMidY + labelH / 2);
      }

      // ── Share Links (arc lines) ──
      for (const link of links) {
        if (link.taskIds.length < 2) continue;

        const linkColor = link.color || '#722ed1';
        ctx.strokeStyle = linkColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(link.style === 'dashed' ? [6, 4] : []);

        for (let i = 0; i < link.taskIds.length - 1; i++) {
          const taskA = taskMap.get(link.taskIds[i]);
          const taskB = taskMap.get(link.taskIds[i + 1]);
          if (!taskA || !taskB) continue;

          const rowA = taskRowMap.get(link.taskIds[i]);
          const rowB = taskRowMap.get(link.taskIds[i + 1]);
          if (rowA === undefined || rowB === undefined) continue;

          const ax = timeToX((taskA.start + taskA.end) / 2, startHour, hourWidth) - scrollX;
          const ay = headerHeight + rowA * rowHeight - scrollY + rowHeight / 2;
          const bx = timeToX((taskB.start + taskB.end) / 2, startHour, hourWidth) - scrollX;
          const by = headerHeight + rowB * rowHeight - scrollY + rowHeight / 2;

          // Quadratic bezier arc
          const cpX = Math.max(ax, bx) + 30;
          const cpY = (ay + by) / 2;

          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo(cpX, cpY, bx, by);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      ctx.restore();
    },
    [theme]
  );

  return { drawGridLayer, drawBarsLayer, drawLinesLayer };
}
