import pool from '../config/database';
import { RowDataPacket } from 'mysql2';

export type SqlExecutor = {
  execute: typeof pool.execute;
};

export const toCandidateResourceIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)));
};

export const validateCandidateResources = async (
  connection: SqlExecutor,
  candidateResourceIds: number[],
  resourceType: unknown,
): Promise<{ valid: true } | { valid: false; message: string }> => {
  if (!candidateResourceIds.length) {
    return { valid: true };
  }

  const placeholders = candidateResourceIds.map(() => '?').join(', ');
  const [resourceRows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, resource_type
     FROM resources
     WHERE id IN (${placeholders})`,
    candidateResourceIds,
  );

  if (resourceRows.length !== candidateResourceIds.length) {
    return { valid: false, message: 'Some candidate resources do not exist' };
  }

  const invalidRow = resourceRows.find((row) => String(row.resource_type) !== String(resourceType));
  if (invalidRow) {
    return { valid: false, message: 'Candidate resources must match the selected resource_type' };
  }

  return { valid: true };
};

export const replaceCandidateMappings = async (
  connection: SqlExecutor,
  requirementId: number,
  candidateResourceIds: number[],
) => {
  await connection.execute('DELETE FROM operation_resource_candidates WHERE requirement_id = ?', [requirementId]);

  if (!candidateResourceIds.length) {
    return;
  }

  const valuesClause = candidateResourceIds.map(() => '(?, ?)').join(', ');
  const params = candidateResourceIds.flatMap((resourceId) => [requirementId, resourceId]);
  await connection.execute(
    `INSERT INTO operation_resource_candidates (requirement_id, resource_id)
     VALUES ${valuesClause}`,
    params,
  );
};

