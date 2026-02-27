
// Basic structures matching backend response
export interface ShiftBreakdown {
    shift_code: string;
    shift_name: string;
    has_operation: boolean;
    count: number;
}

export interface DailyData {
    date: string;
    available_count: number;
    demand_count: number;
    gap: number;
    is_weekend: boolean;
    is_workday: boolean;
    holiday_type: string;
    holiday_name: string | null;
    salary_multiplier: number | null;
    shift_breakdown: ShiftBreakdown[];
}

export interface ManpowerCurveData {
    total_headcount: number;
    daily_data: DailyData[];
    summary: {
        avg_gap: string;
        max_gap: number;
        max_gap_date: string;
        sufficiency_rate: number;
        gap_days: number;
    };
}

export interface DailyBatchData {
    date: string;
    batch_id: number;
    batch_code: string;
    work_hours: number;
}

export interface TotalDailyData {
    date: string;
    work_hours: number;
}

export interface BatchInfo {
    batch_id: number;
    batch_code: string;
}

export interface DayViewData {
    granularity: 'day';
    daily_data: DailyBatchData[];
    total_by_date: TotalDailyData[];
    batches: BatchInfo[];
    summary: {
        total_hours: number;
        avg_daily_hours: number;
        peak_hours: number;
        peak_date: string;
        batch_count: number;
    };
}

export interface MonthlyDataItem {
    year_month: string;
    month_label: string;
    total_hours: number;
    hours_per_person: number;
    peak_daily_hours: number;
    peak_date: string;
    batch_breakdown: { batch_code: string; work_hours: number }[];
}

export interface MonthViewData {
    granularity: 'month';
    monthly_data: MonthlyDataItem[];
    summary: {
        total_hours: number;
        avg_monthly_hours: number;
        avg_hours_per_person: number;
        total_employees: number;
    };
}

export type WorkHoursData = DayViewData | MonthViewData;

export interface Assignment {
    position: number;
    employee_name: string | null;
}

export interface Operation {
    operation_plan_id: number;
    operation_name: string;
    start_time: string;
    end_time: string;
    required_people: number;
    assignments: Assignment[];
}

export interface Stage {
    stage_id: number;
    stage_name: string;
    operations: Operation[];
}

export interface BatchData {
    batch_id: number;
    batch_code: string;
    stages: Stage[];
}

export interface DailyAssignmentsData {
    date: string;
    batches: BatchData[];
}

// Option types
export interface DepartmentOption {
    value: number;
    label: string;
    children?: DepartmentOption[];
}

export interface ShiftOption {
    id: number;
    shift_code: string;
    shift_name: string;
}
