/**
 * WxbGanttChart v2 — Pure Utility Functions
 */
import type { CollapsedTimeInterval, GanttTask, GanttTimeScale } from './types';

/**
 * Convert hours offset to pixel X position
 */
export function hourToX(hour: number, startHour: number, hourWidth: number): number {
  return (hour - startHour) * hourWidth;
}

/**
 * Convert pixel X to hours offset
 */
export function xToHour(x: number, startHour: number, hourWidth: number): number {
  return x / hourWidth + startHour;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aEnd > bStart && aStart < bEnd;
}

function isOperationTask(task: GanttTask): boolean {
  return task.type !== 'stage' && task.type !== 'timeWindow';
}

function buildCollapsedNightIntervals(
  startHour: number,
  endHour: number,
  tasks: GanttTask[],
): CollapsedTimeInterval[] {
  const intervals: CollapsedTimeInterval[] = [];
  const firstDay = Math.floor(startHour / 24) - 1;
  const lastDay = Math.ceil(endHour / 24);
  const operationTasks = tasks.filter(isOperationTask);

  for (let day = firstDay; day <= lastDay; day++) {
    const nightStart = day * 24 + 21;
    const nightEnd = (day + 1) * 24 + 9;
    const clippedStart = Math.max(nightStart, startHour);
    const clippedEnd = Math.min(nightEnd, endHour);
    if (clippedEnd <= clippedStart) continue;

    const hasOperation = operationTasks.some(task =>
      rangesOverlap(task.start, task.end, clippedStart, clippedEnd)
    );
    if (!hasOperation) {
      intervals.push({ start: clippedStart, end: clippedEnd, kind: 'night' });
    }
  }

  return intervals;
}

/**
 * Build a horizontal time scale. When collapseEmptyNightShifts is true, empty
 * night shifts are removed from the x-axis while task hours remain unchanged.
 */
export function buildGanttTimeScale(
  startHour: number,
  endHour: number,
  hourWidth: number,
  options?: { collapseEmptyNightShifts?: boolean; tasks?: GanttTask[] },
): GanttTimeScale {
  const collapsedIntervals = options?.collapseEmptyNightShifts
    ? buildCollapsedNightIntervals(startHour, endHour, options.tasks ?? [])
    : [];

  const collapsedBefore = (hour: number): number => {
    const boundedHour = Math.max(startHour, Math.min(hour, endHour));
    let total = 0;
    for (const interval of collapsedIntervals) {
      if (boundedHour <= interval.start) continue;
      total += Math.max(0, Math.min(boundedHour, interval.end) - interval.start);
    }
    return total;
  };

  const isHourCollapsed = (hour: number): boolean =>
    collapsedIntervals.some(interval => hour >= interval.start && hour < interval.end);

  const hourToVisibleHours = (hour: number): number => {
    const boundedHour = Math.max(startHour, Math.min(hour, endHour));
    return boundedHour - startHour - collapsedBefore(boundedHour);
  };

  const hourToScaledX = (hour: number): number => hourToVisibleHours(hour) * hourWidth;

  const xToScaledHour = (x: number): number => {
    const visibleHours = Math.max(0, x / hourWidth);
    let hiddenSoFar = 0;
    for (const interval of collapsedIntervals) {
      const intervalVisibleStart = interval.start - startHour - hiddenSoFar;
      if (visibleHours <= intervalVisibleStart) {
        return Math.max(startHour, Math.min(startHour + visibleHours + hiddenSoFar, endHour));
      }
      hiddenSoFar += interval.end - interval.start;
    }
    return Math.max(startHour, Math.min(startHour + visibleHours + hiddenSoFar, endHour));
  };

  const widthBetween = (rangeStart: number, rangeEnd: number): number => {
    const from = Math.min(rangeStart, rangeEnd);
    const to = Math.max(rangeStart, rangeEnd);
    return Math.abs(hourToScaledX(to) - hourToScaledX(from));
  };

  const totalVisibleHours = endHour - startHour - collapsedIntervals.reduce(
    (sum, interval) => sum + interval.end - interval.start,
    0,
  );

  return {
    startHour,
    endHour,
    hourWidth,
    totalWidth: Math.max(0, totalVisibleHours * hourWidth),
    collapsedIntervals,
    hourToX: hourToScaledX,
    xToHour: xToScaledHour,
    widthBetween,
    isHourCollapsed,
    isRangeVisible: (rangeStart, rangeEnd) => widthBetween(rangeStart, rangeEnd) > 0.5,
    pixelDeltaToHourDelta: (originHour, deltaX) =>
      xToScaledHour(hourToScaledX(originHour) + deltaX) - originHour,
  };
}

/**
 * Snap hour value to nearest grid interval
 */
export function snapHour(hour: number, snapInterval: number): number {
  return Math.round(hour / snapInterval) * snapInterval;
}

/**
 * Check if a day number is a weekend (Saturday=6, Sunday=0)
 * Assuming day 0 starts from a known date; simplified: every 7th day pattern
 */
export function isWeekend(dayIndex: number, startDayOfWeek: number): boolean {
  const dow = (startDayOfWeek + dayIndex) % 7;
  return dow === 0 || dow === 6;
}

/**
 * Draw a rounded rectangle on canvas
 */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number | [number, number, number, number]
): void {
  if (w <= 0 || h <= 0) return;
  let tl: number, tr: number, br: number, bl: number;
  if (typeof r === 'number') {
    tl = tr = br = bl = Math.min(r, w / 2, h / 2);
  } else {
    tl = Math.min(r[0], w / 2, h / 2);
    tr = Math.min(r[1], w / 2, h / 2);
    br = Math.min(r[2], w / 2, h / 2);
    bl = Math.min(r[3], w / 2, h / 2);
  }
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/**
 * Convert hex color to rgba string
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Darken a hex color by percentage
 */
export function darken(hex: string, percent: number): string {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - percent)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - percent)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - percent)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Truncate text to fit within a given pixel width
 */
export function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.length > 0 ? truncated + '…' : '';
}

/**
 * Get heatmap color based on peak ratio
 */
export function getHeatColor(peak: number, minPeak: number, maxPeak: number): string {
  if (peak === 0) return 'transparent';
  if (maxPeak === minPeak) return 'rgba(52, 211, 153, 0.6)';
  const ratio = (peak - minPeak) / (maxPeak - minPeak);
  if (ratio < 0.25) return 'rgba(52, 211, 153, 0.6)';  // green
  if (ratio < 0.50) return 'rgba(251, 191, 36, 0.6)';   // yellow
  if (ratio < 0.75) return 'rgba(251, 146, 60, 0.7)';   // orange
  return 'rgba(239, 68, 68, 0.8)';                       // red
}

/**
 * Get dependency anchor points based on type
 */
export function getAnchorType(type: string): { from: 'start' | 'end'; to: 'start' | 'end' } {
  switch (type) {
    case 'SS': return { from: 'start', to: 'start' };
    case 'FF': return { from: 'end', to: 'end' };
    case 'SF': return { from: 'start', to: 'end' };
    case 'FS':
    default:   return { from: 'end', to: 'start' };
  }
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Format hour offset to "Day N HH:MM" string
 */
export function formatHour(hour: number): string {
  const totalMinutes = Math.round(hour * 60);
  const day = Math.floor(totalMinutes / (24 * 60));
  const minuteOfDay = totalMinutes - day * 24 * 60;
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `Day ${day} ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Get stage color from rotation palette
 */
export function getStageColor(index: number, palette: string[]): string {
  return palette[index % palette.length];
}
