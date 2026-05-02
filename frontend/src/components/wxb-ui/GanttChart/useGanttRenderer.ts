/**
 * WxbGanttChart v2 — Canvas Rendering Engine
 * 5-layer drawing pipeline: Grid → TimeAxis → Bars → Dependencies → Links
 */
import type { GanttTask, GanttGroup, GanttDependency, GanttLink, FlatRow, GanttTheme } from './types';
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
  selectedTaskId: string | null;
  hoveredRow: number;
  hoveredColX: number;
  expandedDay: number | null;
  todayHour: number | null;
  viewMode: string;
  dpr: number;
}

/** Clip rendering to below-header area. Must call ctx.restore() after. */
export function clipBelowHeader(ctx: CanvasRenderingContext2D, cfg: DrawConfig): void {
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, totalHeaderH, cfg.canvasW, cfg.canvasH - totalHeaderH);
  ctx.clip();
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
    const x = hourToX(dayHour, startHour, hourWidth) - scrollX;
    const dayW = hourWidth * 24;
    if (x < -dayW || x > canvasW + dayW) continue;

    // Weekend shading (simplified: d%7 == 5 or 6 for Sat/Sun)
    const dow = (startDay + d) % 7;
    if (dow === 0 || dow === 6) {
      ctx.fillStyle = hexToRgba(THEME.blue100, 0.35);
      ctx.fillRect(x, totalHeaderH, dayW, canvasH - totalHeaderH);
    }

    // Work-shift zebra backgrounds (matching old GanttTimeline):
    // 工作时段 (09:00-17:00): subtle blue tint
    // 长白时段 (17:00-21:00): subtle amber tint
    if (dayW > 40) {
      // 工作时段 9:00-17:00
      const workX = x + 9 * hourWidth;
      const workW = 8 * hourWidth;
      if (workX + workW > 0 && workX < canvasW) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
        ctx.fillRect(workX, totalHeaderH, workW, canvasH - totalHeaderH);
      }
      // 长白时段 17:00-21:00
      const overtimeX = x + 17 * hourWidth;
      const overtimeW = 4 * hourWidth;
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
      const hx = x + h * hourWidth;
      if (hx < 0 || hx > canvasW) continue;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(hx, totalHeaderH);
      ctx.lineTo(hx, canvasH);
      ctx.stroke();
    }
  }

  // Today marker
  if (cfg.showToday && cfg.todayHour !== null && cfg.todayHour !== undefined) {
    const tx = hourToX(cfg.todayHour, startHour, hourWidth) - scrollX;
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

  // Adaptive day labels based on zoom level
  const dayW = hourWidth * 24;
  const showDayLabels = dayW > 30;  // hide individual day labels when too cramped
  const showHourSubs = dayW > 80;   // hour sub-labels only when space allows

  // Week-level labels for very small zoom
  if (!showDayLabels) {
    // Group days into weeks and draw week labels
    const weekSize = 7;
    for (let w = 0; w < Math.ceil(totalDays / weekSize); w++) {
      const weekStartDay = startDay + w * weekSize;
      const wx = hourToX(weekStartDay * 24, startHour, hourWidth) - scrollX;
      const ww = dayW * weekSize;
      if (wx + ww < 0 || wx > canvasW) continue;

      ctx.fillStyle = THEME.ink;
      ctx.font = `600 12px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText(`Day ${weekStartDay}-${weekStartDay + weekSize - 1}`, wx + ww / 2, 18);

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
    ctx.fillText(`Day ${expDay}`, centerX, 16);

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
      const x = hourToX(dayHour, startHour, hourWidth) - scrollX;
      if (x + dayW < 0 || x > canvasW) continue;

      // Day label
      ctx.fillStyle = THEME.ink;
      ctx.font = `600 12px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText(`Day ${startDay + d}`, x + dayW / 2, 18);

      // Hour sub-labels: adaptive density based on zoom
      if (showHourSubs) {
        ctx.fillStyle = THEME.fg4;
        ctx.font = `400 9px ${FONT_SANS}`;
        ctx.textAlign = 'center';

        let step = 6; // default: 0, 6, 12, 18
        if (dayW > 400) step = 1;      // every hour
        else if (dayW > 200) step = 2; // every 2 hours
        else if (dayW > 120) step = 3; // every 3 hours

        for (let h = 0; h < 24; h += step) {
          const hx = x + h * hourWidth;
          if (hx < 0 || hx > canvasW) continue;
          ctx.fillText(`${h.toString().padStart(2, '0')}`, hx, 34);
        }

        // Hour tick marks in header (small vertical lines at each hour)
        if (dayW > 120) {
          for (let h = 0; h < 24; h++) {
            const hx = x + h * hourWidth;
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

// ===== L2a: Group Summary Bars (1st/2nd level) =====
export function drawGroupBars(
  ctx: CanvasRenderingContext2D,
  cfg: DrawConfig,
  flatRows: FlatRow[],
  groups: GanttGroup[],
  tasks: GanttTask[],
  taskRowMap: Map<string, number>
): void {
  const { startHour, hourWidth, scrollX, scrollY, canvasW, canvasH, rowHeight } = cfg;
  const totalHeaderH = HEADER_HEIGHT + (cfg.showHeatmap ? HEATMAP_HEIGHT : 0);
  const startRow = Math.floor(scrollY / rowHeight);
  const endRow = Math.ceil((scrollY + canvasH - totalHeaderH) / rowHeight);

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

    const span = groupSpan.get(row.id);
    if (!span) continue;

    const x = hourToX(span.min, startHour, hourWidth) - scrollX;
    const w = Math.max((span.max - span.min) * hourWidth, 4);
    if (x + w < 0 || x > canvasW) continue;

    const y = totalHeaderH + r * rowHeight - scrollY;
    const color = row.color || STAGE_COLORS[row.depth % STAGE_COLORS.length];
    const barH = BAR_HEIGHT;
    const barR = 4;  // WXB standard radius
    const barY = y + (rowHeight - barH) / 2;
    const isTopLevel = row.depth === 0;

    // Flat tinted fill — low opacity, enterprise feel
    const fillAlpha = isTopLevel ? 0.10 : 0.07;
    ctx.fillStyle = hexToRgba(color, fillAlpha);
    roundRect(ctx, x, barY, w, barH, barR);
    ctx.fill();

    // Left accent border (wxb-badge-bar style: 3px solid left edge)
    ctx.fillStyle = color;
    roundRect(ctx, x, barY, 3, barH, [barR, 0, 0, barR]);
    ctx.fill();

    // Subtle bottom border
    ctx.strokeStyle = hexToRgba(color, 0.25);
    ctx.lineWidth = 1;
    roundRect(ctx, x, barY, w, barH, barR);
    ctx.stroke();

    // Group label — dark text, uppercase tracking (wxb-badge-tracked style)
    if (w > 40) {
      ctx.fillStyle = hexToRgba(color, 0.85);
      ctx.font = `600 ${isTopLevel ? 10.5 : 10}px ${FONT_SANS}`;
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
    const barR = 4;  // WXB standard radius
    const y = totalHeaderH + row * rowHeight + (rowHeight - barH) / 2 - scrollY;
    const color = task.color || STAGE_COLORS[0];

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
      // Stage: subtle tinted fill + solid thin border
      ctx.fillStyle = hexToRgba(color, 0.06);
      roundRect(ctx, x, y, w, barH, barR);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(color, 0.35);
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, barH, barR);
      ctx.stroke();
      // Left accent
      ctx.fillStyle = hexToRgba(color, 0.5);
      roundRect(ctx, x, y, 2.5, barH, [barR, 0, 0, barR]);
      ctx.fill();
      // Stage label
      if (w > 30) {
        ctx.fillStyle = hexToRgba(color, 0.75);
        ctx.font = `500 10px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        const label = truncateText(ctx, task.label, w - 12);
        ctx.fillText(label, x + 8, y + barH / 2 + 3);
      }
    } else {
      // ===== WXB Operation Bar: Left-accent + tinted fill =====
      // Background fill — tinted, not solid
      ctx.fillStyle = hexToRgba(color, 0.14);
      roundRect(ctx, x, y, w, barH, barR);
      ctx.fill();

      // Left accent border — 3px solid (wxb-badge-bar signature)
      ctx.fillStyle = color;
      roundRect(ctx, x, y, 3, barH, [barR, 0, 0, barR]);
      ctx.fill();

      // Subtle outer border — 1px hairline
      ctx.strokeStyle = hexToRgba(color, 0.3);
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, barH, barR);
      ctx.stroke();

      // Progress — darker tinted fill, not opaque overlay
      if (showProgress && task.progress && task.progress > 0) {
        const pw = w * Math.min(task.progress, 100) / 100;
        ctx.fillStyle = hexToRgba(color, 0.22);
        roundRect(ctx, x, y, pw, barH, barR);
        ctx.fill();
        // Progress accent line at edge
        const edgeX = x + pw;
        if (pw > 4 && pw < w - 2) {
          ctx.strokeStyle = hexToRgba(color, 0.5);
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
          OVERLAP: THEME.blue500,
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
        ctx.fillStyle = hexToRgba(color, 0.08);
        roundRect(ctx, x, y, w, barH, barR);
        ctx.fill();
        // Blue focus ring (wxb-blue-400 with 25% opacity)
        ctx.strokeStyle = hexToRgba(THEME.blue400, 0.5);
        ctx.lineWidth = 2;
        roundRect(ctx, x - 1, y - 1, w + 2, barH + 2, barR + 1);
        ctx.stroke();
      }

      // Selected — wxb-blue-500 focus ring
      if (task.id === cfg.selectedTaskId) {
        ctx.strokeStyle = THEME.blue500;
        ctx.lineWidth = 2;
        roundRect(ctx, x - 1, y - 1, w + 2, barH + 2, barR + 1);
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

      // Share group badges — rendered after label, right-aligned
      if (task.shareGroups && task.shareGroups.length > 0 && w > 50) {
        const badgeH = 14;
        const badgeR = 7;
        const badgeGap = 3;
        let bx = x + w - 4; // start from right edge
        ctx.font = `600 8px ${FONT_SANS}`;
        ctx.textAlign = 'center';
        // Draw badges right-to-left
        for (let gi = task.shareGroups.length - 1; gi >= 0; gi--) {
          const sg = task.shareGroups[gi];
          const tw = ctx.measureText(sg.label).width;
          const bw = tw + 10;
          bx -= bw;
          if (bx < x + 20) break; // don't overlap label
          const by = y + (barH - badgeH) / 2;
          // Badge background
          ctx.fillStyle = hexToRgba(sg.color, 0.18);
          roundRect(ctx, bx, by, bw, badgeH, badgeR);
          ctx.fill();
          // Badge border
          ctx.strokeStyle = hexToRgba(sg.color, 0.5);
          ctx.lineWidth = 1;
          roundRect(ctx, bx, by, bw, badgeH, badgeR);
          ctx.stroke();
          // Badge text
          ctx.fillStyle = sg.color;
          ctx.fillText(sg.label, bx + bw / 2, by + badgeH / 2 + 3);
          bx -= badgeGap;
        }
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
