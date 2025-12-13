/**
 * 冲突分析 Tab 组件
 * 
 * 显示约束冲突检测的结果，帮助用户了解为什么某些操作无法分配。
 */

import React, { useMemo } from 'react';
import { Table, Tag, Alert, Empty, Typography, Tooltip, Badge } from 'antd';
import {
    ExclamationCircleOutlined,
    WarningOutlined,
    UserDeleteOutlined,
    CalendarOutlined,
    TeamOutlined,
    MoonOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

// 冲突类型定义
interface OperationConflict {
    op_id: number;
    op_name: string;
    date: string;
    conflict_type: string;
    severity: string;
    reason: string;
    details: string[];
}

interface ConflictReport {
    critical_conflicts: OperationConflict[];
    warnings: OperationConflict[];
    summary?: string;
}

interface ConflictAnalysisTabProps {
    report: ConflictReport | null | undefined;
}

// 冲突类型配置
const CONFLICT_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    NO_CANDIDATES: {
        label: '无候选人',
        icon: <UserDeleteOutlined />,
        color: 'red'
    },
    ALL_UNAVAILABLE: {
        label: '候选人不可用',
        icon: <TeamOutlined />,
        color: 'orange'
    },
    DEMAND_OVERFLOW: {
        label: '需求超出',
        icon: <CalendarOutlined />,
        color: 'volcano'
    },
    NIGHT_REST: {
        label: '夜班休息',
        icon: <MoonOutlined />,
        color: 'purple'
    },
};

const ConflictAnalysisTab: React.FC<ConflictAnalysisTabProps> = ({ report }) => {
    // 合并所有冲突
    const allConflicts = useMemo(() => {
        if (!report) return [];
        return [...report.critical_conflicts, ...report.warnings];
    }, [report]);

    // 统计信息
    const stats = useMemo(() => {
        if (!report) return { critical: 0, warning: 0, total: 0 };
        return {
            critical: report.critical_conflicts.length,
            warning: report.warnings.length,
            total: report.critical_conflicts.length + report.warnings.length,
        };
    }, [report]);

    // 表格列定义
    const columns: ColumnsType<OperationConflict> = [
        {
            title: '严重性',
            dataIndex: 'severity',
            key: 'severity',
            width: 100,
            render: (severity: string) => (
                severity === 'CRITICAL'
                    ? <Tag color="error" icon={<ExclamationCircleOutlined />}>严重</Tag>
                    : <Tag color="warning" icon={<WarningOutlined />}>警告</Tag>
            ),
            filters: [
                { text: '严重', value: 'CRITICAL' },
                { text: '警告', value: 'WARNING' },
            ],
            onFilter: (value, record) => record.severity === value,
        },
        {
            title: '冲突类型',
            dataIndex: 'conflict_type',
            key: 'conflict_type',
            width: 140,
            render: (type: string) => {
                const config = CONFLICT_TYPE_CONFIG[type] || { label: type, icon: null, color: 'default' };
                return (
                    <Tag color={config.color} icon={config.icon}>
                        {config.label}
                    </Tag>
                );
            },
            filters: Object.entries(CONFLICT_TYPE_CONFIG).map(([key, config]) => ({
                text: config.label,
                value: key,
            })),
            onFilter: (value, record) => record.conflict_type === value,
        },
        {
            title: '操作/日期',
            key: 'operation',
            width: 200,
            render: (_, record) => (
                <div>
                    <Text strong>{record.op_name}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{record.date}</Text>
                </div>
            ),
        },
        {
            title: '原因',
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
        },
        {
            title: '详情',
            dataIndex: 'details',
            key: 'details',
            width: 120,
            render: (details: string[]) => {
                if (!details || details.length === 0) return '-';
                return (
                    <Tooltip
                        title={
                            <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                                {details.map((d, i) => <li key={i}>{d}</li>)}
                            </ul>
                        }
                    >
                        <Badge count={details.length} style={{ backgroundColor: '#1890ff' }}>
                            <Text type="secondary" style={{ cursor: 'pointer' }}>查看详情</Text>
                        </Badge>
                    </Tooltip>
                );
            },
        },
    ];

    // 空状态
    if (!report || stats.total === 0) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                    <span>
                        未检测到约束冲突<br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            所有操作都有可分配的候选人
                        </Text>
                    </span>
                }
            />
        );
    }

    return (
        <div className="conflict-analysis-tab">
            {/* 摘要警告 */}
            {stats.critical > 0 && (
                <Alert
                    type="error"
                    showIcon
                    icon={<ExclamationCircleOutlined />}
                    message={`检测到 ${stats.critical} 个无法分配的操作`}
                    description="这些操作由于约束冲突必然无法被分配，请检查资质配置或人员安排。"
                    style={{ marginBottom: 16 }}
                />
            )}

            {stats.warning > 0 && stats.critical === 0 && (
                <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    message={`检测到 ${stats.warning} 个潜在问题`}
                    description="这些操作可能因为资源紧张而难以分配。"
                    style={{ marginBottom: 16 }}
                />
            )}

            {/* 冲突列表 */}
            <Table
                dataSource={allConflicts}
                columns={columns}
                rowKey={(record, index) => `${record.op_id}-${record.conflict_type}-${index}`}
                size="small"
                pagination={{
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`,
                }}
                locale={{
                    emptyText: '未检测到约束冲突',
                }}
            />
        </div>
    );
};

export default ConflictAnalysisTab;
