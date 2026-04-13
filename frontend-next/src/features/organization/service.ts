import { apiFetch } from "@/services/http/client";
import {
  employeeAssignmentsResponseSchema,
  employeeMutationSchema,
  employeeRolesResponseSchema,
  employeesResponseSchema,
  unavailabilityMutationSchema,
  unavailabilityResponseSchema,
  unitMutationSchema,
  type EmployeeMutationPayload,
  type UnavailabilityMutationPayload,
  type UnitMutationPayload,
} from "./contracts";
import { organizationHierarchyResponseSchema } from "@/features/qualifications/contracts";

// ─── Query keys ──────────────────────────────────────────────────

export const organizationQueryKeys = {
  tree: ["organization", "tree"] as const,
  employees: ["organization", "employees"] as const,
  employeeRoles: ["organization", "employee-roles"] as const,
  employeeAssignments: (employeeId: number) =>
    ["organization", "employee-assignments", employeeId] as const,
  unavailability: (unitId: number | null) =>
    ["organization", "unavailability", unitId] as const,
};

// ─── Tree ────────────────────────────────────────────────────────

export async function getOrganizationTree() {
  return apiFetch("org-structure/tree", {
    schema: organizationHierarchyResponseSchema,
  });
}

// ─── Employees ───────────────────────────────────────────────────

export async function getEmployees() {
  return apiFetch("employees", {
    schema: employeesResponseSchema,
  });
}

export async function getEmployeeRoles() {
  return apiFetch("employees/roles", {
    schema: employeeRolesResponseSchema,
  });
}

export async function updateEmployee(
  employeeId: number,
  payload: EmployeeMutationPayload,
) {
  const parsed = employeeMutationSchema.parse(payload);
  return apiFetch(`employees/${employeeId}`, {
    body: JSON.stringify(parsed),
    method: "PUT",
  });
}

export async function deleteEmployee(employeeId: number) {
  await apiFetch(`employees/${employeeId}`, { method: "DELETE" });
  return null;
}

export async function getEmployeeAssignments(employeeId: number) {
  return apiFetch(`employees/${employeeId}/assignments`, {
    schema: employeeAssignmentsResponseSchema,
  });
}

// ─── Organization Units ──────────────────────────────────────────

export async function createUnit(payload: UnitMutationPayload) {
  const parsed = unitMutationSchema.parse(payload);
  return apiFetch("org-structure/units", {
    body: JSON.stringify(parsed),
    method: "POST",
  });
}

export async function deleteUnit(unitId: number) {
  await apiFetch(`org-structure/units/${unitId}`, { method: "DELETE" });
  return null;
}

// ─── Unavailability ──────────────────────────────────────────────

export async function getUnavailability(unitId?: number | null) {
  const params = new URLSearchParams();
  if (unitId != null) {
    params.set("unitId", String(unitId));
  }
  const query = params.toString();
  return apiFetch(`unavailability${query ? `?${query}` : ""}`, {
    schema: unavailabilityResponseSchema,
  });
}

export async function createUnavailability(
  payload: UnavailabilityMutationPayload,
) {
  const parsed = unavailabilityMutationSchema.parse(payload);
  return apiFetch("unavailability", {
    body: JSON.stringify(parsed),
    method: "POST",
  });
}

export async function updateUnavailability(
  id: number,
  payload: UnavailabilityMutationPayload,
) {
  const parsed = unavailabilityMutationSchema.parse(payload);
  return apiFetch(`unavailability/${id}`, {
    body: JSON.stringify(parsed),
    method: "PUT",
  });
}

export async function deleteUnavailability(id: number) {
  await apiFetch(`unavailability/${id}`, { method: "DELETE" });
  return null;
}
