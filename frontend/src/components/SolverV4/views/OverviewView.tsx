import React from 'react';
import { CheckCircleOutlined, WarningOutlined, ClockCircleOutlined, TeamOutlined, AppstoreOutlined } from '@ant-design/icons';
import MetricCard from '../components/MetricCard';
import '../SolverV4.css';

interface OverviewViewProps {
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
    shiftAssignmentsCount?: number;
    employeeCount?: number;
    dateRange?: { start: string; end: string };
}

const OverviewView: React.FC<OverviewViewProps> = ({ metrics, details, shiftAssignmentsCount = 0, employeeCount = 0, dateRange }) => {
    const unassignedCount = details.total_positions - details.assigned_positions;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v4-space-xl)' }}>
            {/* Summary Cards Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--v4-space-lg)' }}>
                {/* Assignment Summary */}
                <div className="v4-content-card">
                    <div style={{ fontSize: 'var(--v4-font-size-sm)', color: 'var(--v4-text-secondary)', marginBottom: 'var(--v4-space-sm)' }}>
                        分配摘要
                    </div>
                    <div style={{ fontSize: 'var(--v4-font-size-xl)', fontWeight: 600, color: 'var(--v4-text-primary)' }}>
                        {details.assigned_positions} <span style={{ color: 'var(--v4-text-tertiary)', fontWeight: 400 }}>/ {details.total_positions} 岗位</span>
                    </div>
                    <div style={{ marginTop: 'var(--v4-space-md)' }}>
                        <div className="v4-progress-bar">
                            <div
                                className={`v4-progress-fill ${metrics.completion_rate === 100 ? 'success' : 'warning'}`}
                                style={{ width: `${metrics.completion_rate}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Alert Card */}
                <div className="v4-content-card" style={{
                    background: unassignedCount > 0 ? 'var(--v4-color-warning-bg)' : 'var(--v4-color-success-bg)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--v4-space-md)' }}>
                        {unassignedCount > 0 ? (
                            <WarningOutlined style={{ fontSize: 32, color: 'var(--v4-color-warning)' }} />
                        ) : (
                            <CheckCircleOutlined style={{ fontSize: 32, color: 'var(--v4-color-success)' }} />
                        )}
                        <div>
                            <div style={{ fontSize: 'var(--v4-font-size-sm)', color: 'var(--v4-text-secondary)' }}>
                                {unassignedCount > 0 ? '未分配提醒' : '分配状态'}
                            </div>
                            <div style={{
                                fontSize: 'var(--v4-font-size-xl)',
                                fontWeight: 600,
                                color: unassignedCount > 0 ? 'var(--v4-color-warning)' : 'var(--v4-color-success)'
                            }}>
                                {unassignedCount > 0 ? `${unassignedCount} 个岗位未分配` : '全部分配完成'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="v4-content-card">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--v4-space-xl)' }}>
                    <div>
                        <div style={{ fontSize: 'var(--v4-font-size-sm)', color: 'var(--v4-text-secondary)', marginBottom: 'var(--v4-space-xs)' }}>
                            排班班次
                        </div>
                        <div style={{ fontSize: 'var(--v4-font-size-lg)', fontWeight: 600 }}>
                            {shiftAssignmentsCount}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 'var(--v4-font-size-sm)', color: 'var(--v4-text-secondary)', marginBottom: 'var(--v4-space-xs)' }}>
                            参与员工
                        </div>
                        <div style={{ fontSize: 'var(--v4-font-size-lg)', fontWeight: 600 }}>
                            {employeeCount}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 'var(--v4-font-size-sm)', color: 'var(--v4-text-secondary)', marginBottom: 'var(--v4-space-xs)' }}>
                            覆盖工序
                        </div>
                        <div style={{ fontSize: 'var(--v4-font-size-lg)', fontWeight: 600 }}>
                            {details.covered_operations} / {details.total_operations}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 'var(--v4-font-size-sm)', color: 'var(--v4-text-secondary)', marginBottom: 'var(--v4-space-xs)' }}>
                            排班周期
                        </div>
                        <div style={{ fontSize: 'var(--v4-font-size-lg)', fontWeight: 600 }}>
                            {dateRange ? `${dateRange.start} - ${dateRange.end}` : '-'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OverviewView;
