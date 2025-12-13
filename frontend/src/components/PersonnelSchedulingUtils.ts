import { Dayjs } from 'dayjs';

export interface ShiftPlan {
    plan_id: number;
    employee_id: number;
    employee_name: string;
    employee_code: string;
    employee_org_role?: string | null;
    org_role?: string | null;
    primary_team_id?: number | null;
    team_name?: string | null;
    direct_leader_id?: number | null;
    plan_date: string;
    plan_category: 'BASE' | 'REST' | 'PRODUCTION' | 'OVERTIME';
    plan_state: string;
    plan_hours?: number;
    shift_code?: string | null;
    shift_name?: string | null;
    shift_start_time?: string | null;
    shift_end_time?: string | null;
    shift_nominal_hours?: number | null;
    operation_name?: string | null;
    operation_code?: string | null;
    operation_start?: string | null;
    operation_end?: string | null;
    batch_code?: string | null;
    batch_name?: string | null;
    stage_name?: string | null;
}

export const SHIFT_PRIORITY: Record<string, number> = {
    PRODUCTION: 4,
    OVERTIME: 3,
    BASE: 2,
    REST: 1,
};

export const ROLE_PRIORITY: Record<string, number> = {
    DEPT_MANAGER: 5,
    TEAM_LEADER: 4,
    GROUP_LEADER: 3,
    SHIFT_LEADER: 2,
    FRONTLINE: 1,
};

export const ROLE_DISPLAY_NAMES: Record<string, string> = {
    DEPT_MANAGER: '经理',
    TEAM_LEADER: '主管',
    GROUP_LEADER: '组长',
    SHIFT_LEADER: '班长',
    FRONTLINE: '一线',
};

export const getPlanPriority = (plan?: ShiftPlan) => {
    if (!plan) {
        return 0;
    }
    const category = (plan.plan_category || '').toUpperCase();
    return SHIFT_PRIORITY[category] ?? 0;
};

export const getPlanHours = (plan?: ShiftPlan) => {
    if (!plan) {
        return 0;
    }
    if (typeof plan.plan_hours === 'number') {
        return plan.plan_hours;
    }
    if (plan.plan_hours) {
        const parsed = Number(plan.plan_hours);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    if (typeof plan.shift_nominal_hours === 'number') {
        return plan.shift_nominal_hours;
    }
    return 0;
};

export const selectPrimaryPlan = (plans: ShiftPlan[]): ShiftPlan | null => {
    if (!plans || plans.length === 0) {
        return null;
    }
    return plans.reduce<ShiftPlan | null>((best, current) => {
        if (!best) {
            return current;
        }
        const currentPriority = getPlanPriority(current);
        const bestPriority = getPlanPriority(best);
        if (currentPriority > bestPriority) {
            return current;
        }
        if (currentPriority < bestPriority) {
            return best;
        }
        // 同一优先级时，以工时较长者为准，避免重复班次
        return getPlanHours(current) > getPlanHours(best) ? current : best;
    }, null);
};
