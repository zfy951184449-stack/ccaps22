/**
 * V4 排班结果 PDF 导出工具 (原生打印版)
 *
 * 使用浏览器 window.print() 生成高质量矢量 PDF
 *
 * 页面结构（5 页）：
 * 1. 封面 — 报告标题 + KPI + 排班日历
 * 2-3. 工序日程 — 按日期分组的工序安排
 * 4. 人员统计 — 全量员工数据
 * 5. 覆盖缺口 — 未分配岗位清单
 *
 * 设计原则：
 * - 无 emoji — 使用色块 + 文字标签
 * - 专业排版 — 蓝色主题，左侧色条章节标题
 * - 页眉页脚 — 报告标题 + 页码 + 生成时间
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
 * 导出 V4 排班结果为 PDF 文件
 */
export async function exportV4ScheduleToPdf(data: ResultData, runId: number): Promise<void> {
    console.log('[Print Export] Starting native print export...');

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
        throw new Error('Could not create print frame');
    }

    const dateRange = getDateRange(data.calendar_days);
    const uniqueEmployees = new Set(data.shift_assignments?.map(s => s.employee_id) || []).size;
    const generatedAt = new Date().toLocaleString('zh-CN');

    const summaryHtml = buildSummarySection(data, runId, dateRange, uniqueEmployees);
    const dailyOpsHtml = buildDailyOperationsList(data.assignments || []);
    const statsHtml = buildStatsSection(data);
    const gapsHtml = buildGapsSection(data);

    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>排班结果_V4-${runId}</title>
            <style>
                /* ── Reset & Base ── */
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif;
                    background: white;
                    color: #1f1f1f;
                    font-size: 11px;
                    line-height: 1.5;
                    padding: 0;
                }

                /* ── Print Settings ── */
                @media print {
                    @page {
                        size: A4 landscape;
                        margin: 12mm 10mm 14mm 10mm;
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

                /* ── Page Header / Footer ── */
                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: 6px;
                    border-bottom: 1px solid #e8e8e8;
                    margin-bottom: 16px;
                    font-size: 10px;
                    color: #999;
                }
                .page-footer {
                    display: flex;
                    justify-content: space-between;
                    border-top: 1px solid #e8e8e8;
                    padding-top: 6px;
                    margin-top: 16px;
                    font-size: 9px;
                    color: #999;
                }

                /* ── Section Headings ── */
                .section-title {
                    font-size: 15px;
                    font-weight: 700;
                    color: #1f1f1f;
                    padding-left: 12px;
                    border-left: 4px solid #1890ff;
                    margin: 20px 0 12px;
                    line-height: 1.4;
                }
                .section-title.green { border-left-color: #52c41a; }
                .section-title.orange { border-left-color: #fa8c16; }
                .section-title.red { border-left-color: #ff4d4f; }

                /* ── Report Title ── */
                .report-title {
                    text-align: center;
                    font-size: 26px;
                    font-weight: 700;
                    color: #1a1a1a;
                    margin: 10px 0 6px;
                }
                .report-subtitle {
                    text-align: center;
                    font-size: 12px;
                    color: #666;
                    margin-bottom: 20px;
                }
                .title-separator {
                    border: none;
                    border-top: 1.5px solid #e8e8e8;
                    margin: 0 auto 20px;
                    width: 60%;
                }

                /* ── Metrics Cards ── */
                .metrics-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 14px;
                    margin-bottom: 24px;
                }
                .metric-card {
                    padding: 14px 10px;
                    border-radius: 8px;
                    text-align: center;
                    border: 1px solid;
                }
                .metric-card.blue { background: #e6f4ff; border-color: #91caff; }
                .metric-card.green { background: #f6ffed; border-color: #b7eb8f; }
                .metric-card.orange { background: #fff7e6; border-color: #ffd591; }
                .metric-card.purple { background: #f9f0ff; border-color: #d3adf7; }
                .metric-label { font-size: 11px; color: #666; margin-bottom: 4px; font-weight: 500; }
                .metric-value { font-size: 22px; font-weight: 700; }
                .metric-value.blue { color: #1890ff; }
                .metric-value.green { color: #52c41a; }
                .metric-value.orange { color: #fa8c16; }
                .metric-value.purple { color: #722ed1; }

                /* ── Tables ── */
                table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                th {
                    padding: 6px 8px;
                    text-align: left;
                    font-weight: 600;
                    font-size: 10px;
                    border: 1px solid #d9d9d9;
                    white-space: nowrap;
                }
                td {
                    padding: 5px 8px;
                    border: 1px solid #e8e8e8;
                    font-size: 10px;
                    vertical-align: middle;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                tr:nth-child(even) td { background: #fafafa; }

                /* ── Daily Operations ── */
                .daily-section { break-before: auto; margin-top: 16px; }
                .daily-section:first-of-type { break-before: page; }
                .daily-header {
                    background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
                    color: white;
                    padding: 8px 14px;
                    border-radius: 6px 6px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .daily-header-title { font-size: 13px; font-weight: 600; }
                .daily-header-meta { font-size: 10px; opacity: 0.9; }
                .batch-card {
                    background: white;
                    border: 1px solid #f0f0f0;
                    border-left: 4px solid #1890ff;
                    border-radius: 4px;
                    padding: 8px 10px;
                    margin: 6px 0;
                    break-inside: avoid;
                }
                .batch-label {
                    font-weight: 600;
                    font-size: 11px;
                    color: #1890ff;
                    margin-bottom: 4px;
                }
                .batch-meta {
                    font-weight: normal;
                    color: #999;
                    font-size: 9px;
                    margin-left: 6px;
                }

                /* ── Shift Cell Colors ── */
                .shift-morning { background: #e6f7e6; color: #389e0d; }
                .shift-night { background: #f9f0ff; color: #722ed1; }
                .shift-longday { background: #e6f4ff; color: #1890ff; }
                .shift-base { background: #fff7e6; color: #d48806; }
                .shift-rest { background: #f5f5f5; color: #999; }

                /* ── Legend ── */
                .legend {
                    display: flex;
                    gap: 14px;
                    margin: 8px 0 14px;
                    font-size: 10px;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .legend-swatch {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    border-radius: 2px;
                    border: 1px solid;
                }

                /* ── Status Badges ── */
                .status-ok { color: #52c41a; font-weight: 600; }
                .status-warn { color: #fa8c16; font-weight: 600; }
                .status-error { color: #ff4d4f; font-weight: 600; }

                /* ── Gap Section ── */
                .gap-summary {
                    background: #fff1f0;
                    border: 1px solid #ffccc7;
                    border-radius: 6px;
                    padding: 10px 16px;
                    margin-bottom: 14px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #ff4d4f;
                }
            </style>
        </head>
        <body>
            <!-- Page 1: Summary + Calendar -->
            <div>
                <div class="page-header">
                    <span>V4 排班结果报告</span>
                    <span>Run #${runId}</span>
                </div>
                ${summaryHtml}
                <div class="page-footer">
                    <span>生成时间: ${generatedAt}</span>
                    <span>排班结果_V4-${runId}</span>
                </div>
            </div>

            <!-- Page 2+: Daily Operations -->
            ${dailyOpsHtml}

            <!-- Page: Personnel Stats -->
            <div class="page-break">
                <div class="page-header">
                    <span>V4 排班结果报告 — 人员统计</span>
                    <span>Run #${runId}</span>
                </div>
                ${statsHtml}
                <div class="page-footer">
                    <span>生成时间: ${generatedAt}</span>
                    <span>排班结果_V4-${runId}</span>
                </div>
            </div>

            <!-- Page: Coverage Gaps -->
            <div class="page-break">
                <div class="page-header">
                    <span>V4 排班结果报告 — 覆盖缺口</span>
                    <span>Run #${runId}</span>
                </div>
                ${gapsHtml}
                <div class="page-footer">
                    <span>生成时间: ${generatedAt}</span>
                    <span>排班结果_V4-${runId}</span>
                </div>
            </div>
        </body>
        </html>
    `);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 60000);
    }, 500);
}

// ── Section Builders ───────────────────────────────────────────

function buildSummarySection(data: ResultData, runId: number, dateRange: string, uniqueEmployees: number): string {
    const calendarData = buildCalendarPivotWithWorkdays(data);

    return `
        <div class="report-title">排班结果报告</div>
        <hr class="title-separator" />
        <div class="report-subtitle">
            Run #${runId}  |  ${dateRange}  |  ${uniqueEmployees}名员工  |  ${(data.calendar_days || []).length}天
        </div>

        <!-- Metrics Summary -->
        <div class="metrics-grid">
            <div class="metric-card blue">
                <div class="metric-label">分配完成率</div>
                <div class="metric-value blue">${data.metrics.completion_rate}%</div>
            </div>
            <div class="metric-card green">
                <div class="metric-label">操作覆盖率</div>
                <div class="metric-value green">${data.metrics.coverage_rate}%</div>
            </div>
            <div class="metric-card orange">
                <div class="metric-label">岗位分配</div>
                <div class="metric-value orange">${data.details.assigned_positions}/${data.details.total_positions}</div>
            </div>
            <div class="metric-card purple">
                <div class="metric-label">质量评分</div>
                <div class="metric-value purple">${data.metrics.satisfaction}<span style="font-size:14px;color:#999;">/100</span></div>
            </div>
        </div>

        <!-- Calendar Pivot -->
        <div class="section-title">排班日历</div>
        ${buildCalendarLegend()}
        ${buildCalendarTableWithWorkdays(calendarData)}
    `;
}

function buildCalendarLegend(): string {
    return `
        <div class="legend">
            <span style="font-weight:600;">班次颜色:</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#e6f7e6;border-color:#b7eb8f;"></span>早班/白班</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#f9f0ff;border-color:#d3adf7;"></span>夜班/晚班</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#e6f4ff;border-color:#91caff;"></span>长白班</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#fff7e6;border-color:#ffc53d;"></span>基础班</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#f5f5f5;border-color:#d9d9d9;"></span>休息</span>
            <span style="margin-left:16px;font-weight:600;">表头颜色:</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#1890ff;border-color:#096dd9;"></span>工作日</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#8c8c8c;border-color:#595959;"></span>休息日</span>
        </div>
    `;
}

function buildStatsSection(data: ResultData): string {
    const personnelStats = calculatePersonnelStats(data);

    const headers = ['员工姓名', '排班天数', '排班工时', '操作工时', '利用率', '最大连续', '夜班', '周末班'];
    const headerCells = headers.map(h =>
        `<th style="padding:7px 10px; background:#52c41a; color:white; border:1px solid #b7eb8f; font-size:10px;">${h}</th>`
    ).join('');

    // Show ALL employees (no truncation)
    const bodyRows = personnelStats.map(s => {
        const utilColor = s.utilization > 85 ? '#ff4d4f' : '#52c41a';
        const utilBg = s.utilization > 85 ? '#fff1f0' : '';
        const consColor = s.maxConsecutiveWork > 6 ? '#ff4d4f' : 'inherit';
        return `
            <tr>
                <td style="font-weight:500;">${s.name}</td>
                <td style="text-align:center;">${s.shiftCount}天</td>
                <td style="text-align:center;">${s.shiftHours}h</td>
                <td style="text-align:center;">${s.operationHours.toFixed(1)}h</td>
                <td style="text-align:center; color:${utilColor}; font-weight:600;${utilBg ? ` background:${utilBg};` : ''}">${s.utilization.toFixed(1)}%</td>
                <td style="text-align:center; color:${consColor}; font-weight:${s.maxConsecutiveWork > 6 ? '600' : 'normal'};">${s.maxConsecutiveWork}天</td>
                <td style="text-align:center;">${s.nightCount}</td>
                <td style="text-align:center;">${s.weekendCount}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="section-title green">人员统计</div>
        <table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
}

function buildGapsSection(data: ResultData): string {
    const gaps = (data.assignments || []).filter(a => !a.employee_name || a.employee_name === '-' || a.employee_name === '');
    const unassigned = data.details.total_positions - data.details.assigned_positions;

    if (gaps.length === 0 && unassigned === 0) {
        return `
            <div class="section-title green">覆盖缺口</div>
            <p style="color:#52c41a; font-size:14px; font-weight:600; margin:16px 0;">所有岗位均已覆盖，无缺口。</p>
        `;
    }

    const sortedGaps = [...gaps].sort((a, b) => (a.planned_start || '').localeCompare(b.planned_start || ''));

    const headers = ['日期', '批次号', '工序名称', '岗位号', '计划开始', '计划结束'];
    const headerCells = headers.map(h =>
        `<th style="padding:7px 10px; background:#ff4d4f; color:white; border:1px solid #ffccc7; font-size:10px;">${h}</th>`
    ).join('');

    const bodyRows = sortedGaps.map(g => {
        const dateStr = g.planned_start ? g.planned_start.split('T')[0] : '';
        return `
            <tr>
                <td>${formatDate(dateStr)}</td>
                <td>${g.batch_code || '-'}</td>
                <td>${g.operation_name || '-'}</td>
                <td style="text-align:center; font-weight:600; color:#ff4d4f;">${g.position_number || 1}</td>
                <td style="text-align:center;">${formatTimePdf(g.planned_start)}</td>
                <td style="text-align:center;">${formatTimePdf(g.planned_end)}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="section-title red">覆盖缺口</div>
        <div class="gap-summary">
            共 ${unassigned} 个未覆盖岗位，涉及 ${sortedGaps.length} 条未分配记录
        </div>
        <table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
        </table>
    `;
}

/**
 * Build daily operations list — NO emoji, professional batch cards
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
                    <td style="width:16%; color:#1890ff; font-weight:500;">${op.stage_name || '-'}</td>
                    <td style="width:22%;" title="${op.operation_name}">${op.operation_name || '-'}</td>
                    <td style="text-align:center; width:12%;">${formatTimePdf(op.planned_start)}</td>
                    <td style="text-align:center; width:12%;">${formatTimePdf(op.planned_end)}</td>
                    <td style="text-align:center; width:8%;">${op.position_number || 1}</td>
                    <td style="width:16%;">${op.employee_name || '<span class="status-error">未分配</span>'}</td>
                    <td style="width:14%; text-align:center;">${op.employee_name ? '<span class="status-ok">已分配</span>' : '<span class="status-error">缺人</span>'}</td>
                </tr>
            `).join('');

            return `
                <div class="batch-card">
                    <div class="batch-label">
                        [批次] ${batchCode}
                        <span class="batch-meta">${ops.length} 项工序</span>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width:16%; background:#fafafa; border:1px solid #e8e8e8;">阶段</th>
                                <th style="width:22%; background:#fafafa; border:1px solid #e8e8e8;">工序</th>
                                <th style="text-align:center; width:12%; background:#fafafa; border:1px solid #e8e8e8;">开始</th>
                                <th style="text-align:center; width:12%; background:#fafafa; border:1px solid #e8e8e8;">结束</th>
                                <th style="text-align:center; width:8%; background:#fafafa; border:1px solid #e8e8e8;">岗位</th>
                                <th style="width:16%; background:#fafafa; border:1px solid #e8e8e8;">员工</th>
                                <th style="width:14%; text-align:center; background:#fafafa; border:1px solid #e8e8e8;">状态</th>
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
                    <div class="daily-header-title">[日期] ${formattedDate}</div>
                    <div class="daily-header-meta">${batchMap.size} 个批次 · ${totalOps} 项工序</div>
                </div>
                <div style="padding:4px 0;">
                    ${batchCards}
                </div>
            </div>
        `;
    }).join('');
}

// ── Helpers ────────────────────────────────────────────────────

function formatDateChinese(dateStr: string): string {
    if (!dateStr || dateStr === 'unknown') return '未知日期';
    const d = new Date(dateStr);
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
}

function formatTimePdf(dateTimeStr: string): string {
    if (!dateTimeStr) return '-';
    const d = new Date(dateTimeStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length >= 3) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    return dateStr;
}

function getDateRange(calendarDays?: { date: string }[]): string {
    if (!calendarDays?.length) return '-';
    const dates = calendarDays.map(d => d.date).sort();
    return `${formatDate(dates[0])} ~ ${formatDate(dates[dates.length - 1])}`;
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

// ── Calendar Pivot ─────────────────────────────────────────────

interface CalendarDataWithWorkdays {
    headers: { label: string; isWorkday: boolean }[];
    rows: { name: string; cells: { text: string; shiftName: string }[] }[];
}

function buildCalendarPivotWithWorkdays(data: ResultData): CalendarDataWithWorkdays {
    const calendarDays = (data.calendar_days || []).sort((a, b) => a.date.localeCompare(b.date));
    if (calendarDays.length === 0) return { headers: [], rows: [] };

    const empShiftMap = new Map<number, {
        name: string;
        shifts: Map<string, { shiftName: string; hours: number }>;
    }>();

    (data.shift_assignments || []).forEach(s => {
        if (!empShiftMap.has(s.employee_id)) {
            empShiftMap.set(s.employee_id, {
                name: s.employee_name || `员工 ${s.employee_id}`,
                shifts: new Map(),
            });
        }
        const emp = empShiftMap.get(s.employee_id)!;
        emp.shifts.set(s.date, {
            shiftName: s.shift_name || s.shift_code || '-',
            hours: Number(s.nominal_hours) || 0,
        });
    });

    const headers: CalendarDataWithWorkdays['headers'] = calendarDays.map(d => ({
        label: formatShortDate(d.date),
        isWorkday: d.is_workday,
    }));

    const rows = Array.from(empShiftMap.values()).map(emp => ({
        name: emp.name,
        cells: calendarDays.map(d => {
            const info = emp.shifts.get(d.date);
            if (info && info.hours > 0) {
                return { text: `${info.shiftName} ${info.hours}h`, shiftName: info.shiftName };
            } else if (info) {
                return { text: info.shiftName, shiftName: info.shiftName };
            }
            return { text: '-', shiftName: '-' };
        }),
    }));

    return { headers, rows };
}

function getShiftCellClass(shiftName: string): string {
    const name = (shiftName || '').toLowerCase();
    if (name.includes('休息') || name.includes('休') || name === '-' || name === '') return 'shift-rest';
    if (name.includes('夜') || name.includes('晚')) return 'shift-night';
    if (name.includes('长白') || name.includes('长日')) return 'shift-longday';
    if (name.includes('早') || name.includes('白班')) return 'shift-morning';
    if (name.includes('基础')) return 'shift-base';
    return '';
}

function buildCalendarTableWithWorkdays(calendarData: CalendarDataWithWorkdays): string {
    if (calendarData.headers.length === 0) {
        return '<p style="color:#999;">暂无日历数据</p>';
    }

    const DATES_PER_CHUNK = 14;
    const numChunks = Math.ceil(calendarData.headers.length / DATES_PER_CHUNK);
    const tables: string[] = [];

    for (let chunk = 0; chunk < numChunks; chunk++) {
        const startIdx = chunk * DATES_PER_CHUNK;
        const endIdx = Math.min(startIdx + DATES_PER_CHUNK, calendarData.headers.length);
        const chunkHeaders = calendarData.headers.slice(startIdx, endIdx);

        const headerCells = [
            `<th style="padding:6px 10px; background:#1890ff; color:white; border:1px solid #096dd9; font-size:10px; white-space:nowrap; font-weight:600;">姓名</th>`,
            ...chunkHeaders.map(h => {
                const bgColor = h.isWorkday ? '#1890ff' : '#8c8c8c';
                const borderColor = h.isWorkday ? '#096dd9' : '#595959';
                return `<th style="padding:6px 8px; background:${bgColor}; color:white; border:1px solid ${borderColor}; font-size:10px; white-space:nowrap; font-weight:500;">${h.label}</th>`;
            })
        ].join('');

        const bodyRows = calendarData.rows.map(row => {
            const chunkCells = row.cells.slice(startIdx, endIdx);
            const cells = [
                `<td style="padding:5px 8px; border:1px solid #e8e8e8; background:#fafafa; font-weight:500; white-space:nowrap;">${row.name}</td>`,
                ...chunkCells.map(cell => {
                    const cls = getShiftCellClass(cell.shiftName);
                    return `<td class="${cls}" style="padding:4px 6px; border:1px solid #e8e8e8; font-size:9px; text-align:center; white-space:nowrap;">${cell.text}</td>`;
                })
            ].join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        const chunkLabel = numChunks > 1
            ? `<div style="font-size:11px; color:#1890ff; margin:16px 0 8px; font-weight:600; border-left:3px solid #1890ff; padding-left:10px;">
                第 ${chunk + 1}/${numChunks} 周期 (${chunkHeaders[0].label} — ${chunkHeaders[chunkHeaders.length - 1].label})
               </div>`
            : '';

        tables.push(`
            <div style="page-break-inside:avoid; break-inside:avoid;">
                ${chunkLabel}
                <table style="width:auto; border-collapse:collapse; font-size:10px; margin-bottom:18px;">
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>
        `);
    }

    return tables.join('');
}

// ── Personnel Stats Calculator (shared with Excel) ─────────────

interface PersonnelStat {
    name: string;
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
        name: string;
        shiftCount: number; shiftHours: number; operationHours: number;
        dates: Map<string, boolean>; nightCount: number; weekendCount: number;
    }>();

    (data.shift_assignments || []).forEach(s => {
        const hours = Number(s.nominal_hours) || 0;
        const isWorkShift = hours > 0;

        if (!empMap.has(s.employee_id)) {
            empMap.set(s.employee_id, {
                name: s.employee_name || `员工 ${s.employee_id}`,
                shiftCount: 0, shiftHours: 0, operationHours: 0,
                dates: new Map(), nightCount: 0, weekendCount: 0,
            });
        }
        const emp = empMap.get(s.employee_id)!;
        emp.dates.set(s.date, isWorkShift);
        if (isWorkShift) emp.shiftCount++;
        emp.shiftHours += hours;

        const shiftName = (s.shift_name || '').toLowerCase();
        if (shiftName.includes('夜') || shiftName.includes('晚')) emp.nightCount++;
        if (nonWorkDays.has(s.date) && isWorkShift) emp.weekendCount++;
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
            name: emp.name,
            shiftCount: emp.shiftCount,
            shiftHours: emp.shiftHours,
            operationHours: emp.operationHours,
            utilization: emp.shiftHours > 0 ? (emp.operationHours / emp.shiftHours) * 100 : 0,
            maxConsecutiveWork: maxWork,
            nightCount: emp.nightCount,
            weekendCount: emp.weekendCount,
        };
    }).sort((a, b) => b.shiftCount - a.shiftCount);
}
