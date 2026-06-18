/**
 * StandingDutyTab — Standalone task management for non-batch duties.
 *
 * Split into two zones:
 *   Top:    RECURRING template cards (create / edit / delete)
 *   Bottom: Monthly FLEXIBLE/AD_HOC instances table (generate / delete)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Form, message } from 'antd';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
    WxbBulkActionBar,
    WxbButton,
    WxbCard,
    WxbCheckbox,
    WxbCollapse,
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
    WxbTimePicker,
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

const MONTHLY_MODE_LABELS: Record<string, string> = {
    MONTH_DAYS: '固定日期',
    NTH_WEEKDAY: '第几个周几',
    LAST_DAY: '每月最后一天',
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
    { label: '弹性安排', value: 'FLEXIBLE' },
    { label: '临时任务', value: 'AD_HOC' },
];

const GENERATED_RECURRING_TASK_NAME_PATTERN = /\(\d{4}-\d{2}-\d{2}\)$/;

const MONTHLY_MODE_OPTIONS = [
    { label: '固定日期', value: 'MONTH_DAYS' },
    { label: '第几个周几', value: 'NTH_WEEKDAY' },
    { label: '每月最后一天', value: 'LAST_DAY' },
];

const NTH_WEEK_OPTIONS = [
    { label: '第 1 个', value: 1 },
    { label: '第 2 个', value: 2 },
    { label: '第 3 个', value: 3 },
    { label: '第 4 个', value: 4 },
    { label: '第 5 个', value: 5 },
    { label: '最后 1 个', value: -1 },
];

const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);

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
    allowed_employee_ids?: number[] | string | null;
    recurrence_rule: any;
    status: string;
    created_at: string;
    qualifications?: StandaloneTaskQualification[];
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

interface SolverEmployee {
    id: number;
    employee_code: string;
    employee_name: string;
    department_name?: string | null;
    primary_team_name?: string | null;
    employment_status?: string | null;
}

interface QualificationOption {
    id: number;
    qualification_name: string;
    qualification_code?: string;
}

interface StandaloneTaskQualification {
    qualification_id: number;
    position_number?: number;
    min_level?: number;
    is_mandatory?: boolean;
}

type ModalPurpose = 'TEMPLATE' | 'TASK';

// ─── Template visual state ───────────────────────────────────

function getAccentClass(task: StandaloneTask, shifts: ShiftDef[]): string {
    const parsedIds = parseShiftIds(task.preferred_shift_ids);
    if (parsedIds.length === 0) return 'solver-v5-duty-template-default';
    const firstShift = shifts.find(s => parsedIds.includes(s.id));
    if (firstShift?.is_night_shift) return 'solver-v5-duty-template-night';
    return 'solver-v5-duty-template-day';
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

function normalizePreferredShiftValue(raw: unknown): number[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw
            .map(item => Number(item))
            .filter(item => Number.isFinite(item));
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? [parsed] : [];
}

function parseJsonNumberList(raw: number[] | string | null | undefined): number[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(Number).filter(Number.isFinite);
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.map(Number).filter(Number.isFinite)
            : [];
    } catch {
        return [];
    }
}

function formatRecurrenceRule(rule: any): string {
    if (!rule) return '';
    const parsed = typeof rule === 'string' ? JSON.parse(rule) : rule;
    const freq = FREQ_LABELS[parsed.freq] || parsed.freq;
    if (parsed.freq === 'WEEKLY' && parsed.weekdays?.length) {
        const dayLabels = parsed.weekdays
            .sort((a: number, b: number) => a - b)
            .map((d: number) => WEEKDAY_OPTIONS.find(w => w.value === d)?.label || d)
            .join('');
        const intervalText = parsed.interval && parsed.interval > 1 ? `每 ${parsed.interval} 周` : freq;
        return `${intervalText} (${dayLabels})`;
    }
    if (parsed.freq === 'MONTHLY') {
        if (parsed.monthly_mode === 'MONTH_DAYS' && parsed.month_days?.length) {
            const dayLabels = parsed.month_days
                .sort((a: number, b: number) => a - b)
                .map((d: number) => `${d}号`)
                .join('、');
            return `${freq} (${dayLabels})`;
        }
        if (parsed.monthly_mode === 'NTH_WEEKDAY') {
            const weekLabel = NTH_WEEK_OPTIONS.find(o => o.value === parsed.nth_week)?.label;
            const weekdayLabel = WEEKDAY_OPTIONS.find(w => w.value === parsed.nth_weekday)?.label;
            if (weekLabel && weekdayLabel) return `${freq} (${weekLabel}${weekdayLabel})`;
        }
        if (parsed.monthly_mode === 'LAST_DAY') {
            return `${freq} (${MONTHLY_MODE_LABELS.LAST_DAY})`;
        }
    }
    if (parsed.freq === 'DAILY' && parsed.interval && parsed.interval > 1) {
        return `${freq} (每${parsed.interval}天)`;
    }
    return freq;
}

function parseShiftTimeMinutes(timeValue: string): number | null {
    const [hourRaw, minuteRaw] = timeValue.split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
}

function formatShiftTime(timeValue: string): string {
    const minutes = parseShiftTimeMinutes(timeValue);
    if (minutes === null) return timeValue;
    const hour = Math.floor(minutes / 60).toString().padStart(2, '0');
    const minute = (minutes % 60).toString().padStart(2, '0');
    return `${hour}:${minute}`;
}

function isCrossDayShift(shift: ShiftDef): boolean {
    const start = parseShiftTimeMinutes(shift.start_time);
    const end = parseShiftTimeMinutes(shift.end_time);
    return start !== null && end !== null && end <= start;
}

function formatShiftWindow(shift: ShiftDef): string {
    const startText = formatShiftTime(shift.start_time);
    const endText = formatShiftTime(shift.end_time);
    return `${startText} - ${isCrossDayShift(shift) ? '次日 ' : ''}${endText}`;
}

function shiftTimeToDayjs(timeValue: string): Dayjs | null {
    const minutes = parseShiftTimeMinutes(timeValue);
    if (minutes === null) return null;
    return dayjs()
        .hour(Math.floor(minutes / 60))
        .minute(minutes % 60)
        .second(0)
        .millisecond(0);
}

function formatTaskWindow(task: StandaloneTask): string {
    const start = task.earliest_start ? dayjs(task.earliest_start) : null;
    const end = task.deadline ? dayjs(task.deadline) : null;

    if (task.task_type === 'AD_HOC') {
        if (!start?.isValid() || !end?.isValid()) return '-';
        const endFormat = start.isSame(end, 'day') ? 'HH:mm' : 'YYYY-MM-DD HH:mm';
        return `${start.format('YYYY-MM-DD HH:mm')} - ${end.format(endFormat)}`;
    }

    if (!start?.isValid() && !end?.isValid()) return '-';
    if (!start?.isValid()) return end!.format('YYYY-MM-DD');
    if (!end?.isValid() || start.isSame(end, 'day')) return start.format('YYYY-MM-DD');
    return `${start.format('YYYY-MM-DD')} - ${end.format('YYYY-MM-DD')}`;
}

function calculateDurationMinutes(startValue: unknown, endValue: unknown): number | null {
    const start = dayjs(startValue as any);
    const end = dayjs(endValue as any);
    if (!start.isValid() || !end.isValid()) return null;
    const minutes = end.diff(start, 'minute');
    return minutes > 0 ? minutes : null;
}

function combineDateAndTime(dateValue: unknown, timeValue: unknown): Dayjs | null {
    const date = dayjs(dateValue as any);
    const time = dayjs(timeValue as any);
    if (!date.isValid() || !time.isValid()) return null;

    return date
        .hour(time.hour())
        .minute(time.minute())
        .second(0)
        .millisecond(0);
}

function buildAdHocWindow(dateValue: unknown, startTimeValue: unknown, endTimeValue: unknown): {
    start: Dayjs;
    end: Dayjs;
    durationMinutes: number;
} | null {
    const start = combineDateAndTime(dateValue, startTimeValue);
    let end = combineDateAndTime(dateValue, endTimeValue);
    if (!start || !end || end.isSame(start, 'minute')) return null;
    if (end.isBefore(start)) end = end.add(1, 'day');

    const durationMinutes = calculateDurationMinutes(start, end);
    return durationMinutes ? { start, end, durationMinutes } : null;
}

function isGeneratedRecurringTask(task: StandaloneTask): boolean {
    return task.task_type === 'FLEXIBLE' && GENERATED_RECURRING_TASK_NAME_PATTERN.test(task.task_name);
}

interface TaskTypeFieldProps {
    value?: string;
    onChange?: (value: string) => void;
    onTaskTypeChange: (value: string) => void;
    options?: typeof TASK_TYPE_OPTIONS;
}

const TaskTypeField: React.FC<TaskTypeFieldProps> = ({ value, onChange, onTaskTypeChange, options = TASK_TYPE_OPTIONS }) => (
    <WxbRadioGroup
        options={options}
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
    <div className="solver-v5-duty-weekday-group">
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

const MonthDayField: React.FC<WeekdayFieldProps> = ({ value = [], onChange }) => (
    <div className="solver-v5-duty-monthday-grid">
        {MONTH_DAY_OPTIONS.map(day => (
            <WxbCheckbox
                key={day}
                checked={value.includes(day)}
                onChange={(checked) => {
                    const next = checked
                        ? [...value, day].sort((a, b) => a - b)
                        : value.filter(item => item !== day);
                    onChange?.(next);
                }}
            >
                {day}号
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
    const [employees, setEmployees] = useState<SolverEmployee[]>([]);
    const [qualifications, setQualifications] = useState<QualificationOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [instanceLoading, setInstanceLoading] = useState(false);
    const [generateLoading, setGenerateLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [modalPurpose, setModalPurpose] = useState<ModalPurpose>('TEMPLATE');
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
    const recurrenceFreq = Form.useWatch('freq', form) || 'DAILY';
    const monthlyMode = Form.useWatch('monthly_mode', form) || 'MONTH_DAYS';
    const watchedAdHocDate = Form.useWatch('ad_hoc_date', form);
    const watchedAdHocStartTime = Form.useWatch('ad_hoc_start_time', form);
    const watchedAdHocEndTime = Form.useWatch('ad_hoc_end_time', form);
    const watchedPreferredShiftIds = Form.useWatch('preferred_shift_ids', form);
    const watchedAllowedEmployeeIds = Form.useWatch('allowed_employee_ids', form);
    const selectedPreferredShiftIds = useMemo(
        () => normalizePreferredShiftValue(watchedPreferredShiftIds),
        [watchedPreferredShiftIds],
    );
    const selectedAllowedEmployeeIds = useMemo(
        () => normalizePreferredShiftValue(watchedAllowedEmployeeIds),
        [watchedAllowedEmployeeIds],
    );
    const isAdHocShiftLocked = taskType === 'AD_HOC' && selectedPreferredShiftIds.length > 0;
    const isRequiredPeopleLocked = selectedAllowedEmployeeIds.length > 0;
    const adHocDurationMinutes = useMemo(
        () => (taskType === 'AD_HOC'
            ? buildAdHocWindow(watchedAdHocDate, watchedAdHocStartTime, watchedAdHocEndTime)?.durationMinutes ?? null
            : null),
        [taskType, watchedAdHocDate, watchedAdHocStartTime, watchedAdHocEndTime],
    );

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
                params: { window_start: startDate, window_end: endDate }
            });
            // Filter out RECURRING templates — only show instances
            setInstances(res.data.filter((t: StandaloneTask) => t.task_type !== 'RECURRING'));
        } catch (err) {
            message.error('获取值班任务失败');
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

    const fetchEmployees = useCallback(async () => {
        try {
            const res = await axios.get('/api/employees');
            setEmployees(Array.isArray(res.data) ? res.data : []);
        } catch {
            // silent
        }
    }, []);

    const fetchQualifications = useCallback(async () => {
        try {
            const res = await axios.get('/api/qualifications');
            setQualifications(Array.isArray(res.data) ? res.data : []);
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        fetchTemplates();
        fetchShifts();
        fetchTeams();
        fetchEmployees();
        fetchQualifications();
    }, [fetchTemplates, fetchShifts, fetchTeams, fetchEmployees, fetchQualifications]);
    useEffect(() => { fetchInstances(); }, [fetchInstances]);
    useEffect(() => {
        if (taskType !== 'AD_HOC') return;
        form.setFieldValue('duration_minutes', adHocDurationMinutes ?? undefined);
    }, [adHocDurationMinutes, form, taskType]);

    // ── Actions ──

    const handleGenerate = async () => {
        setGenerateLoading(true);
        try {
            const month = selectedMonth.format('YYYY-MM');
            const res = await axios.post('/api/standalone-tasks/generate-recurring', { target_month: month });
            const count = res.data?.generated_count ?? 0;
            if (count > 0) {
                message.success(`已生成 ${count} 个周期任务`);
            } else {
                message.info('本月周期任务已存在或无周期模板');
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
            message.success(deleteInstances ? '模板及其生成任务已删除' : '模板已删除（已生成任务保留）');
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
            message.success(`已删除 ${res.data?.deleted_count ?? selectedInstanceIds.length} 个任务`);
            setSelectedInstanceIds([]);
            fetchInstances();
        } catch {
            message.error('批量删除失败');
        }
    };

    const handleRegenerate = async (template: StandaloneTask) => {
        setRegenerateTarget(template);
    };

    const handleTaskTypeChange = (nextTaskType: string) => {
        setTaskType(nextTaskType);
        const currentPreferredIds = normalizePreferredShiftValue(form.getFieldValue('preferred_shift_ids'));
        if (nextTaskType === 'AD_HOC') {
            const today = dayjs();
            const defaultDate = selectedMonth.isSame(today, 'month') ? today : selectedMonth.startOf('month');
            form.setFieldsValue({
                earliest_start: null,
                deadline: null,
                ad_hoc_date: defaultDate,
                ad_hoc_start_time: null,
                ad_hoc_end_time: null,
                duration_minutes: undefined,
                preferred_shift_ids: currentPreferredIds[0] ?? undefined,
            });
            return;
        }

        form.setFieldValue('preferred_shift_ids', currentPreferredIds);
        if (!form.getFieldValue('duration_minutes')) {
            form.setFieldValue('duration_minutes', 720);
        }
    };

    const handlePreferredShiftChange = (nextValue: unknown) => {
        if (taskType !== 'AD_HOC') return;
        const ids = normalizePreferredShiftValue(nextValue);
        if (ids.length === 0) return;

        const selectedShift = shifts.find(shift => shift.id === ids[ids.length - 1]);
        if (!selectedShift) return;

        const startTime = shiftTimeToDayjs(selectedShift.start_time);
        const endTime = shiftTimeToDayjs(selectedShift.end_time);
        if (!startTime || !endTime) return;

        form.setFieldsValue({
            ad_hoc_start_time: startTime,
            ad_hoc_end_time: endTime,
        });
    };

    const handleAllowedEmployeesChange = (nextValue: unknown) => {
        const ids = normalizePreferredShiftValue(nextValue);
        if (ids.length > 0) {
            form.setFieldValue('required_people', ids.length);
        }
    };

    const confirmRegenerate = async () => {
        if (!regenerateTarget) return;
        const month = selectedMonth.format('YYYY-MM');
        setConfirmActionLoading(true);
        try {
            // Step 1: Delete existing instances for this template + month
            await axios.post(`/api/standalone-tasks/${regenerateTarget.id}/delete-instances`, { target_month: month });
            // Step 2: Regenerate
            const res = await axios.post('/api/standalone-tasks/generate-recurring', {
                target_month: month,
                template_id: regenerateTarget.id,
            });
            const count = res.data?.generated_count ?? 0;
            message.success(`已重新生成「${regenerateTarget.task_name}」${count} 个任务`);
            fetchInstances();
            setRegenerateTarget(null);
        } catch {
            message.error('重新生成失败');
        } finally {
            setConfirmActionLoading(false);
        }
    };

    const openCreateTemplateModal = () => {
        setEditingTask(null);
        setModalPurpose('TEMPLATE');
        setTaskType('RECURRING');
        form.resetFields();
        form.setFieldsValue({
            task_type: 'RECURRING',
            required_people: 1,
            duration_minutes: 720,
            freq: 'DAILY',
            interval: 1,
            weekdays: [],
            monthly_mode: 'MONTH_DAYS',
            month_days: [],
            nth_week: 1,
            nth_weekday: 1,
            window_days: 0,
            allowed_employee_ids: [],
            qualification_ids: [],
            qualification_min_level: 1,
        });
        setModalVisible(true);
    };

    const openCreateTaskModal = () => {
        const today = dayjs();
        const defaultDate = selectedMonth.isSame(today, 'month') ? today : selectedMonth.startOf('month');
        setEditingTask(null);
        setModalPurpose('TASK');
        setTaskType('AD_HOC');
        form.resetFields();
        form.setFieldsValue({
            task_type: 'AD_HOC',
            ad_hoc_date: defaultDate,
            ad_hoc_start_time: null,
            ad_hoc_end_time: null,
            required_people: 1,
            duration_minutes: undefined,
            preferred_shift_ids: undefined,
            allowed_employee_ids: [],
            qualification_ids: [],
            qualification_min_level: 1,
            team_id: selectedTeamId ?? undefined,
        });
        setModalVisible(true);
    };

    const openEditModal = async (task: StandaloneTask) => {
        let taskDetail = task;
        try {
            const res = await axios.get(`/api/standalone-tasks/${task.id}`);
            taskDetail = { ...task, ...res.data };
        } catch {
            // Use the list row if detail fetch fails.
        }

        setEditingTask(taskDetail);
        setModalPurpose(taskDetail.task_type === 'RECURRING' ? 'TEMPLATE' : 'TASK');
        setTaskType(taskDetail.task_type);
        const rule = taskDetail.recurrence_rule
            ? (typeof taskDetail.recurrence_rule === 'string' ? JSON.parse(taskDetail.recurrence_rule) : taskDetail.recurrence_rule)
            : {};
        const adHocStart = taskDetail.task_type === 'AD_HOC' && taskDetail.earliest_start ? dayjs(taskDetail.earliest_start) : null;
        const adHocEnd = taskDetail.task_type === 'AD_HOC' && taskDetail.deadline ? dayjs(taskDetail.deadline) : null;
        const preferredShiftIds = parseShiftIds(taskDetail.preferred_shift_ids);
        const qualificationIds = Array.from(new Set((taskDetail.qualifications || [])
            .map(item => Number(item.qualification_id))
            .filter(Number.isFinite)));
        const qualificationMinLevel = Math.max(1, ...(taskDetail.qualifications || [])
            .map(item => Number(item.min_level) || 1));
        form.setFieldsValue({
            task_name: taskDetail.task_name,
            task_type: taskDetail.task_type,
            required_people: taskDetail.required_people,
            duration_minutes: taskDetail.duration_minutes,
            preferred_shift_ids: taskDetail.task_type === 'AD_HOC' ? preferredShiftIds[0] : preferredShiftIds,
            allowed_employee_ids: parseJsonNumberList(taskDetail.allowed_employee_ids),
            qualification_ids: qualificationIds,
            qualification_min_level: qualificationMinLevel,
            team_id: taskDetail.team_id,
            freq: rule.freq || 'DAILY',
            interval: rule.interval || 1,
            weekdays: rule.weekdays || [],
            monthly_mode: rule.monthly_mode || 'MONTH_DAYS',
            month_days: rule.month_days || [],
            nth_week: rule.nth_week || 1,
            nth_weekday: rule.nth_weekday || 1,
            window_days: rule.window_days || 0,
            earliest_start: taskDetail.earliest_start ? dayjs(taskDetail.earliest_start) : null,
            deadline: taskDetail.deadline ? dayjs(taskDetail.deadline) : null,
            ad_hoc_date: adHocStart,
            ad_hoc_start_time: adHocStart,
            ad_hoc_end_time: adHocEnd,
        });
        setModalVisible(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const submittedTaskType = modalPurpose === 'TEMPLATE' ? 'RECURRING' : values.task_type;
            const preferredShiftIds = normalizePreferredShiftValue(values.preferred_shift_ids);
            const allowedEmployeeIds = normalizePreferredShiftValue(values.allowed_employee_ids);
            const qualificationIds = normalizePreferredShiftValue(values.qualification_ids);
            const finalRequiredPeople = allowedEmployeeIds.length > 0
                ? allowedEmployeeIds.length
                : values.required_people;
            const payload: any = {
                task_name: values.task_name,
                task_type: submittedTaskType,
                required_people: finalRequiredPeople,
                duration_minutes: values.duration_minutes,
                preferred_shift_ids: preferredShiftIds.length ? preferredShiftIds : null,
                allowed_employee_ids: allowedEmployeeIds.length ? allowedEmployeeIds : null,
                team_id: values.team_id || null,
            };

            if (qualificationIds.length > 0) {
                const qualificationMinLevel = Number(values.qualification_min_level) || 1;
                payload.qualifications = Array.from({ length: finalRequiredPeople }, (_, index) => index + 1)
                    .flatMap(positionNumber => qualificationIds.map(qualificationId => ({
                        position_number: positionNumber,
                        qualification_id: qualificationId,
                        min_level: qualificationMinLevel,
                        is_mandatory: true,
                    })));
            } else if (editingTask) {
                payload.qualifications = [];
            }

            if (submittedTaskType === 'RECURRING') {
                const recurrenceRule: any = {
                    freq: values.freq,
                    window_days: values.window_days || 0,
                };
                if (values.freq === 'DAILY') {
                    recurrenceRule.interval = values.interval || 1;
                }
                if (values.freq === 'WEEKLY') {
                    recurrenceRule.interval = values.interval || 1;
                    recurrenceRule.weekdays = values.weekdays || [];
                }
                if (values.freq === 'MONTHLY') {
                    recurrenceRule.monthly_mode = values.monthly_mode || 'MONTH_DAYS';
                    if (recurrenceRule.monthly_mode === 'MONTH_DAYS') {
                        recurrenceRule.month_days = values.month_days || [];
                    }
                    if (recurrenceRule.monthly_mode === 'NTH_WEEKDAY') {
                        recurrenceRule.nth_week = values.nth_week;
                        recurrenceRule.nth_weekday = values.nth_weekday;
                    }
                }
                payload.recurrence_rule = recurrenceRule;
                // RECURRING templates need a far-future deadline to stay active
                payload.deadline = '2099-12-31';
            } else if (submittedTaskType === 'AD_HOC') {
                const adHocWindow = buildAdHocWindow(values.ad_hoc_date, values.ad_hoc_start_time, values.ad_hoc_end_time);
                if (!adHocWindow) {
                    message.error('请检查日期和开始/结束时间');
                    return;
                }
                payload.earliest_start = adHocWindow.start.format('YYYY-MM-DD HH:mm:ss');
                payload.deadline = adHocWindow.end.format('YYYY-MM-DD HH:mm:ss');
                payload.duration_minutes = adHocWindow.durationMinutes;
            } else {
                payload.earliest_start = values.earliest_start?.format('YYYY-MM-DD') || null;
                payload.deadline = values.deadline?.format('YYYY-MM-DD') || dayjs().endOf('month').format('YYYY-MM-DD');
            }

            if (editingTask) {
                await axios.put(`/api/standalone-tasks/${editingTask.id}`, payload);
                message.success(submittedTaskType === 'RECURRING' ? '模板已更新' : '任务已更新');
            } else {
                await axios.post('/api/standalone-tasks', payload);
                message.success(submittedTaskType === 'RECURRING' ? '模板已创建' : '任务已创建');
            }

            setModalVisible(false);
            fetchTemplates();
            fetchInstances();
        } catch (err: any) {
            if (!err?.errorFields) {
                message.error(err?.response?.data?.error || '保存失败');
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

    const directTasks = filteredInstances.filter(t => !isGeneratedRecurringTask(t));
    const generatedRecurringTasks = filteredInstances.filter(isGeneratedRecurringTask);

    const instanceStats = {
        total: filteredInstances.length,
        direct: directTasks.length,
        recurring: generatedRecurringTasks.length,
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
            .map(s => `${s!.shift_name}(${formatShiftWindow(s!)})`)
            .join(', ');

        return (
            <WxbCard
                key={t.id}
                className={`solver-v5-duty-template-card ${getAccentClass(t, shifts)}`}
            >
                <div className="solver-v5-duty-card-header">
                    <div className="solver-v5-duty-card-main">
                        <div className="solver-v5-duty-card-title-row">
                            <span className="solver-v5-duty-card-title">{t.task_name}</span>
                            <WxbTag color="blue">
                                {TASK_TYPE_LABELS[t.task_type]} / {formatRecurrenceRule(t.recurrence_rule)}
                            </WxbTag>
                        </div>
                        <div className="solver-v5-duty-card-meta">
                            <span className="solver-v5-duty-meta-item">
                                <WxbIcon name="released" size={14} />
                                {t.required_people}人
                            </span>
                            <WxbDivider direction="vertical" />
                            <span className="solver-v5-duty-meta-item">
                                <WxbIcon name="hold-time" size={14} />
                                {t.duration_minutes}分钟 ({(t.duration_minutes / 60).toFixed(1)}小时)
                            </span>
                            {t.team_name && (
                                <>
                                    <WxbDivider direction="vertical" />
                                    <span className="solver-v5-duty-meta-item">
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
                    <div className="solver-v5-duty-card-actions">
                        <WxbTooltip title="重新生成本月任务">
                            <WxbButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="重新生成本月任务"
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
            title: '时间窗口',
            dataIndex: 'earliest_start',
            key: 'window',
            width: 210,
            render: (_: string, record: StandaloneTask) => (
                <span className="solver-v5-time-cell">{formatTaskWindow(record)}</span>
            ),
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
                if (ids.length === 0) return <span className="solver-v5-muted-text">不限</span>;
                return ids.map(id => {
                    const s = shifts.find(sh => sh.id === id);
                    return s ? <WxbTag key={id} color="neutral">{`${s.shift_name} ${formatShiftWindow(s)}`}</WxbTag> : null;
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
                    <WxbButton type="button" variant="danger" size="sm" aria-label="删除任务">
                        <WxbIcon name="rejected" size={14} />
                    </WxbButton>
                </WxbPopconfirm>
            ),
        },
    ];

    // ═══════════════════════════════════════════════════════════════
    //  RENDER: Create/Edit Modal
    // ═══════════════════════════════════════════════════════════════

    const modalTitle = editingTask
        ? (modalPurpose === 'TEMPLATE' ? '编辑周期值班模板' : '编辑值班任务')
        : (modalPurpose === 'TEMPLATE' ? '新建周期值班模板' : '新建值班任务');

    const taskRowSelection = {
        selectedRowKeys: selectedInstanceIds,
        onChange: (keys: React.Key[]) => setSelectedInstanceIds(keys as number[]),
    };

    const renderModal = () => (
        <WxbModal
            title={modalTitle}
            open={modalVisible}
            onCancel={() => setModalVisible(false)}
            onOk={handleSubmit}
            okText={editingTask ? '保存' : '创建'}
            cancelText="取消"
            width={640}
            destroyOnClose
            forceRender
            className="solver-v5-duty-modal"
        >
            <Form form={form} layout="vertical" className="solver-v5-duty-form">
                <Form.Item name="task_name" label="任务名称"
                    rules={[{ required: true, message: '请输入任务名称' }]}>
                    <WxbInput placeholder="例如：夜班值守" />
                </Form.Item>

                {modalPurpose === 'TASK' && (
                    <Form.Item name="task_type" label="任务类型"
                        rules={[{ required: true }]}>
                        <TaskTypeField onTaskTypeChange={handleTaskTypeChange} />
                    </Form.Item>
                )}

                {taskType === 'RECURRING' && (
                    <div className="solver-v5-duty-rule-panel">
                        <span className="solver-v5-duty-rule-title">重复规则</span>
                        <div className="solver-v5-duty-form-row">
                            <Form.Item name="freq" label="频率">
                                <WxbSelect
                                    className="solver-v5-duty-select-sm"
                                    options={[
                                        { label: '每天', value: 'DAILY' },
                                        { label: '每周', value: 'WEEKLY' },
                                        { label: '每月', value: 'MONTHLY' },
                                    ]}
                                />
                            </Form.Item>
                            {recurrenceFreq !== 'MONTHLY' && (
                                <Form.Item name="interval" label={recurrenceFreq === 'WEEKLY' ? '周间隔' : '日间隔'}>
                                    <WxbInputNumber min={1} max={30} className="solver-v5-duty-number-xs" />
                                </Form.Item>
                            )}
                            <Form.Item name="window_days" label="弹性窗口">
                                <WxbInputNumber min={0} max={30} addonAfter="天" className="solver-v5-duty-number-xs" />
                            </Form.Item>
                        </div>
                        {recurrenceFreq === 'WEEKLY' && (
                            <Form.Item
                                name="weekdays"
                                label="指定星期"
                                rules={[{
                                    validator: (_, value) => (
                                        Array.isArray(value) && value.length > 0
                                            ? Promise.resolve()
                                            : Promise.reject(new Error('请选择星期'))
                                    ),
                                }]}
                            >
                                <WeekdayField />
                            </Form.Item>
                        )}
                        {recurrenceFreq === 'MONTHLY' && (
                            <>
                                <Form.Item name="monthly_mode" label="月度规则">
                                    <WxbRadioGroup options={MONTHLY_MODE_OPTIONS} />
                                </Form.Item>
                                {monthlyMode === 'MONTH_DAYS' && (
                                    <Form.Item
                                        name="month_days"
                                        label="每月日期"
                                        rules={[{
                                            validator: (_, value) => (
                                                Array.isArray(value) && value.length > 0
                                                    ? Promise.resolve()
                                                    : Promise.reject(new Error('请选择每月日期'))
                                            ),
                                        }]}
                                    >
                                        <MonthDayField />
                                    </Form.Item>
                                )}
                                {monthlyMode === 'NTH_WEEKDAY' && (
                                    <div className="solver-v5-duty-form-row">
                                        <Form.Item name="nth_week" label="周次" rules={[{ required: true }]}>
                                            <WxbSelect
                                                className="solver-v5-duty-select-sm"
                                                options={NTH_WEEK_OPTIONS}
                                            />
                                        </Form.Item>
                                        <Form.Item name="nth_weekday" label="星期" rules={[{ required: true }]}>
                                            <WxbSelect
                                                className="solver-v5-duty-select-sm"
                                                options={WEEKDAY_OPTIONS}
                                            />
                                        </Form.Item>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {taskType === 'FLEXIBLE' && (
                    <div className="solver-v5-duty-form-row">
                        <Form.Item
                            name="earliest_start"
                            label="开始日期"
                            rules={[{ required: true, message: '请选择开始日期' }]}
                        >
                            <WxbDatePicker />
                        </Form.Item>
                        <Form.Item name="deadline" label="截止日期"
                            rules={[{ required: true, message: '请选择截止日期' }]}>
                            <WxbDatePicker />
                        </Form.Item>
                    </div>
                )}

                {taskType === 'AD_HOC' && (
                    <div className="solver-v5-duty-form-row solver-v5-duty-form-row-ad-hoc">
                        <Form.Item
                            name="ad_hoc_date"
                            label="日期"
                            rules={[{ required: true, message: '请选择日期' }]}
                        >
                            <WxbDatePicker
                                placeholder="选择日期"
                                className="solver-v5-duty-date-picker"
                            />
                        </Form.Item>
                        <Form.Item
                            name="ad_hoc_start_time"
                            label="开始时间"
                            rules={[{ required: true, message: '请选择开始时间' }]}
                        >
                            <WxbTimePicker
                                format="HH:mm"
                                minuteStep={15}
                                placeholder="开始"
                                disabled={isAdHocShiftLocked}
                                className="solver-v5-duty-time-picker"
                            />
                        </Form.Item>
                        <Form.Item
                            name="ad_hoc_end_time"
                            label="结束时间"
                            dependencies={['ad_hoc_date', 'ad_hoc_start_time']}
                            rules={[
                                { required: true, message: '请选择结束时间' },
                                {
                                    validator: (_, value) => {
                                        if (!value || !form.getFieldValue('ad_hoc_date') || !form.getFieldValue('ad_hoc_start_time')) {
                                            return Promise.resolve();
                                        }
                                        return buildAdHocWindow(
                                            form.getFieldValue('ad_hoc_date'),
                                            form.getFieldValue('ad_hoc_start_time'),
                                            value,
                                        )
                                            ? Promise.resolve()
                                            : Promise.reject(new Error('结束时间不能等于开始时间'));
                                    },
                                },
                            ]}
                        >
                            <WxbTimePicker
                                format="HH:mm"
                                minuteStep={15}
                                placeholder="结束"
                                disabled={isAdHocShiftLocked}
                                className="solver-v5-duty-time-picker"
                            />
                        </Form.Item>
                    </div>
                )}

                <div className="solver-v5-duty-form-row">
                    <Form.Item name="required_people" label="需求人数"
                        rules={[{ required: true }]}>
                        <WxbInputNumber
                            min={1}
                            max={50}
                            addonAfter="人"
                            disabled={isRequiredPeopleLocked}
                            className="solver-v5-duty-number-sm"
                        />
                    </Form.Item>
                    <Form.Item
                        name="duration_minutes"
                        label={taskType === 'AD_HOC' ? '工时（自动）' : '工时'}
                        rules={taskType === 'AD_HOC' ? [] : [{ required: true }]}
                    >
                        <WxbInputNumber
                            min={1}
                            max={taskType === 'AD_HOC' ? undefined : 1440}
                            addonAfter="分钟"
                            disabled={taskType === 'AD_HOC'}
                            className="solver-v5-duty-number-md"
                        />
                    </Form.Item>
                </div>

                <div className="solver-v5-duty-form-row solver-v5-duty-form-row-wide">
                    <Form.Item name="allowed_employee_ids" label="指定人员">
                        <WxbSelect
                            mode="multiple"
                            placeholder="选择指定人员（不选则由 Solver 分配）"
                            allowClear
                            optionFilterProp="searchText"
                            onChange={handleAllowedEmployeesChange}
                            options={employees
                                .filter(employee => !employee.employment_status || employee.employment_status === 'ACTIVE')
                                .map(employee => ({
                                    label: `${employee.employee_name} (${employee.employee_code})${employee.primary_team_name ? ` / ${employee.primary_team_name}` : ''}`,
                                    searchText: `${employee.employee_name} ${employee.employee_code} ${employee.primary_team_name || ''} ${employee.department_name || ''}`,
                                    value: employee.id,
                                }))}
                        />
                    </Form.Item>

                    <div style={{ display: 'flex', gap: 'var(--wx-space-12)', alignItems: 'flex-start' }}>
                        <Form.Item name="qualification_ids" label="资质要求" style={{ flex: 1, marginBottom: 0 }}>
                            <WxbSelect
                                mode="multiple"
                                placeholder="选择必需资质（不选则不限制资质）"
                                allowClear
                                optionFilterProp="label"
                                options={qualifications.map(qualification => ({
                                    label: qualification.qualification_name,
                                    value: qualification.id,
                                }))}
                            />
                        </Form.Item>
                        <Form.Item name="qualification_min_level" label="最低等级" style={{ marginBottom: 0 }}>
                            <WxbInputNumber min={1} max={5} addonAfter="级" className="solver-v5-duty-number-sm" />
                        </Form.Item>
                    </div>
                </div>

                <div className="solver-v5-duty-form-row solver-v5-duty-form-row-wide">
                    <Form.Item name="preferred_shift_ids" label="限定班次">
                        <WxbSelect
                            mode={taskType === 'AD_HOC' ? undefined : 'multiple'}
                            placeholder={taskType === 'AD_HOC' ? '选择班次后自动带入时间（不选则手动录入）' : '选择限定的班次（不选则不限）'}
                            allowClear
                            optionFilterProp="searchText"
                            onChange={handlePreferredShiftChange}
                            options={shifts.filter(s => s.nominal_hours > 0).map(s => ({
                                label: `${s.shift_name} (${formatShiftWindow(s)})`,
                                searchText: `${s.shift_name} ${formatShiftWindow(s)} ${s.shift_code}`,
                                value: s.id,
                            }))}
                        />
                    </Form.Item>

                    <Form.Item name="team_id" label="所属部门" extra="留空=全局任务,任何部门排班都会纳入;选定部门后,该任务只会出现在该部门(及其子部门)的排班求解里">
                        <WxbSelect
                            placeholder="选择部门"
                            allowClear
                            options={teams.map(t => ({
                                label: t.teamName,
                                value: t.id,
                            }))}
                        />
                    </Form.Item>
                </div>
            </Form>
        </WxbModal>
    );

    // ═══════════════════════════════════════════════════════════════
    //  RENDER: Main
    // ═══════════════════════════════════════════════════════════════

    return (
        <div className="solver-v5-duty-layout">
            <WxbCard noPadding className="solver-v5-duty-section">
                <div className="solver-v5-duty-section-header">
                    <div>
                        <h3 className="solver-v5-duty-section-title">值班模板</h3>
                        <span className="solver-v5-duty-section-subtitle">按部门维护周期值班模板，生成后进入本月任务</span>
                    </div>
                    <div className="solver-v5-duty-section-actions">
                        <WxbSelect
                            className="solver-v5-duty-filter-select"
                            placeholder="全部部门"
                            allowClear
                            value={selectedTeamId ?? undefined}
                            onChange={(v) => setSelectedTeamId((v as number | undefined) ?? null)}
                            options={teams.map(t => ({
                                label: t.teamName,
                                value: t.id,
                            }))}
                        />
                        <WxbButton type="button" variant="primary" onClick={openCreateTemplateModal}>
                            <WxbIcon name="recipe" size={15} />
                            新建周期模板
                        </WxbButton>
                    </div>
                </div>
                <div className="solver-v5-duty-section-body">
                    {loading ? (
                        <WxbSpinner tip="加载值班模板..." />
                    ) : filteredTemplates.length === 0 ? (
                        <WxbEmpty
                            description={selectedTeamId ? '该部门暂无值班模板' : '暂无值班模板，请先创建'}
                            action={(
                                <WxbButton type="button" variant="secondary" size="sm" onClick={openCreateTemplateModal}>
                                    新建周期模板
                                </WxbButton>
                            )}
                        />
                    ) : (
                        <div className="solver-v5-duty-template-grid">
                            {filteredTemplates.map(renderTemplateCard)}
                        </div>
                    )}
                </div>
            </WxbCard>

            <WxbCard noPadding className="solver-v5-duty-section">
                <div className="solver-v5-duty-section-header">
                    <div>
                        <h3 className="solver-v5-duty-section-title">本月任务</h3>
                        <span className="solver-v5-duty-section-subtitle">临时任务会直接进入本月任务，周期模板可生成本月任务</span>
                    </div>
                    <div className="solver-v5-duty-section-actions">
                        <WxbDatePicker
                            picker="month"
                            value={selectedMonth}
                            onChange={v => v && setSelectedMonth(v as Dayjs)}
                            allowClear={false}
                            className="solver-v5-duty-month-picker"
                        />
                        <WxbButton
                            type="button"
                            variant="primary"
                            onClick={openCreateTaskModal}
                        >
                            <WxbIcon name="recipe" size={15} />
                            新建临时任务
                        </WxbButton>
                        <WxbButton
                            type="button"
                            variant="secondary"
                            disabled={generateLoading}
                            onClick={handleGenerate}
                        >
                            <WxbIcon name="flow-divert" size={15} />
                            {generateLoading ? '生成中...' : '生成周期任务'}
                        </WxbButton>
                    </div>
                </div>
                <div className="solver-v5-duty-table-wrap">
                    {filteredInstances.length === 0 && !instanceLoading ? (
                        <div className="solver-v5-duty-empty-warning">
                            <WxbIcon name="expiry" size={24} />
                            <div className="solver-v5-duty-empty-title">
                                {selectedMonth.format('YYYY年M月')} {selectedTeamId ? '该部门' : ''}暂无值班任务
                            </div>
                            <div className="solver-v5-duty-empty-desc">
                                可直接新建临时任务，也可从周期模板生成本月任务。
                            </div>
                            <div className="solver-v5-duty-empty-actions">
                                <WxbButton type="button" variant="primary" size="sm" onClick={openCreateTaskModal}>
                                    新建临时任务
                                </WxbButton>
                                <WxbButton
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={generateLoading}
                                    onClick={handleGenerate}
                                >
                                    {generateLoading ? '生成中...' : '生成周期任务'}
                                </WxbButton>
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
                                            title: `批量删除 ${selectedInstanceIds.length} 个任务`,
                                            description: '删除后无法恢复，确认继续？',
                                            okText: '确认删除',
                                            cancelText: '取消',
                                        },
                                    },
                                ]}
                                className="solver-v5-duty-bulk-bar"
                            />
                            <div className="solver-v5-duty-task-table-stack">
                                {directTasks.length > 0 && (
                                    <WxbDataTable<StandaloneTask>
                                        dataSource={directTasks}
                                        columns={instanceColumns}
                                        rowKey="id"
                                        size="small"
                                        density="compact"
                                        loading={instanceLoading}
                                        pagination={false}
                                        scroll={{ y: 260 }}
                                        rowSelection={taskRowSelection}
                                    />
                                )}
                                {generatedRecurringTasks.length > 0 && (
                                    <WxbCollapse
                                        className="solver-v5-duty-recurring-collapse"
                                        items={[
                                            {
                                                key: 'generated-recurring',
                                                label: (
                                                    <span className="solver-v5-duty-collapse-label">
                                                        <WxbIcon name="flow-divert" size={14} />
                                                        周期生成任务
                                                        <WxbTag color="blue">{generatedRecurringTasks.length} 个</WxbTag>
                                                    </span>
                                                ),
                                                children: (
                                                    <WxbDataTable<StandaloneTask>
                                                        dataSource={generatedRecurringTasks}
                                                        columns={instanceColumns}
                                                        rowKey="id"
                                                        size="small"
                                                        density="compact"
                                                        loading={instanceLoading}
                                                        pagination={false}
                                                        scroll={{ y: 260 }}
                                                        rowSelection={taskRowSelection}
                                                    />
                                                ),
                                            },
                                        ]}
                                    />
                                )}
                            </div>
                            <div className="solver-v5-duty-instance-footer">
                                <span>共 {instanceStats.total} 个任务</span>
                                <WxbDivider direction="vertical" />
                                <span>临时/弹性 {instanceStats.direct}</span>
                                <WxbDivider direction="vertical" />
                                <span>周期生成 {instanceStats.recurring}</span>
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
                    <div className="solver-v5-modal-footer">
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
                            {confirmActionLoading ? '删除中...' : '删除模板和任务'}
                        </WxbButton>
                    </div>
                )}
            >
                <div className="solver-v5-duty-confirm-body">
                    是否同时删除该模板已生成的所有本月任务？
                </div>
            </WxbModal>
            <WxbModal
                title={regenerateTarget ? `重新生成「${regenerateTarget.task_name}」${selectedMonth.format('YYYY年M月')}任务` : '重新生成任务'}
                open={Boolean(regenerateTarget)}
                onCancel={() => setRegenerateTarget(null)}
                onOk={confirmRegenerate}
                okText="确认重新生成"
                cancelText="取消"
                confirmLoading={confirmActionLoading}
                width={520}
            >
                <div className="solver-v5-duty-confirm-body">
                    将先删除该模板本月已有任务，然后按最新模板配置重新生成。
                </div>
            </WxbModal>
        </div>
    );
};

export default StandingDutyTab;
