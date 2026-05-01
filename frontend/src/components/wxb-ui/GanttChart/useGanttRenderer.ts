/**
 * WxbGanttChart v2 — Canvas Rendering Engine
 * 5-layer drawing pipeline: Grid → TimeAxis → Bars → Dependencies → Links
 */
import type { GanttTask, GanttDependency, GanttLink, FlatRow, GanttTheme } from './types';
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
interface DrawConfig {
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
  selectedTaskId: string | null;
  expandedDay: number | null;
  dpr: number;
}

// ===== L0: Grid =====
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  flatRows: FlatRow[]
): void {
  const { startHour, hourWidth, scrollX, scrollY, canvasW, canvasH, rowHeight, showGrid } = cfg;
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  const startDay = Math.floor(startHour / 24);

  // Row alternating backgrounds
  const firstVisibleRow = Math.floor(scrollY / rowHeight);
  const lastVisibleRow = Math.ceil((scrollY + canvasH - totalHeaderH) / rowHeight);

  for (let r = firstVisibleRow; r <= lastVisibleRow && r < flatRows.length; r++) {
    const y = totalHeaderH + r * rowHeight - scrollY;
    if (y + rowHeight < totalHeaderH || y > canvasH) continue;
    if (r % 2 === 0) {
      ctx.fillStyle = THEME.surface1;
      ctx.fillRect(0, Math.max(totalHeaderH, y), canvasW, rowHeight);
    }
  }

  if (!showGrid) return;

  // Day column lines + weekend shading
  const totalDays = Math.ceil((cfg.endHour - startHour) / 24);
  for (let d = 0; d <= totalDays; d++) {
    const dayHour = (startDay + d) * 24;
    const x = hourToX(dayHour, startHour, hourWidth) - scrollX;
    if (x < -hourWidth * 24 || x > canvasW + hourWidth * 24) continue;

    // Weekend shading (simplified: d%7 == 5 or 6 for Sat/Sun)
    const dow = (startDay + d) % 7;
    if (dow === 0 || dow === 6) {
      const dayW = hourWidth * 24;
      ctx.fillStyle = hexToRgba(THEME.blue100, 0.35);
      ctx.fillRect(x, totalHeaderH, dayW, canvasH - totalHeaderH);
    }

    // Vertical day line
    ctx.strokeStyle = THEME.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, totalHeaderH);
    ctx.lineTo(x, canvasH);
    ctx.stroke();

    // 6-hour sub-lines
    if (hourWidth * 24 > 80) {
      for (const h of [6, 12, 18]) {
        const sx = x + h * hourWidth;
        if (sx < 0 || sx > canvasW) continue;
        ctx.strokeStyle = hexToRgba(THEME.divider, 0.4);
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, totalHeaderH);
        ctx.lineTo(sx, canvasH);
        ctx.stroke();
      }
    }
  }

  // Today marker
  if (cfg.showToday) {
    const now = new Date();
    const todayHour = Math.floor(now.getTime() / 3600000); // approx
    // Simple: draw at center if visible
    const tx = hourToX(todayHour, startHour, hourWidth) - scrollX;
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
}

// ===== L1: Time Axis Header (fixed at top) =====
export function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  peaks?: Map<number, { peak: number; peakHour: number }>
): void {
  const { startHour, hourWidth, scrollX, canvasW, showHeatmap } = cfg;
  const startDay = Math.floor(startHour / 24);
  const totalDays = Math.ceil((cfg.endHour - startHour) / 24);
  const totalHeaderH = HEADER_HEIGHT + (showHeatmap ? HEATMAP_HEIGHT : 0);

  // Header background
  ctx.fillStyle = THEME.surface2;
  ctx.fillRect(0, 0, canvasW, totalHeaderH);
  ctx.strokeStyle = THEME.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, totalHeaderH);
  ctx.lineTo(canvasW, totalHeaderH);
  ctx.stroke();

  // Day labels
  for (let d = 0; d < totalDays; d++) {
    const dayHour = (startDay + d) * 24;
    const x = hourToX(dayHour, startHour, hourWidth) - scrollX;
    const dayW = hourWidth * 24;
    if (x + dayW < 0 || x > canvasW) continue;

    // Day label
    ctx.fillStyle = THEME.ink;
    ctx.font = `600 12px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(`Day ${startDay + d}`, x + dayW / 2, 18);

    // Hour sub-labels
    if (dayW > 80) {
      ctx.fillStyle = THEME.fg4;
      ctx.font = `400 9px ${FONT_SANS}`;
      for (const h of [0, 6, 12, 18]) {
        const hx = x + h * hourWidth;
        if (hx < 0 || hx > canvasW) continue;
        ctx.fillText(`${h.toString().padStart(2, '0')}`, hx, 34);
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

      const x = hourToX(dayNum * 24, startHour, hourWidth) - scrollX;
      const dayW = hourWidth * 24;
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

// ===== L2: Task Bars =====
export function drawBars(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  tasks: GanttTask[],
  taskRowMap: Map<string, number>
): void {
  const { startHour, hourWidth, scrollX, scrollY, canvasW, canvasH, rowHeight, showProgress } = cfg;
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  const startRow = Math.floor(scrollY / rowHeight);
  const endRow = Math.ceil((scrollY + canvasH - totalHeaderH) / rowHeight);

  for (const task of tasks) {
    const row = taskRowMap.get(task.id);
    if (row === undefined) continue;
    // Row culling
    if (row < startRow - 1 || row > endRow + 1) continue;

    const x = hourToX(task.start, startHour, hourWidth) - scrollX;
    const w = Math.max((task.end - task.start) * hourWidth, 4);
    // Column culling
    if (x + w < 0 || x > canvasW) continue;

    const isStage = task.type === 'stage';
    const isTimeWindow = task.type === 'timeWindow';
    const barH = isStage ? STAGE_BAR_HEIGHT : BAR_HEIGHT;
    const barR = isStage ? STAGE_BAR_RADIUS : BAR_RADIUS;
    const y = totalHeaderH + row * rowHeight + (rowHeight - barH) / 2 - scrollY;
    const color = task.color || STAGE_COLORS[0];

    if (isTimeWindow) {
      // Diagonal stripe pattern
      ctx.save();
      roundRect(ctx, x, y, w, barH, barR);
      ctx.clip();
      // Base fill
      ctx.fillStyle = hexToRgba(color, 0.15);
      ctx.fillRect(x, y, w, barH);
      // Stripes
      ctx.strokeStyle = hexToRgba(color, 0.35);
      ctx.lineWidth = 2;
      const step = 8;
      for (let sx = x - barH; sx < x + w + barH; sx += step) {
        ctx.beginPath();
        ctx.moveTo(sx, y + barH);
        ctx.lineTo(sx + barH, y);
        ctx.stroke();
      }
      ctx.restore();
      // Dashed border
      ctx.strokeStyle = hexToRgba(color, 0.6);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      roundRect(ctx, x, y, w, barH, barR);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (isStage) {
      // Stage: glass fill + dashed border
      ctx.fillStyle = hexToRgba(color, 0.08);
      roundRect(ctx, x, y, w, barH, barR);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      roundRect(ctx, x, y, w, barH, barR);
      ctx.stroke();
      ctx.setLineDash([]);
      // Stage label (colored)
      if (w > 30) {
        ctx.fillStyle = color;
        ctx.font = `500 10px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        const label = truncateText(ctx, task.label, w - 8);
        ctx.fillText(label, x + 4, y + barH / 2 + 3);
      }
    } else {
      // Operation: solid bar
      roundRect(ctx, x, y, w, barH, barR);
      ctx.fillStyle = color;
      ctx.fill();
      // Inset highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y, w, 1);

      // Progress
      if (showProgress && task.progress && task.progress > 0) {
        const pw = w * Math.min(task.progress, 100) / 100;
        roundRect(ctx, x, y, pw, barH, barR);
        ctx.fillStyle = darken(color, 0.2);
        ctx.fill();
      }

      // Conflict border
      if (task.conflictType) {
        const cColors = { CYCLE: '#ff4d4f', WINDOW: '#fa8c16', OVERLAP: '#1890ff' };
        ctx.strokeStyle = cColors[task.conflictType];
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, w, barH, barR);
        ctx.stroke();
        // Glow ring
        ctx.strokeStyle = hexToRgba(cColors[task.conflictType], 0.35);
        ctx.lineWidth = 4;
        roundRect(ctx, x - 1, y - 1, w + 2, barH + 2, barR + 1);
        ctx.stroke();
      }

      // Hover highlight
      if (task.id === cfg.hoveredTaskId) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, w, barH, barR);
        ctx.stroke();
        // Shadow glow
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 8;
        roundRect(ctx, x, y, w, barH, barR);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Selected
      if (task.id === cfg.selectedTaskId) {
        ctx.strokeStyle = THEME.blue500;
        ctx.lineWidth = 2;
        roundRect(ctx, x - 1, y - 1, w + 2, barH + 2, barR + 1);
        ctx.stroke();
      }

      // Label
      if (w > 30) {
        ctx.fillStyle = '#fff';
        ctx.font = `500 11px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        let labelText = task.label;
        if (task.progress !== undefined && w > 80) {
          labelText += ` ${task.progress}%`;
        }
        const label = truncateText(ctx, labelText, w - 8);
        ctx.fillText(label, x + 4, y + barH / 2 + 4);
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
  const { startHour, hourWidth, scrollX, scrollY, canvasH, rowHeight } = cfg;
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
    const fromX = hourToX(
      anchor.from === 'end' ? fromTask.end : fromTask.start,
      startHour, hourWidth
    ) - scrollX;
    const toX = hourToX(
      anchor.to === 'end' ? toTask.end : toTask.start,
      startHour, hourWidth
    ) - scrollX;
    const fromY = totalHeaderH + fromRow * rowHeight + rowHeight / 2 - scrollY;
    const toY = totalHeaderH + toRow * rowHeight + rowHeight / 2 - scrollY;

    // Style
    const style = DEP_STYLES[dep.type] || DEP_STYLES.FS;
    let strokeColor = dep.color || style.color;
    let lineWidth = 2.5;
    const dash = dep.level && dep.level > 1 ? [5, 4] : style.dash;
    if (dep.isConflict) { strokeColor = '#fa8c16'; lineWidth = 3; }
    if (dep.isActive) { strokeColor = '#ff4d4f'; lineWidth = 3.6; }

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
    ctx.lineTo(toX - arrDir * ARROW_SIZE, arrY - ARROW_SIZE / 2);
    ctx.lineTo(toX - arrDir * ARROW_SIZE, arrY + ARROW_SIZE / 2);
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
  links: GanttLink[]
): void {
  if (links.length === 0) return;
  const { startHour, hourWidth, scrollX, scrollY, rowHeight } = cfg;
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  for (const link of links) {
    if (link.taskIds.length < 2) continue;
    const color = link.color || SHARE_COLORS[link.shareMode || 'SAME_TEAM'] || SHARE_COLORS.SAME_TEAM;

    // Draw lines between consecutive pairs
    for (let i = 0; i < link.taskIds.length - 1; i++) {
      const tA = taskMap.get(link.taskIds[i]);
      const tB = taskMap.get(link.taskIds[i + 1]);
      if (!tA || !tB) continue;
      const rA = taskRowMap.get(tA.id);
      const rB = taskRowMap.get(tB.id);
      if (rA === undefined || rB === undefined) continue;

      const axCenter = hourToX((tA.start + tA.end) / 2, startHour, hourWidth) - scrollX;
      const bxCenter = hourToX((tB.start + tB.end) / 2, startHour, hourWidth) - scrollX;
      const ayCenter = totalHeaderH + rA * rowHeight + rowHeight / 2 - scrollY;
      const byCenter = totalHeaderH + rB * rowHeight + rowHeight / 2 - scrollY;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
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
      ctx.lineTo(bxCenter - arrDir * ARROW_SIZE, byCenter - ARROW_SIZE / 2);
      ctx.lineTo(bxCenter - arrDir * ARROW_SIZE, byCenter + ARROW_SIZE / 2);
      ctx.closePath();
      ctx.fill();

      const arrDir2 = axCenter <= midX ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(axCenter, ayCenter);
      ctx.lineTo(axCenter + arrDir2 * ARROW_SIZE, ayCenter - ARROW_SIZE / 2);
      ctx.lineTo(axCenter + arrDir2 * ARROW_SIZE, ayCenter + ARROW_SIZE / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
}
