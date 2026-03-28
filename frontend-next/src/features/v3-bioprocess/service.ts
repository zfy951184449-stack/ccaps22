import { apiFetch } from "@/services/http/client";
import {
  legacyResourceListResponseSchema,
  legacyResourceNodeListResponseSchema,
  maintenanceWindowListResponseSchema,
  mutationMessageResponseSchema,
  v3MasterSyncResponseSchema,
  v3MasterSyncStatusSchema,
  v3ProjectionPreviewRequestSchema,
  v3ProjectionPreviewResponseSchema,
  v3TemplateDetailSchema,
  v3TemplateListResponseSchema,
  type LegacyResource,
  type LegacyResourceNode,
  type V3ProjectionPreviewRequest,
} from "./contracts";

function unwrapCollection<T>(
  payload: T[] | { data: T[]; warnings?: string[] },
): T[] {
  return Array.isArray(payload) ? payload : payload.data;
}

export const v3BioprocessQueryKeys = {
  maintenanceWindows: (resourceId: number | null) =>
    ["v3-bioprocess", "maintenance-windows", resourceId] as const,
  preview: (request: V3ProjectionPreviewRequest) =>
    [
      "v3-bioprocess",
      "preview",
      request.template_id,
      request.planned_start_datetime,
      request.horizon_days,
      request.equipment_codes?.join(",") ?? "",
      request.visible_equipment_codes?.join(",") ?? "",
      JSON.stringify(request.draft_node_bindings ?? []),
      JSON.stringify(request.draft_main_operation_overrides ?? []),
      JSON.stringify(request.draft_state_segments ?? []),
      request.persist_run,
    ] as const,
  resourceNodes: ["v3-bioprocess", "resource-nodes"] as const,
  resources: ["v3-bioprocess", "resources"] as const,
  syncStatus: ["v3-bioprocess", "sync-status"] as const,
  templateDetail: (templateId: number | null) =>
    ["v3-bioprocess", "template-detail", templateId] as const,
  templates: ["v3-bioprocess", "templates"] as const,
};

export async function getV3Templates() {
  return apiFetch("v3/bioprocess/templates", {
    schema: v3TemplateListResponseSchema,
  });
}

export async function getV3TemplateDetail(templateId: number) {
  return apiFetch(`v3/bioprocess/templates/${templateId}`, {
    schema: v3TemplateDetailSchema,
  });
}

export async function getV3SyncStatus() {
  return apiFetch("v3/bioprocess/master-data/sync-status", {
    schema: v3MasterSyncStatusSchema,
  });
}

export async function syncV3MasterData() {
  return apiFetch("v3/bioprocess/master-data/sync", {
    method: "POST",
    schema: v3MasterSyncResponseSchema,
  });
}

export async function previewV3Projection(
  request: V3ProjectionPreviewRequest,
) {
  const payload = v3ProjectionPreviewRequestSchema.parse(request);

  return apiFetch("v3/bioprocess/projections/preview", {
    method: "POST",
    body: JSON.stringify(payload),
    schema: v3ProjectionPreviewResponseSchema,
  });
}

export async function getLegacyResources(params?: {
  department_code?: string;
  is_schedulable?: boolean;
  status?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.department_code) {
    searchParams.set("department_code", params.department_code);
  }
  if (params?.status) {
    searchParams.set("status", params.status);
  }
  if (params?.is_schedulable !== undefined) {
    searchParams.set("is_schedulable", params.is_schedulable ? "1" : "0");
  }

  const payload = await apiFetch(
    `resources${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    {
      schema: legacyResourceListResponseSchema,
    },
  );

  return unwrapCollection<LegacyResource>(payload);
}

export async function createLegacyResource(payload: {
  resource_code: string;
  resource_name: string;
  resource_type: string;
  department_code?: string;
  status?: string;
  location?: string;
  clean_level?: string;
}) {
  return apiFetch("resources", {
    method: "POST",
    body: JSON.stringify(payload),
    schema: mutationMessageResponseSchema,
  });
}

export async function getLegacyResourceNodes() {
  const payload = await apiFetch("resource-nodes?tree=false&include_inactive=1", {
    schema: legacyResourceNodeListResponseSchema,
  });

  return unwrapCollection<LegacyResourceNode>(payload);
}

export async function updateLegacyResourceNode(
  nodeId: number,
  payload: Record<string, unknown>,
) {
  return apiFetch(`resource-nodes/${nodeId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    schema: mutationMessageResponseSchema,
  });
}

export async function getMaintenanceWindows(resourceId: number | null) {
  if (!resourceId) {
    return [];
  }

  return apiFetch(`maintenance-windows?resource_id=${resourceId}`, {
    schema: maintenanceWindowListResponseSchema,
  });
}
