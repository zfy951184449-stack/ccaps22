/**
 * StandingDutyTab — Standalone task management for non-batch duties.
 *
 * Split into two zones:
 *   Top:    RECURRING template cards (create / edit / delete)
 *   Bottom: Monthly FLEXIBLE/AD_HOC instances table (generate / delete)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    Card, Row, Col, Button, Table, Tag, Modal, Form, Input, InputNumber,
    Select, Radio, Checkbox, DatePicker, message, Empty, Popconfirm,
    Typography, Space, Tooltip, Spin, Divider,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
    CalendarOutlined, TeamOutlined, ClockCircleOutlined,
    ExclamationCircleOutlined, ToolOutlined, ApartmentOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

// ─── Label mappings (排班员友好) ─────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
    RECURRING: '周期值班',
    FLEXIBLE: '弹性安排',
    AD_HOC: '临时任务',
};

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
    PENDING: { text: '待排班', color: 'blue' },
    SCHEDULED: { text: '已排班', color: 'green' },
    COMPLETED: { text: '已完成', color: 'default' },
    CANCELLED: { text: '已取消', color: 'red' },
};

const FREQ_LABELS: Record<string, string> = {
    DAILY: '每天',
    WEEKLY: '每周',
    MONTHLY: '每月',
};

const WEEKDAY_OPTIONS = [
    { label: '周一', value: 1 },
    { label: '周二', value: 2 },
    { label: '周三', value: 3 },
    { label: '周四', value: 4 },
    { label: '周五', value: 5 },
    { label: '周六', value: 6 },
    { label: '周日', value: 7 },
];

// ─── Types ───────────────────────────────────────────────────

interface StandaloneTask {
    id: number;
    task_code: string;
    task_name: string;
    task_type: 'RECURRING' | 'FLEXIBLE' | 'AD_HOC';
    required_people: number;
    duration_minutes: number;
    team_id: number | null;
    team_name?: string;
    earliest_start: string | null;
    deadline: string | null;
    preferred_shift_ids: number[] | string | null;
    recurrence_rule: any;
    status: string;
    created_at: string;
}

interface ShiftDef {
    id: number;
    shift_code: string;
    shift_name: string;
    start_time: string;
    end_time: string;
    nominal_hours: number;
    is_night_shift: boolean;
}

interface SolverTeam {
    id: number;
    teamCode: string;
    teamName: string;
}

// ─── Template left-bar color ─────────────────────────────────

function getAccentColor(task: StandaloneTask, shifts: ShiftDef[]): string {
    const parsedIds = parseShiftIds(task.preferred_shift_ids);
    if (parsedIds.length === 0) return '#8b5cf6'; // default purple
    const firstShift = shifts.find(s => parsedIds.includes(s.id));
    if (firstShift?.is_night_shift) return '#7c3aed';
    return '#f59e0b';
}

function parseShiftIds(raw: number[] | string | null): number[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function formatRecurrenceRule(rule: any): string {
    if (!rule) return '';
    const parsed = typeof rule === 'string' ? JSON.parse(rule) : rule;
    const freq = FREQ_LABELS[parsed.freq] || parsed.freq;
    if (parsed.freq === 'WEEKLY' && parsed.days?.length) {
        const dayLabels = parsed.days
            .sort((a: number, b: number) => a - b)
            .map((d: number) => WEEKDAY_OPTIONS.find(w => w.value === d)?.label || d)
            .join('');
        return `${freq} (${dayLabels})`;
    }
    if (parsed.interval && parsed.interval > 1) {
        return `${freq} (每${parsed.interval}天)`;
    }
    return freq;
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

const StandingDutyTab: React.FC = () => {
    // ── State ──
    const [templates, setTemplates] = useState<StandaloneTask[]>([]);
    const [instances, setInstances] = useState<StandaloneTask[]>([]);
    const [shifts, setShifts] = useState<ShiftDef[]>([]);
    const [loading, setLoading] = useState(false);
    const [instanceLoading, setInstanceLoading] = useState(false);
    const [generateLoading, setGenerateLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingTask, setEditingTask] = useState<StandaloneTask | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
    const [form] = Form.useForm();
    const [taskType, setTaskType] = useState<string>('RECURRING');
    const [teams, setTeams] = useState<SolverTeam[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
    const [selectedInstanceIds, setSelectedInstanceIds] = useState<number[]>([]);

    // ── Data Fetching ──

    const fetchTemplates = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/standalone-tasks', { params: { type: 'RECURRING' } });
            setTemplates(res.data);
        } catch (err) {
            message.error('获取值班模板失败');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchInstances = useCallback(async () => {
        setInstanceLoading(true);
        try {
            const month = selectedMonth.format('YYYY-MM');
            const startDate = selectedMonth.startOf('month').format('YYYY-MM-DD');
            const endDate = selectedMonth.endOf('month').format('YYYY-MM-DD');
            const res = await axios.get('/api/standalone-tasks', {
                params: { earliest_start_after: startDate, deadline_before: endDate }
            });
            // Filter out RECURRING templates — only show instances
            setInstances(res.data.filter((t: StandaloneTask) => t.task_type !== 'RECURRING'));
        } catch (err) {
            message.error('获取值班实例失败');
        } finally {
            setInstanceLoading(false);
        }
    }, [selectedMonth]);

    const fetchShifts = useCallback(async () => {
        try {
            const res = await axios.get('/api/shift-definitions');
            setShifts(Array.isArray(res.data) ? res.data :
                Array.isArray(res.data?.data) ? res.data.data : []);
        } catch {
            // silent
        }
    }, []);

    const fetchTeams = useCallback(async () => {
        try {
            const res = await axios.get('/api/organization/solver-teams');
            setTeams(Array.isArray(res.data) ? res.data : []);
        } catch {
            // silent
        }
    }, []);

    useEffect(() => { fetchTemplates(); fetchShifts(); fetchTeams(); }, [fetchTemplates, fetchShifts, fetchTeams]);
    useEffect(() => { fetchInstances(); }, [fetchInstances]);

    // ── Actions ──

    const handleGenerate = async () => {
        setGenerateLoading(true);
        try {
            const month = selectedMonth.format('YYYY-MM');
            const res = await axios.post('/api/standalone-tasks/generate-recurring', { target_month: month });
            const count = res.data?.generated_count ?? 0;
            if (count > 0) {
                message.success(`已生成 ${count} 个值班实例`);
            } else {
                message.info('本月值班实例已存在或无周期模板');
            }
            fetchInstances();
        } catch (err) {
            message.error('生成失败');
        } finally {
            setGenerateLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await axios.delete(`/api/standalone-tasks/${id}`);
            message.success('已删除');
            fetchTemplates();
            fetchInstances();
        } catch {
            message.error('删除失败');
        }
    };

    const handleDeleteTemplate = (template: StandaloneTask) => {
        Modal.confirm({
            title: `删除模板「${template.task_name}」`,
            content: '是否同时删除该模板已生成的所有实例？',
            okText: '删除模板 + 所有实例',
            okType: 'danger',
            cancelText: '仅删除模板',
            onOk: async () => {
                try {
                    await axios.post(`/api/standalone-tasks/${template.id}/delete-instances`);
                    await axios.delete(`/api/standalone-tasks/${template.id}`);
                    message.success('模板及其所有实例已删除');
                    fetchTemplates();
                    fetchInstances();
                } catch { message.error('删除失败'); }
            },
            onCancel: async () => {
                try {
                    await axios.delete(`/api/standalone-tasks/${template.id}`);
                    message.success('模板已删除（实例保留）');
                    fetchTemplates();
                } catch { message.error('删除失败'); }
            },
        });
    };

    const handleBatchDelete = async () => {
        if (selectedInstanceIds.length === 0) return;
        Modal.confirm({
            title: `批量删除 ${selectedInstanceIds.length} 个实例`,
            content: '删除后无法恢复，确认继续？',
            okType: 'danger',
            okText: '确认删除',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const res = await axios.post('/api/standalone-tasks/batch-delete', { ids: selectedInstanceIds });
                    message.success(`已删除 ${res.data?.deleted_count ?? selectedInstanceIds.length} 个实例`);
                    setSelectedInstanceIds([]);
                    fetchInstances();
                } catch { message.error('批量删除失败'); }
            },
        });
    };

    const handleRegenerate = async (template: StandaloneTask) => {
        const month = selectedMonth.format('YYYY-MM');
        Modal.confirm({
            title: `重新生成「${template.task_name}」${selectedMonth.format('YYYY年M月')}实例`,
            content: '将先删除该模板本月已有实例，然后按最新模板配置重新生成。',
            okText: '确认重新生成',
            cancelText: '取消',
            onOk: async () => {
                try {
                    // Step 1: Delete existing instances for this template + month
                    await axios.post(`/api/standalone-tasks/${template.id}/delete-instances`, { target_month: month });
                    // Step 2: Regenerate
                    const res = await axios.post('/api/standalone-tasks/generate-recurring', { target_month: month });
                    const count = res.data?.generated_count ?? 0;
                    message.success(`已重新生成 ${count} 个实例`);
                    fetchInstances();
                } catch { message.error('重新生成失败'); }
            },
        });
    };

    const openCreateModal = () => {
        setEditingTask(null);
        setTaskType('RECURRING');
        form.resetFields();
        form.setFieldsValue({
            task_type: 'RECURRING',
            required_people: 1,
            duration_minutes: 720,
            freq: 'DAILY',
            interval: 1,
            days: [],
        });
        setModalVisible(true);
    };

    const openEditModal = (task: StandaloneTask) => {
        setEditingTask(task);
        setTaskType(task.task_type);
        const rule = task.recurrence_rule
            ? (typeof task.recurrence_rule === 'string' ? JSON.parse(task.recurrence_rule) : task.recurrence_rule)
            : {};
        form.setFieldsValue({
            task_name: task.task_name,
            task_type: task.task_type,
            required_people: task.required_people,
            duration_minutes: task.duration_minutes,
            preferred_shift_ids: parseShiftIds(task.preferred_shift_ids),
            team_id: task.team_id,
            freq: rule.freq || 'DAILY',
            interval: rule.interval || 1,
            days: rule.days || [],
            earliest_start: task.earliest_start ? dayjs(task.earliest_start) : null,
            deadline: task.deadline ? dayjs(task.deadline) : null,
        });
        setModalVisible(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const payload: any = {
                task_name: values.task_name,
                task_type: values.task_type,
                required_people: values.required_people,
                duration_minutes: values.duration_minutes,
                preferred_shift_ids: values.preferred_shift_ids?.length ? values.preferred_shift_ids : null,
                team_id: values.team_id || null,
            };

            if (values.task_type === 'RECURRING') {
                payload.recurrence_rule = {
                    freq: values.freq,
                    interval: values.interval || 1,
                    ...(values.days?.length ? { days: values.days } : {}),
                };
                // RECURRING templates need a far-future deadline to stay active
                payload.deadline = '2099-12-31';
            } else {
                payload.earliest_start = values.earliest_start?.format('YYYY-MM-DD') || null;
                payload.deadline = values.deadline?.format('YYYY-MM-DD') || dayjs().endOf('month').format('YYYY-MM-DD');
            }

            if (editingTask) {
                await axios.put(`/api/standalone-tasks/${editingTask.id}`, payload);
                message.success('模板已更新');
            } else {
                await axios.post('/api/standalone-tasks', payload);
                message.success('模板已创建');
            }

            setModalVisible(false);
            fetchTemplates();
            fetchInstances();
        } catch (err: any) {
            if (!err?.errorFields) {
                message.error('保存失败');
            }
        }
    };

    // ── Computed ──

    const filteredTemplates = selectedTeamId
        ? templates.filter(t => t.team_id === selectedTeamId)
        : templates;

    const filteredInstances = selectedTeamId
        ? instances.filter(t => t.team_id === selectedTeamId)
        : instances;

    const instanceStats = {
        total: filteredInstances.length,
        pending: filteredInstances.filter(i => i.status === 'PENDING').length,
        scheduled: filteredInstances.filter(i => i.status === 'SCHEDULED').length,
    };

    // ═══════════════════════════════════════════════════════════════
    //  RENDER: Template Cards
    // ═══════════════════════════════════════════════════════════════

    const renderTemplateCard = (t: StandaloneTask) => {
        const shiftNames = parseShiftIds(t.preferred_shift_ids)
            .map(id => shifts.find(s => s.id === id))
            .filter(Boolean)
            .map(s => `${s!.shift_name}(${s!.start_time}-${s!.end_time})`)
            .join(', ');

        return (
            <Col xs={24} md={12} key={t.id}>
                <Card
                    size="small"
                    style={{
                        borderLeft: `4px solid ${getAccentColor(t, shifts)}`,
                        borderRadius: 8,
                    }}
                    bodyStyle={{ padding: '12px 16px' }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <Space size={8} style={{ marginBottom: 4 }}>
                                <Text strong style={{ fontSize: 15 }}>{t.task_name}</Text>
                                <Tag color="blue" style={{ fontSize: 11 }}>
                                    {TASK_TYPE_LABELS[t.task_type]} / {formatRecurrenceRule(t.recurrence_rule)}
                                </Tag>
                            </Space>
                            <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                                <TeamOutlined /> {t.required_people}人
                                <Divider type="vertical" />
                                <ClockCircleOutlined /> {t.duration_minutes}分钟 ({(t.duration_minutes / 60).toFixed(1)}小时)
                                {t.team_name && (
                                    <>
                                        <Divider type="vertical" />
                                        <ApartmentOutlined /> {t.team_name}
                                    </>
                                )}
                                {shiftNames && (
                                    <>
                                        <Divider type="vertical" />
                                        限定班次: {shiftNames}
                                    </>
                                )}
                            </div>
                        </div>
                        <Space size={4}>
                            <Tooltip title="重新生成本月">
                                <Button type="text" size="small" icon={<ReloadOutlined />}
                                    onClick={() => handleRegenerate(t)} />
                            </Tooltip>
                            <Tooltip title="编辑">
                                <Button type="text" size="small" icon={<EditOutlined />}
                                    onClick={() => openEditModal(t)} />
                            </Tooltip>
                            <Tooltip title="删除">
                                <Button type="text" size="small" danger icon={<DeleteOutlined />}
                                    onClick={() => handleDeleteTemplate(t)} />
                            </Tooltip>
                        </Space>
                    </div>
                </Card>
            </Col>
        );
    };

    // ═══════════════════════════════════════════════════════════════
    //  RENDER: Instance Table
    // ═══════════════════════════════════════════════════════════════

    const instanceColumns: ColumnsType<StandaloneTask> = [
        {
            title: '任务名称',
            dataIndex: 'task_name',
            key: 'task_name',
            ellipsis: true,
            width: 250,
        },
        {
            title: '日期',
            dataIndex: 'earliest_start',
            key: 'date',
            width: 120,
            render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
        },
        {
            title: '时长',
            dataIndex: 'duration_minutes',
            key: 'duration',
            width: 80,
            render: (v: number) => `${(v / 60).toFixed(0)}h`,
        },
        {
            title: '人数',
            dataIndex: 'required_people',
            key: 'people',
            width: 70,
            render: (v: number) => `${v}人`,
        },
        {
            title: '限定班次',
            key: 'shifts',
            width: 180,
            render: (_: any, record: StandaloneTask) => {
                const ids = parseShiftIds(record.preferred_shift_ids);
                if (ids.length === 0) return <Text type="secondary">不限</Text>;
                return ids.map(id => {
                    const s = shifts.find(sh => sh.id === id);
                    return s ? <Tag key={id}>{s.shift_name}</Tag> : null;
                });
            },
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 90,
            render: (v: string) => {
                const st = STATUS_LABELS[v] || { text: v, color: 'default' };
                return <Tag color={st.color}>{st.text}</Tag>;
            },
        },
        {
            title: '操作',
            key: 'actions',
            width: 70,
            render: (_: any, record: StandaloneTask) => (
                <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            ),
        },
    ];

    // ═══════════════════════════════════════════════════════════════
    //  RENDER: Create/Edit Modal
    // ═══════════════════════════════════════════════════════════════

    const renderModal = () => (
        <Modal
            title={editingTask ? '编辑值班模板' : '新建值班模板'}
            open={modalVisible}
            onCancel={() => setModalVisible(false)}
            onOk={handleSubmit}
            okText={editingTask ? '保存' : '创建'}
            cancelText="取消"
            width={560}
            destroyOnClose
        >
            <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item name="task_name" label="任务名称"
                    rules={[{ required: true, message: '请输入任务名称' }]}>
                    <Input placeholder="例如：夜班值守" />
                </Form.Item>

                <Form.Item name="task_type" label="任务类型"
                    rules={[{ required: true }]}>
                    <Radio.Group onChange={(e) => setTaskType(e.target.value)}>
                        <Radio.Button value="RECURRING">周期值班</Radio.Button>
                        <Radio.Button value="FLEXIBLE">弹性安排</Radio.Button>
                        <Radio.Button value="AD_HOC">临时任务</Radio.Button>
                    </Radio.Group>
                </Form.Item>

                {taskType === 'RECURRING' && (
                    <div style={{
                        background: '#f0f5ff', padding: '12px 16px', borderRadius: 8,
                        marginBottom: 16, border: '1px solid #d6e4ff',
                    }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>重复规则</Text>
                        <Space direction="vertical" style={{ width: '100%' }} size={12}>
                            <Space size={16}>
                                <Form.Item name="freq" label="频率" style={{ marginBottom: 0 }}>
                                    <Select style={{ width: 140 }}>
                                        <Select.Option value="DAILY">每天</Select.Option>
                                        <Select.Option value="WEEKLY">每周</Select.Option>
                                        <Select.Option value="MONTHLY">每月</Select.Option>
                                    </Select>
                                </Form.Item>
                                <Form.Item name="interval" label="间隔" style={{ marginBottom: 0 }}>
                                    <InputNumber min={1} max={30} style={{ width: 80 }} />
                                </Form.Item>
                            </Space>
                            <Form.Item name="days" label="指定日期" style={{ marginBottom: 0 }}>
                                <Checkbox.Group options={WEEKDAY_OPTIONS} />
                            </Form.Item>
                        </Space>
                    </div>
                )}

                {(taskType === 'FLEXIBLE' || taskType === 'AD_HOC') && (
                    <Space size={16} style={{ marginBottom: 16 }}>
                        <Form.Item name="earliest_start" label="开始日期" style={{ marginBottom: 0 }}>
                            <DatePicker />
                        </Form.Item>
                        <Form.Item name="deadline" label="截止日期" style={{ marginBottom: 0 }}
                            rules={[{ required: true, message: '请选择截止日期' }]}>
                            <DatePicker />
                        </Form.Item>
                    </Space>
                )}

                <Space size={16}>
                    <Form.Item name="required_people" label="需求人数"
                        rules={[{ required: true }]}>
                        <InputNumber min={1} max={50} addonAfter="人" style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name="duration_minutes" label="工时"
                        rules={[{ required: true }]}>
                        <InputNumber min={1} max={1440} addonAfter="分钟" style={{ width: 160 }} />
                    </Form.Item>
                </Space>

                <Form.Item name="preferred_shift_ids" label="限定班次">
                    <Select
                        mode="multiple"
                        placeholder="选择限定的班次（不选则不限）"
                        allowClear
                        optionFilterProp="children"
                    >
                        {shifts.filter(s => s.nominal_hours > 0).map(s => (
                            <Select.Option key={s.id} value={s.id}>
                                {s.shift_name} ({s.start_time}-{s.end_time})
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item name="team_id" label="所属部门">
                    <Select
                        placeholder="选择部门"
                        allowClear
                    >
                        {teams.map(t => (
                            <Select.Option key={t.id} value={t.id}>
                                {t.teamName}
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>
            </Form>
        </Modal>
    );

    // ═══════════════════════════════════════════════════════════════
    //  RENDER: Main
    // ═══════════════════════════════════════════════════════════════

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── Top: Templates ── */}
            <Card
                title="值班模板"
                size="small"
                extra={
                    <Space size={12}>
                        <Select
                            placeholder="全部部门"
                            allowClear
                            style={{ width: 140 }}
                            value={selectedTeamId}
                            onChange={v => setSelectedTeamId(v ?? null)}
                        >
                            {teams.map(t => (
                                <Select.Option key={t.id} value={t.id}>
                                    {t.teamName}
                                </Select.Option>
                            ))}
                        </Select>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                            新建模板
                        </Button>
                    </Space>
                }
                bodyStyle={{ padding: 16 }}
            >
                <Spin spinning={loading}>
                    {filteredTemplates.length === 0 ? (
                        <Empty
                            description={selectedTeamId ? '该部门暂无值班模板' : '暂无值班模板，请先创建'}
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                        />
                    ) : (
                        <Row gutter={[12, 12]}>
                            {filteredTemplates.map(renderTemplateCard)}
                        </Row>
                    )}
                </Spin>
            </Card>

            {/* ── Bottom: Instances ── */}
            <Card
                title="本月实例"
                size="small"
                extra={
                    <Space size={12}>
                        <DatePicker
                            picker="month"
                            value={selectedMonth}
                            onChange={v => v && setSelectedMonth(v)}
                            allowClear={false}
                            style={{ width: 150 }}
                        />
                        <Button
                            type={instances.length === 0 ? 'primary' : 'default'}
                            icon={<ReloadOutlined />}
                            loading={generateLoading}
                            onClick={handleGenerate}
                        >
                            生成本月实例
                        </Button>
                    </Space>
                }
                bodyStyle={{ padding: 0 }}
            >
            {filteredInstances.length === 0 && !instanceLoading ? (
                    <div style={{
                        textAlign: 'center', padding: '40px 0',
                        background: '#fffbe6', borderBottom: '1px solid #ffe58f',
                    }}>
                        <ExclamationCircleOutlined style={{ fontSize: 24, color: '#faad14', marginBottom: 8 }} />
                        <div style={{ color: '#ad6800', fontWeight: 500 }}>
                            {selectedMonth.format('YYYY年M月')} {selectedTeamId ? '该部门' : ''}尚未生成值班实例
                        </div>
                        <div style={{ color: '#ad6800', fontSize: 12, marginTop: 4 }}>
                            请点击右上方"生成本月实例"按钮，系统将根据周期模板自动展开
                        </div>
                    </div>
                ) : (
                    <>
                        {selectedInstanceIds.length > 0 && (
                            <div style={{
                                padding: '8px 16px',
                                background: '#fff1f0',
                                borderBottom: '1px solid #ffccc7',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                            }}>
                                <Text type="secondary">
                                    已选 {selectedInstanceIds.length} 项
                                </Text>
                                <Button size="small" danger onClick={handleBatchDelete}>
                                    批量删除
                                </Button>
                                <Button size="small" onClick={() => setSelectedInstanceIds([])}>
                                    取消选择
                                </Button>
                            </div>
                        )}
                        <Table
                            dataSource={filteredInstances}
                            columns={instanceColumns}
                            rowKey="id"
                            size="small"
                            loading={instanceLoading}
                            pagination={false}
                            scroll={{ y: 360 }}
                            rowSelection={{
                                selectedRowKeys: selectedInstanceIds,
                                onChange: (keys) => setSelectedInstanceIds(keys as number[]),
                            }}
                        />
                        <div style={{
                            padding: '8px 16px',
                            background: '#fafafa',
                            borderTop: '1px solid #f0f0f0',
                            fontSize: 13,
                            color: '#666',
                        }}>
                            共 {instanceStats.total} 个实例
                            <Divider type="vertical" />
                            待排班 {instanceStats.pending}
                            <Divider type="vertical" />
                            已排班 {instanceStats.scheduled}
                        </div>
                    </>
                )}
            </Card>

            {renderModal()}
        </div>
    );
};

export default StandingDutyTab;
