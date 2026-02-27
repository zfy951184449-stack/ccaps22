/**
 * 内联约束分组组件
 * 
 * 按照线稿设计实现 4 个约束分组：
 * - 基础硬约束 (H1-9)
 * - 公平性策略 (F1-4)
 * - 运营软约束 (S1-2)
 * - 其他策略 (P3)
 */

import React from 'react';
import { Checkbox, Select, Tag, Space } from 'antd';

interface InlineConstraintPanelProps {
    disabled?: boolean;
}

// 约束分组定义
const CONSTRAINT_GROUPS = [
    {
        id: 'hard',
        title: '基础硬约束 (H1-11)',
        subtitle: '必须满足',
        color: '#f5222d',
        items: [
            { id: 'H1', name: '资质匹配', enabled: true },
            { id: 'H2', name: '一位一人', enabled: true },
            { id: 'H3', name: '同操作互斥', enabled: true },
            { id: 'H4', name: '时间冲突互斥', enabled: true },
            { id: 'H5', name: '连续工作限制', enabled: true },
            { id: 'H6', name: '班次覆盖', enabled: true },
            { id: 'H7', name: '夜班强制休息', enabled: true },
            { id: 'H8', name: '月度工时上限', enabled: true },
            { id: 'H9', name: '月度工时下限', enabled: true },
            { id: 'H10', name: '共享组一致性', enabled: true },
            { id: 'H11', name: '不可用时间段', enabled: true },
        ],
    },
    {
        id: 'fairness',
        title: '公平性策略 (F1-4)',
        subtitle: '优先级: 中',
        priority: 'P2',
        color: '#722ed1',
        items: [
            { id: 'F1', name: '夜班数量均衡', enabled: true },
            { id: 'F2', name: '长白班均衡', enabled: true },
            { id: 'F3', name: '夜班间隔均匀', enabled: true },
            { id: 'F4', name: '操作时长公平', enabled: true },
        ],
    },
    {
        id: 'operational',
        title: '运营软约束 (S1-2)',
        subtitle: '优先级: 高',
        priority: 'P1',
        color: '#1890ff',
        items: [
            { id: 'S1', name: '最小化缺员', enabled: true },
            { id: 'S5', name: '共享组跨日惩罚', enabled: true },
        ],
    },
    {
        id: 'other',
        title: '其他策略 (P3)',
        subtitle: '优先级: 低',
        priority: 'P3',
        color: '#8c8c8c',
        items: [
            { id: 'S6', name: '非工作日惩罚', enabled: true },
            { id: 'S7', name: '主管少干活', enabled: true },
            { id: 'S8', name: '连续工作后补偿休息', enabled: true },
            { id: 'S9', name: '主管避免夜班', enabled: true },
        ],
    },
];

const PRIORITY_OPTIONS = [
    { value: 'P0', label: '最高 (P0)' },
    { value: 'P1', label: '高 (P1)' },
    { value: 'P2', label: '中 (P2)' },
    { value: 'P3', label: '低 (P3)' },
];

const InlineConstraintPanel: React.FC<InlineConstraintPanelProps> = ({ disabled = false }) => {
    return (
        <div className="constraint-groups">
            {CONSTRAINT_GROUPS.map((group) => (
                <div key={group.id} className="constraint-group">
                    <div className="group-header">
                        <span className="group-title" style={{ color: group.color }}>
                            {group.title}
                        </span>
                        {group.priority ? (
                            <Select
                                size="small"
                                defaultValue={group.priority}
                                options={PRIORITY_OPTIONS}
                                style={{ width: 100 }}
                                disabled={disabled}
                            />
                        ) : (
                            <Tag color={group.color}>{group.subtitle}</Tag>
                        )}
                    </div>
                    <div className="group-items">
                        {group.items.map((item) => (
                            <div key={item.id} className="constraint-item">
                                <Checkbox defaultChecked={item.enabled} disabled={disabled}>
                                    {item.name}
                                </Checkbox>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default InlineConstraintPanel;
