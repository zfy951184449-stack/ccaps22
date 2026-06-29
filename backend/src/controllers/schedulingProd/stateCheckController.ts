/**
 * 设备状态机·保持窗检测端点(规划期,P1 模板版)。
 *
 * 读 ps_sm_template(模板)+ ps_sm_transition(模板转移规则,带默认时序)+ 设备类型/设备/管线的
 * sm_template_id 绑定 → 解析每个清洗对象的「有效模板 + 有效保持窗(设备覆盖 ?? 模板默认)」→
 * 连同请求带来的、已 placement 定时的状态操作,调引擎走状态机检出超期。引擎不碰 DB。
 *
 * 注:真实操作时间线由上游 placement 产出,本期尚未接入;与 cip-peak 一致,操作暂由请求体外部提供。
 */
import type { Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database';
import {
  assembleStateCheckRequest,
  buildEngineTransitions,
  buildStateObjects,
  type PsEquipmentStateRow,
  type PsEquipmentTypeRow,
  type PsTemplateRow,
  type PsTransitionRow,
  type StateOpInput,
} from '../../services/schedulingProd/ProdDataAssembler';
import { callStateCheck } from '../../services/schedulingProd/prodSchedulerClient';

interface StateCheckBody {
  facilityCode?: string;
  origin?: string;
  dayHours?: number;
  operations?: Array<{
    opId?: string;
    op_id?: string;
    objectCode?: string;
    object_code?: string;
    action?: string;
    startHour?: number;
    start_hour?: number;
    endHour?: number;
    end_hour?: number;
    durationHours?: number;
    duration_hours?: number;
  }>;
}

function normalizeOps(raw: StateCheckBody['operations']): StateOpInput[] {
  return (raw || []).map((o, i) => {
    const start = Number(o.startHour ?? o.start_hour ?? 0);
    const end =
      o.endHour ?? o.end_hour ?? (o.durationHours != null || o.duration_hours != null
        ? start + Number(o.durationHours ?? o.duration_hours)
        : start);
    return {
      opId: String(o.opId ?? o.op_id ?? `op-${i}`),
      objectCode: String(o.objectCode ?? o.object_code ?? ''),
      action: String(o.action ?? ''),
      startHour: start,
      endHour: Number(end),
    };
  });
}

export async function postStateCheck(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body || {}) as StateCheckBody;
    const facility = body.facilityCode ? String(body.facilityCode) : null;
    const ops = normalizeOps(body.operations);

    const where = facility ? ' WHERE facility_code = ?' : '';
    const params = facility ? [facility] : [];

    const [templates] = await pool.execute<RowDataPacket[]>('SELECT id, code, name FROM ps_sm_template');
    const [transRows] = await pool.execute<RowDataPacket[]>(
      'SELECT template_id, attribute, from_state, action, to_state, duration_minutes, duration_col, start_within_hours, start_within_col, produces_validity_hours, produces_validity_col, requires_json FROM ps_sm_transition',
    );
    const [types] = await pool.execute<RowDataPacket[]>('SELECT id, name, sm_template_id FROM ps_equipment_type');
    const [equipment] = await pool.execute<RowDataPacket[]>(
      `SELECT code, type_name, sm_template_id, cip_duration_minutes, rip_duration_minutes, sip_duration_minutes, dht_hours, rht_hours, cht_hours, sht_hours FROM ps_cip_equipment${where}`,
      params,
    );
    const [pipelines] = await pool.execute<RowDataPacket[]>(
      `SELECT code, sm_template_id, cip_duration_minutes, rip_duration_minutes, sip_duration_minutes, dht_hours, rht_hours, cht_hours, sht_hours FROM ps_pipeline${where}`,
      params,
    );

    const tpl = templates as unknown as PsTemplateRow[];
    const trans = transRows as unknown as PsTransitionRow[];
    const objects = buildStateObjects(
      equipment as unknown as PsEquipmentStateRow[],
      pipelines as unknown as PsEquipmentStateRow[],
      types as unknown as PsEquipmentTypeRow[],
      tpl,
      trans,
    );
    const engineTransitions = buildEngineTransitions(tpl, trans);

    const request = assembleStateCheckRequest(objects, ops, engineTransitions, {
      dayHours: body.dayHours,
      origin: body.origin,
    });

    const engine = await callStateCheck(request);

    res.json({
      success: true,
      data: {
        ...engine,
        topology: {
          templates: tpl.length,
          transitions: trans.length,
          equipment: equipment.length,
          pipelines: pipelines.length,
          bound_objects: objects.length,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}
