import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import dayjs from 'dayjs';
import pool from '../config/database';
import { SqlExecutor } from './operationResourceBindingService';
import { isBatchResourceSnapshotsEnabled } from '../utils/featureFlags';
import { snapshotBatchPlanResourceRules } from './batchResourceSnapshotService';

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
const formatDateTime = (baseDate: string, hourOffset: number): string => (
  dayjs(`${baseDate}T00:00:00`).add(hourOffset, 'hour').format('YYYY-MM-DD HH:mm:ss')
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
         pt.total_days AS template_total_days
       FROM mfg_template_package_modules module
       JOIN process_templates pt ON pt.id = module.template_id
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

  static async createBatchFromPackage(payload: CreateBatchFromPackagePayload): Promise<RowDataPacket> {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const preview = await this.buildPreview(payload.mfg_package_id, connection);
      if (preview.conflicts.length > 0) {
        await connection.rollback();
        throw new Error(`MFG_PACKAGE_DAY_LINK_CONFLICT:${preview.conflicts.join(',')}`);
      }
      if (preview.tasks.length === 0) {
        await connection.rollback();
        throw new Error('MFG_PACKAGE_WITHOUT_OPERATIONS');
      }

      const primaryModule = preview.modules.find((module) => module.is_anchor) ?? preview.modules[0];
      const baseDate = payload.planned_start_date;
      const plannedStartDate = formatDate(dayjs(baseDate).add(preview.min_day, 'day'));
      const plannedEndDate = formatDate(dayjs(baseDate).add(preview.max_day, 'day'));
      const snapshot = JSON.stringify({
        package_id: preview.package.id,
        package_code: preview.package.package_code,
        package_name: preview.package.package_name,
        base_date: baseDate,
        min_day: preview.min_day,
        max_day: preview.max_day,
        modules: preview.modules.map((module) => ({
          role_code: module.role_code,
          role_name: module.role_name,
          template_id: module.template_id,
          template_code: module.template_code,
          computed_start_offset_days: module.computed_start_offset_days,
          is_anchor: module.is_anchor,
        })),
        day_links: preview.day_links,
      });

      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO production_batch_plans (
           batch_code, batch_name, template_id, mfg_package_id, mfg_package_snapshot_json,
           project_code, planned_start_date, plan_status, description, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
        [
          payload.batch_code,
          payload.batch_name,
          primaryModule.template_id,
          preview.package.id,
          snapshot,
          payload.project_code ?? null,
          plannedStartDate,
          payload.description ?? null,
          payload.notes ?? null,
        ],
      );

      const batchPlanId = insertResult.insertId;
      const scheduleToPlanId = new Map<number, number>();

      for (const task of preview.tasks) {
        const [opResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO batch_operation_plans (
             batch_plan_id,
             template_schedule_id,
             operation_id,
             planned_start_datetime,
             planned_end_datetime,
             planned_duration,
             window_start_datetime,
             window_end_datetime,
             required_people,
             notes
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            batchPlanId,
            task.schedule_id,
            task.operation_id,
            formatDateTime(baseDate, task.start_hour),
            formatDateTime(baseDate, task.end_hour),
            task.duration_hours,
            formatDateTime(baseDate, task.window_start_hour),
            formatDateTime(baseDate, task.window_end_hour),
            task.required_people,
            `MFG package ${preview.package.package_code} / ${task.role_code}`,
          ],
        );
        scheduleToPlanId.set(task.schedule_id, opResult.insertId);
      }

      await this.copyTemplateConstraintsToBatch(connection, batchPlanId, Array.from(scheduleToPlanId.keys()), scheduleToPlanId);

      await connection.execute(
        `UPDATE production_batch_plans
         SET planned_start_date = ?,
             planned_end_date = ?,
             template_duration_days = ?
         WHERE id = ?`,
        [plannedStartDate, plannedEndDate, preview.total_days, batchPlanId],
      );

      if (isBatchResourceSnapshotsEnabled()) {
        await snapshotBatchPlanResourceRules(connection, batchPlanId);
      }

      await connection.commit();

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT
           pbp.*,
           pt.template_name,
           pkg.package_name AS mfg_package_name,
           DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') AS planned_start_date,
           DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') AS planned_end_date
         FROM production_batch_plans pbp
         LEFT JOIN process_templates pt ON pt.id = pbp.template_id
         LEFT JOIN mfg_template_packages pkg ON pkg.id = pbp.mfg_package_id
         WHERE pbp.id = ?`,
        [batchPlanId],
      );

      return rows[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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

  private static async copyTemplateConstraintsToBatch(
    executor: SqlExecutor,
    batchPlanId: number,
    scheduleIds: number[],
    scheduleToPlanId: Map<number, number>,
  ): Promise<void> {
    if (!scheduleIds.length) return;
    const placeholders = scheduleIds.map(() => '?').join(', ');
    const [constraintRows] = await executor.execute<RowDataPacket[]>(
      `SELECT
         id,
         schedule_id,
         predecessor_schedule_id,
         constraint_type,
         time_lag,
         lag_type,
         lag_min,
         lag_max,
         constraint_level,
         share_personnel,
         constraint_name,
         description
       FROM operation_constraints
       WHERE schedule_id IN (${placeholders})
         AND predecessor_schedule_id IN (${placeholders})`,
      [...scheduleIds, ...scheduleIds],
    );

    for (const row of constraintRows) {
      const currentPlanId = scheduleToPlanId.get(Number(row.schedule_id));
      const predecessorPlanId = scheduleToPlanId.get(Number(row.predecessor_schedule_id));
      if (!currentPlanId || !predecessorPlanId) continue;

      await executor.execute(
        `INSERT INTO batch_operation_constraints (
           batch_plan_id,
           batch_operation_plan_id,
           predecessor_batch_operation_plan_id,
           constraint_type,
           time_lag,
           lag_type,
           lag_min,
           lag_max,
           constraint_level,
           share_personnel,
           constraint_name,
           description
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchPlanId,
          currentPlanId,
          predecessorPlanId,
          row.constraint_type,
          row.time_lag,
          row.lag_type ?? 'FIXED',
          row.lag_min ?? 0,
          row.lag_max ?? null,
          row.constraint_level ?? 1,
          row.share_personnel ?? 0,
          row.constraint_name ?? null,
          row.description ?? null,
        ],
      );
    }
  }
}
