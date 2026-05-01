/**
 * WxbGanttChart v2 — Pure Utility Functions
 */

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
  const day = Math.floor(hour / 24);
  const h = Math.floor(hour % 24);
  const m = Math.round((hour % 1) * 60);
  return `Day ${day} ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Get stage color from rotation palette
 */
export function getStageColor(index: number, palette: string[]): string {
  return palette[index % palette.length];
}
