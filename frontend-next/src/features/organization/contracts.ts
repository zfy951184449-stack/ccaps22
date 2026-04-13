import { z } from "zod";

// ─── Organization tree schemas ───────────────────────────────────
// Canonical source: features/qualifications/contracts.ts
// We re-import to keep a single definition and avoid drift.
import {
  organizationUnitNodeSchema,
  organizationHierarchyResponseSchema,
} from "@/features/qualifications/contracts";

export {
  organizationUnitNodeSchema,
  organizationHierarchyResponseSchema,
};

export type {
  OrganizationUnitNode,
  OrganizationHierarchyResponse,
} from "@/features/qualifications/contracts";

// ─── Employee ────────────────────────────────────────────────────

export const employeeSchema = z.object({
  id: z.number(),
  employee_code: z.string(),
  employee_name: z.string(),
  department_id: z.number().nullable(),
  department_name: z.string().nullable(),
  primary_team_id: z.number().nullable(),
  primary_team_name: z.string().nullable(),
  unit_id: z.number().nullable(),
  unit_name: z.string().nullable(),
  primary_role_id: z.number().nullable(),
  primary_role_name: z.string().nullable(),
  employment_status: z.string(),
  shopfloor_baseline_pct: z.number().nullable().optional(),
  shopfloor_upper_pct: z.number().nullable().optional(),
  hire_date: z.string().nullable().optional(),
  org_role: z.string(),
  qualifications: z.array(z.string()),
});

export const employeesResponseSchema = z.array(employeeSchema);

export type Employee = z.infer<typeof employeeSchema>;

// ─── Employee Role ───────────────────────────────────────────────

export const employeeRoleSchema = z.object({
  id: z.number(),
  role_code: z.string(),
  role_name: z.string(),
});

export const employeeRolesResponseSchema = z.array(employeeRoleSchema);

export type EmployeeRole = z.infer<typeof employeeRoleSchema>;

// ─── Employee Assignment ─────────────────────────────────────────

export const employeeAssignmentSchema = z.object({
  id: z.number(),
  employeeId: z.number(),
  teamId: z.number(),
  roleId: z.number(),
  isPrimary: z.number(),
  teamName: z.string(),
  roleName: z.string(),
});

export const employeeAssignmentsResponseSchema = z.array(employeeAssignmentSchema);

export type EmployeeAssignment = z.infer<typeof employeeAssignmentSchema>;

// ─── Employee Mutation ───────────────────────────────────────────

export const employeeMutationSchema = z.object({
  employeeName: z.string().trim().min(1, "姓名不能为空"),
  primaryRoleId: z.number().nullable().optional(),
  employmentStatus: z.string().optional(),
  hireDate: z.string().nullable().optional(),
  unitId: z.number().nullable().optional(),
});

export type EmployeeMutationPayload = z.infer<typeof employeeMutationSchema>;

// ─── Organization Unit Mutation ──────────────────────────────────

export const unitMutationSchema = z.object({
  unit_name: z.string().trim().min(1, "单元名称不能为空"),
  unit_type: z.enum(["DEPARTMENT", "TEAM", "GROUP", "SHIFT"]),
  parent_id: z.number().nullable().optional(),
  unit_code: z.string().optional(),
  sort_order: z.number().optional(),
});

export type UnitMutationPayload = z.infer<typeof unitMutationSchema>;

// ─── Unavailability ──────────────────────────────────────────────

export const unavailabilityRecordSchema = z.object({
  id: z.number(),
  employeeId: z.number(),
  employeeName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  reasonCode: z.string(),
  reasonLabel: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const unavailabilityResponseSchema = z.array(unavailabilityRecordSchema);

export type UnavailabilityRecord = z.infer<typeof unavailabilityRecordSchema>;

export const unavailabilityMutationSchema = z.object({
  employeeId: z.number({ error: "请选择员工" }),
  startDatetime: z.string().min(1, "起始日期不能为空"),
  endDatetime: z.string().min(1, "结束日期不能为空"),
  reasonCode: z.enum(["AL", "SL", "PL", "OT"], {
    message: "请选择原因",
  }),
  notes: z.string().optional(),
});

export type UnavailabilityMutationPayload = z.infer<typeof unavailabilityMutationSchema>;

// ─── Tab type ────────────────────────────────────────────────────

export const organizationWorkbenchTabSchema = z.enum(["employees", "unavailability"]);
export type OrganizationWorkbenchTab = z.infer<typeof organizationWorkbenchTabSchema>;
