export type ScenarioType = 'BASELINE' | 'WHAT_IF' | 'RECOVERY' | 'RELEASE_CANDIDATE';

export type ScenarioStatus = 'DRAFT' | 'CHECKED' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

export interface ApsScenario {
  id: number;
  scenarioCode: string;
  scenarioName: string;
  scenarioType: ScenarioType;
  sourceScenarioId: number | null;
  planningHorizonStart: string;
  planningHorizonEnd: string;
  scenarioStatus: ScenarioStatus;
  reasonCode: string | null;
  reasonText: string | null;
  createdBy: number | null;
  approvedBy: number | null;
  publishedBy: number | null;
  createdAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
  updatedAt?: string;
}

export interface CreateScenarioInput {
  scenarioCode: string;
  scenarioName: string;
  scenarioType: ScenarioType;
  sourceScenarioId?: number | null;
  planningHorizonStart: string;
  planningHorizonEnd: string;
  reasonCode?: string | null;
  reasonText?: string | null;
  createdBy?: number | null;
}

export interface CloneScenarioInput {
  scenarioCode: string;
  scenarioName: string;
  scenarioType?: Exclude<ScenarioType, 'BASELINE'>;
  reasonCode?: string | null;
  reasonText?: string | null;
  createdBy?: number | null;
}

export interface ScenarioListFilters {
  scenarioStatus?: ScenarioStatus;
  scenarioType?: ScenarioType;
  horizonStart?: string;
  horizonEnd?: string;
}
