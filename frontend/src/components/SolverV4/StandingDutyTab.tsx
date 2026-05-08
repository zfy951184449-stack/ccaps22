/**
 * StandingDutyTab — Standalone task management for non-batch duties.
 *
 * Split into two zones:
 *   Top:    RECURRING template cards (create / edit / delete)
 *   Bottom: Monthly FLEXIBLE/AD_HOC instances table (generate / delete)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Form, message } from 'antd';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
    WxbBulkActionBar,
    WxbButton,
    WxbCard,
    WxbCheckbox,
    WxbDataTable,
    WxbDatePicker,
    WxbDivider,
    WxbEmpty,
    WxbIcon,
    WxbInput,
    WxbInputNumber,
    WxbModal,
    WxbPopconfirm,
    WxbRadioGroup,
    WxbSelect,
    WxbSpinner,
    WxbTag,
    WxbTooltip,
} from '../wxb-ui';
import type { WxbTagColor } from '../wxb-ui';

// ─── Label mappings (排班员友好) ─────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
    RECURRING: '周期值班',
    FLEXIBLE: '弹性安排',
    AD_HOC: '临时任务',
};

const STATUS_LABELS: Record<string, { text: string; color: WxbTagColor }> = {
    PENDING: { text: '待排班', color: 'blue' },
    SCHEDULED: { text: '已排班', color: 'green' },
    COMPLETED: { text: '已完成', color: 'neutral' },
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

const TASK_TYPE_OPTIONS = [
    { label: '周期值班', value: 'RECURRING' },
    { label: '弹性安排', value: 'FLEXIBLE' },
    { label: '临时任务', value: 'AD_HOC' },
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

// ─── Template visual state ───────────────────────────────────

function getAccentClass(task: StandaloneTask, shifts: ShiftDef[]): string {
    const parsedIds = parseShiftIds(task.preferred_shift_ids);
    if (parsedIds.length === 0) return 'solver-v4-duty-template-default';
    const firstShift = shifts.find(s => parsedIds.includes(s.id));
    if (firstShift?.is_night_shift) return 'solver-v4-duty-template-night';
    return 'solver-v4-duty-template-day';
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

interface TaskTypeFieldProps {
    value?: string;
    onChange?: (value: string) => void;
    onTaskTypeChange: (value: string) => void;
}

const TaskTypeField: React.FC<TaskTypeFieldProps> = ({ value, onChange, onTaskTypeChange }) => (
    <WxbRadioGroup
        options={TASK_TYPE_OPTIONS}
        value={value}
        onChange={(next) => {
            onChange?.(next);
            onTaskTypeChange(next);
        }}
    />
);

interface WeekdayFieldProps {
    value?: number[];
    onChange?: (value: number[]) => void;
}

const WeekdayField: React.FC<WeekdayFieldProps> = ({ value = [], onChange }) => (
    <div className="solver-v4-duty-weekday-group">
        {WEEKDAY_OPTIONS.map(option => (
            <WxbCheckbox
                key={option.value}
                checked={value.includes(option.value)}
                onChange={(checked) => {
                    const next = checked
                        ? [...value, option.value].sort((a, b) => a - b)
                        : value.filter(item => item !== option.value);
                    onChange?.(next);
                }}
            >
                {option.label}
            </WxbCheckbox>
        ))}
    </div>
);

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
    const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<StandaloneTask | null>(null);
    const [regenerateTarget, setRegenerateTarget] = useState<StandaloneTask | null>(null);
    const [confirmActionLoading, setConfirmActionLoading] = useState(false);

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
        setDeleteTemplateTarget(template);
    };

    const confirmDeleteTemplate = async (deleteInstances: boolean) => {
        if (!deleteTemplateTarget) return;
        setConfirmActionLoading(true);
        try {
            if (deleteInstances) {
                await axios.post(`/api/standalone-tasks/${deleteTemplateTarget.id}/delete-instances`);
            }
            await axios.delete(`/api/standalone-tasks/${deleteTemplateTarget.id}`);
            message.success(deleteInstances ? '模板及其所有实例已删除' : '模板已删除（实例保留）');
            fetchTemplates();
            if (deleteInstances) fetchInstances();
            setDeleteTemplateTarget(null);
        } catch {
            message.error('删除失败');
        } finally {
            setConfirmActionLoading(false);
        }
    };

    const handleBatchDelete = async () => {
        if (selectedInstanceIds.length === 0) return;
        try {
            const res = await axios.post('/api/standalone-tasks/batch-delete', { ids: selectedInstanceIds });
            message.success(`已删除 ${res.data?.deleted_count ?? selectedInstanceIds.length} 个实例`);
            setSelectedInstanceIds([]);
            fetchInstances();
        } catch {
            message.error('批量删除失败');
        }
    };

    const handleRegenerate = async (template: StandaloneTask) => {
        setRegenerateTarget(template);
    };

    const confirmRegenerate = async () => {
        if (!regenerateTarget) return;
        const month = selectedMonth.format('YYYY-MM');
        setConfirmActionLoading(true);
        try {
            // Step 1: Delete existing instances for this template + month
            await axios.post(`/api/standalone-tasks/${regenerateTarget.id}/delete-instances`, { target_month: month });
            // Step 2: Regenerate
            const res = await axios.post('/api/standalone-tasks/generate-recurring', { target_month: month });
            const count = res.data?.generated_count ?? 0;
            message.success(`已重新生成 ${count} 个实例`);
            fetchInstances();
            setRegenerateTarget(null);
        } catch {
            message.error('重新生成失败');
        } finally {
            setConfirmActionLoading(false);
        }
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
            <WxbCard
                key={t.id}
                className={`solver-v4-duty-template-card ${getAccentClass(t, shifts)}`}
            >
                <div className="solver-v4-duty-card-header">
                    <div className="solver-v4-duty-card-main">
                        <div className="solver-v4-duty-card-title-row">
                            <span className="solver-v4-duty-card-title">{t.task_name}</span>
                            <WxbTag color="blue">
                                {TASK_TYPE_LABELS[t.task_type]} / {formatRecurrenceRule(t.recurrence_rule)}
                            </WxbTag>
                        </div>
                        <div className="solver-v4-duty-card-meta">
                            <span className="solver-v4-duty-meta-item">
                                <WxbIcon name="released" size={14} />
                                {t.required_people}人
                            </span>
                            <WxbDivider direction="vertical" />
                            <span className="solver-v4-duty-meta-item">
                                <WxbIcon name="hold-time" size={14} />
                                {t.duration_minutes}分钟 ({(t.duration_minutes / 60).toFixed(1)}小时)
                            </span>
                            {t.team_name && (
                                <>
                                    <WxbDivider direction="vertical" />
                                    <span className="solver-v4-duty-meta-item">
                                        <WxbIcon name="upstream-suite" size={14} />
                                        {t.team_name}
                                    </span>
                                </>
                            )}
                            {shiftNames && (
                                <>
                                    <WxbDivider direction="vertical" />
                                    <span>限定班次: {shiftNames}</span>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="solver-v4-duty-card-actions">
                        <WxbTooltip title="重新生成本月">
                            <WxbButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="重新生成本月"
                                onClick={() => handleRegenerate(t)}
                            >
                                <WxbIcon name="flow-divert" size={15} />
                            </WxbButton>
                        </WxbTooltip>
                        <WxbTooltip title="编辑">
                            <WxbButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="编辑模板"
                                onClick={() => openEditModal(t)}
                            >
                                <WxbIcon name="inspect" size={15} />
                            </WxbButton>
                        </WxbTooltip>
                        <WxbTooltip title="删除">
                            <WxbButton
                                type="button"
                                variant="danger"
                                size="sm"
                                aria-label="删除模板"
                                onClick={() => handleDeleteTemplate(t)}
                            >
                                <WxbIcon name="rejected" size={15} />
                            </WxbButton>
                        </WxbTooltip>
                    </div>
                </div>
            </WxbCard>
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
                if (ids.length === 0) return <span className="solver-v4-muted-text">不限</span>;
                return ids.map(id => {
                    const s = shifts.find(sh => sh.id === id);
                    return s ? <WxbTag key={id} color="neutral">{s.shift_name}</WxbTag> : null;
                });
            },
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 90,
            render: (v: string) => {
                const st = STATUS_LABELS[v] || { text: v, color: 'neutral' as WxbTagColor };
                return <WxbTag color={st.color}>{st.text}</WxbTag>;
            },
        },
        {
            title: '操作',
            key: 'actions',
            width: 70,
            render: (_: any, record: StandaloneTask) => (
                <WxbPopconfirm
                    title="确认删除？"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => handleDelete(record.id)}
                >
                    <WxbButton type="button" variant="danger" size="sm" aria-label="删除实例">
                        <WxbIcon name="rejected" size={14} />
                    </WxbButton>
                </WxbPopconfirm>
            ),
        },
    ];

    // ═══════════════════════════════════════════════════════════════
    //  RENDER: Create/Edit Modal
    // ═══════════════════════════════════════════════════════════════

    const renderModal = () => (
        <WxbModal
            title={editingTask ? '编辑值班模板' : '新建值班模板'}
            open={modalVisible}
            onCancel={() => setModalVisible(false)}
            onOk={handleSubmit}
            okText={editingTask ? '保存' : '创建'}
            cancelText="取消"
            width={560}
            destroyOnClose
            forceRender
            className="solver-v4-duty-modal"
        >
            <Form form={form} layout="vertical" className="solver-v4-duty-form">
                <Form.Item name="task_name" label="任务名称"
                    rules={[{ required: true, message: '请输入任务名称' }]}>
                    <WxbInput placeholder="例如：夜班值守" />
                </Form.Item>

                <Form.Item name="task_type" label="任务类型"
                    rules={[{ required: true }]}>
                    <TaskTypeField onTaskTypeChange={setTaskType} />
                </Form.Item>

                {taskType === 'RECURRING' && (
                    <div className="solver-v4-duty-rule-panel">
                        <span className="solver-v4-duty-rule-title">重复规则</span>
                        <div className="solver-v4-duty-form-row">
                            <Form.Item name="freq" label="频率">
                                <WxbSelect
                                    className="solver-v4-duty-select-sm"
                                    options={[
                                        { label: '每天', value: 'DAILY' },
                                        { label: '每周', value: 'WEEKLY' },
                                        { label: '每月', value: 'MONTHLY' },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item name="interval" label="间隔">
                                <WxbInputNumber min={1} max={30} className="solver-v4-duty-number-xs" />
                            </Form.Item>
                        </div>
                        <Form.Item name="days" label="指定日期">
                            <WeekdayField />
                        </Form.Item>
                    </div>
                )}

                {(taskType === 'FLEXIBLE' || taskType === 'AD_HOC') && (
                    <div className="solver-v4-duty-form-row">
                        <Form.Item name="earliest_start" label="开始日期">
                            <WxbDatePicker />
                        </Form.Item>
                        <Form.Item name="deadline" label="截止日期"
                            rules={[{ required: true, message: '请选择截止日期' }]}>
                            <WxbDatePicker />
                        </Form.Item>
                    </div>
                )}

                <div className="solver-v4-duty-form-row">
                    <Form.Item name="required_people" label="需求人数"
                        rules={[{ required: true }]}>
                        <WxbInputNumber min={1} max={50} addonAfter="人" className="solver-v4-duty-number-sm" />
                    </Form.Item>
                    <Form.Item name="duration_minutes" label="工时"
                        rules={[{ required: true }]}>
                        <WxbInputNumber min={1} max={1440} addonAfter="分钟" className="solver-v4-duty-number-md" />
                    </Form.Item>
                </div>

                <Form.Item name="preferred_shift_ids" label="限定班次">
                    <WxbSelect
                        mode="multiple"
                        placeholder="选择限定的班次（不选则不限）"
                        allowClear
                        optionFilterProp="label"
                        options={shifts.filter(s => s.nominal_hours > 0).map(s => ({
                            label: `${s.shift_name} (${s.start_time}-${s.end_time})`,
                            value: s.id,
                        }))}
                    />
                </Form.Item>

                <Form.Item name="team_id" label="所属部门">
                    <WxbSelect
                        placeholder="选择部门"
                        allowClear
                        options={teams.map(t => ({
                            label: t.teamName,
                            value: t.id,
                        }))}
                    />
                </Form.Item>
            </Form>
        </WxbModal>
    );

    // ═══════════════════════════════════════════════════════════════
    //  RENDER: Main
    // ═══════════════════════════════════════════════════════════════

    return (
        <div className="solver-v4-duty-layout">
            <WxbCard noPadding className="solver-v4-duty-section">
                <div className="solver-v4-duty-section-header">
                    <div>
                        <h3 className="solver-v4-duty-section-title">值班模板</h3>
                        <span className="solver-v4-duty-section-subtitle">按部门维护周期值班、弹性安排和临时任务模板</span>
                    </div>
                    <div className="solver-v4-duty-section-actions">
                        <WxbSelect
                            className="solver-v4-duty-filter-select"
                            placeholder="全部部门"
                            allowClear
                            value={selectedTeamId ?? undefined}
                            onChange={(v) => setSelectedTeamId((v as number | undefined) ?? null)}
                            options={teams.map(t => ({
                                label: t.teamName,
                                value: t.id,
                            }))}
                        />
                        <WxbButton type="button" variant="primary" onClick={openCreateModal}>
                            <WxbIcon name="recipe" size={15} />
                            新建模板
                        </WxbButton>
                    </div>
                </div>
                <div className="solver-v4-duty-section-body">
                    {loading ? (
                        <WxbSpinner tip="加载值班模板..." />
                    ) : filteredTemplates.length === 0 ? (
                        <WxbEmpty
                            description={selectedTeamId ? '该部门暂无值班模板' : '暂无值班模板，请先创建'}
                            action={(
                                <WxbButton type="button" variant="secondary" size="sm" onClick={openCreateModal}>
                                    新建模板
                                </WxbButton>
                            )}
                        />
                    ) : (
                        <div className="solver-v4-duty-template-grid">
                            {filteredTemplates.map(renderTemplateCard)}
                        </div>
                    )}
                </div>
            </WxbCard>

            <WxbCard noPadding className="solver-v4-duty-section">
                <div className="solver-v4-duty-section-header">
                    <div>
                        <h3 className="solver-v4-duty-section-title">本月实例</h3>
                        <span className="solver-v4-duty-section-subtitle">用于参与当月 Solver V4 排班的值班任务</span>
                    </div>
                    <div className="solver-v4-duty-section-actions">
                        <WxbDatePicker
                            picker="month"
                            value={selectedMonth}
                            onChange={v => v && setSelectedMonth(v as Dayjs)}
                            allowClear={false}
                            className="solver-v4-duty-month-picker"
                        />
                        <WxbButton
                            type="button"
                            variant={instances.length === 0 ? 'primary' : 'secondary'}
                            disabled={generateLoading}
                            onClick={handleGenerate}
                        >
                            <WxbIcon name="flow-divert" size={15} />
                            {generateLoading ? '生成中...' : '生成本月实例'}
                        </WxbButton>
                    </div>
                </div>
                <div className="solver-v4-duty-table-wrap">
                    {filteredInstances.length === 0 && !instanceLoading ? (
                        <div className="solver-v4-duty-empty-warning">
                            <WxbIcon name="expiry" size={24} />
                            <div className="solver-v4-duty-empty-title">
                                {selectedMonth.format('YYYY年M月')} {selectedTeamId ? '该部门' : ''}尚未生成值班实例
                            </div>
                            <div className="solver-v4-duty-empty-desc">
                                请点击右上方“生成本月实例”，系统将根据周期模板自动展开。
                            </div>
                        </div>
                    ) : (
                        <>
                            <WxbBulkActionBar
                                selectedCount={selectedInstanceIds.length}
                                onClear={() => setSelectedInstanceIds([])}
                                actions={[
                                    {
                                        key: 'batch-delete',
                                        label: '批量删除',
                                        variant: 'danger',
                                        onClick: handleBatchDelete,
                                        confirm: {
                                            title: `批量删除 ${selectedInstanceIds.length} 个实例`,
                                            description: '删除后无法恢复，确认继续？',
                                            okText: '确认删除',
                                            cancelText: '取消',
                                        },
                                    },
                                ]}
                                className="solver-v4-duty-bulk-bar"
                            />
                            <WxbDataTable<StandaloneTask>
                                dataSource={filteredInstances}
                                columns={instanceColumns}
                                rowKey="id"
                                size="small"
                                density="compact"
                                loading={instanceLoading}
                                pagination={false}
                                scroll={{ y: 360 }}
                                rowSelection={{
                                    selectedRowKeys: selectedInstanceIds,
                                    onChange: (keys) => setSelectedInstanceIds(keys as number[]),
                                }}
                            />
                            <div className="solver-v4-duty-instance-footer">
                                <span>共 {instanceStats.total} 个实例</span>
                                <WxbDivider direction="vertical" />
                                <span>待排班 {instanceStats.pending}</span>
                                <WxbDivider direction="vertical" />
                                <span>已排班 {instanceStats.scheduled}</span>
                            </div>
                        </>
                    )}
                </div>
            </WxbCard>

            {renderModal()}
            <WxbModal
                title={deleteTemplateTarget ? `删除模板「${deleteTemplateTarget.task_name}」` : '删除模板'}
                open={Boolean(deleteTemplateTarget)}
                onCancel={() => setDeleteTemplateTarget(null)}
                width={520}
                footer={(
                    <div className="solver-v4-modal-footer">
                        <WxbButton
                            type="button"
                            variant="ghost"
                            disabled={confirmActionLoading}
                            onClick={() => setDeleteTemplateTarget(null)}
                        >
                            取消
                        </WxbButton>
                        <WxbButton
                            type="button"
                            variant="secondary"
                            disabled={confirmActionLoading}
                            onClick={() => confirmDeleteTemplate(false)}
                        >
                            仅删除模板
                        </WxbButton>
                        <WxbButton
                            type="button"
                            variant="danger"
                            disabled={confirmActionLoading}
                            onClick={() => confirmDeleteTemplate(true)}
                        >
                            {confirmActionLoading ? '删除中...' : '删除模板和实例'}
                        </WxbButton>
                    </div>
                )}
            >
                <div className="solver-v4-duty-confirm-body">
                    是否同时删除该模板已生成的所有实例？
                </div>
            </WxbModal>
            <WxbModal
                title={regenerateTarget ? `重新生成「${regenerateTarget.task_name}」${selectedMonth.format('YYYY年M月')}实例` : '重新生成实例'}
                open={Boolean(regenerateTarget)}
                onCancel={() => setRegenerateTarget(null)}
                onOk={confirmRegenerate}
                okText="确认重新生成"
                cancelText="取消"
                confirmLoading={confirmActionLoading}
                width={520}
            >
                <div className="solver-v4-duty-confirm-body">
                    将先删除该模板本月已有实例，然后按最新模板配置重新生成。
                </div>
            </WxbModal>
        </div>
    );
};

export default StandingDutyTab;
