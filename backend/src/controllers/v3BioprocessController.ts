import { Request, Response } from 'express';
import {
  getV3TemplateDetail,
  getV3MasterSyncStatus,
  isV3SchemaUnavailableError,
  listV3Templates,
  previewV3Projection,
  syncLegacyMasterDataToV3,
} from '../services/v3BioprocessService';

function handleV3Error(res: Response, error: unknown, fallbackMessage: string) {
  if (isV3SchemaUnavailableError(error)) {
    return res.status(409).json({
      error: 'V3 schema unavailable',
      message: error.message,
    });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return res.status(500).json({
    error: fallbackMessage,
    message,
  });
}

export async function getV3Templates(req: Request, res: Response) {
  try {
    const templates = await listV3Templates();
    return res.json({ data: templates });
  } catch (error) {
    console.error('Failed to list V3 templates:', error);
    return handleV3Error(res, error, 'Failed to list V3 templates');
  }
}

export async function getV3TemplateById(req: Request, res: Response) {
  try {
    const templateId = Number(req.params.templateId);
    if (!Number.isFinite(templateId)) {
      return res.status(400).json({
        error: 'Invalid template id',
        message: 'templateId must be a number',
      });
    }

    const template = await getV3TemplateDetail(templateId);
    if (!template) {
      return res.status(404).json({
        error: 'Template not found',
        message: `V3 template ${templateId} was not found`,
      });
    }

    return res.json(template);
  } catch (error) {
    console.error('Failed to fetch V3 template detail:', error);
    return handleV3Error(res, error, 'Failed to fetch V3 template detail');
  }
}

export async function getV3SyncStatus(req: Request, res: Response) {
  try {
    const status = await getV3MasterSyncStatus();
    return res.json(status);
  } catch (error) {
    console.error('Failed to read V3 sync status:', error);
    return handleV3Error(res, error, 'Failed to read V3 sync status');
  }
}

export async function postV3Sync(req: Request, res: Response) {
  try {
    const result = await syncLegacyMasterDataToV3();
    return res.status(201).json(result);
  } catch (error) {
    console.error('Failed to sync V3 master data:', error);
    return handleV3Error(res, error, 'Failed to sync V3 master data');
  }
}

export async function postV3ProjectionPreview(req: Request, res: Response) {
  try {
    const preview = await previewV3Projection({
      template_id: Number(req.body.template_id),
      planned_start_datetime: String(req.body.planned_start_datetime ?? ''),
      horizon_days:
        req.body.horizon_days === undefined ? undefined : Number(req.body.horizon_days),
      equipment_codes: Array.isArray(req.body.equipment_codes)
        ? req.body.equipment_codes.map(String)
        : undefined,
      visible_equipment_codes: Array.isArray(req.body.visible_equipment_codes)
        ? req.body.visible_equipment_codes.map(String)
        : undefined,
      draft_state_segments: Array.isArray(req.body.draft_state_segments)
        ? req.body.draft_state_segments.map((segment: Record<string, unknown>) => ({
            segment_key:
              typeof segment.segment_key === 'string' ? segment.segment_key : undefined,
            equipment_code: String(segment.equipment_code ?? ''),
            equipment_mode:
              typeof segment.equipment_mode === 'string'
                ? segment.equipment_mode
                : undefined,
            state_code: String(segment.state_code ?? ''),
            start_datetime: String(segment.start_datetime ?? ''),
            end_datetime: String(segment.end_datetime ?? ''),
            locked: Boolean(segment.locked),
            metadata:
              segment.metadata && typeof segment.metadata === 'object'
                ? (segment.metadata as Record<string, unknown>)
                : undefined,
          }))
        : undefined,
      draft_node_bindings: Array.isArray(req.body.draft_node_bindings)
        ? req.body.draft_node_bindings.map((binding: Record<string, unknown>) => ({
            node_key: String(binding.node_key ?? ''),
            equipment_code:
              binding.equipment_code === null || binding.equipment_code === undefined
                ? null
                : String(binding.equipment_code),
            equipment_mode:
              typeof binding.equipment_mode === 'string'
                ? binding.equipment_mode
                : undefined,
          }))
        : undefined,
      draft_main_operation_overrides: Array.isArray(req.body.draft_main_operation_overrides)
        ? req.body.draft_main_operation_overrides.map((override: Record<string, unknown>) => ({
            node_key: String(override.node_key ?? ''),
            start_datetime: String(override.start_datetime ?? ''),
          }))
        : undefined,
      persist_run:
        req.body.persist_run === undefined ? false : Boolean(req.body.persist_run),
    });

    return res.json(preview);
  } catch (error) {
    if (error instanceof Error && /required|not found|Invalid datetime/i.test(error.message)) {
      return res.status(400).json({
        error: 'Invalid preview request',
        message: error.message,
      });
    }

    console.error('Failed to preview V3 projection:', error);
    return handleV3Error(res, error, 'Failed to preview V3 projection');
  }
}
