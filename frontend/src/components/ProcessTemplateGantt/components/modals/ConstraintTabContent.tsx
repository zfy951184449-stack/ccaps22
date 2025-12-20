/**
 * 约束 Tab 内容组件
 * 显示前置/后续约束列表，支持添加、删除和编辑
 */

import React, { useState } from 'react';
import { Button, Typography, Tag, Tooltip, Select, InputNumber, Space } from 'antd';
import { DeleteOutlined, PlusOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Constraint } from '../../types';
import { CONSTRAINT_TYPE_OPTIONS, LAG_TYPE_OPTIONS } from './constraintConstants';

const { Text } = Typography;
const { Option } = Select;

// 设计 tokens
const TOKENS = {
    cardBg: '#ffffff',
    cardBorder: '#e5e5e5',
    cardRadius: 8,
    sectionTitle: '#8c8c8c',
    primaryColor: '#1890ff',
};

interface ConstraintTabContentProps {
    predecessors: Constraint[];
    successors: Constraint[];
    onAddPredecessor: () => void;
    onAddSuccessor: () => void;
    onDelete: (constraintId: number) => void;
    onEdit?: (constraintId: number, updates: Partial<Constraint>) => Promise<void>;
}

// 约束卡片组件 - 支持展开编辑
const ConstraintCard: React.FC<{
    constraint: Constraint;
    direction: 'predecessor' | 'successor';
    onDelete: () => void;
    onEdit?: (updates: Partial<Constraint>) => Promise<void>;
}> = ({ constraint, direction, onDelete, onEdit }) => {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // 编辑状态值
    const [editType, setEditType] = useState(constraint.constraint_type);
    const [editLagType, setEditLagType] = useState(constraint.lag_type);
    const [editLagMin, setEditLagMin] = useState(constraint.lag_min);
    const [editLagMax, setEditLagMax] = useState(constraint.lag_max);

    const typeOption = CONSTRAINT_TYPE_OPTIONS.find(o => o.value === constraint.constraint_type);

    const getLagDisplay = () => {
        if (!constraint.lag_type) return null;
        if (constraint.lag_type === 'ASAP') {
            return <Tag color="green">尽早</Tag>;
        }
        if (constraint.lag_type === 'WINDOW') {
            return <Tag color="cyan">{constraint.lag_min || 0}h - {constraint.lag_max || '∞'}h</Tag>;
        }
        if (constraint.lag_min) {
            return <Tag color="orange">延迟 {constraint.lag_min}h</Tag>;
        }
        const lagOpt = LAG_TYPE_OPTIONS.find(o => o.value === constraint.lag_type);
        return lagOpt ? <Tag color={lagOpt.color}>{lagOpt.label}</Tag> : null;
    };

    const handleStartEdit = () => {
        setEditType(constraint.constraint_type);
        setEditLagType(constraint.lag_type);
        setEditLagMin(constraint.lag_min);
        setEditLagMax(constraint.lag_max);
        setEditing(true);
        setExpanded(true);
    };

    const handleCancelEdit = () => {
        setEditing(false);
        setExpanded(false);
    };

    const handleSave = async () => {
        if (!onEdit) return;
        setSaving(true);
        try {
            await onEdit({
                constraint_type: editType,
                lag_type: editLagType,
                lag_min: editLagMin,
                lag_max: editLagMax,
            });
            setEditing(false);
            setExpanded(false);
        } finally {
            setSaving(false);
        }
    };

    const showLagFields = ['FIXED', 'WINDOW', 'COOLING'].includes(editLagType || '');
    const showLagMax = editLagType === 'WINDOW';

    return (
        <div
            style={{
                background: TOKENS.cardBg,
                border: `1px solid ${expanded ? TOKENS.primaryColor : TOKENS.cardBorder}`,
                borderRadius: TOKENS.cardRadius,
                marginBottom: 10,
                transition: 'border-color 0.15s ease',
                overflow: 'hidden',
            }}
        >
            {/* 头部 - 折叠视图 */}
            <div
                style={{
                    padding: 12,
                    cursor: onEdit ? 'pointer' : 'default',
                }}
                onClick={() => !editing && onEdit && setExpanded(!expanded)}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                        <span style={{ color: '#999', fontSize: 12, marginRight: 4 }}>
                            {direction === 'predecessor' ? '←' : ''}
                        </span>
                        <Text strong style={{ fontSize: 13 }}>
                            {constraint.related_operation_name || `操作 #${constraint.related_schedule_id}`}
                        </Text>
                        <span style={{ color: '#999', fontSize: 12, marginLeft: 4 }}>
                            {direction === 'successor' ? '→' : ''}
                        </span>
                    </div>
                    <Space size={4}>
                        {onEdit && !editing && (
                            <Tooltip title="编辑">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined />}
                                    onClick={(e) => { e.stopPropagation(); handleStartEdit(); }}
                                    style={{ opacity: 0.6 }}
                                />
                            </Tooltip>
                        )}
                        <Tooltip title="删除">
                            <Button
                                type="text"
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                style={{ opacity: 0.6 }}
                            />
                        </Tooltip>
                    </Space>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Tag color="blue">{typeOption?.label || 'FS'}</Tag>
                    {getLagDisplay()}
                </div>
            </div>

            {/* 展开编辑区域 */}
            {expanded && editing && (
                <div style={{
                    padding: '12px 12px 12px',
                    borderTop: `1px solid ${TOKENS.cardBorder}`,
                    background: '#fafafa',
                }}>
                    <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>约束类型</Text>
                        <Select
                            value={editType}
                            onChange={setEditType}
                            style={{ width: '100%' }}
                            size="small"
                        >
                            {CONSTRAINT_TYPE_OPTIONS.map(opt => (
                                <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                            ))}
                        </Select>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>延迟类型</Text>
                        <Select
                            value={editLagType}
                            onChange={setEditLagType}
                            style={{ width: '100%' }}
                            size="small"
                        >
                            {LAG_TYPE_OPTIONS.map(opt => (
                                <Option key={opt.value} value={opt.value}>
                                    <Tag color={opt.color} style={{ marginRight: 4 }}>{opt.label}</Tag>
                                </Option>
                            ))}
                        </Select>
                    </div>

                    {showLagFields && (
                        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                            <div style={{ flex: 1 }}>
                                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                                    {showLagMax ? '最小延迟 (h)' : '延迟时间 (h)'}
                                </Text>
                                <InputNumber
                                    value={editLagMin}
                                    onChange={(v) => setEditLagMin(v || 0)}
                                    min={0}
                                    size="small"
                                    style={{ width: '100%' }}
                                />
                            </div>
                            {showLagMax && (
                                <div style={{ flex: 1 }}>
                                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>最大延迟 (h)</Text>
                                    <InputNumber
                                        value={editLagMax}
                                        onChange={(v) => setEditLagMax(v || undefined)}
                                        min={0}
                                        size="small"
                                        style={{ width: '100%' }}
                                        placeholder="无上限"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <Button size="small" icon={<CloseOutlined />} onClick={handleCancelEdit}>
                            取消
                        </Button>
                        <Button type="primary" size="small" icon={<CheckOutlined />} loading={saving} onClick={handleSave}>
                            保存
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Section 标题
const SectionTitle: React.FC<{ title: string; count: number }> = ({ title, count }) => (
    <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: TOKENS.sectionTitle,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
    }}>
        {title} ({count})
    </div>
);

// 添加按钮
const AddButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button
        onClick={onClick}
        style={{
            width: '100%',
            padding: 10,
            border: '1px dashed #d9d9d9',
            borderRadius: TOKENS.cardRadius,
            background: 'transparent',
            color: TOKENS.primaryColor,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            transition: 'all 0.15s ease',
            marginBottom: 8,
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = TOKENS.primaryColor;
            e.currentTarget.style.background = 'rgba(24,144,255,0.04)';
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#d9d9d9';
            e.currentTarget.style.background = 'transparent';
        }}
    >
        <PlusOutlined style={{ marginRight: 6 }} />
        {label}
    </button>
);

export const ConstraintTabContent: React.FC<ConstraintTabContentProps> = ({
    predecessors,
    successors,
    onAddPredecessor,
    onAddSuccessor,
    onDelete,
    onEdit,
}) => {
    return (
        <div style={{ padding: 16 }}>
            {/* 前置约束 Section */}
            <div style={{ marginBottom: 20 }}>
                <SectionTitle title="前置约束" count={predecessors.length} />

                {predecessors.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 16, color: '#999', fontSize: 12 }}>
                        暂无前置约束
                    </div>
                ) : (
                    predecessors.map((c) => (
                        <ConstraintCard
                            key={c.constraint_id}
                            constraint={c}
                            direction="predecessor"
                            onDelete={() => c.constraint_id && onDelete(c.constraint_id)}
                            onEdit={onEdit && c.constraint_id ? (updates) => onEdit(c.constraint_id!, updates) : undefined}
                        />
                    ))
                )}

                <AddButton label="添加前置约束" onClick={onAddPredecessor} />
            </div>

            {/* 分隔线 */}
            <div style={{ height: 1, background: '#e5e5e5', margin: '16px 0' }} />

            {/* 后续约束 Section */}
            <div>
                <SectionTitle title="后续约束" count={successors.length} />

                {successors.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 16, color: '#999', fontSize: 12 }}>
                        暂无后续约束
                    </div>
                ) : (
                    successors.map((c) => (
                        <ConstraintCard
                            key={c.constraint_id}
                            constraint={c}
                            direction="successor"
                            onDelete={() => c.constraint_id && onDelete(c.constraint_id)}
                            onEdit={onEdit && c.constraint_id ? (updates) => onEdit(c.constraint_id!, updates) : undefined}
                        />
                    ))
                )}

                <AddButton label="添加后续约束" onClick={onAddSuccessor} />
            </div>
        </div>
    );
};
