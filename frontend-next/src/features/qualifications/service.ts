import { ApiError, apiFetch } from "@/services/http/client";
import {
  organizationHierarchyResponseSchema,
  qualificationDeleteBlockedSchema,
  qualificationImpactSchema,
  qualificationMatrixAssignmentMutationSchema,
  qualificationMatrixResponseSchema,
  qualificationShortageMonitoringResponseSchema,
  qualificationMutationSchema,
  qualificationOverviewResponseSchema,
  qualificationRecordSchema,
  qualificationShortageResponseSchema,
  type QualificationImpact,
  type QualificationMatrixAssignmentMutationPayload,
  type QualificationMutationPayload,
  type QualificationShortageMode,
} from "./contracts";

export const qualificationQueryKeys = {
  impact: (qualificationId: number) =>
    ["qualifications", "impact", qualificationId] as const,
  matrix: ["qualifications", "matrix"] as const,
  monitoring: (
    mode: QualificationShortageMode,
    yearMonth: string | null,
    months: number,
  ) => ["qualifications", "shortages", "monitoring", mode, yearMonth, months] as const,
  organizationTree: ["qualifications", "organization-tree"] as const,
  overview: ["qualifications", "overview"] as const,
  shortages: (
    mode: QualificationShortageMode,
    yearMonth: string | null,
  ) => ["qualifications", "shortages", mode, yearMonth] as const,
};

export async function getQualificationsOverview() {
  return apiFetch("qualifications/overview", {
    schema: qualificationOverviewResponseSchema,
  });
}

export async function getQualificationImpact(qualificationId: number) {
  return apiFetch(`qualifications/${qualificationId}/impact`, {
    schema: qualificationImpactSchema,
  });
}

export async function getQualificationMatrix() {
  return apiFetch("qualifications/matrix", {
    schema: qualificationMatrixResponseSchema,
  });
}

export async function getQualificationOrganizationTree() {
  return apiFetch("org-structure/tree", {
    schema: organizationHierarchyResponseSchema,
  });
}

export async function getQualificationShortages(options: {
  mode: QualificationShortageMode;
  yearMonth: string | null;
}) {
  const params = new URLSearchParams();
  params.set("mode", options.mode);

  if (options.mode === "current_month" && options.yearMonth) {
    params.set("year_month", options.yearMonth);
  }

  return apiFetch(`qualifications/shortages?${params.toString()}`, {
    schema: qualificationShortageResponseSchema,
  });
}

export async function getQualificationShortageMonitoring(options: {
  mode: QualificationShortageMode;
  yearMonth: string | null;
  months?: number;
}) {
  const params = new URLSearchParams();
  params.set("mode", options.mode);
  params.set("months", String(options.months ?? 6));

  if (options.yearMonth) {
    params.set("year_month", options.yearMonth);
  }

  return apiFetch(`qualifications/shortages/monitoring?${params.toString()}`, {
    schema: qualificationShortageMonitoringResponseSchema,
  });
}

export async function createQualification(payload: QualificationMutationPayload) {
  const parsedPayload = qualificationMutationSchema.parse(payload);

  return apiFetch("qualifications", {
    body: JSON.stringify(parsedPayload),
    method: "POST",
    schema: qualificationRecordSchema,
  });
}

export async function updateQualification(
  qualificationId: number,
  payload: QualificationMutationPayload,
) {
  const parsedPayload = qualificationMutationSchema.parse(payload);

  return apiFetch(`qualifications/${qualificationId}`, {
    body: JSON.stringify(parsedPayload),
    method: "PUT",
    schema: qualificationRecordSchema,
  });
}

export async function deleteQualification(qualificationId: number) {
  try {
    await apiFetch(`qualifications/${qualificationId}`, {
      method: "DELETE",
    });
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const parsedPayload = qualificationDeleteBlockedSchema.safeParse(error.payload);
      if (parsedPayload.success) {
        throw new QualificationDeleteBlockedError(
          parsedPayload.data.message,
          parsedPayload.data.impact,
        );
      }
    }

    throw error;
  }
}

export async function createEmployeeQualificationAssignment(
  payload: QualificationMatrixAssignmentMutationPayload,
) {
  const parsedPayload = qualificationMatrixAssignmentMutationSchema.parse(payload);

  return apiFetch("employee-qualifications", {
    body: JSON.stringify(parsedPayload),
    method: "POST",
  });
}

export async function updateEmployeeQualificationAssignment(
  assignmentId: number,
  payload: QualificationMatrixAssignmentMutationPayload,
) {
  const parsedPayload = qualificationMatrixAssignmentMutationSchema.parse(payload);

  return apiFetch(`employee-qualifications/${assignmentId}`, {
    body: JSON.stringify(parsedPayload),
    method: "PUT",
  });
}

export async function deleteEmployeeQualificationAssignment(assignmentId: number) {
  await apiFetch(`employee-qualifications/${assignmentId}`, {
    method: "DELETE",
  });

  return null;
}

export class QualificationDeleteBlockedError extends Error {
  constructor(
    message: string,
    public readonly impact: QualificationImpact,
  ) {
    super(message);
    this.name = "QualificationDeleteBlockedError";
  }
}
