/**
 * WxbGanttChart v2 — Canvas Rendering Engine
 * 5-layer drawing pipeline: Grid → TimeAxis → Connectors → Bars → DragOverlay
 */
import dayjs from 'dayjs';
import type { GanttTask, GanttGroup, GanttDependency, GanttLink, FlatRow, GanttTheme, DragState, GanttTimeScale } from './types';
import {
  THEME, ROW_HEIGHT, HEADER_HEIGHT, HEATMAP_HEIGHT,
  BAR_HEIGHT, STAGE_BAR_HEIGHT, BAR_RADIUS, STAGE_BAR_RADIUS,
  ARROW_SIZE, LABEL_CAPSULE_HEIGHT, LABEL_CAPSULE_RADIUS,
  DEP_STYLES, SHARE_COLORS, FONT_SANS, STAGE_COLORS,
} from './constants';
import {
  hourToX, roundRect, hexToRgba, darken, truncateText,
  getHeatColor, getAnchorType,
} from './ganttUtils';

// ===== Drawing Config =====
export interface DrawConfig {
  startHour: number;
  endHour: number;
  hourWidth: number;
  scrollX: number;
  scrollY: number;
  canvasW: number;
  canvasH: number;
  rowHeight: number;
  showGrid: boolean;
  showToday: boolean;
  showProgress: boolean;
  showHeatmap: boolean;
  hoveredTaskId: string | null;
  selectedTaskIds: Set<string>;
  hoveredRow: number;
  hoveredColX: number;
  expandedDay: number | null;
  todayHour: number | null;
  viewMode: string;
  dpr: number;
  timeScale?: GanttTimeScale;
  /** Real calendar date represented by hour 0. Without it, labels stay relative Day N. */
  timelineOriginDate?: string;
  /** Task IDs in the same share-group transitive component as hovered task */
  hoveredShareTaskIds?: Set<string>;
  /** Color of the hovered share component */
  hoveredShareColor?: string;
  /** Per-task share component color map: taskId → color */
  shareColorMap?: Map<string, string>;
}

function scaledX(hour: number, cfg: DrawConfig): number {
  return (cfg.timeScale ? cfg.timeScale.hourToX(hour) : hourToX(hour, cfg.startHour, cfg.hourWidth)) - cfg.scrollX;
}

function scaledWidth(start: number, end: number, cfg: DrawConfig): number {
  return cfg.timeScale
    ? cfg.timeScale.widthBetween(start, end)
    : Math.abs(end - start) * cfg.hourWidth;
}

function isRangeVisible(start: number, end: number, cfg: DrawConfig): boolean {
  return cfg.timeScale ? cfg.timeScale.isRangeVisible(start, end) : end > start;
}

function getCalendarDateForDay(cfg: DrawConfig, day: number) {
  if (!cfg.timelineOriginDate) return null;
  const origin = dayjs(cfg.timelineOriginDate);
  return origin.isValid() ? origin.add(day, 'day') : null;
}

function formatDayLabel(cfg: DrawConfig, day: number, dayWidth: number): string {
  const date = getCalendarDateForDay(cfg, day);
  if (!date) return `Day ${day}`;
  return dayWidth >= 88 ? date.format('YYYY-MM-DD') : date.format('MM-DD');
}

function formatWeekLabel(cfg: DrawConfig, startDay: number, endDay: number): string {
  const startDate = getCalendarDateForDay(cfg, startDay);
  const endDate = getCalendarDateForDay(cfg, endDay);
  if (!startDate || !endDate) return `Day ${startDay}-${endDay}`;
  return `${startDate.format('YYYY-MM-DD')} - ${endDate.format('MM-DD')}`;
}

function formatExpandedDayLabel(cfg: DrawConfig, day: number): string {
  const date = getCalendarDateForDay(cfg, day);
  return date ? date.format('YYYY-MM-DD') : `Day ${day}`;
}

function formatPeakBadgeLabel(peakData: { peak: number; peakHour: number }, width: number): string {
  const hour = `${Math.floor(peakData.peakHour).toString().padStart(2, '0')}:00`;
  if (width >= 112) return `峰 ${peakData.peak} @ ${hour}`;
  if (width >= 58) return `峰 ${peakData.peak}`;
  return `${peakData.peak}`;
}

function drawPeakBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  peakData: { peak: number; peakHour: number },
  minPeak: number,
  maxPeak: number
): void {
  const label = formatPeakBadgeLabel(peakData, width);
  ctx.font = `600 ${width >= 58 ? 10 : 9}px ${FONT_SANS}`;
  const measured = ctx.measureText(label).width;
  const badgeW = Math.min(Math.max(measured + 12, width >= 58 ? 34 : 22), Math.max(22, width - 8));
  const badgeX = x + Math.max(4, (width - badgeW) / 2);
  const badgeY = y;
  const fill = getHeatColor(peakData.peak, minPeak, maxPeak);

  ctx.fillStyle = fill;
  roundRect(ctx, badgeX, badgeY, badgeW, height, 4);
  ctx.fill();

  ctx.strokeStyle = hexToRgba(THEME.ink, 0.12);
  ctx.lineWidth = 0.8;
  roundRect(ctx, badgeX, badgeY, badgeW, height, 4);
  ctx.stroke();

  ctx.fillStyle = THEME.ink;
  ctx.textAlign = 'center';
  ctx.fillText(label, badgeX + badgeW / 2, badgeY + height - 4);
}

/** Clip rendering to below-header area. Must call ctx.restore() after. */
export function clipBelowHeader(ctx: CanvasRenderingContext2D, cfg: DrawConfig): void {
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, totalHeaderH, cfg.canvasW, cfg.canvasH - totalHeaderH);
  ctx.clip();
}

function colorWithAlpha(color: string | undefined, alpha: number, fallback: string): string {
  if (!color) return fallback;
  const value = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return hexToRgba(value, alpha);
  }

  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const channels = rgbMatch[1].split(',').map(part => part.trim()).slice(0, 3);
    if (channels.length === 3 && channels.every(channel => channel.length > 0)) {
      return `rgba(${channels.join(',')},${alpha})`;
    }
  }

  return fallback;
}

function canvasColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  const value = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(value) || /^rgba?\([^)]+\)$/i.test(value)) {
    return value;
  }
  return fallback;
}

// ===== L0: Grid =====
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  flatRows: FlatRow[]
): void {
  const { startHour, scrollY, canvasW, canvasH, rowHeight, showGrid } = cfg;
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  const startDay = Math.floor(startHour / 24);

  // Row alternating backgrounds
  const firstVisibleRow = Math.floor(scrollY / rowHeight);
  const lastVisibleRow = Math.ceil((scrollY + canvasH - totalHeaderH) / rowHeight);

  for (let r = firstVisibleRow; r <= lastVisibleRow && r < flatRows.length; r++) {
    const y = totalHeaderH + r * rowHeight - scrollY;
    if (y + rowHeight < totalHeaderH || y > canvasH) continue;
    const clippedY = Math.max(totalHeaderH, y);
    const clippedH = Math.min(y + rowHeight, canvasH) - clippedY;
    // Alternating row stripe
    if (r % 2 === 0) {
      ctx.fillStyle = THEME.surface1;
      ctx.fillRect(0, clippedY, canvasW, clippedH);
    }
    // Hover row highlight
    if (r === cfg.hoveredRow) {
      ctx.fillStyle = hexToRgba(THEME.blue100, 0.45);
      ctx.fillRect(0, clippedY, canvasW, clippedH);
    }
  }

  if (!showGrid) return;

  // Day column lines + work-shift zebra backgrounds + hour lines
  const totalDays = Math.ceil((cfg.endHour - startHour) / 24);
  for (let d = 0; d <= totalDays; d++) {
    const dayHour = (startDay + d) * 24;
    const x = scaledX(dayHour, cfg);
    const dayW = scaledWidth(dayHour, dayHour + 24, cfg);
    if (x < -dayW || x > canvasW + dayW) continue;

    // Weekend shading (simplified: d%7 == 5 or 6 for Sat/Sun)
    const calendarDate = getCalendarDateForDay(cfg, startDay + d);
    const dow = calendarDate ? calendarDate.day() : (startDay + d) % 7;
    if (dow === 0 || dow === 6) {
      ctx.fillStyle = hexToRgba(THEME.blue100, 0.35);
      ctx.fillRect(x, totalHeaderH, dayW, canvasH - totalHeaderH);
    }

    // Work-shift zebra backgrounds (matching old GanttTimeline):
    // 工作时段 (09:00-17:00): subtle blue tint
    // 长白时段 (17:00-21:00): subtle amber tint
    if (dayW > 40) {
      // 工作时段 9:00-17:00
      const workStart = dayHour + 9;
      const workEnd = dayHour + 17;
      const workX = scaledX(workStart, cfg);
      const workW = scaledWidth(workStart, workEnd, cfg);
      if (workX + workW > 0 && workX < canvasW) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
        ctx.fillRect(workX, totalHeaderH, workW, canvasH - totalHeaderH);
      }
      // 长白时段 17:00-21:00
      const overtimeStart = dayHour + 17;
      const overtimeEnd = dayHour + 21;
      const overtimeX = scaledX(overtimeStart, cfg);
      const overtimeW = scaledWidth(overtimeStart, overtimeEnd, cfg);
      if (overtimeX + overtimeW > 0 && overtimeX < canvasW) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
        ctx.fillRect(overtimeX, totalHeaderH, overtimeW, canvasH - totalHeaderH);
      }
    }

    // Vertical day line (strong — matches old: 1.5px, #94A3B8)
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, totalHeaderH);
    ctx.lineTo(x, canvasH);
    ctx.stroke();

    // Hour gridlines — always visible (matches old: #E2E8F0, 0.5px)
    for (let h = 1; h < 24; h++) {
      const hour = dayHour + h;
      if (!isRangeVisible(hour, hour + 1, cfg)) continue;
      const hx = scaledX(hour, cfg);
      if (hx < 0 || hx > canvasW) continue;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(hx, totalHeaderH);
      ctx.lineTo(hx, canvasH);
      ctx.stroke();
    }
  }

  if (cfg.timeScale?.collapsedIntervals.length) {
    for (const interval of cfg.timeScale.collapsedIntervals) {
      const x = scaledX(interval.start, cfg);
      if (x < -4 || x > canvasW + 4) continue;
      ctx.fillStyle = hexToRgba(THEME.fg4, 0.10);
      ctx.fillRect(x - 1.5, totalHeaderH, 3, canvasH - totalHeaderH);
      ctx.strokeStyle = hexToRgba(THEME.fg4, 0.28);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, totalHeaderH);
      ctx.lineTo(x, canvasH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Today marker
  if (cfg.showToday && cfg.todayHour !== null && cfg.todayHour !== undefined) {
    const tx = scaledX(cfg.todayHour, cfg);
    if (tx > 0 && tx < canvasW) {
      ctx.strokeStyle = THEME.blue500;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(tx, totalHeaderH);
      ctx.lineTo(tx, canvasH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Hover column vertical indicator
  if (cfg.hoveredColX >= 0) {
    ctx.strokeStyle = hexToRgba(THEME.blue500, 0.3);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(cfg.hoveredColX, totalHeaderH);
    ctx.lineTo(cfg.hoveredColX, canvasH);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ===== L1: Time Axis Header (fixed at top) =====
export function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  peaks?: Map<number, { peak: number; peakHour: number }>
): void {
  const { startHour, canvasW, showHeatmap } = cfg;
  const startDay = Math.floor(startHour / 24);
  const totalDays = Math.ceil((cfg.endHour - startHour) / 24);
  const totalHeaderH = HEADER_HEIGHT + (showHeatmap ? HEATMAP_HEIGHT : 0);
  const nonZeroPeakValues = peaks
    ? Array.from(peaks.values()).map(p => p.peak).filter(p => p > 0)
    : [];
  const minPeak = nonZeroPeakValues.length > 0 ? Math.min(...nonZeroPeakValues) : 0;
  const maxPeak = nonZeroPeakValues.length > 0 ? Math.max(...nonZeroPeakValues) : 1;

  // Header background
  ctx.fillStyle = THEME.surface2;
  ctx.fillRect(0, 0, canvasW, totalHeaderH);
  ctx.strokeStyle = THEME.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, totalHeaderH);
  ctx.lineTo(canvasW, totalHeaderH);
  ctx.stroke();

  // Adaptive day labels based on zoom level
  const dayW = scaledWidth(startDay * 24, (startDay + 1) * 24, cfg);
  const showDayLabels = dayW > 30;  // hide individual day labels when too cramped
  const showHourSubs = dayW > 80;   // hour sub-labels only when space allows

  // Week-level labels for very small zoom
  if (!showDayLabels) {
    // Group days into weeks and draw week labels
      const weekSize = 7;
      for (let w = 0; w < Math.ceil(totalDays / weekSize); w++) {
        const weekStartDay = startDay + w * weekSize;
      const wx = scaledX(weekStartDay * 24, cfg);
      const ww = scaledWidth(weekStartDay * 24, (weekStartDay + weekSize) * 24, cfg);
      if (wx + ww < 0 || wx > canvasW) continue;

      ctx.fillStyle = THEME.ink;
      ctx.font = `600 12px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText(formatWeekLabel(cfg, weekStartDay, weekStartDay + weekSize - 1), wx + ww / 2, 18);

      // Week separator
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx, 0);
      ctx.lineTo(wx, totalHeaderH);
      ctx.stroke();
    }
  } else if (cfg.expandedDay !== null && cfg.expandedDay !== undefined) {
    // ===== Expanded Day Mode (V4 style): entire canvas = 1 day =====
    // startHour/endHour are already overridden to day*24 ~ (day+1)*24
    // dayWidth = canvasW, hourWidth = canvasW/24
    const expDay = cfg.expandedDay;

    // Row 1: Day info bar with navigation controls
    ctx.fillStyle = hexToRgba(THEME.blue100, 0.5);
    ctx.fillRect(0, 0, canvasW, 24);

    // ◀ Back button (left)
    ctx.fillStyle = THEME.primary;
    ctx.font = `500 12px ${FONT_SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText('◀ 返回总览', 8, 16);

    // ◂ Prev arrow
    const centerX = canvasW / 2;
    ctx.fillStyle = THEME.primary;
    ctx.font = `600 16px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('◂', centerX - 80, 16);

    // Day label (center)
    ctx.fillStyle = THEME.ink;
    ctx.font = `700 14px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(formatExpandedDayLabel(cfg, expDay), centerX, 16);

    const peakData = peaks?.get(expDay);
    if (!showHeatmap && peakData && peakData.peak > 0) {
      drawPeakBadge(ctx, centerX + 96, 4, 96, 17, peakData, minPeak, maxPeak);
    }

    // ▸ Next arrow
    ctx.fillStyle = THEME.primary;
    ctx.font = `600 16px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('▸', centerX + 80, 16);

    // Row 2: 24 hour cells filling entire canvas width
    ctx.fillStyle = THEME.surface2;
    ctx.fillRect(0, 24, canvasW, HEADER_HEIGHT - 24);

    const cellW = canvasW / 24;
    for (let h = 0; h < 24; h++) {
      const hx = h * cellW;
      const isWork = h >= 9 && h < 17;
      const isOvertime = h >= 17 && h < 21;

      // Hour cell background for work shifts
      if (isWork) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.05)';
        ctx.fillRect(hx, 24, cellW, HEADER_HEIGHT - 24);
      } else if (isOvertime) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.06)';
        ctx.fillRect(hx, 24, cellW, HEADER_HEIGHT - 24);
      }

      // Hour label
      ctx.fillStyle = isWork ? THEME.primary : THEME.fg4;
      ctx.font = `500 ${cellW > 40 ? 11 : 9}px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${h.toString().padStart(2, '0')}:00`, hx + cellW / 2, 40);

      // Cell separator
      if (h > 0) {
        ctx.strokeStyle = isWork || (h >= 9 && h <= 17) ? hexToRgba(THEME.primary, 0.2) : THEME.border;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(hx, 24);
        ctx.lineTo(hx, HEADER_HEIGHT);
        ctx.stroke();
      }
    }
  } else {
    for (let d = 0; d < totalDays; d++) {
      const dayHour = (startDay + d) * 24;
      const x = scaledX(dayHour, cfg);
      const currentDayW = scaledWidth(dayHour, dayHour + 24, cfg);
      if (x + currentDayW < 0 || x > canvasW) continue;
      const peakData = peaks?.get(startDay + d);
      const showInlinePeak = !showHeatmap && !!peakData && peakData.peak > 0 && currentDayW >= 34;

      // Day label
      ctx.fillStyle = THEME.ink;
      ctx.font = `600 12px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText(formatDayLabel(cfg, startDay + d, dayW), x + currentDayW / 2, showInlinePeak ? 16 : 18);

      // Hour sub-labels: adaptive density based on zoom
      if (showInlinePeak) {
        drawPeakBadge(ctx, x, 25, currentDayW, 17, peakData, minPeak, maxPeak);
      } else if (showHourSubs) {
        ctx.fillStyle = THEME.fg4;
        ctx.font = `400 9px ${FONT_SANS}`;
        ctx.textAlign = 'center';

        let step = 6; // default: 0, 6, 12, 18
        if (dayW > 400) step = 1;      // every hour
        else if (dayW > 200) step = 2; // every 2 hours
        else if (dayW > 120) step = 3; // every 3 hours

        for (let h = 0; h < 24; h += step) {
          const hour = dayHour + h;
          if (!isRangeVisible(hour, hour + 1, cfg)) continue;
          const hx = scaledX(hour, cfg);
          if (hx < 0 || hx > canvasW) continue;
          ctx.fillText(`${h.toString().padStart(2, '0')}`, hx, 34);
        }

        // Hour tick marks in header (small vertical lines at each hour)
        if (dayW > 120) {
          for (let h = 0; h < 24; h++) {
            const hour = dayHour + h;
            if (!isRangeVisible(hour, hour + 1, cfg)) continue;
            const hx = scaledX(hour, cfg);
            if (hx < 0 || hx > canvasW) continue;
            const isLabeled = h % step === 0;
            ctx.strokeStyle = isLabeled ? THEME.border : hexToRgba(THEME.border, 0.5);
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(hx, isLabeled ? 38 : 40);
            ctx.lineTo(hx, HEADER_HEIGHT);
            ctx.stroke();
          }
        }
      }

      if (cfg.timeScale?.collapsedIntervals.length) {
        for (const interval of cfg.timeScale.collapsedIntervals) {
          if (interval.start < dayHour || interval.start >= dayHour + 24) continue;
          const cx = scaledX(interval.start, cfg);
          if (cx < 0 || cx > canvasW) continue;
          ctx.strokeStyle = hexToRgba(THEME.fg4, 0.26);
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(cx, 0);
          ctx.lineTo(cx, totalHeaderH);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Day separator in header
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, totalHeaderH);
      ctx.stroke();
    }
  }

  // Personnel heatmap bar
  if (showHeatmap && peaks && peaks.size > 0) {
    const allPeaks = Array.from(peaks.values()).map(p => p.peak);
    const nonZero = allPeaks.filter(p => p > 0);
    const minP = nonZero.length > 0 ? Math.min(...nonZero) : 0;
    const maxP = nonZero.length > 0 ? Math.max(...nonZero) : 1;

    for (let d = 0; d < totalDays; d++) {
      const dayNum = startDay + d;
      const peakData = peaks.get(dayNum);
      if (!peakData || peakData.peak === 0) continue;

      const x = scaledX(dayNum * 24, cfg);
      const dayW = scaledWidth(dayNum * 24, (dayNum + 1) * 24, cfg);
      if (x + dayW < 0 || x > canvasW) continue;

      const color = getHeatColor(peakData.peak, minP, maxP);
      ctx.fillStyle = color;
      roundRect(ctx, x + 2, HEADER_HEIGHT + 1, dayW - 4, HEATMAP_HEIGHT - 2, 3);
      ctx.fill();

      // Peak number
      ctx.fillStyle = THEME.ink;
      ctx.font = `600 9px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${peakData.peak}`, x + dayW / 2, HEADER_HEIGHT + HEATMAP_HEIGHT - 3);
    }
  }
}

// ===== L2a: Group Summary Bars (1st/2nd level) =====
export function drawGroupBars(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  flatRows: FlatRow[],
  groups: GanttGroup[],
  tasks: GanttTask[],
  taskRowMap: Map<string, number>
): void {
  const { scrollY, canvasW, canvasH, rowHeight } = cfg;
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  const startRow = Math.floor(scrollY / rowHeight);
  const endRow = Math.ceil((scrollY + canvasH - totalHeaderH) / rowHeight);
  const groupById = new Map(groups.map(group => [group.id, group]));

  // Build group → time span map from ALL tasks (not filtered by collapse)
  const groupSpan = new Map<string, { min: number; max: number }>();
  for (const task of tasks) {
    if (!task.groupId) continue;
    const span = groupSpan.get(task.groupId);
    if (span) {
      if (task.start < span.min) span.min = task.start;
      if (task.end > span.max) span.max = task.end;
    } else {
      groupSpan.set(task.groupId, { min: task.start, max: task.end });
    }
  }

  // Propagate spans up through parent groups using FULL groups array
  // (groups is unfiltered, so collapsed children are still present)
  const groupParent = new Map<string, string>();
  for (const g of groups) {
    if (g.parentId) {
      groupParent.set(g.id, g.parentId);
    }
  }
  // Walk each group's span upward to all ancestors
  for (const [groupId, span] of Array.from(groupSpan.entries())) {
    let current = groupId;
    while (groupParent.has(current)) {
      const parentId = groupParent.get(current)!;
      const parentSpan = groupSpan.get(parentId);
      if (parentSpan) {
        if (span.min < parentSpan.min) parentSpan.min = span.min;
        if (span.max > parentSpan.max) parentSpan.max = span.max;
      } else {
        groupSpan.set(parentId, { min: span.min, max: span.max });
      }
      current = parentId;
    }
  }

  // Draw group summary bars — WXB enterprise accent-bar style
  for (let r = 0; r < flatRows.length; r++) {
    const row = flatRows[r];
    if (row.type !== 'group') continue;
    if (r < startRow - 1 || r > endRow + 1) continue;
    const group = groupById.get(row.id);
    if (group?.showSummaryBar === false) continue;

    const span = groupSpan.get(row.id);
    if (!span) continue;

    const x = scaledX(span.min, cfg);
    const w = Math.max(scaledWidth(span.min, span.max, cfg), 4);
    if (x + w < 0 || x > canvasW) continue;

    const y = totalHeaderH + r * rowHeight - scrollY;
    const color = canvasColor(row.color, STAGE_COLORS[row.depth % STAGE_COLORS.length]);
    const barH = BAR_HEIGHT;
    const barR = 4;  // WXB standard radius
    const barY = y + (rowHeight - barH) / 2;
    const isTopLevel = row.depth === 0;
    const isStageGroup = row.groupType === 'stage';
    const isEquipmentGroup = row.groupType === 'equipment';
    const stageBandColor = isStageGroup ? darken(color, 0.08) : color;

    const fillAlpha = isStageGroup
      ? 0.78
      : isEquipmentGroup
        ? 0.16
        : isTopLevel ? 0.16 : 0.09;
    ctx.fillStyle = hexToRgba(stageBandColor, fillAlpha);
    roundRect(ctx, x, barY, w, barH, barR);
    ctx.fill();

    // Left accent border (wxb-badge-bar style: 3px solid left edge)
    ctx.fillStyle = color;
    roundRect(ctx, x, barY, 3, barH, [barR, 0, 0, barR]);
    ctx.fill();

    // Subtle bottom border
    ctx.strokeStyle = hexToRgba(stageBandColor, isStageGroup ? 0.72 : isEquipmentGroup ? 0.24 : 0.25);
    ctx.lineWidth = 1;
    roundRect(ctx, x, barY, w, barH, barR);
    ctx.stroke();

    // Group label — dark text, uppercase tracking (wxb-badge-tracked style)
    if (w > 40) {
      ctx.fillStyle = isStageGroup ? THEME.bg : hexToRgba(color, 0.88);
      ctx.font = `600 ${isTopLevel || isStageGroup ? 10.5 : 10}px ${FONT_SANS}`;
      ctx.textAlign = 'left';
      const label = truncateText(ctx, row.label.toUpperCase(), w - 20);
      ctx.fillText(label, x + 10, barY + barH / 2 + 3.5);
    }
  }
}

// ===== L2b: Task Bars =====
export function drawBars(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  tasks: GanttTask[],
  taskRowMap: Map<string, number>
): void {
  const { scrollY, canvasW, canvasH, rowHeight, showProgress } = cfg;
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  const startRow = Math.floor(scrollY / rowHeight);
  const endRow = Math.ceil((scrollY + canvasH - totalHeaderH) / rowHeight);

  for (const task of tasks) {
    const row = taskRowMap.get(task.id);
    if (row === undefined) continue;
    // Row culling
    if (row < startRow - 1 || row > endRow + 1) continue;

    const x = scaledX(task.start, cfg);
    const w = Math.max(scaledWidth(task.start, task.end, cfg), 4);
    // Column culling
    if (x + w < 0 || x > canvasW) continue;

    const isStage = task.type === 'stage';
    const isTimeWindow = task.type === 'timeWindow';
    const barH = isStage ? STAGE_BAR_HEIGHT : BAR_HEIGHT;
    const barR = 4;  // WXB standard radius
    const y = totalHeaderH + row * rowHeight + (rowHeight - barH) / 2 - scrollY;
    const color = canvasColor(task.color, STAGE_COLORS[0]);
    const stageAccentColor = canvasColor(color, THEME.fg3);
    const shareColor = cfg.shareColorMap?.get(task.id);

    if (isTimeWindow) {
      // Time window: diagonal stripe pattern — unchanged (already distinct)
      ctx.save();
      roundRect(ctx, x, y, w, barH, barR);
      ctx.clip();
      ctx.fillStyle = hexToRgba(color, 0.12);
      ctx.fillRect(x, y, w, barH);
      ctx.strokeStyle = hexToRgba(color, 0.28);
      ctx.lineWidth = 1.5;
      const step = 8;
      for (let sx = x - barH; sx < x + w + barH; sx += step) {
        ctx.beginPath();
        ctx.moveTo(sx, y + barH);
        ctx.lineTo(sx + barH, y);
        ctx.stroke();
      }
      ctx.restore();
      // Hairline border
      ctx.strokeStyle = hexToRgba(color, 0.4);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      roundRect(ctx, x, y, w, barH, barR);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (isStage) {
      // Stage: dark structural band; equipment summary rows stay translucent.
      const stageColor = darken(stageAccentColor, 0.08);
      ctx.fillStyle = hexToRgba(stageColor, 0.86);
      roundRect(ctx, x, y, w, barH, barR);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(stageColor, 0.92);
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, barH, barR);
      ctx.stroke();
      // Left accent
      ctx.fillStyle = THEME.bg;
      roundRect(ctx, x, y, 2.5, barH, [barR, 0, 0, barR]);
      ctx.fill();
      // Stage label
      if (w > 30) {
        ctx.fillStyle = THEME.bg;
        ctx.font = `600 10px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        const label = truncateText(ctx, task.label, w - 12);
        ctx.fillText(label, x + 8, y + barH / 2 + 3);
      }
    } else {
      // ===== WXB Operation Bar: Left-accent + tinted fill =====
      const bodyFill = shareColor
        ? colorWithAlpha(shareColor, 0.22, THEME.surface2)
        : THEME.bg;
      const bodyBorder = shareColor
        ? colorWithAlpha(shareColor, 0.45, THEME.border)
        : THEME.border;

      // --- Window background layer (semi-transparent, behind operation) ---
      if (task.windowStart !== undefined && task.windowEnd !== undefined
        && (task.windowStart !== task.start || task.windowEnd !== task.end)) {
        const wx = scaledX(task.windowStart, cfg);
        const ww = Math.max(scaledWidth(task.windowStart, task.windowEnd, cfg), 4);

        // 1. Solid tinted fill (10% opacity)
        ctx.fillStyle = colorWithAlpha(stageAccentColor, 0.07, THEME.surface2);
        roundRect(ctx, wx, y, ww, barH, barR);
        ctx.fill();

        // 2. Dashed border (20% opacity)
        ctx.save();
        ctx.strokeStyle = colorWithAlpha(stageAccentColor, 0.22, THEME.border);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        roundRect(ctx, wx, y, ww, barH, barR);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Body fill: share component color only. Non-shared tasks stay neutral.
      ctx.fillStyle = bodyFill;
      roundRect(ctx, x, y, w, barH, barR);
      ctx.fill();

      // Left accent remains available for stage/process identity.
      ctx.fillStyle = stageAccentColor;
      roundRect(ctx, x, y, 3, barH, [barR, 0, 0, barR]);
      ctx.fill();

      // Subtle outer border — 1px hairline
      ctx.strokeStyle = bodyBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, barH, barR);
      ctx.stroke();

      // Progress — darker tinted fill, not opaque overlay
      if (showProgress && task.progress && task.progress > 0) {
        const pw = w * Math.min(task.progress, 100) / 100;
        ctx.fillStyle = colorWithAlpha(shareColor || stageAccentColor, 0.22, THEME.surface3);
        roundRect(ctx, x, y, pw, barH, barR);
        ctx.fill();
        // Progress accent line at edge
        const edgeX = x + pw;
        if (pw > 4 && pw < w - 2) {
          ctx.strokeStyle = colorWithAlpha(shareColor || stageAccentColor, 0.5, THEME.border);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(edgeX, y + 2);
          ctx.lineTo(edgeX, y + barH - 2);
          ctx.stroke();
        }
      }

      // Conflict border — WXB alert colors
      if (task.conflictType) {
        const cColors: Record<string, string> = {
          CYCLE: THEME.danger,
          WINDOW: THEME.warning,
          OVERLAP: THEME.danger,
        };
        const cColor = cColors[task.conflictType] || THEME.danger;
        ctx.strokeStyle = cColor;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, w, barH, barR);
        ctx.stroke();
        // Focus ring — wxb style (2px spread, 15% opacity)
        ctx.strokeStyle = hexToRgba(cColor, 0.15);
        ctx.lineWidth = 4;
        roundRect(ctx, x - 1, y - 1, w + 2, barH + 2, barR + 1);
        ctx.stroke();
      }

      // Hover — wxb surface-1 lift + focus ring
      if (task.id === cfg.hoveredTaskId) {
        // Stronger tint on hover
        ctx.fillStyle = colorWithAlpha(shareColor || THEME.blue400, 0.08, hexToRgba(THEME.blue100, 0.35));
        roundRect(ctx, x, y, w, barH, barR);
        ctx.fill();
        // Blue focus ring (wxb-blue-400 with 25% opacity)
        ctx.strokeStyle = hexToRgba(THEME.blue400, 0.5);
        ctx.lineWidth = 2;
        roundRect(ctx, x - 1, y - 1, w + 2, barH + 2, barR + 1);
        ctx.stroke();
      }

      // Selected — wxb-blue-500 focus ring
      if (cfg.selectedTaskIds.has(task.id)) {
        ctx.strokeStyle = 'rgba(31, 111, 235, 0.6)';
        ctx.lineWidth = 2;
        roundRect(ctx, x - 2, y - 2, w + 4, barH + 4, barR + 2);
        ctx.stroke();
      }

      // Label — dark text (wxb-fg-2), not white
      if (w > 30) {
        ctx.fillStyle = THEME.fg2;
        ctx.font = `500 11px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        let labelText = task.label;
        if (task.progress !== undefined && w > 80) {
          labelText += ` ${task.progress}%`;
        }
        const label = truncateText(ctx, labelText, w - 14);
        ctx.fillText(label, x + 8, y + barH / 2 + 4);
      }

      // Share component visual markers — left-side vertical bar + right-upper dot
      if (shareColor && w > 40) {
        // Left vertical color bar (3px wide, inset right of type accent)
        const barInset = 2;
        const sBarX = x + 5; // right of 3px type accent + 2px gap
        const sBarY = y + barInset;
        const sBarH = barH - barInset * 2;
        ctx.fillStyle = hexToRgba(shareColor, 0.85);
        roundRect(ctx, sBarX, sBarY, 3, sBarH, 1.5);
        ctx.fill();

        // Right-upper corner dot
        const dotR = 3;
        const dotX = x + w - 6;
        const dotY = y + 5;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = shareColor;
        ctx.fill();
        ctx.strokeStyle = hexToRgba(shareColor, 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Glow border for hover-linked share component peers
      if (
        cfg.hoveredShareTaskIds?.has(task.id) &&
        task.id !== cfg.hoveredTaskId &&
        cfg.hoveredShareColor
      ) {
        const glowColor = cfg.hoveredShareColor;
        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = hexToRgba(glowColor, 0.55);
        ctx.lineWidth = 2.5;
        roundRect(ctx, x - 1, y - 1, w + 2, barH + 2, barR + 1);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}

// ===== L3: Dependencies =====
export function drawDependencies(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  tasks: GanttTask[],
  taskRowMap: Map<string, number>,
  deps: GanttDependency[]
): void {
  if (deps.length === 0) return;
  const { scrollY, rowHeight } = cfg;
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  for (const dep of deps) {
    const fromTask = taskMap.get(dep.from);
    const toTask = taskMap.get(dep.to);
    if (!fromTask || !toTask) continue;
    const fromRow = taskRowMap.get(dep.from);
    const toRow = taskRowMap.get(dep.to);
    if (fromRow === undefined || toRow === undefined) continue;

    const anchor = getAnchorType(dep.type);
    const fromX = scaledX(anchor.from === 'end' ? fromTask.end : fromTask.start, cfg);
    const toX = scaledX(anchor.to === 'end' ? toTask.end : toTask.start, cfg);
    const fromY = totalHeaderH + fromRow * rowHeight + rowHeight / 2 - scrollY;
    const toY = totalHeaderH + toRow * rowHeight + rowHeight / 2 - scrollY;

    // Style
    const style = DEP_STYLES[dep.type] || DEP_STYLES.FS;
    let strokeColor = dep.color || style.color;
    let lineWidth = 1.5;
    const depArrowSize = ARROW_SIZE - 3;
    const dash = dep.level && dep.level > 1 ? [5, 4] : style.dash;
    if (dep.isConflict) { strokeColor = '#fa8c16'; lineWidth = 2; }
    if (dep.isActive) { strokeColor = '#ff4d4f'; lineWidth = 2.4; }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    ctx.lineCap = 'round';

    // Path
    const sameRow = fromRow === toRow;
    ctx.beginPath();
    if (sameRow) {
      const dir = toX >= fromX ? 1 : -1;
      const oY = fromY + dir * rowHeight * 0.25;
      ctx.moveTo(fromX, oY);
      ctx.lineTo(toX, oY);
    } else {
      const midX = fromX + (toX - fromX) / 2;
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(midX, fromY);
      ctx.lineTo(midX, toY);
      ctx.lineTo(toX, toY);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow
    const arrY = sameRow ? fromY + (toX >= fromX ? 1 : -1) * rowHeight * 0.25 : toY;
    const arrDir = sameRow ? (toX >= fromX ? 1 : -1) : (toX >= (fromX + (toX - fromX) / 2) ? 1 : -1);
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.moveTo(toX, arrY);
    ctx.lineTo(toX - arrDir * depArrowSize, arrY - depArrowSize / 2);
    ctx.lineTo(toX - arrDir * depArrowSize, arrY + depArrowSize / 2);
    ctx.closePath();
    ctx.fill();

    // Label capsule
    const lx = sameRow ? (fromX + toX) / 2 : fromX + (toX - fromX) / 2;
    const ly = sameRow ? arrY : toY + (fromY < toY ? -rowHeight * 0.25 : rowHeight * 0.25);
    const lagText = dep.lag ? `${dep.lag > 0 ? '+' : ''}${dep.lag}h` : '';
    const labelStr = `${dep.type}${lagText ? ' ' + lagText : ''}`;
    ctx.font = `600 9px ${FONT_SANS}`;
    const tw = ctx.measureText(labelStr).width;
    const capsuleW = tw + 16;
    const capsuleBg = dep.isActive ? 'rgba(255,77,79,0.88)'
      : dep.isConflict ? 'rgba(250,140,22,0.88)'
      : 'rgba(8,42,92,0.85)';
    roundRect(ctx, lx - capsuleW / 2, ly - LABEL_CAPSULE_HEIGHT / 2, capsuleW, LABEL_CAPSULE_HEIGHT, LABEL_CAPSULE_RADIUS);
    ctx.fillStyle = capsuleBg;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(labelStr, lx, ly + 3);
  }
}

// ===== L4: Share Group Links =====
export function drawLinks(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  tasks: GanttTask[],
  taskRowMap: Map<string, number>,
  links: GanttLink[],
  highlightedLinkIds?: string[]
): void {
  if (links.length === 0) return;
  const { scrollY, rowHeight } = cfg;
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const hasHighlight = highlightedLinkIds && highlightedLinkIds.length > 0;

  for (const link of links) {
    if (link.taskIds.length < 2) continue;
    const color = link.color || SHARE_COLORS[link.shareMode || 'SAME_TEAM'] || SHARE_COLORS.SAME_TEAM;

    // Highlight logic: emphasized vs dimmed
    const isHighlighted = hasHighlight && highlightedLinkIds!.includes(link.id);
    const opacity = hasHighlight ? (isHighlighted ? 0.78 : 0.08) : 0.45;
    const lineWidth = isHighlighted ? 2.2 : 1.4;
    const linkArrowSize = ARROW_SIZE - 3;

    ctx.globalAlpha = opacity;

    // Draw lines between consecutive pairs
    for (let i = 0; i < link.taskIds.length - 1; i++) {
      const tA = taskMap.get(link.taskIds[i]);
      const tB = taskMap.get(link.taskIds[i + 1]);
      if (!tA || !tB) continue;
      const rA = taskRowMap.get(tA.id);
      const rB = taskRowMap.get(tB.id);
      if (rA === undefined || rB === undefined) continue;

      const axCenter = scaledX((tA.start + tA.end) / 2, cfg);
      const bxCenter = scaledX((tB.start + tB.end) / 2, cfg);
      const ayCenter = totalHeaderH + rA * rowHeight + rowHeight / 2 - scrollY;
      const byCenter = totalHeaderH + rB * rowHeight + rowHeight / 2 - scrollY;

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([4, 4]);
      ctx.lineCap = 'round';

      // Orthogonal path
      const midX = axCenter + (bxCenter - axCenter) / 2;
      ctx.beginPath();
      ctx.moveTo(axCenter, ayCenter);
      ctx.lineTo(midX, ayCenter);
      ctx.lineTo(midX, byCenter);
      ctx.lineTo(bxCenter, byCenter);
      ctx.stroke();
      ctx.setLineDash([]);

      // Double arrows
      const arrDir = bxCenter >= midX ? 1 : -1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(bxCenter, byCenter);
      ctx.lineTo(bxCenter - arrDir * linkArrowSize, byCenter - linkArrowSize / 2);
      ctx.lineTo(bxCenter - arrDir * linkArrowSize, byCenter + linkArrowSize / 2);
      ctx.closePath();
      ctx.fill();

      const arrDir2 = axCenter <= midX ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(axCenter, ayCenter);
      ctx.lineTo(axCenter + arrDir2 * linkArrowSize, ayCenter - linkArrowSize / 2);
      ctx.lineTo(axCenter + arrDir2 * linkArrowSize, ayCenter + linkArrowSize / 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Reset global alpha
  ctx.globalAlpha = 1.0;
}

// ===== L5: Drag Overlay =====

const WARNING_COLORS: Record<DragState['warningLevel'], { fill: string; stroke: string; text: string }> = {
  normal:  { fill: 'rgba(31, 111, 235, 0.2)',  stroke: 'rgba(31, 111, 235, 0.5)',  text: '#3A4A5C' },
  warning: { fill: 'rgba(232, 181, 60, 0.25)', stroke: 'rgba(232, 181, 60, 0.6)',  text: '#9A6A00' },
  danger:  { fill: 'rgba(214, 73, 58, 0.25)',  stroke: 'rgba(214, 73, 58, 0.6)',   text: '#B0352A' },
};

export function drawDragOverlay(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  dragState: DragState | null,
  tasks: GanttTask[],
  taskRowMap: Map<string, number>
): void {
  if (!dragState || !dragState.isDragging) return;

  const { scrollY, canvasH, rowHeight } = cfg;

  // ===== Resize mode: specialized ghost rendering =====
  if (dragState.type === 'resize-start' || dragState.type === 'resize-end') {
    const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
    const orig = dragState.originals.get(dragState.primaryId);
    if (!orig) return;

    const barH = BAR_HEIGHT, barR = BAR_RADIUS;
    const origX = scaledX(orig.start, cfg);
    const origW = scaledWidth(orig.start, orig.end, cfg);
    const y = totalHeaderH + orig.row * rowHeight + (rowHeight - barH) / 2 - scrollY;

    // Skip if out of viewport
    if (y + barH < totalHeaderH || y > canvasH) return;

    // Original position: dashed outline
    ctx.strokeStyle = hexToRgba(dragState.taskColor, 0.3);
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    roundRect(ctx, origX, y, origW, barH, barR);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ghost: stretched/shrunk based on resize direction
    let ghostX = origX, ghostW = origW;
    if (dragState.type === 'resize-start') {
      ghostX = scaledX(orig.start + dragState.deltaHours, cfg);
      ghostW = scaledWidth(orig.start + dragState.deltaHours, orig.end, cfg);
    } else {
      ghostW = scaledWidth(orig.start, orig.end + dragState.deltaHours, cfg);
    }

    // Minimum visual width
    ghostW = Math.max(ghostW, 4);

    const colors = WARNING_COLORS[dragState.warningLevel];

    // Ghost fill
    ctx.fillStyle = colors.fill;
    roundRect(ctx, ghostX, y, ghostW, barH, barR);
    ctx.fill();

    // Ghost border
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 1;
    roundRect(ctx, ghostX, y, ghostW, barH, barR);
    ctx.stroke();

    // Highlight the active resize edge (thick green line)
    const edgeX = dragState.type === 'resize-start' ? ghostX : ghostX + ghostW;
    ctx.strokeStyle = '#2E9D6E';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(edgeX, y - 4);
    ctx.lineTo(edgeX, y + barH + 4);
    ctx.stroke();

    // Delta label above the ghost
    if (Math.abs(dragState.deltaHours) > 0.01) {
      const sign = dragState.deltaHours > 0 ? '+' : '';
      const text = `${sign}${dragState.deltaHours.toFixed(1)}h`;
      ctx.font = `600 10px ${FONT_SANS}`;
      const tw = ctx.measureText(text).width;
      const labelX = edgeX - tw / 2;
      const labelY = y - 10;

      // Badge background
      roundRect(ctx, labelX - 4, labelY - 7, tw + 8, 14, 3);
      ctx.fillStyle = 'rgba(15, 27, 45, 0.85)';
      ctx.fill();

      // Badge text
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, labelX, labelY);
    }

    return; // Don't draw move overlay when resizing
  }
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  const colors = WARNING_COLORS[dragState.warningLevel];

  // 1. Draw time window highlight (single task move only)
  if (!dragState.isGroupDrag && dragState.windowMinHour !== undefined && dragState.windowMaxHour !== undefined) {
    const winX = scaledX(dragState.windowMinHour, cfg);
    const winW = scaledWidth(dragState.windowMinHour, dragState.windowMaxHour, cfg);
    const orig = dragState.originals.get(dragState.primaryId);
    if (orig) {
      const winY = totalHeaderH + orig.row * rowHeight - scrollY;
      // Green highlight zone
      ctx.fillStyle = 'rgba(46, 157, 110, 0.08)';
      ctx.fillRect(winX, winY, winW, rowHeight);
      // Green dashed boundary lines
      ctx.strokeStyle = '#2E9D6E';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(winX, winY);
      ctx.lineTo(winX, winY + rowHeight);
      ctx.moveTo(winX + winW, winY);
      ctx.lineTo(winX + winW, winY + rowHeight);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 2. For each affected task: draw original outline + ghost
  for (const [taskId, orig] of Array.from(dragState.originals)) {
    const barH = BAR_HEIGHT;
    const barR = BAR_RADIUS;
    const origX = scaledX(orig.start, cfg);
    const origW = scaledWidth(orig.start, orig.end, cfg);
    const origY = totalHeaderH + orig.row * rowHeight + (rowHeight - barH) / 2 - scrollY;

    // Skip if out of viewport
    if (origY + barH < totalHeaderH || origY > canvasH) continue;

    // Original position: dashed outline
    ctx.strokeStyle = hexToRgba(dragState.taskColor, 0.3);
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    roundRect(ctx, origX, origY, origW, barH, barR);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ghost position: semi-transparent bar
    const ghostX = scaledX(orig.start + dragState.deltaHours, cfg);

    // Ghost fill
    ctx.fillStyle = colors.fill;
    roundRect(ctx, ghostX, origY, origW, barH, barR);
    ctx.fill();

    // Ghost left accent
    ctx.fillStyle = colors.stroke;
    roundRect(ctx, ghostX, origY, 3, barH, [barR, 0, 0, barR]);
    ctx.fill();

    // Ghost border
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 1;
    roundRect(ctx, ghostX, origY, origW, barH, barR);
    ctx.stroke();

    // Ghost label (only for primary)
    if (taskId === dragState.primaryId && origW > 40) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        ctx.fillStyle = colors.text;
        ctx.font = `500 10px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const label = truncateText(ctx, task.label, origW - 12);
        ctx.fillText(label, ghostX + 8, origY + barH / 2);
      }
    }
  }

  // 3. Time tooltip near mouse position
  // (We don't have mouse position in the render call, so show delta on the primary ghost)
  if (dragState.isGroupDrag || dragState.affectedTaskIds.length > 1) {
    const orig = dragState.originals.get(dragState.primaryId) || dragState.originals.values().next().value;
    if (orig) {
      const tooltipX = scaledX(orig.start + dragState.deltaHours, cfg);
      const tooltipY = totalHeaderH + orig.row * rowHeight - scrollY - 4;
      const sign = dragState.deltaHours >= 0 ? '+' : '';
      const count = dragState.affectedTaskIds.length;

      let text: string;
      if (dragState.warningLevel === 'danger') {
        text = `[!] 大范围偏移！${sign}${dragState.deltaHours.toFixed(1)}h · ${count} 个任务`;
      } else if (dragState.warningLevel === 'warning') {
        text = `将移动 ${count} 个任务 ${sign}${dragState.deltaHours.toFixed(1)}h`;
      } else {
        text = `移动 ${count} 个任务 ${sign}${dragState.deltaHours.toFixed(1)}h`;
      }

      ctx.font = `600 10px ${FONT_SANS}`;
      const tw = ctx.measureText(text).width;
      const px = 8, py = 3;
      const bgColor = dragState.warningLevel === 'danger' ? 'rgba(214, 73, 58, 0.9)'
                    : dragState.warningLevel === 'warning' ? 'rgba(154, 106, 0, 0.9)'
                    : 'rgba(15, 27, 45, 0.88)';

      roundRect(ctx, tooltipX, tooltipY - py * 2 - 12, tw + px * 2, 16 + py, 4);
      ctx.fillStyle = bgColor;
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, tooltipX + px, tooltipY - 8);
    }
  }
}
