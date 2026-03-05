import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { SqlExecutor } from './operationResourceBindingService';

export type DepartmentCode = 'USP' | 'DSP' | 'SPI' | 'MAINT';

export const DEFAULT_DEPARTMENT_CODE: DepartmentCode = 'USP';

const normalizeToken = (value: string) => value.replace(/[^A-Za-z]/g, '').toUpperCase();

export const normalizeDepartmentCode = (value: unknown): DepartmentCode | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const raw = value.trim().toUpperCase();
  if (raw === 'USP' || raw === 'DSP' || raw === 'SPI' || raw === 'MAINT') {
    return raw as DepartmentCode;
  }

  const token = normalizeToken(raw);
  if (token.includes('USP')) {
    return 'USP';
  }
  if (token.includes('DSP')) {
    return 'DSP';
  }
  if (token.includes('SPI')) {
    return 'SPI';
  }
  if (token.includes('MAINT')) {
    return 'MAINT';
  }

  return null;
};

type OrgUnitLite = {
  id: number;
  parent_id: number | null;
  unit_code: string | null;
  unit_name: string | null;
};

const loadOrgUnit = async (unitId: number, executor: SqlExecutor): Promise<OrgUnitLite | null> => {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id, parent_id, unit_code, unit_name
     FROM organization_units
     WHERE id = ?
     LIMIT 1`,
    [unitId],
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
  return {
    id: Number(row.id),
    parent_id: row.parent_id !== null && row.parent_id !== undefined ? Number(row.parent_id) : null,
    unit_code: row.unit_code ? String(row.unit_code) : null,
    unit_name: row.unit_name ? String(row.unit_name) : null,
  };
};

export const resolveDepartmentCodeFromOrgUnit = async (
  ownerOrgUnitId?: number | null,
  executor: SqlExecutor = pool,
): Promise<DepartmentCode | null> => {
  if (!ownerOrgUnitId || !Number.isInteger(Number(ownerOrgUnitId)) || Number(ownerOrgUnitId) <= 0) {
    return null;
  }

  const visited = new Set<number>();
  let cursor: number | null = Number(ownerOrgUnitId);

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const unit = await loadOrgUnit(cursor, executor);
    if (!unit) {
      return null;
    }

    const codeFromUnitCode = normalizeDepartmentCode(unit.unit_code);
    if (codeFromUnitCode) {
      return codeFromUnitCode;
    }

    const codeFromUnitName = normalizeDepartmentCode(unit.unit_name);
    if (codeFromUnitName) {
      return codeFromUnitName;
    }

    cursor = unit.parent_id;
  }

  return null;
};
