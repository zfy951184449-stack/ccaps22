import dayjs from 'dayjs';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool, { DbExecutor } from '../config/database';
import SpecialShiftEligibilityService, {
  SpecialShiftEligibilityRule,
  SpecialShiftOrgEmployeeContext,
} from './specialShiftEligibilityService';
import SpecialShiftOccurrenceService, {
  SpecialShiftOccurrenceFilters,
  SpecialShiftOccurrenceListItem,
} from './specialShiftOccurrenceService';

export type SpecialShiftWindowStatus = 'DRAFT' | 'ACTIVE' | 'CANCELLED' | 'ARCHIVED';
export type SpecialShiftPlanCategory = 'BASE' | 'OVERTIME';
export type SpecialShiftScopeType = 'ALLOW' | 'DENY';
export type SpecialShiftFulfillmentMode = 'HARD' | 'SOFT';
export type SpecialShiftPriorityLevel = 'CRITICAL' | 'HIGH' | 'NORMAL';

export interface SpecialShiftWindowRuleInput {
  shift_id: number;
  required_people: number;
  plan_category?: SpecialShiftPlanCategory;
  fulfillment_mode?: SpecialShiftFulfillmentMode;
  priority_level?: SpecialShiftPriorityLevel;
  qualification_id?: number | null;
  min_level?: number | null;
  is_mandatory?: boolean;
  days_of_week: number[];
  notes?: string | null;
  allow_employee_ids?: number[];
  deny_employee_ids?: number[];
}

export interface SpecialShiftWindowInput {
  window_name: string;
  org_unit_id: number;
  start_date: string;
  end_date: string;
  lock_after_apply?: boolean;
  notes?: string | null;
  created_by?: number | null;
  updated_by?: number | null;
  rules: SpecialShiftWindowRuleInput[];
}

export interface SpecialShiftWindowListFilters {
  status?: string;
  org_unit_id?: number;
  start_date?: string;
  end_date?: string;
}

export interface SpecialShiftWindowPreviewRow {
  occurrence_id: number;
  rule_id: number;
  date: string;
  shift_id: number;
  shift_name: string;
  required_people: number;
  fulfillment_mode: SpecialShiftFulfillmentMode;
  priority_level: SpecialShiftPriorityLevel;
  eligible_employee_count: number;
  eligible_employee_ids: number[];
  blocking_issues: string[];
}

export interface SpecialShiftWindowPreview {
  window_id: number;
  can_activate: boolean;
  occurrence_count: number;
  rows: SpecialShiftWindowPreviewRow[];
  warnings: string[];
}

export interface SpecialShiftWindowRuleRecord {
  id: number;
  shift_id: number;
  shift_name: string;
  shift_code: string;
  required_people: number;
  plan_category: SpecialShiftPlanCategory;
  fulfillment_mode: SpecialShiftFulfillmentMode;
  priority_level: SpecialShiftPriorityLevel;
  qualification_id: number | null;
  qualification_name: string | null;
  min_level: number | null;
  is_mandatory: boolean;
  days_of_week: number[];
  notes: string | null;
  allow_employee_ids: number[];
  deny_employee_ids: number[];
}

export interface SpecialShiftWindowRecord {
  id: number;
  window_code: string;
  window_name: string;
  org_unit_id: number;
  org_unit_name: string;
  start_date: string;
  end_date: string;
  status: SpecialShiftWindowStatus;
  lock_after_apply: boolean;
  notes: string | null;
  created_by: number | null;
  updated_by: number | null;
  rule_count: number;
  occurrence_count: number;
  scheduled_count: number;
  applied_count: number;
  partial_count: number;
  latest_scheduling_run_id: number | null;
}

export interface SpecialShiftWindowDetail {
  window: SpecialShiftWindowRecord;
  rules: SpecialShiftWindowRuleRecord[];
  occurrence_summary: {
    occurrence_count: number;
    required_headcount_total: number;
    scheduled_count: number;
    applied_count: number;
    partial_count: number;
    cancelled_count: number;
    infeasible_count: number;
  };
  preview_summary: SpecialShiftWindowPreview;
  latest_scheduling_run_id: number | null;
}

export interface SpecialShiftSolverRequirement {
  occurrence_id: number;
  window_id: number;
  window_code: string;
  date: string;
  shift_id: number;
  required_people: number;
  eligible_employee_ids: number[];
  fulfillment_mode: SpecialShiftFulfillmentMode;
  priority_level: SpecialShiftPriorityLevel;
  plan_category: SpecialShiftPlanCategory;
  lock_after_apply: boolean;
}

class SpecialShiftWindowError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'SpecialShiftWindowError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBoolean = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'TRUE', 'yes', 'YES'].includes(value);
  }
  return fallback;
};

const normalizeFulfillmentMode = (
  value: unknown,
  fallback: SpecialShiftFulfillmentMode = 'HARD',
): SpecialShiftFulfillmentMode => {
  return String(value || fallback).toUpperCase() === 'SOFT' ? 'SOFT' : 'HARD';
};

const normalizePriorityLevel = (
  value: unknown,
  fallback: SpecialShiftPriorityLevel = 'HIGH',
): SpecialShiftPriorityLevel => {
  const normalized = String(value || fallback).toUpperCase();
  if (normalized === 'CRITICAL') {
    return 'CRITICAL';
  }
  if (normalized === 'NORMAL') {
    return 'NORMAL';
  }
  return 'HIGH';
};

const parseJsonArray = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item))
        : [];
    } catch (error) {
      return [];
    }
  }
  return [];
};

const uniquePositiveNumbers = (values: unknown): number[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0),
    ),
  ).sort((a, b) => a - b);
};

const normalizeDateString = (value: string, fieldName: string): string => {
  const date = dayjs(value);
  if (!date.isValid()) {
    throw new SpecialShiftWindowError(`${fieldName} 不是有效日期`, 400);
  }
  return date.format('YYYY-MM-DD');
};

const normalizeRuleInput = (rule: SpecialShiftWindowRuleInput, index: number): SpecialShiftWindowRuleInput => {
  const shiftId = Number(rule.shift_id);
  const requiredPeople = Number(rule.required_people);
  const daysOfWeek = uniquePositiveNumbers(rule.days_of_week);
  const allowEmployeeIds = uniquePositiveNumbers(rule.allow_employee_ids);
  const denyEmployeeIds = uniquePositiveNumbers(rule.deny_employee_ids);

  if (!Number.isFinite(shiftId) || shiftId <= 0) {
    throw new SpecialShiftWindowError(`第 ${index + 1} 条规则的 shift_id 无效`, 400);
  }
  if (!Number.isFinite(requiredPeople) || requiredPeople <= 0) {
    throw new SpecialShiftWindowError(`第 ${index + 1} 条规则的 required_people 必须大于 0`, 400);
  }
  if (!daysOfWeek.length || daysOfWeek.some((day) => day < 1 || day > 7)) {
    throw new SpecialShiftWindowError(`第 ${index + 1} 条规则的 days_of_week 必须是 1 到 7`, 400);
  }

  const overlap = allowEmployeeIds.filter((employeeId) => denyEmployeeIds.includes(employeeId));
  if (overlap.length > 0) {
    throw new SpecialShiftWindowError(`第 ${index + 1} 条规则的 allow/deny 员工存在重叠`, 400, overlap);
  }

  const qualificationId = normalizeNumber(rule.qualification_id);
  const minLevel = qualificationId ? Math.max(1, normalizeNumber(rule.min_level) ?? 1) : null;

  return {
    shift_id: shiftId,
    required_people: requiredPeople,
    plan_category: (rule.plan_category || 'BASE') as SpecialShiftPlanCategory,
    fulfillment_mode: normalizeFulfillmentMode(
      rule.fulfillment_mode ?? (rule.is_mandatory === false ? 'SOFT' : 'HARD'),
    ),
    priority_level: normalizePriorityLevel(rule.priority_level),
    qualification_id: qualificationId,
    min_level: minLevel,
    is_mandatory: normalizeBoolean(rule.is_mandatory, true),
    days_of_week: daysOfWeek,
    notes: rule.notes ?? null,
    allow_employee_ids: allowEmployeeIds,
    deny_employee_ids: denyEmployeeIds,
  };
};

const mapWindowRow = (row: RowDataPacket): SpecialShiftWindowRecord => ({
  id: Number(row.id),
  window_code: String(row.window_code),
  window_name: String(row.window_name),
  org_unit_id: Number(row.org_unit_id),
  org_unit_name: String(row.org_unit_name || ''),
  start_date: dayjs(row.start_date).format('YYYY-MM-DD'),
  end_date: dayjs(row.end_date).format('YYYY-MM-DD'),
  status: String(row.status) as SpecialShiftWindowStatus,
  lock_after_apply: normalizeBoolean(row.lock_after_apply, true),
  notes: row.notes ? String(row.notes) : null,
  created_by: normalizeNumber(row.created_by),
  updated_by: normalizeNumber(row.updated_by),
  rule_count: Number(row.rule_count || 0),
  occurrence_count: Number(row.occurrence_count || 0),
  scheduled_count: Number(row.scheduled_count || 0),
  applied_count: Number(row.applied_count || 0),
  partial_count: Number(row.partial_count || 0),
  latest_scheduling_run_id: normalizeNumber(row.latest_scheduling_run_id),
});

const ensureWindowExists = async (
  connection: DbExecutor,
  windowId: number,
): Promise<RowDataPacket> => {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT
        ssw.*,
        ou.unit_name AS org_unit_name,
        (SELECT COUNT(*) FROM special_shift_window_rules sswr WHERE sswr.window_id = ssw.id) AS rule_count,
        (SELECT COUNT(*) FROM special_shift_occurrences sso WHERE sso.window_id = ssw.id) AS occurrence_count,
        (SELECT COUNT(*) FROM special_shift_occurrences sso WHERE sso.window_id = ssw.id AND sso.status = 'SCHEDULED') AS scheduled_count,
        (SELECT COUNT(*) FROM special_shift_occurrences sso WHERE sso.window_id = ssw.id AND sso.status = 'APPLIED') AS applied_count,
        (SELECT COUNT(*) FROM special_shift_occurrences sso WHERE sso.window_id = ssw.id AND sso.status = 'PARTIAL') AS partial_count,
        (SELECT MAX(sso.scheduling_run_id) FROM special_shift_occurrences sso WHERE sso.window_id = ssw.id) AS latest_scheduling_run_id
      FROM special_shift_windows ssw
      JOIN organization_units ou ON ou.id = ssw.org_unit_id
      WHERE ssw.id = ?
      LIMIT 1
    `,
    [windowId],
  );

  if (!rows.length) {
    throw new SpecialShiftWindowError('专项班次窗口不存在', 404);
  }

  return rows[0];
};

const validateWindowPayload = async (
  connection: DbExecutor,
  payload: SpecialShiftWindowInput,
): Promise<SpecialShiftWindowInput> => {
  const windowName = String(payload.window_name || '').trim();
  if (!windowName) {
    throw new SpecialShiftWindowError('window_name 为必填项', 400);
  }

  const orgUnitId = Number(payload.org_unit_id);
  if (!Number.isFinite(orgUnitId) || orgUnitId <= 0) {
    throw new SpecialShiftWindowError('org_unit_id 无效', 400);
  }

  const startDate = normalizeDateString(payload.start_date, 'start_date');
  const endDate = normalizeDateString(payload.end_date, 'end_date');
  if (dayjs(startDate).isAfter(dayjs(endDate), 'day')) {
    throw new SpecialShiftWindowError('start_date 不能晚于 end_date', 400);
  }

  if (!Array.isArray(payload.rules) || payload.rules.length === 0) {
    throw new SpecialShiftWindowError('至少需要一条专项班次规则', 400);
  }

  const [orgRows] = await connection.execute<RowDataPacket[]>(
    'SELECT id FROM organization_units WHERE id = ? LIMIT 1',
    [orgUnitId],
  );
  if (!orgRows.length) {
    throw new SpecialShiftWindowError('org_unit_id 不存在', 400);
  }

  const normalizedRules = payload.rules.map((rule, index) => normalizeRuleInput(rule, index));
  const shiftIds = Array.from(new Set(normalizedRules.map((rule) => rule.shift_id)));
  const qualificationIds = Array.from(
    new Set(
      normalizedRules
        .map((rule) => rule.qualification_id)
        .filter((qualificationId): qualificationId is number => Number.isFinite(qualificationId)),
    ),
  );

  const [shiftRows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT id, shift_code, nominal_hours
      FROM shift_definitions
      WHERE id IN (${shiftIds.map(() => '?').join(',')})
    `,
    shiftIds,
  );
  const shiftMap = new Map<number, RowDataPacket>(shiftRows.map((row) => [Number(row.id), row]));

  normalizedRules.forEach((rule, index) => {
    const shiftRow = shiftMap.get(rule.shift_id);
    if (!shiftRow) {
      throw new SpecialShiftWindowError(`第 ${index + 1} 条规则引用的班次不存在`, 400);
    }
    const shiftCode = String(shiftRow.shift_code || '').toUpperCase();
    const nominalHours = Number(shiftRow.nominal_hours || 0);
    if (shiftCode === 'REST' || nominalHours <= 0) {
      throw new SpecialShiftWindowError(`第 ${index + 1} 条规则不能使用 REST 或 0 工时班次`, 400);
    }
  });

  if (qualificationIds.length > 0) {
    const [qualificationRows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT id
        FROM qualifications
        WHERE id IN (${qualificationIds.map(() => '?').join(',')})
      `,
      qualificationIds,
    );
    const qualificationSet = new Set(qualificationRows.map((row) => Number(row.id)));
    normalizedRules.forEach((rule, index) => {
      if (rule.qualification_id && !qualificationSet.has(rule.qualification_id)) {
        throw new SpecialShiftWindowError(`第 ${index + 1} 条规则引用的资质不存在`, 400);
      }
    });
  }

  return {
    window_name: windowName,
    org_unit_id: orgUnitId,
    start_date: startDate,
    end_date: endDate,
    lock_after_apply: normalizeBoolean(payload.lock_after_apply, true),
    notes: payload.notes ?? null,
    created_by: normalizeNumber(payload.created_by),
    updated_by: normalizeNumber(payload.updated_by),
    rules: normalizedRules,
  };
};

const generateNextWindowCode = async (connection: DbExecutor): Promise<string> => {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT window_code
      FROM special_shift_windows
      WHERE window_code LIKE 'SSW-%'
      ORDER BY id DESC
      LIMIT 1
    `,
  );

  if (!rows.length) {
    return 'SSW-00001';
  }

  const lastCode = String(rows[0].window_code || 'SSW-00000');
  const lastNumber = Number(lastCode.split('-')[1] || 0);
  return `SSW-${String(lastNumber + 1).padStart(5, '0')}`;
};

const insertRules = async (
  connection: DbExecutor,
  windowId: number,
  rules: SpecialShiftWindowRuleInput[],
): Promise<void> => {
  for (const rule of rules) {
    const [result] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO special_shift_window_rules
          (
            window_id,
            shift_id,
            required_people,
            plan_category,
            fulfillment_mode,
            priority_level,
            qualification_id,
            min_level,
            is_mandatory,
            days_of_week,
            notes
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        windowId,
        rule.shift_id,
        rule.required_people,
        rule.plan_category || 'BASE',
        rule.fulfillment_mode || 'HARD',
        rule.priority_level || 'HIGH',
        rule.qualification_id ?? null,
        rule.qualification_id ? rule.min_level ?? 1 : null,
        rule.is_mandatory !== false ? 1 : 0,
        JSON.stringify(rule.days_of_week),
        rule.notes ?? null,
      ],
    );

    const ruleId = Number(result.insertId);
    for (const employeeId of rule.allow_employee_ids || []) {
      await connection.execute(
        `
          INSERT INTO special_shift_window_employee_scopes
            (rule_id, employee_id, scope_type)
          VALUES (?, ?, 'ALLOW')
        `,
        [ruleId, employeeId],
      );
    }
    for (const employeeId of rule.deny_employee_ids || []) {
      await connection.execute(
        `
          INSERT INTO special_shift_window_employee_scopes
            (rule_id, employee_id, scope_type)
          VALUES (?, ?, 'DENY')
        `,
        [ruleId, employeeId],
      );
    }
  }
};

const getRuleRecords = async (
  connection: DbExecutor,
  windowId: number,
): Promise<SpecialShiftWindowRuleRecord[]> => {
  const [ruleRows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT
        sswr.id,
        sswr.shift_id,
        sd.shift_name,
        sd.shift_code,
        sswr.required_people,
        sswr.plan_category,
        sswr.fulfillment_mode,
        sswr.priority_level,
        sswr.qualification_id,
        q.qualification_name,
        sswr.min_level,
        sswr.is_mandatory,
        sswr.days_of_week,
        sswr.notes
      FROM special_shift_window_rules sswr
      JOIN shift_definitions sd ON sd.id = sswr.shift_id
      LEFT JOIN qualifications q ON q.id = sswr.qualification_id
      WHERE sswr.window_id = ?
      ORDER BY sswr.id
    `,
    [windowId],
  );

  const ruleIds = ruleRows.map((row) => Number(row.id));
  const scopeMap = new Map<number, { allow: number[]; deny: number[] }>();

  if (ruleIds.length > 0) {
    const [scopeRows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT rule_id, employee_id, scope_type
        FROM special_shift_window_employee_scopes
        WHERE rule_id IN (${ruleIds.map(() => '?').join(',')})
        ORDER BY rule_id, employee_id
      `,
      ruleIds,
    );

    scopeRows.forEach((row) => {
      const ruleId = Number(row.rule_id);
      if (!scopeMap.has(ruleId)) {
        scopeMap.set(ruleId, { allow: [], deny: [] });
      }
      const bucket = scopeMap.get(ruleId)!;
      if (String(row.scope_type) === 'ALLOW') {
        bucket.allow.push(Number(row.employee_id));
      } else {
        bucket.deny.push(Number(row.employee_id));
      }
    });
  }

  return ruleRows.map((row) => {
    const scopes = scopeMap.get(Number(row.id)) || { allow: [], deny: [] };
    return {
      id: Number(row.id),
      shift_id: Number(row.shift_id),
      shift_name: String(row.shift_name || ''),
      shift_code: String(row.shift_code || ''),
      required_people: Number(row.required_people),
      plan_category: String(row.plan_category || 'BASE') as SpecialShiftPlanCategory,
      fulfillment_mode: normalizeFulfillmentMode(row.fulfillment_mode),
      priority_level: normalizePriorityLevel(row.priority_level),
      qualification_id: normalizeNumber(row.qualification_id),
      qualification_name: row.qualification_name ? String(row.qualification_name) : null,
      min_level: normalizeNumber(row.min_level),
      is_mandatory: normalizeBoolean(row.is_mandatory, true),
      days_of_week: parseJsonArray(row.days_of_week),
      notes: row.notes ? String(row.notes) : null,
      allow_employee_ids: scopes.allow,
      deny_employee_ids: scopes.deny,
    };
  });
};

const getOccurrenceSummary = async (
  connection: DbExecutor,
  windowId: number,
): Promise<SpecialShiftWindowDetail['occurrence_summary']> => {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT
        COUNT(*) AS occurrence_count,
        COALESCE(SUM(required_people), 0) AS required_headcount_total,
        COALESCE(SUM(CASE WHEN status = 'SCHEDULED' THEN 1 ELSE 0 END), 0) AS scheduled_count,
        COALESCE(SUM(CASE WHEN status = 'APPLIED' THEN 1 ELSE 0 END), 0) AS applied_count,
        COALESCE(SUM(CASE WHEN status = 'PARTIAL' THEN 1 ELSE 0 END), 0) AS partial_count,
        COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled_count,
        COALESCE(SUM(CASE WHEN status = 'INFEASIBLE' THEN 1 ELSE 0 END), 0) AS infeasible_count
      FROM special_shift_occurrences
      WHERE window_id = ?
    `,
    [windowId],
  );

  const row = rows[0];
  return {
    occurrence_count: Number(row?.occurrence_count || 0),
    required_headcount_total: Number(row?.required_headcount_total || 0),
    scheduled_count: Number(row?.scheduled_count || 0),
    applied_count: Number(row?.applied_count || 0),
    partial_count: Number(row?.partial_count || 0),
    cancelled_count: Number(row?.cancelled_count || 0),
    infeasible_count: Number(row?.infeasible_count || 0),
  };
};

const buildPreviewRows = async (
  connection: DbExecutor,
  windowRow: RowDataPacket,
  rules: SpecialShiftWindowRuleRecord[],
): Promise<SpecialShiftWindowPreview> => {
  const orgContext = await SpecialShiftEligibilityService.buildOrgEmployeeContext(Number(windowRow.org_unit_id), connection);
  const [occurrenceRows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT
        sso.id AS occurrence_id,
        sso.rule_id,
        sso.occurrence_date,
        sso.shift_id,
        sd.shift_name,
        sso.required_people,
        sso.fulfillment_mode,
        sso.priority_level
      FROM special_shift_occurrences sso
      JOIN shift_definitions sd ON sd.id = sso.shift_id
      WHERE sso.window_id = ?
      ORDER BY sso.occurrence_date, sso.id
    `,
    [windowRow.id],
  );

  const ruleMap = new Map<number, SpecialShiftWindowRuleRecord>(rules.map((rule) => [rule.id, rule]));
  const rows: SpecialShiftWindowPreviewRow[] = occurrenceRows.map((row) => {
    const rule = ruleMap.get(Number(row.rule_id));
    const eligibilityRule: SpecialShiftEligibilityRule = {
      qualificationId: rule?.qualification_id ?? null,
      minLevel: rule?.min_level ?? null,
      allowEmployeeIds: rule?.allow_employee_ids || [],
      denyEmployeeIds: rule?.deny_employee_ids || [],
    };
    const eligibleEmployeeIds = SpecialShiftEligibilityService.computeEligibleEmployeeIds(orgContext, eligibilityRule);
    const blockingIssues =
      rule?.fulfillment_mode === 'SOFT'
        ? []
        : SpecialShiftEligibilityService.buildBlockingIssues(
            Number(row.required_people),
            eligibleEmployeeIds,
          );
    return {
      occurrence_id: Number(row.occurrence_id),
      rule_id: Number(row.rule_id),
      date: dayjs(row.occurrence_date).format('YYYY-MM-DD'),
      shift_id: Number(row.shift_id),
      shift_name: String(row.shift_name || ''),
      required_people: Number(row.required_people),
      fulfillment_mode: normalizeFulfillmentMode(row.fulfillment_mode),
      priority_level: normalizePriorityLevel(row.priority_level),
      eligible_employee_count: eligibleEmployeeIds.length,
      eligible_employee_ids: eligibleEmployeeIds,
      blocking_issues: blockingIssues,
    };
  });

  const warnings: string[] = [];
  if (rows.length === 0) {
    warnings.push('当前窗口没有展开出任何 occurrence');
  }
  rows.forEach((row) => {
    if (row.fulfillment_mode === 'SOFT' && row.eligible_employee_count < row.required_people) {
      warnings.push(`${row.date} ${row.shift_name} 为 SOFT 规则，静态候选人数不足，求解时可能产生 partial`);
    }
  });
  const nearCapacityWarnings = rows
    .filter((row) => row.eligible_employee_count >= row.required_people && row.eligible_employee_count - row.required_people <= 1)
    .map((row) => `${row.date} ${row.shift_name} 候选池仅比需求多 ${row.eligible_employee_count - row.required_people} 人`);
  warnings.push(...nearCapacityWarnings);

  const canActivate = rows.length > 0 && rows.every((row) => row.blocking_issues.length === 0);
  return {
    window_id: Number(windowRow.id),
    can_activate: canActivate,
    occurrence_count: rows.length,
    rows,
    warnings,
  };
};

const buildOrgContextCache = async (
  connection: DbExecutor,
  orgUnitIds: number[],
): Promise<Map<number, SpecialShiftOrgEmployeeContext>> => {
  const cache = new Map<number, SpecialShiftOrgEmployeeContext>();
  for (const orgUnitId of Array.from(new Set(orgUnitIds))) {
    cache.set(orgUnitId, await SpecialShiftEligibilityService.buildOrgEmployeeContext(orgUnitId, connection));
  }
  return cache;
};

export class SpecialShiftWindowService {
  static normalizeError(error: unknown): SpecialShiftWindowError {
    if (error instanceof SpecialShiftWindowError) {
      return error;
    }
    return new SpecialShiftWindowError(
      error instanceof Error ? error.message : '专项班次窗口处理失败',
      500,
    );
  }

  static async createWindow(payload: SpecialShiftWindowInput): Promise<SpecialShiftWindowDetail> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const normalized = await validateWindowPayload(connection, payload);
      const windowCode = await generateNextWindowCode(connection);

      const [result] = await connection.execute<ResultSetHeader>(
        `
          INSERT INTO special_shift_windows
            (
              window_code,
              window_name,
              org_unit_id,
              start_date,
              end_date,
              status,
              lock_after_apply,
              notes,
              created_by,
              updated_by
            )
          VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)
        `,
        [
          windowCode,
          normalized.window_name,
          normalized.org_unit_id,
          normalized.start_date,
          normalized.end_date,
          normalized.lock_after_apply ? 1 : 0,
          normalized.notes ?? null,
          normalized.created_by ?? null,
          normalized.updated_by ?? normalized.created_by ?? null,
        ],
      );

      const windowId = Number(result.insertId);
      await insertRules(connection, windowId, normalized.rules);
      await SpecialShiftOccurrenceService.rebuildOccurrences(connection, windowId);

      await connection.commit();
      return this.getWindowDetail(windowId);
    } catch (error) {
      await connection.rollback();
      throw this.normalizeError(error);
    } finally {
      connection.release();
    }
  }

  static async updateWindow(windowId: number, payload: SpecialShiftWindowInput): Promise<SpecialShiftWindowDetail> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const existingWindow = await ensureWindowExists(connection, windowId);
      if (String(existingWindow.status) !== 'DRAFT') {
        throw new SpecialShiftWindowError('只有 DRAFT 状态的窗口允许修改', 409);
      }

      const normalized = await validateWindowPayload(connection, payload);
      await connection.execute(
        `
          UPDATE special_shift_windows
          SET window_name = ?,
              org_unit_id = ?,
              start_date = ?,
              end_date = ?,
              lock_after_apply = ?,
              notes = ?,
              updated_by = ?
          WHERE id = ?
        `,
        [
          normalized.window_name,
          normalized.org_unit_id,
          normalized.start_date,
          normalized.end_date,
          normalized.lock_after_apply ? 1 : 0,
          normalized.notes ?? null,
          normalized.updated_by ?? null,
          windowId,
        ],
      );

      await connection.execute('DELETE FROM special_shift_occurrences WHERE window_id = ?', [windowId]);
      await connection.execute('DELETE FROM special_shift_window_rules WHERE window_id = ?', [windowId]);
      await insertRules(connection, windowId, normalized.rules);
      await SpecialShiftOccurrenceService.rebuildOccurrences(connection, windowId);

      await connection.commit();
      return this.getWindowDetail(windowId);
    } catch (error) {
      await connection.rollback();
      throw this.normalizeError(error);
    } finally {
      connection.release();
    }
  }

  static async listWindows(filters: SpecialShiftWindowListFilters = {}): Promise<SpecialShiftWindowRecord[]> {
    const where: string[] = ['1 = 1'];
    const params: Array<string | number> = [];

    if (filters.status) {
      where.push('ssw.status = ?');
      params.push(filters.status);
    }
    if (filters.org_unit_id) {
      where.push('ssw.org_unit_id = ?');
      params.push(filters.org_unit_id);
    }
    if (filters.start_date) {
      where.push('ssw.end_date >= ?');
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      where.push('ssw.start_date <= ?');
      params.push(filters.end_date);
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `
        SELECT
          ssw.id,
          ssw.window_code,
          ssw.window_name,
          ssw.org_unit_id,
          ou.unit_name AS org_unit_name,
          ssw.start_date,
          ssw.end_date,
          ssw.status,
          ssw.lock_after_apply,
          ssw.notes,
          ssw.created_by,
          ssw.updated_by,
          (SELECT COUNT(*) FROM special_shift_window_rules sswr WHERE sswr.window_id = ssw.id) AS rule_count,
          (SELECT COUNT(*) FROM special_shift_occurrences sso WHERE sso.window_id = ssw.id) AS occurrence_count,
          (SELECT COUNT(*) FROM special_shift_occurrences sso WHERE sso.window_id = ssw.id AND sso.status = 'SCHEDULED') AS scheduled_count,
          (SELECT COUNT(*) FROM special_shift_occurrences sso WHERE sso.window_id = ssw.id AND sso.status = 'APPLIED') AS applied_count,
          (SELECT COUNT(*) FROM special_shift_occurrences sso WHERE sso.window_id = ssw.id AND sso.status = 'PARTIAL') AS partial_count,
          (SELECT MAX(sso.scheduling_run_id) FROM special_shift_occurrences sso WHERE sso.window_id = ssw.id) AS latest_scheduling_run_id
        FROM special_shift_windows ssw
        JOIN organization_units ou ON ou.id = ssw.org_unit_id
        WHERE ${where.join(' AND ')}
        ORDER BY ssw.created_at DESC, ssw.id DESC
      `,
      params,
    );

    return rows.map(mapWindowRow);
  }

  static async getWindowDetail(windowId: number): Promise<SpecialShiftWindowDetail> {
    const windowRow = await ensureWindowExists(pool, windowId);
    const rules = await getRuleRecords(pool, windowId);
    const preview = await buildPreviewRows(pool, windowRow, rules);
    const occurrenceSummary = await getOccurrenceSummary(pool, windowId);

    return {
      window: mapWindowRow(windowRow),
      rules,
      occurrence_summary: occurrenceSummary,
      preview_summary: preview,
      latest_scheduling_run_id: normalizeNumber(windowRow.latest_scheduling_run_id),
    };
  }

  static async previewWindow(windowId: number): Promise<SpecialShiftWindowPreview> {
    const windowRow = await ensureWindowExists(pool, windowId);
    const rules = await getRuleRecords(pool, windowId);
    return buildPreviewRows(pool, windowRow, rules);
  }

  static async activateWindow(windowId: number): Promise<SpecialShiftWindowDetail> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const windowRow = await ensureWindowExists(connection, windowId);
      if (String(windowRow.status) !== 'DRAFT') {
        throw new SpecialShiftWindowError('只有 DRAFT 状态的窗口允许激活', 409);
      }

      const rules = await getRuleRecords(connection, windowId);
      const preview = await buildPreviewRows(connection, windowRow, rules);
      if (!preview.can_activate) {
        throw new SpecialShiftWindowError('静态候选人不足，无法激活专项班次窗口', 409, preview);
      }

      await connection.execute(
        `
          UPDATE special_shift_windows
          SET status = 'ACTIVE'
          WHERE id = ?
        `,
        [windowId],
      );

      await connection.execute(
        `
          UPDATE special_shift_occurrences
          SET status = 'PENDING',
              scheduling_run_id = NULL
          WHERE window_id = ?
            AND status IN ('PENDING', 'INFEASIBLE', 'CANCELLED', 'PARTIAL')
        `,
        [windowId],
      );

      await connection.commit();
      return this.getWindowDetail(windowId);
    } catch (error) {
      await connection.rollback();
      throw this.normalizeError(error);
    } finally {
      connection.release();
    }
  }

  static async cancelWindow(windowId: number): Promise<SpecialShiftWindowDetail> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await ensureWindowExists(connection, windowId);

      await connection.execute(
        `
          UPDATE special_shift_windows
          SET status = 'CANCELLED'
          WHERE id = ?
        `,
        [windowId],
      );

      await connection.execute(
        `
          UPDATE special_shift_occurrences
          SET status = 'CANCELLED'
          WHERE window_id = ?
            AND occurrence_date >= CURDATE()
            AND status <> 'APPLIED'
        `,
        [windowId],
      );

      await connection.commit();
      return this.getWindowDetail(windowId);
    } catch (error) {
      await connection.rollback();
      throw this.normalizeError(error);
    } finally {
      connection.release();
    }
  }

  static async getWindowOccurrences(
    windowId: number,
    filters: SpecialShiftOccurrenceFilters = {},
  ): Promise<SpecialShiftOccurrenceListItem[]> {
    await ensureWindowExists(pool, windowId);
    return SpecialShiftOccurrenceService.listOccurrences(pool, windowId, filters);
  }

  static async fetchSolverRequirements(
    startDate: string,
    endDate: string,
    executor: DbExecutor = pool,
  ): Promise<SpecialShiftSolverRequirement[]> {
    const [occurrenceRows] = await executor.execute<RowDataPacket[]>(
      `
        SELECT
          sso.id AS occurrence_id,
          sso.window_id,
          ssw.window_code,
          ssw.org_unit_id,
          ssw.lock_after_apply,
          sso.rule_id,
          sso.occurrence_date,
          sso.shift_id,
          sso.required_people,
          sso.plan_category,
          sso.fulfillment_mode,
          sso.priority_level,
          sso.qualification_id,
          sso.min_level
        FROM special_shift_occurrences sso
        JOIN special_shift_windows ssw ON ssw.id = sso.window_id
        WHERE ssw.status = 'ACTIVE'
          AND sso.status IN ('PENDING', 'SCHEDULED')
          AND sso.occurrence_date BETWEEN ? AND ?
        ORDER BY sso.occurrence_date, sso.id
      `,
      [startDate, endDate],
    );

    if (!occurrenceRows.length) {
      return [];
    }

    const ruleIds = Array.from(new Set(occurrenceRows.map((row) => Number(row.rule_id))));
    const orgContextCache = await buildOrgContextCache(
      executor,
      occurrenceRows.map((row) => Number(row.org_unit_id)),
    );

    const scopeMap = new Map<number, { allow: number[]; deny: number[] }>();
    const [scopeRows] = await executor.execute<RowDataPacket[]>(
      `
        SELECT rule_id, employee_id, scope_type
        FROM special_shift_window_employee_scopes
        WHERE rule_id IN (${ruleIds.map(() => '?').join(',')})
      `,
      ruleIds,
    );

    scopeRows.forEach((row) => {
      const ruleId = Number(row.rule_id);
      if (!scopeMap.has(ruleId)) {
        scopeMap.set(ruleId, { allow: [], deny: [] });
      }
      if (String(row.scope_type) === 'ALLOW') {
        scopeMap.get(ruleId)!.allow.push(Number(row.employee_id));
      } else {
        scopeMap.get(ruleId)!.deny.push(Number(row.employee_id));
      }
    });

    return occurrenceRows.map((row) => {
      const ruleScopes = scopeMap.get(Number(row.rule_id)) || { allow: [], deny: [] };
      const context = orgContextCache.get(Number(row.org_unit_id));
      const eligibilityRule: SpecialShiftEligibilityRule = {
        qualificationId: normalizeNumber(row.qualification_id),
        minLevel: normalizeNumber(row.min_level),
        allowEmployeeIds: ruleScopes.allow,
        denyEmployeeIds: ruleScopes.deny,
      };
      const eligibleEmployeeIds = context
        ? SpecialShiftEligibilityService.computeEligibleEmployeeIds(context, eligibilityRule)
        : [];

      return {
        occurrence_id: Number(row.occurrence_id),
        window_id: Number(row.window_id),
        window_code: String(row.window_code || ''),
        date: dayjs(row.occurrence_date).format('YYYY-MM-DD'),
        shift_id: Number(row.shift_id),
        required_people: Number(row.required_people),
        eligible_employee_ids: eligibleEmployeeIds,
        fulfillment_mode: normalizeFulfillmentMode(row.fulfillment_mode),
        priority_level: normalizePriorityLevel(row.priority_level),
        plan_category: String(row.plan_category || 'BASE') as SpecialShiftPlanCategory,
        lock_after_apply: normalizeBoolean(row.lock_after_apply, true),
      };
    });
  }

  static async markOccurrencesScheduled(
    runId: number,
    occurrenceIds: number[],
    executor: DbExecutor = pool,
  ): Promise<void> {
    if (!occurrenceIds.length) {
      return;
    }

    await executor.execute(
      `
        UPDATE special_shift_occurrences
        SET status = 'SCHEDULED',
            scheduling_run_id = ?
        WHERE id IN (${occurrenceIds.map(() => '?').join(',')})
          AND status IN ('PENDING', 'SCHEDULED', 'PARTIAL')
      `,
      [runId, ...occurrenceIds],
    );
  }
}

export { SpecialShiftWindowError };
export default SpecialShiftWindowService;
