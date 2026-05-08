import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import type {
  ApsScenario,
  CloneScenarioInput,
  CreateScenarioInput,
  ScenarioListFilters,
  ScenarioStatus,
} from '../../domain/aps/scenarioTypes';
import { mapScenarioRow } from '../../mappers/aps/ScenarioMapper';
import { StatusTransitionService } from '../governance/StatusTransitionService';

const assertHorizon = (start: string, end: string): void => {
  if (new Date(start).getTime() >= new Date(end).getTime()) {
    throw new Error('APS_SCENARIO_INVALID_HORIZON');
  }
};

const pad = (value: number): string => String(value).padStart(2, '0');

const toMysqlDateTime = (value: string): string => {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('APS_INVALID_DATETIME');
  }
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const STATUS_TRANSITIONS: Record<ScenarioStatus, ScenarioStatus[]> = {
  DRAFT: ['CHECKED', 'ARCHIVED'],
  CHECKED: ['APPROVED', 'ARCHIVED'],
  APPROVED: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export class ScenarioService {
  static async createScenario(input: CreateScenarioInput): Promise<ApsScenario> {
    assertHorizon(input.planningHorizonStart, input.planningHorizonEnd);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO aps_scenarios
          (scenario_code, scenario_name, scenario_type, source_scenario_id,
           planning_horizon_start, planning_horizon_end, reason_code, reason_text, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.scenarioCode,
          input.scenarioName,
          input.scenarioType,
          input.sourceScenarioId ?? null,
          toMysqlDateTime(input.planningHorizonStart),
          toMysqlDateTime(input.planningHorizonEnd),
          input.reasonCode ?? null,
          input.reasonText ?? null,
          input.createdBy ?? null,
        ],
      );

      await StatusTransitionService.recordTransition(
        {
          entityType: 'aps_scenario',
          entityId: result.insertId,
          fromStatus: null,
          toStatus: 'DRAFT',
          transitionCode: 'APS_SCENARIO_CREATED',
          transitionReason: input.reasonText ?? null,
          actorUserId: input.createdBy ?? null,
        },
        connection,
      );

      await connection.commit();
      return (await this.getScenario(result.insertId))!;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async cloneScenario(sourceScenarioId: number, input: CloneScenarioInput): Promise<ApsScenario> {
    const source = await this.getScenario(sourceScenarioId);
    if (!source) {
      throw new Error('APS_SOURCE_SCENARIO_NOT_FOUND');
    }

    return this.createScenario({
      scenarioCode: input.scenarioCode,
      scenarioName: input.scenarioName,
      scenarioType: input.scenarioType ?? 'WHAT_IF',
      sourceScenarioId,
      planningHorizonStart: source.planningHorizonStart,
      planningHorizonEnd: source.planningHorizonEnd,
      reasonCode: input.reasonCode ?? null,
      reasonText: input.reasonText ?? null,
      createdBy: input.createdBy ?? null,
    });
  }

  static async transitionScenarioStatus(
    scenarioId: number,
    toStatus: ScenarioStatus,
    options: { actorUserId?: number | null; reasonText?: string | null } = {},
  ): Promise<ApsScenario> {
    const scenario = await this.getScenario(scenarioId);
    if (!scenario) {
      throw new Error('APS_SCENARIO_NOT_FOUND');
    }

    if (!STATUS_TRANSITIONS[scenario.scenarioStatus].includes(toStatus)) {
      throw new Error(`APS_SCENARIO_INVALID_TRANSITION:${scenario.scenarioStatus}->${toStatus}`);
    }

    const fields: string[] = ['scenario_status = ?'];
    const params: any[] = [toStatus];

    if (toStatus === 'APPROVED') {
      fields.push('approved_by = ?', 'approved_at = NOW()');
      params.push(options.actorUserId ?? null);
    }
    if (toStatus === 'PUBLISHED') {
      fields.push('published_by = ?', 'published_at = NOW()');
      params.push(options.actorUserId ?? null);
    }

    params.push(scenarioId);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(`UPDATE aps_scenarios SET ${fields.join(', ')} WHERE id = ?`, params);
      await StatusTransitionService.recordTransition(
        {
          entityType: 'aps_scenario',
          entityId: scenarioId,
          fromStatus: scenario.scenarioStatus,
          toStatus,
          transitionCode: `APS_SCENARIO_${toStatus}`,
          transitionReason: options.reasonText ?? null,
          actorUserId: options.actorUserId ?? null,
        },
        connection,
      );
      await connection.commit();
      return (await this.getScenario(scenarioId))!;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getScenario(scenarioId: number): Promise<ApsScenario | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM aps_scenarios WHERE id = ? LIMIT 1`,
      [scenarioId],
    );
    return rows.length ? mapScenarioRow(rows[0]) : null;
  }

  static async listScenarios(filters: ScenarioListFilters = {}): Promise<ApsScenario[]> {
    const clauses: string[] = [];
    const params: any[] = [];

    if (filters.scenarioStatus) {
      clauses.push('scenario_status = ?');
      params.push(filters.scenarioStatus);
    }
    if (filters.scenarioType) {
      clauses.push('scenario_type = ?');
      params.push(filters.scenarioType);
    }
    if (filters.horizonStart) {
      clauses.push('planning_horizon_end >= ?');
      params.push(filters.horizonStart);
    }
    if (filters.horizonEnd) {
      clauses.push('planning_horizon_start <= ?');
      params.push(filters.horizonEnd);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM aps_scenarios ${where} ORDER BY created_at DESC, id DESC`,
      params,
    );
    return rows.map(mapScenarioRow);
  }
}
