import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Modal, Spin, Alert, message, Dropdown } from 'antd';
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
    DownOutlined
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
}

type ViewType = 'overview' | 'timeline' | 'personnel' | 'assignments';

const VIEW_OPTIONS = [
    { key: 'overview', label: '概览' },
    { key: 'timeline', label: '时间轴' },
    { key: 'personnel', label: '人员统计' },
    { key: 'assignments', label: '分配明细' }
];

const SolveResultV4Page: React.FC<SolveResultV4PageProps> = ({ visible, runId, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ResultData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<ViewType>('overview');

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

    useEffect(() => {
        if (visible && runId) {
            fetchResult();
            setActiveView('overview');
        } else {
            setData(null);
        }
    }, [visible, runId, fetchResult]);

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
            default:
                return null;
        }
    };

    return (
        <Modal
            title={null}
            open={visible}
            onCancel={onClose}
            width={1200}
            footer={null}
            style={{ top: 30 }}
            maskClosable={false}
            bodyStyle={{ padding: 0, background: 'var(--v4-bg-primary)' }}
            className="v4-result-modal"
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
                            <h1 className="v4-result-title">排班结果</h1>
                            <span className="v4-solve-time-badge">
                                <ClockCircleOutlined />
                                求解耗时 {data.metrics.solve_time}s
                            </span>
                        </div>

                        {/* Metrics Row */}
                        <div className="v4-metrics-row">
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
                                label="平均满意度"
                                value={data.metrics.satisfaction}
                                suffix="%"
                                icon={<TeamOutlined />}
                                color="default"
                            />
                            <MetricCard
                                label="求解耗时"
                                value={data.metrics.solve_time}
                                suffix="s"
                                icon={<ClockCircleOutlined />}
                                color="default"
                            />
                        </div>

                        {/* Segmented Control */}
                        <SegmentedControl
                            options={VIEW_OPTIONS}
                            value={activeView}
                            onChange={(key) => setActiveView(key as ViewType)}
                        />

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
                            <button className="v4-btn v4-btn-primary" onClick={() => message.success('已应用排班方案')}>
                                <SaveOutlined /> 应用排班
                            </button>
                        </div>
                    </>
                ) : null}
            </div>
        </Modal>
    );
};

export default SolveResultV4Page;
