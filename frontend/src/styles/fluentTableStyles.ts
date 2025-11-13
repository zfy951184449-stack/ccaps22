/**
 * Fluent Design System Table Styles
 * 统一的表格样式增强
 */

import { fluentDesignTokens } from '../styles/fluentDesignTokens';

/**
 * 注入表格样式到全局
 */
export const injectTableStyles = () => {
  const styleId = 'fluent-design-table-styles';
  let styleElement = document.getElementById(styleId) as HTMLStyleElement;

  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = styleId;
    document.head.appendChild(styleElement);
  }

  styleElement.textContent = `
    /* Fluent Design 表格样式 */
    .fluent-table .ant-table {
      border-radius: ${fluentDesignTokens.borderRadius.lg};
      overflow: hidden;
    }

    .fluent-table .ant-table-thead > tr > th {
      background: ${fluentDesignTokens.colors.backgroundAlt};
      font-weight: ${fluentDesignTokens.typography.fontWeight.semibold};
      color: ${fluentDesignTokens.colors.textPrimary};
      border-bottom: 1px solid ${fluentDesignTokens.colors.border};
      padding: ${fluentDesignTokens.spacing.md} ${fluentDesignTokens.spacing.lg};
      transition: background ${fluentDesignTokens.animation.duration.fast} ${fluentDesignTokens.animation.easing.standard};
    }

    .fluent-table .ant-table-thead > tr > th:hover {
      background: ${fluentDesignTokens.colors.backgroundHover};
    }

    .fluent-table .ant-table-tbody > tr {
      transition: background ${fluentDesignTokens.animation.duration.fast} ${fluentDesignTokens.animation.easing.standard};
    }

    .fluent-table .ant-table-tbody > tr:hover {
      background: ${fluentDesignTokens.colors.backgroundHover};
    }

    .fluent-table .ant-table-tbody > tr > td {
      border-bottom: 1px solid ${fluentDesignTokens.colors.border};
      padding: ${fluentDesignTokens.spacing.md} ${fluentDesignTokens.spacing.lg};
    }

    .fluent-table .ant-table-tbody > tr.ant-table-row-selected > td {
      background: ${fluentDesignTokens.colors.accentLight};
    }

    /* Fluent Design 按钮链接样式 */
    .fluent-table .ant-btn-link {
      padding: ${fluentDesignTokens.spacing.xs} ${fluentDesignTokens.spacing.sm};
      border-radius: ${fluentDesignTokens.borderRadius.md};
      transition: all ${fluentDesignTokens.animation.duration.fast} ${fluentDesignTokens.animation.easing.standard};
    }

    .fluent-table .ant-btn-link:hover {
      background: ${fluentDesignTokens.colors.accentLight};
      color: ${fluentDesignTokens.colors.accent};
    }

    /* Fluent Design 卡片样式增强 */
    .fluent-card-enhanced {
      background: ${fluentDesignTokens.colors.background};
      border-radius: ${fluentDesignTokens.borderRadius.lg};
      box-shadow: ${fluentDesignTokens.elevation.level1};
      padding: ${fluentDesignTokens.spacing.lg};
      transition: all ${fluentDesignTokens.animation.duration.standard} ${fluentDesignTokens.animation.easing.standard};
      border: 1px solid ${fluentDesignTokens.colors.border};
    }

    .fluent-card-enhanced:hover {
      box-shadow: ${fluentDesignTokens.elevation.level2};
      border-color: ${fluentDesignTokens.colors.borderHover};
    }

    /* Fluent Design 表单样式 */
    .fluent-form .ant-input,
    .fluent-form .ant-input-number,
    .fluent-form .ant-select-selector {
      border-radius: ${fluentDesignTokens.borderRadius.md};
      border-color: ${fluentDesignTokens.colors.border};
      transition: all ${fluentDesignTokens.animation.duration.fast} ${fluentDesignTokens.animation.easing.standard};
    }

    .fluent-form .ant-input:hover,
    .fluent-form .ant-input-number:hover,
    .fluent-form .ant-select-selector:hover {
      border-color: ${fluentDesignTokens.colors.borderHover};
    }

    .fluent-form .ant-input:focus,
    .fluent-form .ant-input-number:focus,
    .fluent-form .ant-select-focused .ant-select-selector {
      border-color: ${fluentDesignTokens.colors.borderFocus};
      box-shadow: 0 0 0 2px rgba(0, 120, 212, 0.1);
    }

    /* Fluent Design 按钮样式增强 */
    .fluent-btn-primary {
      background: ${fluentDesignTokens.colors.accent};
      border-color: ${fluentDesignTokens.colors.accent};
      border-radius: ${fluentDesignTokens.borderRadius.md};
      font-weight: ${fluentDesignTokens.typography.fontWeight.semibold};
      transition: all ${fluentDesignTokens.animation.duration.fast} ${fluentDesignTokens.animation.easing.standard};
    }

    .fluent-btn-primary:hover {
      background: ${fluentDesignTokens.colors.accentDark};
      border-color: ${fluentDesignTokens.colors.accentDark};
      transform: translateY(-1px);
      box-shadow: ${fluentDesignTokens.elevation.level1};
    }

    .fluent-btn-primary:active {
      transform: translateY(0);
    }

    /* Fluent Design 标签样式 */
    .fluent-tag {
      border-radius: ${fluentDesignTokens.borderRadius.md};
      padding: ${fluentDesignTokens.spacing.xs} ${fluentDesignTokens.spacing.sm};
      font-size: ${fluentDesignTokens.typography.fontSize.bodySmall};
      font-weight: ${fluentDesignTokens.typography.fontWeight.regular};
    }

    /* Fluent Design 徽章样式 */
    .fluent-badge {
      border-radius: ${fluentDesignTokens.borderRadius.md};
    }

    /* Fluent Design 工具提示样式 */
    .fluent-tooltip .ant-tooltip-inner {
      border-radius: ${fluentDesignTokens.borderRadius.md};
      font-size: ${fluentDesignTokens.typography.fontSize.bodySmall};
    }
  `;
};

// 自动注入样式
if (typeof document !== 'undefined') {
  injectTableStyles();
}

