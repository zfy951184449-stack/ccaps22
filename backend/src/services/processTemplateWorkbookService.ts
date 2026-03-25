import { ResultSetHeader, RowDataPacket, PoolConnection } from 'mysql2/promise';
import XLSX from 'xlsx';
import pool, { DbExecutor } from '../config/database';
import { updateTemplateTotalDays } from '../controllers/processTemplateController';
import { runConstraintValidation } from './constraintValidationService';
import { getEffectiveRulesForSchedules, replaceTemplateScheduleRules } from './templateResourceRuleService';
import { upsertTemplateScheduleBinding } from './resourceNodeService';
import { isTemplateResourceRulesEnabled } from '../utils/featureFlags';
import { extractMissingTableName, isMissingTableError } from '../utils/missingTableGuard';

const WORKBOOK_VERSION = 1;
const WORKBOOK_SOURCE = 'process-template';
const MULTI_VALUE_DELIMITER = '|';

type WorkbookSheetName =
  | 'Meta'
  | 'README'
  | 'Templates'
  | 'Stages'
  | 'Operations'
  | 'Constraints'
  | 'ShareGroups'
  | 'ShareGroupMembers'
  | 'ResourceBindings'
  | 'ResourceRequirements';

export type TemplateWorkbookImportMode = 'create' | 'replace';

export interface TemplateWorkbookIssue {
  severity: 'blocking' | 'warning';
  sheet: WorkbookSheetName | 'Workbook';
  row?: number;
  field?: string;
  code: string;
  message: string;
}

export interface TemplateWorkbookActionSummary {
  template_code: string;
  template_name: string;
  action: TemplateWorkbookImportMode;
  target_template_id: number | null;
  blocked_reason?: string | null;
}

export interface TemplateWorkbookTemplateResult {
  template_code: string;
  template_name: string;
  action: TemplateWorkbookImportMode;
  template_id: number | null;
  total_days: number | null;
  status: 'validated' | 'imported';
}

export interface TemplateWorkbookSummary {
  template_count: number;
  stage_count: number;
  operation_count: number;
  constraint_count: number;
  share_group_count: number;
  share_group_member_count: number;
  resource_binding_count: number;
  resource_requirement_count: number;
}

export interface TemplateWorkbookMutationResult {
  workbook_version: number;
  mode: TemplateWorkbookImportMode;
  dry_run: boolean;
  can_import: boolean;
  summary: TemplateWorkbookSummary;
  template_actions: TemplateWorkbookActionSummary[];
  template_results: TemplateWorkbookTemplateResult[];
  blocking_errors: TemplateWorkbookIssue[];
  warnings: TemplateWorkbookIssue[];
}

type SqlExecutor = DbExecutor;

type TemplateRow = {
  rowNumber: number;
  template_code: string;
  template_name: string;
  team_code: string | null;
  description: string | null;
  total_days: number | null;
};

type StageRow = {
  rowNumber: number;
  template_code: string;
  stage_code: string;
  stage_name: string;
  stage_order: number;
  start_day: number;
  description: string | null;
};

type OperationRow = {
  rowNumber: number;
  template_code: string;
  stage_code: string;
  schedule_key: string;
  operation_code: string;
  operation_day: number;
  recommended_time: number;
  recommended_day_offset: number;
  window_start_time: number;
  window_start_day_offset: number;
  window_end_time: number;
  window_end_day_offset: number;
  operation_order: number;
};

type ConstraintRow = {
  rowNumber: number;
  template_code: string;
  from_schedule_key: string;
  to_schedule_key: string;
  constraint_type: number;
  constraint_level: number;
  lag_time: number;
  lag_type: 'ASAP' | 'FIXED' | 'WINDOW' | 'NEXT_DAY' | 'NEXT_SHIFT' | 'COOLING' | 'BATCH_END';
  lag_min: number;
  lag_max: number | null;
  share_mode: 'NONE' | 'SAME_TEAM' | 'DIFFERENT';
  constraint_name: string | null;
  description: string | null;
};

type ShareGroupRow = {
  rowNumber: number;
  template_code: string;
  group_code: string;
  group_name: string;
  share_mode: 'SAME_TEAM' | 'DIFFERENT';
};

type ShareGroupMemberRow = {
  rowNumber: number;
  template_code: string;
  group_code: string;
  schedule_key: string;
};

type ResourceBindingRow = {
  rowNumber: number;
  template_code: string;
  schedule_key: string;
  resource_node_code: string;
};

type ResourceRequirementRow = {
  rowNumber: number;
  template_code: string;
  schedule_key: string;
  resource_type: 'ROOM' | 'EQUIPMENT' | 'VESSEL_CONTAINER' | 'TOOLING' | 'STERILIZATION_RESOURCE';
  required_count: number;
  is_mandatory: boolean;
  requires_exclusive_use: boolean;
  prep_minutes: number;
  changeover_minutes: number;
  cleanup_minutes: number;
  candidate_resource_codes: string[];
};

type ParsedWorkbook = {
  meta: Record<string, string>;
  templates: TemplateRow[];
  stages: StageRow[];
  operations: OperationRow[];
  constraints: ConstraintRow[];
  shareGroups: ShareGroupRow[];
  shareGroupMembers: ShareGroupMemberRow[];
  resourceBindings: ResourceBindingRow[];
  resourceRequirements: ResourceRequirementRow[];
  summary: TemplateWorkbookSummary;
  issues: TemplateWorkbookIssue[];
};

type TemplateReference = {
  id: number;
  template_code: string;
  template_name: string;
};

type OperationReference = {
  id: number;
  operation_code: string;
};

type TeamReference = {
  id: number;
  unit_code: string;
};

type ResourceNodeReference = {
  id: number;
  node_code: string;
};

type ResourceReference = {
  id: number;
  resource_code: string;
};

type WorkbookValidationContext = {
  existingTemplates: Map<string, TemplateReference>;
  operationIdsByCode: Map<string, number>;
  teamIdsByCode: Map<string, number>;
  resourceNodeIdsByCode: Map<string, number>;
  resourceIdsByCode: Map<string, number>;
};

type ExportTemplateRow = RowDataPacket & {
  id: number;
  template_code: string;
  template_name: string;
  team_id: number | null;
  team_code: string | null;
  description: string | null;
  total_days: number | null;
};

type ExportStageRow = RowDataPacket & {
  id: number;
  template_id: number;
  stage_code: string;
  stage_name: string;
  stage_order: number;
  start_day: number;
  description: string | null;
};

type ExportOperationRow = RowDataPacket & {
  id: number;
  stage_id: number;
  stage_code: string;
  operation_code: string;
  operation_day: number;
  recommended_time: number;
  recommended_day_offset: number;
  window_start_time: number;
  window_start_day_offset: number;
  window_end_time: number;
  window_end_day_offset: number;
  operation_order: number;
  operation_id: number;
};

type ExportConstraintRow = RowDataPacket & {
  id: number;
  schedule_id: number;
  predecessor_schedule_id: number;
  constraint_type: number;
  constraint_level: number;
  time_lag: number;
  lag_type: ConstraintRow['lag_type'] | null;
  lag_min: number | null;
  lag_max: number | null;
  share_mode: ConstraintRow['share_mode'] | null;
  constraint_name: string | null;
  description: string | null;
};

type ExportShareGroupRow = RowDataPacket & {
  id: number;
  group_code: string;
  group_name: string | null;
  share_mode: ShareGroupRow['share_mode'];
};

type ExportShareGroupMemberRow = RowDataPacket & {
  group_id: number;
  schedule_id: number;
};

type ExportResourceBindingRow = RowDataPacket & {
  template_schedule_id: number;
  node_code: string;
};

type ExportTemplateScheduleRef = {
  schedule_id: number;
  operation_id: number;
};

const SHEET_HEADERS: Record<WorkbookSheetName, string[]> = {
  Meta: ['key', 'value'],
  README: ['sheet', 'purpose', 'required_columns', 'notes'],
  Templates: ['template_code', 'template_name', 'team_code', 'description', 'total_days'],
  Stages: ['template_code', 'stage_code', 'stage_name', 'stage_order', 'start_day', 'description'],
  Operations: [
    'template_code',
    'stage_code',
    'schedule_key',
    'operation_code',
    'operation_day',
    'recommended_time',
    'recommended_day_offset',
    'window_start_time',
    'window_start_day_offset',
    'window_end_time',
    'window_end_day_offset',
    'operation_order',
  ],
  Constraints: [
    'template_code',
    'from_schedule_key',
    'to_schedule_key',
    'constraint_type',
    'constraint_level',
    'lag_time',
    'lag_type',
    'lag_min',
    'lag_max',
    'share_mode',
    'constraint_name',
    'description',
  ],
  ShareGroups: ['template_code', 'group_code', 'group_name', 'share_mode'],
  ShareGroupMembers: ['template_code', 'group_code', 'schedule_key'],
  ResourceBindings: ['template_code', 'schedule_key', 'resource_node_code'],
  ResourceRequirements: [
    'template_code',
    'schedule_key',
    'resource_type',
    'required_count',
    'is_mandatory',
    'requires_exclusive_use',
    'prep_minutes',
    'changeover_minutes',
    'cleanup_minutes',
    'candidate_resource_codes',
  ],
};

const RESOURCE_TYPES = new Set<ResourceRequirementRow['resource_type']>([
  'ROOM',
  'EQUIPMENT',
  'VESSEL_CONTAINER',
  'TOOLING',
  'STERILIZATION_RESOURCE',
]);

const SHARE_MODES = new Set<ConstraintRow['share_mode']>(['NONE', 'SAME_TEAM', 'DIFFERENT']);
const SHARE_GROUP_MODES = new Set<ShareGroupRow['share_mode']>(['SAME_TEAM', 'DIFFERENT']);
const LAG_TYPES = new Set<ConstraintRow['lag_type']>([
  'ASAP',
  'FIXED',
  'WINDOW',
  'NEXT_DAY',
  'NEXT_SHIFT',
  'COOLING',
  'BATCH_END',
]);

const addIssue = (
  issues: TemplateWorkbookIssue[],
  issue: TemplateWorkbookIssue,
) => {
  issues.push(issue);
};

const hasBlockingErrors = (issues: TemplateWorkbookIssue[]) => issues.some((issue) => issue.severity === 'blocking');

const toStringValue = (value: unknown): string => String(value ?? '').trim();

const toNullableString = (value: unknown): string | null => {
  const normalized = toStringValue(value);
  return normalized ? normalized : null;
};

const isRowBlank = (row: Record<string, unknown>) =>
  Object.values(row).every((value) => toStringValue(value) === '');

const parseIntegerCell = (
  value: unknown,
  issues: TemplateWorkbookIssue[],
  sheet: WorkbookSheetName,
  row: number,
  field: string,
  options: { required?: boolean; min?: number } = {},
): number | null => {
  const normalized = toStringValue(value);
  if (!normalized) {
    if (options.required) {
      addIssue(issues, {
        severity: 'blocking',
        sheet,
        row,
        field,
        code: 'REQUIRED_FIELD',
        message: `${field} 为必填项`,
      });
    }
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) {
    addIssue(issues, {
      severity: 'blocking',
      sheet,
      row,
      field,
      code: 'INVALID_INTEGER',
      message: `${field} 必须是整数`,
    });
    return null;
  }

  if (options.min !== undefined && parsed < options.min) {
    addIssue(issues, {
      severity: 'blocking',
      sheet,
      row,
      field,
      code: 'VALUE_TOO_SMALL',
      message: `${field} 不能小于 ${options.min}`,
    });
    return null;
  }

  return parsed;
};

const parseNumberCell = (
  value: unknown,
  issues: TemplateWorkbookIssue[],
  sheet: WorkbookSheetName,
  row: number,
  field: string,
  options: { required?: boolean; min?: number; max?: number } = {},
): number | null => {
  const normalized = toStringValue(value);
  if (!normalized) {
    if (options.required) {
      addIssue(issues, {
        severity: 'blocking',
        sheet,
        row,
        field,
        code: 'REQUIRED_FIELD',
        message: `${field} 为必填项`,
      });
    }
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    addIssue(issues, {
      severity: 'blocking',
      sheet,
      row,
      field,
      code: 'INVALID_NUMBER',
      message: `${field} 必须是数字`,
    });
    return null;
  }

  if (options.min !== undefined && parsed < options.min) {
    addIssue(issues, {
      severity: 'blocking',
      sheet,
      row,
      field,
      code: 'VALUE_TOO_SMALL',
      message: `${field} 不能小于 ${options.min}`,
    });
    return null;
  }

  if (options.max !== undefined && parsed > options.max) {
    addIssue(issues, {
      severity: 'blocking',
      sheet,
      row,
      field,
      code: 'VALUE_TOO_LARGE',
      message: `${field} 不能大于 ${options.max}`,
    });
    return null;
  }

  return parsed;
};

const parseBooleanCell = (
  value: unknown,
  issues: TemplateWorkbookIssue[],
  sheet: WorkbookSheetName,
  row: number,
  field: string,
  defaultValue: boolean,
): boolean => {
  const normalized = toStringValue(value);
  if (!normalized) {
    return defaultValue;
  }

  const truthy = new Set(['1', 'true', 'yes', 'y']);
  const falsy = new Set(['0', 'false', 'no', 'n']);
  const lowered = normalized.toLowerCase();
  if (truthy.has(lowered)) {
    return true;
  }
  if (falsy.has(lowered)) {
    return false;
  }

  addIssue(issues, {
    severity: 'blocking',
    sheet,
    row,
    field,
    code: 'INVALID_BOOLEAN',
    message: `${field} 必须是 true/false 或 1/0`,
  });
  return defaultValue;
};

const parseConstraintType = (
  value: unknown,
  issues: TemplateWorkbookIssue[],
  row: number,
): number | null => {
  const normalized = toStringValue(value).toUpperCase();
  if (!normalized) {
    addIssue(issues, {
      severity: 'blocking',
      sheet: 'Constraints',
      row,
      field: 'constraint_type',
      code: 'REQUIRED_FIELD',
      message: 'constraint_type 为必填项',
    });
    return null;
  }

  if (['1', '2', '3', '4'].includes(normalized)) {
    return Number(normalized);
  }

  const map: Record<string, number> = { FS: 1, SS: 2, FF: 3, SF: 4 };
  if (map[normalized]) {
    return map[normalized];
  }

  addIssue(issues, {
    severity: 'blocking',
    sheet: 'Constraints',
    row,
    field: 'constraint_type',
    code: 'INVALID_CONSTRAINT_TYPE',
    message: 'constraint_type 仅支持 1/2/3/4 或 FS/SS/FF/SF',
  });
  return null;
};

const parseSheetRecords = (
  workbook: XLSX.WorkBook,
  sheetName: WorkbookSheetName,
  issues: TemplateWorkbookIssue[],
): Array<{ rowNumber: number; record: Record<string, unknown> }> => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    addIssue(issues, {
      severity: 'blocking',
      sheet: sheetName,
      code: 'MISSING_SHEET',
      message: `缺少 Sheet: ${sheetName}`,
    });
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1, defval: '', raw: false });
  if (!rows.length) {
    addIssue(issues, {
      severity: 'blocking',
      sheet: sheetName,
      code: 'EMPTY_SHEET',
      message: `${sheetName} 为空`,
    });
    return [];
  }

  const headers = (rows[0] ?? []).map((cell) => toStringValue(cell));
  const requiredHeaders = SHEET_HEADERS[sheetName];
  requiredHeaders.forEach((header) => {
    if (!headers.includes(header)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: sheetName,
        field: header,
        code: 'MISSING_HEADER',
        message: `${sheetName} 缺少列 ${header}`,
      });
    }
  });

  if (hasBlockingErrors(issues.filter((issue) => issue.sheet === sheetName && issue.code === 'MISSING_HEADER'))) {
    return [];
  }

  return rows.slice(1).map((values, index) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, columnIndex) => {
      if (!header) {
        return;
      }
      record[header] = values[columnIndex];
    });
    return { rowNumber: index + 2, record };
  }).filter(({ record }) => !isRowBlank(record));
};

const parseTemplateWorkbook = (buffer: Buffer): ParsedWorkbook => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const issues: TemplateWorkbookIssue[] = [];

  const metaRecords = parseSheetRecords(workbook, 'Meta', issues);
  const readmeRecords = parseSheetRecords(workbook, 'README', issues);
  if (!readmeRecords.length) {
    addIssue(issues, {
      severity: 'warning',
      sheet: 'README',
      code: 'EMPTY_README',
      message: 'README 没有内容，建议保留模板说明',
    });
  }

  const meta = metaRecords.reduce<Record<string, string>>((acc, entry) => {
    const key = toStringValue(entry.record.key);
    const value = toStringValue(entry.record.value);
    if (key) {
      acc[key] = value;
    }
    return acc;
  }, {});

  if (Number(meta.workbook_version ?? '') !== WORKBOOK_VERSION) {
    addIssue(issues, {
      severity: 'blocking',
      sheet: 'Meta',
      field: 'workbook_version',
      code: 'UNSUPPORTED_VERSION',
      message: `仅支持 workbook_version=${WORKBOOK_VERSION}`,
    });
  }

  if (meta.source !== WORKBOOK_SOURCE) {
    addIssue(issues, {
      severity: 'blocking',
      sheet: 'Meta',
      field: 'source',
      code: 'INVALID_SOURCE',
      message: `source 必须为 ${WORKBOOK_SOURCE}`,
    });
  }

  const templateRecords = parseSheetRecords(workbook, 'Templates', issues);
  const stageRecords = parseSheetRecords(workbook, 'Stages', issues);
  const operationRecords = parseSheetRecords(workbook, 'Operations', issues);
  const constraintRecords = parseSheetRecords(workbook, 'Constraints', issues);
  const shareGroupRecords = parseSheetRecords(workbook, 'ShareGroups', issues);
  const shareGroupMemberRecords = parseSheetRecords(workbook, 'ShareGroupMembers', issues);
  const resourceBindingRecords = parseSheetRecords(workbook, 'ResourceBindings', issues);
  const resourceRequirementRecords = parseSheetRecords(workbook, 'ResourceRequirements', issues);

  const templates: TemplateRow[] = templateRecords.map(({ rowNumber, record }) => ({
    rowNumber,
    template_code: toStringValue(record.template_code),
    template_name: toStringValue(record.template_name),
    team_code: toNullableString(record.team_code),
    description: toNullableString(record.description),
    total_days: parseIntegerCell(record.total_days, issues, 'Templates', rowNumber, 'total_days'),
  })).filter((row) => {
    if (!row.template_code) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Templates',
        row: row.rowNumber,
        field: 'template_code',
        code: 'REQUIRED_FIELD',
        message: 'template_code 为必填项',
      });
    }
    if (!row.template_name) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Templates',
        row: row.rowNumber,
        field: 'template_name',
        code: 'REQUIRED_FIELD',
        message: 'template_name 为必填项',
      });
    }
    return true;
  });

  const stages: StageRow[] = stageRecords.map(({ rowNumber, record }) => ({
    rowNumber,
    template_code: toStringValue(record.template_code),
    stage_code: toStringValue(record.stage_code),
    stage_name: toStringValue(record.stage_name),
    stage_order: parseIntegerCell(record.stage_order, issues, 'Stages', rowNumber, 'stage_order', { required: true, min: 1 }) ?? 1,
    start_day: parseIntegerCell(record.start_day, issues, 'Stages', rowNumber, 'start_day', { required: true }) ?? 0,
    description: toNullableString(record.description),
  }));

  const operations: OperationRow[] = operationRecords.map(({ rowNumber, record }) => {
    const windowStartOffset =
      parseIntegerCell(record.window_start_day_offset, issues, 'Operations', rowNumber, 'window_start_day_offset', { required: true }) ?? 0;
    const windowEndOffset =
      parseIntegerCell(record.window_end_day_offset, issues, 'Operations', rowNumber, 'window_end_day_offset', { required: true }) ?? 0;
    const recommendedOffset =
      parseIntegerCell(record.recommended_day_offset, issues, 'Operations', rowNumber, 'recommended_day_offset', { required: true }) ?? 0;
    const recommendedTime =
      parseNumberCell(record.recommended_time, issues, 'Operations', rowNumber, 'recommended_time', { required: true, min: 0, max: 23.9 }) ?? 0;
    const windowStartTime =
      parseNumberCell(record.window_start_time, issues, 'Operations', rowNumber, 'window_start_time', { required: true, min: 0, max: 23.9 }) ?? 0;
    const windowEndTime =
      parseNumberCell(record.window_end_time, issues, 'Operations', rowNumber, 'window_end_time', { required: true, min: 0, max: 23.9 }) ?? 0;

    if (windowStartOffset === windowEndOffset && windowStartTime >= windowEndTime) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Operations',
        row: rowNumber,
        field: 'window_end_time',
        code: 'INVALID_TIME_WINDOW',
        message: '同日窗口下 window_start_time 必须小于 window_end_time',
      });
    }

    [recommendedOffset, windowStartOffset, windowEndOffset].forEach((offset, index) => {
      if (offset < -7 || offset > 7) {
        const fields = ['recommended_day_offset', 'window_start_day_offset', 'window_end_day_offset'] as const;
        addIssue(issues, {
          severity: 'blocking',
          sheet: 'Operations',
          row: rowNumber,
          field: fields[index],
          code: 'OFFSET_OUT_OF_RANGE',
          message: `${fields[index]} 必须介于 -7 到 7`,
        });
      }
    });

    return {
      rowNumber,
      template_code: toStringValue(record.template_code),
      stage_code: toStringValue(record.stage_code),
      schedule_key: toStringValue(record.schedule_key),
      operation_code: toStringValue(record.operation_code),
      operation_day: parseIntegerCell(record.operation_day, issues, 'Operations', rowNumber, 'operation_day', { required: true }) ?? 0,
      recommended_time: recommendedTime,
      recommended_day_offset: recommendedOffset,
      window_start_time: windowStartTime,
      window_start_day_offset: windowStartOffset,
      window_end_time: windowEndTime,
      window_end_day_offset: windowEndOffset,
      operation_order: parseIntegerCell(record.operation_order, issues, 'Operations', rowNumber, 'operation_order', { required: true, min: 1 }) ?? 1,
    };
  });

  const constraints: ConstraintRow[] = constraintRecords.map(({ rowNumber, record }) => {
    const lagTypeRaw = toStringValue(record.lag_type).toUpperCase();
    const lagType = (lagTypeRaw || 'FIXED') as ConstraintRow['lag_type'];
    if (!LAG_TYPES.has(lagType)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Constraints',
        row: rowNumber,
        field: 'lag_type',
        code: 'INVALID_LAG_TYPE',
        message: 'lag_type 不合法',
      });
    }
    const shareModeRaw = (toStringValue(record.share_mode).toUpperCase() || 'NONE') as ConstraintRow['share_mode'];
    if (!SHARE_MODES.has(shareModeRaw)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Constraints',
        row: rowNumber,
        field: 'share_mode',
        code: 'INVALID_SHARE_MODE',
        message: 'share_mode 不合法',
      });
    }

    return {
      rowNumber,
      template_code: toStringValue(record.template_code),
      from_schedule_key: toStringValue(record.from_schedule_key),
      to_schedule_key: toStringValue(record.to_schedule_key),
      constraint_type: parseConstraintType(record.constraint_type, issues, rowNumber) ?? 1,
      constraint_level: parseIntegerCell(record.constraint_level, issues, 'Constraints', rowNumber, 'constraint_level', { required: true, min: 1 }) ?? 1,
      lag_time: parseNumberCell(record.lag_time, issues, 'Constraints', rowNumber, 'lag_time', { required: true }) ?? 0,
      lag_type: lagType,
      lag_min: parseNumberCell(record.lag_min, issues, 'Constraints', rowNumber, 'lag_min') ?? 0,
      lag_max: parseNumberCell(record.lag_max, issues, 'Constraints', rowNumber, 'lag_max'),
      share_mode: shareModeRaw,
      constraint_name: toNullableString(record.constraint_name),
      description: toNullableString(record.description),
    };
  });

  const shareGroups: ShareGroupRow[] = shareGroupRecords.map(({ rowNumber, record }) => {
    const shareMode = (toStringValue(record.share_mode).toUpperCase() || 'SAME_TEAM') as ShareGroupRow['share_mode'];
    if (!SHARE_GROUP_MODES.has(shareMode)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'ShareGroups',
        row: rowNumber,
        field: 'share_mode',
        code: 'INVALID_SHARE_MODE',
        message: 'share_mode 仅支持 SAME_TEAM 或 DIFFERENT',
      });
    }

    return {
      rowNumber,
      template_code: toStringValue(record.template_code),
      group_code: toStringValue(record.group_code),
      group_name: toStringValue(record.group_name),
      share_mode: shareMode,
    };
  });

  const shareGroupMembers: ShareGroupMemberRow[] = shareGroupMemberRecords.map(({ rowNumber, record }) => ({
    rowNumber,
    template_code: toStringValue(record.template_code),
    group_code: toStringValue(record.group_code),
    schedule_key: toStringValue(record.schedule_key),
  }));

  const resourceBindings: ResourceBindingRow[] = resourceBindingRecords.map(({ rowNumber, record }) => ({
    rowNumber,
    template_code: toStringValue(record.template_code),
    schedule_key: toStringValue(record.schedule_key),
    resource_node_code: toStringValue(record.resource_node_code),
  }));

  const resourceRequirements: ResourceRequirementRow[] = resourceRequirementRecords.map(({ rowNumber, record }) => {
    const resourceType = toStringValue(record.resource_type).toUpperCase() as ResourceRequirementRow['resource_type'];
    if (!RESOURCE_TYPES.has(resourceType)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'ResourceRequirements',
        row: rowNumber,
        field: 'resource_type',
        code: 'INVALID_RESOURCE_TYPE',
        message: 'resource_type 不合法',
      });
    }

    return {
      rowNumber,
      template_code: toStringValue(record.template_code),
      schedule_key: toStringValue(record.schedule_key),
      resource_type: resourceType,
      required_count: parseIntegerCell(record.required_count, issues, 'ResourceRequirements', rowNumber, 'required_count', { required: true, min: 1 }) ?? 1,
      is_mandatory: parseBooleanCell(record.is_mandatory, issues, 'ResourceRequirements', rowNumber, 'is_mandatory', true),
      requires_exclusive_use: parseBooleanCell(
        record.requires_exclusive_use,
        issues,
        'ResourceRequirements',
        rowNumber,
        'requires_exclusive_use',
        true,
      ),
      prep_minutes: parseIntegerCell(record.prep_minutes, issues, 'ResourceRequirements', rowNumber, 'prep_minutes', { required: true, min: 0 }) ?? 0,
      changeover_minutes: parseIntegerCell(record.changeover_minutes, issues, 'ResourceRequirements', rowNumber, 'changeover_minutes', { required: true, min: 0 }) ?? 0,
      cleanup_minutes: parseIntegerCell(record.cleanup_minutes, issues, 'ResourceRequirements', rowNumber, 'cleanup_minutes', { required: true, min: 0 }) ?? 0,
      candidate_resource_codes: toStringValue(record.candidate_resource_codes)
        .split(MULTI_VALUE_DELIMITER)
        .map((item) => item.trim())
        .filter(Boolean),
    };
  });

  const summary: TemplateWorkbookSummary = {
    template_count: templates.length,
    stage_count: stages.length,
    operation_count: operations.length,
    constraint_count: constraints.length,
    share_group_count: shareGroups.length,
    share_group_member_count: shareGroupMembers.length,
    resource_binding_count: resourceBindings.length,
    resource_requirement_count: resourceRequirements.length,
  };

  if (!templates.length) {
    addIssue(issues, {
      severity: 'blocking',
      sheet: 'Templates',
      code: 'EMPTY_TEMPLATES',
      message: 'Templates 至少要包含 1 条模板记录',
    });
  }

  addDuplicateKeyIssues(issues, templates, (row: TemplateRow) => row.template_code, 'Templates', 'template_code', 'template_code 重复');
  addDuplicateKeyIssues(
    issues,
    stages,
    (row: StageRow) => `${row.template_code}::${row.stage_code}`,
    'Stages',
    'stage_code',
    '同一模板下 stage_code 重复',
  );
  addDuplicateKeyIssues(
    issues,
    stages,
    (row: StageRow) => `${row.template_code}::${row.stage_order}`,
    'Stages',
    'stage_order',
    '同一模板下 stage_order 重复',
  );
  addDuplicateKeyIssues(
    issues,
    operations,
    (row: OperationRow) => `${row.template_code}::${row.schedule_key}`,
    'Operations',
    'schedule_key',
    '同一模板下 schedule_key 重复',
  );
  addDuplicateKeyIssues(
    issues,
    operations,
    (row: OperationRow) => `${row.template_code}::${row.stage_code}::${row.operation_order}`,
    'Operations',
    'operation_order',
    '同一阶段下 operation_order 重复',
  );
  addDuplicateKeyIssues(
    issues,
    shareGroups,
    (row: ShareGroupRow) => `${row.template_code}::${row.group_code}`,
    'ShareGroups',
    'group_code',
    '同一模板下 group_code 重复',
  );

  return {
    meta,
    templates,
    stages,
    operations,
    constraints,
    shareGroups,
    shareGroupMembers,
    resourceBindings,
    resourceRequirements,
    summary,
    issues,
  };
};

const addDuplicateKeyIssues = (
  issues: TemplateWorkbookIssue[],
  rows: Array<{ rowNumber: number }>,
  keyGetter: (row: any) => string,
  sheet: WorkbookSheetName,
  field: string,
  message: string,
) => {
  const seen = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyGetter(row);
    if (!key) {
      return;
    }
    const existing = seen.get(key);
    if (existing) {
      addIssue(issues, {
        severity: 'blocking',
        sheet,
        row: row.rowNumber,
        field,
        code: 'DUPLICATE_KEY',
        message: `${message}（首次出现在第 ${existing} 行）`,
      });
      return;
    }
    seen.set(key, row.rowNumber);
  });
};

const loadLookupByCodes = async <TRow extends RowDataPacket>(
  executor: SqlExecutor,
  sqlPrefix: string,
  codes: string[],
): Promise<TRow[]> => {
  const uniqueCodes = Array.from(new Set(codes.filter(Boolean)));
  if (!uniqueCodes.length) {
    return [];
  }
  const placeholders = uniqueCodes.map(() => '?').join(', ');
  const [rows] = await executor.execute<TRow[]>(`${sqlPrefix} IN (${placeholders})`, uniqueCodes);
  return rows;
};

const buildValidationContext = async (
  parsed: ParsedWorkbook,
  executor: SqlExecutor,
): Promise<WorkbookValidationContext> => {
  const templateRows = await loadLookupByCodes<TemplateReference & RowDataPacket>(
    executor,
    'SELECT id, template_code, template_name FROM process_templates WHERE template_code',
    parsed.templates.map((row) => row.template_code),
  );
  const operationRows = await loadLookupByCodes<OperationReference & RowDataPacket>(
    executor,
    'SELECT id, operation_code FROM operations WHERE operation_code',
    parsed.operations.map((row) => row.operation_code),
  );
  const teamRows = await loadLookupByCodes<TeamReference & RowDataPacket>(
    executor,
    `SELECT id, unit_code
     FROM organization_units
     WHERE unit_type = 'TEAM' AND unit_code`,
    parsed.templates.map((row) => row.team_code ?? ''),
  );

  const context: WorkbookValidationContext = {
    existingTemplates: new Map(templateRows.map((row) => [row.template_code, { id: Number(row.id), template_code: row.template_code, template_name: row.template_name }])),
    operationIdsByCode: new Map(operationRows.map((row) => [row.operation_code, Number(row.id)])),
    teamIdsByCode: new Map(teamRows.map((row) => [row.unit_code, Number(row.id)])),
    resourceNodeIdsByCode: new Map<string, number>(),
    resourceIdsByCode: new Map<string, number>(),
  };

  const needsResourceLookups = parsed.resourceBindings.length > 0 || parsed.resourceRequirements.some((row) => row.candidate_resource_codes.length > 0);
  if (!needsResourceLookups) {
    return context;
  }

  try {
    const resourceNodeRows = await loadLookupByCodes<ResourceNodeReference & RowDataPacket>(
      executor,
      'SELECT id, node_code FROM resource_nodes WHERE node_code',
      parsed.resourceBindings.map((row) => row.resource_node_code),
    );
    context.resourceNodeIdsByCode = new Map(resourceNodeRows.map((row) => [row.node_code, Number(row.id)]));
  } catch (error) {
    if (isMissingTableError(error)) {
      addIssue(parsed.issues, {
        severity: 'blocking',
        sheet: 'ResourceBindings',
        code: 'MISSING_RESOURCE_NODE_TABLE',
        message: `资源节点表不可用: ${extractMissingTableName(error) ?? 'resource_nodes'}`,
      });
    } else {
      throw error;
    }
  }

  try {
    const resourceRows = await loadLookupByCodes<ResourceReference & RowDataPacket>(
      executor,
      'SELECT id, resource_code FROM resources WHERE resource_code',
      parsed.resourceRequirements.flatMap((row) => row.candidate_resource_codes),
    );
    context.resourceIdsByCode = new Map(resourceRows.map((row) => [row.resource_code, Number(row.id)]));
  } catch (error) {
    if (isMissingTableError(error)) {
      addIssue(parsed.issues, {
        severity: 'blocking',
        sheet: 'ResourceRequirements',
        code: 'MISSING_RESOURCE_TABLE',
        message: `资源表不可用: ${extractMissingTableName(error) ?? 'resources'}`,
      });
    } else {
      throw error;
    }
  }

  return context;
};

const validateWorkbook = async (
  parsed: ParsedWorkbook,
  mode: TemplateWorkbookImportMode,
  executor: SqlExecutor,
): Promise<{ issues: TemplateWorkbookIssue[]; actions: TemplateWorkbookActionSummary[]; context: WorkbookValidationContext }> => {
  const issues = parsed.issues;

  const templateCodeSet = new Set(parsed.templates.map((row) => row.template_code));
  parsed.stages.forEach((row) => {
    if (!templateCodeSet.has(row.template_code)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Stages',
        row: row.rowNumber,
        field: 'template_code',
        code: 'UNKNOWN_TEMPLATE',
        message: `未在 Templates 中找到 template_code=${row.template_code}`,
      });
    }
  });

  const stageKeySet = new Set(parsed.stages.map((row) => `${row.template_code}::${row.stage_code}`));
  parsed.operations.forEach((row) => {
    if (!templateCodeSet.has(row.template_code)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Operations',
        row: row.rowNumber,
        field: 'template_code',
        code: 'UNKNOWN_TEMPLATE',
        message: `未在 Templates 中找到 template_code=${row.template_code}`,
      });
    }
    if (!stageKeySet.has(`${row.template_code}::${row.stage_code}`)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Operations',
        row: row.rowNumber,
        field: 'stage_code',
        code: 'UNKNOWN_STAGE',
        message: `未在 Stages 中找到 ${row.template_code}/${row.stage_code}`,
      });
    }
    if (!row.schedule_key) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Operations',
        row: row.rowNumber,
        field: 'schedule_key',
        code: 'REQUIRED_FIELD',
        message: 'schedule_key 为必填项',
      });
    }
    if (!row.operation_code) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Operations',
        row: row.rowNumber,
        field: 'operation_code',
        code: 'REQUIRED_FIELD',
        message: 'operation_code 为必填项',
      });
    }
  });

  const scheduleKeySet = new Set(parsed.operations.map((row) => `${row.template_code}::${row.schedule_key}`));
  parsed.constraints.forEach((row) => {
    if (!scheduleKeySet.has(`${row.template_code}::${row.from_schedule_key}`)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Constraints',
        row: row.rowNumber,
        field: 'from_schedule_key',
        code: 'UNKNOWN_SCHEDULE',
        message: `未找到 from_schedule_key=${row.from_schedule_key}`,
      });
    }
    if (!scheduleKeySet.has(`${row.template_code}::${row.to_schedule_key}`)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Constraints',
        row: row.rowNumber,
        field: 'to_schedule_key',
        code: 'UNKNOWN_SCHEDULE',
        message: `未找到 to_schedule_key=${row.to_schedule_key}`,
      });
    }
    if (row.from_schedule_key && row.from_schedule_key === row.to_schedule_key) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Constraints',
        row: row.rowNumber,
        field: 'to_schedule_key',
        code: 'SELF_CONSTRAINT',
        message: '约束不能引用自身',
      });
    }
  });

  const groupKeySet = new Set(parsed.shareGroups.map((row) => `${row.template_code}::${row.group_code}`));
  parsed.shareGroupMembers.forEach((row) => {
    if (!groupKeySet.has(`${row.template_code}::${row.group_code}`)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'ShareGroupMembers',
        row: row.rowNumber,
        field: 'group_code',
        code: 'UNKNOWN_SHARE_GROUP',
        message: `未找到共享组 ${row.group_code}`,
      });
    }
    if (!scheduleKeySet.has(`${row.template_code}::${row.schedule_key}`)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'ShareGroupMembers',
        row: row.rowNumber,
        field: 'schedule_key',
        code: 'UNKNOWN_SCHEDULE',
        message: `未找到 schedule_key=${row.schedule_key}`,
      });
    }
  });

  if (!isTemplateResourceRulesEnabled()) {
    if (parsed.resourceBindings.length > 0) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'ResourceBindings',
        code: 'RESOURCE_FEATURE_DISABLED',
        message: '当前环境未启用模板资源规则，不能导入 ResourceBindings',
      });
    }
    if (parsed.resourceRequirements.length > 0) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'ResourceRequirements',
        code: 'RESOURCE_FEATURE_DISABLED',
        message: '当前环境未启用模板资源规则，不能导入 ResourceRequirements',
      });
    }
  }

  const context = await buildValidationContext(parsed, executor);

  parsed.templates.forEach((row) => {
    if (row.team_code && !context.teamIdsByCode.has(row.team_code)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Templates',
        row: row.rowNumber,
        field: 'team_code',
        code: 'UNKNOWN_TEAM',
        message: `未找到 team_code=${row.team_code}`,
      });
    }
  });

  parsed.operations.forEach((row) => {
    if (row.operation_code && !context.operationIdsByCode.has(row.operation_code)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Operations',
        row: row.rowNumber,
        field: 'operation_code',
        code: 'UNKNOWN_OPERATION',
        message: `未找到 operation_code=${row.operation_code}`,
      });
    }
  });

  parsed.resourceBindings.forEach((row) => {
    if (!scheduleKeySet.has(`${row.template_code}::${row.schedule_key}`)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'ResourceBindings',
        row: row.rowNumber,
        field: 'schedule_key',
        code: 'UNKNOWN_SCHEDULE',
        message: `未找到 schedule_key=${row.schedule_key}`,
      });
    }
    if (row.resource_node_code && !context.resourceNodeIdsByCode.has(row.resource_node_code)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'ResourceBindings',
        row: row.rowNumber,
        field: 'resource_node_code',
        code: 'UNKNOWN_RESOURCE_NODE',
        message: `未找到 resource_node_code=${row.resource_node_code}`,
      });
    }
  });

  parsed.resourceRequirements.forEach((row) => {
    if (!scheduleKeySet.has(`${row.template_code}::${row.schedule_key}`)) {
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'ResourceRequirements',
        row: row.rowNumber,
        field: 'schedule_key',
        code: 'UNKNOWN_SCHEDULE',
        message: `未找到 schedule_key=${row.schedule_key}`,
      });
    }
    row.candidate_resource_codes.forEach((resourceCode) => {
      if (!context.resourceIdsByCode.has(resourceCode)) {
        addIssue(issues, {
          severity: 'blocking',
          sheet: 'ResourceRequirements',
          row: row.rowNumber,
          field: 'candidate_resource_codes',
          code: 'UNKNOWN_RESOURCE',
          message: `未找到 resource_code=${resourceCode}`,
        });
      }
    });
  });

  const actions: TemplateWorkbookActionSummary[] = [];
  const replaceTemplateIds = new Set<number>();
  parsed.templates.forEach((row) => {
    const existing = context.existingTemplates.get(row.template_code);
    const action: TemplateWorkbookActionSummary = {
      template_code: row.template_code,
      template_name: row.template_name,
      action: mode,
      target_template_id: existing ? existing.id : null,
      blocked_reason: null,
    };

    if (mode === 'create' && existing) {
      action.blocked_reason = `template_code=${row.template_code} 已存在`;
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Templates',
        row: row.rowNumber,
        field: 'template_code',
        code: 'TEMPLATE_EXISTS',
        message: action.blocked_reason,
      });
    }

    if (mode === 'replace') {
      if (!existing) {
        action.blocked_reason = `template_code=${row.template_code} 不存在，无法替换`;
        addIssue(issues, {
          severity: 'blocking',
          sheet: 'Templates',
          row: row.rowNumber,
          field: 'template_code',
          code: 'TEMPLATE_MISSING',
          message: action.blocked_reason,
        });
      } else {
        replaceTemplateIds.add(existing.id);
      }
    }

    actions.push(action);
  });

  if (mode === 'replace' && replaceTemplateIds.size > 0) {
    const ids = Array.from(replaceTemplateIds);
    const placeholders = ids.map(() => '?').join(', ');
    const [usageRows] = await executor.execute<RowDataPacket[]>(
      `SELECT
          ps.template_id,
          COUNT(DISTINCT bop.batch_plan_id) AS batch_count,
          GROUP_CONCAT(DISTINCT pbp.batch_code ORDER BY pbp.batch_code SEPARATOR ', ') AS batch_codes
       FROM stage_operation_schedules sos
       JOIN process_stages ps ON ps.id = sos.stage_id
       JOIN batch_operation_plans bop ON bop.template_schedule_id = sos.id
       JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
       WHERE ps.template_id IN (${placeholders})
       GROUP BY ps.template_id`,
      ids,
    );

    const usageByTemplateId = new Map<number, { batch_count: number; batch_codes: string | null }>(
      usageRows.map((row) => [
        Number(row.template_id),
        {
          batch_count: Number(row.batch_count ?? 0),
          batch_codes: row.batch_codes ? String(row.batch_codes) : null,
        },
      ]),
    );

    actions.forEach((action) => {
      if (!action.target_template_id) {
        return;
      }
      const usage = usageByTemplateId.get(action.target_template_id);
      if (!usage || usage.batch_count <= 0) {
        return;
      }
      action.blocked_reason = `模板已被 ${usage.batch_count} 个批次引用，无法 replace${usage.batch_codes ? `: ${usage.batch_codes}` : ''}`;
      const templateRow = parsed.templates.find((row) => row.template_code === action.template_code);
      addIssue(issues, {
        severity: 'blocking',
        sheet: 'Templates',
        row: templateRow?.rowNumber,
        field: 'template_code',
        code: 'TEMPLATE_IN_USE',
        message: action.blocked_reason,
      });
    });
  }

  return { issues, actions, context };
};

const clearTemplateForReplace = async (executor: SqlExecutor, templateId: number) => {
  await executor.execute('DELETE FROM personnel_share_groups WHERE template_id = ?', [templateId]);
  await executor.execute('DELETE FROM process_stages WHERE template_id = ?', [templateId]);
};

const applyWorkbook = async (
  parsed: ParsedWorkbook,
  mode: TemplateWorkbookImportMode,
  context: WorkbookValidationContext,
  executor: SqlExecutor,
  dryRun: boolean,
): Promise<TemplateWorkbookTemplateResult[]> => {
  const results: TemplateWorkbookTemplateResult[] = [];

  for (const template of parsed.templates) {
    const existing = context.existingTemplates.get(template.template_code);
    let templateId = existing?.id ?? null;

    if (mode === 'create') {
      const [insertResult] = await executor.execute<ResultSetHeader>(
        `INSERT INTO process_templates (template_code, template_name, team_id, description, total_days)
         VALUES (?, ?, ?, ?, 1)`,
        [
          template.template_code,
          template.template_name,
          template.team_code ? context.teamIdsByCode.get(template.team_code) ?? null : null,
          template.description,
        ],
      );
      templateId = insertResult.insertId;
    } else {
      templateId = existing?.id ?? null;
      if (!templateId) {
        throw new Error(`replace 缺少 template_id: ${template.template_code}`);
      }
      await clearTemplateForReplace(executor, templateId);
      await executor.execute(
        `UPDATE process_templates
         SET template_name = ?, team_id = ?, description = ?, total_days = 1
         WHERE id = ?`,
        [
          template.template_name,
          template.team_code ? context.teamIdsByCode.get(template.team_code) ?? null : null,
          template.description,
          templateId,
        ],
      );
    }

    const stageRows = parsed.stages
      .filter((row) => row.template_code === template.template_code)
      .sort((left, right) => left.stage_order - right.stage_order || left.rowNumber - right.rowNumber);
    const stageIdByCode = new Map<string, number>();

    for (const stage of stageRows) {
      const [insertStage] = await executor.execute<ResultSetHeader>(
        `INSERT INTO process_stages (template_id, stage_code, stage_name, stage_order, start_day, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [templateId, stage.stage_code, stage.stage_name, stage.stage_order, stage.start_day, stage.description],
      );
      stageIdByCode.set(stage.stage_code, insertStage.insertId);
    }

    const operationRows = parsed.operations
      .filter((row) => row.template_code === template.template_code)
      .sort((left, right) => {
        const stageOrderLeft = stageRows.find((row) => row.stage_code === left.stage_code)?.stage_order ?? 0;
        const stageOrderRight = stageRows.find((row) => row.stage_code === right.stage_code)?.stage_order ?? 0;
        return stageOrderLeft - stageOrderRight || left.operation_order - right.operation_order || left.rowNumber - right.rowNumber;
      });

    const scheduleIdByKey = new Map<string, number>();

    for (const operation of operationRows) {
      const stageId = stageIdByCode.get(operation.stage_code);
      if (!stageId) {
        throw new Error(`未找到阶段 ${operation.stage_code}`);
      }
      const [insertOperation] = await executor.execute<ResultSetHeader>(
        `INSERT INTO stage_operation_schedules (
           stage_id, operation_id, operation_day, recommended_time, recommended_day_offset,
           window_start_time, window_start_day_offset, window_end_time, window_end_day_offset, operation_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stageId,
          context.operationIdsByCode.get(operation.operation_code),
          operation.operation_day,
          operation.recommended_time,
          operation.recommended_day_offset,
          operation.window_start_time,
          operation.window_start_day_offset,
          operation.window_end_time,
          operation.window_end_day_offset,
          operation.operation_order,
        ],
      );
      scheduleIdByKey.set(operation.schedule_key, insertOperation.insertId);
    }

    const constraintRows = parsed.constraints.filter((row) => row.template_code === template.template_code);
    for (const constraint of constraintRows) {
      const fromScheduleId = scheduleIdByKey.get(constraint.from_schedule_key);
      const toScheduleId = scheduleIdByKey.get(constraint.to_schedule_key);
      if (!fromScheduleId || !toScheduleId) {
        throw new Error(`约束引用了不存在的 schedule_key`);
      }
      await executor.execute(
        `INSERT INTO operation_constraints (
           schedule_id, predecessor_schedule_id, constraint_type, constraint_level, time_lag,
           lag_type, lag_min, lag_max, share_mode, constraint_name, description
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fromScheduleId,
          toScheduleId,
          constraint.constraint_type,
          constraint.constraint_level,
          constraint.lag_time,
          constraint.lag_type,
          constraint.lag_min,
          constraint.lag_max,
          constraint.share_mode,
          constraint.constraint_name,
          constraint.description,
        ],
      );
    }

    const groupRows = parsed.shareGroups.filter((row) => row.template_code === template.template_code);
    const groupIdByCode = new Map<string, number>();
    for (const group of groupRows) {
      const [insertGroup] = await executor.execute<ResultSetHeader>(
        `INSERT INTO personnel_share_groups (template_id, group_code, group_name, share_mode)
         VALUES (?, ?, ?, ?)`,
        [templateId, group.group_code, group.group_name, group.share_mode],
      );
      groupIdByCode.set(group.group_code, insertGroup.insertId);
    }

    const memberRows = parsed.shareGroupMembers.filter((row) => row.template_code === template.template_code);
    for (const member of memberRows) {
      const groupId = groupIdByCode.get(member.group_code);
      const scheduleId = scheduleIdByKey.get(member.schedule_key);
      if (!groupId || !scheduleId) {
        throw new Error('共享组成员引用无效');
      }
      await executor.execute(
        'INSERT INTO personnel_share_group_members (group_id, schedule_id) VALUES (?, ?)',
        [groupId, scheduleId],
      );
    }

    if (isTemplateResourceRulesEnabled()) {
      const requirementRows = parsed.resourceRequirements.filter((row) => row.template_code === template.template_code);
      const requirementsByScheduleKey = new Map<string, Array<Record<string, unknown>>>();
      requirementRows.forEach((row) => {
        const current = requirementsByScheduleKey.get(row.schedule_key) ?? [];
        current.push({
          resource_type: row.resource_type,
          required_count: row.required_count,
          is_mandatory: row.is_mandatory,
          requires_exclusive_use: row.requires_exclusive_use,
          prep_minutes: row.prep_minutes,
          changeover_minutes: row.changeover_minutes,
          cleanup_minutes: row.cleanup_minutes,
          candidate_resource_ids: row.candidate_resource_codes.map((code) => context.resourceIdsByCode.get(code)).filter(Boolean),
        });
        requirementsByScheduleKey.set(row.schedule_key, current);
      });

      for (const [scheduleKey, requirements] of requirementsByScheduleKey.entries()) {
        const scheduleId = scheduleIdByKey.get(scheduleKey);
        if (!scheduleId) {
          throw new Error(`资源规则引用无效 schedule_key=${scheduleKey}`);
        }
        await replaceTemplateScheduleRules(executor as PoolConnection, scheduleId, requirements);
      }

      const bindingRows = parsed.resourceBindings.filter((row) => row.template_code === template.template_code);
      for (const binding of bindingRows) {
        const scheduleId = scheduleIdByKey.get(binding.schedule_key);
        const resourceNodeId = context.resourceNodeIdsByCode.get(binding.resource_node_code);
        if (!scheduleId || !resourceNodeId) {
          throw new Error(`资源绑定引用无效 schedule_key=${binding.schedule_key}`);
        }
        await upsertTemplateScheduleBinding(scheduleId, resourceNodeId, executor as PoolConnection);
      }
    }

    await updateTemplateTotalDays(templateId, executor);
    const [templateRows] = await executor.execute<RowDataPacket[]>('SELECT total_days FROM process_templates WHERE id = ?', [templateId]);
    const totalDays = templateRows.length ? Number(templateRows[0].total_days ?? 0) : null;

    const validation = await runConstraintValidation(templateId, executor);
    if (validation.hasConflicts) {
      addIssue(parsed.issues, {
        severity: 'warning',
        sheet: 'Constraints',
        code: 'CONSTRAINT_VALIDATION_WARNING',
        message: `${template.template_code} 存在 ${validation.summary.total} 条约束校验告警`,
      });
    }

    results.push({
      template_code: template.template_code,
      template_name: template.template_name,
      action: mode,
      template_id: dryRun ? null : templateId,
      total_days: totalDays,
      status: dryRun ? 'validated' : 'imported',
    });
  }

  return results;
};

const buildMutationResponse = (
  parsed: ParsedWorkbook,
  mode: TemplateWorkbookImportMode,
  dryRun: boolean,
  actions: TemplateWorkbookActionSummary[],
  templateResults: TemplateWorkbookTemplateResult[],
): TemplateWorkbookMutationResult => {
  const blockingErrors = parsed.issues.filter((issue) => issue.severity === 'blocking');
  const warnings = parsed.issues.filter((issue) => issue.severity === 'warning');

  return {
    workbook_version: WORKBOOK_VERSION,
    mode,
    dry_run: dryRun,
    can_import: blockingErrors.length === 0,
    summary: parsed.summary,
    template_actions: actions,
    template_results: templateResults,
    blocking_errors: blockingErrors,
    warnings,
  };
};

const mutateWorkbookInternal = async (
  buffer: Buffer,
  mode: TemplateWorkbookImportMode,
  dryRun: boolean,
): Promise<TemplateWorkbookMutationResult> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const parsed = parseTemplateWorkbook(buffer);
    const { actions, context } = await validateWorkbook(parsed, mode, connection);

    let templateResults: TemplateWorkbookTemplateResult[] = [];
    if (!hasBlockingErrors(parsed.issues)) {
      try {
        templateResults = await applyWorkbook(parsed, mode, context, connection, dryRun);
      } catch (error) {
        addIssue(parsed.issues, {
          severity: 'blocking',
          sheet: 'Workbook',
          code: 'APPLY_FAILED',
          message: error instanceof Error ? error.message : 'Workbook 校验演练失败',
        });
      }
    }

    await connection.rollback();
    return buildMutationResponse(parsed, mode, dryRun, actions, templateResults);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const previewTemplateWorkbookImport = async (
  buffer: Buffer,
  mode: TemplateWorkbookImportMode,
): Promise<TemplateWorkbookMutationResult> => mutateWorkbookInternal(buffer, mode, true);

export const importTemplateWorkbook = async (
  buffer: Buffer,
  mode: TemplateWorkbookImportMode,
): Promise<TemplateWorkbookMutationResult> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const parsed = parseTemplateWorkbook(buffer);
    const { actions, context } = await validateWorkbook(parsed, mode, connection);
    if (hasBlockingErrors(parsed.issues)) {
      await connection.rollback();
      return buildMutationResponse(parsed, mode, false, actions, []);
    }

    let templateResults: TemplateWorkbookTemplateResult[] = [];
    try {
      templateResults = await applyWorkbook(parsed, mode, context, connection, false);
    } catch (error) {
      addIssue(parsed.issues, {
        severity: 'blocking',
        sheet: 'Workbook',
        code: 'APPLY_FAILED',
        message: error instanceof Error ? error.message : 'Workbook 导入失败',
      });
      await connection.rollback();
      return buildMutationResponse(parsed, mode, false, actions, []);
    }
    await connection.commit();
    return buildMutationResponse(parsed, mode, false, actions, templateResults);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const generateScheduleKey = (
  templateCode: string,
  stageCode: string,
  operationOrder: number,
  operationCode: string,
) => `${templateCode}::${stageCode}::${String(operationOrder).padStart(3, '0')}::${operationCode}`;

const buildReadmeRows = () => [
  {
    sheet: 'Templates',
    purpose: '模板基础信息',
    required_columns: SHEET_HEADERS.Templates.join(','),
    notes: 'template_code 为主键；total_days 仅作参考，导入后会重算',
  },
  {
    sheet: 'Stages',
    purpose: '阶段定义',
    required_columns: SHEET_HEADERS.Stages.join(','),
    notes: 'stage_code 在同一 template_code 下唯一',
  },
  {
    sheet: 'Operations',
    purpose: '阶段操作排程',
    required_columns: SHEET_HEADERS.Operations.join(','),
    notes: 'schedule_key 为 workbook 内部引用键，需在同一 template_code 下唯一',
  },
  {
    sheet: 'Constraints',
    purpose: '操作约束',
    required_columns: SHEET_HEADERS.Constraints.join(','),
    notes: 'from_schedule_key/to_schedule_key 引用 Operations.schedule_key',
  },
  {
    sheet: 'ShareGroups',
    purpose: '共享组定义',
    required_columns: SHEET_HEADERS.ShareGroups.join(','),
    notes: 'group_code 在同一 template_code 下唯一',
  },
  {
    sheet: 'ShareGroupMembers',
    purpose: '共享组成员',
    required_columns: SHEET_HEADERS.ShareGroupMembers.join(','),
    notes: 'group_code 引用 ShareGroups，schedule_key 引用 Operations',
  },
  {
    sheet: 'ResourceBindings',
    purpose: '默认资源节点绑定',
    required_columns: SHEET_HEADERS.ResourceBindings.join(','),
    notes: 'resource_node_code 引用资源节点编码',
  },
  {
    sheet: 'ResourceRequirements',
    purpose: '资源需求与候选资源',
    required_columns: SHEET_HEADERS.ResourceRequirements.join(','),
    notes: `candidate_resource_codes 使用 ${MULTI_VALUE_DELIMITER} 分隔；replace 会拒绝已被批次引用的模板`,
  },
];

export const exportTemplateWorkbook = async (templateId: number): Promise<{ fileName: string; buffer: Buffer }> => {
  const [templateRows] = await pool.execute<ExportTemplateRow[]>(
    `SELECT
        pt.id,
        pt.template_code,
        pt.template_name,
        pt.team_id,
        ou.unit_code AS team_code,
        pt.description,
        pt.total_days
     FROM process_templates pt
     LEFT JOIN organization_units ou ON ou.id = pt.team_id
     WHERE pt.id = ?
     LIMIT 1`,
    [templateId],
  );

  if (!templateRows.length) {
    throw new Error('Template not found');
  }

  const template = templateRows[0];

  const [stageRows] = await pool.execute<ExportStageRow[]>(
    `SELECT id, template_id, stage_code, stage_name, stage_order, start_day, description
     FROM process_stages
     WHERE template_id = ?
     ORDER BY stage_order, id`,
    [templateId],
  );

  const [operationRows] = await pool.execute<ExportOperationRow[]>(
    `SELECT
        sos.id,
        sos.stage_id,
        ps.stage_code,
        o.operation_code,
        sos.operation_day,
        sos.recommended_time,
        sos.recommended_day_offset,
        sos.window_start_time,
        sos.window_start_day_offset,
        sos.window_end_time,
        sos.window_end_day_offset,
        sos.operation_order,
        sos.operation_id
     FROM stage_operation_schedules sos
     JOIN process_stages ps ON ps.id = sos.stage_id
     JOIN operations o ON o.id = sos.operation_id
     WHERE ps.template_id = ?
     ORDER BY ps.stage_order, sos.operation_order, sos.id`,
    [templateId],
  );

  const scheduleKeyById = new Map<number, string>();
  operationRows.forEach((row) => {
    scheduleKeyById.set(
      Number(row.id),
      generateScheduleKey(template.template_code, row.stage_code, Number(row.operation_order), row.operation_code),
    );
  });

  const [constraintRows] = await pool.execute<ExportConstraintRow[]>(
    `SELECT
        oc.id,
        oc.schedule_id,
        oc.predecessor_schedule_id,
        oc.constraint_type,
        oc.constraint_level,
        oc.time_lag,
        oc.lag_type,
        oc.lag_min,
        oc.lag_max,
        oc.share_mode,
        oc.constraint_name,
        oc.description
     FROM operation_constraints oc
     JOIN stage_operation_schedules sos ON sos.id = oc.schedule_id
     JOIN process_stages ps ON ps.id = sos.stage_id
     WHERE ps.template_id = ?
     ORDER BY oc.id`,
    [templateId],
  );

  const [shareGroupRows] = await pool.execute<ExportShareGroupRow[]>(
    `SELECT id, group_code, group_name, share_mode
     FROM personnel_share_groups
     WHERE template_id = ?
     ORDER BY id`,
    [templateId],
  );

  const shareGroupIds = shareGroupRows.map((row) => Number(row.id));
  let shareGroupMemberRows: ExportShareGroupMemberRow[] = [];
  if (shareGroupIds.length > 0) {
    const placeholders = shareGroupIds.map(() => '?').join(', ');
    const [rows] = await pool.execute<ExportShareGroupMemberRow[]>(
      `SELECT group_id, schedule_id
       FROM personnel_share_group_members
       WHERE group_id IN (${placeholders})
       ORDER BY group_id, schedule_id`,
      shareGroupIds,
    );
    shareGroupMemberRows = rows;
  }

  const scheduleRefs: ExportTemplateScheduleRef[] = operationRows.map((row) => ({
    schedule_id: Number(row.id),
    operation_id: Number(row.operation_id),
  }));

  let resourceBindingRows: ExportResourceBindingRow[] = [];
  let effectiveRules: Awaited<ReturnType<typeof getEffectiveRulesForSchedules>> = new Map();

  if (scheduleRefs.length && isTemplateResourceRulesEnabled()) {
    try {
      effectiveRules = await getEffectiveRulesForSchedules(scheduleRefs);
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }

    try {
      const placeholders = scheduleRefs.map(() => '?').join(', ');
      const [rows] = await pool.execute<ExportResourceBindingRow[]>(
        `SELECT
            b.template_schedule_id,
            rn.node_code
         FROM template_stage_operation_resource_bindings b
         JOIN resource_nodes rn ON rn.id = b.resource_node_id
         WHERE b.template_schedule_id IN (${placeholders})
         ORDER BY b.template_schedule_id`,
        scheduleRefs.map((row) => row.schedule_id),
      );
      resourceBindingRows = rows;
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }
  }

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { key: 'workbook_version', value: WORKBOOK_VERSION },
      { key: 'source', value: WORKBOOK_SOURCE },
      { key: 'exported_at', value: new Date().toISOString() },
    ], { header: SHEET_HEADERS.Meta }),
    'Meta',
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildReadmeRows(), { header: SHEET_HEADERS.README }),
    'README',
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        template_code: template.template_code,
        template_name: template.template_name,
        team_code: template.team_code ?? '',
        description: template.description ?? '',
        total_days: template.total_days ?? '',
      },
    ], { header: SHEET_HEADERS.Templates }),
    'Templates',
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(stageRows.map((row) => ({
      template_code: template.template_code,
      stage_code: row.stage_code,
      stage_name: row.stage_name,
      stage_order: Number(row.stage_order),
      start_day: Number(row.start_day),
      description: row.description ?? '',
    })), { header: SHEET_HEADERS.Stages }),
    'Stages',
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(operationRows.map((row) => ({
      template_code: template.template_code,
      stage_code: row.stage_code,
      schedule_key: scheduleKeyById.get(Number(row.id)) ?? '',
      operation_code: row.operation_code,
      operation_day: Number(row.operation_day),
      recommended_time: Number(row.recommended_time),
      recommended_day_offset: Number(row.recommended_day_offset ?? 0),
      window_start_time: Number(row.window_start_time),
      window_start_day_offset: Number(row.window_start_day_offset ?? 0),
      window_end_time: Number(row.window_end_time),
      window_end_day_offset: Number(row.window_end_day_offset ?? 0),
      operation_order: Number(row.operation_order),
    })), { header: SHEET_HEADERS.Operations }),
    'Operations',
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(constraintRows.map((row) => ({
      template_code: template.template_code,
      from_schedule_key: scheduleKeyById.get(Number(row.schedule_id)) ?? '',
      to_schedule_key: scheduleKeyById.get(Number(row.predecessor_schedule_id)) ?? '',
      constraint_type: Number(row.constraint_type),
      constraint_level: Number(row.constraint_level ?? 1),
      lag_time: Number(row.time_lag ?? 0),
      lag_type: row.lag_type ?? 'FIXED',
      lag_min: row.lag_min ?? 0,
      lag_max: row.lag_max ?? '',
      share_mode: row.share_mode ?? 'NONE',
      constraint_name: row.constraint_name ?? '',
      description: row.description ?? '',
    })), { header: SHEET_HEADERS.Constraints }),
    'Constraints',
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(shareGroupRows.map((row) => ({
      template_code: template.template_code,
      group_code: row.group_code,
      group_name: row.group_name ?? '',
      share_mode: row.share_mode,
    })), { header: SHEET_HEADERS.ShareGroups }),
    'ShareGroups',
  );

  const groupCodeById = new Map(shareGroupRows.map((row) => [Number(row.id), row.group_code]));
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(shareGroupMemberRows.map((row) => ({
      template_code: template.template_code,
      group_code: groupCodeById.get(Number(row.group_id)) ?? '',
      schedule_key: scheduleKeyById.get(Number(row.schedule_id)) ?? '',
    })), { header: SHEET_HEADERS.ShareGroupMembers }),
    'ShareGroupMembers',
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(resourceBindingRows.map((row) => ({
      template_code: template.template_code,
      schedule_key: scheduleKeyById.get(Number(row.template_schedule_id)) ?? '',
      resource_node_code: row.node_code,
    })), { header: SHEET_HEADERS.ResourceBindings }),
    'ResourceBindings',
  );

  const resourceRequirementRows = scheduleRefs.flatMap((row) => {
    const rule = effectiveRules.get(row.schedule_id);
    return (rule?.requirements ?? []).map((requirement) => ({
      template_code: template.template_code,
      schedule_key: scheduleKeyById.get(row.schedule_id) ?? '',
      resource_type: requirement.resource_type,
      required_count: requirement.required_count,
      is_mandatory: requirement.is_mandatory ? 'true' : 'false',
      requires_exclusive_use: requirement.requires_exclusive_use ? 'true' : 'false',
      prep_minutes: requirement.prep_minutes,
      changeover_minutes: requirement.changeover_minutes,
      cleanup_minutes: requirement.cleanup_minutes,
      candidate_resource_codes: requirement.candidate_resources.map((item) => item.resource_code).join(MULTI_VALUE_DELIMITER),
    }));
  });

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(resourceRequirementRows, { header: SHEET_HEADERS.ResourceRequirements }),
    'ResourceRequirements',
  );

  const buffer = Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
  return {
    fileName: `工艺模板_${template.template_code}.xlsx`,
    buffer,
  };
};

export const __internal = {
  parseTemplateWorkbook,
};
