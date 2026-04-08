/* ── Process Template Gantt – Type Definitions ─────────────────────── */

// ── Operating Mode ──────────────────────────────────────────────────

export type GanttMode = "template" | "batch";

// ── Domain Entities ─────────────────────────────────────────────────

export interface ProcessTemplate {
  id: number;
  templateCode: string;
  templateName: string;
  description: string | null;
  totalDays: number;
  teamId?: number | null;
  teamCode?: string | null;
  teamName?: string | null;
}

export interface ProcessStage {
  id: number;
  templateId: number;
  stageCode: string;
  stageName: string;
  stageOrder: number;
  startDay: number;
  description?: string | null;
}

export interface StageOperation {
  id: number;
  stageId: number;
  operationId: number;
  operationCode: string;
  operationName: string;
  operationDay: number;
  recommendedTime: number;
  recommendedDayOffset?: number;
  windowStartTime: number;
  windowStartDayOffset?: number;
  windowEndTime: number;
  windowEndDayOffset?: number;
  operationOrder: number;
  standardTime?: number;
  requiredPeople?: number;
  resourceRuleSourceScope?: ResourceRuleSourceScope | null;
  resourceRequirements?: ResourceRequirementRule[];
  resourceSummary?: string | null;
}

export type ResourceRuleSourceScope =
  | "GLOBAL_DEFAULT"
  | "TEMPLATE_OVERRIDE"
  | "BATCH_OVERRIDE"
  | "NONE";

export interface ResourceRequirementRule {
  id: number | null;
  resourceType:
    | "ROOM"
    | "EQUIPMENT"
    | "VESSEL_CONTAINER"
    | "TOOLING"
    | "STERILIZATION_RESOURCE";
  requiredCount: number;
  isMandatory: boolean;
  requiresExclusiveUse: boolean;
  prepMinutes: number;
  changeoverMinutes: number;
  cleanupMinutes: number;
  candidateResourceIds: number[];
  candidateResources: ResourceCandidateSummary[];
}

export interface ResourceCandidateSummary {
  id: number;
  resourceCode: string;
  resourceName: string;
  resourceType: string;
}

export interface Operation {
  id: number;
  operationCode: string;
  operationName: string;
  standardTime: number;
  requiredPeople: number;
  description?: string | null;
}

// ── Constraints ─────────────────────────────────────────────────────

export interface GanttConstraint {
  constraintId: number;
  fromScheduleId: number;
  fromOperationId: number;
  fromOperationName: string;
  fromOperationCode: string;
  toScheduleId: number;
  toOperationId: number;
  toOperationName: string;
  toOperationCode: string;
  constraintType: number;
  lagTime: number;
  shareMode?: "NONE" | "SAME_TEAM" | "DIFFERENT";
  constraintLevel?: number;
  constraintName?: string | null;
  fromStageName: string;
  toStageName: string;
  fromOperationDay: number;
  fromRecommendedTime: number;
  toOperationDay: number;
  toRecommendedTime: number;
  fromStageStartDay: number;
  toStageStartDay: number;
}

export interface OperationConstraint {
  constraintId?: number;
  relatedScheduleId: number;
  relatedOperationName: string;
  relatedOperationCode: string;
  constraintType: number;
  lagTime: number;
  lagType?:
    | "ASAP"
    | "FIXED"
    | "WINDOW"
    | "NEXT_DAY"
    | "NEXT_SHIFT"
    | "COOLING"
    | "BATCH_END";
  lagMin?: number;
  lagMax?: number | null;
  shareMode?: "NONE" | "SAME_TEAM" | "DIFFERENT";
  constraintName?: string;
  constraintLevel?: number;
  description?: string;
  relationType: "predecessor" | "successor";
}

// ── Share Groups ────────────────────────────────────────────────────

export interface ShareGroupMember {
  id: number;
  scheduleId: number;
  operationName: string;
  requiredPeople: number;
  stageName: string;
}

export interface ShareGroup {
  id: number;
  templateId: number;
  groupCode: string;
  groupName: string;
  shareMode: "SAME_TEAM" | "DIFFERENT";
  description?: string | null;
  color?: string | null;
  operationCount?: number;
  priority?: number;
  members?: ShareGroupMember[];
}

// ── Gantt Visual Model ──────────────────────────────────────────────

export interface GanttNode {
  id: string;
  title: string;
  type: "template" | "stage" | "operation";
  parentId?: string;
  stageCode?: string;
  standardTime?: number;
  requiredPeople?: number;
  startDay?: number;
  startHour?: number;
  children?: GanttNode[];
  expanded?: boolean;
  editable?: boolean;
  level?: number;
  data?: ProcessStage | StageOperation;
}

export interface TimeBlock {
  id: string;
  nodeId: string;
  title: string;
  startHour: number;
  durationHours: number;
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

// ── Share Link (visual) ─────────────────────────────────────────────

export interface ShareLink {
  constraintId: number;
  fromScheduleId: number;
  toScheduleId: number;
  shareMode: "SAME_TEAM" | "DIFFERENT";
}

// ── Validation ──────────────────────────────────────────────────────

export interface ConstraintConflict {
  constraintIds: number[];
  operationScheduleIds: number[];
  message: string;
  severity: "error" | "warning";
}

export interface ConstraintValidationResult {
  isValid: boolean;
  conflicts: ConstraintConflict[];
}

// ── Schedule Conflict ───────────────────────────────────────────────

export interface ScheduleConflict {
  scheduleId: number;
  conflictType: string;
  message: string;
}

// ── Component Props ─────────────────────────────────────────────────

export interface ProcessTemplateGanttProps {
  /** Operating mode */
  mode: GanttMode;
  /** Template being edited (template mode) or displayed (batch mode) */
  template: ProcessTemplate;
  /** Navigate back to template list */
  onBack: () => void;
  /** External Gantt data for batch mode */
  externalData?: {
    ganttNodes: GanttNode[];
    startDay: number;
    endDay: number;
    baseDate?: string;
  };
  /** Callback when an operation is clicked in batch mode */
  onOperationClick?: (
    operationId: number,
    operationData: StageOperation,
  ) => void;
  /** Custom drag-end handler for batch mode */
  onCustomDragEnd?: (
    scheduleId: number,
    stageId: number,
    updates: Partial<{
      operationDay: number;
      recommendedTime: number;
      windowStartTime: number;
      windowStartDayOffset: number;
      windowEndTime: number;
      windowEndDayOffset: number;
    }>,
  ) => Promise<void>;
  /** Suppress editing controls */
  readOnly?: boolean;
  /** IDs of operations that cannot be dragged */
  readOnlyOperations?: Set<string>;
  /** External dirty state for batch mode */
  externalIsDirty?: boolean;
  /** External save handler for batch mode */
  onExternalSave?: () => Promise<void>;
  /** External constraints for batch mode */
  externalConstraints?: GanttConstraint[];
  /** External share groups for batch mode */
  externalShareGroups?: ShareGroup[];
}

// ── Gantt Constants (co-located with types for import convenience) ──

export const STAGE_COLORS: Record<string, string> = {
  STAGE1: "#2563EB",
  STAGE2: "#0F766E",
  STAGE3: "#D97706",
  STAGE4: "#B91C1C",
  STAGE5: "#7C3AED",
  DEFAULT: "#475569",
};

export const GANTT_LAYOUT = {
  baseHourWidth: 8,
  headerHeight: 40,
  titleBarHeight: 64,
  contentGap: 16,
  leftPanelWidth: 360,
  rowHeight: 32,
} as const;
