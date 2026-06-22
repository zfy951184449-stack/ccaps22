/**
 * triageModel —— 把「员工×日:班次+操作」的日历响应,提炼为分诊台需要的派生量:
 *   · 缺口工单(部分空缺的操作:requiredPeople > 已配人数)
 *   · 超载工单(一人当日有时间重叠的多道操作)
 *   · 健康指标(未覆盖人次 / 夜班覆盖 / 待补派 / 超载)
 *   · 每日缺口合计(迷你条)
 *   · 抽屉候选人(当班空闲优先、时段冲突剔除)
 *
 * 数据形态约束(重要):操作只挂在「在岗成员」的 days 里,因此**完全无人(team=[])的操作不可见**;
 * 分诊台只能识别「已配 ≥1、仍缺人」的部分空缺。完全未分配的操作需要上游排产的需求接口(v2)。
 */
import {
    RosterCalendarResponse,
    RosterCalendarOperation,
    RosterCalendarTeamMember,
    RosterCalendarShift,
    ShiftKind
} from '../personnel-scheduling/types';

/* ───────── 工单类型 ───────── */

export interface TriageVacancy {
    kind: 'VACANCY';
    id: string;
    operationPlanId: number;
    date: string;
    operationName: string;
    batchCode: string;
    stageName: string;
    groupName: string;
    teamName: string;
    startTime: string;
    endTime: string;
    required: number;
    filled: number;
    vacancy: number;
    team: RosterCalendarTeamMember[];
    isNight: boolean;
    isLocked: boolean;
    shiftName: string | null;
    shiftKind: ShiftKind | null;
    /** 越大越严重(= vacancy),作为排序与色阶依据。 */
    severityScore: number;
}

export interface TriageOverload {
    kind: 'OVERLOAD';
    id: string;
    date: string;
    employeeId: number;
    employeeName: string;
    overlapCount: number;
    operations: { name: string; startTime: string; endTime: string }[];
    severityScore: number;
}

export type TriageItem = TriageVacancy | TriageOverload;

export interface TriageKpis {
    uncoveredHeadcount: number;
    nightFilled: number;
    nightRequired: number;
    idleWithDemand: number;
    overloadCount: number;
}

export interface DayTotal {
    date: string;
    vacancy: number;
}

/* ───────── 时间工具(HH:MM,跨零点按 +24h 处理) ───────── */

const toMin = (t: string): number => {
    const [h, m] = (t || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};
/** 返回 [start, end](分钟);end<=start 视为跨零点,+1440。空/无效返回 null。 */
const span = (start: string, end: string): [number, number] | null => {
    if (!start || !end) return null;
    let s = toMin(start);
    let e = toMin(end);
    if (s === 0 && e === 0) return null;
    if (e <= s) e += 1440;
    return [s, e];
};
const overlaps = (a: [number, number] | null, b: [number, number] | null): boolean =>
    !!a && !!b && a[0] < b[1] && b[0] < a[1];

const opIsNight = (op: RosterCalendarOperation, hostShift: RosterCalendarShift | null): boolean => {
    if (hostShift?.isNight) return true;
    const sp = span(op.startTime, op.endTime);
    // 跨零点,或落在 20:00 之后 / 06:00 之前
    return !!sp && (sp[1] > 1440 || sp[0] >= 20 * 60 || sp[0] < 6 * 60);
};

/* ───────── 缺口工单:去重枚举所有操作,保留 vacancy>0 的 ───────── */

export const collectVacancies = (data: RosterCalendarResponse | null): TriageVacancy[] => {
    if (!data) return [];
    const seen = new Map<number, TriageVacancy>();
    for (const emp of data.employees) {
        for (const [date, day] of Object.entries(emp.days)) {
            const ops = day.operations || [];
            if (!ops.length) continue;
            const hostShift = day.shift || null;
            for (const op of ops) {
                if (seen.has(op.operationPlanId)) continue;
                const filled = op.team ? op.team.length : 0;
                const required = op.requiredPeople || filled;
                const vacancy = Math.max(0, required - filled);
                if (vacancy <= 0) continue;
                seen.set(op.operationPlanId, {
                    kind: 'VACANCY',
                    id: `op-${op.operationPlanId}`,
                    operationPlanId: op.operationPlanId,
                    date,
                    operationName: op.operationName,
                    batchCode: op.batchCode,
                    stageName: op.stageName,
                    groupName: emp.groupName,
                    teamName: emp.teamName,
                    startTime: op.startTime,
                    endTime: op.endTime,
                    required,
                    filled,
                    vacancy,
                    team: op.team || [],
                    isNight: opIsNight(op, hostShift),
                    isLocked: !!hostShift?.isLocked,
                    shiftName: hostShift?.shiftName ?? null,
                    shiftKind: hostShift?.kind ?? null,
                    severityScore: vacancy
                });
            }
        }
    }
    return Array.from(seen.values());
};

/* ───────── 超载工单:一人当日 ≥2 道时间重叠操作 ───────── */

export const collectOverloads = (data: RosterCalendarResponse | null): TriageOverload[] => {
    if (!data) return [];
    const out: TriageOverload[] = [];
    for (const emp of data.employees) {
        for (const [date, day] of Object.entries(emp.days)) {
            const ops = day.operations || [];
            if (ops.length < 2) continue;
            let overlap = 0;
            for (let i = 0; i < ops.length; i++) {
                for (let j = i + 1; j < ops.length; j++) {
                    if (overlaps(span(ops[i].startTime, ops[i].endTime), span(ops[j].startTime, ops[j].endTime))) {
                        overlap++;
                    }
                }
            }
            if (overlap === 0) continue;
            out.push({
                kind: 'OVERLOAD',
                id: `ol-${emp.id}-${date}`,
                date,
                employeeId: emp.id,
                employeeName: emp.name,
                overlapCount: overlap,
                operations: ops.map((o) => ({ name: o.operationName, startTime: o.startTime, endTime: o.endTime })),
                severityScore: overlap + 1
            });
        }
    }
    return out;
};

/* ───────── 工单流:缺口在前(按严重度→日期),超载随后 ───────── */

export const buildWorklist = (
    vacancies: TriageVacancy[],
    overloads: TriageOverload[]
): TriageItem[] => {
    const v = [...vacancies].sort((a, b) => b.vacancy - a.vacancy || a.date.localeCompare(b.date));
    const o = [...overloads].sort((a, b) => b.overlapCount - a.overlapCount || a.date.localeCompare(b.date));
    return [...v, ...o];
};

/* ───────── 健康指标 ───────── */

export const selectKpis = (data: RosterCalendarResponse | null): TriageKpis => {
    const vacancies = collectVacancies(data);
    const overloads = collectOverloads(data);

    const uncoveredHeadcount = vacancies.reduce((s, v) => s + v.vacancy, 0);

    let nightFilled = 0;
    let nightRequired = 0;
    for (const v of vacancies) {
        if (!v.isNight) continue;
        nightFilled += v.filled;
        nightRequired += v.required;
    }

    // 待补派:当日所在组有缺口、而本人在 WORK 班却无操作 → 可顶上去
    const daysWithVacancy = new Set(vacancies.map((v) => v.date));
    let idleWithDemand = 0;
    if (data) {
        for (const emp of data.employees) {
            for (const [date, day] of Object.entries(emp.days)) {
                if (!daysWithVacancy.has(date)) continue;
                if (day.shift?.type === 'WORK' && (day.operations?.length || 0) === 0) idleWithDemand++;
            }
        }
    }

    return {
        uncoveredHeadcount,
        nightFilled,
        nightRequired,
        idleWithDemand,
        overloadCount: overloads.length
    };
};

/* ───────── 每日缺口合计(迷你条) ───────── */

export const selectDayTotals = (vacancies: TriageVacancy[]): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const v of vacancies) m[v.date] = (m[v.date] || 0) + v.vacancy;
    return m;
};

/* ───────── 抽屉候选人:当班空闲优先、时段冲突剔除 ───────── */

export interface TriageCandidate {
    employeeId: number;
    name: string;
    code: string;
    role: string;
    shiftHours: number;
    opCount: number;
    fullyIdle: boolean;
}

export const deriveCandidates = (
    data: RosterCalendarResponse | null,
    vac: TriageVacancy
): TriageCandidate[] => {
    if (!data) return [];
    const onOp = new Set(vac.team.map((m) => m.employeeId));
    const vacSpan = span(vac.startTime, vac.endTime);
    const out: TriageCandidate[] = [];
    for (const emp of data.employees) {
        if (onOp.has(emp.id)) continue;
        const day = emp.days[vac.date];
        if (!day || day.shift?.type !== 'WORK') continue; // 当日须在岗(WORK 班)
        const ops = day.operations || [];
        // 时段冲突者整条剔除(不置灰)
        const conflict = ops.some((o) => overlaps(span(o.startTime, o.endTime), vacSpan));
        if (conflict) continue;
        out.push({
            employeeId: emp.id,
            name: emp.name,
            code: emp.code,
            role: emp.role,
            shiftHours: day.shift?.hours || 0,
            opCount: ops.length,
            fullyIdle: ops.length === 0
        });
    }
    // 空闲优先:已排操作少者在前,其次工时多者(能顶满)
    return out.sort((a, b) => a.opCount - b.opCount || b.shiftHours - a.shiftHours);
};

/* ───────── 严重度色阶(全 var(--wx-*),AA 达标);返回 CSS 修饰类后缀 ───────── */

export type SeverityLevel = 'none' | 's1' | 's2' | 's3' | 's4';

export const vacancySeverity = (vacancy: number): SeverityLevel => {
    if (vacancy <= 0) return 'none';
    if (vacancy === 1) return 's1';
    if (vacancy <= 3) return 's2';
    if (vacancy <= 6) return 's3';
    return 's4';
};
