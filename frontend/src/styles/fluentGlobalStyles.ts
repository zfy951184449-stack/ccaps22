/**
 * Fluent Design System Global Styles
 * 基于微软 Fluent Design System 的全局样式
 */

import { fluentDesignTokens } from './fluentDesignTokens';

/**
 * 全局 Fluent Design 样式
 * 应用设计系统的颜色、字体、间距等
 */
export const fluentGlobalStyles = `
  /* 全局字体设置 */
  * {
    box-sizing: border-box;
  }

  body {
    font-family: ${fluentDesignTokens.typography.fontFamily.zh}, ${fluentDesignTokens.typography.fontFamily.en};
    font-size: ${fluentDesignTokens.typography.fontSize.body};
    line-height: ${fluentDesignTokens.typography.lineHeight.body};
    color: ${fluentDesignTokens.colors.textPrimary};
    background-color: ${fluentDesignTokens.colors.backgroundAlt};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Fluent Design 过渡动画 */
  .fluent-transition {
    transition: all ${fluentDesignTokens.animation.duration.standard} ${fluentDesignTokens.animation.easing.standard};
  }

  /* Fluent Design 卡片样式 */
  .fluent-card {
    background: ${fluentDesignTokens.colors.background};
    border-radius: ${fluentDesignTokens.borderRadius.lg};
    box-shadow: ${fluentDesignTokens.elevation.level1};
    padding: ${fluentDesignTokens.spacing.lg};
    transition: box-shadow ${fluentDesignTokens.animation.duration.standard} ${fluentDesignTokens.animation.easing.standard};
  }

  .fluent-card:hover {
    box-shadow: ${fluentDesignTokens.elevation.level2};
  }

  /* Fluent Design 按钮样式 */
  .fluent-button {
    border-radius: ${fluentDesignTokens.borderRadius.md};
    transition: all ${fluentDesignTokens.animation.duration.fast} ${fluentDesignTokens.animation.easing.standard};
    font-weight: ${fluentDesignTokens.typography.fontWeight.semibold};
  }

  .fluent-button:hover {
    transform: translateY(-1px);
    box-shadow: ${fluentDesignTokens.elevation.level1};
  }

  .fluent-button:active {
    transform: translateY(0);
  }

  /* Fluent Design 输入框样式 */
  .fluent-input {
    border-radius: ${fluentDesignTokens.borderRadius.md};
    border-color: ${fluentDesignTokens.colors.border};
    transition: all ${fluentDesignTokens.animation.duration.fast} ${fluentDesignTokens.animation.easing.standard};
  }

  .fluent-input:hover {
    border-color: ${fluentDesignTokens.colors.borderHover};
  }

  .fluent-input:focus {
    border-color: ${fluentDesignTokens.colors.borderFocus};
    box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.1);
  }

  /* Fluent Design 侧边栏样式 */
  .fluent-sidebar {
    background: linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 100%);
    box-shadow: ${fluentDesignTokens.elevation.level3};
  }

  .fluent-sidebar-item {
    border-radius: ${fluentDesignTokens.borderRadius.md};
    margin: ${fluentDesignTokens.spacing.xs} ${fluentDesignTokens.spacing.sm};
    transition: all ${fluentDesignTokens.animation.duration.fast} ${fluentDesignTokens.animation.easing.standard};
  }

  .fluent-sidebar-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .fluent-sidebar-item-selected {
    background: rgba(0, 120, 212, 0.16);
    color: ${fluentDesignTokens.colors.accent};
  }

  .fluent-sidebar-item-selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: ${fluentDesignTokens.colors.accent};
  }

  /* Fluent Design 头部样式 */
  .fluent-header {
    background: ${fluentDesignTokens.colors.background};
    border-bottom: 1px solid ${fluentDesignTokens.colors.border};
    box-shadow: ${fluentDesignTokens.elevation.level1};
  }

  /* Fluent Design 内容区域样式 */
  .fluent-content {
    background: ${fluentDesignTokens.colors.background};
    border-radius: ${fluentDesignTokens.borderRadius.lg};
    padding: ${fluentDesignTokens.spacing.xxl};
    box-shadow: ${fluentDesignTokens.elevation.level1};
  }

  /* Fluent Design 表格样式 */
  .fluent-table {
    border-radius: ${fluentDesignTokens.borderRadius.lg};
    overflow: hidden;
  }

  .fluent-table-header {
    background: ${fluentDesignTokens.colors.backgroundAlt};
    font-weight: ${fluentDesignTokens.typography.fontWeight.semibold};
  }

  .fluent-table-row:hover {
    background: ${fluentDesignTokens.colors.backgroundHover};
  }

  /* Fluent Design 加载状态 */
  .fluent-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: ${fluentDesignTokens.spacing.xxxl};
    color: ${fluentDesignTokens.colors.textSecondary};
  }

  /* Fluent Design 空状态 */
  .fluent-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: ${fluentDesignTokens.spacing.xxxl};
    color: ${fluentDesignTokens.colors.textSecondary};
  }

  /* Fluent Design 错误状态 */
  .fluent-error {
    padding: ${fluentDesignTokens.spacing.lg};
    background: rgba(209, 52, 56, 0.1);
    border: 1px solid ${fluentDesignTokens.colors.error};
    border-radius: ${fluentDesignTokens.borderRadius.md};
    color: ${fluentDesignTokens.colors.error};
  }

  /* Fluent Design 阴影层级 */
  .fluent-elevation-1 {
    box-shadow: ${fluentDesignTokens.elevation.level1};
  }

  .fluent-elevation-2 {
    box-shadow: ${fluentDesignTokens.elevation.level2};
  }

  .fluent-elevation-3 {
    box-shadow: ${fluentDesignTokens.elevation.level3};
  }

  /* Fluent Design 间距工具类 */
  .fluent-spacing-xs { margin: ${fluentDesignTokens.spacing.xs}; }
  .fluent-spacing-sm { margin: ${fluentDesignTokens.spacing.sm}; }
  .fluent-spacing-md { margin: ${fluentDesignTokens.spacing.md}; }
  .fluent-spacing-lg { margin: ${fluentDesignTokens.spacing.lg}; }
  .fluent-spacing-xl { margin: ${fluentDesignTokens.spacing.xl}; }
  .fluent-spacing-xxl { margin: ${fluentDesignTokens.spacing.xxl}; }

  /* Fluent Design 文本样式 */
  .fluent-text-primary {
    color: ${fluentDesignTokens.colors.textPrimary};
  }

  .fluent-text-secondary {
    color: ${fluentDesignTokens.colors.textSecondary};
  }

  .fluent-text-disabled {
    color: ${fluentDesignTokens.colors.textDisabled};
  }

  .fluent-text-brand {
    color: ${fluentDesignTokens.colors.textBrand};
  }

  /* Fluent Design 响应式断点 */
  @media (max-width: 768px) {
    .fluent-content {
      padding: ${fluentDesignTokens.spacing.lg};
    }
  }
`;

