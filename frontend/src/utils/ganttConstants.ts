/**
 * 甘特图统一常量
 * 基于 Fluent Design System 规范
 */

import { fluentDesignTokens } from '../styles/fluentDesignTokens';

/**
 * 行高 - 统一的行高常量（像素）
 * 所有甘特图组件必须使用此常量，禁止硬编码
 */
export const GANTT_ROW_HEIGHT = fluentDesignTokens.gantt.rowHeight;

/**
 * 基础日期宽度（像素）
 */
export const GANTT_BASE_DAY_WIDTH = 120;

/**
 * 基础每小时宽度（像素）
 */
export const GANTT_BASE_HOUR_WIDTH = 8;

/**
 * 左侧面板宽度（像素）
 */
export const GANTT_LEFT_PANEL_WIDTH = fluentDesignTokens.gantt.leftPanelWidth;

/**
 * 最小日期列宽度（像素）
 */
export const GANTT_MIN_DAY_WIDTH = fluentDesignTokens.gantt.minDayWidth;

/**
 * 计算行的Y坐标
 * @param rowIndex 行索引（从0开始）
 * @returns Y坐标（像素）
 */
export const getRowTop = (rowIndex: number): number => {
  return rowIndex * GANTT_ROW_HEIGHT;
};

/**
 * 计算行的中心Y坐标
 * @param rowIndex 行索引（从0开始）
 * @returns 中心Y坐标（像素）
 */
export const getRowCenterY = (rowIndex: number): number => {
  return rowIndex * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2;
};

/**
 * 计算行的底部Y坐标
 * @param rowIndex 行索引（从0开始）
 * @returns 底部Y坐标（像素）
 */
export const getRowBottom = (rowIndex: number): number => {
  return (rowIndex + 1) * GANTT_ROW_HEIGHT;
};

/**
 * 根据Y坐标计算行索引
 * @param y Y坐标（像素）
 * @returns 行索引（从0开始）
 */
export const getRowIndexFromY = (y: number): number => {
  return Math.floor(y / GANTT_ROW_HEIGHT);
};

/**
 * 计算总高度
 * @param rowCount 行数
 * @returns 总高度（像素）
 */
export const getTotalHeight = (rowCount: number): number => {
  return rowCount * GANTT_ROW_HEIGHT;
};

/**
 * 计算可视区域的行范围
 * @param scrollTop 滚动位置（像素）
 * @param viewportHeight 可视区域高度（像素）
 * @returns 可视行的起始和结束索引（包含结束索引）
 */
export const getVisibleRowRange = (
  scrollTop: number,
  viewportHeight: number,
): { startIndex: number; endIndex: number } => {
  const startIndex = Math.max(0, Math.floor(scrollTop / GANTT_ROW_HEIGHT));
  const endIndex = Math.ceil((scrollTop + viewportHeight) / GANTT_ROW_HEIGHT);
  return { startIndex, endIndex };
};

