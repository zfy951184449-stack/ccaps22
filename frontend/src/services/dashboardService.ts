import axios from 'axios';
import {
    ManpowerCurveData,
    WorkHoursData,
    DailyAssignmentsData,
    DepartmentOption,
    ShiftOption,
    DayViewData,
    MonthViewData
} from '../types/dashboard';
import { organizationStructureApi } from './api';

const API_BASE = '/api';

const isRecord = (value: unknown): value is Record<string, any> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const extractArrayPayload = <T = any>(payload: any): T[] => {
    if (Array.isArray(payload)) {
        return payload;
    }
    if (Array.isArray(payload?.data)) {
        return payload.data;
    }
    if (Array.isArray(payload?.items)) {
        return payload.items;
    }
    if (Array.isArray(payload?.rows)) {
        return payload.rows;
    }
    if (Array.isArray(payload?.list)) {
        return payload.list;
    }
    return [];
};

const extractObjectPayload = <T extends Record<string, any>>(payload: any): Partial<T> => {
    if (!isRecord(payload)) {
        return {};
    }
    if (isRecord(payload.data)) {
        return payload.data as Partial<T>;
    }
    return payload as Partial<T>;
};

const toNumber = (value: unknown, fallback = 0): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const toStringValue = (value: unknown, fallback = ''): string => {
    if (typeof value === 'string') {
        return value;
    }
    if (value === null || value === undefined) {
        return fallback;
    }
    return String(value);
};

const normalizeDepartmentOptions = (nodes: any[]): DepartmentOption[] => {
    return nodes
        .filter(isRecord)
        .map((node) => {
            const value = toNumber(node.value ?? node.id, Number.NaN);
            const label = toStringValue(node.label ?? node.unitName ?? node.unit_name, '');
            const children = normalizeDepartmentOptions(extractArrayPayload(node.children));

            return {
                value,
                label,
                ...(children.length > 0 ? { children } : {}),
            };
        })
        .filter((option) => Number.isFinite(option.value) && option.label.length > 0);
};

const normalizeShiftOptions = (payload: any): ShiftOption[] => {
    return extractArrayPayload<any>(payload)
        .filter(isRecord)
        .map((row) => {
            const id = toNumber(row.id ?? row.shift_id, Number.NaN);
            const shiftCode = toStringValue(row.shift_code ?? row.shiftCode, '');
            const shiftName = toStringValue(row.shift_name ?? row.shiftName, shiftCode || `班次${id}`);
            return {
                id,
                shift_code: shiftCode,
                shift_name: shiftName,
            };
        })
        .filter((option) => Number.isFinite(option.id));
};

const normalizeManpowerCurve = (payload: any): ManpowerCurveData => {
    const raw = extractObjectPayload<any>(payload);
    const rawSummary = extractObjectPayload<any>(raw.summary);

    const dailyData = extractArrayPayload<any>(raw.daily_data ?? raw.dailyData)
        .filter(isRecord)
        .map((day) => ({
            date: toStringValue(day.date, ''),
            available_count: toNumber(day.available_count ?? day.availableCount, 0),
            demand_count: toNumber(day.demand_count ?? day.demandCount, 0),
            gap: toNumber(day.gap, 0),
            is_weekend: Boolean(day.is_weekend ?? day.isWeekend),
            is_workday: Boolean(day.is_workday ?? day.isWorkday),
            holiday_type: toStringValue(day.holiday_type ?? day.holidayType, 'WORKDAY'),
            holiday_name: day.holiday_name ?? day.holidayName ?? null,
            salary_multiplier:
                day.salary_multiplier === null || day.salary_multiplier === undefined
                    ? null
                    : toNumber(day.salary_multiplier ?? day.salaryMultiplier, 0),
            shift_breakdown: extractArrayPayload<any>(day.shift_breakdown ?? day.shiftBreakdown)
                .filter(isRecord)
                .map((sb) => ({
                    shift_code: toStringValue(sb.shift_code ?? sb.shiftCode, ''),
                    shift_name: toStringValue(sb.shift_name ?? sb.shiftName, ''),
                    has_operation: Boolean(sb.has_operation ?? sb.hasOperation),
                    count: toNumber(sb.count, 0),
                })),
        }));

    return {
        total_headcount: toNumber(raw.total_headcount ?? raw.totalHeadcount, 0),
        daily_data: dailyData,
        summary: {
            avg_gap: toStringValue(rawSummary.avg_gap ?? rawSummary.avgGap, '0'),
            max_gap: toNumber(rawSummary.max_gap ?? rawSummary.maxGap, 0),
            max_gap_date: toStringValue(rawSummary.max_gap_date ?? rawSummary.maxGapDate, ''),
            sufficiency_rate: toNumber(rawSummary.sufficiency_rate ?? rawSummary.sufficiencyRate, 100),
            gap_days: toNumber(rawSummary.gap_days ?? rawSummary.gapDays, 0),
        },
    };
};

const normalizeDayViewData = (raw: Partial<any>): DayViewData => {
    const summary = extractObjectPayload<any>(raw.summary);
    return {
        granularity: 'day',
        daily_data: extractArrayPayload<any>(raw.daily_data ?? raw.dailyData)
            .filter(isRecord)
            .map((item) => ({
                date: toStringValue(item.date, ''),
                batch_id: toNumber(item.batch_id ?? item.batchId, 0),
                batch_code: toStringValue(item.batch_code ?? item.batchCode, ''),
                work_hours: toNumber(item.work_hours ?? item.workHours, 0),
            })),
        total_by_date: extractArrayPayload<any>(raw.total_by_date ?? raw.totalByDate)
            .filter(isRecord)
            .map((item) => ({
                date: toStringValue(item.date, ''),
                work_hours: toNumber(item.work_hours ?? item.workHours, 0),
            })),
        batches: extractArrayPayload<any>(raw.batches)
            .filter(isRecord)
            .map((item) => ({
                batch_id: toNumber(item.batch_id ?? item.batchId, 0),
                batch_code: toStringValue(item.batch_code ?? item.batchCode, ''),
            })),
        summary: {
            total_hours: toNumber(summary.total_hours ?? summary.totalHours, 0),
            avg_daily_hours: toNumber(summary.avg_daily_hours ?? summary.avgDailyHours, 0),
            peak_hours: toNumber(summary.peak_hours ?? summary.peakHours, 0),
            peak_date: toStringValue(summary.peak_date ?? summary.peakDate, ''),
            batch_count: toNumber(summary.batch_count ?? summary.batchCount, 0),
        },
    };
};

const normalizeMonthViewData = (raw: Partial<any>): MonthViewData => {
    const summary = extractObjectPayload<any>(raw.summary);
    return {
        granularity: 'month',
        monthly_data: extractArrayPayload<any>(raw.monthly_data ?? raw.monthlyData)
            .filter(isRecord)
            .map((item) => ({
                year_month: toStringValue(item.year_month ?? item.yearMonth, ''),
                month_label: toStringValue(item.month_label ?? item.monthLabel, ''),
                total_hours: toNumber(item.total_hours ?? item.totalHours, 0),
                hours_per_person: toNumber(item.hours_per_person ?? item.hoursPerPerson, 0),
                peak_daily_hours: toNumber(item.peak_daily_hours ?? item.peakDailyHours, 0),
                peak_date: toStringValue(item.peak_date ?? item.peakDate, ''),
                batch_breakdown: extractArrayPayload<any>(item.batch_breakdown ?? item.batchBreakdown)
                    .filter(isRecord)
                    .map((batchItem) => ({
                        batch_code: toStringValue(batchItem.batch_code ?? batchItem.batchCode, ''),
                        work_hours: toNumber(batchItem.work_hours ?? batchItem.workHours, 0),
                    })),
            })),
        summary: {
            total_hours: toNumber(summary.total_hours ?? summary.totalHours, 0),
            avg_monthly_hours: toNumber(summary.avg_monthly_hours ?? summary.avgMonthlyHours, 0),
            avg_hours_per_person: toNumber(summary.avg_hours_per_person ?? summary.avgHoursPerPerson, 0),
            total_employees: toNumber(summary.total_employees ?? summary.totalEmployees, 0),
        },
    };
};

const normalizeWorkHoursData = (payload: any): WorkHoursData => {
    const raw = extractObjectPayload<any>(payload);
    const granularity = toStringValue(raw.granularity, 'day');
    return granularity === 'month'
        ? normalizeMonthViewData(raw)
        : normalizeDayViewData(raw);
};

const normalizeDailyAssignments = (payload: any): DailyAssignmentsData => {
    const raw = extractObjectPayload<any>(payload);

    return {
        date: toStringValue(raw.date, ''),
        batches: extractArrayPayload<any>(raw.batches)
            .filter(isRecord)
            .map((batch) => ({
                batch_id: toNumber(batch.batch_id ?? batch.batchId, 0),
                batch_code: toStringValue(batch.batch_code ?? batch.batchCode, ''),
                stages: extractArrayPayload<any>(batch.stages)
                    .filter(isRecord)
                    .map((stage) => ({
                        stage_id: toNumber(stage.stage_id ?? stage.stageId, 0),
                        stage_name: toStringValue(stage.stage_name ?? stage.stageName, ''),
                        operations: extractArrayPayload<any>(stage.operations)
                            .filter(isRecord)
                            .map((op) => ({
                                operation_plan_id: toNumber(op.operation_plan_id ?? op.operationPlanId, 0),
                                operation_name: toStringValue(op.operation_name ?? op.operationName, ''),
                                start_time: toStringValue(op.start_time ?? op.startTime, ''),
                                end_time: toStringValue(op.end_time ?? op.endTime, ''),
                                required_people: toNumber(op.required_people ?? op.requiredPeople, 0),
                                assignments: extractArrayPayload<any>(op.assignments)
                                    .filter(isRecord)
                                    .map((assignment) => ({
                                        position: toNumber(assignment.position, 0),
                                        employee_name: assignment.employee_name ?? assignment.employeeName ?? null,
                                    })),
                            })),
                    })),
            })),
    };
};

export const dashboardService = {
    // Options
    getOrgOptions: async (): Promise<DepartmentOption[]> => {
        try {
            const treeData = await organizationStructureApi.getTree();
            const payload = extractObjectPayload<any>(treeData);
            const units = extractArrayPayload<any>(payload.units ?? payload.tree ?? treeData);
            return normalizeDepartmentOptions(units);
        } catch (error) {
            console.error('Failed to load org tree:', error);
            return [];
        }
    },

    getShiftOptions: async (): Promise<ShiftOption[]> => {
        const res = await axios.get(`${API_BASE}/dashboard/shifts`);
        return normalizeShiftOptions(res.data);
    },

    // Data
    getManpowerCurve: async (
        yearMonth: string,
        orgPath: number[] = [],
        shiftId?: number
    ): Promise<ManpowerCurveData> => {
        const params: any = { year_month: yearMonth };

        if (orgPath && orgPath.length > 0) {
            // The Cascader returns the full path (e.g., [DeptId, TeamId, GroupId]).
            // The actual selected node is always the last element.
            // We pass it to the backend as `unit_id` and let the backend figure out its type.
            params.unit_id = orgPath[orgPath.length - 1];
        }

        if (shiftId) {
            params.shift_id = shiftId;
        }

        const res = await axios.get(`${API_BASE}/dashboard/manpower-curve`, { params });
        return normalizeManpowerCurve(res.data);
    },

    getWorkHoursCurve: async (
        granularity: 'day' | 'month',
        dateOrRange: string | [string, string],
        orgPath: number[] = []
    ): Promise<WorkHoursData> => {
        const params: any = { granularity };

        if (granularity === 'day') {
            params.year_month = dateOrRange as string;
        } else {
            const [start, end] = dateOrRange as [string, string];
            params.start_month = start;
            params.end_month = end;
        }

        if (orgPath && orgPath.length > 0) {
            params.unit_id = orgPath[orgPath.length - 1];
        }

        const res = await axios.get(`${API_BASE}/dashboard/work-hours-curve`, { params });
        return normalizeWorkHoursData(res.data);
    },

    getDailyAssignments: async (date: string): Promise<DailyAssignmentsData> => {
        const res = await axios.get(`${API_BASE}/dashboard/daily-assignments`, {
            params: { date },
        });
        return normalizeDailyAssignments(res.data);
    }
};
