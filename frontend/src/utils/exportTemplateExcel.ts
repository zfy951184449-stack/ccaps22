/**
 * 工艺模版 Excel 导出工具 (ExcelJS 版)
 *
 * 生成包含 3 个 Sheet 的 xlsx 文件：
 * 1. 模版总览 — 全量模版列表, KPI 统计
 * 2. 阶段明细 — 每个模版的阶段 (stage) 数据
 * 3. 工序明细 — 每个阶段下的工序 (operation) 数据, 含资源绑定与约束
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ── Types ──────────────────────────────────────────────────────

export interface TemplateExportSummary {
  id: number;
  template_code: string;
  template_name: string;
  team_id: number | null;
  team_code: string | null;
  team_name: string | null;
  description: string;
  total_days: number;
  stage_count?: number;
  unbound_count?: number;
  constraint_conflict_count?: number;
  invalid_binding_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateExportStage {
  id: number;
  template_id: number;
  template_code: string;
  stage_code: string;
  stage_name: string;
  stage_order: number;
  start_day: number;
  description?: string | null;
  operation_count?: number;
}

export interface TemplateExportOperation {
  id: number;
  template_code: string;
  stage_name: string;
  stage_code: string;
  operation_code: string;
  operation_name: string;
  operation_day: number;
  recommended_time: number;
  standard_time?: number;
  required_people?: number;
  resource_node_name?: string | null;
  binding_status?: string;
  operation_order: number;
}

export interface TemplateExportData {
  templates: TemplateExportSummary[];
  stages: TemplateExportStage[];
  operations: TemplateExportOperation[];
}

// ── Color Constants ────────────────────────────────────────────

const COLORS = {
  // Header / accent
  primaryBlue: '1890FF',
  primaryGreen: '52C41A',
  primaryOrange: 'FA8C16',
  primaryPurple: '722ED1',
  primaryRed: 'FF4D4F',

  // Light backgrounds for KPI cards
  lightBlue: 'E6F4FF',
  lightGreen: 'F6FFED',
  lightOrange: 'FFF7E6',
  lightPurple: 'F9F0FF',
  lightRed: 'FFF1F0',

  // Status backgrounds
  statusBound: 'F6FFED',
  statusUnbound: 'FFF7E6',
  statusInvalid: 'FFF1F0',

  // Table
  headerBg: '1890FF',
  headerText: 'FFFFFF',
  zebraLight: 'FAFAFA',
  borderGray: 'E8E8E8',
  summaryYellow: 'FFF8DC',
  white: 'FFFFFF',
  darkText: '1F1F1F',
  grayText: '666666',
} as const;

// ── Helpers ────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length >= 3) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  return dateStr;
}

function formatTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLORS.borderGray } },
  left: { style: 'thin', color: { argb: COLORS.borderGray } },
  bottom: { style: 'thin', color: { argb: COLORS.borderGray } },
  right: { style: 'thin', color: { argb: COLORS.borderGray } },
};

function applyHeaderStyle(row: ExcelJS.Row, bgColor: string = COLORS.headerBg) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.headerText }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    cell.border = thinBorder;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  row.height = 22;
}

function getBindingStatusLabel(status?: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'BOUND':
      return { label: '已绑定', bg: COLORS.statusBound, fg: COLORS.primaryGreen };
    case 'UNBOUND':
      return { label: '未绑定', bg: COLORS.statusUnbound, fg: COLORS.primaryOrange };
    case 'INVALID_NODE':
    case 'NODE_INACTIVE':
    case 'RESOURCE_INACTIVE':
      return { label: '异常', bg: COLORS.statusInvalid, fg: COLORS.primaryRed };
    case 'RESOURCE_RULE_MISMATCH':
      return { label: '规则不匹配', bg: COLORS.lightPurple, fg: COLORS.primaryPurple };
    default:
      return { label: status || '-', bg: COLORS.white, fg: COLORS.darkText };
  }
}

// ── Sheet Builders ─────────────────────────────────────────────

function buildOverviewSheet(wb: ExcelJS.Workbook, data: TemplateExportData) {
  const ws = wb.addWorksheet('模版总览', { properties: { tabColor: { argb: COLORS.primaryBlue } } });
  const templates = data.templates;

  // Title
  ws.mergeCells('A1:J1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '工艺模版总览';
  titleCell.font = { bold: true, size: 20, color: { argb: COLORS.darkText } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 40;

  // Subtitle
  ws.mergeCells('A2:J2');
  const subCell = ws.getCell('A2');
  subCell.value = `导出时间: ${new Date().toLocaleString('zh-CN')}  |  共 ${templates.length} 个模版`;
  subCell.font = { size: 12, color: { argb: COLORS.grayText } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 24;

  // KPI Cards (Row 4-6)
  const totalStages = templates.reduce((sum, t) => sum + (t.stage_count ?? 0), 0);
  const totalDays = templates.reduce((sum, t) => sum + t.total_days, 0);
  const avgDays = templates.length > 0 ? (totalDays / templates.length).toFixed(1) : '0';
  const maxDays = templates.reduce((max, t) => Math.max(max, t.total_days), 0);
  const riskCount = templates.filter(
    t => (t.unbound_count ?? 0) > 0 || (t.constraint_conflict_count ?? 0) > 0 || (t.invalid_binding_count ?? 0) > 0
  ).length;
  const linkedTeams = new Set(templates.filter(t => t.team_id).map(t => t.team_id));

  const kpiData = [
    { label: '模版数量', value: `${templates.length}`, bg: COLORS.lightBlue, fg: COLORS.primaryBlue },
    { label: '平均周期', value: `${avgDays} 天`, bg: COLORS.lightGreen, fg: COLORS.primaryGreen },
    { label: '最长周期', value: `${maxDays} 天`, bg: COLORS.lightOrange, fg: COLORS.primaryOrange },
    { label: '有风险模版', value: `${riskCount}`, bg: riskCount > 0 ? COLORS.lightRed : COLORS.lightGreen, fg: riskCount > 0 ? COLORS.primaryRed : COLORS.primaryGreen },
    { label: '关联团队', value: `${linkedTeams.size}`, bg: COLORS.lightPurple, fg: COLORS.primaryPurple },
  ];

  kpiData.forEach((kpi, i) => {
    const col = i * 2 + 1;
    ws.mergeCells(4, col, 4, col + 1);
    ws.mergeCells(5, col, 6, col + 1);

    const labelCell = ws.getCell(4, col);
    labelCell.value = kpi.label;
    labelCell.font = { size: 11, color: { argb: COLORS.grayText } };
    labelCell.alignment = { horizontal: 'center', vertical: 'bottom' };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kpi.bg } };
    labelCell.border = thinBorder;

    const valueCell = ws.getCell(5, col);
    valueCell.value = kpi.value;
    valueCell.font = { bold: true, size: 22, color: { argb: kpi.fg } };
    valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kpi.bg } };
    valueCell.border = thinBorder;
  });
  ws.getRow(4).height = 22;
  ws.getRow(5).height = 32;
  ws.getRow(6).height = 10;

  // Template table (Row 8+)
  const headers = ['模版编码', '模版名称', '关联团队', '周期(天)', '阶段数', '未绑定', '约束冲突', '状态异常', '描述', '更新时间'];
  const headerRow = ws.getRow(8);
  headers.forEach((h, i) => {
    ws.getCell(8, i + 1).value = h;
  });
  applyHeaderStyle(headerRow);

  templates.forEach((t, idx) => {
    const rowNum = 9 + idx;
    ws.getCell(rowNum, 1).value = t.template_code;
    ws.getCell(rowNum, 2).value = t.template_name;
    ws.getCell(rowNum, 3).value = t.team_name || '-';
    ws.getCell(rowNum, 4).value = t.total_days;
    ws.getCell(rowNum, 5).value = t.stage_count ?? '-';
    ws.getCell(rowNum, 6).value = t.unbound_count ?? 0;
    ws.getCell(rowNum, 7).value = t.constraint_conflict_count ?? 0;
    ws.getCell(rowNum, 8).value = t.invalid_binding_count ?? 0;
    ws.getCell(rowNum, 9).value = t.description || '';
    ws.getCell(rowNum, 10).value = formatDate(t.updated_at);

    // Conditional coloring for risk columns
    const unboundCell = ws.getCell(rowNum, 6);
    if ((t.unbound_count ?? 0) > 0) {
      unboundCell.font = { color: { argb: COLORS.primaryOrange }, bold: true };
      unboundCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightOrange } };
    }

    const conflictCell = ws.getCell(rowNum, 7);
    if ((t.constraint_conflict_count ?? 0) > 0) {
      conflictCell.font = { color: { argb: COLORS.primaryRed }, bold: true };
      conflictCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightRed } };
    }

    const invalidCell = ws.getCell(rowNum, 8);
    if ((t.invalid_binding_count ?? 0) > 0) {
      invalidCell.font = { color: { argb: COLORS.primaryRed }, bold: true };
      invalidCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightRed } };
    }

    // Borders & zebra
    for (let c = 1; c <= 10; c++) {
      const cell = ws.getCell(rowNum, c);
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: c >= 4 && c <= 8 ? 'center' : 'left' };
      if (idx % 2 === 1 && !cell.fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
      }
    }
  });

  // Summary row
  if (templates.length > 0) {
    const sumRow = 9 + templates.length;
    ws.getCell(sumRow, 1).value = '合计';
    ws.getCell(sumRow, 4).value = `平均 ${avgDays}`;
    ws.getCell(sumRow, 5).value = totalStages;
    ws.getCell(sumRow, 6).value = templates.reduce((s, t) => s + (t.unbound_count ?? 0), 0);
    ws.getCell(sumRow, 7).value = templates.reduce((s, t) => s + (t.constraint_conflict_count ?? 0), 0);
    ws.getCell(sumRow, 8).value = templates.reduce((s, t) => s + (t.invalid_binding_count ?? 0), 0);

    for (let c = 1; c <= 10; c++) {
      const cell = ws.getCell(sumRow, c);
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.summaryYellow } };
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: c >= 4 && c <= 8 ? 'center' : 'left' };
    }
  }

  // Auto filter
  if (templates.length > 0) {
    ws.autoFilter = { from: { row: 8, column: 1 }, to: { row: 8 + templates.length, column: 10 } };
  }

  // Column widths
  const colWidths = [14, 20, 14, 10, 8, 10, 10, 10, 24, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Freeze header
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 8, activeCell: 'A9' }];
}

function buildStagesSheet(wb: ExcelJS.Workbook, data: TemplateExportData) {
  const ws = wb.addWorksheet('阶段明细', { properties: { tabColor: { argb: COLORS.primaryGreen } } });

  // Title
  ws.mergeCells('A1:H1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '阶段明细';
  titleCell.font = { bold: true, size: 16, color: { argb: COLORS.darkText } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Headers
  const headers = ['模版编码', '阶段编码', '阶段名称', '阶段序号', '开始天数', '工序数', '描述'];
  const headerRow = ws.getRow(3);
  headers.forEach((h, i) => {
    ws.getCell(3, i + 1).value = h;
  });
  applyHeaderStyle(headerRow, COLORS.primaryGreen);

  const stages = data.stages;

  // Group by template for visual grouping
  let currentRow = 4;
  let currentTemplateCode = '';
  let templateStartRow = 4;

  stages.forEach((stage, idx) => {
    const isNewTemplate = stage.template_code !== currentTemplateCode;

    if (isNewTemplate && currentTemplateCode && currentRow - templateStartRow > 1) {
      ws.mergeCells(templateStartRow, 1, currentRow - 1, 1);
      ws.getCell(templateStartRow, 1).alignment = { vertical: 'middle', horizontal: 'center' };
    }

    if (isNewTemplate) {
      currentTemplateCode = stage.template_code;
      templateStartRow = currentRow;
    }

    ws.getCell(currentRow, 1).value = stage.template_code;
    ws.getCell(currentRow, 2).value = stage.stage_code;
    ws.getCell(currentRow, 3).value = stage.stage_name;
    ws.getCell(currentRow, 4).value = stage.stage_order;
    ws.getCell(currentRow, 5).value = stage.start_day;
    ws.getCell(currentRow, 6).value = stage.operation_count ?? '-';
    ws.getCell(currentRow, 7).value = stage.description || '';

    for (let c = 1; c <= 7; c++) {
      const cell = ws.getCell(currentRow, c);
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: c >= 4 && c <= 6 ? 'center' : 'left' };
      if (idx % 2 === 1 && !cell.fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
      }
    }

    currentRow++;
  });

  // Merge last template group
  if (currentRow - templateStartRow > 1) {
    ws.mergeCells(templateStartRow, 1, currentRow - 1, 1);
    ws.getCell(templateStartRow, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  }

  // Auto filter
  if (stages.length > 0) {
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + stages.length, column: 7 } };
  }

  // Column widths
  const colWidths = [14, 12, 18, 10, 10, 8, 24];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Freeze header
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, activeCell: 'A4' }];
}

function buildOperationsSheet(wb: ExcelJS.Workbook, data: TemplateExportData) {
  const ws = wb.addWorksheet('工序明细', { properties: { tabColor: { argb: COLORS.primaryOrange } } });

  // Title
  ws.mergeCells('A1:K1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '工序明细';
  titleCell.font = { bold: true, size: 16, color: { argb: COLORS.darkText } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Headers
  const headers = [
    '模版编码', '阶段名称', '工序编码', '工序名称', '工序天数',
    '推荐时间', '标准工时(h)', '需要人数', '资源节点', '绑定状态', '工序序号',
  ];
  const headerRow = ws.getRow(3);
  headers.forEach((h, i) => {
    ws.getCell(3, i + 1).value = h;
  });
  applyHeaderStyle(headerRow, COLORS.primaryOrange);

  const ops = data.operations;
  let currentRow = 4;
  let currentTemplateCode = '';
  let templateStartRow = 4;

  ops.forEach((op, idx) => {
    const isNewTemplate = op.template_code !== currentTemplateCode;

    if (isNewTemplate && currentTemplateCode && currentRow - templateStartRow > 1) {
      ws.mergeCells(templateStartRow, 1, currentRow - 1, 1);
      ws.getCell(templateStartRow, 1).alignment = { vertical: 'middle', horizontal: 'center' };
    }

    if (isNewTemplate) {
      currentTemplateCode = op.template_code;
      templateStartRow = currentRow;
    }

    ws.getCell(currentRow, 1).value = op.template_code;
    ws.getCell(currentRow, 2).value = op.stage_name;
    ws.getCell(currentRow, 3).value = op.operation_code;
    ws.getCell(currentRow, 4).value = op.operation_name;
    ws.getCell(currentRow, 5).value = op.operation_day;
    ws.getCell(currentRow, 6).value = formatTime(op.recommended_time);
    ws.getCell(currentRow, 7).value = op.standard_time ?? '-';
    ws.getCell(currentRow, 8).value = op.required_people ?? '-';
    ws.getCell(currentRow, 9).value = op.resource_node_name || '-';

    // Binding status with color
    const statusInfo = getBindingStatusLabel(op.binding_status);
    const statusCell = ws.getCell(currentRow, 10);
    statusCell.value = statusInfo.label;
    statusCell.font = { color: { argb: statusInfo.fg }, bold: true, size: 11 };
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusInfo.bg } };

    ws.getCell(currentRow, 11).value = op.operation_order;

    // Borders & zebra
    for (let c = 1; c <= 11; c++) {
      const cell = ws.getCell(currentRow, c);
      cell.border = thinBorder;
      cell.alignment = {
        vertical: 'middle',
        horizontal: [5, 6, 7, 8, 10, 11].includes(c) ? 'center' : 'left',
      };
      if (idx % 2 === 1 && c !== 10 && !cell.fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
      }
    }

    currentRow++;
  });

  // Merge last template group
  if (currentRow - templateStartRow > 1) {
    ws.mergeCells(templateStartRow, 1, currentRow - 1, 1);
    ws.getCell(templateStartRow, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  }

  // Summary row
  if (ops.length > 0) {
    const sumRow = currentRow;
    ws.getCell(sumRow, 1).value = '合计';
    ws.getCell(sumRow, 4).value = `${ops.length} 个工序`;
    const boundCount = ops.filter(op => op.binding_status === 'BOUND').length;
    const unboundCount = ops.filter(op => op.binding_status === 'UNBOUND').length;
    ws.getCell(sumRow, 10).value = `绑定:${boundCount} 未绑:${unboundCount}`;

    for (let c = 1; c <= 11; c++) {
      const cell = ws.getCell(sumRow, c);
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.summaryYellow } };
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
  }

  // Auto filter
  if (ops.length > 0) {
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + ops.length, column: 11 } };
  }

  // Column widths
  const colWidths = [14, 14, 12, 18, 10, 10, 12, 10, 16, 12, 10];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // Freeze header
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, activeCell: 'A4' }];
}

// ── Main Export Function ───────────────────────────────────────

/**
 * 导出工艺模版为 Excel 文件
 */
export async function exportTemplateToExcel(data: TemplateExportData, fileName?: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'APS 工艺模版管理系统';
  wb.created = new Date();

  buildOverviewSheet(wb, data);
  buildStagesSheet(wb, data);
  buildOperationsSheet(wb, data);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const defaultName = `工艺模版总览_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(blob, fileName || defaultName);
}
