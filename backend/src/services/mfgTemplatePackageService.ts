import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import dayjs from 'dayjs';
import pool from '../config/database';
import { SqlExecutor } from './operationResourceBindingService';
import { generateBatchOperationPlansWithResources } from './batchOperationGenerationService';

export type MfgPackageStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';

export interface MfgPackagePayloadModule {
  role_code: string;
  role_name?: string | null;
  template_id: number;
  start_offset_days?: number | null;
  is_anchor?: boolean;
  sort_order?: number;
}

export interface MfgPackagePayloadDayLink {
  source_role_code: string;
  target_role_code: string;
  source_anchor_day: number;
  target_anchor_day: number;
  lag_days?: number;
  description?: string | null;
  is_active?: boolean;
}

export interface MfgPackagePayload {
  package_code?: string | null;
  package_name: string;
  description?: string | null;
  package_status?: MfgPackageStatus;
  modules: MfgPackagePayloadModule[];
  day_links?: MfgPackagePayloadDayLink[];
}

export interface MfgPackageSummary {
  id: number;
  package_code: string;
  package_name: string;
  description: string | null;
  package_status: MfgPackageStatus;
  module_count: number;
  day_link_count: number;
  total_days: number | null;
  min_day: number | null;
  max_day: number | null;
  created_at: string;
  updated_at: string;
}

export interface MfgPackageModule {
  id: number;
  package_id: number;
  role_code: string;
  role_name: string;
  template_id: number;
  template_code: string;
  template_name: string;
  team_code: string | null;
  team_name: string | null;
  template_total_days: number | null;
  start_offset_days: number | null;
  computed_start_offset_days?: number;
  is_anchor: boolean;
  sort_order: number;
}

export interface MfgPackageDayLink {
  id: number;
  package_id: number;
  source_role_code: string;
  target_role_code: string;
  source_anchor_day: number;
  target_anchor_day: number;
  lag_days: number;
  link_type: 'MFG_DAY_ANCHOR';
  is_active: boolean;
  description: string | null;
}

export interface MfgPackageDetail extends Omit<MfgPackageSummary, 'module_count' | 'day_link_count' | 'total_days' | 'min_day' | 'max_day'> {
  modules: MfgPackageModule[];
  day_links: MfgPackageDayLink[];
}

export interface MfgPackagePreviewTask {
  id: string;
  package_id: number;
  module_id: number;
  role_code: string;
  role_name: string;
  template_id: number;
  template_code: string;
  template_name: string;
  stage_id: number;
  stage_name: string;
  stage_order: number;
  schedule_id: number;
  operation_id: number;
  operation_code: string;
  operation_name: string;
  start_hour: number;
  end_hour: number;
  window_start_hour: number;
  window_end_hour: number;
  start_day: number;
  end_day: number;
  required_people: number;
  duration_hours: number;
}

export interface MfgPackagePreview {
  package: MfgPackageDetail;
  modules: MfgPackageModule[];
  day_links: MfgPackageDayLink[];
  tasks: MfgPackagePreviewTask[];
  min_day: number;
  max_day: number;
  total_days: number;
  warnings: string[];
  conflicts: string[];
}

export interface CreateBatchFromPackagePayload {
  mfg_package_id: number;
  batch_code: string;
  batch_name: string;
  planned_start_date: string;
  project_code?: string | null;
  description?: string | null;
  notes?: string | null;
}

export interface CreateBatchFromPackageResult {
  message: string;
  batches: RowDataPacket[];
}

export interface CreateBulkBatchesFromPackagePayload {
  mfg_package_id: number;
  base_start_date: string;
  base_end_date: string;
  interval_days: number;
  batch_prefix: string;
  start_number: number;
  batch_number_length?: number;
  project_code?: string | null;
  description?: string | null;
  notes?: string | null;
}

const ROLE_NAME_FALLBACK: Record<string, string> = {
  USP: '上游',
  DSP: '下游',
  BUFFER: '配液',
  MEDIA: '培养基',
  ANCILLARY: '辅助',
};

const normalizeRoleCode = (value: unknown): string => String(value ?? '').trim().toUpperCase();
const normalizeStatus = (value: unknown): MfgPackageStatus => {
  const status = String(value ?? 'DRAFT').toUpperCase();
  return status === 'ACTIVE' || status === 'RETIRED' ? status : 'DRAFT';
};
const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const toNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const formatDate = (value: dayjs.Dayjs): string => value.format('YYYY-MM-DD');
const normalizeBatchCodePart = (value: unknown): string => String(value ?? '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
const shortenBatchPrefix = (value: unknown, maxLength = 20): string => (
  normalizeBatchCodePart(value).slice(0, maxLength).replace(/-+$/g, '')
);
const truncateText = (value: string, maxLength: number): string => (
  value.length > maxLength ? value.slice(0, maxLength) : value
);

const generatePackageCode = async (executor: SqlExecutor): Promise<string> => {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT package_code
     FROM mfg_template_packages
     WHERE package_code LIKE 'MFG-PKG-%'
     ORDER BY package_code DESC
     LIMIT 1`,
  );

  const lastCode = rows[0]?.package_code ? String(rows[0].package_code) : '';
  const lastNumber = Number(lastCode.replace('MFG-PKG-', ''));
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
  return `MFG-PKG-${String(nextNumber).padStart(5, '0')}`;
};

const mapPackageSummary = (row: RowDataPacket): MfgPackageSummary => ({
  id: Number(row.id),
  package_code: String(row.package_code),
  package_name: String(row.package_name),
  description: row.description ?? null,
  package_status: normalizeStatus(row.package_status),
  module_count: Number(row.module_count ?? 0),
  day_link_count: Number(row.day_link_count ?? 0),
  total_days: toNumberOrNull(row.total_days),
  min_day: toNumberOrNull(row.min_day),
  max_day: toNumberOrNull(row.max_day),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at),
});

const mapPackageModule = (row: RowDataPacket): MfgPackageModule => ({
  id: Number(row.id),
  package_id: Number(row.package_id),
  role_code: String(row.role_code),
  role_name: String(row.role_name),
  template_id: Number(row.template_id),
  template_code: String(row.template_code),
  template_name: String(row.template_name),
  team_code: row.team_code === null || row.team_code === undefined ? null : String(row.team_code),
  team_name: row.team_name === null || row.team_name === undefined ? null : String(row.team_name),
  template_total_days: row.template_total_days === null || row.template_total_days === undefined
    ? null
    : Number(row.template_total_days),
  start_offset_days: toNumberOrNull(row.start_offset_days),
  is_anchor: row.is_anchor === 1 || row.is_anchor === true,
  sort_order: Number(row.sort_order ?? 0),
});

const mapDayLink = (row: RowDataPacket): MfgPackageDayLink => ({
  id: Number(row.id),
  package_id: Number(row.package_id),
  source_role_code: String(row.source_role_code),
  target_role_code: String(row.target_role_code),
  source_anchor_day: Number(row.source_anchor_day),
  target_anchor_day: Number(row.target_anchor_day),
  lag_days: Number(row.lag_days ?? 0),
  link_type: 'MFG_DAY_ANCHOR',
  is_active: row.is_active === 1 || row.is_active === true,
  description: row.description ?? null,
});

const normalizePayload = (payload: MfgPackagePayload): MfgPackagePayload => {
  const modules = (payload.modules ?? [])
    .map((module, index) => {
      const roleCode = normalizeRoleCode(module.role_code);
      const roleName = String(module.role_name || ROLE_NAME_FALLBACK[roleCode] || roleCode).trim();
      return {
        role_code: roleCode,
        role_name: roleName,
        template_id: Number(module.template_id),
        start_offset_days: module.start_offset_days === undefined ? null : toNumberOrNull(module.start_offset_days),
        is_anchor: Boolean(module.is_anchor),
        sort_order: Number.isFinite(Number(module.sort_order)) ? Number(module.sort_order) : index,
      };
    })
    .filter((module) => module.role_code && Number.isInteger(module.template_id) && module.template_id > 0);

  if (!modules.length) {
    throw new Error('MFG_PACKAGE_REQUIRES_MODULES');
  }

  if (!modules.some((module) => module.is_anchor || module.start_offset_days !== null)) {
    modules[0] = { ...modules[0], is_anchor: true, start_offset_days: 0 };
  }

  const roleCodes = new Set(modules.map((module) => module.role_code));
  const dayLinks = (payload.day_links ?? [])
    .map((link) => ({
      source_role_code: normalizeRoleCode(link.source_role_code),
      target_role_code: normalizeRoleCode(link.target_role_code),
      source_anchor_day: toNumber(link.source_anchor_day, 0),
      target_anchor_day: toNumber(link.target_anchor_day, 0),
      lag_days: toNumber(link.lag_days, 0),
      description: link.description ?? null,
      is_active: link.is_active !== false,
    }))
    .filter((link) => link.source_role_code && link.target_role_code);

  const invalidLink = dayLinks.find((link) => !roleCodes.has(link.source_role_code) || !roleCodes.has(link.target_role_code));
  if (invalidLink) {
    throw new Error(`MFG_PACKAGE_LINK_UNKNOWN_ROLE:${invalidLink.source_role_code}->${invalidLink.target_role_code}`);
  }

  return {
    package_code: payload.package_code?.trim() || null,
    package_name: String(payload.package_name ?? '').trim(),
    description: payload.description ?? null,
    package_status: normalizeStatus(payload.package_status),
    modules,
    day_links: dayLinks,
  };
};

const computeModuleOffsets = (
  modules: MfgPackageModule[],
  dayLinks: MfgPackageDayLink[],
): { offsets: Map<string, number>; warnings: string[]; conflicts: string[] } => {
  const offsets = new Map<string, number>();
  const warnings: string[] = [];
  const conflicts: string[] = [];

  modules.forEach((module) => {
    if (module.is_anchor || module.start_offset_days !== null) {
      offsets.set(module.role_code, module.start_offset_days ?? 0);
    }
  });

  if (offsets.size === 0 && modules.length > 0) {
    offsets.set(modules[0].role_code, 0);
    warnings.push(`MODULE_OFFSET_DEFAULTED:${modules[0].role_code}`);
  }

  for (let iteration = 0; iteration < Math.max(dayLinks.length + modules.length, 1); iteration += 1) {
    let changed = false;

    dayLinks.filter((link) => link.is_active).forEach((link) => {
      const sourceOffset = offsets.get(link.source_role_code);
      const targetOffset = offsets.get(link.target_role_code);

      if (sourceOffset !== undefined && targetOffset === undefined) {
        offsets.set(
          link.target_role_code,
          sourceOffset + link.source_anchor_day + link.lag_days - link.target_anchor_day,
        );
        changed = true;
      } else if (sourceOffset === undefined && targetOffset !== undefined) {
        offsets.set(
          link.source_role_code,
          targetOffset + link.target_anchor_day - link.source_anchor_day - link.lag_days,
        );
        changed = true;
      } else if (sourceOffset !== undefined && targetOffset !== undefined) {
        const expectedTarget = sourceOffset + link.source_anchor_day + link.lag_days - link.target_anchor_day;
        if (expectedTarget !== targetOffset) {
          const code = `DAY_LINK_CONFLICT:${link.source_role_code}->${link.target_role_code}:expected_${expectedTarget}:actual_${targetOffset}`;
          if (!conflicts.includes(code)) conflicts.push(code);
        }
      }
    });

    if (!changed) break;
  }

  modules.forEach((module) => {
    if (!offsets.has(module.role_code)) {
      offsets.set(module.role_code, module.start_offset_days ?? 0);
      warnings.push(`MODULE_OFFSET_UNRESOLVED:${module.role_code}`);
    }
  });

  return { offsets, warnings, conflicts };
};

export class MfgTemplatePackageService {
  static async listPackages(executor: SqlExecutor = pool): Promise<MfgPackageSummary[]> {
    const [rows] = await executor.execute<RowDataPacket[]>(
      `SELECT
         pkg.*,
         COUNT(DISTINCT module.id) AS module_count,
         COUNT(DISTINCT link.id) AS day_link_count,
         MIN(module.start_offset_days) AS min_day,
         MAX(module.start_offset_days + COALESCE(pt.total_days, 1) - 1) AS max_day,
         CASE
           WHEN COUNT(DISTINCT module.id) = 0 THEN NULL
           ELSE MAX(module.start_offset_days + COALESCE(pt.total_days, 1) - 1) - MIN(module.start_offset_days) + 1
         END AS total_days
       FROM mfg_template_packages pkg
       LEFT JOIN mfg_template_package_modules module ON module.package_id = pkg.id
       LEFT JOIN process_templates pt ON pt.id = module.template_id
       LEFT JOIN mfg_template_package_day_links link ON link.package_id = pkg.id AND link.is_active = 1
       GROUP BY pkg.id
       ORDER BY pkg.updated_at DESC, pkg.id DESC`,
    );

    const summaries = rows.map(mapPackageSummary);
    return Promise.all(summaries.map(async (summary) => {
      try {
        const preview = await this.buildPreview(summary.id, executor);
        return {
          ...summary,
          min_day: preview.tasks.length ? preview.min_day : summary.min_day,
          max_day: preview.tasks.length ? preview.max_day : summary.max_day,
          total_days: preview.tasks.length ? preview.total_days : summary.total_days,
        };
      } catch {
        return summary;
      }
    }));
  }

  static async getPackageDetail(packageId: number, executor: SqlExecutor = pool): Promise<MfgPackageDetail | null> {
    const [packageRows] = await executor.execute<RowDataPacket[]>(
      `SELECT *
       FROM mfg_template_packages
       WHERE id = ?
       LIMIT 1`,
      [packageId],
    );

    if (!packageRows.length) {
      return null;
    }

    const [moduleRows] = await executor.execute<RowDataPacket[]>(
      `SELECT
         module.*,
         pt.template_code,
         pt.template_name,
         pt.total_days AS template_total_days,
         ou.unit_code AS team_code,
         ou.unit_name AS team_name
       FROM mfg_template_package_modules module
       JOIN process_templates pt ON pt.id = module.template_id
       LEFT JOIN organization_units ou ON ou.id = pt.team_id
       WHERE module.package_id = ?
       ORDER BY module.sort_order, module.id`,
      [packageId],
    );

    const [dayLinkRows] = await executor.execute<RowDataPacket[]>(
      `SELECT *
       FROM mfg_template_package_day_links
       WHERE package_id = ?
       ORDER BY id`,
      [packageId],
    );

    return {
      id: Number(packageRows[0].id),
      package_code: String(packageRows[0].package_code),
      package_name: String(packageRows[0].package_name),
      description: packageRows[0].description ?? null,
      package_status: normalizeStatus(packageRows[0].package_status),
      created_at: String(packageRows[0].created_at),
      updated_at: String(packageRows[0].updated_at),
      modules: moduleRows.map(mapPackageModule),
      day_links: dayLinkRows.map(mapDayLink),
    };
  }

  static async createPackage(payload: MfgPackagePayload): Promise<MfgPackageDetail> {
    const normalized = normalizePayload(payload);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const packageCode = normalized.package_code || await generatePackageCode(connection);
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO mfg_template_packages
           (package_code, package_name, description, package_status)
         VALUES (?, ?, ?, ?)`,
        [packageCode, normalized.package_name, normalized.description ?? null, normalized.package_status ?? 'DRAFT'],
      );

      const packageId = result.insertId;
      await this.replacePackageChildren(connection, packageId, normalized.modules, normalized.day_links ?? []);
      await connection.commit();

      const detail = await this.getPackageDetail(packageId);
      if (!detail) throw new Error('MFG_PACKAGE_CREATED_BUT_NOT_FOUND');
      return detail;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updatePackage(packageId: number, payload: MfgPackagePayload): Promise<MfgPackageDetail> {
    const normalized = normalizePayload(payload);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const packageCode = normalized.package_code || await generatePackageCode(connection);
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE mfg_template_packages
         SET package_code = ?,
             package_name = ?,
             description = ?,
             package_status = ?
         WHERE id = ?`,
        [
          packageCode,
          normalized.package_name,
          normalized.description ?? null,
          normalized.package_status ?? 'DRAFT',
          packageId,
        ],
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        throw new Error('MFG_PACKAGE_NOT_FOUND');
      }

      await this.replacePackageChildren(connection, packageId, normalized.modules, normalized.day_links ?? []);
      await connection.commit();

      const detail = await this.getPackageDetail(packageId);
      if (!detail) throw new Error('MFG_PACKAGE_UPDATED_BUT_NOT_FOUND');
      return detail;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async deletePackage(packageId: number): Promise<void> {
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM mfg_template_packages WHERE id = ?`,
      [packageId],
    );
    if (result.affectedRows === 0) {
      throw new Error('MFG_PACKAGE_NOT_FOUND');
    }
  }

  static async buildPreview(packageId: number, executor: SqlExecutor = pool): Promise<MfgPackagePreview> {
    const detail = await this.getPackageDetail(packageId, executor);
    if (!detail) {
      throw new Error('MFG_PACKAGE_NOT_FOUND');
    }

    const { offsets, warnings, conflicts } = computeModuleOffsets(detail.modules, detail.day_links);
    const modules = detail.modules.map((module) => ({
      ...module,
      computed_start_offset_days: offsets.get(module.role_code) ?? 0,
    }));

    if (!modules.length) {
      return {
        package: detail,
        modules,
        day_links: detail.day_links,
        tasks: [],
        min_day: 0,
        max_day: 0,
        total_days: 0,
        warnings,
        conflicts,
      };
    }

    const templateIds = Array.from(new Set(modules.map((module) => module.template_id)));
    const placeholders = templateIds.map(() => '?').join(', ');
    const [operationRows] = await executor.execute<RowDataPacket[]>(
      `SELECT
         pt.id AS template_id,
         pt.template_code,
         pt.template_name,
         ps.id AS stage_id,
         ps.stage_name,
         ps.stage_order,
         ps.start_day AS stage_start_day,
         sos.id AS schedule_id,
         sos.operation_id,
         sos.operation_day,
         sos.recommended_time,
         COALESCE(sos.recommended_day_offset, 0) AS recommended_day_offset,
         sos.window_start_time,
         COALESCE(sos.window_start_day_offset, 0) AS window_start_day_offset,
         sos.window_end_time,
         COALESCE(sos.window_end_day_offset, 0) AS window_end_day_offset,
         sos.operation_order,
         o.operation_code,
         o.operation_name,
         o.standard_time,
         o.required_people
       FROM process_templates pt
       JOIN process_stages ps ON ps.template_id = pt.id
       JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
       JOIN operations o ON o.id = sos.operation_id
       WHERE pt.id IN (${placeholders})
       ORDER BY pt.id, ps.stage_order, sos.operation_day, sos.operation_order, sos.id`,
      templateIds,
    );

    const operationsByTemplate = new Map<number, RowDataPacket[]>();
    operationRows.forEach((row) => {
      const templateId = Number(row.template_id);
      if (!operationsByTemplate.has(templateId)) operationsByTemplate.set(templateId, []);
      operationsByTemplate.get(templateId)!.push(row);
    });

    const tasks: MfgPackagePreviewTask[] = [];
    modules.forEach((module) => {
      const moduleOffset = module.computed_start_offset_days ?? 0;
      const rows = operationsByTemplate.get(module.template_id) ?? [];

      rows.forEach((row) => {
        const startDay =
          moduleOffset +
          Number(row.stage_start_day ?? 0) +
          Number(row.operation_day ?? 0) +
          Number(row.recommended_day_offset ?? 0);
        const startHour = startDay * 24 + Number(row.recommended_time ?? 0);
        const durationHours = Math.max(Number(row.standard_time ?? 0), 0);
        const endHour = startHour + durationHours;
        const windowStartDay =
          moduleOffset +
          Number(row.stage_start_day ?? 0) +
          Number(row.operation_day ?? 0) +
          Number(row.window_start_day_offset ?? 0);
        const windowEndDay =
          moduleOffset +
          Number(row.stage_start_day ?? 0) +
          Number(row.operation_day ?? 0) +
          Number(row.window_end_day_offset ?? 0);

        tasks.push({
          id: `${module.role_code}-${row.schedule_id}`,
          package_id: packageId,
          module_id: module.id,
          role_code: module.role_code,
          role_name: module.role_name,
          template_id: module.template_id,
          template_code: module.template_code,
          template_name: module.template_name,
          stage_id: Number(row.stage_id),
          stage_name: String(row.stage_name),
          stage_order: Number(row.stage_order ?? 0),
          schedule_id: Number(row.schedule_id),
          operation_id: Number(row.operation_id),
          operation_code: String(row.operation_code),
          operation_name: String(row.operation_name),
          start_hour: startHour,
          end_hour: endHour,
          window_start_hour: windowStartDay * 24 + Number(row.window_start_time ?? 0),
          window_end_hour: windowEndDay * 24 + Number(row.window_end_time ?? 0),
          start_day: startDay,
          end_day: Math.ceil(endHour / 24) - 1,
          required_people: Number(row.required_people ?? 0),
          duration_hours: durationHours,
        });
      });
    });

    const minDay = tasks.length ? Math.floor(Math.min(...tasks.map((task) => task.start_hour)) / 24) : 0;
    const maxDay = tasks.length ? Math.ceil(Math.max(...tasks.map((task) => task.end_hour)) / 24) - 1 : 0;

    return {
      package: detail,
      modules,
      day_links: detail.day_links,
      tasks,
      min_day: minDay,
      max_day: maxDay,
      total_days: tasks.length ? maxDay - minDay + 1 : 0,
      warnings,
      conflicts,
    };
  }

  static async createBatchFromPackage(payload: CreateBatchFromPackagePayload): Promise<CreateBatchFromPackageResult> {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const preview = await this.buildPreview(payload.mfg_package_id, connection);
      if (preview.conflicts.length > 0) {
        throw new Error(`MFG_PACKAGE_DAY_LINK_CONFLICT:${preview.conflicts.join(',')}`);
      }
      if (preview.tasks.length === 0) {
        throw new Error('MFG_PACKAGE_WITHOUT_OPERATIONS');
      }

      const batches = await this.insertDepartmentBatchesFromPackagePreview(connection, preview, payload);
      await connection.commit();
      return {
        message: `成功创建 ${batches.length} 个部门批次`,
        batches,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async createBulkBatchesFromPackage(payload: CreateBulkBatchesFromPackagePayload): Promise<CreateBatchFromPackageResult> {
    const intervalDays = Number(payload.interval_days);
    const startNumber = Number(payload.start_number);
    const numberLength = Math.max(Number(payload.batch_number_length ?? 0) || 0, 0);
    const startDate = dayjs(payload.base_start_date);
    const endDate = dayjs(payload.base_end_date);

    if (!startDate.isValid() || !endDate.isValid() || intervalDays < 1 || startNumber < 1 || !payload.batch_prefix.trim()) {
      throw new Error('MFG_PACKAGE_BULK_INVALID_PARAMS');
    }

    const baseDates: string[] = [];
    let current = startDate;
    while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
      baseDates.push(formatDate(current));
      current = current.add(intervalDays, 'day');
      if (baseDates.length > 500) {
        throw new Error('MFG_PACKAGE_BULK_TOO_LARGE');
      }
    }

    if (baseDates.length === 0) {
      throw new Error('MFG_PACKAGE_BULK_EMPTY_RANGE');
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const preview = await this.buildPreview(payload.mfg_package_id, connection);
      if (preview.conflicts.length > 0) {
        throw new Error(`MFG_PACKAGE_DAY_LINK_CONFLICT:${preview.conflicts.join(',')}`);
      }
      if (preview.tasks.length === 0) {
        throw new Error('MFG_PACKAGE_WITHOUT_OPERATIONS');
      }

      const batches: RowDataPacket[] = [];
      for (let index = 0; index < baseDates.length; index += 1) {
        const numberText = String(startNumber + index).padStart(numberLength, '0');
        const batchCode = `${payload.batch_prefix.trim()}${numberText}`;
        const rows = await this.insertDepartmentBatchesFromPackagePreview(connection, preview, {
          mfg_package_id: payload.mfg_package_id,
          batch_code: batchCode,
          batch_name: batchCode,
          planned_start_date: baseDates[index],
          project_code: payload.project_code ?? null,
          description: payload.description ?? null,
          notes: payload.notes ?? null,
        });
        batches.push(...rows);
      }

      await connection.commit();
      return {
        message: `成功创建 ${batches.length} 个部门批次（来自 ${baseDates.length} 个总包基准批次）`,
        batches,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private static buildModuleBatchPrefixes(modules: MfgPackageModule[]): Map<number, string> {
    const basePrefixes = modules.map((module) => (
      shortenBatchPrefix(module.team_code)
      || shortenBatchPrefix(module.role_code)
      || shortenBatchPrefix(module.template_code)
      || `T${module.template_id}`
    ));
    const counts = new Map<string, number>();
    basePrefixes.forEach((prefix) => counts.set(prefix, (counts.get(prefix) ?? 0) + 1));

    const used = new Set<string>();
    const prefixes = new Map<number, string>();
    modules.forEach((module, index) => {
      const basePrefix = basePrefixes[index];
      const needsSuffix = (counts.get(basePrefix) ?? 0) > 1;
      const suffix = shortenBatchPrefix(module.role_code)
        || shortenBatchPrefix(module.template_code)
        || `M${index + 1}`;
      let prefix = needsSuffix && suffix !== basePrefix
        ? shortenBatchPrefix(`${basePrefix}-${suffix}`)
        : basePrefix;
      let attempt = 2;
      while (used.has(prefix)) {
        const serial = String(attempt);
        const prefixBase = basePrefix.slice(0, Math.max(1, 20 - serial.length - 1)).replace(/-+$/g, '');
        prefix = `${prefixBase}-${serial}`;
        attempt += 1;
      }
      used.add(prefix);
      prefixes.set(module.id, prefix);
    });

    return prefixes;
  }

  private static async getTemplateMinDays(
    executor: SqlExecutor,
    templateIds: number[],
  ): Promise<Map<number, number>> {
    if (!templateIds.length) return new Map();
    const placeholders = templateIds.map(() => '?').join(', ');
    const [rows] = await executor.execute<RowDataPacket[]>(
      `SELECT
         pt.id AS template_id,
         COALESCE(MIN(ps.start_day + sos.operation_day), 0) AS min_day
       FROM process_templates pt
       LEFT JOIN process_stages ps ON ps.template_id = pt.id
       LEFT JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
       WHERE pt.id IN (${placeholders})
       GROUP BY pt.id`,
      templateIds,
    );

    return new Map(rows.map((row) => [Number(row.template_id), Number(row.min_day ?? 0)]));
  }

  private static async insertDepartmentBatchesFromPackagePreview(
    executor: SqlExecutor,
    preview: MfgPackagePreview,
    payload: CreateBatchFromPackagePayload,
  ): Promise<RowDataPacket[]> {
    const baseDate = payload.planned_start_date;
    const baseBatchCode = payload.batch_code.trim();
    const baseBatchName = payload.batch_name.trim() || baseBatchCode;
    const prefixes = this.buildModuleBatchPrefixes(preview.modules);
    const templateMinDays = await this.getTemplateMinDays(
      executor,
      Array.from(new Set(preview.modules.map((module) => module.template_id))),
    );
    const batches: RowDataPacket[] = [];

    for (const module of preview.modules) {
      const prefix = prefixes.get(module.id) || shortenBatchPrefix(module.role_code) || `T${module.template_id}`;
      const moduleDay0Date = formatDate(dayjs(baseDate).add(module.computed_start_offset_days ?? 0, 'day'));
      const templateMinDay = templateMinDays.get(module.template_id) ?? 0;
      const plannedStartDate = formatDate(dayjs(moduleDay0Date).add(templateMinDay, 'day'));
      const batchCode = `${prefix}-${baseBatchCode}`;
      if (batchCode.length > 50) {
        throw new Error(`MFG_PACKAGE_BATCH_CODE_TOO_LONG:${batchCode}`);
      }
      const batchName = truncateText(`${prefix} ${baseBatchName} - ${module.template_name}`, 100);
      const traceNote = `MFG package ${preview.package.package_code}; module ${module.role_code}; package base ${baseDate}; module Day0 ${moduleDay0Date}`;
      const notes = [payload.notes, traceNote].filter(Boolean).join('\n');

      const [insertResult] = await executor.execute<ResultSetHeader>(
        `INSERT INTO production_batch_plans (
           batch_code, batch_name, template_id, project_code,
           planned_start_date, plan_status, description, notes
         ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
        [
          batchCode,
          batchName,
          module.template_id,
          payload.project_code ?? null,
          plannedStartDate,
          payload.description ?? null,
          notes || null,
        ],
      );

      const batchPlanId = insertResult.insertId;
      await generateBatchOperationPlansWithResources(executor, batchPlanId);

      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT
           pbp.*,
           pt.template_name,
           ou.unit_code AS team_code,
           ou.unit_name AS team_name,
           DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') AS planned_start_date,
           DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') AS planned_end_date
         FROM production_batch_plans pbp
         LEFT JOIN process_templates pt ON pt.id = pbp.template_id
         LEFT JOIN organization_units ou ON ou.id = pt.team_id
         WHERE pbp.id = ?`,
        [batchPlanId],
      );
      batches.push(rows[0]);
    }

    return batches;
  }

  private static async replacePackageChildren(
    executor: SqlExecutor,
    packageId: number,
    modules: MfgPackagePayloadModule[],
    dayLinks: MfgPackagePayloadDayLink[],
  ): Promise<void> {
    await executor.execute('DELETE FROM mfg_template_package_day_links WHERE package_id = ?', [packageId]);
    await executor.execute('DELETE FROM mfg_template_package_modules WHERE package_id = ?', [packageId]);

    for (const module of modules) {
      await executor.execute(
        `INSERT INTO mfg_template_package_modules
           (package_id, role_code, role_name, template_id, start_offset_days, is_anchor, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          packageId,
          module.role_code,
          module.role_name ?? ROLE_NAME_FALLBACK[module.role_code] ?? module.role_code,
          module.template_id,
          module.start_offset_days ?? null,
          module.is_anchor ? 1 : 0,
          module.sort_order ?? 0,
        ],
      );
    }

    for (const link of dayLinks) {
      await executor.execute(
        `INSERT INTO mfg_template_package_day_links
           (package_id, source_role_code, target_role_code, source_anchor_day, target_anchor_day,
            lag_days, link_type, is_active, description)
         VALUES (?, ?, ?, ?, ?, ?, 'MFG_DAY_ANCHOR', ?, ?)`,
        [
          packageId,
          link.source_role_code,
          link.target_role_code,
          link.source_anchor_day,
          link.target_anchor_day,
          link.lag_days ?? 0,
          link.is_active === false ? 0 : 1,
          link.description ?? null,
        ],
      );
    }
  }
}
