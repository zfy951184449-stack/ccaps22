import { Request, Response } from 'express';
import pool from '../config/database';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { extractMissingTableName, isMissingTableError } from '../utils/platformFeatureGuard';

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';
type SqlExecutor = {
  execute: typeof pool.execute;
};

const toCandidateResourceIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)));
};

const loadCandidateMap = async (requirementIds: number[]) => {
  if (!requirementIds.length) {
    return new Map<number, { candidate_resource_ids: number[]; candidate_resources: Array<Record<string, unknown>> }>();
  }

  const placeholders = requirementIds.map(() => '?').join(', ');

  try {
    const [candidateRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          orc.requirement_id,
          r.id,
          r.resource_code,
          r.resource_name,
          r.resource_type
       FROM operation_resource_candidates orc
       JOIN resources r ON r.id = orc.resource_id
       WHERE orc.requirement_id IN (${placeholders})
       ORDER BY r.resource_type, r.resource_code`,
      requirementIds,
    );

    const map = new Map<number, { candidate_resource_ids: number[]; candidate_resources: Array<Record<string, unknown>> }>();
    candidateRows.forEach((row) => {
      const requirementId = Number(row.requirement_id);
      const current = map.get(requirementId) ?? { candidate_resource_ids: [], candidate_resources: [] };
      current.candidate_resource_ids.push(Number(row.id));
      current.candidate_resources.push({
        id: Number(row.id),
        resource_code: row.resource_code,
        resource_name: row.resource_name,
        resource_type: row.resource_type,
      });
      map.set(requirementId, current);
    });

    return map;
  } catch (error) {
    if (isMissingTableError(error)) {
      return new Map<number, { candidate_resource_ids: number[]; candidate_resources: Array<Record<string, unknown>> }>();
    }
    throw error;
  }
};

const validateCandidateResources = async (
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

const replaceCandidateMappings = async (connection: SqlExecutor, requirementId: number, candidateResourceIds: number[]) => {
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

export const getOperationResourceRequirements = async (req: Request, res: Response) => {
  try {
    const { operation_id, resource_type } = req.query;
    let query = `
      SELECT orr.*, o.operation_code, o.operation_name
      FROM operation_resource_requirements orr
      JOIN operations o ON o.id = orr.operation_id
      WHERE 1 = 1
    `;
    const params: unknown[] = [];

    if (operation_id) {
      query += ' AND orr.operation_id = ?';
      params.push(operation_id);
    }
    if (resource_type) {
      query += ' AND orr.resource_type = ?';
      params.push(resource_type);
    }

    query += ' ORDER BY o.operation_name, orr.resource_type';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    const candidateMap = await loadCandidateMap(rows.map((row) => Number(row.id)));

    res.json(
      rows.map((row) => ({
        ...row,
        required_count: Number(row.required_count ?? 0),
        prep_minutes: Number(row.prep_minutes ?? 0),
        changeover_minutes: Number(row.changeover_minutes ?? 0),
        cleanup_minutes: Number(row.cleanup_minutes ?? 0),
        is_mandatory: toBoolean(row.is_mandatory),
        requires_exclusive_use: toBoolean(row.requires_exclusive_use),
        candidate_resource_ids: candidateMap.get(Number(row.id))?.candidate_resource_ids ?? [],
        candidate_resources: candidateMap.get(Number(row.id))?.candidate_resources ?? [],
      })),
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.json({
        data: [],
        warnings: [`Operation resource requirements are unavailable because table ${extractMissingTableName(error) ?? 'operation_resource_requirements'} is missing.`],
      });
    }
    console.error('Error fetching operation resource requirements:', error);
    res.status(500).json({ error: 'Failed to fetch operation resource requirements' });
  }
};

export const createOperationResourceRequirement = async (req: Request, res: Response) => {
  try {
    const {
      operation_id,
      resource_type,
      required_count,
      is_mandatory,
      requires_exclusive_use,
      prep_minutes,
      changeover_minutes,
      cleanup_minutes,
      candidate_resource_ids,
    } = req.body;

    if (!operation_id || !resource_type) {
      return res.status(400).json({ error: 'operation_id and resource_type are required' });
    }

    const candidateResourceIds = toCandidateResourceIds(candidate_resource_ids);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const validation = await validateCandidateResources(connection, candidateResourceIds, resource_type);
      if (!validation.valid) {
        await connection.rollback();
        return res.status(400).json({ error: validation.message });
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO operation_resource_requirements (
          operation_id, resource_type, required_count, is_mandatory,
          requires_exclusive_use, prep_minutes, changeover_minutes, cleanup_minutes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          operation_id,
          resource_type,
          required_count || 1,
          is_mandatory === false ? 0 : 1,
          requires_exclusive_use === false ? 0 : 1,
          prep_minutes || 0,
          changeover_minutes || 0,
          cleanup_minutes || 0,
        ],
      );

      await replaceCandidateMappings(connection, result.insertId, candidateResourceIds);
      await connection.commit();

      res.status(201).json({ id: result.insertId, message: 'Operation resource requirement created successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.status(409).json({
        error: 'Operation resource binding is not available',
        warning: `Missing table: ${extractMissingTableName(error) ?? 'operation_resource_candidates'}`,
      });
    }
    console.error('Error creating operation resource requirement:', error);
    res.status(500).json({ error: 'Failed to create operation resource requirement' });
  }
};

export const updateOperationResourceRequirement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'operation_id',
      'resource_type',
      'required_count',
      'is_mandatory',
      'requires_exclusive_use',
      'prep_minutes',
      'changeover_minutes',
      'cleanup_minutes',
    ] as const;
    const candidateResourceIds = req.body.candidate_resource_ids !== undefined
      ? toCandidateResourceIds(req.body.candidate_resource_ids)
      : null;

    const updates: string[] = [];
    const params: unknown[] = [];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        if (field === 'is_mandatory' || field === 'requires_exclusive_use') {
          params.push(req.body[field] ? 1 : 0);
        } else {
          params.push(req.body[field]);
        }
      }
    });

    if (!updates.length && candidateResourceIds === null) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (candidateResourceIds !== null) {
        let resourceTypeForValidation = req.body.resource_type;

        if (!resourceTypeForValidation) {
          const [existingRows] = await connection.execute<RowDataPacket[]>(
            'SELECT resource_type FROM operation_resource_requirements WHERE id = ?',
            [id],
          );
          resourceTypeForValidation = existingRows[0]?.resource_type;
        }

        const validation = await validateCandidateResources(connection, candidateResourceIds, resourceTypeForValidation);
        if (!validation.valid) {
          await connection.rollback();
          return res.status(400).json({ error: validation.message });
        }
      }

      if (updates.length) {
        params.push(id);
        await connection.execute(`UPDATE operation_resource_requirements SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      if (candidateResourceIds !== null) {
        await replaceCandidateMappings(connection, Number(id), candidateResourceIds);
      }

      await connection.commit();
      res.json({ message: 'Operation resource requirement updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.status(409).json({
        error: 'Operation resource binding is not available',
        warning: `Missing table: ${extractMissingTableName(error) ?? 'operation_resource_candidates'}`,
      });
    }
    console.error('Error updating operation resource requirement:', error);
    res.status(500).json({ error: 'Failed to update operation resource requirement' });
  }
};
