import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Drawer, Spin, Alert, message, Dropdown, Popconfirm } from 'antd';
import type { MenuProps } from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    TeamOutlined,
    AppstoreOutlined,
    ExportOutlined,
    SaveOutlined,
    FileExcelOutlined,
    FilePdfOutlined,
    DownOutlined,
    ArrowLeftOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

import { exportV4ScheduleToExcel } from '../../utils/exportScheduleExcel';
import { exportV4ScheduleToPdf } from '../../utils/exportSchedulePdf';

import SegmentedControl from './components/SegmentedControl';
import MetricCard from './components/MetricCard';
import OverviewView from './views/OverviewView';
import TimelineView from './views/TimelineView';
import PersonnelView from './views/PersonnelView';
import AssignmentsView from './views/AssignmentsView';
import PrecheckView from './views/PrecheckView';

import './SolverV4.css';

interface SolveResultV4PageProps {
    visible: boolean;
    runId: number | null;
    onClose: () => void;
}

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
    precheck_results?: {
        status: 'PASS' | 'WARNING' | 'ERROR';
        checks: {
            name: string;
            status: 'PASS' | 'WARNING' | 'ERROR';
            message: string;
            details?: any[];
        }[];
    };
}

type ViewType = 'overview' | 'timeline' | 'personnel' | 'assignments' | 'precheck';

const VIEW_OPTIONS = [
    { key: 'overview', label: '概览' },
    { key: 'timeline', label: '时间轴' },
    { key: 'personnel', label: '人员统计' },
    { key: 'assignments', label: '分配明细' },
    { key: 'precheck', label: '预检报告' }
];

const SolveResultV4Page: React.FC<SolveResultV4PageProps> = ({ visible, runId, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ResultData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<ViewType>('overview');
    const [applying, setApplying] = useState(false);
    const [runStatus, setRunStatus] = useState<string>('INIT');

    const fetchResult = useCallback(async () => {
        if (!runId) return;
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/v4/scheduling/runs/${runId}/result`);
            const json = await response.json();

            if (json.success) {
                const rawData = json.data;
                const empInfo = new Map<number, { name: string; code: string }>();

                if (rawData.assignments) {
                    rawData.assignments.forEach((a: any) => {
                        empInfo.set(a.employee_id, { name: a.employee_name, code: a.employee_code });
                    });
                }

                if (rawData.shift_assignments) {
                    rawData.shift_assignments = rawData.shift_assignments.map((s: any) => ({
                        ...s,
                        employee_name: s.employee_name || empInfo.get(s.employee_id)?.name || `员工 ${s.employee_id}`,
                        employee_code: s.employee_code || empInfo.get(s.employee_id)?.code || ''
                    }));
                }

                setData(rawData);
            } else {
                setError(json.message || '加载结果失败');
            }
        } catch (e: any) {
            setError(e.message || '网络错误');
        } finally {
            setLoading(false);
        }
    }, [runId]);

    const fetchRunStatus = useCallback(async () => {
        if (!runId) return;
        try {
            const response = await fetch(`/api/v4/scheduling/runs/${runId}/status`);
            const json = await response.json();
            if (json.success && json.data?.status) {
                setRunStatus(json.data.status);
            }
        } catch (e) {
            console.warn('Failed to fetch run status:', e);
        }
    }, [runId]);

    useEffect(() => {
        if (visible && runId) {
            fetchResult();
            fetchRunStatus();
            setActiveView('overview');
        } else {
            setData(null);
            setRunStatus('INIT');
            setApplying(false);
        }
    }, [visible, runId, fetchResult, fetchRunStatus]);

    const employeeMap = useMemo(() => {
        const map = new Map<number, { name: string; code: string }>();
        data?.assignments?.forEach((a: any) => {
            map.set(a.employee_id, { name: a.employee_name, code: a.employee_code });
        });
        return map;
    }, [data]);

    const dateRange = useMemo(() => {
        if (!data?.calendar_days?.length) return undefined;
        const dates = data.calendar_days.map(d => d.date).sort();
        return {
            start: dayjs(dates[0]).format('MM/DD'),
            end: dayjs(dates[dates.length - 1]).format('MM/DD')
        };
    }, [data]);

    const uniqueEmployeeCount = useMemo(() => {
        const ids = new Set<number>();
        data?.shift_assignments?.forEach((s: any) => ids.add(s.employee_id));
        return ids.size;
    }, [data]);

    const ganttOperations = useMemo(() => {
        return (data?.assignments || []).map((a: any) => ({
            operation_plan_id: a.operation_plan_id,
            operation_name: a.operation_name,
            employee_id: a.employee_id,
            planned_start: a.planned_start,
            planned_end: a.planned_end,
            batch_code: a.batch_code
        }));
    }, [data]);

    // Compute weekend/night balance from shift assignments
    const weekendNightMetrics = useMemo(() => {
        if (!data?.shift_assignments?.length || !data?.calendar_days?.length) {
            return { weekendBalance: null, nightBalance: null };
        }

        const nonWorkDays = new Set(
            data.calendar_days.filter(d => !d.is_workday).map(d => d.date)
        );

        // Weekend work per employee
        const weekendByEmp = new Map<number, number>();
        const nightByEmp = new Map<number, number>();

        data.shift_assignments.forEach((s: any) => {
            // Weekend
            if (nonWorkDays.has(s.date)) {
                weekendByEmp.set(s.employee_id, (weekendByEmp.get(s.employee_id) || 0) + 1);
            }
            // Night shift heuristic: start_time >= 20:00 or end_time <= 06:00
            const startH = dayjs(s.start_time).hour();
            if (startH >= 20 || startH <= 2) {
                nightByEmp.set(s.employee_id, (nightByEmp.get(s.employee_id) || 0) + 1);
            }
        });

        const computeBalance = (map: Map<number, number>): number | null => {
            if (map.size === 0) return null;
            const values = Array.from(map.values());
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            if (mean === 0) return 100;
            const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
            const cv = Math.sqrt(variance) / mean; // coefficient of variation
            return Math.max(0, Math.round((1 - cv) * 100));
        };

        return {
            weekendBalance: computeBalance(weekendByEmp),
            nightBalance: computeBalance(nightByEmp)
        };
    }, [data]);

    const precheckBadge = useMemo(() => {
        if (!data?.precheck_results) return null;
        const { status } = data.precheck_results;
        if (status === 'ERROR') return { count: data.precheck_results.checks.filter(c => c.status === 'ERROR').length, color: 'var(--v4-color-error)' };
        if (status === 'WARNING') return { count: data.precheck_results.checks.filter(c => c.status === 'WARNING').length, color: 'var(--v4-color-warning)' };
        return null;
    }, [data]);

    const renderContent = () => {
        if (!data) return null;

        switch (activeView) {
            case 'overview':
                return (
                    <OverviewView
                        metrics={data.metrics}
                        details={data.details}
                        shiftAssignmentsCount={data.shift_assignments?.length || 0}
                        employeeCount={uniqueEmployeeCount}
                        dateRange={dateRange}
                    />
                );
            case 'timeline':
                return (
                    <TimelineView
                        shifts={data.shift_assignments || []}
                        operations={ganttOperations}
                        employees={employeeMap}
                    />
                );
            case 'personnel':
                return (
                    <PersonnelView
                        shiftAssignments={data.shift_assignments || []}
                        assignments={data.assignments}
                        calendarDays={data.calendar_days}
                        standardHours={data.standard_hours}
                    />
                );
            case 'assignments':
                return <AssignmentsView operations={data.operations || []} />;
            case 'precheck':
                return <PrecheckView results={data.precheck_results} />;
            default:
                return null;
        }
    };

    const handleApplyResult = async () => {
        if (!runId || applying || runStatus === 'APPLIED') return;

        setApplying(true);
        try {
            const res = await fetch(`/api/v4/scheduling/runs/${runId}/apply`, { method: 'POST' });
            const json = await res.json();

            if (!res.ok || !json.success) {
                message.error(json.error || '应用失败');
                return;
            }

            const summary = [
                `批次分配 ${json.data?.batch_assignments_inserted ?? 0} 条`,
                `独立任务 ${json.data?.standalone_assignments_inserted ?? 0} 条`,
                `新班次 ${json.data?.shift_plans_inserted ?? 0} 条`,
            ];

            if ((json.data?.shift_plans_reused ?? 0) > 0) {
                summary.push(`复用锁定班次 ${json.data.shift_plans_reused} 条`);
            }

            message.success(`排班结果已应用：${summary.join('，')}`);
            setRunStatus('APPLIED');
            fetchResult();
        } catch (e) {
            console.error('Apply result failed:', e);
            message.error('应用失败，请重试');
        } finally {
            setApplying(false);
        }
    };

    const drawerTitle = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
                onClick={onClose}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 16, color: 'var(--v4-text-secondary)',
                    display: 'flex', alignItems: 'center', padding: 4
                }}
            >
                <ArrowLeftOutlined />
            </button>
            <span style={{ fontWeight: 600, fontSize: 18 }}>排班结果</span>
            {runId && <span style={{ color: 'var(--v4-text-tertiary)', fontSize: 13 }}>#{runId}</span>}
        </div>
    );

    return (
        <Drawer
            title={drawerTitle}
            open={visible}
            onClose={onClose}
            width="100vw"
            placement="right"
            maskClosable={false}
            closable={false}
            styles={{ body: { padding: 0, background: 'var(--v4-bg-primary)' } }}
            className="v4-result-drawer"
        >
            <div className="v4-result-container">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 'var(--v4-space-2xl)' }}>
                        <Spin size="large" tip="正在加载结果..." />
                    </div>
                ) : error ? (
                    <Alert type="error" message="无法加载结果" description={error} showIcon />
                ) : data ? (
                    <>
                        {/* Header */}
                        <div className="v4-result-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v4-space-lg)' }}>
                                <span className="v4-solve-time-badge">
                                    <ClockCircleOutlined />
                                    求解耗时 {data.metrics.solve_time}s
                                </span>
                                {dateRange && (
                                    <span style={{ fontSize: 'var(--v4-font-size-sm)', color: 'var(--v4-text-secondary)' }}>
                                        {dateRange.start} - {dateRange.end}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Metrics Row — replaced satisfaction with balance metrics */}
                        <div className="v4-metrics-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                            <MetricCard
                                label="分配完成率"
                                value={data.metrics.completion_rate}
                                suffix="%"
                                icon={<CheckCircleOutlined />}
                                color={data.metrics.completion_rate === 100 ? 'success' : 'warning'}
                            />
                            <MetricCard
                                label="操作覆盖度"
                                value={data.metrics.coverage_rate}
                                suffix="%"
                                icon={<AppstoreOutlined />}
                                color="info"
                            />
                            <MetricCard
                                label="参与人数"
                                value={uniqueEmployeeCount}
                                suffix="人"
                                icon={<TeamOutlined />}
                                color="default"
                            />
                            <MetricCard
                                label="夜班均衡"
                                value={weekendNightMetrics.nightBalance ?? '-'}
                                suffix={weekendNightMetrics.nightBalance !== null ? '%' : ''}
                                icon={<ClockCircleOutlined />}
                                color={weekendNightMetrics.nightBalance !== null && weekendNightMetrics.nightBalance < 70 ? 'warning' : 'default'}
                            />
                            <MetricCard
                                label="周末均衡"
                                value={weekendNightMetrics.weekendBalance ?? '-'}
                                suffix={weekendNightMetrics.weekendBalance !== null ? '%' : ''}
                                icon={<ClockCircleOutlined />}
                                color={weekendNightMetrics.weekendBalance !== null && weekendNightMetrics.weekendBalance < 70 ? 'warning' : 'default'}
                            />
                        </div>

                        {/* Segmented Control with precheck badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v4-space-md)' }}>
                            <SegmentedControl
                                options={VIEW_OPTIONS.map(opt => ({
                                    ...opt,
                                    label: opt.key === 'precheck' && precheckBadge
                                        ? `${opt.label} (${precheckBadge.count})`
                                        : opt.label
                                }))}
                                value={activeView}
                                onChange={(key) => setActiveView(key as ViewType)}
                            />
                        </div>

                        {/* Content Area */}
                        <div style={{ minHeight: 400 }}>
                            {renderContent()}
                        </div>

                        {/* Footer Actions */}
                        <div className="v4-footer">
                            <Dropdown
                                menu={{
                                    items: [
                                        {
                                            key: 'excel',
                                            icon: <FileExcelOutlined />,
                                            label: '导出 Excel (.xlsx)',
                                            onClick: () => {
                                                if (data && runId) {
                                                    exportV4ScheduleToExcel(data, runId);
                                                    message.success('Excel 导出成功');
                                                }
                                            }
                                        },
                                        {
                                            key: 'pdf',
                                            icon: <FilePdfOutlined />,
                                            label: '导出 PDF',
                                            onClick: async () => {
                                                if (data && runId) {
                                                    const hide = message.loading('正在生成 PDF...', 0);
                                                    try {
                                                        await exportV4ScheduleToPdf(data, runId);
                                                        message.success('PDF 导出成功');
                                                    } catch (e) {
                                                        message.error('PDF 导出失败');
                                                    } finally {
                                                        hide();
                                                    }
                                                }
                                            }
                                        }
                                    ] as MenuProps['items']
                                }}
                            >
                                <button className="v4-btn v4-btn-secondary">
                                    <ExportOutlined /> 导出 <DownOutlined style={{ fontSize: 10, marginLeft: 4 }} />
                                </button>
                            </Dropdown>
                            {runStatus === 'APPLIED' ? (
                                <button className="v4-btn v4-btn-primary" disabled>
                                    <CheckCircleOutlined /> 已应用
                                </button>
                            ) : (
                                <Popconfirm
                                    title="确认应用排班结果"
                                    description="将写入新的排班数据，但会保留已锁定的操作分配和班次。是否继续？"
                                    onConfirm={handleApplyResult}
                                    okText="确认应用"
                                    cancelText="取消"
                                    okButtonProps={{ loading: applying }}
                                >
                                    <button
                                        className="v4-btn v4-btn-primary"
                                        disabled={applying}
                                    >
                                        <SaveOutlined /> {applying ? '应用中...' : '应用排班'}
                                    </button>
                                </Popconfirm>
                            )}
                        </div>
                    </>
                ) : null}
            </div>
        </Drawer>
    );
};

export default SolveResultV4Page;
