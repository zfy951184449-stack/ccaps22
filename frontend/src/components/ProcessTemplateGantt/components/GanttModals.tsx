import React, { useMemo } from 'react';
import { Modal, Form, Input, InputNumber, Select, Button, Space, Tabs, Table, Drawer, Alert, Typography, Tag, Radio } from 'antd';
import { PlusOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import { GanttNode, Operation, Constraint, ShareGroup, ConstraintValidationResult } from '../types';
import { TOKENS } from '../constants';
import { fuzzyMatch } from '../utils';
import { OperationSelectionModal } from '../../OperationSelectionModal';

const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;
const { Text } = Typography;

const CONSTRAINT_TYPE_OPTIONS = [
    { value: 0, label: '仅人员共享 (无时间依赖)' },
    { value: 1, label: 'FS (Finish-to-Start)' },
    { value: 2, label: 'SS (Start-to-Start)' },
    { value: 3, label: 'FF (Finish-to-Finish)' },
    { value: 4, label: 'SF (Start-to-Finish)' }
];

const LAG_TYPE_OPTIONS = [
    { value: 'ASAP', label: '尽早开始', color: 'green' },
    { value: 'FIXED', label: '固定延迟', color: 'blue' },
    { value: 'WINDOW', label: '时间窗口', color: 'cyan' },
    { value: 'NEXT_DAY', label: '次日开始', color: 'gold' },
    { value: 'NEXT_SHIFT', label: '下一班次', color: 'orange' },
    { value: 'COOLING', label: '冷却/培养', color: 'purple' },
    { value: 'BATCH_END', label: '批次结束后', color: 'magenta' }
];

const SHARE_MODE_OPTIONS = [
    { value: 'NONE', label: '无', color: 'default' },
    { value: 'SAME_TEAM', label: '同组执行', color: 'blue' },
    { value: 'DIFFERENT', label: '不同人员', color: 'orange' }
];

interface GanttModalsProps {
    // Edit Node Modal
    editModalVisible: boolean;
    setEditModalVisible: (visible: boolean) => void;
    editingNode: GanttNode | null;
    setEditingNode: (node: GanttNode | null) => void;
    form: FormInstance;
    handleSaveNode: (values: any) => void;
    availableOperations: Operation[];
    openOperationModal: () => void;

    // Constraints
    operationConstraints: { predecessors: Constraint[]; successors: Constraint[] };
    constraintForm: FormInstance;
    availableOperationsForConstraints: any[];
    handleSaveConstraint: (values: any, relation: 'predecessor' | 'successor') => Promise<void>;
    handleDeleteConstraint: (constraintId: number) => Promise<void>;
    // Share Groups
    shareGroups: ShareGroup[];
    operationShareGroups: ShareGroup[];
    assignGroupForm: FormInstance;
    shareGroupForm: FormInstance;
    shareGroupModalVisible: boolean;
    setShareGroupModalVisible: (visible: boolean) => void;
    handleAssignShareGroup: (values: any) => void;
    handleRemoveShareGroup: (groupId: number) => void;
    handleCreateShareGroup: (values: any) => void;
    assigningGroup: boolean;
    creatingGroup: boolean;

    // Validation
    validationDrawerVisible: boolean;
    setValidationDrawerVisible: (visible: boolean) => void;
    handleValidateConstraints: () => void;
    validationLoading: boolean;
    validationResult: ConstraintValidationResult | null;
    handleConflictHighlight: (conflict: any) => void;
    clearActiveHighlight: () => void;

    // Create Operation Modal
    operationModalVisible: boolean;
    setOperationModalVisible: (visible: boolean) => void;
    operationForm: FormInstance;
    handleOperationSubmit: () => void;
    operationSubmitting: boolean;
}

export const GanttModals: React.FC<GanttModalsProps> = ({
    editModalVisible,
    setEditModalVisible,
    editingNode,
    setEditingNode,
    form,
    handleSaveNode,
    availableOperations,
    openOperationModal,
    operationConstraints,
    constraintForm,
    availableOperationsForConstraints,
    handleSaveConstraint,
    handleDeleteConstraint,
    shareGroups,
    operationShareGroups,
    assignGroupForm,
    shareGroupForm,
    shareGroupModalVisible,
    setShareGroupModalVisible,
    handleAssignShareGroup,
    handleRemoveShareGroup,
    handleCreateShareGroup,
    assigningGroup,
    creatingGroup,
    validationDrawerVisible,
    setValidationDrawerVisible,
    handleValidateConstraints,
    validationLoading,
    validationResult,
    handleConflictHighlight,
    clearActiveHighlight,
    operationModalVisible,
    setOperationModalVisible,
    operationForm,
    handleOperationSubmit,
    operationSubmitting
}) => {
    const [predecessorModalVisible, setPredecessorModalVisible] = React.useState(false);
    const [successorModalVisible, setSuccessorModalVisible] = React.useState(false);
    const [selectedOperationForConstraint, setSelectedOperationForConstraint] = React.useState<number | null>(null);

    // Build search index for operations
    const operationSearchIndex = useMemo(() => {
        const map = new Map<number, string>();
        availableOperations.forEach(op => {
            map.set(op.id, `${op.operation_code} ${op.operation_name}`.toLowerCase());
        });
        return map;
    }, [availableOperations]);

    return (
        <>
            {/* Edit Node Modal */}
            <Modal
                title={editingNode?.type === 'stage' ? '编辑阶段' : '编辑操作'}
                open={editModalVisible}
                onCancel={() => {
                    setEditModalVisible(false);
                    setEditingNode(null);
                    form.resetFields();
                }}
                footer={null}
                width={600}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSaveNode}
                >
                    {editingNode?.type === 'stage' && (
                        <>
                            <Form.Item
                                name="stage_name"
                                label="阶段名称"
                                rules={[{ required: true, message: '请输入阶段名称' }]}
                            >
                                <Input placeholder="请输入阶段名称" />
                            </Form.Item>

                            <Form.Item
                                name="stage_code"
                                label="阶段代码"
                                rules={[{ required: true, message: '请输入阶段代码' }]}
                            >
                                <Input placeholder="如：STAGE1, STAGE2" />
                            </Form.Item>

                            <Form.Item
                                name="start_day"
                                label="阶段原点位置（Day0在总轴上的位置）"
                                tooltip="定义此阶段的Day0在模板总轴上的位置，支持负值"
                                rules={[
                                    { required: true, message: '请输入阶段原点位置' },
                                    { type: 'number', min: -50, max: 200, message: '必须在-50到200之间' }
                                ]}
                            >
                                <InputNumber
                                    min={-50}
                                    max={200}
                                    style={{ width: '100%' }}
                                    placeholder="阶段Day0在总轴的位置"
                                    addonBefore="Day"
                                />
                            </Form.Item>

                            <Form.Item name="description" label="阶段描述">
                                <TextArea rows={3} placeholder="请输入阶段描述（可选）" />
                            </Form.Item>

                            <div style={{
                                background: '#f0f7ff',
                                padding: '12px',
                                borderRadius: '6px',
                                border: '1px solid #d6e4ff',
                                marginBottom: '16px'
                            }}>
                                <Text strong style={{ color: '#1890ff' }}>💡 时间锚定说明：</Text>
                                <div style={{ marginTop: '8px', color: '#1f1f1f', fontSize: '12px' }}>
                                    • 阶段原点：定义该阶段Day0在模板总轴上的位置<br />
                                    • 操作定位：阶段内操作相对于阶段Day0进行定位<br />
                                    • 绝对位置：操作绝对位置 = 阶段原点 + 操作相对位置
                                </div>
                            </div>
                        </>
                    )}

                    {editingNode?.type === 'operation' && (
                        <Tabs defaultActiveKey="1">
                            {/* Tab 1: 基本信息 */}
                            <TabPane tab="基本信息" key="1">
                                <Form.Item
                                    name="operation_id"
                                    label="选择操作"
                                    rules={[{ required: true, message: '请选择操作' }]}
                                >
                                    <Select
                                        placeholder="请选择操作"
                                        disabled={!!editingNode.data}
                                        showSearch
                                        filterOption={(input, option) => {
                                            if (!input) return true;
                                            const rawValue = option?.value;
                                            const optionValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
                                            if (Number.isNaN(optionValue)) return false;
                                            const searchTarget = operationSearchIndex.get(optionValue);
                                            if (!searchTarget) return false;
                                            return fuzzyMatch(input, searchTarget);
                                        }}
                                        dropdownRender={(menu) => (
                                            <>
                                                {menu}
                                                {!editingNode.data && (
                                                    <div style={{ padding: 8, borderTop: `1px solid ${TOKENS.border}` }}>
                                                        <Button
                                                            type="link"
                                                            icon={<PlusOutlined />}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                openOperationModal();
                                                            }}
                                                            block
                                                        >
                                                            新建操作
                                                        </Button>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    >
                                        {availableOperations.map(op => (
                                            <Option key={op.id} value={op.id}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>{op.operation_code} - {op.operation_name}</span>
                                                    <span style={{ color: '#8c8c8c' }}>({op.standard_time}h)</span>
                                                </div>
                                            </Option>
                                        ))}
                                    </Select>
                                </Form.Item>

                                <Form.Item
                                    name="operation_day"
                                    label="操作位置（相对于阶段原点）"
                                    tooltip="操作在阶段时间轴上的天数位置，相对于阶段Day0"
                                    rules={[
                                        { required: true, message: '请输入操作位置' },
                                        { type: 'number', min: -30, max: 30, message: '必须在-30到30之间' }
                                    ]}
                                >
                                    <InputNumber
                                        min={-30}
                                        max={30}
                                        style={{ width: '100%' }}
                                        placeholder="相对于阶段Day0的位置"
                                        addonBefore="阶段Day"
                                    />
                                </Form.Item>

                                <Form.Item
                                    name="recommended_time"
                                    label="推荐开始时间（当天内）"
                                    tooltip="推荐的操作开始时间，24小时制"
                                    initialValue={9}
                                    rules={[{ required: true, message: '请输入推荐时间' }]}
                                >
                                    <InputNumber
                                        min={0}
                                        max={23.9}
                                        step={0.5}
                                        style={{ width: '100%' }}
                                        placeholder="默认 9:00"
                                        addonAfter="时"
                                    />
                                </Form.Item>

                                <Form.Item
                                    name="recommended_day_offset"
                                    label="推荐开始偏移（天）"
                                    initialValue={0}
                                >
                                    <InputNumber min={-7} max={7} style={{ width: '100%' }} />
                                </Form.Item>

                                <Form.Item
                                    name="window_start_time"
                                    label="时间窗口-开始时间"
                                    initialValue={9}
                                >
                                    <InputNumber min={0} max={23.9} step={0.5} style={{ width: '100%' }} addonAfter="时" />
                                </Form.Item>

                                <Form.Item
                                    name="window_start_day_offset"
                                    label="窗口开始偏移（天）"
                                    initialValue={0}
                                >
                                    <InputNumber min={-7} max={7} style={{ width: '100%' }} />
                                </Form.Item>

                                <Form.Item
                                    name="window_end_time"
                                    label="时间窗口-结束时间"
                                    initialValue={17}
                                >
                                    <InputNumber min={0} max={23.9} step={0.5} style={{ width: '100%' }} addonAfter="时" />
                                </Form.Item>

                                <Form.Item
                                    name="window_end_day_offset"
                                    label="窗口结束偏移（天）"
                                    initialValue={0}
                                >
                                    <InputNumber min={-7} max={7} style={{ width: '100%' }} />
                                </Form.Item>
                            </TabPane>

                            {/* Tab 2: 前置约束 */}
                            <TabPane tab={`前置约束 (${operationConstraints.predecessors.length})`} key="2">
                                <div style={{ marginBottom: 16 }}>
                                    <Form form={constraintForm} layout="vertical" onFinish={(values) => {
                                        handleSaveConstraint({ ...values, related_schedule_id: selectedOperationForConstraint }, 'predecessor');
                                        setSelectedOperationForConstraint(null);
                                    }}>
                                        <Form.Item label="前置操作" required>
                                            <Button
                                                block
                                                onClick={() => setPredecessorModalVisible(true)}
                                                style={{ textAlign: 'left', height: 'auto', padding: '8px 12px' }}
                                            >
                                                {selectedOperationForConstraint ? (
                                                    (() => {
                                                        const op = availableOperationsForConstraints.find((o: any) => o.id === selectedOperationForConstraint);
                                                        return op ? (
                                                            <div>
                                                                <div><strong>{op.operation_code}</strong> - {op.operation_name}</div>
                                                                <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                                                                    {op.stage_name} · Day {op.operation_day || 0}
                                                                </div>
                                                            </div>
                                                        ) : '选择前置操作';
                                                    })()
                                                ) : (
                                                    <span style={{ color: '#bfbfbf' }}>点击选择前置操作...</span>
                                                )}
                                            </Button>
                                        </Form.Item>
                                        <Form.Item name="constraint_type" label="约束类型" initialValue={1}>
                                            <Select>
                                                {CONSTRAINT_TYPE_OPTIONS.map(opt => (
                                                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="lag_type" label="延迟类型" initialValue="FIXED">
                                            <Select>
                                                {LAG_TYPE_OPTIONS.map(opt => (
                                                    <Option key={opt.value} value={opt.value}>
                                                        <Tag color={opt.color}>{opt.label}</Tag>
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.lag_type !== curr.lag_type}>
                                            {({ getFieldValue }) => {
                                                const lagType = getFieldValue('lag_type');
                                                const showLagMin = ['FIXED', 'WINDOW', 'COOLING'].includes(lagType);
                                                const showLagMax = lagType === 'WINDOW';
                                                return (
                                                    <>
                                                        {showLagMin && (
                                                            <Form.Item name="lag_min" label={lagType === 'WINDOW' ? '最小延迟(小时)' : '延迟时间(小时)'} initialValue={0}>
                                                                <InputNumber style={{ width: '100%' }} min={0} />
                                                            </Form.Item>
                                                        )}
                                                        {showLagMax && (
                                                            <Form.Item name="lag_max" label="最大延迟(小时)">
                                                                <InputNumber style={{ width: '100%' }} min={0} placeholder="可选" />
                                                            </Form.Item>
                                                        )}
                                                    </>
                                                );
                                            }}
                                        </Form.Item>
                                        <Form.Item name="share_mode" label="人员共享" initialValue="NONE">
                                            <Radio.Group>
                                                {SHARE_MODE_OPTIONS.map(opt => (
                                                    <Radio key={opt.value} value={opt.value}>
                                                        <Tag color={opt.color}>{opt.label}</Tag>
                                                    </Radio>
                                                ))}
                                            </Radio.Group>
                                        </Form.Item>
                                        <Form.Item>
                                            <Button type="primary" htmlType="submit" block>
                                                添加前置约束
                                            </Button>
                                        </Form.Item>
                                    </Form>
                                </div>
                                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                                    {operationConstraints.predecessors.map((c) => (
                                        <div key={c.constraint_id} style={{ padding: 8, border: '1px solid #d9d9d9', marginBottom: 8, borderRadius: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div><strong>{c.related_operation_name}</strong></div>
                                                    <div style={{ fontSize: 12, color: '#666' }}>
                                                        类型: {CONSTRAINT_TYPE_OPTIONS.find(o => o.value === c.constraint_type)?.label || 'FS'}
                                                        {c.lag_type && <Tag color={LAG_TYPE_OPTIONS.find(o => o.value === c.lag_type)?.color} style={{ marginLeft: 8 }}>{LAG_TYPE_OPTIONS.find(o => o.value === c.lag_type)?.label}</Tag>}
                                                        {(c.lag_type === 'FIXED' || c.lag_type === 'COOLING') && c.lag_min ? <span style={{ marginLeft: 8 }}>{c.lag_min}h</span> : null}
                                                        {c.lag_type === 'WINDOW' && <span style={{ marginLeft: 8 }}>{c.lag_min || 0}h - {c.lag_max || '∞'}h</span>}
                                                        {c.share_mode && c.share_mode !== 'NONE' && <Tag color={SHARE_MODE_OPTIONS.find(o => o.value === c.share_mode)?.color} style={{ marginLeft: 8 }}>{SHARE_MODE_OPTIONS.find(o => o.value === c.share_mode)?.label}</Tag>}
                                                    </div>
                                                </div>
                                                {c.constraint_id && (
                                                    <Button
                                                        type="text"
                                                        danger
                                                        size="small"
                                                        icon={<DeleteOutlined />}
                                                        onClick={() => handleDeleteConstraint(c.constraint_id!)}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {operationConstraints.predecessors.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无前置约束</div>
                                    )}
                                </div>
                            </TabPane>

                            {/* Tab 3: 后续约束 */}
                            <TabPane tab={`后续约束 (${operationConstraints.successors.length})`} key="3">
                                <div style={{ marginBottom: 16 }}>
                                    <Form form={constraintForm} layout="vertical" onFinish={(values) => {
                                        handleSaveConstraint({ ...values, related_schedule_id: selectedOperationForConstraint }, 'successor');
                                        setSelectedOperationForConstraint(null);
                                    }}>
                                        <Form.Item label="后续操作" required>
                                            <Button
                                                block
                                                onClick={() => setSuccessorModalVisible(true)}
                                                style={{ textAlign: 'left', height: 'auto', padding: '8px 12px' }}
                                            >
                                                {selectedOperationForConstraint ? (
                                                    (() => {
                                                        const op = availableOperationsForConstraints.find((o: any) => o.id === selectedOperationForConstraint);
                                                        return op ? (
                                                            <div>
                                                                <div><strong>{op.operation_code}</strong> - {op.operation_name}</div>
                                                                <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                                                                    {op.stage_name} · Day {op.operation_day || 0}
                                                                </div>
                                                            </div>
                                                        ) : '选择后续操作';
                                                    })()
                                                ) : (
                                                    <span style={{ color: '#bfbfbf' }}>点击选择后续操作...</span>
                                                )}
                                            </Button>
                                        </Form.Item>
                                        <Form.Item name="constraint_type" label="约束类型" initialValue={1}>
                                            <Select>
                                                {CONSTRAINT_TYPE_OPTIONS.map(opt => (
                                                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="lag_type" label="延迟类型" initialValue="FIXED">
                                            <Select>
                                                {LAG_TYPE_OPTIONS.map(opt => (
                                                    <Option key={opt.value} value={opt.value}>
                                                        <Tag color={opt.color}>{opt.label}</Tag>
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.lag_type !== curr.lag_type}>
                                            {({ getFieldValue }) => {
                                                const lagType = getFieldValue('lag_type');
                                                const showLagMin = ['FIXED', 'WINDOW', 'COOLING'].includes(lagType);
                                                const showLagMax = lagType === 'WINDOW';
                                                return (
                                                    <>
                                                        {showLagMin && (
                                                            <Form.Item name="lag_min" label={lagType === 'WINDOW' ? '最小延迟(小时)' : '延迟时间(小时)'} initialValue={0}>
                                                                <InputNumber style={{ width: '100%' }} min={0} />
                                                            </Form.Item>
                                                        )}
                                                        {showLagMax && (
                                                            <Form.Item name="lag_max" label="最大延迟(小时)">
                                                                <InputNumber style={{ width: '100%' }} min={0} placeholder="可选" />
                                                            </Form.Item>
                                                        )}
                                                    </>
                                                );
                                            }}
                                        </Form.Item>
                                        <Form.Item name="share_mode" label="人员共享" initialValue="NONE">
                                            <Radio.Group>
                                                {SHARE_MODE_OPTIONS.map(opt => (
                                                    <Radio key={opt.value} value={opt.value}>
                                                        <Tag color={opt.color}>{opt.label}</Tag>
                                                    </Radio>
                                                ))}
                                            </Radio.Group>
                                        </Form.Item>
                                        <Form.Item>
                                            <Button type="primary" htmlType="submit" block>
                                                添加后续约束
                                            </Button>
                                        </Form.Item>
                                    </Form>
                                </div>
                                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                                    {operationConstraints.successors.map((c) => (
                                        <div key={c.constraint_id} style={{ padding: 8, border: '1px solid #d9d9d9', marginBottom: 8, borderRadius: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div><strong>{c.related_operation_name}</strong></div>
                                                    <div style={{ fontSize: 12, color: '#666' }}>
                                                        类型: {CONSTRAINT_TYPE_OPTIONS.find(o => o.value === c.constraint_type)?.label || 'FS'}
                                                        {c.lag_type && <Tag color={LAG_TYPE_OPTIONS.find(o => o.value === c.lag_type)?.color} style={{ marginLeft: 8 }}>{LAG_TYPE_OPTIONS.find(o => o.value === c.lag_type)?.label}</Tag>}
                                                        {(c.lag_type === 'FIXED' || c.lag_type === 'COOLING') && c.lag_min ? <span style={{ marginLeft: 8 }}>{c.lag_min}h</span> : null}
                                                        {c.lag_type === 'WINDOW' && <span style={{ marginLeft: 8 }}>{c.lag_min || 0}h - {c.lag_max || '∞'}h</span>}
                                                        {c.share_mode && c.share_mode !== 'NONE' && <Tag color={SHARE_MODE_OPTIONS.find(o => o.value === c.share_mode)?.color} style={{ marginLeft: 8 }}>{SHARE_MODE_OPTIONS.find(o => o.value === c.share_mode)?.label}</Tag>}
                                                    </div>
                                                </div>
                                                {c.constraint_id && (
                                                    <Button
                                                        type="text"
                                                        danger
                                                        size="small"
                                                        icon={<DeleteOutlined />}
                                                        onClick={() => handleDeleteConstraint(c.constraint_id!)}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {operationConstraints.successors.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无后续约束</div>
                                    )}
                                </div>
                            </TabPane>

                            {/* Tab 4: 共享组 */}
                            <TabPane tab={`共享组 (${operationShareGroups.length})`} key="4">
                                {/* 当前操作所属的共享组列表 */}
                                <div style={{ marginBottom: 16 }}>
                                    <Text strong style={{ display: 'block', marginBottom: 8 }}>当前操作所属共享组：</Text>
                                    {operationShareGroups.length === 0 ? (
                                        <div style={{ color: '#999', fontSize: 13 }}>该操作未加入任何共享组</div>
                                    ) : (
                                        operationShareGroups.map(group => (
                                            <div key={group.id} style={{
                                                padding: '8px 12px',
                                                border: '1px solid #d9d9d9',
                                                borderRadius: 6,
                                                marginBottom: 8,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <div>
                                                    <span style={{ fontWeight: 500 }}>{group.group_name}</span>
                                                    <Tag
                                                        color={(group as any).share_mode === 'SAME_TEAM' ? 'blue' : 'orange'}
                                                        style={{ marginLeft: 8 }}
                                                    >
                                                        {(group as any).share_mode === 'SAME_TEAM' ? '同组执行' : '不同人员'}
                                                    </Tag>
                                                </div>
                                                <Button
                                                    type="text"
                                                    danger
                                                    size="small"
                                                    icon={<DeleteOutlined />}
                                                    onClick={() => handleRemoveShareGroup(group.id)}
                                                >
                                                    退出
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* 加入现有共享组 */}
                                <div style={{
                                    background: '#f6f8fa',
                                    padding: 12,
                                    borderRadius: 6,
                                    marginBottom: 16
                                }}>
                                    <Text strong style={{ display: 'block', marginBottom: 8 }}>加入现有共享组：</Text>
                                    <Form form={assignGroupForm} layout="inline" onFinish={handleAssignShareGroup}>
                                        <Form.Item name="share_group_id" rules={[{ required: true, message: '请选择' }]}>
                                            <Select placeholder="选择共享组" style={{ width: 180 }}>
                                                {shareGroups
                                                    .filter(g => !operationShareGroups.some(og => og.id === g.id))
                                                    .map(g => (
                                                        <Option key={g.id} value={g.id}>
                                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                <span>{g.group_name}</span>
                                                                {(g as any).share_mode && (
                                                                    <Tag
                                                                        color={(g as any).share_mode === 'SAME_TEAM' ? 'blue' : 'orange'}
                                                                        style={{ marginLeft: 8, fontSize: 11 }}
                                                                    >
                                                                        {(g as any).share_mode === 'SAME_TEAM' ? '同组' : '不同'}
                                                                    </Tag>
                                                                )}
                                                            </div>
                                                        </Option>
                                                    ))}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item>
                                            <Button type="primary" htmlType="submit" loading={assigningGroup}>
                                                加入
                                            </Button>
                                        </Form.Item>
                                    </Form>
                                </div>

                                {/* 创建新共享组入口 */}
                                <Button
                                    type="dashed"
                                    block
                                    icon={<PlusOutlined />}
                                    onClick={() => setShareGroupModalVisible(true)}
                                >
                                    绑定新操作组
                                </Button>

                                {/* 共享模式说明 */}
                                <div style={{
                                    marginTop: 16,
                                    padding: 12,
                                    background: '#f0f7ff',
                                    borderRadius: 6,
                                    border: '1px solid #d6e4ff',
                                    fontSize: 12,
                                    color: '#1f1f1f'
                                }}>
                                    <div style={{ fontWeight: 600, marginBottom: 6, color: '#1890ff' }}>💡 共享模式说明</div>
                                    <div style={{ marginBottom: 4 }}>
                                        • <Tag color="blue" style={{ fontSize: 11 }}>同组执行</Tag> 组内操作由同一组人员执行（团队槽位模式）
                                    </div>
                                    <div>
                                        • <Tag color="orange" style={{ fontSize: 11 }}>不同人员</Tag> 组内操作必须由不同人员执行（互斥模式）
                                    </div>
                                </div>
                            </TabPane>

                            {/* Tab 5: 校验 */}
                            <TabPane tab="校验" key="5">
                                <Button type="primary" onClick={handleValidateConstraints} loading={validationLoading} block>
                                    验证约束
                                </Button>
                                {validationResult && (
                                    <div style={{ marginTop: 16 }}>
                                        <Alert
                                            message={validationResult.hasConflicts ? '发现冲突' : '无冲突'}
                                            type={validationResult.hasConflicts ? 'warning' : 'success'}
                                            showIcon
                                        />
                                    </div>
                                )}
                            </TabPane>
                        </Tabs>
                    )}

                    <Form.Item>
                        <Space>
                            <Button type="primary" htmlType="submit">保存</Button>
                            <Button onClick={() => {
                                setEditModalVisible(false);
                                setEditingNode(null);
                                form.resetFields();
                            }}>
                                取消
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Create Operation Modal */}
            <Modal
                title="新建操作"
                open={operationModalVisible}
                onCancel={() => setOperationModalVisible(false)}
                onOk={handleOperationSubmit}
                confirmLoading={operationSubmitting}
                okText="保存"
                cancelText="取消"
            >
                <Form form={operationForm} layout="vertical">
                    <Form.Item
                        label="操作编码"
                        name="operation_code"
                        rules={[{ required: true, message: '请输入操作编码' }]}
                    >
                        <Input placeholder="自动生成" maxLength={50} disabled />
                    </Form.Item>
                    <Form.Item
                        label="操作名称"
                        name="operation_name"
                        rules={[{ required: true, message: '请输入操作名称' }]}
                    >
                        <Input placeholder="请输入操作名称" maxLength={100} />
                    </Form.Item>
                    <Form.Item
                        label="标准时长 (小时)"
                        name="standard_time"
                        rules={[{ required: true, message: '请输入标准时长' }]}
                    >
                        <InputNumber min={0.1} max={72} step={0.1} style={{ width: '100%' }} placeholder="例如 2.5" />
                    </Form.Item>
                    <Form.Item
                        label="需要人数"
                        name="required_people"
                        rules={[{ required: true, message: '请输入需要人数' }]}
                    >
                        <InputNumber min={1} max={50} step={1} style={{ width: '100%' }} placeholder="例如 3" />
                    </Form.Item>
                    <Form.Item label="操作描述" name="description">
                        <TextArea rows={3} placeholder="可选，补充说明" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Create Share Group Modal - Simplified */}
            <Modal
                title="绑定共享操作"
                open={shareGroupModalVisible}
                onCancel={() => {
                    setShareGroupModalVisible(false);
                    shareGroupForm.resetFields();
                }}
                footer={null}
                width={500}
            >
                <Form
                    form={shareGroupForm}
                    layout="vertical"
                    onFinish={(values) => {
                        // 自动生成 group_code 和 group_name
                        const autoCode = `SG_${Date.now()}`;
                        const selectedOps = values.selected_operations || [];
                        const autoName = selectedOps.length > 0
                            ? `共享组 (${selectedOps.length}个操作)`
                            : `共享组 ${autoCode}`;
                        handleCreateShareGroup({
                            ...values,
                            group_code: autoCode,
                            group_name: autoName,
                            selected_operations: selectedOps
                        });
                    }}
                >
                    {/* 共享模式选择 */}
                    <Form.Item
                        name="share_mode"
                        label="共享模式"
                        rules={[{ required: true, message: '请选择共享模式' }]}
                        initialValue="SAME_TEAM"
                    >
                        <Select size="large">
                            <Option value="SAME_TEAM">
                                <div style={{ padding: '4px 0' }}>
                                    <Tag color="blue" style={{ fontSize: 13 }}>同组执行</Tag>
                                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>组内操作由同一组人员执行</div>
                                </div>
                            </Option>
                            <Option value="DIFFERENT">
                                <div style={{ padding: '4px 0' }}>
                                    <Tag color="orange" style={{ fontSize: 13 }}>不同人员</Tag>
                                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>组内操作必须由不同人员执行</div>
                                </div>
                            </Option>
                        </Select>
                    </Form.Item>

                    {/* 选择要绑定的操作 */}
                    <Form.Item
                        name="selected_operations"
                        label="选择要绑定的操作"
                        rules={[{
                            required: true,
                            message: '请至少选择2个操作',
                            validator: (_, value) => {
                                if (!value || value.length < 2) {
                                    return Promise.reject('请至少选择2个操作');
                                }
                                return Promise.resolve();
                            }
                        }]}
                        initialValue={editingNode?.data?.id ? [editingNode.data.id] : []}
                    >
                        <Select
                            mode="multiple"
                            placeholder="选择操作（至少2个）"
                            style={{ width: '100%' }}
                            maxTagCount={3}
                            optionFilterProp="label"
                        >
                            {availableOperationsForConstraints.map((op: any) => (
                                <Option
                                    key={op.id}
                                    value={op.id}
                                    label={`${op.stage_name} - ${op.operation_name}`}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{op.operation_name}</span>
                                        <span style={{ color: '#999', fontSize: 12 }}>{op.stage_name}</span>
                                    </div>
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <div style={{
                        background: '#f6f8fa',
                        padding: 12,
                        borderRadius: 6,
                        marginBottom: 16,
                        fontSize: 12,
                        color: '#666'
                    }}>
                        💡 选择的操作将自动绑定为一个共享组，在排班时会根据选择的模式处理人员分配。
                    </div>

                    <Space>
                        <Button type="primary" loading={creatingGroup} htmlType="submit">
                            绑定
                        </Button>
                        <Button onClick={() => {
                            setShareGroupModalVisible(false);
                            shareGroupForm.resetFields();
                        }}>
                            取消
                        </Button>
                    </Space>
                </Form>
            </Modal>

            {/* Validation Drawer */}
            <Drawer
                title="约束校验结果"
                placement="right"
                width={500}
                open={validationDrawerVisible}
                onClose={() => {
                    setValidationDrawerVisible(false);
                    clearActiveHighlight();
                }}
            >
                {validationLoading && <div style={{ textAlign: 'center' }}>加载中...</div>}
                {validationResult && !validationLoading && (
                    <div>
                        <Alert
                            message={validationResult.hasConflicts ? `发现 ${validationResult.conflicts?.length || 0} 个冲突` : '无冲突'}
                            type={validationResult.hasConflicts ? 'error' : 'success'}
                            showIcon
                            style={{ marginBottom: 16 }}
                        />
                        {validationResult.conflicts?.map((conflict, idx) => (
                            <div
                                key={idx}
                                style={{
                                    padding: 12,
                                    border: '1px solid #ffccc7',
                                    borderRadius: 4,
                                    marginBottom: 8,
                                    cursor: 'pointer'
                                }}
                                onClick={() => handleConflictHighlight(conflict)}
                            >
                                <div><ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />{conflict.type}</div>
                                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{conflict.message}</div>
                            </div>
                        ))}
                    </div>
                )}
            </Drawer>

            <OperationSelectionModal
                visible={predecessorModalVisible}
                onClose={() => setPredecessorModalVisible(false)}
                onSelect={(scheduleId) => setSelectedOperationForConstraint(scheduleId)}
                operations={availableOperationsForConstraints}
                currentOperationId={editingNode?.data?.id}
                title="选择前置操作"
            />

            <OperationSelectionModal
                visible={successorModalVisible}
                onClose={() => setSuccessorModalVisible(false)}
                onSelect={(scheduleId) => setSelectedOperationForConstraint(scheduleId)}
                operations={availableOperationsForConstraints}
                currentOperationId={editingNode?.data?.id}
                title="选择后续操作"
            />
        </>
    );
};
