/**
 * 单工艺模板 Excel 导出工具 (ExcelJS 甘特图版)
 *
 * 生成包含 2 个 Sheet 的 xlsx 文件：
 * 1. 模板概览 — KPI 卡片 + 基础信息 + 阶段概览
 * 2. 工艺甘特图 — 横轴天数 × 纵轴工序的 pivot 甘特图
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ── Types ──────────────────────────────────────────────────────

export interface ReportTemplate {
  id: number;
  template_code: string;
  template_name: string;
  team_id: number | null;
  team_code: string | null;
  team_name: string | null;
  description: string | null;
  total_days: number;
  created_at: string;
  updated_at: string;
}

export interface ReportStage {
  id: number;
  stage_code: string;
  stage_name: string;
  stage_order: number;
  start_day: number;
  description: string | null;
  operation_count: number;
}

export interface ReportOperation {
  id: number;
  stage_code: string;
  stage_name: string;
  operation_code: string;
  operation_name: string;
  operation_day: number;
  recommended_time: number;
  standard_time?: number | null;
  required_people?: number | null;
  operation_order: number;
  resource_node_name?: string | null;
  binding_status?: string;
}

export interface SingleTemplateReportData {
  template: ReportTemplate;
  stages: ReportStage[];
  operations: ReportOperation[];
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

  // Gantt bar colors (per stage, cycling)
  ganttBars: [
    { bg: 'BAE7FF', fg: '096DD9' }, // blue
    { bg: 'D9F7BE', fg: '389E0D' }, // green
    { bg: 'FFE7BA', fg: 'D46B08' }, // orange
    { bg: 'EFDBFF', fg: '531DAB' }, // purple
    { bg: 'FFD6E7', fg: 'C41D7F' }, // pink
    { bg: 'B5F5EC', fg: '006D75' }, // cyan
    { bg: 'FFECD2', fg: 'AD4E00' }, // warm orange
    { bg: 'D3ADF7', fg: '391085' }, // deep purple
  ],

  // Table
  headerBg: '1890FF',
  headerText: 'FFFFFF',
  stageHeaderBg: '52C41A',
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

// ── Sheet 1: 模板概览 ────────────────────────────────────────

function buildOverviewSheet(wb: ExcelJS.Workbook, data: SingleTemplateReportData) {
  const ws = wb.addWorksheet('模板概览', { properties: { tabColor: { argb: COLORS.primaryBlue } } });
  const { template, stages, operations } = data;

  // Title
  ws.mergeCells('A1:H1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '工艺模板报告';
  titleCell.font = { bold: true, size: 20, color: { argb: COLORS.darkText } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 40;

  // Subtitle
  ws.mergeCells('A2:H2');
  const subCell = ws.getCell('A2');
  subCell.value = `${template.template_code} · ${template.template_name} | 导出时间: ${new Date().toLocaleString('zh-CN')}`;
  subCell.font = { size: 12, color: { argb: COLORS.grayText } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 24;

  // KPI Cards (Row 4-6)
  const totalOperations = operations.length;
  const boundCount = operations.filter(op => op.binding_status === 'BOUND').length;
  const bindingRate = totalOperations > 0 ? Math.round((boundCount / totalOperations) * 100) : 0;

  const kpiData = [
    { label: '总周期', value: `${template.total_days} 天`, bg: COLORS.lightBlue, fg: COLORS.primaryBlue },
    { label: '阶段数', value: `${stages.length}`, bg: COLORS.lightGreen, fg: COLORS.primaryGreen },
    { label: '工序数', value: `${totalOperations}`, bg: COLORS.lightOrange, fg: COLORS.primaryOrange },
    { label: '资源绑定率', value: `${bindingRate}%`, bg: COLORS.lightPurple, fg: COLORS.primaryPurple },
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

  // Basic info table (Row 8+)
  const headerRow8 = ws.getRow(8);
  ws.getCell('A8').value = '项目';
  ws.getCell('B8').value = '数值';
  ws.mergeCells('B8:D8');
  applyHeaderStyle(headerRow8);

  const infoRows = [
    ['模板编码', template.template_code],
    ['模板名称', template.template_name],
    ['所属团队', template.team_name || '-'],
    ['创建时间', formatDate(template.created_at)],
    ['更新时间', formatDate(template.updated_at)],
    ['总天数', `${template.total_days} 天`],
    ['描述', template.description || '-'],
  ];

  infoRows.forEach((row, i) => {
    const r = 9 + i;
    ws.getCell(`A${r}`).value = row[0];
    ws.getCell(`A${r}`).font = { bold: true, size: 11 };
    ws.getCell(`A${r}`).border = thinBorder;
    ws.mergeCells(`B${r}:D${r}`);
    ws.getCell(`B${r}`).value = row[1];
    ws.getCell(`B${r}`).border = thinBorder;
    if (i % 2 === 1) {
      ws.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
      ws.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
    }
  });

  // Stage overview table
  const stageHeaderRow = 9 + infoRows.length + 1;
  ws.mergeCells(stageHeaderRow, 1, stageHeaderRow, 5);
  const stageTitleCell = ws.getCell(stageHeaderRow, 1);
  stageTitleCell.value = '阶段概览';
  stageTitleCell.font = { bold: true, size: 13, color: { argb: COLORS.headerText } };
  stageTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.stageHeaderBg } };
  stageTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  stageTitleCell.border = thinBorder;

  const stageColHeaders = ['阶段编码', '阶段名称', '序号', '开始天', '工序数'];
  const stageColRow = stageHeaderRow + 1;
  stageColHeaders.forEach((h, i) => {
    ws.getCell(stageColRow, i + 1).value = h;
  });
  applyHeaderStyle(ws.getRow(stageColRow), COLORS.stageHeaderBg);

  stages.forEach((stage, idx) => {
    const r = stageColRow + 1 + idx;
    ws.getCell(r, 1).value = stage.stage_code;
    ws.getCell(r, 2).value = stage.stage_name;
    ws.getCell(r, 3).value = stage.stage_order;
    ws.getCell(r, 4).value = `Day ${stage.start_day}`;
    ws.getCell(r, 5).value = Number(stage.operation_count);

    for (let c = 1; c <= 5; c++) {
      const cell = ws.getCell(r, c);
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: c >= 3 ? 'center' : 'left' };
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
      }
    }
  });

  // Column widths
  const colWidths = [14, 22, 14, 14, 14, 14, 14, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// ── Sheet 2: 工艺甘特图 ──────────────────────────────────────

function buildGanttSheet(wb: ExcelJS.Workbook, data: SingleTemplateReportData) {
  const { template, stages, operations } = data;
  const ws = wb.addWorksheet('工艺甘特图', { properties: { tabColor: { argb: COLORS.primaryOrange } } });

  // Compute day range
  const allDays = operations.map(op => Number(op.operation_day));
  const stageDays = stages.map(s => Number(s.start_day));
  const allValues = [...allDays, ...stageDays, 0];
  const minDay = Math.min(...allValues);
  const maxDay = Math.max(...allValues, template.total_days - 1);
  const dayCount = maxDay - minDay + 1;

  // Fixed columns: A=阶段, B=工序名称, C=时间
  const fixedCols = 3;
  const dayStartCol = fixedCols + 1; // Column D

  // Title
  ws.mergeCells(1, 1, 1, fixedCols + dayCount);
  const titleCell = ws.getCell('A1');
  titleCell.value = `工艺甘特图 — ${template.template_code} ${template.template_name}`;
  titleCell.font = { bold: true, size: 16, color: { argb: COLORS.darkText } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  // Subtitle
  ws.mergeCells(2, 1, 2, fixedCols + dayCount);
  const subCell = ws.getCell('A2');
  subCell.value = `总周期: ${template.total_days}天 | ${stages.length}个阶段 | ${operations.length}个工序`;
  subCell.font = { size: 12, color: { argb: COLORS.grayText } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 22;

  // Header row (Row 3)
  const headerRow = ws.getRow(3);
  ws.getCell(3, 1).value = '阶段';
  ws.getCell(3, 2).value = '工序名称';
  ws.getCell(3, 3).value = '时间';
  for (let d = 0; d < dayCount; d++) {
    ws.getCell(3, dayStartCol + d).value = `Day ${minDay + d}`;
  }
  applyHeaderStyle(headerRow);
  headerRow.height = 28;

  // Build stage color map
  const stageColorMap = new Map<string, { bg: string; fg: string }>();
  stages.forEach((stage, idx) => {
    stageColorMap.set(stage.stage_code, COLORS.ganttBars[idx % COLORS.ganttBars.length]);
  });

  // Group operations by stage
  const operationsByStage = new Map<string, ReportOperation[]>();
  stages.forEach(stage => {
    operationsByStage.set(stage.stage_code, []);
  });
  operations.forEach(op => {
    const list = operationsByStage.get(op.stage_code);
    if (list) list.push(op);
  });

  // Render rows
  let currentRow = 4;
  const totalCols = fixedCols + dayCount;

  for (const stage of stages) {
    const stageOps = operationsByStage.get(stage.stage_code) || [];
    if (stageOps.length === 0) continue;

    const stageStartRow = currentRow;
    const colors = stageColorMap.get(stage.stage_code) || COLORS.ganttBars[0];

    stageOps.forEach((op) => {
      // Stage column — will be merged later
      ws.getCell(currentRow, 1).value = stage.stage_name;
      ws.getCell(currentRow, 1).font = { bold: true, size: 11, color: { argb: colors.fg } };
      ws.getCell(currentRow, 1).alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getCell(currentRow, 1).border = thinBorder;

      // Operation name
      ws.getCell(currentRow, 2).value = op.operation_name;
      ws.getCell(currentRow, 2).font = { size: 11 };
      ws.getCell(currentRow, 2).alignment = { vertical: 'middle' };
      ws.getCell(currentRow, 2).border = thinBorder;

      // Time
      ws.getCell(currentRow, 3).value = formatTime(op.recommended_time);
      ws.getCell(currentRow, 3).font = { size: 10, color: { argb: COLORS.grayText } };
      ws.getCell(currentRow, 3).alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getCell(currentRow, 3).border = thinBorder;

      // Day columns — fill the operation's day
      for (let d = 0; d < dayCount; d++) {
        const dayCol = dayStartCol + d;
        const cell = ws.getCell(currentRow, dayCol);
        cell.border = thinBorder;

        const absoluteDay = minDay + d;
        // operation_day is relative to stage; absolute position = stage.start_day + op.operation_day
        const opAbsoluteDay = Number(stage.start_day) + Number(op.operation_day);

        if (absoluteDay === opAbsoluteDay) {
          // This cell is the Gantt bar
          cell.value = op.operation_name;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } };
          cell.font = { bold: true, size: 10, color: { argb: colors.fg } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        }
      }

      ws.getRow(currentRow).height = 22;
      currentRow++;
    });

    // Merge stage column cells
    if (currentRow - stageStartRow > 1) {
      ws.mergeCells(stageStartRow, 1, currentRow - 1, 1);
      ws.getCell(stageStartRow, 1).alignment = { vertical: 'middle', horizontal: 'center' };
    }
  }

  // Column widths
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 8;
  for (let d = 0; d < dayCount; d++) {
    ws.getColumn(dayStartCol + d).width = 14;
  }

  // Freeze panes: fix header row (3) + first 3 columns (A, B, C)
  ws.views = [{ state: 'frozen', xSplit: fixedCols, ySplit: 3, activeCell: 'D4' }];
}

// ── Main Export Function ───────────────────────────────────────

/**
 * 导出单个工艺模板为甘特图 Excel
 */
export async function exportSingleTemplateToExcel(
  data: SingleTemplateReportData,
  fileName?: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'APS 工艺模版管理系统';
  wb.created = new Date();

  buildOverviewSheet(wb, data);
  buildGanttSheet(wb, data);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const defaultName = `工艺模板_${data.template.template_code}_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(blob, fileName || defaultName);
}
