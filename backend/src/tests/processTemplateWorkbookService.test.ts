import { describe, expect, it } from 'vitest';
import XLSX from 'xlsx';
import { __internal } from '../services/processTemplateWorkbookService';

const buildWorkbookBuffer = (overrides?: Partial<Record<string, Array<Record<string, unknown>>>>) => {
  const workbook = XLSX.utils.book_new();
  const headers: Record<string, string[]> = {
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

  const sheets: Record<string, Array<Record<string, unknown>>> = {
    Meta: [
      { key: 'workbook_version', value: 1 },
      { key: 'source', value: 'process-template' },
      { key: 'exported_at', value: '2026-03-15T00:00:00.000Z' },
    ],
    README: [
      {
        sheet: 'Templates',
        purpose: '模板基础信息',
        required_columns: 'template_code,template_name,team_code,description,total_days',
        notes: 'test',
      },
    ],
    Templates: [
      {
        template_code: 'PT-90001',
        template_name: '测试模板',
        team_code: '',
        description: 'desc',
        total_days: 3,
      },
    ],
    Stages: [
      {
        template_code: 'PT-90001',
        stage_code: 'PS-001',
        stage_name: '阶段一',
        stage_order: 1,
        start_day: 0,
        description: '',
      },
    ],
    Operations: [
      {
        template_code: 'PT-90001',
        stage_code: 'PS-001',
        schedule_key: 'SCH-1',
        operation_code: 'OP-001',
        operation_day: 0,
        recommended_time: 9,
        recommended_day_offset: 0,
        window_start_time: 7,
        window_start_day_offset: 0,
        window_end_time: 11,
        window_end_day_offset: 0,
        operation_order: 1,
      },
    ],
    Constraints: [],
    ShareGroups: [],
    ShareGroupMembers: [],
    ResourceBindings: [],
    ResourceRequirements: [],
  };

  const merged = { ...sheets, ...(overrides ?? {}) };

  Object.entries(merged).forEach(([sheetName, rows]) => {
    const sheet = XLSX.utils.json_to_sheet(rows ?? [], { header: headers[sheetName] });
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  });

  return Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
};

describe('processTemplateWorkbookService.parseTemplateWorkbook', () => {
  it('parses a valid workbook and preserves summary counts', () => {
    const parsed = __internal.parseTemplateWorkbook(buildWorkbookBuffer());

    expect(parsed.summary.template_count).toBe(1);
    expect(parsed.summary.stage_count).toBe(1);
    expect(parsed.summary.operation_count).toBe(1);
    expect(parsed.issues.filter((issue) => issue.severity === 'blocking')).toHaveLength(0);
  });

  it('reports duplicate schedule_key values within the same template', () => {
    const parsed = __internal.parseTemplateWorkbook(
      buildWorkbookBuffer({
        Operations: [
          {
            template_code: 'PT-90001',
            stage_code: 'PS-001',
            schedule_key: 'SCH-1',
            operation_code: 'OP-001',
            operation_day: 0,
            recommended_time: 9,
            recommended_day_offset: 0,
            window_start_time: 7,
            window_start_day_offset: 0,
            window_end_time: 11,
            window_end_day_offset: 0,
            operation_order: 1,
          },
          {
            template_code: 'PT-90001',
            stage_code: 'PS-001',
            schedule_key: 'SCH-1',
            operation_code: 'OP-002',
            operation_day: 1,
            recommended_time: 10,
            recommended_day_offset: 0,
            window_start_time: 8,
            window_start_day_offset: 0,
            window_end_time: 12,
            window_end_day_offset: 0,
            operation_order: 2,
          },
        ],
      }),
    );

    expect(
      parsed.issues.some(
        (issue) =>
          issue.severity === 'blocking' &&
          issue.sheet === 'Operations' &&
          issue.field === 'schedule_key' &&
          issue.code === 'DUPLICATE_KEY',
      ),
    ).toBe(true);
  });
});
