import React, { useState, useEffect } from 'react';
import {
    Modal, Form, Input, InputNumber, Select, Checkbox,
    DatePicker, Button, Space, message, Row, Col, Typography
} from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { StandaloneTask, StandaloneTaskQualification, TaskType } from './types';
import axios from 'axios';
import dayjs from 'dayjs';
import RecurrenceRuleEditor from './RecurrenceRuleEditor';

const { Title, Text } = Typography;

interface TaskFormModalProps {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    initialValues?: StandaloneTask | null;
}

const TaskFormModal: React.FC<TaskFormModalProps> = ({
    visible, onCancel, onSuccess, initialValues
}) => {
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [taskType, setTaskType] = useState<TaskType>('FLEXIBLE');

    // Reference data
    const [teams, setTeams] = useState<any[]>([]);
    const [shifts, setShifts] = useState<any[]>([]);
    const [qualifications, setQualifications] = useState<any[]>([]);
    const [batches, setBatches] = useState<any[]>([]);

    useEffect(() => {
        if (visible) {
            fetchReferenceData();
            if (initialValues) {
                setTaskType(initialValues.task_type);
                form.setFieldsValue({
                    ...initialValues,
                    earliest_start: initialValues.earliest_start ? dayjs(initialValues.earliest_start) : undefined,
                    deadline: dayjs(initialValues.deadline),
                    // map qualifications back to form
                    qualifications: initialValues.qualifications?.map(q => q.qualification_id) || []
                });
            } else {
                setTaskType('FLEXIBLE');
                form.resetFields();
                form.setFieldsValue({ task_type: 'FLEXIBLE', required_people: 1, duration_minutes: 60 });
            }
        }
    }, [visible, initialValues, form]);

    const fetchReferenceData = async () => {
        try {
            const [teamsRes, shiftsRes, qualsRes, batchesRes] = await Promise.all([
                axios.get(`/api/organization/teams`),
                axios.get(`/api/shift-definitions`),
                axios.get(`/api/qualifications`),
                axios.get(`/api/batch-plans`)
            ]);
            setTeams(teamsRes.data);
            setShifts(shiftsRes.data);
            setQualifications(qualsRes.data);

            const batchData = Array.isArray(batchesRes.data) ? batchesRes.data : batchesRes.data?.data || [];
            const activeBatches = batchData.filter((b: any) => b.plan_status === 'ACTIVATED');
            setBatches(activeBatches);

            // Set default preferred shifts if creating new
            if (!initialValues) {
                const nonNightShifts = shiftsRes.data
                    .filter((s: any) => !s.is_night_shift)
                    .map((s: any) => s.id);
                form.setFieldValue('preferred_shift_ids', nonNightShifts);
            }
        } catch (error) {
            console.error('Failed to load reference data', error);
            message.error('加载参考数据失败');
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);

            const payload = {
                ...values,
                earliest_start: values.earliest_start ? values.earliest_start.format('YYYY-MM-DD') : null,
                deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : null,
                // Simple qualification mapping for Phase 2: mapping selected IDs to position 1, min_level 1
                qualifications: values.qualifications?.map((qId: number) => ({
                    position_number: 1,
                    qualification_id: qId,
                    min_level: 1,
                    is_mandatory: true
                })) || []
            };

            if (initialValues?.id) {
                await axios.put(`/api/standalone-tasks/${initialValues.id}`, payload);
                message.success('任务更新成功');
            } else {
                await axios.post(`/api/standalone-tasks`, payload);
                message.success('任务创建成功');
            }

            onSuccess();
        } catch (error) {
            console.error('Form submission failed', error);
            message.error('保存任务失败，请检查输入');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            title={<div style={{ textAlign: 'center', fontSize: 18, paddingBottom: 8 }}>{initialValues ? '编辑任务' : '新增任务'}</div>}
            open={visible}
            onCancel={onCancel}
            footer={[
                <Button key="cancel" onClick={onCancel}>取消</Button>,
                <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit}>确认保存</Button>
            ]}
            width={560}
            styles={{ body: { padding: '16px 8px' }, content: { borderRadius: 16 } }}
        >
            <Form
                form={form}
                layout="vertical"
                onValuesChange={(changed) => {
                    if (changed.task_type) setTaskType(changed.task_type);
                }}
            >
                <Form.Item
                    name="task_name"
                    label="任务名称"
                    rules={[{ required: true, message: '请输入任务名称' }]}
                >
                    <Input placeholder="例：BPR审查 - B2026001" size="large" />
                </Form.Item>

                <Form.Item
                    name="task_type"
                    label="任务类型 (Task Type)"
                    rules={[{ required: true, message: '请选择任务类型' }]}
                >
                    <Select options={[
                        { label: '弹性任务 (Flexible - Window restricted)', value: 'FLEXIBLE' },
                        { label: '周期任务 (Recurring - Pattern based)', value: 'RECURRING' },
                        { label: '临时任务 (Ad-Hoc - Pushed directly)', value: 'AD_HOC' },
                    ]} />
                </Form.Item>

                {/* Recurrence Rule Editor (only show if RECURRING) */}
                <Form.Item
                    noStyle
                    shouldUpdate={(prevValues, currentValues) => prevValues.task_type !== currentValues.task_type}
                >
                    {({ getFieldValue }) =>
                        getFieldValue('task_type') === 'RECURRING' ? (
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                                <Title level={5} className="!mb-4 !mt-0 !text-sm text-slate-800 flex items-center gap-2">
                                    <ClockCircleOutlined /> 周期规则配置
                                </Title>
                                <Form.Item
                                    name="recurrence_rule"
                                    rules={[{ required: true, message: '请配置周期规则' }]}
                                    className="!mb-0"
                                >
                                    <RecurrenceRuleEditor />
                                </Form.Item>
                            </div>
                        ) : null
                    }
                </Form.Item>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item name="team_id" label="所属部门">
                            <Select placeholder="请选择部门" allowClear>
                                {teams.map(t => <Select.Option key={t.id} value={t.id}>{t.unit_name}</Select.Option>)}
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={6}>
                        <Form.Item name="required_people" label="需求人数" rules={[{ required: true }]}>
                            <InputNumber min={1} max={99} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col span={6}>
                        <Form.Item name="duration_minutes" label="预计工时" rules={[{ required: true }]}>
                            <InputNumber min={1} style={{ width: '100%' }} addonAfter="分钟" />
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item name="qualifications" label="资质要求">
                    <Select mode="multiple" placeholder="请选择适用资质（可选）">
                        {qualifications.map(q => <Select.Option key={q.id} value={q.id}>{q.qualification_name}</Select.Option>)}
                    </Select>
                </Form.Item>

                <Form.Item name="preferred_shift_ids" label="允许班次">
                    <Checkbox.Group>
                        {shifts.map(s => (
                            <Checkbox key={s.id} value={s.id}>
                                {s.shift_name}
                                {s.is_night_shift && <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>[夜班]</Text>}
                            </Checkbox>
                        ))}
                    </Checkbox.Group>
                </Form.Item>

                <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <Text strong style={{ display: 'block', marginBottom: 12 }}>时间约束</Text>
                    <Row gutter={16}>
                        {(taskType === 'FLEXIBLE' || taskType === 'AD_HOC') && (
                            <Col span={12}>
                                <Form.Item name="earliest_start" label="最早开始">
                                    <DatePicker style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                        )}
                        <Col span={12}>
                            <Form.Item name="deadline" label="截止日期" rules={[{ required: true, message: '请选择截止日期' }]}>
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    {taskType === 'FLEXIBLE' && (
                        <Form.Item name="related_batch_id" label="关联批次（可选）" style={{ marginBottom: 0 }}>
                            <Select placeholder="选择关联批次" allowClear showSearch optionFilterProp="children">
                                {batches.map(b => <Select.Option key={b.id} value={b.id}>{b.batch_code}</Select.Option>)}
                            </Select>
                        </Form.Item>
                    )}


                </div>
            </Form>
        </Modal>
    );
};

export default TaskFormModal;
