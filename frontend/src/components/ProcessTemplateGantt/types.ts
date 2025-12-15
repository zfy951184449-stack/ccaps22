import { ConstraintValidationResult, ConstraintConflict } from '../../types';

export interface ProcessTemplate {
    id: number;
    template_code: string;
    template_name: string;
    description: string;
    total_days: number;
}

export interface ProcessStage {
    id: number;
    template_id: number;
    stage_code: string;
    stage_name: string;
    stage_order: number;
    start_day: number;
    description?: string;
}

export interface StageOperation {
    id: number;
    stage_id: number;
    operation_id: number;
    operation_code: string;
    operation_name: string;
    operation_day: number;
    recommended_time: number;
    recommended_day_offset?: number;
    window_start_time: number;
    window_start_day_offset?: number;
    window_end_time: number;
    window_end_day_offset?: number;
    operation_order: number;
    standard_time?: number;
    required_people?: number;
}

export interface Operation {
    id: number;
    operation_code: string;
    operation_name: string;
    standard_time: number;
    required_people: number;
    description?: string;
}

export interface Constraint {
    constraint_id?: number;
    related_schedule_id: number;
    related_operation_name: string;
    related_operation_code: string;
    constraint_type: number;
    lag_time: number;
    lag_type?: 'ASAP' | 'FIXED' | 'WINDOW' | 'NEXT_DAY' | 'NEXT_SHIFT' | 'COOLING' | 'BATCH_END';
    lag_min?: number;
    lag_max?: number | null;
    share_mode?: 'NONE' | 'SAME_TEAM' | 'DIFFERENT';
    constraint_name?: string;
    constraint_level?: number;
    description?: string;
    relation_type: 'predecessor' | 'successor';
}

export interface ShareGroupMember {
    id: number;
    schedule_id: number;
    operation_name: string;
    required_people: number;
    stage_name: string;
}

export interface ShareGroup {
    id: number;
    group_code: string;
    group_name: string;
    share_mode: 'SAME_TEAM' | 'DIFFERENT';
    description?: string;
    color?: string;
    operation_count?: number;
    priority?: number;
    members?: ShareGroupMember[];
}

export interface GanttConstraint {
    constraint_id: number;
    from_schedule_id: number;
    from_operation_id: number;
    from_operation_name: string;
    from_operation_code: string;
    to_schedule_id: number;
    to_operation_id: number;
    to_operation_name: string;
    to_operation_code: string;
    constraint_type: number;
    lag_time: number;
    share_mode?: 'NONE' | 'SAME_TEAM' | 'DIFFERENT';
    constraint_level?: number;
    constraint_name?: string;
    from_stage_name: string;
    to_stage_name: string;
    from_operation_day: number;
    from_recommended_time: number;
    to_operation_day: number;
    to_recommended_time: number;
    from_stage_start_day: number;
    to_stage_start_day: number;
}

export interface ProcessTemplateGanttProps {
    template: ProcessTemplate;
    onBack: () => void;

    // 批次模式：使用外部数据而非从 API 加载
    externalData?: {
        ganttNodes: GanttNode[];
        startDay: number;
        endDay: number;
        baseDate?: string; // ISO 日期字符串，用于显示实际日期而非 day 数字
    };

    // 操作点击回调（用于批次模式的人员分配）
    onOperationClick?: (operationId: number, operationData: StageOperation) => void;

    // 自定义拖动结束处理
    onCustomDragEnd?: (
        scheduleId: number,
        stageId: number,
        updates: Partial<{
            operation_day: number;
            recommended_time: number;
            window_start_time: number;
            window_start_day_offset: number;
            window_end_time: number;
            window_end_day_offset: number;
        }>
    ) => Promise<void>;

    // 是否隐藏编辑功能（批次模式下可能需要）
    readOnly?: boolean;

    // 只读操作集合（ACTIVATED 状态的批次操作禁止拖拽）
    readOnlyOperations?: Set<string>;

    // 批次模式：外部控制保存状态
    externalIsDirty?: boolean;
    onExternalSave?: () => Promise<void>;

    // 批次模式：外部约束数据
    externalConstraints?: GanttConstraint[];
}

export interface GanttNode {
    id: string;
    title: string;
    type: 'template' | 'stage' | 'operation';
    parent_id?: string;
    stage_code?: string;
    standard_time?: number;
    required_people?: number;
    start_day?: number;
    start_hour?: number;
    children?: GanttNode[];
    expanded?: boolean;
    editable?: boolean;
    level?: number;
    data?: ProcessStage | StageOperation;
}

export interface TimeBlock {
    id: string;
    node_id: string;
    title: string;
    start_hour: number;
    duration_hours: number;
    color: string;
    isTimeWindow?: boolean;
    isRecommended?: boolean;
    isStage?: boolean;
}

export interface FlattenedRow {
    id: string;
    node: GanttNode;
    depth: number;
    hasChildren: boolean;
    isExpanded: boolean;
    parentId?: string;
}

export type { ConstraintValidationResult, ConstraintConflict };
