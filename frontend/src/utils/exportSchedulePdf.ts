/**
 * V4 排班结果 PDF 导出工具 (原生打印版)
 * 
 * 使用浏览器 window.print() 生成高质量矢量 PDF
 */

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
 * 导出 V4 排班结果为 PDF 文件 (分块渲染以避免 canvas 高度限制)
 */
/**
 * 导出 V4 排班结果为 PDF 文件 (使用浏览器原生打印)
 */
export async function exportV4ScheduleToPdf(data: ResultData, runId: number): Promise<void> {
    console.log('[Print Export] Starting native print export...');

    // Create print frame
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
        throw new Error('Could not create print frame');
    }

    // Generate content
    const summaryHtml = buildSummarySection(data, runId);
    const dailyOpsHtml = buildDailyOperationsList(data.assignments || []);
    const statsHtml = buildStatsSection(data);

    // Build full HTML document
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>排班结果_V4-${runId}</title>
            <style>
                /* Reset & Base */
                * { box-sizing: border-box; }
                body { 
                    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
                    margin: 0;
                    padding: 20px;
                    background: white;
                    color: #1f1f1f;
                    font-size: 12px;
                    line-height: 1.5;
                }

                /* Print Settings */
                @media print {
                    @page { 
                        size: A4 landscape; 
                        margin: 10mm; 
                    }
                    body { 
                        -webkit-print-color-adjust: exact; 
                        print-color-adjust: exact; 
                        padding: 0;
                    }
                    .no-print { display: none; }
                    .page-break { break-before: page; }
                    .avoid-break { break-inside: avoid; }
                }

                /* Layout Utilities */
                .section { margin-bottom: 30px; }
                
                /* Typography */
                h1 { font-size: 24px; margin: 0 0 20px; text-align: center; color: #1f1f1f; }
                h2 { 
                    font-size: 16px; 
                    margin: 25px 0 15px; 
                    padding-bottom: 8px;
                    font-weight: 600;
                    border-bottom: 2px solid #eee;
                }
                
                /* Metrics Cards */
                .metrics-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 15px;
                    margin-bottom: 30px;
                }
                .metric-card {
                    padding: 15px;
                    border-radius: 8px;
                    text-align: center;
                }
                .metric-label { font-size: 12px; color: #666; margin-bottom: 4px; }
                .metric-value { font-size: 24px; font-weight: 600; }

                /* Tables */
                table { width: 100%; border-collapse: collapse; margin-bottom: 10px; table-layout: fixed; }
                th { 
                    padding: 6px 8px; 
                    text-align: left; 
                    font-weight: 600;
                    font-size: 11px;
                    background: #fafafa;
                    border-bottom: 1px solid #e8e8e8;
                }
                td { 
                    padding: 5px 8px; 
                    border-bottom: 1px solid #f0f0f0; 
                    font-size: 11px;
                    vertical-align: middle;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                /* Daily Operations */
                .daily-section { break-before: page; }
                /* First daily section shouldn't break if it follows summary (optional, but requested strict paging) */
                .daily-section:first-of-type { break-before: always; } 
                
                .daily-header {
                    background: linear-gradient(135deg, #fa8c16 0%, #faad14 100%);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 6px 6px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 20px;
                    margin-bottom: 0;
                }
                .daily-content {
                    background: #fff;
                    padding: 10px 0;
                }
                .batch-card {
                    background: white;
                    border: 1px solid #f0f0f0;
                    border-left: 4px solid #fa8c16;
                    border-radius: 4px;
                    padding: 10px;
                    margin-bottom: 10px;
                    break-inside: avoid;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
                }
                .batch-header {
                    font-weight: 600;
                    font-size: 12px;
                    color: #fa8c16;
                    margin-bottom: 6px;
                    display: flex;
                    align-items: center;
                }

                /* Footer */
                .footer {
                    text-align: right;
                    margin-top: 10px;
                    color: #999;
                    font-size: 10px;
                }
            </style>
        </head>
        <body>
            <!-- Section 1: Summary & Calendar -->
            <div class="section">
                ${summaryHtml}
            </div>

            <!-- Section 2: Daily Operations -->
            <!-- Wrapped in a container but breaks are handled by .daily-section -->
            ${dailyOpsHtml}

            <!-- Section 3: Personnel Stats -->
            <div class="section page-break">
                ${statsHtml}
            </div>
        </body>
        </html>
    `);
    doc.close();

    // Print with delay to ensure styles/images load
    setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();

        // Remove iframe after print dialog closes (approximate)
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 60000);
    }, 500);
}

function buildSummarySection(data: ResultData, runId: number): string {
    const calendarData = buildCalendarPivotWithWorkdays(data);

    return `
        <h1 style="text-align: center; font-size: 24px; margin-bottom: 30px; color: #1a1a1a;">
            V4 排班结果报告
        </h1>

        <!-- Metrics Summary -->
        <div class="metrics-grid">
            <div class="metric-card" style="background: #f0f5ff;">
                <div class="metric-label">分配完成率</div>
                <div class="metric-value" style="color: #1890ff;">${data.metrics.completion_rate}%</div>
            </div>
            <div class="metric-card" style="background: #f6ffed;">
                <div class="metric-label">操作覆盖率</div>
                <div class="metric-value" style="color: #52c41a;">${data.metrics.coverage_rate}%</div>
            </div>
            <div class="metric-card" style="background: #fff7e6;">
                <div class="metric-label">总岗位</div>
                <div class="metric-value" style="color: #fa8c16;">${data.details.assigned_positions}/${data.details.total_positions}</div>
            </div>
            <div class="metric-card" style="background: #f9f0ff;">
                <div class="metric-label">求解耗时</div>
                <div class="metric-value" style="color: #722ed1;">${data.metrics.solve_time}s</div>
            </div>
        </div>

        <!-- Calendar Pivot -->
        <h2 style="border-bottom-color: #1890ff; color: #1f1f1f;">
            排班日历
        </h2>
        ${buildCalendarTableWithWorkdays(calendarData)}
        
        <div class="footer">
            生成时间: ${new Date().toLocaleString('zh-CN')}
        </div>
    `;
}

function buildStatsSection(data: ResultData): string {
    const personnelStats = calculatePersonnelStats(data);

    return `
        <h2 style="border-bottom-color: #52c41a; color: #1f1f1f;">
            人员统计
        </h2>
        ${buildStatsTable(personnelStats)}
        
        <div class="footer">
            生成时间: ${new Date().toLocaleString('zh-CN')}
        </div>
    `;
}

/**
 * Build daily operations list
 */
function buildDailyOperationsList(assignments: any[]): string {
    if (assignments.length === 0) return '';

    // Group by date
    const dailyMap = new Map<string, Map<string, any[]>>();
    assignments.forEach(a => {
        const dateStr = a.planned_start ? a.planned_start.split('T')[0] : 'unknown';
        const batchCode = a.batch_code || '未知批次';
        if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, new Map());
        const batchMap = dailyMap.get(dateStr)!;
        if (!batchMap.has(batchCode)) batchMap.set(batchCode, []);
        batchMap.get(batchCode)!.push(a);
    });

    const sortedDates = Array.from(dailyMap.keys()).sort();

    return sortedDates.map(dateStr => {
        const batchMap = dailyMap.get(dateStr)!;
        const formattedDate = formatDateChinese(dateStr);
        const totalOps = Array.from(batchMap.values()).reduce((sum, arr) => sum + arr.length, 0);

        const batchCards = Array.from(batchMap.entries()).map(([batchCode, ops]) => {
            ops.sort((a, b) => (a.planned_start || '').localeCompare(b.planned_start || ''));

            const opRows = ops.map(op => `
                <tr>
                    <td style="width: 30%;" title="${op.operation_name}">${op.operation_name || '-'}</td>
                    <td style="text-align: center; width: 15%;">${formatTime(op.planned_start)}</td>
                    <td style="text-align: center; width: 15%;">${formatTime(op.planned_end)}</td>
                    <td style="text-align: center; width: 15%;">${op.position_number || 1}</td>
                    <td style="width: 25%;">${op.employee_name || '-'}</td>
                </tr>
            `).join('');

            return `
                <div class="batch-card">
                    <div class="batch-header">
                        📦 ${batchCode}
                        <span style="font-weight: normal; color: #999; font-size: 10px; margin-left: 8px;">${ops.length} 项工序</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30%;">工序</th>
                                <th style="text-align: center; width: 15%;">开始</th>
                                <th style="text-align: center; width: 15%;">结束</th>
                                <th style="text-align: center; width: 15%;">岗位</th>
                                <th style="width: 25%;">员工</th>
                            </tr>
                        </thead>
                        <tbody>${opRows}</tbody>
                    </table>
                </div>
            `;
        }).join('');

        return `
            <div class="daily-section">
                <div class="daily-header">
                    <div style="font-size: 14px; font-weight: 600;">📅 ${formattedDate}</div>
                    <div style="font-size: 11px; opacity: 0.9;">${batchMap.size} 个批次 · ${totalOps} 项工序</div>
                </div>
                <div class="daily-content">
                    ${batchCards}
                </div>
            </div>
        `;
    }).join('');
}

function formatDateChinese(dateStr: string): string {
    if (!dateStr || dateStr === 'unknown') return '未知日期';
    const d = new Date(dateStr);
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
}

function formatTime(dateTimeStr: string): string {
    if (!dateTimeStr) return '-';
    const d = new Date(dateTimeStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateTime(dateStr: string): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface CalendarDataWithWorkdays {
    headers: { label: string; isWorkday: boolean }[];
    rows: string[][];
}

function buildCalendarTableWithWorkdays(calendarData: CalendarDataWithWorkdays): string {
    if (calendarData.headers.length === 0) {
        return '<p style="color: #999;">暂无日历数据</p>';
    }

    // Chunk dates into 14-day segments to prevent horizontal overflow
    const DATES_PER_CHUNK = 14;
    const dateHeaders = calendarData.headers.slice(1); // Remove '姓名' column
    const numChunks = Math.ceil(dateHeaders.length / DATES_PER_CHUNK);

    const tables: string[] = [];

    for (let chunk = 0; chunk < numChunks; chunk++) {
        const startIdx = chunk * DATES_PER_CHUNK;
        const endIdx = Math.min(startIdx + DATES_PER_CHUNK, dateHeaders.length);
        const chunkDates = dateHeaders.slice(startIdx, endIdx);

        // Build header row with workday/non-workday colors
        // Workday: blue, Non-workday: gray
        const headerCells = [
            `<th style="padding: 6px 10px; background: #1890ff; color: white; border: 1px solid #096dd9; font-size: 11px; white-space: nowrap; font-weight: 600;">姓名</th>`,
            ...chunkDates.map(h => {
                const bgColor = h.isWorkday ? '#1890ff' : '#8c8c8c';
                const borderColor = h.isWorkday ? '#096dd9' : '#595959';
                return `<th style="padding: 6px 10px; background: ${bgColor}; color: white; border: 1px solid ${borderColor}; font-size: 11px; white-space: nowrap; font-weight: 500;">${h.label}</th>`;
            })
        ].join('');

        // Build body rows for this chunk with shift-based coloring
        const bodyRows = calendarData.rows.map(row => {
            const name = row[0];
            const chunkCells = row.slice(startIdx + 1, endIdx + 1);
            const cells = [name, ...chunkCells].map((cell, i) => {
                const isName = i === 0;
                const style = isName
                    ? 'background: #fafafa; font-weight: 500;'
                    : getShiftCellStyle(cell);
                return `<td style="padding: 5px 10px; border: 1px solid #e8e8e8; font-size: 10px; text-align: ${isName ? 'left' : 'center'}; white-space: nowrap; ${style}">${cell}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        // Add chunk label with page-break-inside: avoid to prevent mid-table breaks
        const chunkLabel = numChunks > 1
            ? `<div style="font-size: 12px; color: #1890ff; margin: 20px 0 10px; font-weight: 600; border-left: 3px solid #1890ff; padding-left: 10px;">第 ${chunk + 1}/${numChunks} 周期 (${chunkDates[0].label} - ${chunkDates[chunkDates.length - 1].label})</div>`
            : '';

        // Wrap each chunk in a div with page-break-inside: avoid
        tables.push(`
            <div style="page-break-inside: avoid; break-inside: avoid;">
                ${chunkLabel}
                <table style="width: auto; border-collapse: collapse; font-size: 11px; margin-bottom: 25px;">
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>
        `);
    }

    // Add legend with workday indicator
    const legend = `
        <div style="display: flex; gap: 15px; margin-bottom: 15px; font-size: 10px; flex-wrap: wrap;">
            <span style="font-weight: 600;">表头颜色:</span>
            <span><span style="display: inline-block; width: 12px; height: 12px; background: #1890ff; border: 1px solid #096dd9; margin-right: 4px;"></span>工作日</span>
            <span><span style="display: inline-block; width: 12px; height: 12px; background: #8c8c8c; border: 1px solid #595959; margin-right: 4px;"></span>休息日</span>
            <span style="margin-left: 20px; font-weight: 600;">班次颜色:</span>
            <span><span style="display: inline-block; width: 12px; height: 12px; background: #e6f7e6; border: 1px solid #b7eb8f; margin-right: 4px;"></span>早/白班</span>
            <span><span style="display: inline-block; width: 12px; height: 12px; background: #f9f0ff; border: 1px solid #d3adf7; margin-right: 4px;"></span>夜/晚班</span>
            <span><span style="display: inline-block; width: 12px; height: 12px; background: #e6f4ff; border: 1px solid #91caff; margin-right: 4px;"></span>长白班</span>
            <span><span style="display: inline-block; width: 12px; height: 12px; background: #fff7e6; border: 1px solid #ffc53d; margin-right: 4px;"></span>基础班</span>
            <span><span style="display: inline-block; width: 12px; height: 12px; background: #f5f5f5; border: 1px solid #d9d9d9; margin-right: 4px;"></span>休息</span>
        </div>
    `;

    return legend + tables.join('');
}

/**
 * Get cell style based on shift name
 */
function getShiftCellStyle(cellContent: string): string {
    const content = cellContent.toLowerCase();

    // Rest / Off
    if (content.includes('休息') || content === '-' || content.includes('休') || content === '') {
        return 'background: #f5f5f5; color: #999;';
    }
    // Night shift
    if (content.includes('夜') || content.includes('晚')) {
        return 'background: #f9f0ff; color: #722ed1;';
    }
    // Day shift / Morning shift
    if (content.includes('早') || content.includes('白班')) {
        return 'background: #e6f7e6; color: #389e0d;';
    }
    // Long day shift
    if (content.includes('长白') || content.includes('长日')) {
        return 'background: #e6f4ff; color: #1890ff;';
    }
    // Base/Foundation shift
    if (content.includes('基础')) {
        return 'background: #fff7e6; color: #d48806;';
    }
    // Default
    return 'background: #fff;';
}

function buildStatsTable(stats: any[]): string {
    const headers = ['员工姓名', '排班天数', '排班工时', '操作工时', '利用率', '最大连续'];
    const headerCells = headers.map(h =>
        `<th style="padding: 8px 12px; background: #f6ffed; border: 1px solid #b7eb8f; font-size: 11px;">${h}</th>`
    ).join('');

    const bodyRows = stats.slice(0, 15).map(s => `
        <tr>
            <td style="padding: 6px 12px; border: 1px solid #e8e8e8;">${s.name}</td>
            <td style="padding: 6px 12px; border: 1px solid #e8e8e8; text-align: center;">${s.shiftCount}天</td>
            <td style="padding: 6px 12px; border: 1px solid #e8e8e8; text-align: center;">${s.shiftHours}h</td>
            <td style="padding: 6px 12px; border: 1px solid #e8e8e8; text-align: center;">${s.operationHours.toFixed(1)}h</td>
            <td style="padding: 6px 12px; border: 1px solid #e8e8e8; text-align: center; color: ${s.utilization > 85 ? '#ff4d4f' : '#52c41a'};">${s.utilization.toFixed(1)}%</td>
            <td style="padding: 6px 12px; border: 1px solid #e8e8e8; text-align: center; color: ${s.maxConsecutiveWork > 6 ? '#ff4d4f' : 'inherit'};">${s.maxConsecutiveWork}天</td>
        </tr>
    `).join('');

    return `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
}

// --- Helpers ---

function buildCalendarPivotWithWorkdays(data: ResultData): CalendarDataWithWorkdays {
    const calendarDays = (data.calendar_days || []).sort((a, b) => a.date.localeCompare(b.date));
    if (calendarDays.length === 0) return { headers: [], rows: [] };

    const workdayMap = new Map<string, boolean>();
    calendarDays.forEach(d => workdayMap.set(d.date, d.is_workday));

    const empShiftMap = new Map<number, {
        name: string;
        shifts: Map<string, { shiftName: string; hours: number }>
    }>();

    (data.shift_assignments || []).forEach(s => {
        if (!empShiftMap.has(s.employee_id)) {
            empShiftMap.set(s.employee_id, {
                name: s.employee_name || `员工 ${s.employee_id}`,
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

    // Headers include workday info
    const headers: { label: string; isWorkday: boolean }[] = [
        { label: '姓名', isWorkday: true },
        ...calendarDays.map(d => ({
            label: formatShortDate(d.date),
            isWorkday: d.is_workday
        }))
    ];

    const rows = Array.from(empShiftMap.values()).map(emp => {
        const row: string[] = [emp.name];
        calendarDays.forEach(d => {
            const info = emp.shifts.get(d.date);
            if (info && info.hours > 0) {
                row.push(`${info.shiftName} ${info.hours}h`);
            } else if (info) {
                row.push(info.shiftName);
            } else {
                row.push('-');
            }
        });
        return row;
    });

    return { headers, rows };
}

// Keep original for backward compatibility (used elsewhere)
function buildCalendarPivot(data: ResultData): { headers: string[]; rows: string[][] } {
    const result = buildCalendarPivotWithWorkdays(data);
    return {
        headers: result.headers.map(h => h.label),
        rows: result.rows
    };
}

function formatShortDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface PersonnelStat {
    name: string;
    shiftCount: number;
    shiftHours: number;
    operationHours: number;
    utilization: number;
    maxConsecutiveWork: number;
}

function calculatePersonnelStats(data: ResultData): PersonnelStat[] {
    const allDates = (data.calendar_days || []).map(d => d.date);
    const empMap = new Map<number, {
        name: string;
        shiftCount: number;
        shiftHours: number;
        operationHours: number;
        dates: Map<string, boolean>;
    }>();

    (data.shift_assignments || []).forEach(s => {
        const hours = Number(s.nominal_hours) || 0;
        const isWorkShift = hours > 0;

        if (!empMap.has(s.employee_id)) {
            empMap.set(s.employee_id, {
                name: s.employee_name || `员工 ${s.employee_id}`,
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

    (data.assignments || []).forEach(a => {
        const start = new Date(a.planned_start).getTime();
        const end = new Date(a.planned_end).getTime();
        const durationHours = (end - start) / 3600000;

        if (empMap.has(a.employee_id)) {
            empMap.get(a.employee_id)!.operationHours += durationHours;
        }
    });

    return Array.from(empMap.values()).map(emp => {
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

        return {
            name: emp.name,
            shiftCount: emp.shiftCount,
            shiftHours: emp.shiftHours,
            operationHours: emp.operationHours,
            utilization: emp.shiftHours > 0 ? (emp.operationHours / emp.shiftHours) * 100 : 0,
            maxConsecutiveWork: maxWork
        };
    });
}
