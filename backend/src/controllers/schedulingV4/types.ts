/**
 * Scheduling V4 - Type Definitions & Constants
 */
import { EventEmitter } from 'events';

// In-memory event emitter for real-time progress broadcasting
export const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(100);

// V4 Solver Service URL
export const SOLVER_V4_URL = process.env.SOLVER_V4_URL || 'http://localhost:5005';

export interface EnrichedAssignment {
    operation_plan_id: number;
    operation_name: string;
    batch_code: string;
    position_number: number;
    employee_id: number;
    employee_name: string;
    employee_code: string;
    planned_start: string | Date;
    planned_end: string | Date;
}

export interface ResultSummaryV4 {
    metrics: {
        completion_rate: number;
        coverage_rate: number;
        satisfaction: number;
        solve_time: number;
        special_shift_requirement_count?: number;
        special_shift_occurrence_count?: number;
        special_shift_required_headcount_total?: number;
        special_shift_assigned_headcount_total?: number;
        special_shift_shortage_total?: number;
        special_shift_unmet_occurrence_count?: number;
        special_shift_partial_occurrence_count?: number;
    };
    details: {
        total_positions: number;
        assigned_positions: number;
        total_operations: number;
        covered_operations: number;
    };
    assignments: EnrichedAssignment[];
    shift_schedule: ShiftScheduleItem[] | null;
    operations?: any[];
    special_shift_assignments?: SpecialShiftSolverAssignment[];
    special_shift_shortages?: SpecialShiftSolverShortage[];
}

export interface ShiftScheduleItem {
    employee_id: number;
    date: string;
    shift_id: number;
}

export interface FlattenedAssignment {
    operation_id: number;
    position_number: number;
    employee_id: number;
    is_standalone: boolean;
    date?: string;
    shift_id?: number;
}

export type ShiftPlanCategory = 'BASE' | 'PRODUCTION' | 'OVERTIME' | 'REST';

export interface SpecialShiftRunRequirement {
    occurrence_id: number;
    window_id: number;
    window_code?: string;
    date: string;
    shift_id: number;
    required_people: number;
    eligible_employee_ids: number[];
    fulfillment_mode: 'HARD' | 'SOFT';
    priority_level: 'CRITICAL' | 'HIGH' | 'NORMAL';
    candidates?: Array<{
        employee_id: number;
        impact_cost: number;
    }>;
    plan_category: 'BASE' | 'OVERTIME';
    lock_after_apply?: boolean;
}

export interface SpecialShiftSolverAssignment {
    occurrence_id: number;
    employee_id: number;
    date: string;
    shift_id: number;
}

export interface SpecialShiftSolverShortage {
    occurrence_id: number;
    shortage_people: number;
}

export interface ShiftDefinitionInfo {
    code: string;
    hours: number;
    category: string;
}
