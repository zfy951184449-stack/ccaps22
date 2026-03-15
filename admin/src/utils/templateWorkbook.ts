import * as XLSX from 'xlsx'
import type {
  ProcessTemplateWorkbookData,
  ProcessTemplateWorkbookImportPayload,
  WorkbookConstraintRow,
  WorkbookOperationRow,
  WorkbookResourceRequirementRow,
  WorkbookStageRow,
  WorkbookTemplateRow
} from '../types/templateWorkbook'

const SHEETS = {
  readme: 'README',
  templates: 'Templates',
  stages: 'Stages',
  operations: 'Operations',
  constraints: 'Constraints',
  shareGroups: 'ShareGroups',
  shareGroupMembers: 'ShareGroupMembers',
  resourceBindings: 'ResourceBindings',
  resourceRequirements: 'ResourceRequirements'
} as const

const TEMPLATE_HEADERS: Array<keyof WorkbookTemplateRow> = [
  'template_code',
  'template_name',
  'description',
  'team_code',
  'total_days'
]

const STAGE_HEADERS: Array<keyof WorkbookStageRow> = [
  'template_code',
  'stage_code',
  'stage_name',
  'stage_order',
  'start_day',
  'description'
]

const OPERATION_HEADERS: Array<keyof WorkbookOperationRow> = [
  'template_code',
  'stage_code',
  'schedule_key',
  'operation_code',
  'operation_name',
  'operation_day',
  'recommended_time',
  'recommended_day_offset',
  'window_start_time',
  'window_start_day_offset',
  'window_end_time',
  'window_end_day_offset',
  'operation_order'
]

const CONSTRAINT_HEADERS: Array<keyof WorkbookConstraintRow> = [
  'template_code',
  'constraint_name',
  'from_schedule_key',
  'to_schedule_key',
  'constraint_type',
  'constraint_level',
  'lag_time',
  'lag_type',
  'lag_min',
  'lag_max',
  'share_mode',
  'description'
]

const joinCodes = (codes: string[]): string => codes.join('|')

const splitCodes = (value: unknown): string[] => {
  if (typeof value !== 'string' || !value.trim()) {
    return []
  }

  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
}

const parseBooleanCell = (value: unknown, fallback: boolean): boolean => {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }

  return fallback
}

const isEmptyRow = (row: Record<string, unknown>): boolean =>
  Object.values(row).every((value) => value === null || value === undefined || value === '')

const readSheetRows = (workbook: XLSX.WorkBook, sheetName: string): Array<Record<string, unknown>> => {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    return []
  }

  return XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true })
    .filter((row) => !isEmptyRow(row))
}

export const downloadTemplateWorkbook = (data: ProcessTemplateWorkbookData): string => {
  const workbook = XLSX.utils.book_new()

  const readmeRows = [
    ['APS 工艺模板 Excel 模版'],
    ['format_version', data.format_version],
    ['导入说明', '请保持 Sheet 名称不变；total_days 为导出参考值，导入时系统会重新计算。'],
    ['导入模式', 'create = 新建；replace = 按 template_code 替换未被批次引用的模板。'],
    ['资源候选编码', 'candidate_resource_codes 多值请用 | 分隔。'],
    ['导出告警', data.warnings.length ? data.warnings.join('\n') : '无']
  ]

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(readmeRows), SHEETS.readme)
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.templates, { header: TEMPLATE_HEADERS }),
    SHEETS.templates
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.stages, { header: STAGE_HEADERS }),
    SHEETS.stages
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.operations, { header: OPERATION_HEADERS }),
    SHEETS.operations
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.constraints, { header: CONSTRAINT_HEADERS }),
    SHEETS.constraints
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.share_groups, {
      header: ['template_code', 'group_code', 'group_name', 'share_mode']
    }),
    SHEETS.shareGroups
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.share_group_members, {
      header: ['template_code', 'group_code', 'schedule_key']
    }),
    SHEETS.shareGroupMembers
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.resource_bindings, {
      header: ['template_code', 'schedule_key', 'resource_node_code']
    }),
    SHEETS.resourceBindings
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      data.resource_requirements.map((row) => ({
        ...row,
        candidate_resource_codes: joinCodes(row.candidate_resource_codes)
      })),
      {
        header: [
          'template_code',
          'schedule_key',
          'requirement_order',
          'resource_type',
          'required_count',
          'is_mandatory',
          'requires_exclusive_use',
          'prep_minutes',
          'changeover_minutes',
          'cleanup_minutes',
          'candidate_resource_codes'
        ]
      }
    ),
    SHEETS.resourceRequirements
  )

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `process-template-workbook-${timestamp}.xlsx`
  XLSX.writeFile(workbook, fileName)
  return fileName
}

export const parseTemplateWorkbookFile = async (
  file: File,
  mode: ProcessTemplateWorkbookImportPayload['mode']
): Promise<ProcessTemplateWorkbookImportPayload> => {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })

  const templates = readSheetRows(workbook, SHEETS.templates).map((row) => ({
    template_code: String(row.template_code ?? '').trim(),
    template_name: String(row.template_name ?? '').trim(),
    description: row.description ? String(row.description) : null,
    team_code: row.team_code ? String(row.team_code) : null,
    total_days: row.total_days === null || row.total_days === undefined || row.total_days === ''
      ? null
      : Number(row.total_days)
  }))

  const stages = readSheetRows(workbook, SHEETS.stages).map((row) => ({
    template_code: String(row.template_code ?? '').trim(),
    stage_code: String(row.stage_code ?? '').trim(),
    stage_name: String(row.stage_name ?? '').trim(),
    stage_order: Number(row.stage_order ?? 0),
    start_day: Number(row.start_day ?? 0),
    description: row.description ? String(row.description) : null
  }))

  const operations = readSheetRows(workbook, SHEETS.operations).map((row) => ({
    template_code: String(row.template_code ?? '').trim(),
    stage_code: String(row.stage_code ?? '').trim(),
    schedule_key: String(row.schedule_key ?? '').trim(),
    operation_code: String(row.operation_code ?? '').trim(),
    operation_name: row.operation_name ? String(row.operation_name) : null,
    operation_day: Number(row.operation_day ?? 0),
    recommended_time: Number(row.recommended_time ?? 0),
    recommended_day_offset: Number(row.recommended_day_offset ?? 0),
    window_start_time: Number(row.window_start_time ?? 0),
    window_start_day_offset: Number(row.window_start_day_offset ?? 0),
    window_end_time: Number(row.window_end_time ?? 0),
    window_end_day_offset: Number(row.window_end_day_offset ?? 0),
    operation_order: Number(row.operation_order ?? 0)
  }))

  const constraints = readSheetRows(workbook, SHEETS.constraints).map((row) => ({
    template_code: String(row.template_code ?? '').trim(),
    constraint_name: row.constraint_name ? String(row.constraint_name) : null,
    from_schedule_key: String(row.from_schedule_key ?? '').trim(),
    to_schedule_key: String(row.to_schedule_key ?? '').trim(),
    constraint_type: String(row.constraint_type ?? 'FS').trim().toUpperCase() as WorkbookConstraintRow['constraint_type'],
    constraint_level: Number(row.constraint_level ?? 1),
    lag_time: Number(row.lag_time ?? 0),
    lag_type: String(row.lag_type ?? 'FIXED').trim().toUpperCase(),
    lag_min: Number(row.lag_min ?? 0),
    lag_max: row.lag_max === null || row.lag_max === undefined || row.lag_max === ''
      ? null
      : Number(row.lag_max),
    share_mode: String(row.share_mode ?? 'NONE').trim().toUpperCase(),
    description: row.description ? String(row.description) : null
  }))

  const shareGroups = readSheetRows(workbook, SHEETS.shareGroups).map((row) => ({
    template_code: String(row.template_code ?? '').trim(),
    group_code: String(row.group_code ?? '').trim(),
    group_name: row.group_name ? String(row.group_name) : null,
    share_mode: String(row.share_mode ?? 'SAME_TEAM').trim().toUpperCase()
  }))

  const shareGroupMembers = readSheetRows(workbook, SHEETS.shareGroupMembers).map((row) => ({
    template_code: String(row.template_code ?? '').trim(),
    group_code: String(row.group_code ?? '').trim(),
    schedule_key: String(row.schedule_key ?? '').trim()
  }))

  const resourceBindings = readSheetRows(workbook, SHEETS.resourceBindings).map((row) => ({
    template_code: String(row.template_code ?? '').trim(),
    schedule_key: String(row.schedule_key ?? '').trim(),
    resource_node_code: String(row.resource_node_code ?? '').trim()
  }))

  const resourceRequirements = readSheetRows(workbook, SHEETS.resourceRequirements).map((row) => ({
    template_code: String(row.template_code ?? '').trim(),
    schedule_key: String(row.schedule_key ?? '').trim(),
    requirement_order: Number(row.requirement_order ?? 1),
    resource_type: String(row.resource_type ?? '').trim().toUpperCase(),
    required_count: Number(row.required_count ?? 1),
    is_mandatory: parseBooleanCell(row.is_mandatory, true),
    requires_exclusive_use: parseBooleanCell(row.requires_exclusive_use, true),
    prep_minutes: Number(row.prep_minutes ?? 0),
    changeover_minutes: Number(row.changeover_minutes ?? 0),
    cleanup_minutes: Number(row.cleanup_minutes ?? 0),
    candidate_resource_codes: splitCodes(row.candidate_resource_codes)
  })) as WorkbookResourceRequirementRow[]

  return {
    format_version: 'process-template-workbook-v1',
    exported_at: new Date().toISOString(),
    warnings: [],
    mode,
    templates,
    stages,
    operations,
    constraints,
    share_groups: shareGroups,
    share_group_members: shareGroupMembers,
    resource_bindings: resourceBindings,
    resource_requirements: resourceRequirements
  }
}
