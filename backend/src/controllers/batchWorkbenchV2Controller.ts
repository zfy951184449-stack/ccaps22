import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import dayjs from 'dayjs';
import pool from '../config/database';

type WorkbenchDataMode = 'LIVE_READONLY' | 'MIXED_DATA' | 'DATA_GAP';
type WorkbenchSourceStatus =
  | 'LIVE_READONLY'
  | 'MIXED_DATA'
  | 'DATA_GAP'
  | 'NOT_IMPLEMENTED';

interface DataGap {
  code: string;
  message: string;
  affectsBusinessCredibility: boolean;
}

const inferTemplateDomain = (value: Record<string, any>) => {
  const text = `${value.team_code ?? ''} ${value.template_code ?? ''} ${value.template_name ?? ''}`.toUpperCase();
  if (text.includes('DSP') || text.includes('CAPTURE') || text.includes('CHROM') || text.includes('UF') || text.includes('DF')) {
    return 'DSP';
  }
  if (text.includes('USP') || text.includes('/B') || text.includes('BIOREACTOR') || text.includes('HARVEST')) {
    return 'USP';
  }
  return 'UNKNOWN';
};

const toIso = (value: unknown) => {
  const parsed = dayjs(value as string);
  return parsed.isValid() ? parsed.toISOString() : null;
};

const placeholders = (items: unknown[]) => items.map(() => '?').join(',');

const source = (
  key: string,
  label: string,
  status: WorkbenchSourceStatus,
  currentSource: string,
  targetSource: string,
  gap: string | null,
  affectsBusinessCredibility: boolean,
) => ({
  key,
  label,
  status,
  currentSource,
  targetSource,
  gap,
  affectsBusinessCredibility,
});

const loadBatches = async () => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT
        pbp.id,
        pbp.batch_code,
        pbp.batch_name,
        pbp.template_id,
        pt.template_code,
        pt.template_name,
        ou.unit_code AS team_code,
        ou.unit_name AS team_name,
        DATE_FORMAT(pbp.planned_start_date, '%Y-%m-%d') AS planned_start_date,
        DATE_FORMAT(pbp.planned_end_date, '%Y-%m-%d') AS planned_end_date,
        pbp.template_duration_days,
        pbp.plan_status,
        pbp.planning_status,
        pbp.batch_color,
        (SELECT COUNT(*) FROM batch_operation_plans WHERE batch_plan_id = pbp.id) AS operation_count,
        (SELECT COALESCE(SUM(required_people), 0) FROM batch_operation_plans WHERE batch_plan_id = pbp.id) AS total_required_people,
        (
          SELECT COUNT(DISTINCT bpa.employee_id)
          FROM batch_personnel_assignments bpa
          JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
          WHERE bop.batch_plan_id = pbp.id
            AND bpa.assignment_status <> 'CANCELLED'
        ) AS assigned_people_count
      FROM production_batch_plans pbp
      LEFT JOIN process_templates pt ON pbp.template_id = pt.id
      LEFT JOIN organization_units ou ON pt.team_id = ou.id
      ORDER BY pbp.created_at DESC, pbp.id DESC
    `,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    batchCode: row.batch_code,
    batchName: row.batch_name,
    batchStatus: row.plan_status,
    planningStatus: row.planning_status ?? null,
    templateId: Number(row.template_id),
    templateCode: row.template_code ?? null,
    templateName: row.template_name ?? null,
    templateDomain: inferTemplateDomain(row),
    plannedStart: row.planned_start_date ? dayjs(row.planned_start_date).startOf('day').toISOString() : null,
    plannedEnd: row.planned_end_date ? dayjs(row.planned_end_date).endOf('day').toISOString() : null,
    templateDurationDays: Number(row.template_duration_days ?? 0),
    operationCount: Number(row.operation_count ?? 0),
    totalRequiredPeople: Number(row.total_required_people ?? 0),
    assignedPeopleCount: Number(row.assigned_people_count ?? 0),
    color: row.batch_color ?? null,
  }));
};

const loadTemplates = async () => {
  const [templateRows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT
        pt.id,
        pt.template_code,
        pt.template_name,
        pt.total_days,
        ou.unit_code AS team_code,
        ou.unit_name AS team_name,
        COUNT(DISTINCT ps.id) AS stage_count,
        COUNT(DISTINCT sos.id) AS operation_count
      FROM process_templates pt
      LEFT JOIN organization_units ou ON ou.id = pt.team_id
      LEFT JOIN process_stages ps ON ps.template_id = pt.id
      LEFT JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
      GROUP BY pt.id, ou.unit_code, ou.unit_name
      ORDER BY pt.template_code
    `,
  );

  const [operationRows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT
        pt.id AS template_id,
        ps.id AS stage_id,
        ps.stage_name,
        ps.stage_order,
        ps.start_day,
        sos.id AS schedule_id,
        sos.operation_id,
        sos.operation_day,
        sos.recommended_time,
        sos.recommended_day_offset,
        sos.operation_order,
        o.operation_code,
        o.operation_name,
        o.standard_time,
        o.required_people,
        COUNT(DISTINCT oqr.id) AS qualification_requirement_count
      FROM process_templates pt
      LEFT JOIN process_stages ps ON ps.template_id = pt.id
      LEFT JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
      LEFT JOIN operations o ON o.id = sos.operation_id
      LEFT JOIN operation_qualification_requirements oqr ON oqr.operation_id = o.id
      GROUP BY pt.id, ps.id, sos.id, o.id
      ORDER BY pt.template_code, ps.stage_order, sos.operation_day, sos.operation_order, sos.id
    `,
  );

  const operationsByTemplate = new Map<number, any[]>();
  operationRows
    .filter((row) => row.schedule_id)
    .forEach((row) => {
      const templateId = Number(row.template_id);
      if (!operationsByTemplate.has(templateId)) {
        operationsByTemplate.set(templateId, []);
      }

      const offsetHours =
        (Number(row.start_day ?? 0) + Number(row.operation_day ?? 0) + Number(row.recommended_day_offset ?? 0)) * 24 +
        Number(row.recommended_time ?? 0);

      operationsByTemplate.get(templateId)!.push({
        templateOperationId: Number(row.schedule_id),
        operationId: Number(row.operation_id),
        operationCode: row.operation_code ?? null,
        operationName: row.operation_name ?? 'Unnamed operation',
        stageId: Number(row.stage_id ?? 0),
        stageName: row.stage_name ?? 'DATA GAP: missing stage',
        stageOrder: Number(row.stage_order ?? 0),
        sequence: Number(row.operation_order ?? row.schedule_id),
        offsetHours,
        durationHours: Number(row.standard_time ?? 0),
        requiredPeople: Number(row.required_people ?? 0),
        qualificationRequirementCount: Number(row.qualification_requirement_count ?? 0),
      });
    });

  return templateRows.map((row) => ({
    id: Number(row.id),
    templateCode: row.template_code,
    templateName: row.template_name,
    domain: inferTemplateDomain(row),
    teamCode: row.team_code ?? null,
    teamName: row.team_name ?? null,
    totalDays: Number(row.total_days ?? 0),
    stageCount: Number(row.stage_count ?? 0),
    operationCount: Number(row.operation_count ?? 0),
    sourceLabel: 'LIVE_READONLY: process_templates + process_stages + stage_operation_schedules',
    operations: operationsByTemplate.get(Number(row.id)) ?? [],
  }));
};

const loadBatchOperations = async (batchId: number) => {
  const [operationRows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT
        bop.id AS operation_plan_id,
        bop.batch_plan_id,
        pbp.batch_code,
        pbp.template_id,
        pt.template_code,
        pt.template_name,
        ou.unit_code AS team_code,
        ou.unit_name AS team_name,
        bop.template_schedule_id,
        bop.operation_id,
        o.operation_code,
        o.operation_name,
        bop.planned_start_datetime,
        bop.planned_end_datetime,
        bop.planned_duration,
        bop.required_people,
        bop.is_locked,
        ps.id AS stage_id,
        ps.stage_name,
        ps.stage_order,
        sos.operation_order,
        COUNT(DISTINCT oqr.id) AS qualification_requirement_count
      FROM batch_operation_plans bop
      JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
      LEFT JOIN process_templates pt ON pt.id = pbp.template_id
      LEFT JOIN organization_units ou ON ou.id = pt.team_id
      LEFT JOIN stage_operation_schedules sos ON sos.id = bop.template_schedule_id
      LEFT JOIN process_stages ps ON ps.id = sos.stage_id
      LEFT JOIN operations o ON o.id = bop.operation_id
      LEFT JOIN operation_qualification_requirements oqr ON oqr.operation_id = bop.operation_id
      WHERE bop.batch_plan_id = ?
        AND COALESCE(bop.is_independent, 0) = 0
      GROUP BY bop.id, ps.id, sos.id, o.id, pt.id, ou.id
      ORDER BY bop.planned_start_datetime, ps.stage_order, sos.operation_order, bop.id
    `,
    [batchId],
  );

  const operationPlanIds = operationRows.map((row) => Number(row.operation_plan_id));
  const operationIds = Array.from(new Set(operationRows.map((row) => Number(row.operation_id)).filter(Number.isFinite)));

  const assignmentsByOperation = new Map<number, any[]>();
  if (operationPlanIds.length > 0) {
    const [assignmentRows] = await pool.execute<RowDataPacket[]>(
      `
        SELECT
          bpa.id,
          bpa.batch_operation_plan_id,
          bpa.position_number,
          bpa.employee_id,
          e.employee_code,
          e.employee_name,
          bpa.role,
          bpa.assignment_status,
          bpa.is_primary,
          bpa.is_locked,
          bpa.shift_plan_id,
          esp.plan_date,
          esp.plan_category,
          esp.plan_state,
          sd.shift_code,
          sd.shift_name
        FROM batch_personnel_assignments bpa
        LEFT JOIN employees e ON e.id = bpa.employee_id
        LEFT JOIN employee_shift_plans esp ON esp.id = bpa.shift_plan_id
        LEFT JOIN shift_definitions sd ON sd.id = esp.shift_id
        WHERE bpa.batch_operation_plan_id IN (${placeholders(operationPlanIds)})
          AND bpa.assignment_status <> 'CANCELLED'
        ORDER BY bpa.batch_operation_plan_id, bpa.position_number, bpa.id
      `,
      operationPlanIds,
    );

    assignmentRows.forEach((row) => {
      const operationPlanId = Number(row.batch_operation_plan_id);
      if (!assignmentsByOperation.has(operationPlanId)) {
        assignmentsByOperation.set(operationPlanId, []);
      }
      assignmentsByOperation.get(operationPlanId)!.push({
        id: Number(row.id),
        positionNumber: Number(row.position_number ?? 1),
        employeeId: Number(row.employee_id),
        employeeCode: row.employee_code ?? null,
        employeeName: row.employee_name ?? `Employee ${row.employee_id}`,
        role: row.role ?? null,
        status: row.assignment_status,
        isPrimary: Boolean(row.is_primary),
        isLocked: Boolean(row.is_locked),
        shiftPlanId: row.shift_plan_id ? Number(row.shift_plan_id) : null,
        shiftCode: row.shift_code ?? null,
        shiftName: row.shift_name ?? null,
        planDate: row.plan_date ? dayjs(row.plan_date).format('YYYY-MM-DD') : null,
        planCategory: row.plan_category ?? null,
        planState: row.plan_state ?? null,
      });
    });
  }

  const qualificationsByOperation = new Map<number, any[]>();
  if (operationIds.length > 0) {
    const [qualificationRows] = await pool.execute<RowDataPacket[]>(
      `
        SELECT
          oqr.operation_id,
          oqr.position_number,
          oqr.qualification_id,
          q.qualification_name,
          oqr.required_level,
          oqr.min_level,
          oqr.required_count,
          oqr.is_mandatory
        FROM operation_qualification_requirements oqr
        LEFT JOIN qualifications q ON q.id = oqr.qualification_id
        WHERE oqr.operation_id IN (${placeholders(operationIds)})
        ORDER BY oqr.operation_id, oqr.position_number, oqr.id
      `,
      operationIds,
    );

    qualificationRows.forEach((row) => {
      const operationId = Number(row.operation_id);
      if (!qualificationsByOperation.has(operationId)) {
        qualificationsByOperation.set(operationId, []);
      }
      qualificationsByOperation.get(operationId)!.push({
        positionNumber: Number(row.position_number ?? 1),
        qualificationId: Number(row.qualification_id),
        qualificationName: row.qualification_name ?? `Qualification ${row.qualification_id}`,
        requiredLevel: Number(row.required_level ?? row.min_level ?? 1),
        requiredCount: Number(row.required_count ?? 1),
        isMandatory: Boolean(row.is_mandatory),
      });
    });
  }

  return operationRows.map((row, index) => {
    const operationPlanId = Number(row.operation_plan_id);
    const operationId = Number(row.operation_id);
    const assignments = assignmentsByOperation.get(operationPlanId) ?? [];
    const qualificationRequirements = qualificationsByOperation.get(operationId) ?? [];
    const start = toIso(row.planned_start_datetime);
    const end = toIso(row.planned_end_datetime);

    return {
      id: `batch-op:${operationPlanId}`,
      operationPlanId,
      batchId: Number(row.batch_plan_id),
      batchCode: row.batch_code,
      templateId: Number(row.template_id),
      templateCode: row.template_code ?? null,
      templateName: row.template_name ?? null,
      source: inferTemplateDomain(row),
      templateScheduleId: row.template_schedule_id ? Number(row.template_schedule_id) : null,
      operationId,
      operationCode: row.operation_code ?? null,
      operationName: row.operation_name ?? 'Unnamed operation',
      stageId: row.stage_id ? Number(row.stage_id) : null,
      stageName: row.stage_name ?? 'DATA GAP: missing stage',
      stageOrder: row.stage_order !== null && row.stage_order !== undefined ? Number(row.stage_order) : index + 1,
      sequence: row.operation_order !== null && row.operation_order !== undefined ? Number(row.operation_order) : index + 1,
      originalStart: start,
      originalEnd: end,
      previewStart: start,
      previewEnd: end,
      durationHours: Number(row.planned_duration ?? 0),
      requiredPeople: Number(row.required_people ?? 0),
      assignedPeople: assignments.length,
      currentAssignments: assignments.map((assignment) => assignment.employeeName),
      assignments,
      qualificationRequirements,
      qualificationRequirementCount: qualificationRequirements.length,
      locked: Boolean(row.is_locked) || assignments.some((assignment) => assignment.isLocked),
      movedHours: 0,
      dataGapWarnings: [
        ...(row.stage_id ? [] : ['DATA GAP: operation 缺少 stage 信息，stage-based shift 只能按时间顺序降级。']),
        ...(qualificationRequirements.length > 0 ? [] : ['DATA GAP: operation 缺少 qualification requirement。']),
      ],
    };
  });
};

const loadWorkforceSummary = async (startDate: string | null, endDate: string | null) => {
  const start = startDate ? dayjs(startDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
  const end = endDate ? dayjs(endDate).format('YYYY-MM-DD') : dayjs(start).add(14, 'day').format('YYYY-MM-DD');

  const [rows] = await pool.execute<RowDataPacket[]>(
    `
      SELECT
        (SELECT COUNT(*) FROM employees WHERE employment_status = 'ACTIVE') AS active_employee_count,
        (SELECT COUNT(*) FROM employee_qualifications) AS employee_qualification_count,
        (SELECT COUNT(*) FROM shift_definitions WHERE is_active = 1) AS active_shift_definition_count,
        (SELECT COUNT(*) FROM employee_shift_plans WHERE plan_date BETWEEN ? AND ?) AS shift_plan_count
    `,
    [start, end],
  );

  return {
    activeEmployeeCount: Number(rows[0]?.active_employee_count ?? 0),
    employeeQualificationCount: Number(rows[0]?.employee_qualification_count ?? 0),
    activeShiftDefinitionCount: Number(rows[0]?.active_shift_definition_count ?? 0),
    shiftPlanCount: Number(rows[0]?.shift_plan_count ?? 0),
    windowStart: start,
    windowEnd: end,
  };
};

export const getBatchWorkbenchV2Context = async (req: Request, res: Response) => {
  try {
    const requestedBatchId = req.query.batch_id ? Number(req.query.batch_id) : null;
    const [batches, templates] = await Promise.all([loadBatches(), loadTemplates()]);

    const selectedBatch =
      (requestedBatchId ? batches.find((batch) => batch.id === requestedBatchId) : null) ??
      batches.find((batch) => batch.operationCount > 0) ??
      batches[0] ??
      null;

    const [batchOperations, workforceSummary] = selectedBatch
      ? await Promise.all([
          loadBatchOperations(selectedBatch.id),
          loadWorkforceSummary(selectedBatch.plannedStart, selectedBatch.plannedEnd),
        ])
      : [[], await loadWorkforceSummary(null, null)];

    const upstreamTemplates = templates.filter((template) => template.domain === 'USP');
    const downstreamTemplates = templates.filter((template) => template.domain === 'DSP');
    const selectedBatchTemplateId = selectedBatch?.templateId ?? null;
    const defaultUpstreamTemplate =
      upstreamTemplates.find((template) => template.id === selectedBatchTemplateId) ??
      upstreamTemplates[0] ??
      templates[0] ??
      null;
    const defaultDownstreamTemplate =
      downstreamTemplates.find((template) => template.id !== defaultUpstreamTemplate?.id) ??
      downstreamTemplates[0] ??
      null;

    const gaps: DataGap[] = [];
    if (batches.length === 0) {
      gaps.push({
        code: 'NO_BATCHES',
        message: 'DATA GAP: 当前数据库没有 production_batch_plans，无法选择真实批次。',
        affectsBusinessCredibility: true,
      });
    }
    if (!selectedBatch) {
      gaps.push({
        code: 'NO_SELECTED_BATCH',
        message: 'DATA GAP: 无法确定当前批次上下文。',
        affectsBusinessCredibility: true,
      });
    }
    if (templates.length === 0) {
      gaps.push({
        code: 'NO_TEMPLATES',
        message: 'DATA GAP: 当前数据库没有 process_templates，无法选择真实模板。',
        affectsBusinessCredibility: true,
      });
    }
    if (upstreamTemplates.length === 0) {
      gaps.push({
        code: 'NO_UPSTREAM_TEMPLATE',
        message: 'DATA GAP: 无法从真实模板中识别 USP / 上游模板，请手动维护 team_code 或模板命名。',
        affectsBusinessCredibility: true,
      });
    }
    if (downstreamTemplates.length === 0) {
      gaps.push({
        code: 'NO_DOWNSTREAM_TEMPLATE',
        message: 'DATA GAP: 无法从真实模板中识别 DSP / 下游模板，请手动维护 team_code 或模板命名。',
        affectsBusinessCredibility: true,
      });
    }
    if (templates.some((template) => template.stageCount === 0)) {
      gaps.push({
        code: 'TEMPLATE_STAGE_GAP',
        message: 'DATA GAP: 部分真实模板没有 process_stages。',
        affectsBusinessCredibility: true,
      });
    }
    if (templates.some((template) => template.operationCount === 0)) {
      gaps.push({
        code: 'TEMPLATE_OPERATION_GAP',
        message: 'DATA GAP: 部分真实模板没有 stage_operation_schedules。',
        affectsBusinessCredibility: true,
      });
    }
    if (selectedBatch && batchOperations.length === 0) {
      gaps.push({
        code: 'NO_BATCH_OPERATIONS',
        message: 'DATA GAP: 当前批次没有 batch_operation_plans，需要先完成批次 operation 实例化。',
        affectsBusinessCredibility: true,
      });
    }
    if (batchOperations.length > 0 && batchOperations.some((operation) => !operation.stageId)) {
      gaps.push({
        code: 'BATCH_STAGE_GAP',
        message: 'DATA GAP: 部分 batch operation 缺少 stage 信息，stage-based shift 会降级为时间顺序。',
        affectsBusinessCredibility: true,
      });
    }
    if (batchOperations.length > 0 && batchOperations.some((operation) => operation.requiredPeople <= 0)) {
      gaps.push({
        code: 'REQUIRED_PEOPLE_GAP',
        message: 'DATA GAP: 部分 batch operation 缺少 required_people。',
        affectsBusinessCredibility: true,
      });
    }
    if (batchOperations.length > 0 && batchOperations.some((operation) => operation.qualificationRequirementCount === 0)) {
      gaps.push({
        code: 'QUALIFICATION_REQUIREMENT_GAP',
        message: 'DATA GAP: 部分 operation 缺少 operation_qualification_requirements。',
        affectsBusinessCredibility: true,
      });
    }
    if (batchOperations.length > 0 && batchOperations.every((operation) => operation.assignedPeople === 0)) {
      gaps.push({
        code: 'NO_CURRENT_ASSIGNMENTS',
        message: 'DATA GAP: 当前批次没有 batch_personnel_assignments；页面显示“暂无当前分配”，不生成假人员。',
        affectsBusinessCredibility: false,
      });
    }
    if (workforceSummary.employeeQualificationCount === 0) {
      gaps.push({
        code: 'EMPLOYEE_QUALIFICATION_GAP',
        message: 'DATA GAP: employee_qualifications 为空，solver 候选人资质可信度不足。',
        affectsBusinessCredibility: true,
      });
    }
    if (workforceSummary.shiftPlanCount === 0) {
      gaps.push({
        code: 'SHIFT_PLAN_GAP',
        message: 'DATA GAP: 当前时间窗没有 employee_shift_plans，solver 班次输入不足。',
        affectsBusinessCredibility: true,
      });
    }
    if (defaultDownstreamTemplate && selectedBatch && defaultDownstreamTemplate.id !== selectedBatch.templateId) {
      gaps.push({
        code: 'DOWNSTREAM_BATCH_INSTANCE_GAP',
        message: 'DATA GAP: 当前批次只绑定一个模板；下游模板可用于真实模板联动 preview，但没有对应的 batch_operation_plans 实例。',
        affectsBusinessCredibility: true,
      });
    }

    const criticalGapCodes = new Set(['NO_BATCHES', 'NO_SELECTED_BATCH', 'NO_TEMPLATES', 'NO_BATCH_OPERATIONS']);
    const dataMode: WorkbenchDataMode =
      gaps.some((gap) => criticalGapCodes.has(gap.code))
        ? 'DATA_GAP'
        : gaps.length > 0
          ? 'MIXED_DATA'
          : 'LIVE_READONLY';

    const audit = [
      source('batch_list', '批次列表', batches.length ? 'LIVE_READONLY' : 'DATA_GAP', 'production_batch_plans + process_templates', '现有真实批次 API/DB', batches.length ? null : '没有真实批次', true),
      source('current_batch', '当前批次信息', selectedBatch ? 'LIVE_READONLY' : 'DATA_GAP', 'production_batch_plans selected row', '真实批次详情', selectedBatch ? null : '没有当前批次', true),
      source('upstream_template_list', '上游模板列表', upstreamTemplates.length ? 'LIVE_READONLY' : 'DATA_GAP', 'process_templates filtered by team/name domain', '真实 USP 模板', upstreamTemplates.length ? null : '无法识别 USP 模板', true),
      source('downstream_template_list', '下游模板列表', downstreamTemplates.length ? 'LIVE_READONLY' : 'DATA_GAP', 'process_templates filtered by team/name domain', '真实 DSP 模板', downstreamTemplates.length ? null : '无法识别 DSP 模板', true),
      source('template_stage', '模板 stage', templates.some((template) => template.stageCount === 0) ? 'MIXED_DATA' : 'LIVE_READONLY', 'process_stages', '真实模板 stage', templates.some((template) => template.stageCount === 0) ? '部分模板无 stage' : null, true),
      source('template_operation', '模板 operation', templates.some((template) => template.operationCount === 0) ? 'MIXED_DATA' : 'LIVE_READONLY', 'stage_operation_schedules + operations', '真实模板 operation', templates.some((template) => template.operationCount === 0) ? '部分模板无 operation' : null, true),
      source('handoff_candidates', 'handoff operation 候选', templates.some((template) => template.operations.length > 0) ? 'LIVE_READONLY' : 'DATA_GAP', '真实模板 operation 列表', '真实 operation 候选', templates.some((template) => template.operations.length > 0) ? null : '没有 operation 候选', true),
      source('batch_operation_timeline', '批次 operation timeline', batchOperations.length ? 'LIVE_READONLY' : 'DATA_GAP', 'batch_operation_plans + operations + process_stages', '真实批次 operation timeline', batchOperations.length ? null : '当前批次没有 operation 实例', true),
      source('usp_dsp_combined_timeline', 'USP / DSP 组合 timeline', defaultUpstreamTemplate && defaultDownstreamTemplate ? (defaultDownstreamTemplate.id === selectedBatch?.templateId ? 'LIVE_READONLY' : 'MIXED_DATA') : 'DATA_GAP', '真实 batch operations + 真实模板 operations', '完整 DS 链路真实实例', defaultDownstreamTemplate?.id === selectedBatch?.templateId ? null : '下游模板没有当前批次实例，仅可作为真实模板 preview', true),
      source('personnel_demand', '当前人员需求', batchOperations.length ? (batchOperations.some((operation) => operation.requiredPeople <= 0 || operation.qualificationRequirementCount === 0) ? 'MIXED_DATA' : 'LIVE_READONLY') : 'DATA_GAP', 'batch_operation_plans.required_people + operation_qualification_requirements', '真实 operation demand', batchOperations.some((operation) => operation.qualificationRequirementCount === 0) ? '部分资质要求缺失' : null, true),
      source('personnel_assignment', '当前人员 assignment', batchOperations.some((operation) => operation.assignedPeople > 0) ? 'LIVE_READONLY' : 'DATA_GAP', 'batch_personnel_assignments + employees + employee_shift_plans', '真实人员分配', batchOperations.some((operation) => operation.assignedPeople > 0) ? null : '当前批次暂无人员分配', false),
      source('employee_shift_plans', 'employee shift plans', workforceSummary.shiftPlanCount > 0 ? 'LIVE_READONLY' : 'DATA_GAP', 'employee_shift_plans + shift_definitions', '真实班次计划', workforceSummary.shiftPlanCount > 0 ? null : '当前窗口班次数据不足', true),
      source('employee_qualifications', 'employee qualifications', workforceSummary.employeeQualificationCount > 0 ? 'LIVE_READONLY' : 'DATA_GAP', 'employee_qualifications + qualifications', '真实员工资质', workforceSummary.employeeQualificationCount > 0 ? null : '员工资质为空', true),
      source('operation_qualification_requirements', 'operation qualification requirements', batchOperations.some((operation) => operation.qualificationRequirementCount > 0) ? (batchOperations.some((operation) => operation.qualificationRequirementCount === 0) ? 'MIXED_DATA' : 'LIVE_READONLY') : 'DATA_GAP', 'operation_qualification_requirements', '真实 operation 资质要求', batchOperations.some((operation) => operation.qualificationRequirementCount === 0) ? '部分 operation 缺少资质要求' : null, true),
      source('original_timeline', 'Original timeline', batchOperations.length ? 'LIVE_READONLY' : 'DATA_GAP', 'batch_operation_plans planned_start/end', '真实正式计划时间', batchOperations.length ? null : '没有正式 operation 时间', true),
      source('preview_timeline', 'Preview timeline', batchOperations.length ? 'LIVE_READONLY' : 'DATA_GAP', '前端内存：真实 Original timeline + 临时时间 override', '不写库 preview timeline', batchOperations.length ? null : '没有 Original timeline 可供 preview', true),
      source('solver_preview_proposal', 'solver preview proposal', 'LIVE_READONLY', '/api/v4/scheduling/preview-proposal', '真实 solver_v4 preview endpoint', null, true),
    ];

    res.json({
      success: true,
      previewOnly: true,
      dataMode,
      batches,
      selectedBatchId: selectedBatch?.id ?? null,
      defaultUpstreamTemplateId: defaultUpstreamTemplate?.id ?? null,
      defaultDownstreamTemplateId: defaultDownstreamTemplate?.id ?? null,
      templates,
      batchOperations,
      workforceSummary,
      dataGaps: gaps,
      dataSourceAudit: audit,
    });
  } catch (error: any) {
    console.error('Error loading Batch Workbench V2 context:', error);
    res.status(500).json({
      success: false,
      previewOnly: true,
      dataMode: 'DATA_GAP',
      error: error?.message ?? 'Failed to load live readonly workbench data',
      dataGaps: [
        {
          code: 'LIVE_READONLY_CONTEXT_UNAVAILABLE',
          message: 'DATA GAP: 真实只读工作台数据接口不可用。',
          affectsBusinessCredibility: true,
        },
      ],
    });
  }
};
