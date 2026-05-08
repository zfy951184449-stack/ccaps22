import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import type { Campaign, CampaignBatch } from '../../domain/aps/campaignTypes';
import { mapCampaignBatchRow, mapCampaignRow } from '../../mappers/aps/CampaignMapper';

const pad = (value: number): string => String(value).padStart(2, '0');

const toMysqlDateTime = (value: string): string => {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('CAMPAIGN_INVALID_DATETIME');
  }
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export interface AttachCampaignBatchInput {
  campaignId: number;
  batchPlanId: number;
  batchSequenceNo: number;
  batchCode: string;
  plannedScaleLiters?: number | null;
  recipeSnapshotId?: number | null;
}

export class CampaignService {
  static async createCampaign(input: {
    campaignCode: string;
    campaignName: string;
    productId: number;
    recipeVersionId: number;
    plannedStart: string;
    plannedEnd: string;
    siteCode?: string | null;
    buildingCode?: string | null;
    suiteGroupCode?: string | null;
    targetBatchCount?: number | null;
    changeoverPolicy?: string | null;
    createdBy?: number | null;
  }): Promise<Campaign> {
    if (new Date(input.plannedStart).getTime() >= new Date(input.plannedEnd).getTime()) {
      throw new Error('CAMPAIGN_INVALID_PLANNING_WINDOW');
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO campaigns
        (campaign_code, campaign_name, product_id, recipe_version_id, site_code, building_code,
         suite_group_code, target_batch_count, planned_start, planned_end, changeover_policy, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.campaignCode,
        input.campaignName,
        input.productId,
        input.recipeVersionId,
        input.siteCode ?? null,
        input.buildingCode ?? null,
        input.suiteGroupCode ?? null,
        input.targetBatchCount ?? null,
        toMysqlDateTime(input.plannedStart),
        toMysqlDateTime(input.plannedEnd),
        input.changeoverPolicy ?? null,
        input.createdBy ?? null,
      ],
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM campaigns WHERE id = ?`,
      [result.insertId],
    );
    return mapCampaignRow(rows[0]);
  }

  static async attachBatch(input: AttachCampaignBatchInput): Promise<CampaignBatch> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO campaign_batches
        (campaign_id, batch_plan_id, batch_sequence_no, batch_code, planned_scale_liters, recipe_snapshot_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.campaignId,
        input.batchPlanId,
        input.batchSequenceNo,
        input.batchCode,
        input.plannedScaleLiters ?? null,
        input.recipeSnapshotId ?? null,
      ],
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM campaign_batches WHERE id = ?`,
      [result.insertId],
    );
    return mapCampaignBatchRow(rows[0]);
  }

  static async listCampaignBatches(campaignId: number): Promise<CampaignBatch[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT *
       FROM campaign_batches
       WHERE campaign_id = ?
       ORDER BY batch_sequence_no, id`,
      [campaignId],
    );
    return rows.map(mapCampaignBatchRow);
  }
}
