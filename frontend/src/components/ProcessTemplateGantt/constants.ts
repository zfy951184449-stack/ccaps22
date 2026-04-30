export const TOKENS = {
    primary: '#0B3D7F',
    secondary: '#5A6B7E',
    alert: '#D6493A',
    background: '#F5F8FB',
    card: '#FFFFFF',
    border: '#E4EAF1',
    divider: '#EEF2F7',
    surface: '#FAFCFE',
    infoBg: '#E6F2FB',
    success: '#2E9D6E',
    warning: '#E8B53C',
    textPrimary: '#0F1B2D',
    textSecondary: '#3A4A5C',
    textMuted: '#8898A8'
} as const;

export const STAGE_COLORS: Record<string, string> = {
    STAGE1: '#0B3D7F',
    STAGE2: '#2E9D6E',
    STAGE3: '#3AA8C1',
    STAGE4: '#E8B53C',
    STAGE5: '#D6493A',
    DEFAULT: '#5A6B7E'
};

// 时间轴配置
export const BASE_HOUR_WIDTH = 8; // 基础每小时像素宽度
export const HEADER_HEIGHT = 40; // 树/时间轴表头高度
export const TITLE_BAR_HEIGHT = 64; // 顶部标题区域高度
export const CONTENT_GAP = 16; // 标题区与主视图间距
export const LEFT_PANEL_WIDTH = 360; // 左侧树列宽度
export const ROW_HEIGHT = 32; // 树与甘特行高度统一 (36 -> 32)

export const API_BASE_URL = '/api';
