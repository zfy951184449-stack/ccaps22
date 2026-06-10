import React, { useEffect, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import {
    WxbAlert,
    WxbButton,
    WxbDataTable,
    WxbDatePicker,
    WxbDivider,
    WxbModal,
    WxbPopconfirm,
    WxbRangePicker,
    WxbSelect,
    WxbTabs,
    wxbToast,
} from '../../wxb-ui';
import { GanttOperation } from './types';
import dayjs from 'dayjs';
import locale from 'antd/es/date-picker/locale/zh_CN';
import axios from 'axios';
import ShareGroupMembersTab from './ShareGroupMembersTab';
import './EditOperationModal.css';

interface EditOperationModalProps {
    visible: boolean;
    operation: GanttOperation | null;
    onClose: () => void;
    onSave: (id: number, values: any) => Promise<void>;
    onDelete?: (id: number) => Promise<void>;
    getContainer?: () => HTMLElement;
}

type DateRangeValue = [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;

// 弹窗内手写表单状态（替代 antd Form）
interface BasicFormValues {
    selectedOperationId: number | null;
    windowTime: DateRangeValue;
    plannedStart: dayjs.Dayjs | null;
    duration: number;
}

const PlusIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
    </svg>
);

const DeleteIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 14h10l1-14" />
        <path d="M9 7V4h6v3" />
    </svg>
);

const EditOperationModal: React.FC<EditOperationModalProps> = ({ visible, operation, onClose, onSave, onDelete, getContainer }) => {
    const [loading, setLoading] = useState(false);
    const [operationList, setOperationList] = useState<any[]>([]); // Store standard operations

    // Basic form state（手写校验，替代 antd Form）
    const [values, setValues] = useState<BasicFormValues>({
        selectedOperationId: null,
        windowTime: null,
        plannedStart: null,
        duration: 0,
    });
    const [plannedStartError, setPlannedStartError] = useState<string | undefined>(undefined);

    // Constraints State
    const [activeTab, setActiveTab] = useState('basic');
    const [constraints, setConstraints] = useState<any[]>([]);
    const [availableOps, setAvailableOps] = useState<any[]>([]);
    const [constraintLoading, setConstraintLoading] = useState(false);
    const [predecessorId, setPredecessorId] = useState<number | null>(null);
    const [predecessorError, setPredecessorError] = useState<string | undefined>(undefined);

    const [computedEnd, setComputedEnd] = useState<dayjs.Dayjs | null>(null);

    const { plannedStart, duration } = values;

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
            const initialDuration = operation.duration; // Assuming hours

            setValues({
                selectedOperationId: null, // Reset check (or set to current op if we had that info)
                windowTime: [
                    operation.windowStartDate ? dayjs(operation.windowStartDate) : null,
                    operation.windowEndDate ? dayjs(operation.windowEndDate) : null,
                ],
                plannedStart: start,
                duration: initialDuration, // Display
            });
            setPlannedStartError(undefined);
            setComputedEnd(end);
        }
    }, [visible, operation]);

    // Fetch Constraints & Available Ops when switching to Constraints tab
    useEffect(() => {
        if (visible && operation && activeTab === 'constraints') {
            fetchConstraints();
            // Fetch available operations if we have batch_id context
            if (operation.batch_id) {
                fetchAvailableOperations();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            wxbToast.error('加载约束失败');
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
    const handleOperationChange = (opId: number | null) => {
        setValues((current) => ({ ...current, selectedOperationId: opId }));

        const selectedOp = operationList.find(op => op.id === opId);
        if (selectedOp) {
            // Update Duration and Recalc End Time
            const newDuration = selectedOp.standard_time;
            setValues((current) => ({ ...current, duration: newDuration }));

            if (plannedStart) {
                const newEnd = plannedStart.add(newDuration, 'hour');
                setComputedEnd(newEnd);
            }

            wxbToast.info(`已选择操作: ${selectedOp.operation_name}, 工时已更新为 ${newDuration} 小时`);
        }
    };

    // Update Computed End when Start changes
    useEffect(() => {
        if (plannedStart) {
            const currentDuration = duration || operation?.duration || 0;
            const newEnd = plannedStart.add(currentDuration, 'hour');
            setComputedEnd(newEnd);
        }
    }, [plannedStart, duration, operation]);

    const handleStartChange = (date: dayjs.Dayjs | null) => {
        setValues((current) => ({ ...current, plannedStart: date }));
        setPlannedStartError(undefined);
    };

    const handleAddConstraint = async () => {
        if (!predecessorId) {
            setPredecessorError('请选择操作');
            return;
        }
        if (!operation?.batch_id) {
            wxbToast.error('缺少批次上下文，无法添加约束');
            return;
        }
        try {
            await axios.post('/api/batch-constraints', {
                batch_plan_id: operation.batch_id,
                from_operation_plan_id: predecessorId, // The selected op is the predecessor (FROM)
                to_operation_plan_id: operation.id, // TO this op
                constraint_type: 'FINISH_TO_START', // Default
                lag_time: 0
            });
            wxbToast.success('约束添加成功');
            setPredecessorId(null);
            setPredecessorError(undefined);
            fetchConstraints(); // Refresh list
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || '添加约束失败';
            if (errorMsg === 'Would create circular dependency') {
                wxbToast.error('添加失败：会造成循环依赖');
            } else if (errorMsg === 'Constraint already exists') {
                wxbToast.error('该约束已存在');
            } else {
                wxbToast.error(errorMsg);
            }
        }
    };

    const handleDeleteConstraint = async (id: number) => {
        try {
            await axios.delete(`/api/batch-constraints/${id}`);
            wxbToast.success('约束删除成功');
            fetchConstraints();
        } catch (error) {
            wxbToast.error('删除失败');
        }
    };

    const handleOk = async () => {
        // 手写校验：计划开始时间必填
        if (!plannedStart) {
            setPlannedStartError('请选择计划开始时间');
            return;
        }

        setLoading(true);
        try {
            // Extract values
            const [windowStart, windowEnd] = values.windowTime || [];
            const start = plannedStart;
            const newOpId = values.selectedOperationId;
            const currentDuration = values.duration;

            // Auto-calculate end time (HOURS)
            const end = start.add(currentDuration, 'hour');

            // Window Constraint Validation
            if (windowStart && start.isBefore(windowStart)) {
                wxbToast.error('计划开始时间不能早于窗口开始时间');
                setLoading(false);
                return;
            }

            if (windowEnd && end.isAfter(windowEnd)) {
                wxbToast.error('计划结束时间不能晚于窗口结束时间');
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
            console.error('Save Failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const basicInfoContent = (
        <div>
            <WxbAlert className="edit-op-modal__alert" title="时间约束提示">
                结束时间将根据“计划开始时间”和“工时”自动计算。请修改开始时间。
            </WxbAlert>

            <WxbDivider className="edit-op-modal__divider" label="时间窗口 (硬约束)" />

            <WxbRangePicker
                label="窗口限制 (Window Time)"
                showTime={{ format: 'HH:mm' }}
                format="YYYY-MM-DD HH:mm"
                locale={locale}
                style={{ width: '100%' }}
                value={values.windowTime as any}
                onChange={(range) => setValues((current) => ({ ...current, windowTime: (range as DateRangeValue) ?? null }))}
                getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
            />

            <WxbSelect
                label="替换操作 (可选)"
                showSearch
                placeholder="搜索并选择新操作..."
                optionFilterProp="children"
                value={values.selectedOperationId ?? undefined}
                onChange={(value) => handleOperationChange((value as number) ?? null)}
                filterOption={(input, option) =>
                    (String(option?.label ?? '')).toLowerCase().includes(input.toLowerCase())
                }
                options={operationList.map(op => ({
                    value: op.id,
                    label: `${op.operation_code} - ${op.operation_name} (工时: ${op.standard_time}h)`
                }))}
                allowClear
                getPopupContainer={(triggerNode) => triggerNode.parentElement}
            />

            <WxbDivider className="edit-op-modal__divider" label="计划执行" />

            <div className="edit-op-modal__time-row">
                <div className="edit-op-modal__time-col">
                    <WxbDatePicker
                        label="计划开始时间"
                        showTime={{ format: 'HH:mm' }}
                        format="YYYY-MM-DD HH:mm"
                        locale={locale}
                        style={{ width: '100%' }}
                        value={plannedStart}
                        error={plannedStartError}
                        onChange={(date) => handleStartChange(date as dayjs.Dayjs | null)}
                        getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                    />
                </div>

                <div className="edit-op-modal__time-col">
                    <label className="wxb-label">预计结束时间 (自动计算)</label>
                    <div className="edit-op-modal__readonly">
                        {computedEnd ? computedEnd.format('YYYY-MM-DD HH:mm') : '-'}
                    </div>
                </div>
            </div>

            <div className="edit-op-modal__duration">
                工时 (Duration)：{duration} 小时
            </div>
        </div>
    );

    const constraintColumns: ColumnsType<any> = [
        {
            title: '前置操作',
            dataIndex: 'related_operation_name',
            key: 'related_operation_name',
            render: (text, record: any) => (
                <div>
                    <div className="edit-op-modal__cell-name">{text}</div>
                    <div className="edit-op-modal__cell-code">{record.related_operation_code}</div>
                </div>
            )
        },
        {
            title: '约束类型',
            dataIndex: 'constraint_type',
            key: 'constraint_type',
            render: () => <span className="edit-op-modal__type-tag">Finish-to-Start</span>
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => (
                <WxbPopconfirm
                    title="确定删除此约束吗?"
                    onConfirm={() => handleDeleteConstraint(record.constraint_id)}
                    getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                >
                    <WxbButton variant="danger" size="sm">
                        <DeleteIcon size={15} />
                    </WxbButton>
                </WxbPopconfirm>
            )
        }
    ];

    const constraintsContent = (
        <div>
            <div className="edit-op-modal__constraint-tools">
                <WxbSelect
                    className="edit-op-modal__constraint-select"
                    placeholder="选择前置操作 (添加依赖)..."
                    style={{ width: '100%' }}
                    showSearch
                    value={predecessorId ?? undefined}
                    error={predecessorError}
                    onChange={(value) => {
                        setPredecessorId((value as number) ?? null);
                        setPredecessorError(undefined);
                    }}
                    filterOption={(input, option) =>
                        (String(option?.label ?? '')).toLowerCase().includes(input.toLowerCase())
                    }
                    options={availableOps.map(op => ({
                        value: op.operation_plan_id,
                        label: `${op.operation_code} ${op.operation_name} (${op.stage_name})`
                    }))}
                    getPopupContainer={(triggerNode) => triggerNode.parentElement}
                />
                <WxbButton className="edit-op-modal__constraint-add-btn" onClick={handleAddConstraint}>
                    <PlusIcon size={16} />
                    添加前置约束
                </WxbButton>
            </div>

            <WxbDataTable
                dataSource={constraints}
                rowKey="constraint_id"
                size="small"
                loading={constraintLoading}
                pagination={false}
                columns={constraintColumns}
                emptyState={{ description: '暂无前置约束' }}
            />
        </div>
    );

    // Dynamic Footer Logic
    let footer: React.ReactNode;
    if (activeTab === 'basic') {
        footer = (
            <div className="edit-op-modal__footer">
                {onDelete && operation?.id ? (
                    <WxbPopconfirm
                        title="确定要删除此操作吗?"
                        description="此操作不可恢复，相关的约束也会被删除。"
                        onConfirm={() => onDelete(operation.id)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
                    >
                        <WxbButton variant="danger" className="edit-op-modal__footer-delete">
                            <DeleteIcon size={15} />
                            删除操作
                        </WxbButton>
                    </WxbPopconfirm>
                ) : null}
                <WxbButton variant="ghost" onClick={onClose}>
                    取消
                </WxbButton>
                <WxbButton disabled={loading} onClick={handleOk}>
                    {loading ? '保存中...' : '保存修改'}
                </WxbButton>
            </div>
        );
    } else {
        // For Constraints and Share tab, just Close button
        footer = (
            <div className="edit-op-modal__footer">
                <WxbButton onClick={onClose}>
                    完成
                </WxbButton>
            </div>
        );
    }

    return (
        <WxbModal
            title={`编辑操作: ${operation?.name || ''}`}
            open={visible}
            onCancel={onClose}
            getContainer={getContainer}
            footer={footer}
            destroyOnClose
            width={700}
        >
            <WxbTabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    { key: 'basic', label: '基本信息', children: basicInfoContent },
                    { key: 'constraints', label: '约束关系', children: constraintsContent },
                    { key: 'share', label: '共享组 (Share Group)', children: <ShareGroupMembersTab operation={operation} getContainer={getContainer} /> }
                ]}
            />
        </WxbModal>
    );
};

export default EditOperationModal;
