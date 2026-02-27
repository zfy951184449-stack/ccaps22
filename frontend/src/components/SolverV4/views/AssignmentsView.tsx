import React, { useMemo, useState } from 'react';
import { Input, Select, Empty } from 'antd';
import { SearchOutlined, UserOutlined, CheckCircleOutlined, ExclamationCircleOutlined, MinusCircleOutlined } from '@ant-design/icons';
import '../SolverV4.css';

interface Operation {
    operation_plan_id: number;
    batch_code: string;
    operation_name: string;
    planned_start: string;
    planned_end: string;
    share_group_ids?: string;
    share_group_name?: string;
    status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED';
    positions?: {
        position_number: number;
        status: 'ASSIGNED' | 'UNASSIGNED';
        employee?: { id: number; name: string; code: string };
    }[];
}

interface AssignmentsViewProps {
    operations: Operation[];
}

const AssignmentsView: React.FC<AssignmentsViewProps> = ({ operations }) => {
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [groupFilter, setGroupFilter] = useState<string>('all');

    const groupedData = useMemo(() => {
        const groups: Record<string, { name: string; ops: Operation[] }> = {};
        const independent: Operation[] = [];

        operations.forEach(op => {
            if (op.share_group_ids) {
                const key = op.share_group_ids;
                if (!groups[key]) {
                    groups[key] = { name: op.share_group_name || '未命名组', ops: [] };
                }
                groups[key].ops.push(op);
            } else {
                independent.push(op);
            }
        });

        return { groups, independent };
    }, [operations]);

    const groupOptions = useMemo(() => {
        const opts = [{ value: 'all', label: '全部分组' }];
        Object.entries(groupedData.groups).forEach(([key, val]) => {
            opts.push({ value: key, label: val.name });
        });
        if (groupedData.independent.length > 0) {
            opts.push({ value: 'independent', label: '独立工序' });
        }
        return opts;
    }, [groupedData]);

    const filterOps = (ops: Operation[]) => {
        return ops.filter(op => {
            if (searchText && !op.batch_code.includes(searchText) && !op.operation_name.includes(searchText)) {
                return false;
            }
            if (statusFilter !== 'all' && op.status !== statusFilter) {
                return false;
            }
            return true;
        });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'COMPLETE':
                return <span className="v4-badge v4-badge-success"><CheckCircleOutlined /> 全部分配</span>;
            case 'PARTIAL':
                return <span className="v4-badge v4-badge-warning"><ExclamationCircleOutlined /> 部分分配</span>;
            default:
                return <span className="v4-badge v4-badge-error"><MinusCircleOutlined /> 未分配</span>;
        }
    };

    const renderTable = (ops: Operation[]) => {
        const filtered = filterOps(ops);
        if (filtered.length === 0) return null;

        return (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: 'var(--v4-bg-section)' }}>
                        <th style={thStyle}>批次号</th>
                        <th style={thStyle}>工序名称</th>
                        <th style={thStyle}>时间</th>
                        <th style={thStyle}>岗位分配</th>
                        <th style={{ ...thStyle, width: 100 }}>状态</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(op => (
                        <tr key={op.operation_plan_id} style={{ borderBottom: '1px solid var(--v4-border-color)' }}>
                            <td style={tdStyle}>{op.batch_code}</td>
                            <td style={tdStyle}>{op.operation_name}</td>
                            <td style={tdStyle}>
                                <div style={{ fontSize: 'var(--v4-font-size-xs)' }}>
                                    {new Date(op.planned_start).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                                </div>
                                <div style={{ fontSize: 'var(--v4-font-size-xs)', color: 'var(--v4-text-tertiary)' }}>
                                    {new Date(op.planned_start).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} - {new Date(op.planned_end).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </td>
                            <td style={tdStyle}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--v4-space-xs)' }}>
                                    {op.positions?.map(pos => (
                                        <span
                                            key={pos.position_number}
                                            className={`v4-badge ${pos.status === 'ASSIGNED' ? 'v4-badge-success' : ''}`}
                                            style={pos.status !== 'ASSIGNED' ? { background: 'var(--v4-bg-section)', color: 'var(--v4-text-tertiary)' } : {}}
                                        >
                                            {pos.status === 'ASSIGNED' ? (
                                                <><UserOutlined /> {pos.employee?.name}</>
                                            ) : (
                                                <>岗位 {pos.position_number}</>
                                            )}
                                        </span>
                                    )) || <span style={{ color: 'var(--v4-text-tertiary)' }}>无岗位</span>}
                                </div>
                            </td>
                            <td style={tdStyle}>{getStatusBadge(op.status)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    const thStyle: React.CSSProperties = {
        padding: 'var(--v4-space-md) var(--v4-space-lg)',
        textAlign: 'left',
        fontSize: 'var(--v4-font-size-xs)',
        fontWeight: 500,
        color: 'var(--v4-text-secondary)'
    };

    const tdStyle: React.CSSProperties = {
        padding: 'var(--v4-space-md) var(--v4-space-lg)',
        fontSize: 'var(--v4-font-size-sm)'
    };

    if (operations.length === 0) {
        return <Empty description="暂无工序数据" style={{ padding: 'var(--v4-space-2xl)' }} />;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v4-space-lg)' }}>
            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: 'var(--v4-space-md)' }}>
                <Input
                    placeholder="搜索批次或工序..."
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    style={{ width: 240, borderRadius: 'var(--v4-radius-md)' }}
                />
                <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                        { value: 'all', label: '全部状态' },
                        { value: 'COMPLETE', label: '全部分配' },
                        { value: 'PARTIAL', label: '部分分配' },
                        { value: 'UNASSIGNED', label: '未分配' }
                    ]}
                    style={{ width: 120 }}
                />
                <Select
                    value={groupFilter}
                    onChange={setGroupFilter}
                    options={groupOptions}
                    style={{ width: 160 }}
                />
            </div>

            {/* Grouped Tables */}
            {Object.entries(groupedData.groups).map(([key, group]) => {
                if (groupFilter !== 'all' && groupFilter !== key) return null;
                const filtered = filterOps(group.ops);
                if (filtered.length === 0) return null;

                return (
                    <div key={key} className="v4-content-card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div className="v4-section-header">Share Group: {group.name}</div>
                        {renderTable(group.ops)}
                    </div>
                );
            })}

            {/* Independent Operations */}
            {(groupFilter === 'all' || groupFilter === 'independent') && groupedData.independent.length > 0 && (
                <div className="v4-content-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="v4-section-header">独立工序</div>
                    {renderTable(groupedData.independent)}
                </div>
            )}
        </div>
    );
};

export default AssignmentsView;
