/**
 * WxbGanttChart — Utility Functions
 */
import { GanttTask, ThemeColors } from './types';

/** Read CSS variable from :root */
export function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Read all WXB theme colors */
export function readThemeColors(): ThemeColors {
  return {
    primary: getCssVar('--wx-blue-700') || '#0B3D7F',
    primaryHover: getCssVar('--wx-blue-800') || '#0A3470',
    success: getCssVar('--wx-green-500') || '#2E9D6E',
    warning: getCssVar('--wx-amber-500') || '#E8B53C',
    danger: getCssVar('--wx-red-500') || '#D6493A',
    ink: getCssVar('--wx-ink') || '#0F1B2D',
    fg2: getCssVar('--wx-fg-2') || '#3A4A5C',
    fg3: getCssVar('--wx-fg-3') || '#5A6B7E',
    fg4: getCssVar('--wx-fg-4') || '#8898A8',
    border: getCssVar('--wx-border') || '#E4EAF1',
    divider: getCssVar('--wx-divider') || '#EEF2F7',
    surface1: getCssVar('--wx-surface-1') || '#FAFCFE',
    surface2: getCssVar('--wx-surface-2') || '#F5F8FB',
    surface3: getCssVar('--wx-surface-3') || '#EDF1F6',
    bg: getCssVar('--wx-bg') || '#FFFFFF',
    blue500: getCssVar('--wx-blue-500') || '#1F6FEB',
    blue400: getCssVar('--wx-blue-400') || '#5A93F0',
    blue300: getCssVar('--wx-blue-300') || '#9DBEF5',
    blue100: getCssVar('--wx-blue-100') || '#E6F2FB',
    green500: getCssVar('--wx-green-500') || '#2E9D6E',
    green300: getCssVar('--wx-green-300') || '#A3D9BF',
    amber500: getCssVar('--wx-amber-500') || '#E8B53C',
  };
}

/** Convert hours offset to pixel X */
export function timeToX(hour: number, startHour: number, hourWidth: number): number {
  return (hour - startHour) * hourWidth;
}

/** Convert pixel X to hours offset */
export function xToTime(x: number, startHour: number, hourWidth: number): number {
  return x / hourWidth + startHour;
}

/** Compute time range from tasks */
export function computeTimeRange(tasks: GanttTask[]): { startHour: number; endHour: number } {
  if (tasks.length === 0) return { startHour: 0, endHour: 24 * 7 };
  let min = Infinity;
  let max = -Infinity;
  for (const task of tasks) {
    const s = task.windowStart !== undefined ? Math.min(task.start, task.windowStart) : task.start;
    const e = task.windowEnd !== undefined ? Math.max(task.end, task.windowEnd) : task.end;
    if (s < min) min = s;
    if (e > max) max = e;
  }
  // Pad to full days
  const startDay = Math.floor(min / 24);
  const endDay = Math.ceil(max / 24);
  return { startHour: startDay * 24, endHour: Math.max(endDay * 24, startDay * 24 + 24) };
}

/** Draw a rounded rect on canvas context */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Truncate text to fit width */
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

/** Darken a hex color by a factor (0-1) */
export function darkenColor(hex: string, factor: number): string {
  const c = hex.replace('#', '');
  const r = Math.max(0, Math.round(parseInt(c.slice(0, 2), 16) * (1 - factor)));
  const g = Math.max(0, Math.round(parseInt(c.slice(2, 4), 16) * (1 - factor)));
  const b = Math.max(0, Math.round(parseInt(c.slice(4, 6), 16) * (1 - factor)));
  return `rgb(${r},${g},${b})`;
}

/** Convert hex to rgba */
export function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Clamp number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
