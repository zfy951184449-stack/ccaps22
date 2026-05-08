export type CampaignStatus = 'DRAFT' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
export type CampaignBatchStatus = 'PLANNED' | 'SCHEDULED' | 'PUBLISHED' | 'CANCELLED';

export interface Campaign {
  id: number;
  campaignCode: string;
  campaignName: string;
  productId: number;
  recipeVersionId: number;
  siteCode: string | null;
  buildingCode: string | null;
  suiteGroupCode: string | null;
  targetBatchCount: number | null;
  plannedStart: string;
  plannedEnd: string;
  campaignStatus: CampaignStatus;
  changeoverPolicy: string | null;
  createdBy: number | null;
  approvedBy: number | null;
  publishedBy: number | null;
  createdAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface CreateCampaignInput {
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
}

export interface CampaignBatch {
  id: number;
  campaignId: number;
  batchPlanId: number;
  batchSequenceNo: number;
  batchCode: string;
  plannedScaleLiters: number | null;
  recipeSnapshotId: number | null;
  batchStatus: CampaignBatchStatus;
  createdAt: string;
  updatedAt: string;
}
