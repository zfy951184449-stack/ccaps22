import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Drawer, Spin, Alert, message, Dropdown, Popconfirm, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    TeamOutlined,
    ExportOutlined,
    SaveOutlined,
    FileExcelOutlined,
    FilePdfOutlined,
    DownOutlined,
    ArrowLeftOutlined,
    UndoOutlined,
    HistoryOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import { exportV4ScheduleToExcel } from '../../utils/exportScheduleExcel';
import { exportV4ScheduleToPdf } from '../../utils/exportSchedulePdf';

import ScheduleMatrix from './components/ScheduleMatrix';
import ManualEditDrawer from './components/ManualEditDrawer';
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

interface EditHistoryEntry {
    type: 'SHIFT' | 'ASSIGNMENT';
    employee_id: number;
    employee_name: string;
    date: string;
    // Shift edit fields
    oldShift?: { id: number; name: string; hours: number };
    newShift?: { id: number; name: string; hours: number };
    // Assignment edit fields
    operation_plan_id?: number;
    operation_name?: string;
    position_number?: number;
    action?: 'ASSIGN' | 'UNASSIGN' | 'REASSIGN';
    oldEmployee?: { id: number; name: string } | null;
    newEmployee?: { id: number; name: string } | null;
}

const SolveResultV4Page: React.FC<SolveResultV4PageProps> = ({ visible, runId, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ResultData | null>(null);
    const [originalData, setOriginalData] = useState<ResultData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [applying, setApplying] = useState(false);
    const [runStatus, setRunStatus] = useState<string>('INIT');

    // Manual edit state
    const [editTarget, setEditTarget] = useState<any | null>(null);
    const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>([]);

    // Precheck collapsed state
    const [precheckExpanded, setPrecheckExpanded] = useState(false);

    // Edit history drawer
    const [historyVisible, setHistoryVisible] = useState(false);

    // Tab state: matrix vs assignments
    const [activeTab, setActiveTab] = useState<'matrix' | 'assignments'>('matrix');

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
                setOriginalData(JSON.parse(JSON.stringify(rawData)));
                setEditHistory([]);
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
        } else {
            setData(null);
            setOriginalData(null);
            setRunStatus('INIT');
            setApplying(false);
            setEditHistory([]);
            setPrecheckExpanded(false);
        }
    }, [visible, runId, fetchResult, fetchRunStatus]);

    // Date range
    const dateRange = useMemo(() => {
        if (!data?.calendar_days?.length) return undefined;
        const dates = data.calendar_days.map(d => d.date).sort();
        return { start: dates[0], end: dates[dates.length - 1] };
    }, [data]);

    // Employee count
    const uniqueEmployeeCount = useMemo(() => {
        const ids = new Set<number>();
        data?.shift_assignments?.forEach((s: any) => ids.add(s.employee_id));
        return ids.size;
    }, [data]);

    // Shift options
    const shiftOptions = useMemo(() => {
        if (!data?.shift_assignments) return [];
        const map = new Map<number, { shift_id: number; shift_name: string; shift_code: string; nominal_hours: number }>();
        data.shift_assignments.forEach((s: any) => {
            if (!map.has(s.shift_id)) {
                map.set(s.shift_id, {
                    shift_id: s.shift_id,
                    shift_name: s.shift_name || 'Unknown',
                    shift_code: s.shift_code || '',
                    nominal_hours: s.nominal_hours || 0,
                });
            }
        });
        return Array.from(map.values()).sort((a, b) => a.shift_id - b.shift_id);
    }, [data]);

    // ── KPI Metrics (real-time recalculated) ──
    const kpiMetrics = useMemo(() => {
        if (!data) return null;

        const nonWorkDays = new Set(
            (data.calendar_days || []).filter(d => !d.is_workday).map(d => d.date)
        );

        const weekendByEmp = new Map<number, number>();
        const nightByEmp = new Map<number, number>();

        (data.shift_assignments || []).forEach((s: any) => {
            if (nonWorkDays.has(s.date)) {
                weekendByEmp.set(s.employee_id, (weekendByEmp.get(s.employee_id) || 0) + 1);
            }
            const startH = s.start_time ? dayjs(s.start_time).hour() : -1;
            if (startH >= 20 || (startH >= 0 && startH <= 2)) {
                nightByEmp.set(s.employee_id, (nightByEmp.get(s.employee_id) || 0) + 1);
            }
        });

        const computeBalance = (map: Map<number, number>): number => {
            if (map.size === 0) return 100;
            const values = Array.from(map.values());
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            if (mean === 0) return 100;
            const cv = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length) / mean;
            return Math.max(0, Math.round((1 - cv) * 100));
        };

        const weekendBal = computeBalance(weekendByEmp);
        const nightBal = computeBalance(nightByEmp);
        const balanceIndex = Math.round((weekendBal + nightBal) / 2);

        // Quality score: 0.3×completion + 0.2×coverage + 0.2×(1-工时CV) + 0.15×nightBal + 0.15×weekendBal
        const qualityScore = Math.round(
            0.3 * data.metrics.completion_rate +
            0.2 * data.metrics.coverage_rate +
            0.2 * balanceIndex +
            0.15 * nightBal +
            0.15 * weekendBal
        );

        return {
            completion_rate: data.metrics.completion_rate,
            coverage_rate: data.metrics.coverage_rate,
            balanceIndex,
            employeeCount: uniqueEmployeeCount,
            qualityScore,
        };
    }, [data, uniqueEmployeeCount]);

    // Handle manual shift edit (with history tracking)
    const handleApplyEdit = useCallback((employeeId: number, date: string, newShiftId: number) => {
        if (!data) return;
        const newShift = shiftOptions.find(s => s.shift_id === newShiftId);
        if (!newShift) return;

        // Find old shift for history
        const oldShiftData = data.shift_assignments?.find(
            (s: any) => s.employee_id === employeeId && s.date === date
        );
        const empName = oldShiftData?.employee_name || `员工${employeeId}`;

        setEditHistory(prev => [
            ...prev,
            {
                type: 'SHIFT',
                employee_id: employeeId,
                employee_name: empName,
                date,
                oldShift: {
                    id: oldShiftData?.shift_id || 0,
                    name: oldShiftData?.shift_name || '无',
                    hours: oldShiftData?.nominal_hours || 0,
                },
                newShift: {
                    id: newShiftId,
                    name: newShift.shift_name,
                    hours: newShift.nominal_hours,
                },
            }
        ]);

        const updatedShifts = (data.shift_assignments || []).map((s: any) => {
            if (s.employee_id === employeeId && s.date === date) {
                return {
                    ...s,
                    shift_id: newShiftId,
                    shift_name: newShift.shift_name,
                    shift_code: newShift.shift_code,
                    nominal_hours: newShift.nominal_hours,
                };
            }
            return s;
        });

        setData(prev => prev ? { ...prev, shift_assignments: updatedShifts } : prev);
    }, [data, shiftOptions]);

    // ── Operation Assignment Edit Handlers ──

    const updateOperationPositions = useCallback((opId: number, posNum: number, newEmployee: { id: number; name: string; code: string } | null) => {
        if (!data) return data;
        const updatedOps = (data.operations || []).map((o: any) => {
            if (o.operation_plan_id !== opId) return o;
            const newPositions = (o.positions || []).map((p: any) => {
                if (p.position_number !== posNum) return p;
                return newEmployee
                    ? { ...p, status: 'ASSIGNED', employee: newEmployee }
                    : { ...p, status: 'UNASSIGNED', employee: null };
            });
            const total = newPositions.length;
            const assigned = newPositions.filter((p: any) => p.status === 'ASSIGNED').length;
            return {
                ...o,
                positions: newPositions,
                status: assigned === total ? 'COMPLETE' : (assigned > 0 ? 'PARTIAL' : 'UNASSIGNED'),
            };
        });
        return updatedOps;
    }, [data]);

    const handleAssign = useCallback((opId: number, posNum: number, empId: number) => {
        if (!data) return;
        const empShift = data.shift_assignments?.find((s: any) => s.employee_id === empId);
        const empName = empShift?.employee_name || `员工${empId}`;
        const empCode = empShift?.employee_code || '';
        const op = data.operations?.find((o: any) => o.operation_plan_id === opId);
        const oldPos = op?.positions?.find((p: any) => p.position_number === posNum);

        const updatedOps = updateOperationPositions(opId, posNum, { id: empId, name: empName, code: empCode });
        if (!updatedOps) return;

        setEditHistory(prev => [...prev, {
            type: 'ASSIGNMENT',
            employee_id: empId,
            employee_name: empName,
            date: op?.planned_start?.slice(0, 10) || '',
            operation_plan_id: opId,
            operation_name: op?.operation_name || '',
            position_number: posNum,
            action: oldPos?.status === 'ASSIGNED' ? 'REASSIGN' : 'ASSIGN',
            oldEmployee: oldPos?.employee ? { id: oldPos.employee.id, name: oldPos.employee.name } : null,
            newEmployee: { id: empId, name: empName },
        }]);

        setData(prev => prev ? { ...prev, operations: updatedOps } : prev);
    }, [data, updateOperationPositions]);

    const handleUnassign = useCallback((opId: number, posNum: number) => {
        if (!data) return;
        const op = data.operations?.find((o: any) => o.operation_plan_id === opId);
        const pos = op?.positions?.find((p: any) => p.position_number === posNum);

        const updatedOps = updateOperationPositions(opId, posNum, null);
        if (!updatedOps) return;

        setEditHistory(prev => [...prev, {
            type: 'ASSIGNMENT',
            employee_id: pos?.employee?.id || 0,
            employee_name: pos?.employee?.name || '',
            date: op?.planned_start?.slice(0, 10) || '',
            operation_plan_id: opId,
            operation_name: op?.operation_name || '',
            position_number: posNum,
            action: 'UNASSIGN',
            oldEmployee: pos?.employee ? { id: pos.employee.id, name: pos.employee.name } : null,
            newEmployee: null,
        }]);

        setData(prev => prev ? { ...prev, operations: updatedOps } : prev);
    }, [data, updateOperationPositions]);

    const handleAssignWithShiftChange = useCallback((
        opId: number, posNum: number, empId: number, newShiftId: number, date: string
    ) => {
        if (!data) return;
        const newShift = shiftOptions.find(s => s.shift_id === newShiftId);
        if (!newShift) return;

        const empShift = data.shift_assignments?.find((s: any) => s.employee_id === empId && s.date === date);
        const empName = empShift?.employee_name || `员工${empId}`;
        const empCode = empShift?.employee_code || '';
        const op = data.operations?.find((o: any) => o.operation_plan_id === opId);
        const oldPos = op?.positions?.find((p: any) => p.position_number === posNum);

        // Update operations
        const updatedOps = updateOperationPositions(opId, posNum, { id: empId, name: empName, code: empCode });
        if (!updatedOps) return;

        // Update shift_assignments
        const updatedShifts = (data.shift_assignments || []).map((s: any) => {
            if (s.employee_id === empId && s.date === date) {
                return { ...s, shift_id: newShiftId, shift_name: newShift.shift_name, shift_code: newShift.shift_code || '', nominal_hours: newShift.nominal_hours };
            }
            return s;
        });

        // Record both edits
        setEditHistory(prev => [...prev,
            {
                type: 'ASSIGNMENT',
                employee_id: empId, employee_name: empName, date,
                operation_plan_id: opId, operation_name: op?.operation_name || '',
                position_number: posNum,
                action: oldPos?.status === 'ASSIGNED' ? 'REASSIGN' : 'ASSIGN',
                oldEmployee: oldPos?.employee ? { id: oldPos.employee.id, name: oldPos.employee.name } : null,
                newEmployee: { id: empId, name: empName },
            },
            {
                type: 'SHIFT',
                employee_id: empId, employee_name: empName, date,
                oldShift: { id: empShift?.shift_id || 0, name: empShift?.shift_name || '无', hours: empShift?.nominal_hours || 0 },
                newShift: { id: newShiftId, name: newShift.shift_name, hours: newShift.nominal_hours },
            },
        ]);

        // Atomic state update: both operations + shifts
        setData(prev => prev ? { ...prev, operations: updatedOps, shift_assignments: updatedShifts } : prev);
    }, [data, shiftOptions, updateOperationPositions]);

    // Undo last edit
    const handleUndo = useCallback(() => {
        if (editHistory.length === 0 || !data) return;

        const last = editHistory[editHistory.length - 1];

        if (last.type === 'ASSIGNMENT') {
            // Revert assignment edit
            if (last.operation_plan_id != null && last.position_number != null) {
                const revertEmp = last.action === 'UNASSIGN' && last.oldEmployee
                    ? { id: last.oldEmployee.id, name: last.oldEmployee.name, code: '' }
                    : (last.action === 'REASSIGN' && last.oldEmployee
                        ? { id: last.oldEmployee.id, name: last.oldEmployee.name, code: '' }
                        : null);
                const updatedOps = (data.operations || []).map((o: any) => {
                    if (o.operation_plan_id !== last.operation_plan_id) return o;
                    const newPositions = (o.positions || []).map((p: any) => {
                        if (p.position_number !== last.position_number) return p;
                        return revertEmp
                            ? { ...p, status: 'ASSIGNED', employee: revertEmp }
                            : { ...p, status: 'UNASSIGNED', employee: null };
                    });
                    const total = newPositions.length;
                    const assigned = newPositions.filter((p: any) => p.status === 'ASSIGNED').length;
                    return { ...o, positions: newPositions, status: assigned === total ? 'COMPLETE' : (assigned > 0 ? 'PARTIAL' : 'UNASSIGNED') };
                });
                setData(prev => prev ? { ...prev, operations: updatedOps } : prev);
            }
            setEditHistory(prev => prev.slice(0, -1));
            return;
        }

        // Revert shift edit
        const revertedShifts = (data.shift_assignments || []).map((s: any) => {
            if (s.employee_id === last.employee_id && s.date === last.date) {
                const origShift = shiftOptions.find(o => o.shift_id === last.oldShift?.id);
                return {
                    ...s,
                    shift_id: last.oldShift?.id || 0,
                    shift_name: last.oldShift?.name || '',
                    shift_code: origShift?.shift_code || '',
                    nominal_hours: last.oldShift?.hours || 0,
                };
            }
            return s;
        });

        setData(prev => prev ? { ...prev, shift_assignments: revertedShifts } : prev);
        setEditHistory(prev => prev.slice(0, -1));
    }, [data, editHistory, shiftOptions]);

    // Reset all edits
    const handleResetAll = useCallback(() => {
        if (originalData) {
            setData(JSON.parse(JSON.stringify(originalData)));
            setEditHistory([]);
        }
    }, [originalData]);

    // Edit delta summary
    const editDelta = useMemo(() => {
        if (editHistory.length === 0) return null;
        let nightDelta = 0;
        let hoursDelta = 0;
        editHistory.forEach(e => {
            if (e.type !== 'SHIFT' || !e.oldShift || !e.newShift) return;
            const isOldNight = e.oldShift.name.includes('夜');
            const isNewNight = e.newShift.name.includes('夜');
            if (!isOldNight && isNewNight) nightDelta++;
            if (isOldNight && !isNewNight) nightDelta--;
            hoursDelta += (e.newShift.hours - e.oldShift.hours);
        });
        return { count: editHistory.length, nightDelta, hoursDelta: Math.round(hoursDelta * 10) / 10 };
    }, [editHistory]);

    // Precheck summary
    const precheckSummary = useMemo(() => {
        if (!data?.precheck_results) return null;
        const { status, checks } = data.precheck_results;
        const issues = checks.filter(c => c.status !== 'PASS');
        return { status, issues, total: checks.length };
    }, [data]);

    // Apply result
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
                `班次 ${json.data?.shift_plans_inserted ?? 0} 条`,
            ];
            message.success(`排班已应用：${summary.join('，')}`);
            setRunStatus('APPLIED');
            fetchResult();
        } catch (e) {
            message.error('应用失败，请重试');
        } finally {
            setApplying(false);
        }
    };

    const drawerTitle = (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
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
                {dateRange && (
                    <span style={{ fontSize: 13, color: 'var(--v4-text-secondary)', marginLeft: 8 }}>
                        {dateRange.start} ~ {dateRange.end}
                    </span>
                )}
                {data?.metrics.solve_time && (
                    <span className="v4-solve-time-badge">
                        <ClockCircleOutlined /> 求解 {data.metrics.solve_time}s
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dropdown
                    menu={{
                        items: [
                            {
                                key: 'excel', icon: <FileExcelOutlined />, label: '导出 Excel',
                                onClick: () => { if (data && runId) { exportV4ScheduleToExcel(data, runId); message.success('Excel 导出成功'); } }
                            },
                            {
                                key: 'pdf', icon: <FilePdfOutlined />, label: '导出 PDF',
                                onClick: async () => {
                                    if (data && runId) {
                                        const hide = message.loading('生成 PDF...', 0);
                                        try { await exportV4ScheduleToPdf(data, runId); message.success('PDF 导出成功'); }
                                        catch { message.error('PDF 导出失败'); }
                                        finally { hide(); }
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
                        description="将写入排班数据，保留已锁定的分配和班次。是否继续？"
                        onConfirm={handleApplyResult}
                        okText="确认"
                        cancelText="取消"
                        okButtonProps={{ loading: applying }}
                    >
                        <button className="v4-btn v4-btn-primary" disabled={applying}>
                            <SaveOutlined /> {applying ? '应用中...' : '应用排班'}
                            {editHistory.length > 0 && (
                                <span style={{
                                    marginLeft: 6, background: 'var(--v4-accent-amber, #f59e0b)',
                                    color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11,
                                }}>+{editHistory.length}改</span>
                            )}
                        </button>
                    </Popconfirm>
                )}
            </div>
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
            styles={{ body: { padding: 0, background: 'var(--v4-bg-primary, #fafbfc)' } }}
            className="v4-result-drawer"
        >
            <div className="v4-result-container">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 'var(--v4-space-2xl, 48px)' }}>
                        <Spin size="large" tip="正在加载结果..." />
                    </div>
                ) : error ? (
                    <Alert type="error" message="无法加载结果" description={error} showIcon />
                ) : data && kpiMetrics ? (
                    <>
                        {/* ── Precheck Alert Bar ── */}
                        {precheckSummary && precheckSummary.issues.length > 0 && (
                            <div className="v4-precheck-bar" data-status={precheckSummary.status}>
                                <div className="v4-precheck-bar-left">
                                    <WarningOutlined style={{ marginRight: 6 }} />
                                    <span>
                                        {precheckSummary.issues.length}项预检{precheckSummary.status === 'ERROR' ? '错误' : '警告'}:
                                        {' '}{precheckSummary.issues.slice(0, 2).map(i => i.message).join(' | ')}
                                        {precheckSummary.issues.length > 2 && ` (+${precheckSummary.issues.length - 2}项)`}
                                    </span>
                                    <button
                                        className="v4-precheck-toggle"
                                        onClick={() => setPrecheckExpanded(!precheckExpanded)}
                                    >
                                        {precheckExpanded ? '收起 ▲' : '展开 ▼'}
                                    </button>
                                </div>
                                {editDelta && (
                                    <div className="v4-precheck-bar-right">
                                        编辑: {editDelta.count}处修改
                                        <Tooltip title="撤销上一步编辑">
                                            <button className="v4-edit-action" onClick={handleUndo}><UndoOutlined /> 撤销</button>
                                        </Tooltip>
                                        <button className="v4-edit-action" onClick={() => setHistoryVisible(true)}><HistoryOutlined /> 记录</button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Expanded precheck details */}
                        {precheckExpanded && precheckSummary && (
                            <div className="v4-precheck-detail">
                                {precheckSummary.issues.map((issue, i) => (
                                    <div key={i} className="v4-precheck-item" data-status={issue.status}>
                                        <span style={{
                                            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                            background: issue.status === 'ERROR' ? 'var(--v4-color-error)' : 'var(--v4-color-warning)',
                                            marginTop: 5,
                                        }} />
                                        <span>{issue.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── KPI Row (compact inline) ── */}
                        <div className="v4-kpi-row">
                            <div className="v4-kpi-item">
                                <span className="v4-kpi-label">完成率</span>
                                <span className="v4-kpi-value" data-color={kpiMetrics.completion_rate === 100 ? 'green' : 'amber'}>
                                    {kpiMetrics.completion_rate}%
                                </span>
                            </div>
                            <div className="v4-kpi-item">
                                <span className="v4-kpi-label">覆盖度</span>
                                <span className="v4-kpi-value" data-color="blue">
                                    {kpiMetrics.coverage_rate}%
                                </span>
                            </div>
                            <div className="v4-kpi-item">
                                <span className="v4-kpi-label">均衡指数</span>
                                <span className="v4-kpi-value" data-color={kpiMetrics.balanceIndex >= 80 ? 'green' : 'amber'}>
                                    {kpiMetrics.balanceIndex}%
                                </span>
                            </div>
                            <div className="v4-kpi-item">
                                <span className="v4-kpi-label">参与</span>
                                <span className="v4-kpi-value">
                                    {kpiMetrics.employeeCount}人
                                </span>
                            </div>
                            <div className="v4-kpi-item">
                                <span className="v4-kpi-label">质量分</span>
                                <span className="v4-kpi-value" data-color={kpiMetrics.qualityScore >= 80 ? 'green' : kpiMetrics.qualityScore >= 60 ? 'amber' : 'red'}>
                                    {kpiMetrics.qualityScore}<span style={{ fontSize: 14, color: '#999' }}>/100</span>
                                </span>
                            </div>
                        </div>

                        {/* ── View Tab Switcher ── */}
                        <div className="v4-view-tabs">
                            <button
                                className={`v4-view-tab ${activeTab === 'matrix' ? 'active' : ''}`}
                                onClick={() => setActiveTab('matrix')}
                            >
                                排班矩阵
                            </button>
                            <button
                                className={`v4-view-tab ${activeTab === 'assignments' ? 'active' : ''}`}
                                onClick={() => setActiveTab('assignments')}
                            >
                                操作分配明细
                                {data.details && data.details.total_positions - data.details.assigned_positions > 0 && (
                                    <span className="v4-view-tab-badge">
                                        {data.details.total_positions - data.details.assigned_positions}
                                    </span>
                                )}
                            </button>
                        </div>

                        {activeTab === 'matrix' ? (
                            <>
                                {/* ── Schedule Matrix (core) ── */}
                                <ScheduleMatrix
                                    shiftAssignments={data.shift_assignments || []}
                                    assignments={data.assignments || []}
                                    calendarDays={data.calendar_days || []}
                                    operations={data.operations}
                                    onEditShift={(sa: any) => setEditTarget(sa)}
                                />

                                {/* ── Edit Stats Footer ── */}
                                {editDelta && (
                                    <div className="v4-edit-footer">
                                        <div className="v4-edit-footer-stats">
                                            班次变更:
                                            {editDelta.nightDelta !== 0 && (
                                                <span style={{ color: editDelta.nightDelta > 0 ? '#e65100' : '#2e7d32' }}>
                                                    {editDelta.nightDelta > 0 ? '+' : ''}{editDelta.nightDelta}夜班
                                                </span>
                                            )}
                                            {editDelta.hoursDelta !== 0 && (
                                                <span style={{ color: '#555' }}>
                                                    工时偏差Δ{editDelta.hoursDelta > 0 ? '+' : ''}{editDelta.hoursDelta}h
                                                </span>
                                            )}
                                            <span style={{ color: '#999' }}>共{editDelta.count}处修改</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <Popconfirm
                                                title="重置所有编辑"
                                                description="将恢复到求解器原始结果，所有修改将丢失。"
                                                onConfirm={handleResetAll}
                                                okText="确认重置"
                                                cancelText="取消"
                                            >
                                                <button className="v4-btn v4-btn-text" style={{ color: '#999' }}>
                                                    重置所有
                                                </button>
                                            </Popconfirm>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <AssignmentsView
                                operations={data.operations || []}
                                shiftAssignments={data.shift_assignments || []}
                                shiftOptions={shiftOptions}
                                onAssign={handleAssign}
                                onUnassign={handleUnassign}
                                onAssignWithShiftChange={handleAssignWithShiftChange}
                            />
                        )}
                    </>
                ) : null}
            </div>

            {/* Manual Edit Drawer */}
            <ManualEditDrawer
                visible={!!editTarget}
                shiftAssignment={editTarget}
                allShiftAssignments={data?.shift_assignments || []}
                shiftOptions={shiftOptions}
                onClose={() => setEditTarget(null)}
                onApplyEdit={handleApplyEdit}
            />

            {/* Edit History Drawer */}
            <Drawer
                title={`编辑记录 (${editHistory.length})`}
                open={historyVisible}
                onClose={() => setHistoryVisible(false)}
                width={400}
                placement="right"
            >
                {editHistory.length === 0 ? (
                    <div style={{ color: '#999', textAlign: 'center', padding: 40 }}>暂无编辑记录</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {editHistory.map((e, i) => (
                            <div key={i} style={{
                                padding: '8px 12px', background: '#f9f9f9', borderRadius: 6,
                                fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            }}>
                                {e.type === 'SHIFT' ? (
                                    <>
                                        <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>班次</span>
                                        <span style={{ fontWeight: 500 }}>{e.employee_name}</span>
                                        <span style={{ color: '#999' }}>{dayjs(e.date).format('M/D')}</span>
                                        <span style={{ color: '#e65100' }}>{e.oldShift?.name || '无'}</span>
                                        <span style={{ color: '#999' }}>→</span>
                                        <span style={{ color: '#2e7d32' }}>{e.newShift?.name || '无'}</span>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ background: '#fce4ec', color: '#c62828', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>操作</span>
                                        <span style={{ fontWeight: 500 }}>{e.operation_name || ''}</span>
                                        <span style={{ color: '#999' }}>岗位{e.position_number}</span>
                                        {e.action === 'ASSIGN' && <span style={{ color: '#2e7d32' }}>← {e.newEmployee?.name}</span>}
                                        {e.action === 'UNASSIGN' && <span style={{ color: '#e65100' }}>{e.oldEmployee?.name} ✕</span>}
                                        {e.action === 'REASSIGN' && <><span style={{ color: '#e65100' }}>{e.oldEmployee?.name}</span><span style={{ color: '#999' }}>→</span><span style={{ color: '#2e7d32' }}>{e.newEmployee?.name}</span></>}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Drawer>
        </Drawer>
    );
};

export default SolveResultV4Page;
