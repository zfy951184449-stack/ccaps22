import React, { useEffect, useState } from 'react';
import { Modal, Form, DatePicker, Button, message, Divider, Alert, Select, Tabs, Table, Popconfirm } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { GanttOperation } from './types';
import dayjs from 'dayjs';
import locale from 'antd/es/date-picker/locale/zh_CN';
import axios from 'axios';
import ShareGroupMembersTab from './ShareGroupMembersTab';

interface EditOperationModalProps {
    visible: boolean;
    operation: GanttOperation | null;
    onClose: () => void;
    onSave: (id: number, values: any) => Promise<void>;
    onDelete?: (id: number) => Promise<void>;
    getContainer?: () => HTMLElement;
}

const EditOperationModal: React.FC<EditOperationModalProps> = ({ visible, operation, onClose, onSave, onDelete, getContainer }) => {
    const [form] = Form.useForm();

    const [loading, setLoading] = useState(false);
    const [operationList, setOperationList] = useState<any[]>([]); // Store standard operations

    // Constraints State
    const [activeTab, setActiveTab] = useState('basic');
    const [constraints, setConstraints] = useState<any[]>([]);
    const [availableOps, setAvailableOps] = useState<any[]>([]);
    const [constraintLoading, setConstraintLoading] = useState(false);
    const [constraintForm] = Form.useForm();

    // Watch plannedStart to auto-calc end time
    const plannedStart = Form.useWatch('plannedStart', form);
    const [computedEnd, setComputedEnd] = useState<dayjs.Dayjs | null>(null);

    // Fetch operations on mount
    useEffect(() => {
        const fetchOperations = async () => {
            try {
                const response = await axios.get('/api/operations');
                setOperationList(response.data);
            } catch (error) {
                console.error('Failed to fetch operations:', error);
            }
        };
        fetchOperations();
    }, []);

    // Initialize Form Data
    useEffect(() => {
        if (visible && operation) {
            const start = dayjs(operation.startDate);
            const end = dayjs(operation.endDate);
            const duration = operation.duration; // Assuming hours

            form.setFieldsValue({
                selectedOperationId: null, // Reset check (or set to current op if we had that info)
                windowTime: [
                    operation.windowStartDate ? dayjs(operation.windowStartDate) : null,
                    operation.windowEndDate ? dayjs(operation.windowEndDate) : null
                ],
                plannedStart: start,
                duration: duration // Display
            });
            setComputedEnd(end);
        }
    }, [visible, operation, form]);

    // Fetch Constraints & Available Ops when switching to Constraints tab
    useEffect(() => {
        if (visible && operation && activeTab === 'constraints') {
            fetchConstraints();
            // Fetch available operations if we have batch_id context
            if (operation.batch_id) {
                fetchAvailableOperations();
            }
        }
    }, [visible, operation, activeTab]);

    const fetchConstraints = async () => {
        if (!operation) return;
        setConstraintLoading(true);
        try {
            const res = await axios.get(`/api/batch-operation-plans/${operation.id}/constraints`);
            // We mainly care about predecessors for now (constraints affecting THIS op)
            setConstraints(res.data.predecessors);
        } catch (error) {
            console.error('Failed to fetch constraints', error);
            message.error('加载约束失败');
        } finally {
            setConstraintLoading(false);
        }
    };

    const fetchAvailableOperations = async () => {
        if (!operation?.batch_id) return;
        try {
            const res = await axios.get(`/api/batches/${operation.batch_id}/available-operations`, {
                params: { excludeOperationPlanId: operation.id }
            });
            setAvailableOps(res.data);
        } catch (error) {
            console.error('Failed to fetch available operations', error);
        }
    };

    // Handle Operation Selection Change
    const handleOperationChange = (opId: number) => {
        const selectedOp = operationList.find(op => op.id === opId);
        if (selectedOp) {
            // Update Duration and Recalc End Time
            const newDuration = selectedOp.standard_time;
            form.setFieldsValue({ duration: newDuration });

            if (plannedStart) {
                const newEnd = plannedStart.add(newDuration, 'hour');
                setComputedEnd(newEnd);
            }

            message.info(`已选择操作: ${selectedOp.operation_name}, 工时已更新为 ${newDuration} 小时`);
        }
    };

    // Update Computed End when Start changes
    useEffect(() => {
        if (plannedStart) {
            const currentDuration = form.getFieldValue('duration') || operation?.duration || 0;
            const newEnd = plannedStart.add(currentDuration, 'hour');
            setComputedEnd(newEnd);
        }
    }, [plannedStart, form, operation]);

    const handleAddConstraint = async (values: any) => {
        if (!operation?.batch_id) {
            message.error('缺少批次上下文，无法添加约束');
            return;
        }
        try {
            await axios.post('/api/batch-constraints', {
                batch_plan_id: operation.batch_id,
                from_operation_plan_id: values.predecessorId, // The selected op is the predecessor (FROM)
                to_operation_plan_id: operation.id, // TO this op
                constraint_type: 'FINISH_TO_START', // Default
                lag_time: 0
            });
            message.success('约束添加成功');
            constraintForm.resetFields();
            fetchConstraints(); // Refresh list
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || '添加约束失败';
            if (errorMsg === 'Would create circular dependency') {
                message.error('添加失败：会造成循环依赖');
            } else if (errorMsg === 'Constraint already exists') {
                message.error('该约束已存在');
            } else {
                message.error(errorMsg);
            }
        }
    };

    const handleDeleteConstraint = async (id: number) => {
        try {
            await axios.delete(`/api/batch-constraints/${id}`);
            message.success('约束删除成功');
            fetchConstraints();
        } catch (error) {
            message.error('删除失败');
        }
    }

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            // Extract values
            const [windowStart, windowEnd] = values.windowTime || [];
            const start = values.plannedStart;
            const newOpId = values.selectedOperationId;
            const currentDuration = form.getFieldValue('duration');

            // Auto-calculate end time (HOURS)
            const end = start.add(currentDuration, 'hour');

            // Window Constraint Validation
            if (windowStart && start.isBefore(windowStart)) {
                message.error('计划开始时间不能早于窗口开始时间');
                setLoading(false);
                return;
            }

            if (windowEnd && end.isAfter(windowEnd)) {
                message.error('计划结束时间不能晚于窗口结束时间');
                setLoading(false);
                return;
            }

            await onSave(operation!.id, {
                startDate: start.format('YYYY-MM-DD HH:mm:ss'),
                endDate: end.format('YYYY-MM-DD HH:mm:ss'), // Send calculated end
                windowStartDate: windowStart?.format('YYYY-MM-DD HH:mm:ss'),
                windowEndDate: windowEnd?.format('YYYY-MM-DD HH:mm:ss'),
                newOperationId: newOpId, // Optional replacement
                plannedDuration: currentDuration,
                requiredPeople: newOpId ? (operationList.find(o => o.id === newOpId)?.required_people) : undefined
            });

            onClose();
        } catch (error) {
            console.error('Validation Failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const basicInfoContent = (
        <Form form={form} layout="vertical">
            <Alert
                message="时间约束提示"
                description="结束时间将根据“计划开始时间”和“工时”自动计算。请修改开始时间。"
                type="info"
                showIcon
                style={{ marginBottom: 24, borderRadius: 8, border: '1px solid #bae0ff', backgroundColor: '#e6f7ff' }}
            />

            <Divider orientation="left" style={{ borderColor: '#E5E7EB', fontSize: 13, color: '#6B7280' }}>时间窗口 (硬约束)</Divider>

            <Form.Item
                name="windowTime"
                label="窗口限制 (Window Time)"
                tooltip="操作必须在此时间范围内进行"
            >
                <DatePicker.RangePicker
                    showTime={{ format: 'HH:mm' }}
                    format="YYYY-MM-DD HH:mm"
                    locale={locale}
                    style={{ width: '100%', borderRadius: 8, padding: '8px 12px' }}
                    getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                />
            </Form.Item>

            <Form.Item
                name="selectedOperationId"
                label="替换操作 (可选)"
                tooltip="选择此项将替换当前操作，并重置工时"
            >
                <Select
                    showSearch
                    placeholder="搜索并选择新操作..."
                    optionFilterProp="children"
                    onChange={handleOperationChange}
                    filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={operationList.map(op => ({
                        value: op.id,
                        label: `${op.operation_code} - ${op.operation_name} (工时: ${op.standard_time}h)`
                    }))}
                    allowClear
                    getPopupContainer={(triggerNode) => triggerNode.parentElement}
                />
            </Form.Item>

            <Divider orientation="left" style={{ borderColor: '#E5E7EB', fontSize: 13, color: '#6B7280' }}>计划执行</Divider>

            <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item
                    name="plannedStart"
                    label="计划开始时间"
                    rules={[{ required: true, message: '请选择计划开始时间' }]}
                    style={{ flex: 1 }}
                >
                    <DatePicker
                        showTime={{ format: 'HH:mm' }}
                        format="YYYY-MM-DD HH:mm"
                        locale={locale}
                        style={{ width: '100%', borderRadius: 8, padding: '8px 12px' }}
                        getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                    />
                </Form.Item>

                <Form.Item
                    label="预计结束时间 (自动计算)"
                    style={{ flex: 1 }}
                >
                    <div style={{
                        padding: '9px 12px',
                        backgroundColor: '#f5f5f5',
                        borderRadius: 8,
                        border: '1px solid #d9d9d9',
                        color: '#000000a6',
                        height: 40,
                        lineHeight: '20px'
                    }}>
                        {computedEnd ? computedEnd.format('YYYY-MM-DD HH:mm') : '-'}
                    </div>
                </Form.Item>
            </div>

            <Form.Item label="工时 (Duration)" style={{ marginTop: -12 }} name="duration">
                {/* Render text, but keep value in form for submission */}
                <div style={{ color: '#6B7280', fontSize: 12 }}>
                    {form.getFieldValue('duration')} 小时
                </div>
            </Form.Item>
        </Form>
    );

    const constraintsContent = (
        <div>
            <div style={{ marginBottom: 16, backgroundColor: '#FAFAFA', padding: 12, borderRadius: 8, border: '1px solid #F0F0F0' }}>
                <Form form={constraintForm} layout="inline" onFinish={handleAddConstraint}>
                    <Form.Item name="predecessorId" rules={[{ required: true, message: '请选择操作' }]} style={{ flex: 1 }}>
                        <Select
                            placeholder="选择前置操作 (添加依赖)..."
                            style={{ width: '100%' }}
                            showSearch
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            options={availableOps.map(op => ({
                                value: op.operation_plan_id,
                                label: `${op.operation_code} ${op.operation_name} (${op.stage_name})`
                            }))}
                            getPopupContainer={(triggerNode) => triggerNode.parentElement}
                        />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" icon={<PlusOutlined />} style={{ backgroundColor: '#000', borderColor: '#000' }}>
                            添加前置约束
                        </Button>
                    </Form.Item>
                </Form>
            </div>

            <Table
                dataSource={constraints}
                rowKey="constraint_id"
                size="small"
                loading={constraintLoading}
                pagination={false}
                columns={[
                    {
                        title: '前置操作',
                        dataIndex: 'related_operation_name',
                        key: 'related_operation_name',
                        render: (text, record: any) => (
                            <div>
                                <div style={{ fontWeight: 500 }}>{text}</div>
                                <div style={{ fontSize: 12, color: '#6B7280' }}>{record.related_operation_code}</div>
                            </div>
                        )
                    },
                    {
                        title: '约束类型',
                        dataIndex: 'constraint_type',
                        key: 'constraint_type',
                        render: () => <span style={{ color: '#10B981', backgroundColor: '#ECFDF5', padding: '2px 8px', borderRadius: 99, fontSize: 12 }}>Finish-to-Start</span>
                    },
                    {
                        title: '操作',
                        key: 'action',
                        render: (_, record) => (
                            <Popconfirm title="确定删除此约束吗?" onConfirm={() => handleDeleteConstraint(record.constraint_id)} getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}>
                                <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                            </Popconfirm>
                        )
                    }
                ]}
                locale={{ emptyText: '暂无前置约束' }}
            />
        </div>
    );

    // Dynamic Footer Logic
    let footerButtons: React.ReactNode[] = [];
    if (activeTab === 'basic') {
        footerButtons = [
            onDelete && operation?.id ? (
                <Popconfirm
                    key="delete"
                    title="确定要删除此操作吗?"
                    description="此操作不可恢复，相关的约束也会被删除。"
                    onConfirm={() => onDelete(operation.id)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                >
                    <Button danger icon={<DeleteOutlined />} style={{ float: 'left', borderRadius: 8 }}>
                        删除操作
                    </Button>
                </Popconfirm>
            ) : null,
            <Button key="back" onClick={onClose} style={{ borderRadius: 8 }}>
                取消
            </Button>,
            <Button key="submit" type="primary" loading={loading} onClick={handleOk} style={{ borderRadius: 8, backgroundColor: '#000', borderColor: '#000' }}>
                保存修改
            </Button>
        ];
    } else {
        // For Constraints and Share tab, just Close button
        footerButtons = [
            <Button key="close" type="primary" onClick={onClose} style={{ borderRadius: 8 }}>
                完成
            </Button>
        ];
    }

    return (
        <Modal
            title={<div style={{ fontSize: 18, fontWeight: 600 }}>{`编辑操作: ${operation?.name || ''}`}</div>}
            open={visible}
            onCancel={onClose}
            getContainer={getContainer}
            footer={footerButtons}
            destroyOnClose
            styles={{
                content: {
                    borderRadius: 16,
                    padding: 24,
                    boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.1)',
                    backdropFilter: 'blur(10px)',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)'
                },
                header: {
                    marginBottom: 0,
                    backgroundColor: 'transparent'
                }
            }}
            width={700}
        >
            <div style={{ marginTop: 16 }}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        { key: 'basic', label: '基本信息', children: basicInfoContent },
                        { key: 'constraints', label: '约束关系', children: constraintsContent },
                        { key: 'share', label: '共享组 (Share Group)', children: <ShareGroupMembersTab operation={operation} getContainer={getContainer} /> }
                    ]}
                />
            </div>
        </Modal>
    );
};

export default EditOperationModal;
