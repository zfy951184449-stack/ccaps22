/**
 * Fluent Design System Global CSS
 * 注入全局样式到应用中
 */

import { fluentDesignTokens } from './fluentDesignTokens';

// 创建样式元素并注入到文档中
const styleId = 'fluent-design-global-styles';
let styleElement = document.getElementById(styleId) as HTMLStyleElement;

if (!styleElement) {
  styleElement = document.createElement('style');
  styleElement.id = styleId;
  document.head.appendChild(styleElement);
}

styleElement.textContent = `
  /* Fluent Design System Global Styles */
  
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

