import { z } from "zod";

export const qualificationUsageStateSchema = z.enum([
  "UNUSED",
  "EMPLOYEE_ONLY",
  "OPERATION_ONLY",
  "MIXED",
]);

export const qualificationShortageModeSchema = z.enum([
  "current_month",
  "all_activated",
]);

export const organizationUnitTypeSchema = z.enum([
  "DEPARTMENT",
  "TEAM",
  "GROUP",
  "SHIFT",
]);

type OrganizationUnitTypeValue = z.infer<typeof organizationUnitTypeSchema>;

type OrganizationUnitNodeShape = {
  id: number;
  parentId: number | null;
  unitType: OrganizationUnitTypeValue;
  unitCode: string | null;
  unitName: string;
  defaultShiftCode: string | null;
  sortOrder: number;
  isActive: boolean;
  memberCount: number;
  children: OrganizationUnitNodeShape[];
};

export const qualificationRecordSchema = z.object({
  id: z.number(),
  qualification_name: z.string(),
});

export const qualificationMatrixEmployeeSchema = z.object({
  id: z.number(),
  employee_code: z.string(),
  employee_name: z.string(),
  department: z.string(),
  position: z.string(),
  unit_id: z.number().nullable(),
  unit_name: z.string(),
});

export const organizationUnitNodeSchema: z.ZodType<OrganizationUnitNodeShape> = z.lazy(() =>
  z.object({
    id: z.number(),
    parentId: z.number().nullable(),
    unitType: organizationUnitTypeSchema,
    unitCode: z.string().nullable(),
    unitName: z.string(),
    defaultShiftCode: z.string().nullable(),
    sortOrder: z.number(),
    isActive: z.boolean(),
    memberCount: z.number(),
    children: z.array(organizationUnitNodeSchema),
  }),
);

export const organizationHierarchyResponseSchema = z.object({
  stats: z.object({
    emptyLeadershipNodes: z.number(),
    orphanUnits: z.number(),
    totalLeaders: z.number(),
    totalUnits: z.number(),
  }),
  unassignedEmployees: z.array(
    z.object({
      employeeCode: z.string(),
      employeeId: z.number(),
      employeeName: z.string(),
      employmentStatus: z.string(),
      orgRole: z.string(),
    }),
  ),
  units: z.array(organizationUnitNodeSchema),
});

export const qualificationMatrixAssignmentSchema = z.object({
  id: z.number(),
  employee_id: z.number(),
  qualification_id: z.number(),
  qualification_level: z.number().int().min(1).max(5),
});

export const qualificationMatrixResponseSchema = z.object({
  employees: z.array(qualificationMatrixEmployeeSchema),
  qualifications: z.array(qualificationRecordSchema),
  assignments: z.array(qualificationMatrixAssignmentSchema),
});

export const qualificationOverviewItemSchema = z.object({
  id: z.number(),
  qualification_name: z.string(),
  employee_binding_count: z.number(),
  operation_binding_count: z.number(),
  total_binding_count: z.number(),
  usage_state: qualificationUsageStateSchema,
  deletable: z.boolean(),
});

export const qualificationOverviewResponseSchema = z.object({
  totals: z.object({
    qualification_count: z.number(),
    in_use_count: z.number(),
    employee_binding_count: z.number(),
    operation_binding_count: z.number(),
  }),
  items: z.array(qualificationOverviewItemSchema),
});

export const qualificationImpactSchema = z.object({
  qualification: qualificationRecordSchema,
  counts: z.object({
    employees: z.number(),
    operations: z.number(),
  }),
  employee_refs: z.array(
    z.object({
      employee_id: z.number(),
      employee_code: z.string(),
      employee_name: z.string(),
    }),
  ),
  operation_refs: z.array(
    z.object({
      operation_id: z.number(),
      operation_code: z.string(),
      operation_name: z.string(),
    }),
  ),
  deletable: z.boolean(),
});

export const qualificationDeleteBlockedSchema = z.object({
  error: z.literal("QUALIFICATION_IN_USE"),
  message: z.string(),
  impact: qualificationImpactSchema,
});

export const qualificationShortageScoreBreakdownSchema = z.object({
  coverage_fragility: z.number(),
  coverage_fragility_score: z.number(),
  demand_scale_factor: z.number(),
  demand_scale_score: z.number(),
  gap_rate: z.number(),
  gap_rate_score: z.number(),
  gap_volume_factor: z.number(),
  gap_volume_score: z.number(),
  load_pressure_factor: z.number(),
  load_pressure_score: z.number(),
});

export const qualificationShortageRiskItemSchema = z.object({
  qualification_id: z.number(),
  qualification_name: z.string(),
  required_level: z.number().int().min(1).max(5),
  qualified_employee_count: z.number(),
  demand_hours: z.number(),
  demand_person_instances: z.number(),
  active_batch_count: z.number(),
  active_operation_count: z.number(),
  peak_required_people: z.number(),
  peak_gap_people: z.number(),
  gap_rate: z.number(),
  demand_hours_per_qualified_employee: z.number(),
  coverage_fragility: z.number(),
  risk_score: z.number(),
  score_breakdown: qualificationShortageScoreBreakdownSchema,
});

export const qualificationShortageQualificationItemSchema = z.object({
  qualification_id: z.number(),
  qualification_name: z.string(),
  demand_hours: z.number(),
  demand_person_instances: z.number(),
  active_batch_count: z.number(),
  active_operation_count: z.number(),
  worst_required_level: z.number().int().min(1).max(5),
  worst_peak_gap_people: z.number(),
  worst_risk_score: z.number(),
  level_breakdown: z.array(qualificationShortageRiskItemSchema),
});

export const qualificationShortageSummarySchema = z.object({
  mode: qualificationShortageModeSchema,
  year_month: z.string().nullable(),
  shortage_count: z.number(),
  high_risk_coverable_count: z.number(),
  total_demand_hours: z.number(),
  average_risk_score: z.number(),
  max_risk_score: z.number(),
  max_peak_gap: z.number(),
});

export const qualificationShortageResponseSchema = z.object({
  summary: qualificationShortageSummarySchema,
  risk_items: z.array(qualificationShortageRiskItemSchema),
  qualification_items: z.array(qualificationShortageQualificationItemSchema),
});

export const qualificationShortageHeatmapCellSchema = z.object({
  qualification_id: z.number(),
  qualification_name: z.string(),
  qualification_rank: z.number(),
  required_level: z.number().int().min(1).max(5),
  risk_score: z.number().nullable(),
  peak_gap_people: z.number().nullable(),
  demand_hours: z.number().nullable(),
});

export const qualificationShortageTrendPointSchema = z.object({
  year_month: z.string(),
  label: z.string(),
  shortage_count: z.number(),
  high_risk_coverable_count: z.number(),
  average_risk_score: z.number(),
  max_risk_score: z.number(),
  total_demand_hours: z.number(),
});

export const qualificationShortageMonitoringResponseSchema = z.object({
  summary: qualificationShortageSummarySchema,
  ranking: z.array(qualificationShortageRiskItemSchema),
  heatmap: z.array(qualificationShortageHeatmapCellSchema),
  trend: z.array(qualificationShortageTrendPointSchema),
});

export const qualificationMutationSchema = z.object({
  qualification_name: z
    .string()
    .trim()
    .min(2, "资质名称至少 2 个字符")
    .max(100, "资质名称不能超过 100 个字符"),
});

export const qualificationMatrixAssignmentMutationSchema = z.object({
  employee_id: z.number(),
  qualification_id: z.number(),
  qualification_level: z.number().int().min(1, "资质等级最低为 1 级").max(5, "资质等级最高为 5 级"),
});

export type QualificationUsageState = z.infer<typeof qualificationUsageStateSchema>;
export type QualificationShortageMode = z.infer<typeof qualificationShortageModeSchema>;
export type OrganizationUnitType = OrganizationUnitTypeValue;
export type QualificationRecord = z.infer<typeof qualificationRecordSchema>;
export type QualificationMatrixEmployee = z.infer<typeof qualificationMatrixEmployeeSchema>;
export type OrganizationUnitNode = OrganizationUnitNodeShape;
export type OrganizationHierarchyResponse = z.infer<
  typeof organizationHierarchyResponseSchema
>;
export type QualificationMatrixAssignment = z.infer<typeof qualificationMatrixAssignmentSchema>;
export type QualificationMatrixResponse = z.infer<typeof qualificationMatrixResponseSchema>;
export type QualificationOverviewItem = z.infer<typeof qualificationOverviewItemSchema>;
export type QualificationOverviewResponse = z.infer<typeof qualificationOverviewResponseSchema>;
export type QualificationImpact = z.infer<typeof qualificationImpactSchema>;
export type QualificationShortageScoreBreakdown = z.infer<
  typeof qualificationShortageScoreBreakdownSchema
>;
export type QualificationShortageRiskItem = z.infer<
  typeof qualificationShortageRiskItemSchema
>;
export type QualificationShortageQualificationItem = z.infer<
  typeof qualificationShortageQualificationItemSchema
>;
export type QualificationShortageSummary = z.infer<
  typeof qualificationShortageSummarySchema
>;
export type QualificationShortageResponse = z.infer<typeof qualificationShortageResponseSchema>;
export type QualificationShortageHeatmapCell = z.infer<
  typeof qualificationShortageHeatmapCellSchema
>;
export type QualificationShortageTrendPoint = z.infer<
  typeof qualificationShortageTrendPointSchema
>;
export type QualificationShortageMonitoringResponse = z.infer<
  typeof qualificationShortageMonitoringResponseSchema
>;
export type QualificationMutationPayload = z.infer<typeof qualificationMutationSchema>;
export type QualificationMatrixAssignmentMutationPayload = z.infer<
  typeof qualificationMatrixAssignmentMutationSchema
>;
