import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import type { ConstraintDefinition, SeedConstraintDefinitionInput } from '../../domain/aps/constraintTypes';

const INITIAL_CONSTRAINTS: SeedConstraintDefinitionInput[] = [
  {
    constraintCode: 'FLOW_OPERATION_DEPENDENCY',
    constraintName: 'Operation dependency violation',
    category: 'FLOW_WINDOW',
    hardOrSoftDefault: 'hard',
    defaultSeverity: 'critical',
    violationMessageTemplate:
      'Operation {successor} violates dependency from {predecessor}; expected window {expected_window}, actual {actual_window}.',
    suggestedActionTemplate: 'Adjust scenario timing or mark scenario infeasible; do not auto-shift silently.',
  },
  {
    constraintCode: 'FLOW_MAX_HOLD_EXCEEDED',
    constraintName: 'Maximum hold time exceeded',
    category: 'FLOW_WINDOW',
    hardOrSoftDefault: 'hard',
    defaultSeverity: 'critical',
    violationMessageTemplate: 'Hold time between {from_operation} and {to_operation} exceeds {max_hold}.',
    suggestedActionTemplate: 'Review batch timing, material/equipment hold state, or mark infeasible.',
  },
  {
    constraintCode: 'QUALITY_QC_EXTERNAL_STATUS_NOT_READY',
    constraintName: 'QC/QA external status not ready',
    category: 'QUALITY_GATE',
    hardOrSoftDefault: 'hard',
    defaultSeverity: 'critical',
    violationMessageTemplate:
      'Downstream operation {operation} has planning risk because external QC/QA status reference {gate} is not ready.',
    suggestedActionTemplate: 'Review external status reference or revise the planning scenario.',
  },
  {
    constraintCode: 'EQUIPMENT_NO_OVERLAP',
    constraintName: 'Equipment no-overlap violation',
    category: 'EQUIPMENT_STATE',
    hardOrSoftDefault: 'hard',
    defaultSeverity: 'critical',
    violationMessageTemplate: 'Resource {resource} is assigned to overlapping operations in scenario {scenario}.',
    suggestedActionTemplate: 'Select another resource or revise operation timing.',
  },
  {
    constraintCode: 'SPACE_SUITE_NO_OVERLAP',
    constraintName: 'Suite no-overlap violation',
    category: 'SPACE_SEGREGATION',
    hardOrSoftDefault: 'hard',
    defaultSeverity: 'critical',
    violationMessageTemplate: 'Suite {suite} has overlapping occupancy in scenario {scenario}.',
    suggestedActionTemplate: 'Resolve suite occupancy or split scenario.',
  },
  {
    constraintCode: 'WORKFORCE_SKILL_DEMAND_NOT_COVERED',
    constraintName: 'Skill demand not covered',
    category: 'WORKFORCE_COVERAGE',
    hardOrSoftDefault: 'hard',
    defaultSeverity: 'critical',
    violationMessageTemplate: 'Skill demand {skill} requires {required_count}; roster capacity is {available_count}.',
    suggestedActionTemplate: 'Request roster replan or revise APS scenario.',
  },
];

const mapConstraintRow = (row: RowDataPacket): ConstraintDefinition => ({
  id: Number(row.id),
  constraintCode: String(row.constraint_code),
  constraintName: String(row.constraint_name),
  category: row.category,
  hardOrSoftDefault: row.hard_or_soft_default,
  defaultSeverity: row.default_severity,
  violationMessageTemplate: String(row.violation_message_template),
  suggestedActionTemplate: row.suggested_action_template ?? null,
  ownerDomain: row.owner_domain,
  lifecycleStatus: row.lifecycle_status,
  effectiveFrom: String(row.effective_from),
  effectiveTo: row.effective_to ?? null,
  planningCriticality: row.planning_criticality,
  qualityRelevant: row.quality_relevant === 1 || row.quality_relevant === true,
  createdBy: row.created_by === null || row.created_by === undefined ? null : Number(row.created_by),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

export class ConstraintDefinitionService {
  static async seedInitialConstraints(): Promise<number> {
    let affectedRows = 0;
    for (const item of INITIAL_CONSTRAINTS) {
      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT IGNORE INTO constraint_definitions
          (constraint_code, constraint_name, category, hard_or_soft_default, default_severity,
           violation_message_template, suggested_action_template, owner_domain, lifecycle_status,
           planning_criticality, quality_relevant)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.constraintCode,
          item.constraintName,
          item.category,
          item.hardOrSoftDefault,
          item.defaultSeverity,
          item.violationMessageTemplate,
          item.suggestedActionTemplate ?? null,
          item.ownerDomain ?? 'APS',
          item.lifecycleStatus ?? 'ACTIVE',
          item.planningCriticality ?? 'HIGH',
          item.qualityRelevant === false ? 0 : 1,
        ],
      );
      affectedRows += result.affectedRows;
    }
    return affectedRows;
  }

  static async getByCode(constraintCode: string): Promise<ConstraintDefinition | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM constraint_definitions WHERE constraint_code = ? LIMIT 1`,
      [constraintCode],
    );
    return rows.length ? mapConstraintRow(rows[0]) : null;
  }

  static async listActiveConstraints(): Promise<ConstraintDefinition[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT *
       FROM constraint_definitions
       WHERE lifecycle_status = 'ACTIVE'
         AND effective_from <= NOW()
         AND (effective_to IS NULL OR effective_to > NOW())
       ORDER BY category, constraint_code`,
    );
    return rows.map(mapConstraintRow);
  }

  static async validateConstraintCode(constraintCode: string): Promise<boolean> {
    const definition = await this.getByCode(constraintCode);
    return Boolean(definition && definition.lifecycleStatus === 'ACTIVE');
  }
}
