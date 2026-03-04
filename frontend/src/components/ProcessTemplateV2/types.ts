import { Resource } from '../../types/platform';
import { ResourceRequirementRule } from '../ProcessTemplateGantt/types';

export interface TeamSummary {
  id: number;
  unit_code?: string;
  unit_name: string;
}

export interface TemplateSummary {
  id: number;
  template_code: string;
  template_name: string;
  team_id: number | null;
  team_code: string | null;
  team_name: string | null;
  description: string;
  total_days: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateStageSummary {
  id: number;
  template_id: number;
  stage_code: string;
  stage_name: string;
  stage_order: number;
  start_day: number;
  description?: string | null;
  operation_count?: number;
}

export type ResourceNodeClass = 'SUITE' | 'ROOM' | 'EQUIPMENT' | 'COMPONENT' | 'GROUP';
export type TemplateBindingStatus =
  | 'BOUND'
  | 'UNBOUND'
  | 'INVALID_NODE'
  | 'NODE_INACTIVE'
  | 'RESOURCE_UNBOUND'
  | 'RESOURCE_INACTIVE'
  | 'RESOURCE_RULE_MISMATCH';

export interface ResourceNode {
  id: number;
  nodeCode: string;
  nodeName: string;
  nodeClass: ResourceNodeClass;
  parentId: number | null;
  departmentCode: string;
  ownerOrgUnitId: number | null;
  ownerUnitName: string | null;
  ownerUnitCode: string | null;
  boundResourceId: number | null;
  boundResourceCode: string | null;
  boundResourceName: string | null;
  boundResourceType: string | null;
  boundResourceStatus: string | null;
  boundResourceIsSchedulable: boolean;
  sortOrder: number;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  childCount: number;
  children: ResourceNode[];
}

export interface PlannerOperation {
  id: number;
  stage_id: number;
  operation_id: number;
  operation_code: string;
  operation_name: string;
  operation_day: number;
  recommended_time: number;
  recommended_day_offset?: number;
  window_start_time?: number;
  window_start_day_offset?: number;
  window_end_time?: number;
  window_end_day_offset?: number;
  operation_order: number;
  standard_time?: number;
  required_people?: number;
  operation_description?: string | null;
  stage_name: string;
  stage_order: number;
  stage_start_day: number;
  resource_rule_source_scope?: string;
  resource_requirements?: ResourceRequirementRule[];
  resource_summary?: string | null;
  defaultResourceNodeId: number | null;
  defaultResourceNodeName: string | null;
  defaultResourceId: number | null;
  defaultResourceCode: string | null;
  bindingStatus: TemplateBindingStatus;
  bindingReason: string | null;
}

export interface TemplateResourcePlannerMetrics {
  totalOperations: number;
  boundOperations: number;
  unboundOperations: number;
  invalidBindings: number;
  resourceNodeCount: number;
}

export interface TemplateResourcePlannerResponse {
  template: TemplateSummary;
  stages: TemplateStageSummary[];
  operations: PlannerOperation[];
  resourceTree: ResourceNode[];
  metrics: TemplateResourcePlannerMetrics;
  warnings: string[];
}

export interface ResourceNodePayload {
  nodeCode?: string;
  nodeName: string;
  nodeClass: ResourceNodeClass;
  parentId?: number | null;
  departmentCode: string;
  ownerOrgUnitId?: number | null;
  boundResourceId?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface ResourceNodeMovePayload {
  parentId: number | null;
  sortOrder?: number;
}

export interface TemplateResourceBindingResponse {
  templateScheduleId: number;
  binding: {
    id: number;
    templateScheduleId: number;
    resourceNodeId: number;
    bindingMode: 'DEFAULT';
    status: TemplateBindingStatus;
    reason: string | null;
    node: ResourceNode | null;
  } | null;
}

export interface ResourceNodeImpact {
  operationCount: number;
  operations: PlannerOperation[];
}

export interface ResourceNodeTreeOption {
  value: number;
  title: string;
  disabled?: boolean;
  children?: ResourceNodeTreeOption[];
}

export interface PendingBindingItem {
  operation: PlannerOperation;
  suggestedNodes: ResourceNode[];
}

export type ResourceNodeFilterScope = 'referenced' | 'team' | 'all';

export interface TemplateEditorState {
  template: TemplateSummary;
  teams: TeamSummary[];
  resources: Resource[];
}
