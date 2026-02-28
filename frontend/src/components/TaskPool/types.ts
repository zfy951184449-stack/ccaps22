export type TaskType = 'FLEXIBLE' | 'RECURRING' | 'AD_HOC';
export type TaskStatus = 'PENDING' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface StandaloneTask {
    id: number;
    task_code: string;
    task_name: string;
    task_type: TaskType;
    required_people: number;
    duration_minutes: number;
    team_id?: number;
    team_name?: string;
    earliest_start?: string;
    deadline: string;
    preferred_shift_ids?: number[];
    related_batch_id?: number;
    trigger_operation_plan_id?: number;
    batch_offset_days?: number;
    operation_id?: number;
    recurrence_rule?: any;
    status: TaskStatus;
    created_at: string;
    updated_at: string;
    qualifications?: StandaloneTaskQualification[];
}

export interface StandaloneTaskQualification {
    id?: number;
    task_id?: number;
    position_number: number;
    qualification_id: number;
    qualification_name?: string;
    min_level: number;
    is_mandatory: boolean;
}
