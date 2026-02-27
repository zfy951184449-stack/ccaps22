/**
 * V4 排班结果 Excel 导出工具
 * 
 * 生成包含 4 个 Sheet 的 xlsx 文件：
 * 1. 求解概览 (Summary)
 * 2. 人员排班 (Shift Assignments)
 * 3. 工序分配 (Operation Assignments)
 * 4. 人员统计 (Personnel Stats)
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

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

/**
 * 导出 V4 排班结果为 Excel 文件
 */
export function exportV4ScheduleToExcel(data: ResultData, runId: number): void {
    const wb = XLSX.utils.book_new();

    // Sheet 1: 求解概览
    const summaryData = [
        ['V4 排班结果概览'],
        [],
        ['指标', '数值'],
        ['分配完成率', `${data.metrics.completion_rate}%`],
        ['操作覆盖率', `${data.metrics.coverage_rate}%`],
        ['平均满意度', `${data.metrics.satisfaction}%`],
        ['求解耗时', `${data.metrics.solve_time}s`],
        [],
        ['总岗位数', data.details.total_positions],
        ['已分配岗位', data.details.assigned_positions],
        ['总操作数', data.details.total_operations],
        ['已覆盖操作', data.details.covered_operations],
        [],
        ['参与员工数', new Set(data.shift_assignments?.map(s => s.employee_id) || []).size],
        ['排班时间范围', getDateRange(data.calendar_days)],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, '求解概览');

    // Sheet 2: 人员排班
    const shiftHeaders = ['员工姓名', '工号', '日期', '班次', '开始时间', '结束时间', '班次工时(h)'];
    const shiftRows = (data.shift_assignments || []).map(s => [
        s.employee_name || `员工 ${s.employee_id}`,
        s.employee_code || '',
        formatDate(s.date),
        s.shift_name || '',
        s.start_time || '',
        s.end_time || '',
        s.nominal_hours || 0
    ]);
    const wsShifts = XLSX.utils.aoa_to_sheet([shiftHeaders, ...shiftRows]);
    wsShifts['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsShifts, '人员排班');

    // Sheet 3: 工序分配
    const assignHeaders = ['批次号', '工序名称', '计划开始', '计划结束', '岗位号', '员工姓名', '工号'];
    const assignRows = (data.assignments || []).map(a => [
        a.batch_code || '',
        a.operation_name || '',
        formatDateTime(a.planned_start),
        formatDateTime(a.planned_end),
        a.position_number || 1,
        a.employee_name || '',
        a.employee_code || ''
    ]);
    const wsAssign = XLSX.utils.aoa_to_sheet([assignHeaders, ...assignRows]);
    wsAssign['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 8 }, { wch: 15 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsAssign, '工序分配');

    // Sheet 4: 人员统计
    const personnelStats = calculatePersonnelStats(data);
    const statsHeaders = ['员工姓名', '工号', '排班天数', '排班工时(h)', '操作工时(h)', '利用率', '最大连续工作天数'];
    const statsRows = personnelStats.map(s => [
        s.name,
        s.code,
        s.shiftCount,
        s.shiftHours,
        s.operationHours.toFixed(1),
        `${s.utilization.toFixed(1)}%`,
        s.maxConsecutiveWork
    ]);
    const wsStats = XLSX.utils.aoa_to_sheet([statsHeaders, ...statsRows]);
    wsStats['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsStats, '人员统计');

    // Sheet 5: 排班日历 (Employee × Date Pivot - Who works What Shift When)
    const calendarSheet = buildCalendarSheet(data);
    XLSX.utils.book_append_sheet(wb, calendarSheet, '排班日历');

    // 生成并下载
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut], { type: 'application/octet-stream' });
    saveAs(blob, `排班结果_V4-${runId}.xlsx`);
}

/**
 * Build calendar pivot sheet: rows = employees, columns = dates, cells = shift + hours
 */
function buildCalendarSheet(data: ResultData): XLSX.WorkSheet {
    const dates = (data.calendar_days || []).map(d => d.date).sort();

    // Build employee → date → shift info map
    const empShiftMap = new Map<number, {
        name: string;
        code: string;
        shifts: Map<string, { shiftName: string; hours: number }>
    }>();

    (data.shift_assignments || []).forEach(s => {
        if (!empShiftMap.has(s.employee_id)) {
            empShiftMap.set(s.employee_id, {
                name: s.employee_name || `员工 ${s.employee_id}`,
                code: s.employee_code || '',
                shifts: new Map()
            });
        }
        const emp = empShiftMap.get(s.employee_id)!;
        const hours = Number(s.nominal_hours) || 0;
        emp.shifts.set(s.date, {
            shiftName: s.shift_name || s.shift_code || '-',
            hours
        });
    });

    // Header row: ['员工姓名', date1, date2, ...]
    const headerRow = ['员工姓名', ...dates.map(d => formatShortDate(d))];

    // Data rows: [name, shift+hours, shift+hours, ...]
    const dataRows = Array.from(empShiftMap.values()).map(emp => {
        const row: string[] = [emp.name];
        dates.forEach(d => {
            const info = emp.shifts.get(d);
            if (info && info.hours > 0) {
                row.push(`${info.shiftName}\n${info.hours}h`);
            } else if (info) {
                row.push(info.shiftName);
            } else {
                row.push('-');
            }
        });
        return row;
    });

    const wsCalendar = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);

    // Set column widths (wider for shift+hours)
    const colWidths = [{ wch: 14 }, ...dates.map(() => ({ wch: 10 }))];
    wsCalendar['!cols'] = colWidths;

    return wsCalendar;
}

function formatShortDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

// --- Helpers ---

function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${formatDate(dateStr)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getDateRange(calendarDays?: { date: string }[]): string {
    if (!calendarDays?.length) return '-';
    const dates = calendarDays.map(d => d.date).sort();
    return `${formatDate(dates[0])} ~ ${formatDate(dates[dates.length - 1])}`;
}

interface PersonnelStat {
    id: number;
    name: string;
    code: string;
    shiftCount: number;
    shiftHours: number;
    operationHours: number;
    utilization: number;
    maxConsecutiveWork: number;
}

function calculatePersonnelStats(data: ResultData): PersonnelStat[] {
    const allDates = (data.calendar_days || []).map(d => d.date);
    const empMap = new Map<number, {
        id: number;
        name: string;
        code: string;
        shiftCount: number;
        shiftHours: number;
        operationHours: number;
        dates: Map<string, boolean>;
    }>();

    // Process Shifts
    (data.shift_assignments || []).forEach(s => {
        const hours = Number(s.nominal_hours) || 0;
        const isWorkShift = hours > 0;

        if (!empMap.has(s.employee_id)) {
            empMap.set(s.employee_id, {
                id: s.employee_id,
                name: s.employee_name || `员工 ${s.employee_id}`,
                code: s.employee_code || '',
                shiftCount: 0,
                shiftHours: 0,
                operationHours: 0,
                dates: new Map()
            });
        }
        const emp = empMap.get(s.employee_id)!;
        emp.dates.set(s.date, isWorkShift);
        if (isWorkShift) emp.shiftCount++;
        emp.shiftHours += hours;
    });

    // Process Assignments
    (data.assignments || []).forEach(a => {
        const start = new Date(a.planned_start).getTime();
        const end = new Date(a.planned_end).getTime();
        const durationHours = (end - start) / 3600000;

        if (empMap.has(a.employee_id)) {
            empMap.get(a.employee_id)!.operationHours += durationHours;
        }
    });

    return Array.from(empMap.values()).map(emp => {
        // Calculate max consecutive work days
        let consecutiveWork = 0;
        let maxWork = 0;
        allDates.forEach(dateStr => {
            const isWork = emp.dates.get(dateStr) ?? false;
            if (isWork) {
                consecutiveWork++;
                maxWork = Math.max(maxWork, consecutiveWork);
            } else {
                consecutiveWork = 0;
            }
        });

        const utilization = emp.shiftHours > 0 ? (emp.operationHours / emp.shiftHours) * 100 : 0;

        return {
            id: emp.id,
            name: emp.name,
            code: emp.code,
            shiftCount: emp.shiftCount,
            shiftHours: emp.shiftHours,
            operationHours: emp.operationHours,
            utilization,
            maxConsecutiveWork: maxWork
        };
    });
}
