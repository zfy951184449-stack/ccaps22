/* ── Resource API Service ─────────────────────────────────────────────
 *
 * API calls for resources, resource nodes, and operation-resource bindings.
 * Directly connects to backend, consistent with process-template-api.ts pattern.
 */

import { apiFetch } from "@/services/http/client";
import { z } from "zod";

// ── Schemas ─────────────────────────────────────────────────────────

const resourceSchema = z
  .object({
    id: z.coerce.number(),
    resource_code: z.string(),
    resource_name: z.string(),
    resource_type: z.string(),
    team_id: z.coerce.number().nullable().optional(),
    team_name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .transform((d) => ({
    id: d.id,
    resourceCode: d.resource_code,
    resourceName: d.resource_name,
    resourceType: d.resource_type,
    teamId: d.team_id,
    teamName: d.team_name,
    description: d.description,
  }));

export type Resource = z.infer<typeof resourceSchema>;

const bindingSchema = z
  .object({
    template_schedule_id: z.coerce.number(),
    binding: z
      .object({
        resource_node_id: z.coerce.number(),
        resource_node_name: z.string().optional(),
      })
      .nullable()
      .optional(),
  })
  .transform((d) => ({
    templateScheduleId: d.template_schedule_id,
    resourceNodeId: d.binding?.resource_node_id ?? null,
    resourceNodeName: d.binding?.resource_node_name ?? null,
  }));

export type ResourceBinding = z.infer<typeof bindingSchema>;

// ── API Calls ───────────────────────────────────────────────────────

export async function listResources() {
  return apiFetch(`/resources`, {
    schema: z.array(resourceSchema),
  });
}

export async function getResourceById(resourceId: number) {
  return apiFetch(`/resources/${resourceId}`, {
    schema: resourceSchema,
  });
}

export async function getOperationResourceBinding(scheduleId: number) {
  return apiFetch(`/template-stage-operations/${scheduleId}/resource-binding`, {
    schema: bindingSchema,
  });
}

export async function updateOperationResourceBinding(
  scheduleId: number,
  resourceNodeId: number | null,
) {
  return apiFetch(`/template-stage-operations/${scheduleId}/resource-binding`, {
    method: "PUT",
    body: JSON.stringify({ resource_node_id: resourceNodeId }),
  });
}
