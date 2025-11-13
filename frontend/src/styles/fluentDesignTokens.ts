/**
 * Fluent Design System Design Tokens
 * 基于微软 Fluent Design System 的设计变量
 */

export const fluentDesignTokens = {
  colors: {
    // 主色调（Accent Color）
    accent: '#0078D4', // Fluent Blue
    accentLight: '#E8F4F8',
    accentLighter: '#C7E0F0',
    accentDark: '#005A9E',
    accentDarker: '#004578',

    // 背景色
    background: '#FFFFFF',
    backgroundAlt: '#FAFAFA',
    backgroundHover: '#F5F5F5',
    backgroundSelected: '#EDEBE9',

    // 文本色
    textPrimary: '#323130',
    textSecondary: '#605E5C',
    textDisabled: '#A19F9D',
    textBrand: '#0078D4',

    // 边框色
    border: '#EDEBE9',
    borderHover: '#C8C6C4',
    borderFocus: '#0078D4',

    // 语义色
    success: '#107C10',
    warning: '#FFAA44',
    error: '#D13438',
    info: '#0078D4',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    xxl: '24px',
    xxxl: '32px',
    huge: '40px',
    massive: '48px',
  },
  borderRadius: {
    sm: '2px', // Fluent标准
    md: '4px',
    lg: '8px',
  },
  elevation: {
    level1: '0 1px 2px rgba(0, 0, 0, 0.05)', // 2dp - 卡片基础
    level2: '0 2px 4px rgba(0, 0, 0, 0.08)', // 4dp - 卡片悬停
    level3: '0 4px 8px rgba(0, 0, 0, 0.12)', // 8dp - 浮层
    level4: '0 8px 16px rgba(0, 0, 0, 0.16)', // 16dp - 模态框
    level5: '0 12px 24px rgba(0, 0, 0, 0.20)', // 24dp - 抽屉
  },
  animation: {
    easing: {
      standard: 'cubic-bezier(0.8, 0, 0.2, 1)', // Fluent标准曲线
      decelerate: 'cubic-bezier(0, 0, 0.2, 1)', // 进入动画
      accelerate: 'cubic-bezier(0.4, 0, 1, 1)', // 退出动画
    },
    duration: {
      fast: '100ms', // 快速反馈
      standard: '200ms', // 标准过渡
      complex: '300ms', // 复杂动画
    },
  },
  typography: {
    fontFamily: {
      en: 'Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
      zh: 'Microsoft YaHei UI, Microsoft YaHei, PingFang SC, Hiragino Sans GB, sans-serif',
      mono: 'Consolas, Monaco, Courier New, monospace',
    },
    fontSize: {
      display: '42px',
      titleLarge: '28px',
      title: '20px',
      subtitle: '18px',
      bodyLarge: '16px',
      body: '14px',
      bodySmall: '12px',
      caption: '11px',
    },
    lineHeight: {
      display: '52px',
      titleLarge: '36px',
      title: '28px',
      subtitle: '24px',
      bodyLarge: '22px',
      body: '20px',
      bodySmall: '16px',
      caption: '16px',
    },
    fontWeight: {
      regular: 400,
      semibold: 600,
      bold: 700,
    },
  },
  // 甘特图专用常量
  gantt: {
    rowHeight: 36, // 统一行高（px）
    leftPanelWidth: 360, // 左侧树列宽度（px）
    minDayWidth: 80, // 最小日期列宽度（px）
    baseHourWidth: 8, // 基础每小时像素宽度
  },
} as const;

// 导出类型
export type FluentDesignTokens = typeof fluentDesignTokens;

