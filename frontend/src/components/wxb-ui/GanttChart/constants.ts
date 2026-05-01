/**
 * WxbGanttChart v2 — Constants
 * Aligned with wxb-theme.css design tokens
 */
import type { GanttTheme } from './types';

// ===== Theme Colors =====
export const THEME: GanttTheme = {
  primary:      '#0B3D7F',
  primaryHover: '#0A3470',
  success:      '#2E9D6E',
  warning:      '#E8B53C',
  danger:       '#D6493A',
  ink:          '#0F1B2D',
  fg2:          '#3A4A5C',
  fg3:          '#5A6B7E',
  fg4:          '#8898A8',
  border:       '#E4EAF1',
  divider:      '#EEF2F7',
  surface1:     '#FAFCFE',
  surface2:     '#F5F8FB',
  surface3:     '#EDF1F6',
  bg:           '#FFFFFF',
  blue500:      '#1F6FEB',
  blue400:      '#5A93F0',
  blue300:      '#9DBEF5',
  blue100:      '#E6F2FB',
  green500:     '#2E9D6E',
  green300:     '#A3D9BF',
  amber500:     '#E8B53C',
  red500:       '#D6493A',
};

// ===== Stage Colors (5-color rotation) =====
export const STAGE_COLORS = [
  '#0B3D7F', '#2E9D6E', '#3AA8C1', '#E8B53C', '#D6493A',
  '#722ed1', '#1F6FEB', '#5A6B7E',
];

// ===== Dimensions =====
export const ROW_HEIGHT = 32;
export const HEADER_HEIGHT = 48;       // Time axis header
export const HEATMAP_HEIGHT = 16;      // Personnel heatmap bar
export const BAR_HEIGHT = 24;          // Task bar height
export const STAGE_BAR_HEIGHT = 20;    // Stage bar (narrower)
export const BAR_RADIUS = 6;           // Task bar corner radius
export const STAGE_BAR_RADIUS = 4;
export const SIDEBAR_WIDTH = 200;
export const TOOLBAR_HEIGHT = 40;
export const ARROW_SIZE = 9;           // Dependency arrow triangle
export const LABEL_CAPSULE_HEIGHT = 18;
export const LABEL_CAPSULE_RADIUS = 9;

// ===== Zoom =====
export const DEFAULT_DAY_WIDTH = 120;
export const MIN_DAY_WIDTH = 40;
export const MAX_DAY_WIDTH = 600;
export const ZOOM_SENSITIVITY = 0.002;

// ===== Drag =====
export const SNAP_HOURS = 0.25;        // 15-minute snap
export const DRAG_THRESHOLD = 5;       // px before drag starts
export const MAX_UNDO = 10;

// ===== Constraint line styles =====
export const DEP_STYLES: Record<string, { color: string; dash: number[] }> = {
  FS: { color: '#1890ff', dash: [] },
  SS: { color: '#52c41a', dash: [6, 4] },
  FF: { color: '#faad14', dash: [4, 4] },
  SF: { color: '#722ed1', dash: [12, 4] },
};

// ===== Share link colors =====
export const SHARE_COLORS = {
  SAME_TEAM:  '#1890ff',
  DIFFERENT:  '#fa8c16',
};

// ===== Fonts =====
export const FONT_SANS = '"Inter", "PingFang SC", "Source Han Sans SC", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", "SF Mono", monospace';
