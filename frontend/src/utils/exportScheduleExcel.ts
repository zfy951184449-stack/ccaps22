/**
 * V4 排班结果 Excel 导出工具 (ExcelJS 版)
 *
 * 生成包含 5 个 Sheet 的 xlsx 文件：
 * 1. 排班总览 — KPI 面板 + 元数据 + 班次图例
 * 2. 排班日历 — 员工×日期 pivot（颜色编码, 冻结窗格）
 * 3. 工序分配 — 按日期分组, 状态着色
 * 4. 人员统计 — 全量员工, 条件高亮
 * 5. 覆盖缺口 — 未分配岗位清单
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ── Types ──────────────────────────────────────────────────────

interface ResultData {
    metrics: {
        completion_rate: number;
        coverage_rate: number;
        satisfaction: number;
        solve_time: number;
    };
    details: {
        total_positions: number;
        assigned_positions: number;
        total_operations: number;
        covered_operations: number;
    };
    assignments: any[];
    shift_assignments?: any[];
    operations?: any[];
    calendar_days?: { date: string; is_workday: boolean }[];
    standard_hours?: number;
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

    // Shift cell backgrounds
    shiftMorning: 'E6F7E6',       // 早班/白班 — green
    shiftNight: 'F9F0FF',         // 夜班/晚班 — purple
    shiftLongDay: 'E6F4FF',       // 长白班   — blue
    shiftBase: 'FFF7E6',          // 基础班   — orange
    shiftRest: 'F5F5F5',          // 休息     — gray

    // Shift text colors
    textMorning: '389E0D',
    textNight: '722ED1',
    textLongDay: '1890FF',
    textBase: 'D48806',
    textRest: '999999',

    // Table
    headerBg: '1890FF',
    headerText: 'FFFFFF',
    weekendHeaderBg: '8C8C8C',
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

/** Timezone-safe: parse from string to avoid UTC midnight shift */
function formatShortDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    const d = new Date(year, month, day); // local timezone
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${month + 1}/${day} ${weekdays[d.getDay()]}`;
}

function formatDateTime(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${formatDate(dateStr)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTime(dateStr: string): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getDateRange(calendarDays?: { date: string }[]): string {
    if (!calendarDays?.length) return '-';
    const dates = calendarDays.map(d => d.date).sort();
    return `${formatDate(dates[0])} ~ ${formatDate(dates[dates.length - 1])}`;
}

/** Get shift color config based on shift name */
function getShiftStyle(shiftName: string): { bg: string; fg: string } {
    const name = (shiftName || '').toLowerCase();
    if (name.includes('休息') || name.includes('休') || name === '-' || name === '') {
        return { bg: COLORS.shiftRest, fg: COLORS.textRest };
    }
    if (name.includes('夜') || name.includes('晚')) {
        return { bg: COLORS.shiftNight, fg: COLORS.textNight };
    }
    if (name.includes('长白') || name.includes('长日')) {
        return { bg: COLORS.shiftLongDay, fg: COLORS.textLongDay };
    }
    if (name.includes('早') || name.includes('白班')) {
        return { bg: COLORS.shiftMorning, fg: COLORS.textMorning };
    }
    if (name.includes('基础')) {
        return { bg: COLORS.shiftBase, fg: COLORS.textBase };
    }
    return { bg: COLORS.white, fg: COLORS.darkText };
}

/** Thin border style applied to all data cells */
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

// ── Personnel Stats Calculator ─────────────────────────────────

interface PersonnelStat {
    id: number;
    name: string;
    code: string;
    shiftCount: number;
    shiftHours: number;
    operationHours: number;
    utilization: number;
    maxConsecutiveWork: number;
    nightCount: number;
    weekendCount: number;
}

function calculatePersonnelStats(data: ResultData): PersonnelStat[] {
    const allDates = (data.calendar_days || []).map(d => d.date);
    const nonWorkDays = new Set(
        (data.calendar_days || []).filter(d => !d.is_workday).map(d => d.date)
    );

    const empMap = new Map<number, {
        id: number; name: string; code: string;
        shiftCount: number; shiftHours: number; operationHours: number;
        dates: Map<string, boolean>; nightCount: number; weekendCount: number;
    }>();

    (data.shift_assignments || []).forEach(s => {
        const hours = Number(s.nominal_hours) || 0;
        const isWorkShift = hours > 0;

        if (!empMap.has(s.employee_id)) {
            empMap.set(s.employee_id, {
                id: s.employee_id,
                name: s.employee_name || `员工 ${s.employee_id}`,
                code: s.employee_code || '',
                shiftCount: 0, shiftHours: 0, operationHours: 0,
                dates: new Map(), nightCount: 0, weekendCount: 0,
            });
        }
        const emp = empMap.get(s.employee_id)!;
        emp.dates.set(s.date, isWorkShift);
        if (isWorkShift) emp.shiftCount++;
        emp.shiftHours += hours;

        // Night shift detection
        const shiftName = (s.shift_name || '').toLowerCase();
        if (shiftName.includes('夜') || shiftName.includes('晚')) {
            emp.nightCount++;
        }
        // Weekend detection
        if (nonWorkDays.has(s.date) && isWorkShift) {
            emp.weekendCount++;
        }
    });

    (data.assignments || []).forEach(a => {
        const start = new Date(a.planned_start).getTime();
        const end = new Date(a.planned_end).getTime();
        const durationHours = (end - start) / 3600000;
        if (empMap.has(a.employee_id)) {
            empMap.get(a.employee_id)!.operationHours += durationHours;
        }
    });

    return Array.from(empMap.values()).map(emp => {
        let consecutiveWork = 0, maxWork = 0;
        allDates.forEach(dateStr => {
            if (emp.dates.get(dateStr) ?? false) {
                consecutiveWork++;
                maxWork = Math.max(maxWork, consecutiveWork);
            } else {
                consecutiveWork = 0;
            }
        });

        return {
            id: emp.id, name: emp.name, code: emp.code,
            shiftCount: emp.shiftCount, shiftHours: emp.shiftHours,
            operationHours: emp.operationHours,
            utilization: emp.shiftHours > 0 ? (emp.operationHours / emp.shiftHours) * 100 : 0,
            maxConsecutiveWork: maxWork,
            nightCount: emp.nightCount,
            weekendCount: emp.weekendCount,
        };
    }).sort((a, b) => b.shiftCount - a.shiftCount);
}

// ── Sheet Builders ─────────────────────────────────────────────

function buildSummarySheet(wb: ExcelJS.Workbook, data: ResultData, runId: number) {
    const ws = wb.addWorksheet('排班总览', { properties: { tabColor: { argb: COLORS.primaryBlue } } });

    // Title
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = '排班结果报告';
    titleCell.font = { bold: true, size: 20, color: { argb: COLORS.darkText } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 40;

    // Subtitle
    ws.mergeCells('A2:H2');
    const subCell = ws.getCell('A2');
    subCell.value = `Run #${runId}  |  排班周期: ${getDateRange(data.calendar_days)}`;
    subCell.font = { size: 12, color: { argb: COLORS.grayText } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 24;

    // KPI Cards (Row 4-6)
    const kpiData = [
        { label: '分配完成率', value: `${data.metrics.completion_rate}%`, bg: COLORS.lightBlue, fg: COLORS.primaryBlue },
        { label: '操作覆盖率', value: `${data.metrics.coverage_rate}%`, bg: COLORS.lightGreen, fg: COLORS.primaryGreen },
        { label: '岗位分配', value: `${data.details.assigned_positions}/${data.details.total_positions}`, bg: COLORS.lightOrange, fg: COLORS.primaryOrange },
        { label: '质量评分', value: `${data.metrics.satisfaction}`, bg: COLORS.lightPurple, fg: COLORS.primaryPurple },
    ];

    kpiData.forEach((kpi, i) => {
        const col = i * 2 + 1;
        // Merge 2 cols × 2 rows per card
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

    // Summary table (Row 8+)
    const uniqueEmployees = new Set(data.shift_assignments?.map(s => s.employee_id) || []).size;
    const summaryRows = [
        ['排班周期', getDateRange(data.calendar_days)],
        ['参与员工', `${uniqueEmployees}人`],
        ['排班天数', `${(data.calendar_days || []).length}天`],
        ['求解耗时', `${data.metrics.solve_time}秒`],
        ['生成时间', new Date().toLocaleString('zh-CN')],
    ];

    const headerRow8 = ws.getRow(8);
    ws.getCell('A8').value = '项目';
    ws.getCell('B8').value = '数值';
    ws.mergeCells('B8:D8');
    applyHeaderStyle(headerRow8);

    summaryRows.forEach((row, i) => {
        const r = ws.getRow(9 + i);
        ws.getCell(`A${9 + i}`).value = row[0];
        ws.getCell(`A${9 + i}`).font = { bold: true, size: 11 };
        ws.getCell(`A${9 + i}`).border = thinBorder;
        ws.mergeCells(`B${9 + i}:D${9 + i}`);
        ws.getCell(`B${9 + i}`).value = row[1];
        ws.getCell(`B${9 + i}`).border = thinBorder;
        if (i % 2 === 1) {
            ws.getCell(`A${9 + i}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
            ws.getCell(`B${9 + i}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
        }
    });

    // Shift legend table (Row 16+)
    const legendStart = 9 + summaryRows.length + 1;
    ws.getCell(`A${legendStart}`).value = '班次类型';
    ws.getCell(`B${legendStart}`).value = '颜色标识';
    ws.getCell(`C${legendStart}`).value = '说明';
    applyHeaderStyle(ws.getRow(legendStart), COLORS.primaryGreen);

    const legends = [
        { name: '早班/白班', bg: COLORS.shiftMorning, fg: COLORS.textMorning, desc: '日间标准班次' },
        { name: '夜班/晚班', bg: COLORS.shiftNight, fg: COLORS.textNight, desc: '夜间班次' },
        { name: '长白班', bg: COLORS.shiftLongDay, fg: COLORS.textLongDay, desc: '全天工作班次' },
        { name: '基础班', bg: COLORS.shiftBase, fg: COLORS.textBase, desc: '基础轮转班次' },
        { name: '休息', bg: COLORS.shiftRest, fg: COLORS.textRest, desc: '休息日' },
    ];

    legends.forEach((leg, i) => {
        const r = legendStart + 1 + i;
        ws.getCell(`A${r}`).value = leg.name;
        ws.getCell(`A${r}`).border = thinBorder;
        ws.getCell(`B${r}`).value = '■';
        ws.getCell(`B${r}`).font = { size: 14, color: { argb: leg.fg } };
        ws.getCell(`B${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: leg.bg } };
        ws.getCell(`B${r}`).alignment = { horizontal: 'center' };
        ws.getCell(`B${r}`).border = thinBorder;
        ws.getCell(`C${r}`).value = leg.desc;
        ws.getCell(`C${r}`).border = thinBorder;
    });

    // Column widths
    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 16;
    ws.getColumn(6).width = 16;
    ws.getColumn(7).width = 16;
    ws.getColumn(8).width = 16;
}

function buildCalendarSheet(wb: ExcelJS.Workbook, data: ResultData) {
    const ws = wb.addWorksheet('排班日历', { properties: { tabColor: { argb: COLORS.primaryBlue } } });

    const calendarDays = (data.calendar_days || []).sort((a, b) => a.date.localeCompare(b.date));
    if (calendarDays.length === 0) {
        ws.getCell('A1').value = '暂无日历数据';
        return;
    }

    const workdayMap = new Map<string, boolean>();
    calendarDays.forEach(d => workdayMap.set(d.date, d.is_workday));

    // Build employee shift map
    const empShiftMap = new Map<number, {
        empId: number; name: string; code: string;
        shifts: Map<string, { shiftName: string; hours: number }>;
    }>();

    (data.shift_assignments || []).forEach(s => {
        if (!empShiftMap.has(s.employee_id)) {
            empShiftMap.set(s.employee_id, {
                empId: s.employee_id,
                name: s.employee_name || `员工 ${s.employee_id}`,
                code: s.employee_code || '',
                shifts: new Map(),
            });
        }
        const emp = empShiftMap.get(s.employee_id)!;
        emp.shifts.set(s.date, {
            shiftName: s.shift_name || s.shift_code || '-',
            hours: Number(s.nominal_hours) || 0,
        });
    });

    // Title row
    ws.mergeCells(1, 1, 1, calendarDays.length + 2);
    const titleCell = ws.getCell('A1');
    titleCell.value = `排班日历 — ${getDateRange(data.calendar_days)}`;
    titleCell.font = { bold: true, size: 16, color: { argb: COLORS.darkText } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Header row (Row 2): 员工姓名 + dates
    const headerRow = ws.getRow(2);
    ws.getCell(2, 1).value = '员工姓名';
    ws.getCell(2, 1).font = { bold: true, color: { argb: COLORS.headerText }, size: 11 };
    ws.getCell(2, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    ws.getCell(2, 1).border = thinBorder;
    ws.getCell(2, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    calendarDays.forEach((day, i) => {
        const col = i + 2;
        const cell = ws.getCell(2, col);
        cell.value = formatShortDate(day.date);
        const isWorkday = day.is_workday;
        cell.font = { bold: true, color: { argb: COLORS.headerText }, size: 10 };
        cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: isWorkday ? COLORS.headerBg : COLORS.weekendHeaderBg },
        };
        cell.border = thinBorder;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    headerRow.height = 28;

    // Build employee-date operation lookup from assignments
    const empDateOpsSet = new Set<string>();
    (data.assignments || []).forEach(a => {
        if (a.employee_id && a.planned_start) {
            const dateStr = typeof a.planned_start === 'string'
                ? a.planned_start.split('T')[0]
                : new Date(a.planned_start).toLocaleDateString('sv-SE');
            empDateOpsSet.add(`${a.employee_id}_${dateStr}`);
        }
    });

    // Data rows
    const employees = Array.from(empShiftMap.values());
    employees.forEach((emp, empIdx) => {
        const rowNum = 3 + empIdx;
        const row = ws.getRow(rowNum);

        // Name cell
        const nameCell = ws.getCell(rowNum, 1);
        nameCell.value = emp.name;
        nameCell.font = { bold: true, size: 11 };
        nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
        nameCell.border = thinBorder;
        nameCell.alignment = { vertical: 'middle' };

        // Shift cells
        calendarDays.forEach((day, dayIdx) => {
            const col = dayIdx + 2;
            const cell = ws.getCell(rowNum, col);
            const info = emp.shifts.get(day.date);
            const hasOps = empDateOpsSet.has(`${emp.empId}_${day.date}`);

            if (info && info.hours > 0) {
                cell.value = `${info.shiftName} ${info.hours}h`;
            } else if (info) {
                cell.value = info.shiftName;
            } else {
                cell.value = '-';
            }

            const style = getShiftStyle(info?.shiftName || '-');
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.bg } };

            // Bold + darker color for shifts WITH operations; lighter/italic for WITHOUT
            if (info && info.hours > 0 && hasOps) {
                cell.font = { bold: true, size: 10, color: { argb: style.fg } };
            } else if (info && info.hours > 0) {
                // Working shift but no operations — lighter color
                cell.font = { size: 10, color: { argb: COLORS.grayText }, italic: true };
            } else {
                cell.font = { size: 10, color: { argb: style.fg } };
            }

            cell.border = thinBorder;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });

        row.height = 20;
    });

    // Summary row at bottom
    const summaryRowNum = 3 + employees.length + 1;
    const summaryNameCell = ws.getCell(summaryRowNum, 1);
    summaryNameCell.value = '每日统计';
    summaryNameCell.font = { bold: true, size: 11 };
    summaryNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.summaryYellow } };
    summaryNameCell.border = thinBorder;

    calendarDays.forEach((day, dayIdx) => {
        const col = dayIdx + 2;
        let morning = 0, night = 0, rest = 0, other = 0;
        employees.forEach(emp => {
            const info = emp.shifts.get(day.date);
            if (!info || info.hours === 0) { rest++; return; }
            const name = (info.shiftName || '').toLowerCase();
            if (name.includes('夜') || name.includes('晚')) night++;
            else if (name.includes('早') || name.includes('白')) morning++;
            else other++;
        });
        const cell = ws.getCell(summaryRowNum, col);
        cell.value = `早:${morning} 夜:${night} 休:${rest}`;
        cell.font = { size: 9, color: { argb: COLORS.grayText } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.summaryYellow } };
        cell.border = thinBorder;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    ws.getRow(summaryRowNum).height = 28;

    // Column widths
    ws.getColumn(1).width = 14;
    for (let i = 2; i <= calendarDays.length + 1; i++) {
        ws.getColumn(i).width = 12;
    }

    // Freeze panes: fix row 2 (header) and column A (names)
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2, activeCell: 'B3' }];
}

function buildOperationsSheet(wb: ExcelJS.Workbook, data: ResultData) {
    const ws = wb.addWorksheet('工序分配', { properties: { tabColor: { argb: COLORS.primaryOrange } } });

    // Title
    ws.mergeCells('A1:J1');
    const titleCell = ws.getCell('A1');
    titleCell.value = '工序分配明细';
    titleCell.font = { bold: true, size: 16, color: { argb: COLORS.darkText } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Headers
    const headers = ['日期', '批次号', '阶段名称', '工序名称', '计划开始', '计划结束', '岗位号', '分配员工', '工号', '状态'];
    const headerRow = ws.getRow(3);
    headers.forEach((h, i) => {
        const cell = ws.getCell(3, i + 1);
        cell.value = h;
    });
    applyHeaderStyle(headerRow);

    // Group assignments by date
    const assignments = [...(data.assignments || [])].sort((a, b) =>
        (a.planned_start || '').localeCompare(b.planned_start || '')
    );

    let currentRow = 4;
    let currentDate = '';
    let dateStartRow = 4;

    assignments.forEach((a, idx) => {
        const dateStr = a.planned_start ? a.planned_start.split('T')[0] : 'unknown';
        const isNewDate = dateStr !== currentDate;

        if (isNewDate && currentDate && currentRow - dateStartRow > 1) {
            // Merge date cells for previous group
            ws.mergeCells(dateStartRow, 1, currentRow - 1, 1);
            ws.getCell(dateStartRow, 1).alignment = { vertical: 'middle', horizontal: 'center' };
        }

        if (isNewDate) {
            currentDate = dateStr;
            dateStartRow = currentRow;
        }

        const row = ws.getRow(currentRow);
        const hasEmployee = a.employee_name && a.employee_name !== '-';
        const status = hasEmployee ? '已分配' : '未分配';

        ws.getCell(currentRow, 1).value = formatDate(dateStr);
        ws.getCell(currentRow, 2).value = a.batch_code || '';
        ws.getCell(currentRow, 3).value = a.stage_name || '-';
        ws.getCell(currentRow, 4).value = a.operation_name || '';
        ws.getCell(currentRow, 5).value = formatTime(a.planned_start);
        ws.getCell(currentRow, 6).value = formatTime(a.planned_end);
        ws.getCell(currentRow, 7).value = a.position_number || 1;
        ws.getCell(currentRow, 8).value = a.employee_name || '-';
        ws.getCell(currentRow, 9).value = a.employee_code || '-';
        ws.getCell(currentRow, 10).value = status;

        // Status cell coloring
        const statusCell = ws.getCell(currentRow, 10);
        if (hasEmployee) {
            statusCell.font = { color: { argb: COLORS.primaryGreen }, bold: true, size: 11 };
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightGreen } };
        } else {
            statusCell.font = { color: { argb: COLORS.primaryRed }, bold: true, size: 11 };
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightRed } };
        }

        // Zebra striping & borders
        for (let c = 1; c <= 10; c++) {
            const cell = ws.getCell(currentRow, c);
            cell.border = thinBorder;
            cell.alignment = { vertical: 'middle', ...(c >= 5 && c <= 7 ? { horizontal: 'center' } : {}) };
            if (currentRow % 2 === 0 && c !== 10) {
                cell.fill = cell.fill || { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
            }
        }

        currentRow++;
    });

    // Merge last date group
    if (currentRow - dateStartRow > 1) {
        ws.mergeCells(dateStartRow, 1, currentRow - 1, 1);
        ws.getCell(dateStartRow, 1).alignment = { vertical: 'middle', horizontal: 'center' };
    }

    // Auto filter
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: currentRow - 1, column: 10 } };

    // Column widths
    const colWidths = [12, 14, 14, 18, 10, 10, 8, 14, 10, 10];
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

function buildStatsSheet(wb: ExcelJS.Workbook, data: ResultData) {
    const ws = wb.addWorksheet('人员统计', { properties: { tabColor: { argb: COLORS.primaryGreen } } });

    // Title
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = '人员排班统计';
    titleCell.font = { bold: true, size: 16, color: { argb: COLORS.darkText } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Headers
    const headers = ['员工姓名', '工号', '排班天数', '排班工时(h)', '操作工时(h)', '利用率', '最大连续工作', '夜班次数', '周末班次数'];
    const headerRow = ws.getRow(3);
    headers.forEach((h, i) => {
        ws.getCell(3, i + 1).value = h;
    });
    applyHeaderStyle(headerRow, COLORS.primaryGreen);

    // Data — all employees
    const stats = calculatePersonnelStats(data);
    stats.forEach((s, idx) => {
        const rowNum = 4 + idx;
        ws.getCell(rowNum, 1).value = s.name;
        ws.getCell(rowNum, 2).value = s.code;
        ws.getCell(rowNum, 3).value = s.shiftCount;
        ws.getCell(rowNum, 4).value = s.shiftHours;
        ws.getCell(rowNum, 5).value = Number(s.operationHours.toFixed(1));
        ws.getCell(rowNum, 6).value = `${s.utilization.toFixed(1)}%`;
        ws.getCell(rowNum, 7).value = s.maxConsecutiveWork;
        ws.getCell(rowNum, 8).value = s.nightCount;
        ws.getCell(rowNum, 9).value = s.weekendCount;

        // Conditional formatting
        const utilCell = ws.getCell(rowNum, 6);
        if (s.utilization > 85) {
            utilCell.font = { color: { argb: COLORS.primaryRed }, bold: true };
            utilCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightRed } };
        } else {
            utilCell.font = { color: { argb: COLORS.primaryGreen } };
        }

        const consCell = ws.getCell(rowNum, 7);
        if (s.maxConsecutiveWork > 6) {
            consCell.font = { color: { argb: COLORS.primaryRed }, bold: true };
        }

        // Borders & zebra
        for (let c = 1; c <= 9; c++) {
            const cell = ws.getCell(rowNum, c);
            cell.border = thinBorder;
            cell.alignment = { vertical: 'middle', horizontal: c >= 3 ? 'center' : 'left' };
            if (idx % 2 === 1 && !cell.fill) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraLight } };
            }
        }
    });

    // Summary row
    if (stats.length > 0) {
        const avgRowNum = 4 + stats.length;
        const avgShiftCount = stats.reduce((s, e) => s + e.shiftCount, 0) / stats.length;
        const avgShiftHours = stats.reduce((s, e) => s + e.shiftHours, 0) / stats.length;
        const avgOpHours = stats.reduce((s, e) => s + e.operationHours, 0) / stats.length;
        const avgUtil = stats.reduce((s, e) => s + e.utilization, 0) / stats.length;
        const avgConsec = stats.reduce((s, e) => s + e.maxConsecutiveWork, 0) / stats.length;
        const avgNight = stats.reduce((s, e) => s + e.nightCount, 0) / stats.length;
        const avgWeekend = stats.reduce((s, e) => s + e.weekendCount, 0) / stats.length;

        ws.getCell(avgRowNum, 1).value = '平均';
        ws.getCell(avgRowNum, 2).value = '-';
        ws.getCell(avgRowNum, 3).value = Number(avgShiftCount.toFixed(1));
        ws.getCell(avgRowNum, 4).value = Number(avgShiftHours.toFixed(1));
        ws.getCell(avgRowNum, 5).value = Number(avgOpHours.toFixed(1));
        ws.getCell(avgRowNum, 6).value = `${avgUtil.toFixed(1)}%`;
        ws.getCell(avgRowNum, 7).value = Number(avgConsec.toFixed(1));
        ws.getCell(avgRowNum, 8).value = Number(avgNight.toFixed(1));
        ws.getCell(avgRowNum, 9).value = Number(avgWeekend.toFixed(1));

        for (let c = 1; c <= 9; c++) {
            const cell = ws.getCell(avgRowNum, c);
            cell.font = { bold: true, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.summaryYellow } };
            cell.border = thinBorder;
            cell.alignment = { vertical: 'middle', horizontal: c >= 3 ? 'center' : 'left' };
        }
    }

    // Auto filter
    if (stats.length > 0) {
        ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + stats.length, column: 9 } };
    }

    // Column widths
    const colWidths = [14, 10, 10, 14, 14, 10, 14, 10, 12];
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // Freeze header
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, activeCell: 'A4' }];
}

function buildGapsSheet(wb: ExcelJS.Workbook, data: ResultData) {
    const ws = wb.addWorksheet('覆盖缺口', { properties: { tabColor: { argb: COLORS.primaryRed } } });

    // Find gaps from assignments
    const gaps = (data.assignments || []).filter(a => !a.employee_name || a.employee_name === '-' || a.employee_name === '');

    // Title
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = '覆盖缺口分析';
    titleCell.font = { bold: true, size: 16, color: { argb: COLORS.darkText } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Subtitle
    ws.mergeCells('A2:I2');
    const subCell = ws.getCell('A2');
    const gapCount = gaps.length;
    const unassignedPositions = data.details.total_positions - data.details.assigned_positions;
    subCell.value = `共 ${unassignedPositions} 个未覆盖岗位`;
    subCell.font = { bold: true, size: 13, color: { argb: COLORS.primaryRed } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };

    if (gapCount === 0 && unassignedPositions === 0) {
        ws.getCell('A4').value = '所有岗位均已覆盖，无缺口。';
        ws.getCell('A4').font = { size: 14, color: { argb: COLORS.primaryGreen } };
        return;
    }

    // Headers
    const headers = ['日期', '批次号', '工序名称', '岗位号', '计划开始', '计划结束', '所需资质', '备注'];
    const headerRow = ws.getRow(4);
    headers.forEach((h, i) => { ws.getCell(4, i + 1).value = h; });
    applyHeaderStyle(headerRow, COLORS.primaryRed);

    // Data
    const sortedGaps = [...gaps].sort((a, b) => (a.planned_start || '').localeCompare(b.planned_start || ''));
    sortedGaps.forEach((g, idx) => {
        const rowNum = 5 + idx;
        const dateStr = g.planned_start ? g.planned_start.split('T')[0] : '';
        ws.getCell(rowNum, 1).value = formatDate(dateStr);
        ws.getCell(rowNum, 2).value = g.batch_code || '';
        ws.getCell(rowNum, 3).value = g.operation_name || '';
        ws.getCell(rowNum, 4).value = g.position_number || 1;
        ws.getCell(rowNum, 5).value = formatTime(g.planned_start);
        ws.getCell(rowNum, 6).value = formatTime(g.planned_end);
        ws.getCell(rowNum, 7).value = g.qualification_name || '';
        ws.getCell(rowNum, 8).value = '';

        for (let c = 1; c <= 8; c++) {
            const cell = ws.getCell(rowNum, c);
            cell.border = thinBorder;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightRed } };
            cell.alignment = { vertical: 'middle', horizontal: c === 4 ? 'center' : 'left' };
        }
        // Bold red on gap count column (position)
        ws.getCell(rowNum, 4).font = { bold: true, color: { argb: COLORS.primaryRed } };
    });

    // Summary row
    if (sortedGaps.length > 0) {
        const sumRow = 5 + sortedGaps.length;
        ws.getCell(sumRow, 1).value = '合计';
        ws.getCell(sumRow, 4).value = sortedGaps.length;
        for (let c = 1; c <= 8; c++) {
            const cell = ws.getCell(sumRow, c);
            cell.font = { bold: true, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.lightOrange } };
            cell.border = thinBorder;
            cell.alignment = { vertical: 'middle', horizontal: c === 4 ? 'center' : 'left' };
        }
    }

    // Auto filter
    if (sortedGaps.length > 0) {
        ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + sortedGaps.length, column: 8 } };
    }

    // Column widths
    const colWidths = [12, 14, 18, 8, 10, 10, 14, 16];
    colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

// ── Main Export Function ───────────────────────────────────────

/**
 * 导出 V4 排班结果为 Excel 文件
 */
export async function exportV4ScheduleToExcel(data: ResultData, runId: number): Promise<void> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'APS V4 排班系统';
    wb.created = new Date();

    buildSummarySheet(wb, data, runId);
    buildCalendarSheet(wb, data);
    buildOperationsSheet(wb, data);
    buildStatsSheet(wb, data);
    buildGapsSheet(wb, data);

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `排班结果_V4-${runId}.xlsx`);
}
