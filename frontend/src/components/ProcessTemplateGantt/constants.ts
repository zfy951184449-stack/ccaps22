export const TOKENS = {
    primary: '#2563EB',
    secondary: '#64748B',
    alert: '#DC2626',
    background: '#F8FAFC',
    card: '#FFFFFF',
    border: '#E5E7EB',
    textPrimary: '#111827',
    textSecondary: '#374151'
} as const;

export const STAGE_COLORS: Record<string, string> = {
    STAGE1: '#2563EB',
    STAGE2: '#0F766E',
    STAGE3: '#D97706',
    STAGE4: '#B91C1C',
    STAGE5: '#7C3AED',
    DEFAULT: '#475569'
};

// 时间轴配置
export const BASE_HOUR_WIDTH = 8; // 基础每小时像素宽度
export const HEADER_HEIGHT = 40; // 树/时间轴表头高度
export const TITLE_BAR_HEIGHT = 64; // 顶部标题区域高度
export const CONTENT_GAP = 16; // 标题区与主视图间距
export const LEFT_PANEL_WIDTH = 360; // 左侧树列宽度
export const ROW_HEIGHT = 36; // 树与甘特行高度统一

export const API_BASE_URL = 'http://localhost:3001/api';
