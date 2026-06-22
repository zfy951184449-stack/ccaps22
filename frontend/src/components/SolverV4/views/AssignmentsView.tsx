import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Input, Modal, Radio, Empty, message } from 'antd';
import {
    SearchOutlined, UserOutlined, CheckCircleOutlined,
    ExclamationCircleOutlined, MinusCircleOutlined,
    ClockCircleOutlined, TeamOutlined, WarningOutlined,
    DownOutlined, RightOutlined, SwapOutlined, DeleteOutlined,
    InfoCircleOutlined, AppstoreOutlined, ToolOutlined,
    SafetyCertificateOutlined, ArrowRightOutlined, ThunderboltOutlined,
    MoonOutlined, FieldTimeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { WxbDrawer, WxbTag, WxbEmpty } from '../../wxb-ui';
import AssignmentCalendarView from './AssignmentCalendarView';
import '../SolverV4.css';

// ══════════════════════════════════════
// Types
// ══════════════════════════════════════

interface QualificationRequirement {
    qualification_id: number;
    qualification_name: string;
    required_level: number;
    is_mandatory: boolean;
}

interface Position {
    position_number: number;
    status: 'ASSIGNED' | 'UNASSIGNED';
    employee?: { id: number; name: string; code: string };
    qualification_requirements?: QualificationRequirement[];
    /** null/undefined = 该岗位无资质限制;数组 = 本次排班人员范围内符合资质的员工 ID */
    eligible_employee_ids?: number[] | null;
}

interface Operation {
    operation_plan_id: number;
    batch_code: string;
    operation_name: string;
    planned_start: string;
    planned_end: string;
    required_people?: number;
    share_group_ids?: string;
    share_group_name?: string;
    status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED';
    positions?: Position[];
}

interface ShiftAssignment {
    employee_id: number;
    employee_name: string;
    employee_code?: string;
    date: string;
    shift_id: number;
    shift_name: string;
    start_time?: string;
    end_time?: string;
    nominal_hours?: number;
    plan_type?: string;
    is_night_shift?: boolean;
}

interface ShiftOption {
    shift_id: number;
    shift_name: string;
    shift_code?: string;
    nominal_hours: number;
    start_time?: string;
    end_time?: string;
    is_night_shift?: boolean;
}

interface CalendarDay {
    date: string;
    is_workday: boolean;
}

type CandidateTier = 'RECOMMENDED' | 'NEEDS_SHIFT' | 'RESTING';

/** 候选人当天已排、与本操作时间重叠的其它操作 */
interface CandidateConflict {
    op_name: string;
    batch_code: string;
    start: string;
    end: string;
}

/** 候选人对本岗位每条资质要求的匹配情况 */
interface QualMatch {
    qualification_id: number;
    name: string;
    need: number;
    have: number;
    mandatory: boolean;
    ok: boolean;
}

interface Candidate {
    employee_id: number;
    employee_name: string;
    employee_code?: string;
    department?: string | null;
    shift_name: string;
    shift_id: number;
    start_time?: string;
    end_time?: string;
    nominal_hours?: number;
    plan_type?: string;
    tier: CandidateTier;
    // ── 决策信息(纯前端从 operations + shiftAssignments + employeeMeta 计算)──
    conflicts: CandidateConflict[];     // 当天时间冲突的其它操作
    assignedHours: number;              // 当天已排操作工时合计
    capacityHours: number;              // 当天班次额定工时
    streakDays: number;                 // 含本次的连续上班天数
    prevNight: boolean;                 // 前一日是否上夜班
    quals: QualMatch[];                 // 资质匹配明细
}

/** 被过滤掉的在岗人员(用于"查看原因"):资质不达标 或 当前不可用 */
interface FilteredCandidate {
    employee_id: number;
    employee_name: string;
    employee_code?: string;
    reason: 'QUAL' | 'UNAVAILABLE';
    missing: QualMatch[];               // 不达标的强制资质(reason=QUAL)
    unavailableLabel?: string;          // 不可用原因标签(reason=UNAVAILABLE)
}

export interface EmployeeMetaEntry {
    code: string;
    name: string;
    department: string | null;
    qualifications: { qualification_id: number; level: number }[];
    /** 不可用时段(请假/培训/占用等);更换面板据此排除时间窗重叠的人员 */
    unavailable_periods?: { start: string; end: string; label?: string }[];
}

export type AssignmentStatusFilter = 'ALL' | 'UNASSIGNED' | 'PARTIAL' | 'COMPLETE';

interface AssignmentsViewProps {
    operations: Operation[];
    shiftAssignments: ShiftAssignment[];
    shiftOptions: ShiftOption[];
    calendarDays?: CalendarDay[];
    /** 员工元信息(组织 + 实际资质等级),用于更换面板。key = employee_id */
    employeeMeta?: Record<number, EmployeeMetaEntry>;
    /** 外部(如 KPI 卡)触发的过滤切换;nonce 变化时生效 */
    externalFilter?: { status: AssignmentStatusFilter; nonce: number } | null;
    onAssign: (opId: number, posNum: number, empId: number) => void;
    onUnassign: (opId: number, posNum: number) => void;
    onAssignWithShiftChange: (
        opId: number, posNum: number, empId: number,
        newShiftId: number, date: string
    ) => void;
}

// ══════════════════════════════════════
// Helpers
// ══════════════════════════════════════

const TIER_ORDER: Record<CandidateTier, number> = { RECOMMENDED: 0, NEEDS_SHIFT: 1, RESTING: 2 };
const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const UNDATED_KEY = 'UNDATED';

const CHIP_DEFS: { key: AssignmentStatusFilter; label: string; cls: string }[] = [
    { key: 'ALL', label: '全部', cls: 'all' },
    { key: 'UNASSIGNED', label: '未覆盖', cls: 'error' },
    { key: 'PARTIAL', label: '部分覆盖', cls: 'warning' },
    { key: 'COMPLETE', label: '已覆盖', cls: 'success' },
];

const formatDateRange = (start: string, end: string): string => {
    const s = dayjs(start);
    const e = dayjs(end);
    if (s.format('MM/DD') === e.format('MM/DD')) {
        return `${s.format('MM/DD')} ${s.format('HH:mm')}-${e.format('HH:mm')}`;
    }
    return `${s.format('MM/DD HH:mm')} - ${e.format('MM/DD HH:mm')}`;
};

const countVacancies = (op: Operation): number => {
    const total = op.positions?.length || op.required_people || 1;
    const assigned = op.positions?.filter(p => p.status === 'ASSIGNED').length || 0;
    return Math.max(0, total - assigned);
};

function parseTimeToMinutes(t: string | undefined): number {
    if (!t) return -1;
    const parts = t.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
}

function isShiftCoveringOp(
    shift: { start_time?: string; end_time?: string; nominal_hours?: number; plan_type?: string },
    op: Operation
): boolean {
    if (!shift.start_time || !shift.end_time) return false;
    if (shift.plan_type === 'REST' || (shift.nominal_hours || 0) <= 0.01) return false;

    const opS = dayjs(op.planned_start);
    const opE = dayjs(op.planned_end);
    const opStartMin = opS.hour() * 60 + opS.minute();
    const opEndMin = opE.hour() * 60 + opE.minute();

    const shiftStartMin = parseTimeToMinutes(shift.start_time);
    const shiftEndMin = parseTimeToMinutes(shift.end_time);
    if (shiftStartMin < 0 || shiftEndMin < 0) return false;

    // Overnight shift (e.g. 22:00–06:00)
    if (shiftEndMin <= shiftStartMin) {
        if (opEndMin <= opStartMin) {
            // Both overnight — op must fit inside shift window
            return opStartMin >= shiftStartMin && opEndMin <= shiftEndMin;
        }
        // Day op can't be fully covered by a night shift in general
        return false;
    }

    // Day shift
    if (opEndMin <= opStartMin) return false; // overnight op not covered by day shift
    return opStartMin >= shiftStartMin && opEndMin <= shiftEndMin;
}

function findBestCoveringShift(shiftOptions: ShiftOption[], op: Operation): ShiftOption | null {
    return shiftOptions.find(s => {
        if (!s.start_time || !s.end_time || s.nominal_hours <= 0) return false;
        return isShiftCoveringOp(s as any, op);
    }) || null;
}

// ══════════════════════════════════════
// Component
// ══════════════════════════════════════

const AssignmentsView: React.FC<AssignmentsViewProps> = ({
    operations, shiftAssignments, shiftOptions, calendarDays = [], employeeMeta = {}, externalFilter,
    onAssign, onUnassign, onAssignWithShiftChange
}) => {
    const [selectedOpId, setSelectedOpId] = useState<number | null>(null);
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState<AssignmentStatusFilter>('ALL');
    const [standaloneOnly, setStandaloneOnly] = useState(false);
    const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
    const [pendingScroll, setPendingScroll] = useState<{ date?: string; opId?: number } | null>(null);
    const listBodyRef = useRef<HTMLDivElement>(null);

    // Shift-linkage confirmation modal state
    const [shiftConfirm, setShiftConfirm] = useState<{
        opId: number; posNum: number; empId: number; empName: string;
        currentShift: string; suggestedShift: ShiftOption | null; date: string;
    } | null>(null);
    const [shiftAction, setShiftAction] = useState<'change' | 'force'>('change');

    // Replace/assign drawer state
    const [replaceTarget, setReplaceTarget] = useState<{ op: Operation; pos: Position } | null>(null);
    const [candSearch, setCandSearch] = useState('');
    const [candSort, setCandSort] = useState<'recommend' | 'load' | 'qual'>('recommend');
    const [showFiltered, setShowFiltered] = useState(false);

    // ── Computed ──

    const selectedOp = useMemo(() =>
        operations.find(op => op.operation_plan_id === selectedOpId) || null,
        [operations, selectedOpId]);

    const workdayMap = useMemo(() => {
        const m = new Map<string, boolean>();
        calendarDays.forEach(d => m.set(d.date, d.is_workday));
        return m;
    }, [calendarDays]);

    // All problem ops in chronological order (for auto-select & "next problem" navigation)
    const problemOpsByTime = useMemo(() =>
        operations.filter(op => op.status !== 'COMPLETE')
            .sort((a, b) => (a.planned_start || '9999').localeCompare(b.planned_start || '9999')),
        [operations]);

    // Auto-select first problem op on mount
    useEffect(() => {
        if (selectedOpId !== null) return; // already selected
        const first = problemOpsByTime[0] || operations[0];
        if (first) setSelectedOpId(first.operation_plan_id);
    }, [operations]); // eslint-disable-line react-hooks/exhaustive-deps

    // External filter trigger (e.g. KPI card click)
    useEffect(() => {
        if (!externalFilter) return;
        setStatusFilter(externalFilter.status);
    }, [externalFilter?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

    const statusCounts = useMemo(() => {
        const c: Record<AssignmentStatusFilter, number> = {
            ALL: operations.length, UNASSIGNED: 0, PARTIAL: 0, COMPLETE: 0,
        };
        operations.forEach(op => { c[op.status]++; });
        return c;
    }, [operations]);

    const standaloneStats = useMemo(() => {
        const ops = operations.filter(op => op.batch_code === 'STANDALONE');
        return {
            total: ops.length,
            vacancies: ops.reduce((s, op) => s + countVacancies(op), 0),
        };
    }, [operations]);

    const visibleOps = useMemo(() => {
        let ops = operations;
        if (standaloneOnly) ops = ops.filter(op => op.batch_code === 'STANDALONE');
        if (statusFilter !== 'ALL') ops = ops.filter(op => op.status === statusFilter);
        if (searchText) {
            const q = searchText.toLowerCase();
            ops = ops.filter(op =>
                op.batch_code.toLowerCase().includes(q) ||
                op.operation_name.toLowerCase().includes(q)
            );
        }
        return ops;
    }, [operations, statusFilter, standaloneOnly, searchText]);

    // Date groups, chronologically sorted; undated ops go last
    const dayGroups = useMemo(() => {
        const map = new Map<string, Operation[]>();
        visibleOps.forEach(op => {
            const key = op.planned_start ? dayjs(op.planned_start).format('YYYY-MM-DD') : UNDATED_KEY;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(op);
        });
        const groups = Array.from(map.entries()).map(([date, ops]) => {
            ops.sort((a, b) => (a.planned_start || '').localeCompare(b.planned_start || ''));
            return {
                date,
                ops,
                vacancies: ops.reduce((s, op) => s + countVacancies(op), 0),
            };
        });
        groups.sort((a, b) => {
            if (a.date === UNDATED_KEY) return 1;
            if (b.date === UNDATED_KEY) return -1;
            return a.date.localeCompare(b.date);
        });
        return groups;
    }, [visibleOps]);

    // Scroll the list to a date group / operation (triggered by calendar clicks etc.)
    useEffect(() => {
        if (!pendingScroll || !listBodyRef.current) return;
        const timer = setTimeout(() => {
            const root = listBodyRef.current;
            if (!root) return;
            let el: Element | null = null;
            if (pendingScroll.opId != null) el = root.querySelector(`[data-opid="${pendingScroll.opId}"]`);
            if (!el && pendingScroll.date) el = root.querySelector(`[data-date="${pendingScroll.date}"]`);
            el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            setPendingScroll(null);
        }, 60);
        return () => clearTimeout(timer);
    }, [pendingScroll, dayGroups]);

    // ── Helper maps for candidate decision info ──

    // Operations grouped by date — for time-conflict + workload lookups.
    const opsByDate = useMemo(() => {
        const m = new Map<string, Operation[]>();
        operations.forEach(o => {
            const d = o.planned_start?.slice(0, 10);
            if (!d) return;
            if (!m.has(d)) m.set(d, []);
            m.get(d)!.push(o);
        });
        return m;
    }, [operations]);

    // Working dates per employee — for the consecutive-day streak.
    // 注意:后端 plan_type 对休息日仍可能标 WORK,故以额定工时为准(休息=0h)。
    const workDatesByEmp = useMemo(() => {
        const m = new Map<number, Set<string>>();
        shiftAssignments.forEach(s => {
            const working = (s.nominal_hours || 0) > 0.01;
            if (!working) return;
            if (!m.has(s.employee_id)) m.set(s.employee_id, new Set());
            m.get(s.employee_id)!.add(s.date);
        });
        return m;
    }, [shiftAssignments]);

    // Night-shift dates per employee — for prev-day night detection.
    const nightDatesByEmp = useMemo(() => {
        const m = new Map<number, Set<string>>();
        shiftAssignments.forEach(s => {
            if (!s.is_night_shift) return;
            if (!m.has(s.employee_id)) m.set(s.employee_id, new Set());
            m.get(s.employee_id)!.add(s.date);
        });
        return m;
    }, [shiftAssignments]);

    // ── Candidate Calculation (qualification + conflict + load + fatigue aware) ──

    const getCandidates = useCallback((op: Operation, position?: Position | null): {
        candidates: Candidate[]; filteredOut: number; filteredList: FilteredCandidate[];
    } => {
        const opDate = op.planned_start?.slice(0, 10);
        if (!opDate) return { candidates: [], filteredOut: 0, filteredList: [] };

        const eligibleSet = position?.eligible_employee_ids != null
            ? new Set(position.eligible_employee_ids)
            : null;

        const alreadyAssigned = new Set(
            op.positions?.filter(p => p.status === 'ASSIGNED' && p.employee)
                .map(p => p.employee!.id) || []
        );

        const reqs = position?.qualification_requirements || [];
        const opStart = dayjs(op.planned_start);
        const opEnd = dayjs(op.planned_end);
        const opsToday = opsByDate.get(opDate) || [];
        const prevDate = dayjs(opDate).subtract(1, 'day').format('YYYY-MM-DD');

        const qualMatchFor = (empId: number): QualMatch[] => {
            const metaQuals = employeeMeta[empId]?.qualifications || [];
            return reqs.map(r => {
                const have = metaQuals
                    .filter(q => q.qualification_id === r.qualification_id)
                    .reduce((mx, q) => Math.max(mx, q.level), 0);
                return {
                    qualification_id: r.qualification_id,
                    name: r.qualification_name,
                    need: r.required_level,
                    have,
                    mandatory: r.is_mandatory,
                    ok: have >= r.required_level,
                };
            });
        };

        // 含本次指派当天的连续上班天数(当天若休息则指派后即为第 1 天)
        const streakFor = (empId: number): number => {
            const dates = workDatesByEmp.get(empId);
            if (!dates) return 1;
            let count = 0;
            let cur = dayjs(opDate).subtract(1, 'day');
            while (dates.has(cur.format('YYYY-MM-DD'))) { count++; cur = cur.subtract(1, 'day'); }
            return count + 1;
        };

        // 当天已排操作工时 + 与本操作时间重叠的冲突
        const workloadFor = (empId: number): { assignedHours: number; conflicts: CandidateConflict[] } => {
            let assignedHours = 0;
            const conflicts: CandidateConflict[] = [];
            opsToday.forEach(o => {
                const isOn = o.positions?.some(p => p.status === 'ASSIGNED' && p.employee?.id === empId);
                if (!isOn) return;
                const s = dayjs(o.planned_start);
                const e = dayjs(o.planned_end);
                assignedHours += Math.max(0, e.diff(s, 'minute')) / 60;
                if (o.operation_plan_id !== op.operation_plan_id
                    && s.isBefore(opEnd) && opStart.isBefore(e)) {
                    conflicts.push({
                        op_name: o.operation_name,
                        batch_code: o.batch_code,
                        start: o.planned_start,
                        end: o.planned_end,
                    });
                }
            });
            return { assignedHours, conflicts };
        };

        // 某不可用时段与本操作时间窗重叠 → 该员工本操作不可用(请假/培训/占用等),硬排除
        const unavailableReasonFor = (empId: number): string | null => {
            const periods = employeeMeta[empId]?.unavailable_periods || [];
            for (const p of periods) {
                if (dayjs(p.start).isBefore(opEnd) && opStart.isBefore(dayjs(p.end))) {
                    return p.label || '不可用';
                }
            }
            return null;
        };

        const empSeen = new Map<number, ShiftAssignment>();
        const filteredList: FilteredCandidate[] = [];
        shiftAssignments.filter(s => s.date === opDate).forEach(s => {
            if (alreadyAssigned.has(s.employee_id) || empSeen.has(s.employee_id)) return;
            const unavailReason = unavailableReasonFor(s.employee_id);
            if (unavailReason) {
                filteredList.push({
                    employee_id: s.employee_id,
                    employee_name: s.employee_name,
                    employee_code: s.employee_code,
                    reason: 'UNAVAILABLE',
                    missing: [],
                    unavailableLabel: unavailReason,
                });
                return;
            }
            if (eligibleSet && !eligibleSet.has(s.employee_id)) {
                filteredList.push({
                    employee_id: s.employee_id,
                    employee_name: s.employee_name,
                    employee_code: s.employee_code,
                    reason: 'QUAL',
                    missing: qualMatchFor(s.employee_id).filter(q => q.mandatory && !q.ok),
                });
                return;
            }
            empSeen.set(s.employee_id, s);
        });

        const candidates: Candidate[] = Array.from(empSeen.values()).map(s => {
            const { assignedHours, conflicts } = workloadFor(s.employee_id);
            return {
                employee_id: s.employee_id,
                employee_name: s.employee_name,
                employee_code: s.employee_code,
                department: employeeMeta[s.employee_id]?.department ?? null,
                shift_name: s.shift_name,
                shift_id: s.shift_id,
                start_time: s.start_time,
                end_time: s.end_time,
                nominal_hours: s.nominal_hours,
                plan_type: s.plan_type,
                tier: ((): CandidateTier => {
                    if (s.plan_type === 'REST' || (s.nominal_hours || 0) <= 0.01) return 'RESTING';
                    if (isShiftCoveringOp(s, op)) return 'RECOMMENDED';
                    return 'NEEDS_SHIFT';
                })(),
                conflicts,
                assignedHours,
                capacityHours: s.nominal_hours || 0,
                streakDays: streakFor(s.employee_id),
                prevNight: nightDatesByEmp.get(s.employee_id)?.has(prevDate) || false,
                quals: qualMatchFor(s.employee_id),
            };
        }).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

        return { candidates, filteredOut: filteredList.length, filteredList };
    }, [shiftAssignments, opsByDate, workDatesByEmp, nightDatesByEmp, employeeMeta]);

    // Candidate stats per vacant position of the selected op (drives hints & warnings)
    const vacancyStats = useMemo(() => {
        const m = new Map<number, { total: number; filteredOut: number }>();
        if (!selectedOp) return m;
        selectedOp.positions?.forEach(p => {
            if (p.status === 'ASSIGNED') return;
            const { candidates, filteredOut } = getCandidates(selectedOp, p);
            m.set(p.position_number, { total: candidates.length, filteredOut });
        });
        return m;
    }, [selectedOp, getCandidates]);

    const noCandidateAtAll = useMemo(() => {
        if (vacancyStats.size === 0) return false;
        return Array.from(vacancyStats.values()).every(s => s.total === 0);
    }, [vacancyStats]);

    // Deduped qualification requirements across positions (for the meta row)
    const qualSummary = useMemo(() => {
        if (!selectedOp) return [];
        const m = new Map<string, QualificationRequirement>();
        selectedOp.positions?.forEach(p => {
            p.qualification_requirements?.forEach(r => {
                const key = `${r.qualification_id}-${r.required_level}-${r.is_mandatory}`;
                if (!m.has(key)) m.set(key, r);
            });
        });
        return Array.from(m.values());
    }, [selectedOp]);

    // ── Handlers ──

    const openReplace = useCallback((op: Operation, pos: Position) => {
        setCandSearch('');
        setCandSort('recommend');
        setShowFiltered(false);
        setReplaceTarget({ op, pos });
    }, []);

    const handleSelectCandidate = useCallback((op: Operation, posNum: number, candidate: Candidate) => {
        if (candidate.tier === 'RECOMMENDED') {
            onAssign(op.operation_plan_id, posNum, candidate.employee_id);
            message.success(`已将 ${candidate.employee_name} 分配到 ${op.operation_name} 岗位${posNum}`);
        } else {
            // NEEDS_SHIFT or RESTING → show shift confirmation dialog
            const suggestedShift = findBestCoveringShift(shiftOptions, op);
            setShiftConfirm({
                opId: op.operation_plan_id, posNum,
                empId: candidate.employee_id,
                empName: candidate.employee_name,
                currentShift: candidate.tier === 'RESTING'
                    ? '休息'
                    : `${candidate.shift_name} (${candidate.start_time || ''}-${candidate.end_time || ''})`,
                suggestedShift,
                date: op.planned_start.slice(0, 10),
            });
            setShiftAction(suggestedShift ? 'change' : 'force');
        }
        setReplaceTarget(null);
    }, [onAssign, shiftOptions]);

    const handleConfirmShiftChange = useCallback(() => {
        if (!shiftConfirm) return;

        if (shiftAction === 'change' && shiftConfirm.suggestedShift) {
            onAssignWithShiftChange(
                shiftConfirm.opId, shiftConfirm.posNum, shiftConfirm.empId,
                shiftConfirm.suggestedShift.shift_id, shiftConfirm.date
            );
            message.success(`已分配 ${shiftConfirm.empName} 并调整班次为 ${shiftConfirm.suggestedShift.shift_name}`);
        } else {
            onAssign(shiftConfirm.opId, shiftConfirm.posNum, shiftConfirm.empId);
            message.warning(`已分配 ${shiftConfirm.empName}，但班次可能无法覆盖操作时间`);
        }
        setShiftConfirm(null);
    }, [shiftConfirm, shiftAction, onAssign, onAssignWithShiftChange]);

    const handleRemove = useCallback((op: Operation, posNum: number) => {
        const pos = op.positions?.find(p => p.position_number === posNum);
        Modal.confirm({
            title: '确认移除',
            content: `确定将 ${pos?.employee?.name || ''} 从 ${op.operation_name} 岗位${posNum} 移除？`,
            okText: '移除',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: () => {
                onUnassign(op.operation_plan_id, posNum);
                message.info(`已移除 ${pos?.employee?.name || ''} 的分配`);
            },
        });
    }, [onUnassign]);

    const toggleDay = (key: string) => {
        setCollapsedDays(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const goNextProblem = useCallback(() => {
        if (problemOpsByTime.length === 0) return;
        const idx = problemOpsByTime.findIndex(op => op.operation_plan_id === selectedOpId);
        const next = problemOpsByTime[(idx + 1) % problemOpsByTime.length];
        if (!next) return;
        setSelectedOpId(next.operation_plan_id);
        const dateKey = next.planned_start ? dayjs(next.planned_start).format('YYYY-MM-DD') : UNDATED_KEY;
        setCollapsedDays(prev => {
            if (!prev.has(dateKey)) return prev;
            const n = new Set(prev); n.delete(dateKey); return n;
        });
        setPendingScroll({ opId: next.operation_plan_id, date: dateKey });
    }, [problemOpsByTime, selectedOpId]);

    const handleCalendarSelectDate = useCallback((date: string) => {
        setCollapsedDays(prev => {
            if (!prev.has(date)) return prev;
            const n = new Set(prev); n.delete(date); return n;
        });
        setPendingScroll({ date });
    }, []);

    const handleCalendarSelectOperation = useCallback((opId: number, date: string) => {
        setSelectedOpId(opId);
        setCollapsedDays(prev => {
            if (!prev.has(date)) return prev;
            const n = new Set(prev); n.delete(date); return n;
        });
        setPendingScroll({ opId, date });
    }, []);

    // ══════════════════════════════════════
    // Render: Replace / Assign Drawer
    // ══════════════════════════════════════

    const r1 = (n: number) => Math.round(n * 10) / 10;
    // 容错时间格式化:既能处理 "HH:mm",也能处理完整 ISO 日期时间
    const fmtHM = (t?: string) => {
        if (!t) return '';
        if (/^\d{1,2}:\d{2}/.test(t)) return t.slice(0, 5);
        const d = dayjs(t);
        return d.isValid() ? d.format('HH:mm') : t;
    };

    const renderCandidateCard = (
        op: Operation, posNum: number, c: Candidate,
        bestId: number | undefined, suggested: ShiftOption | null,
    ) => {
        const hasConflict = c.conflicts.length > 0;
        const pct = c.capacityHours > 0
            ? Math.min(100, Math.round((c.assignedHours / c.capacityHours) * 100))
            : (c.assignedHours > 0 ? 100 : 0);
        const loadLevel = pct >= 100 ? 'full' : (pct >= 85 ? 'warn' : 'ok');

        return (
            <button type="button" key={c.employee_id}
                className={`asgn-cc tier-${c.tier.toLowerCase()}${hasConflict ? ' has-conflict' : ''}`}
                onClick={() => handleSelectCandidate(op, posNum, c)}>
                <div className="asgn-cc-head">
                    <span className="asgn-cc-name">{c.employee_name}</span>
                    <span className="asgn-cc-sub">
                        {c.employee_code}{c.department ? ` · ${c.department}` : ''}
                    </span>
                    {c.employee_id === bestId && <span className="asgn-cc-best">最佳</span>}
                </div>

                {hasConflict && (
                    <div className="asgn-cc-conflict">
                        <WarningOutlined /> 时间冲突:{c.conflicts.map(cf =>
                            `${cf.op_name} ${fmtHM(cf.start)}–${fmtHM(cf.end)}`).join('、')}
                    </div>
                )}

                <div className="asgn-cc-line">
                    <ClockCircleOutlined />
                    {c.tier === 'RECOMMENDED' && (
                        <span>{c.shift_name} {fmtHM(c.start_time)}–{fmtHM(c.end_time)} <em className="ok">覆盖操作 ✓</em></span>
                    )}
                    {c.tier === 'NEEDS_SHIFT' && (
                        <span>当前 {c.shift_name} {fmtHM(c.start_time)}–{fmtHM(c.end_time)} <em className="warn">盖不住操作</em>
                            {suggested && <> → 建议改 {suggested.shift_name}</>}</span>
                    )}
                    {c.tier === 'RESTING' && (
                        <span>当天休息 · 指派需排班{suggested ? ` ${suggested.shift_name}` : ''}</span>
                    )}
                </div>

                {c.quals.length > 0 && (
                    <div className="asgn-cc-line quals">
                        <SafetyCertificateOutlined />
                        {c.quals.map(q => (
                            <span key={q.qualification_id} className={`asgn-cc-qual ${q.ok ? 'ok' : 'no'}`}>
                                {q.name} L{q.have}≥L{q.need} {q.ok ? '✓' : '✗'}{q.mandatory ? '' : '(优选)'}
                            </span>
                        ))}
                    </div>
                )}

                {(c.prevNight || c.streakDays >= 5) && (
                    <div className="asgn-cc-chips">
                        {c.prevNight && (
                            <span className="asgn-cc-chip warn"><MoonOutlined /> 昨夜夜班</span>
                        )}
                        {c.streakDays >= 5 && (
                            <span className={`asgn-cc-chip ${c.streakDays >= 6 ? 'danger' : 'warn'}`}>
                                <ThunderboltOutlined /> 连续上班 {c.streakDays} 天
                            </span>
                        )}
                    </div>
                )}

                <div className="asgn-cc-load">
                    <span className="asgn-cc-load-label"><FieldTimeOutlined /> 当日负荷</span>
                    <span className="asgn-cc-load-bar">
                        <span className={`asgn-cc-load-fill ${loadLevel}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="asgn-cc-load-val">
                        {c.capacityHours > 0 ? `${r1(c.assignedHours)}/${r1(c.capacityHours)}h` : `${r1(c.assignedHours)}h`}
                    </span>
                </div>
            </button>
        );
    };

    const renderReplaceDrawer = () => {
        if (!replaceTarget) return null;
        const { op, pos } = replaceTarget;
        const posNum = pos.position_number;
        const { candidates, filteredList } = getCandidates(op, pos);
        const reqs = pos.qualification_requirements || [];
        const hasQualFilter = pos.eligible_employee_ids != null;
        const suggested = findBestCoveringShift(shiftOptions, op);

        const q = candSearch.trim().toLowerCase();
        const matchSearch = (c: Candidate) => !q
            || c.employee_name.toLowerCase().includes(q)
            || (c.employee_code || '').toLowerCase().includes(q);
        const sortKey = (c: Candidate) => {
            if (candSort === 'load') return c.assignedHours;
            if (candSort === 'qual') return -c.quals.filter(x => x.ok).length;
            return (c.conflicts.length > 0 ? 1000 : 0) + c.assignedHours; // recommend
        };
        const sortCands = (arr: Candidate[]) => [...arr].sort((a, b) => sortKey(a) - sortKey(b));

        const visible = candidates.filter(matchSearch);
        const recommended = sortCands(visible.filter(c => c.tier === 'RECOMMENDED'));
        const needsShift = sortCands(visible.filter(c => c.tier === 'NEEDS_SHIFT'));
        const resting = sortCands(visible.filter(c => c.tier === 'RESTING'));
        const bestId = recommended.find(c => c.conflicts.length === 0)?.employee_id;
        const hiddenQual = filteredList.filter(f => f.reason === 'QUAL').length;
        const hiddenUnavail = filteredList.filter(f => f.reason === 'UNAVAILABLE').length;
        const hiddenLabel = [
            hiddenQual > 0 ? `资质 ${hiddenQual}` : '',
            hiddenUnavail > 0 ? `不可用 ${hiddenUnavail}` : '',
        ].filter(Boolean).join(' · ');

        const title = pos.status === 'ASSIGNED' && pos.employee
            ? `更换 ${pos.employee.name}`
            : `分配 · 岗位${posNum}`;

        return (
            <WxbDrawer open width={440} placement="right" destroyOnClose
                className="asgn-replace-drawer"
                onClose={() => setReplaceTarget(null)}
                title={<span className="asgn-rd-title"><SwapOutlined /> {title}</span>}>
                <div className="asgn-rd-ctx">
                    <div className="asgn-rd-op">{op.operation_name}</div>
                    <div className="asgn-rd-meta">
                        <span>{op.batch_code === 'STANDALONE' ? '独立任务' : op.batch_code}</span>
                        <span><ClockCircleOutlined /> {formatDateRange(op.planned_start, op.planned_end)}</span>
                        <span>岗位{posNum}</span>
                    </div>
                    {reqs.length > 0 && (
                        <div className="asgn-rd-quals">
                            {reqs.map(rq => (
                                <WxbTag key={`${rq.qualification_id}-${rq.required_level}`}
                                    color={rq.is_mandatory ? 'blue' : 'neutral'}>
                                    {rq.qualification_name} ≥L{rq.required_level}{rq.is_mandatory ? '' : ' 优选'}
                                </WxbTag>
                            ))}
                        </div>
                    )}
                </div>

                <div className="asgn-rd-toolbar">
                    <Input prefix={<SearchOutlined />} placeholder="搜索姓名 / 工号" allowClear
                        value={candSearch} onChange={e => setCandSearch(e.target.value)} />
                    <select className="asgn-rd-sort" value={candSort}
                        onChange={e => setCandSort(e.target.value as 'recommend' | 'load' | 'qual')}>
                        <option value="recommend">按推荐度</option>
                        <option value="load">按当日负荷</option>
                        <option value="qual">按资质</option>
                    </select>
                </div>

                {visible.length === 0 ? (
                    <WxbEmpty description={filteredList.length > 0
                        ? `当天 ${filteredList.length} 人在岗,但均不可选(资质不符或不可用)`
                        : '当天无可用候选人'} />
                ) : (
                    <div className="asgn-rd-list">
                        {recommended.length > 0 && <div className="asgn-rd-group rec">推荐 · 班次覆盖操作</div>}
                        {recommended.map(c => renderCandidateCard(op, posNum, c, bestId, suggested))}
                        {needsShift.length > 0 && <div className="asgn-rd-group warn">需调整班次</div>}
                        {needsShift.map(c => renderCandidateCard(op, posNum, c, bestId, suggested))}
                        {resting.length > 0 && <div className="asgn-rd-group rest">当天休息</div>}
                        {resting.map(c => renderCandidateCard(op, posNum, c, bestId, suggested))}
                    </div>
                )}

                {filteredList.length > 0 && (
                    <div className="asgn-rd-filtered">
                        <button type="button" className="asgn-rd-filtered-toggle"
                            onClick={() => setShowFiltered(v => !v)}>
                            <SafetyCertificateOutlined /> 已隐藏 {filteredList.length} 人{hiddenLabel ? `(${hiddenLabel})` : ''}
                            <span className="asgn-rd-filtered-caret">{showFiltered ? '收起' : '查看原因'}</span>
                        </button>
                        {showFiltered && (
                            <div className="asgn-rd-filtered-list">
                                {filteredList.map(f => (
                                    <div key={f.employee_id} className="asgn-rd-filtered-row">
                                        <span className="asgn-rd-filtered-name">
                                            {f.employee_name}
                                            <span className="asgn-rd-filtered-code">{f.employee_code}</span>
                                        </span>
                                        <span className="asgn-rd-filtered-miss">
                                            {f.reason === 'UNAVAILABLE'
                                                ? `不可用 · ${f.unavailableLabel || '请假/占用'}`
                                                : (f.missing.length > 0
                                                    ? f.missing.map(m => `缺 ${m.name} L${m.need}(现 L${m.have || 0})`).join('、')
                                                    : '不符合资质要求')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="asgn-rd-foot">
                    <InfoCircleOutlined />
                    {hasQualFilter
                        ? ' 候选人已按岗位资质筛选并排除当天不可用人员;点选即指派,休息/需调班会先弹确认'
                        : ' 该岗位未配置强制资质(已排除当天不可用人员),请人工确认资质'}
                </div>
            </WxbDrawer>
        );
    };

    // ══════════════════════════════════════
    // Render: Left Panel – Day-grouped Operation List
    // ══════════════════════════════════════

    const renderOpListItem = (op: Operation) => {
        const isSelected = selectedOpId === op.operation_plan_id;
        const assigned = op.positions?.filter(p => p.status === 'ASSIGNED').length || 0;
        const total = op.positions?.length || op.required_people || 1;
        const dotCls = op.status === 'COMPLETE' ? 'success' : op.status === 'PARTIAL' ? 'warning' : 'error';
        const isStandalone = op.batch_code === 'STANDALONE';

        return (
            <div key={op.operation_plan_id}
                data-opid={op.operation_plan_id}
                className={`asgn-list-item ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedOpId(op.operation_plan_id)}>
                <span className="asgn-list-time">
                    {op.planned_start ? dayjs(op.planned_start).format('HH:mm') : '--:--'}
                </span>
                <span className={`asgn-list-dot ${dotCls}`} />
                <span className="asgn-list-name" title={op.operation_name}>{op.operation_name}</span>
                {isStandalone ? (
                    <span className="asgn-standalone-tag">独立</span>
                ) : (
                    <span className="asgn-list-batch">{op.batch_code}</span>
                )}
                <span className={`asgn-list-ratio ${assigned < total ? 'short' : ''}`}>
                    {assigned}/{total}人
                </span>
            </div>
        );
    };

    const renderDayGroup = (group: { date: string; ops: Operation[]; vacancies: number }) => {
        const isUndated = group.date === UNDATED_KEY;
        const collapsed = collapsedDays.has(group.date);
        const d = isUndated ? null : dayjs(group.date);
        const isOff = d
            ? (workdayMap.has(group.date) ? !workdayMap.get(group.date) : (d.day() === 0 || d.day() === 6))
            : false;

        return (
            <div key={group.date} className="asgn-list-section">
                <div className={`asgn-day-hdr ${isOff ? 'off' : ''}`} data-date={group.date}
                    onClick={() => toggleDay(group.date)}>
                    {collapsed ? <RightOutlined /> : <DownOutlined />}
                    <span className="asgn-day-title">
                        {isUndated ? '未定时间' : `${d!.format('MM-DD')} ${WEEKDAY_CN[d!.day()]}`}
                    </span>
                    {isOff && <span className="asgn-day-off-tag">休</span>}
                    <span className="asgn-day-meta">{group.ops.length} 操作</span>
                    <span className="asgn-day-spacer" />
                    {group.vacancies > 0 ? (
                        <span className="asgn-day-vac">缺 {group.vacancies} 人</span>
                    ) : (
                        <span className="asgn-day-ok">已齐</span>
                    )}
                </div>
                {!collapsed && group.ops.map(renderOpListItem)}
            </div>
        );
    };

    // ══════════════════════════════════════
    // Render: Right Panel – Detail
    // ══════════════════════════════════════

    const renderDetailPanel = () => {
        if (!selectedOp) {
            return (
                <div className="asgn-detail-empty">
                    <AppstoreOutlined className="asgn-detail-empty-icon" />
                    <span>选择一个操作查看详情</span>
                </div>
            );
        }

        const assigned = selectedOp.positions?.filter(p => p.status === 'ASSIGNED').length || 0;
        const total = selectedOp.positions?.length || selectedOp.required_people || 1;
        const isStandalone = selectedOp.batch_code === 'STANDALONE';
        const statusMap: Record<string, { cls: string; label: string; icon: React.ReactNode }> = {
            COMPLETE: { cls: 'success', label: '已覆盖', icon: <CheckCircleOutlined /> },
            PARTIAL: { cls: 'warning', label: '部分覆盖', icon: <ExclamationCircleOutlined /> },
            UNASSIGNED: { cls: 'error', label: '未覆盖', icon: <MinusCircleOutlined /> },
        };
        const st = statusMap[selectedOp.status];

        return (
            <div className="asgn-detail-content">
                {/* Header */}
                <h3 className="asgn-detail-title">{selectedOp.operation_name}</h3>
                {isStandalone ? (
                    <span className="asgn-standalone-tag asgn-standalone-tag-lg">
                        <ToolOutlined /> 独立任务
                    </span>
                ) : (
                    <span className="asgn-detail-batch">{selectedOp.batch_code}</span>
                )}

                {/* Meta */}
                <div className="asgn-detail-meta">
                    <span className={`assign-status-pill ${st.cls}`}>{st.icon} {st.label}</span>
                    <span className="asgn-detail-meta-item">
                        <ClockCircleOutlined /> {formatDateRange(selectedOp.planned_start, selectedOp.planned_end)}
                    </span>
                    {selectedOp.share_group_name && (
                        <span className="asgn-detail-group-tag">组: {selectedOp.share_group_name}</span>
                    )}
                </div>

                {/* Qualification requirements */}
                {qualSummary.length > 0 && (
                    <div className="asgn-detail-quals">
                        <SafetyCertificateOutlined />
                        <span className="asgn-detail-quals-label">资质要求:</span>
                        {qualSummary.map(q => (
                            <span key={`${q.qualification_id}-${q.required_level}`}
                                className={`asgn-qual-tag ${q.is_mandatory ? '' : 'optional'}`}>
                                {q.qualification_name} ≥{q.required_level}级{q.is_mandatory ? '' : ' · 非强制'}
                            </span>
                        ))}
                    </div>
                )}

                {/* No-candidate warning */}
                {selectedOp.status !== 'COMPLETE' && noCandidateAtAll && (
                    <div className="asgn-no-cand-warn">
                        <WarningOutlined /> 当天没有符合资质的在岗人员可分配,请考虑调班、补充资质或调整操作计划
                    </div>
                )}

                {/* Positions */}
                <div className="asgn-detail-positions">
                    <div className="asgn-detail-pos-header">
                        <span><TeamOutlined /> 岗位分配</span>
                        <span className="asgn-detail-pos-count">{assigned}/{total} 已分配</span>
                    </div>

                    {selectedOp.positions?.map(pos => {
                        const stats = vacancyStats.get(pos.position_number);
                        return (
                            <div key={pos.position_number}
                                className={`asgn-detail-pos-row ${pos.status === 'ASSIGNED' ? 'filled' : 'empty'}`}>
                                <span className={`assign-pos-dot ${pos.status === 'ASSIGNED' ? 'filled' : 'empty'}`} />
                                <span className="asgn-detail-pos-label">岗位{pos.position_number}</span>

                                {pos.status === 'ASSIGNED' && pos.employee ? (
                                    <>
                                        <span className="asgn-detail-pos-emp">
                                            <UserOutlined /> {pos.employee.name}
                                            <span className="asgn-detail-pos-code">({pos.employee.code})</span>
                                        </span>
                                        <div className="asgn-detail-pos-actions">
                                            <button className="asgn-act-btn swap"
                                                onClick={() => openReplace(selectedOp, pos)}>
                                                <SwapOutlined /> 更换
                                            </button>
                                            <button className="asgn-act-btn remove"
                                                onClick={() => handleRemove(selectedOp, pos.position_number)}>
                                                <DeleteOutlined /> 移除
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span className="asgn-detail-pos-vacant">空缺</span>
                                        {stats && (
                                            <span className={`asgn-pos-cand-hint ${stats.total === 0 ? 'none' : ''}`}>
                                                {stats.total > 0 ? `${stats.total} 人可选` : '无人可选'}
                                            </span>
                                        )}
                                        <div className="asgn-detail-pos-actions">
                                            <button className="asgn-act-btn assign"
                                                onClick={() => openReplace(selectedOp, pos)}>
                                                <UserOutlined /> 分配 ▾
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="asgn-detail-footer">
                    <span>需求 {total}人 &nbsp;|&nbsp; 已分配 {assigned}人 &nbsp;|&nbsp; 空缺 {total - assigned}人</span>
                    {problemOpsByTime.length > 0 && (
                        <button className="asgn-next-btn" onClick={goNextProblem}>
                            下一个问题 ({problemOpsByTime.length}) <ArrowRightOutlined />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    // ══════════════════════════════════════
    // Main Render
    // ══════════════════════════════════════

    if (operations.length === 0) {
        return <Empty description="暂无工序数据" style={{ padding: 40 }} />;
    }

    return (
        <div className="asgn-root">
            {/* ── Toolbar: status chips + standalone metric + search ── */}
            <div className="asgn-toolbar">
                <div className="asgn-chip-group">
                    {CHIP_DEFS.map(c => (
                        <button key={c.key}
                            className={`asgn-chip ${c.cls} ${statusFilter === c.key ? 'active' : ''}`}
                            onClick={() => setStatusFilter(c.key)}>
                            {c.label}
                            <span className="asgn-chip-count">{statusCounts[c.key]}</span>
                        </button>
                    ))}
                    {standaloneStats.total > 0 && (
                        <>
                            <span className="asgn-toolbar-divider" />
                            <button
                                className={`asgn-chip standalone ${standaloneOnly ? 'active' : ''}`}
                                title="只看独立任务(可与状态过滤叠加)"
                                onClick={() => setStandaloneOnly(v => !v)}>
                                <ToolOutlined /> 独立任务
                                <span className="asgn-chip-count">{standaloneStats.total}</span>
                                {standaloneStats.vacancies > 0 && (
                                    <span className="asgn-chip-vac">缺{standaloneStats.vacancies}</span>
                                )}
                            </button>
                        </>
                    )}
                </div>
                <span className="asgn-toolbar-spacer" />
                <Input placeholder="搜索操作或批次..." prefix={<SearchOutlined />}
                    value={searchText} onChange={e => setSearchText(e.target.value)}
                    size="small" allowClear className="asgn-toolbar-search" />
            </div>

            {/* ── Top: Calendar overview ── */}
            <AssignmentCalendarView
                operations={visibleOps}
                calendarDays={calendarDays}
                selectedOpId={selectedOpId}
                onSelectDate={handleCalendarSelectDate}
                onSelectOperation={handleCalendarSelectOperation}
            />

            {/* ── Bottom: Day-grouped list + detail ── */}
            <div className="asgn-master-detail">
                <div className="asgn-list-panel">
                    <div className="asgn-list-body" ref={listBodyRef}>
                        {dayGroups.length === 0 ? (
                            <Empty description="无匹配的操作" style={{ padding: 32 }}
                                image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        ) : (
                            dayGroups.map(renderDayGroup)
                        )}
                    </div>
                </div>

                <div className="asgn-detail-panel">
                    {renderDetailPanel()}
                </div>
            </div>

            {/* ── Replace / Assign Drawer ── */}
            {renderReplaceDrawer()}

            {/* ── Shift Confirmation Modal ── */}
            <Modal
                title={<><WarningOutlined className="asgn-warn-icon" /> 班次调整确认</>}
                open={!!shiftConfirm}
                onCancel={() => setShiftConfirm(null)}
                onOk={handleConfirmShiftChange}
                okText="确认分配"
                cancelText="取消"
                width={480}
            >
                {shiftConfirm && (
                    <div className="asgn-shift-confirm">
                        <p><strong>{shiftConfirm.empName}</strong> 当天班次：{shiftConfirm.currentShift}</p>
                        <p>操作时间范围：{selectedOp
                            ? formatDateRange(selectedOp.planned_start, selectedOp.planned_end)
                            : ''}</p>
                        <p className="asgn-shift-confirm-warn">当前班次无法覆盖此操作的执行时间。</p>

                        <Radio.Group value={shiftAction} onChange={e => setShiftAction(e.target.value)}
                            className="asgn-shift-confirm-options">
                            {shiftConfirm.suggestedShift ? (
                                <Radio value="change">
                                    将 {shiftConfirm.empName} 改为{' '}
                                    <strong>{shiftConfirm.suggestedShift.shift_name}</strong>
                                    {' '}({shiftConfirm.suggestedShift.start_time}-{shiftConfirm.suggestedShift.end_time})
                                    <span className="asgn-recommend-tag">推荐</span>
                                </Radio>
                            ) : (
                                <Radio value="change" disabled>无可用覆盖班次</Radio>
                            )}
                            <Radio value="force">
                                仅分配人员，不调整班次
                                <span className="asgn-shift-confirm-force-warn">
                                    <WarningOutlined /> 将产生覆盖异常
                                </span>
                            </Radio>
                        </Radio.Group>

                        <div className="asgn-shift-info-box">
                            <InfoCircleOutlined /> 此操作将同时更新排班矩阵中{' '}
                            {shiftConfirm.empName} {shiftConfirm.date} 的班次
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default React.memo(AssignmentsView);
