/**
 * OperationAssignmentsPanel
 *
 * 运营总览看板 ·「操作人员分配」（基于 wxb-ui 设计系统重做）。
 * - 以 WxbDataTable 平铺当日各操作的配人情况（批次/阶段/操作/时间/配员状态/人员）。
 * - 日期=今天或未来最近有排产的一天；‹ › 按天翻页；可与甘特选中批次联动过滤。
 * - 全部使用 wxb-ui 组件 + CSS 变量，无手写卡片/硬编码色值/emoji。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dayjs } from 'dayjs';
import { WxbChartShell, WxbDataTable, WxbTag, WxbButton, WxbOverlay, WxbDatePicker } from '../wxb-ui';
import type { WxbTagColor } from '../wxb-ui/Tag/Tag';
import { dashboardService } from '../../services/dashboardService';
import type { DailyAssignmentsData } from '../../types/dashboard';

const IconUsers = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
);
const IconChevronLeft = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
);
const IconChevronRight = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
);

interface AssignmentRow {
    key: string;
    batchCode: string;
    stageName: string;
    operationName: string;
    time: string;
    required: number;
    assigned: number;
    names: string[];
    status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED';
}

const STATUS_META: Record<AssignmentRow['status'], { label: string; color: WxbTagColor }> = {
    COMPLETE: { label: '配齐', color: 'green' },
    PARTIAL: { label: '部分', color: 'amber' },
    UNASSIGNED: { label: '缺人', color: 'red' },
};

const hhmm = (t?: string) => (t ? t.slice(0, 5) : '--:--');

interface OperationAssignmentsPanelProps {
    date: Dayjs;
    selectedBatchId?: number;
    selectedBatchCode?: string;
    /** 部门筛选：仅显示这些批次（undefined = 不限）。 */
    allowedBatchIds?: number[];
    onStepDay?: (delta: number) => void;
    onPickDate?: (d: Dayjs) => void;
}

const OperationAssignmentsPanel: React.FC<OperationAssignmentsPanelProps> = ({
    date,
    selectedBatchId,
    selectedBatchCode,
    allowedBatchIds,
    onStepDay,
    onPickDate,
}) => {
    const [data, setData] = useState<DailyAssignmentsData | null>(null);
    const [loading, setLoading] = useState(false);

    const dateKey = date.format('YYYY-MM-DD');
    useEffect(() => {
        let alive = true;
        setLoading(true);
        dashboardService
            .getDailyAssignments(dateKey)
            .then((res) => { if (alive) setData(res); })
            .catch(() => { if (alive) setData(null); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [dateKey]);

    const rows = useMemo<AssignmentRow[]>(() => {
        const batches = Array.isArray(data?.batches) ? data!.batches : [];
        const allowed = allowedBatchIds ? new Set(allowedBatchIds) : null;
        const out: AssignmentRow[] = [];
        batches.forEach((b) => {
            if (selectedBatchId !== undefined && b.batch_id !== selectedBatchId) return;
            if (allowed && !allowed.has(b.batch_id)) return;
            (b.stages || []).forEach((s) => {
                (s.operations || []).forEach((op) => {
                    const names = (op.assignments || [])
                        .map((a) => a.employee_name)
                        .filter((n): n is string => !!n);
                    const required = op.required_people || 0;
                    const assigned = names.length;
                    const status: AssignmentRow['status'] =
                        assigned === 0 ? 'UNASSIGNED' : assigned >= required ? 'COMPLETE' : 'PARTIAL';
                    out.push({
                        key: `${b.batch_id}-${op.operation_plan_id}`,
                        batchCode: b.batch_code,
                        stageName: s.stage_name,
                        operationName: op.operation_name,
                        time: `${hhmm(op.start_time)}–${hhmm(op.end_time)}`,
                        required,
                        assigned,
                        names,
                        status,
                    });
                });
            });
        });
        return out.sort((a, b) => a.time.localeCompare(b.time));
    }, [data, selectedBatchId, allowedBatchIds]);

    const columns = useMemo(() => ([
        {
            title: '批次',
            dataIndex: 'batchCode',
            width: 160,
            render: (v: string) => <span style={{ fontWeight: 500, color: 'var(--wx-ink, #0F1B2D)' }}>{v}</span>,
        },
        { title: '阶段', dataIndex: 'stageName', width: 120 },
        { title: '操作', dataIndex: 'operationName' },
        {
            title: '时间',
            dataIndex: 'time',
            width: 120,
            render: (v: string) => <span style={{ color: 'var(--wx-fg-4, #8898A8)' }}>{v}</span>,
        },
        {
            title: '配员',
            dataIndex: 'status',
            width: 120,
            render: (_: unknown, r: AssignmentRow) => {
                const meta = STATUS_META[r.status];
                return <WxbTag color={meta.color}>{r.assigned}/{r.required} · {meta.label}</WxbTag>;
            },
        },
        {
            title: '人员',
            dataIndex: 'names',
            render: (_: unknown, r: AssignmentRow) => {
                const gap = r.required - r.assigned;
                return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.names.map((n, i) => (
                            <WxbTag key={i} color="neutral">{n}</WxbTag>
                        ))}
                        {gap > 0 && <WxbTag color="red">缺 {gap}</WxbTag>}
                    </div>
                );
            },
        },
    ]), []);

    const subtitle = selectedBatchCode
        ? `${dateKey} · 仅看 ${selectedBatchCode}`
        : `${dateKey} · 批次操作与人员`;

    return (
        <WxbChartShell
            icon={<IconUsers />}
            iconColor="green"
            title="操作人员分配"
            subtitle={subtitle}
            actions={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <WxbDatePicker
                        value={date}
                        onChange={(d: any) => { if (d) onPickDate?.(d); }}
                        allowClear={false}
                        format="MM-DD"
                        showToday={false}
                        style={{ width: 120 }}
                    />
                    <div style={{ display: 'flex', gap: 2 }}>
                        <WxbButton
                            variant="ghost"
                            size="sm"
                            onClick={() => onStepDay?.(-1)}
                            title="上一有排产的日子"
                            style={{ padding: '4px 6px', borderRadius: '50%', minWidth: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <IconChevronLeft />
                        </WxbButton>
                        <WxbButton
                            variant="ghost"
                            size="sm"
                            onClick={() => onStepDay?.(1)}
                            title="下一有排产的日子"
                            style={{ padding: '4px 6px', borderRadius: '50%', minWidth: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <IconChevronRight />
                        </WxbButton>
                    </div>
                </div>
            }
        >
            <WxbOverlay loading={loading}>
                <WxbDataTable<AssignmentRow>
                    rowKey="key"
                    density="compact"
                    columns={columns}
                    dataSource={rows}
                    pagination={false}
                    scroll={{ y: 300 }}
                    emptyState={{ description: selectedBatchCode ? `${selectedBatchCode} 当日无操作` : '该日无排产操作' }}
                />
            </WxbOverlay>
        </WxbChartShell>
    );
};

export default OperationAssignmentsPanel;
