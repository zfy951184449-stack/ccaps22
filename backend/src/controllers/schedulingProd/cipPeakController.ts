/**
 * CIP 容量尖峰分析端点:读 ps_* 拓扑 → 把每道 CIP 操作解析到它清洗对象归属的站 → 调引擎并发扫描。
 *
 * 清洗对象 = 设备 或 管线,各自直接归属一个 CIP 站。空拓扑时操作全 unresolved、引擎峰值 0(预期)。
 */
import type { Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database';
import {
  assembleCipPeakRequest,
  buildTopologyIndex,
  type CipOperationInput,
  type PsCipEquipmentRow,
  type PsCipStationRow,
  type PsPipelineRow,
} from '../../services/schedulingProd/ProdDataAssembler';
import { callCipPeak } from '../../services/schedulingProd/prodSchedulerClient';

interface CipPeakBody {
  facilityCode?: string;
  origin?: string;
  dayHours?: number;
  operations?: Array<{
    opId?: string;
    op_id?: string;
    objectCode?: string;
    object_code?: string;
    equipmentCode?: string;
    equipment_code?: string;
    startHour?: number;
    start_hour?: number;
    durationHours?: number;
    duration_hours?: number;
  }>;
}

function normalizeOps(raw: CipPeakBody['operations']): CipOperationInput[] {
  return (raw || []).map((o, i) => ({
    opId: String(o.opId ?? o.op_id ?? `op-${i}`),
    objectCode: String(o.objectCode ?? o.object_code ?? o.equipmentCode ?? o.equipment_code ?? ''),
    startHour: Number(o.startHour ?? o.start_hour ?? 0),
    durationHours: Number(o.durationHours ?? o.duration_hours ?? 0),
  }));
}

export async function postCipPeak(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body || {}) as CipPeakBody;
    const facility = body.facilityCode ? String(body.facilityCode) : null;
    const ops = normalizeOps(body.operations);

    const where = facility ? ' WHERE facility_code = ?' : '';
    const params = facility ? [facility] : [];

    const [stations] = await pool.execute<RowDataPacket[]>(
      `SELECT id, code, name, capacity FROM ps_cip_station${where}`,
      params,
    );
    const [equipment] = await pool.execute<RowDataPacket[]>(
      `SELECT id, code, name, type, cip_station_id FROM ps_cip_equipment${where}`,
      params,
    );
    const [pipelines] = await pool.execute<RowDataPacket[]>(
      `SELECT id, code, name, from_equipment_id, to_equipment_id, cip_station_id FROM ps_pipeline${where}`,
      params,
    );

    const index = buildTopologyIndex(
      stations as unknown as PsCipStationRow[],
      equipment as unknown as PsCipEquipmentRow[],
      pipelines as unknown as PsPipelineRow[],
    );

    const { request, unresolved } = assembleCipPeakRequest(ops, index, {
      dayHours: body.dayHours,
      origin: body.origin,
    });

    const engine = await callCipPeak(request);

    res.json({
      success: true,
      data: {
        ...engine,
        unresolved,
        topology: { stations: stations.length, equipment: equipment.length, pipelines: pipelines.length },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}
