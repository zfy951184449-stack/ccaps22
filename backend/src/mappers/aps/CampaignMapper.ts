import type { RowDataPacket } from 'mysql2/promise';
import type { Campaign, CampaignBatch } from '../../domain/aps/campaignTypes';

const nullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const nullableString = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

export const mapCampaignRow = (row: RowDataPacket): Campaign => ({
  id: Number(row.id),
  campaignCode: String(row.campaign_code),
  campaignName: String(row.campaign_name),
  productId: Number(row.product_id),
  recipeVersionId: Number(row.recipe_version_id),
  siteCode: nullableString(row.site_code),
  buildingCode: nullableString(row.building_code),
  suiteGroupCode: nullableString(row.suite_group_code),
  targetBatchCount: nullableNumber(row.target_batch_count),
  plannedStart: String(row.planned_start),
  plannedEnd: String(row.planned_end),
  campaignStatus: row.campaign_status,
  changeoverPolicy: nullableString(row.changeover_policy),
  createdBy: nullableNumber(row.created_by),
  approvedBy: nullableNumber(row.approved_by),
  publishedBy: nullableNumber(row.published_by),
  createdAt: String(row.created_at),
  approvedAt: nullableString(row.approved_at),
  publishedAt: nullableString(row.published_at),
  updatedAt: String(row.updated_at),
});

export const mapCampaignBatchRow = (row: RowDataPacket): CampaignBatch => ({
  id: Number(row.id),
  campaignId: Number(row.campaign_id),
  batchPlanId: Number(row.batch_plan_id),
  batchSequenceNo: Number(row.batch_sequence_no),
  batchCode: String(row.batch_code),
  plannedScaleLiters: nullableNumber(row.planned_scale_liters),
  recipeSnapshotId: nullableNumber(row.recipe_snapshot_id),
  batchStatus: row.batch_status,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});
