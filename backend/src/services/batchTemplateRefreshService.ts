import { RowDataPacket } from 'mysql2';

// 「从模版刷新批次」服务。
//
// 背景:建批次时存储过程 generate_batch_operation_plans 把模版的工序时间/人数一次性算进
// batch_operation_plans 并冻结。模版后续被改(增删操作、改操作时间/时间窗/人数)后,老批次不会自动跟进。
// 本服务做两件事:
//   1) computeRefreshDiff —— 只读地按「当前模版」重新推导一遍目标工序集,与批次现有工序做三向对比
//      (新增/移除/变更),供前端预览。目标推导逻辑与存储过程逐字一致(锚定 planned_start_date 不变)。
//   2) applyRefresh —— 增量地把选中的差异应用到 batch_operation_plans(只动差异,不碰未变工序,
//      从而保留未变工序上的手工锁定/备注),再按当前工序集重建 batch_operation_constraints。
//
// 仅用于 DRAFT 批次(状态校验在 controller 做);DRAFT 批次没有下游排班/加班/冲突引用,
// 故移除/重建工序行不会触发硬外键(RESTRICT)。约束/资源/人员安排等子表对 batch_operation_plans
// 均为 ON DELETE CASCADE,删除工序行会连带清理。

type Executor = { execute: typeof import('../config/database').default.execute };

// 目标工序行 = 存储过程 INSERT...SELECT 的只读版,DATETIME 统一格式化成可比较字符串。
const TARGET_OPERATIONS_SQL = `
  SELECT
    sos.id AS template_schedule_id,
    sos.operation_id AS operation_id,
    o.operation_code AS operation_code,
    o.operation_name AS operation_name,
    ps.stage_name AS stage_name,
    DATE_FORMAT(
      ADDTIME(DATE_ADD(p.start_date, INTERVAL ((ps.start_day + sos.operation_day) - p.min_day) DAY),
              SEC_TO_TIME(sos.recommended_time * 3600)),
      '%Y-%m-%d %H:%i:%s'
    ) AS planned_start_datetime,
    DATE_FORMAT(
      ADDTIME(
        ADDTIME(DATE_ADD(p.start_date, INTERVAL ((ps.start_day + sos.operation_day) - p.min_day) DAY),
                SEC_TO_TIME(sos.recommended_time * 3600)),
        SEC_TO_TIME(o.standard_time * 3600)
      ),
      '%Y-%m-%d %H:%i:%s'
    ) AS planned_end_datetime,
    o.standard_time AS planned_duration,
    DATE_FORMAT(
      ADDTIME(DATE_ADD(p.start_date, INTERVAL ((ps.start_day + sos.operation_day) - p.min_day) DAY),
              SEC_TO_TIME(sos.window_start_time * 3600)),
      '%Y-%m-%d %H:%i:%s'
    ) AS window_start_datetime,
    DATE_FORMAT(
      ADDTIME(DATE_ADD(p.start_date, INTERVAL ((ps.start_day + sos.operation_day) - p.min_day) DAY),
              SEC_TO_TIME(sos.window_end_time * 3600)),
      '%Y-%m-%d %H:%i:%s'
    ) AS window_end_datetime,
    o.required_people AS required_people
  FROM stage_operation_schedules sos
  JOIN process_stages ps ON sos.stage_id = ps.id
  JOIN operations o ON sos.operation_id = o.id
  JOIN (
    SELECT
      pbp.planned_start_date AS start_date,
      pbp.template_id AS template_id,
      (SELECT MIN(ps2.start_day + sos2.operation_day)
         FROM process_stages ps2
         JOIN stage_operation_schedules sos2 ON ps2.id = sos2.stage_id
        WHERE ps2.template_id = pbp.template_id) AS min_day
    FROM production_batch_plans pbp
    WHERE pbp.id = ?
  ) p ON ps.template_id = p.template_id
`;

const CURRENT_OPERATIONS_SQL = `
  SELECT
    bop.id AS id,
    bop.template_schedule_id AS template_schedule_id,
    bop.operation_id AS operation_id,
    o.operation_code AS operation_code,
    o.operation_name AS operation_name,
    ps.stage_name AS stage_name,
    DATE_FORMAT(bop.planned_start_datetime, '%Y-%m-%d %H:%i:%s') AS planned_start_datetime,
    DATE_FORMAT(bop.planned_end_datetime, '%Y-%m-%d %H:%i:%s') AS planned_end_datetime,
    bop.planned_duration AS planned_duration,
    DATE_FORMAT(bop.window_start_datetime, '%Y-%m-%d %H:%i:%s') AS window_start_datetime,
    DATE_FORMAT(bop.window_end_datetime, '%Y-%m-%d %H:%i:%s') AS window_end_datetime,
    bop.required_people AS required_people,
    bop.is_locked AS is_locked,
    bop.notes AS notes
  FROM batch_operation_plans bop
  LEFT JOIN operations o ON bop.operation_id = o.id
  LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
  LEFT JOIN process_stages ps ON sos.stage_id = ps.id
  WHERE bop.batch_plan_id = ?
`;

export interface RefreshOpRow {
  template_schedule_id: number;
  operation_id: number;
  operation_code: string | null;
  operation_name: string | null;
  stage_name: string | null;
  planned_start_datetime: string | null;
  planned_end_datetime: string | null;
  planned_duration: number | null;
  window_start_datetime: string | null;
  window_end_datetime: string | null;
  required_people: number | null;
}

interface CurrentOpRow extends RefreshOpRow {
  id: number;
  is_locked: boolean;
}

export interface RefreshChangedField {
  field: string;
  label: string;
  from: string | number | null;
  to: string | number | null;
}

export interface RefreshChangedOp {
  template_schedule_id: number;
  operation_id: number;
  operation_code: string | null;
  operation_name: string | null;
  stage_name: string | null;
  is_locked: boolean;
  fields: RefreshChangedField[];
}

export interface RefreshDiff {
  added: RefreshOpRow[];
  removed: RefreshOpRow[];
  changed: RefreshChangedOp[];
  unchangedCount: number;
  lockedCount: number;
}

export interface ApplyRefreshResult {
  added: number;
  removed: number;
  changed: number;
  skippedLocked: number;
}

// 比较用规范化:DECIMAL 在 mysql2 默认返回字符串('8.00'),用数值比较避免 '8' vs '8.00' 误报。
const normNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const normStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

const COMPARED_FIELDS: ReadonlyArray<{ field: keyof RefreshOpRow; label: string; numeric: boolean }> = [
  { field: 'operation_id', label: '操作', numeric: true },
  { field: 'planned_start_datetime', label: '开始时间', numeric: false },
  { field: 'planned_end_datetime', label: '结束时间', numeric: false },
  { field: 'planned_duration', label: '时长(小时)', numeric: true },
  { field: 'window_start_datetime', label: '最早开始', numeric: false },
  { field: 'window_end_datetime', label: '最晚完成', numeric: false },
  { field: 'required_people', label: '人数', numeric: true },
];

const toTargetRow = (r: RowDataPacket): RefreshOpRow => ({
  template_schedule_id: Number(r.template_schedule_id),
  operation_id: Number(r.operation_id),
  operation_code: normStr(r.operation_code),
  operation_name: normStr(r.operation_name),
  stage_name: normStr(r.stage_name),
  planned_start_datetime: normStr(r.planned_start_datetime),
  planned_end_datetime: normStr(r.planned_end_datetime),
  planned_duration: normNum(r.planned_duration),
  window_start_datetime: normStr(r.window_start_datetime),
  window_end_datetime: normStr(r.window_end_datetime),
  required_people: normNum(r.required_people),
});

interface RefreshMaps {
  templateId: number;
  targetMap: Map<number, RefreshOpRow>;
  currentMap: Map<number, CurrentOpRow>;
}

const loadMaps = async (executor: Executor, batchPlanId: number): Promise<RefreshMaps> => {
  const [batchRows] = await executor.execute<RowDataPacket[]>(
    'SELECT template_id FROM production_batch_plans WHERE id = ?',
    [batchPlanId],
  );
  if (!batchRows.length) {
    throw new BatchRefreshError('NOT_FOUND', '批次不存在');
  }
  const templateId = Number(batchRows[0].template_id);

  const [targetRows] = await executor.execute<RowDataPacket[]>(TARGET_OPERATIONS_SQL, [batchPlanId]);
  const [currentRows] = await executor.execute<RowDataPacket[]>(CURRENT_OPERATIONS_SQL, [batchPlanId]);

  const targetMap = new Map<number, RefreshOpRow>();
  for (const r of targetRows) targetMap.set(Number(r.template_schedule_id), toTargetRow(r));

  const currentMap = new Map<number, CurrentOpRow>();
  for (const r of currentRows) {
    currentMap.set(Number(r.template_schedule_id), {
      ...toTargetRow(r),
      id: Number(r.id),
      is_locked: !!Number(r.is_locked),
    });
  }

  return { templateId, targetMap, currentMap };
};

const buildDiff = ({ targetMap, currentMap }: RefreshMaps): RefreshDiff => {
  const added: RefreshOpRow[] = [];
  const removed: RefreshOpRow[] = [];
  const changed: RefreshChangedOp[] = [];
  let unchangedCount = 0;
  let lockedCount = 0;

  for (const [scheduleId, target] of targetMap) {
    const current = currentMap.get(scheduleId);
    if (!current) {
      added.push(target);
      continue;
    }
    const fields: RefreshChangedField[] = [];
    for (const { field, label, numeric } of COMPARED_FIELDS) {
      const a = numeric ? normNum(current[field]) : normStr(current[field]);
      const b = numeric ? normNum(target[field]) : normStr(target[field]);
      if (a !== b) {
        fields.push({ field, label, from: current[field] as any, to: target[field] as any });
      }
    }
    if (fields.length === 0) {
      unchangedCount += 1;
    } else {
      if (current.is_locked) lockedCount += 1;
      changed.push({
        template_schedule_id: scheduleId,
        operation_id: target.operation_id,
        operation_code: target.operation_code,
        operation_name: target.operation_name,
        stage_name: target.stage_name,
        is_locked: current.is_locked,
        fields,
      });
    }
  }

  for (const [scheduleId, current] of currentMap) {
    if (!targetMap.has(scheduleId)) removed.push(current);
  }

  return { added, removed, changed, unchangedCount, lockedCount };
};

export const computeRefreshDiff = async (executor: Executor, batchPlanId: number): Promise<RefreshDiff> => {
  return buildDiff(await loadMaps(executor, batchPlanId));
};

// 重建批次约束:与存储过程一致,先清后按当前工序集 INNER JOIN 重导(部分应用时只会生成两端均存在的约束)。
const rebuildConstraints = async (executor: Executor, batchPlanId: number, templateId: number): Promise<void> => {
  await executor.execute('DELETE FROM batch_operation_constraints WHERE batch_plan_id = ?', [batchPlanId]);
  await executor.execute(
    `INSERT INTO batch_operation_constraints (
        batch_plan_id, batch_operation_plan_id, predecessor_batch_operation_plan_id,
        constraint_type, time_lag, constraint_level, share_personnel, constraint_name, description
     )
     SELECT
        ?, bop_current.id, bop_predecessor.id,
        oc.constraint_type, oc.time_lag, oc.constraint_level, oc.share_personnel, oc.constraint_name, oc.description
     FROM operation_constraints oc
     JOIN stage_operation_schedules sos_current ON oc.schedule_id = sos_current.id
     JOIN stage_operation_schedules sos_predecessor ON oc.predecessor_schedule_id = sos_predecessor.id
     JOIN process_stages ps_current ON sos_current.stage_id = ps_current.id
     JOIN process_stages ps_predecessor ON sos_predecessor.stage_id = ps_predecessor.id
     JOIN batch_operation_plans bop_current
       ON bop_current.batch_plan_id = ? AND bop_current.template_schedule_id = sos_current.id
     JOIN batch_operation_plans bop_predecessor
       ON bop_predecessor.batch_plan_id = ? AND bop_predecessor.template_schedule_id = sos_predecessor.id
     WHERE ps_current.template_id = ? AND ps_predecessor.template_id = ?`,
    [batchPlanId, batchPlanId, batchPlanId, templateId, templateId],
  );
};

/**
 * 把选中的模版差异增量应用到批次。
 * @param scheduleIds 选中要应用的 template_schedule_id 列表;为 null 表示应用全部差异(锁定的变更工序始终跳过)。
 */
export const applyRefresh = async (
  executor: Executor,
  batchPlanId: number,
  scheduleIds: number[] | null,
): Promise<ApplyRefreshResult> => {
  const maps = await loadMaps(executor, batchPlanId);
  const diff = buildDiff(maps);
  const { templateId, targetMap } = maps;

  const selected = scheduleIds === null ? null : new Set(scheduleIds);
  const isSelected = (id: number) => selected === null || selected.has(id);

  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;
  let skippedLocked = 0;

  // 新增工序
  for (const op of diff.added) {
    if (!isSelected(op.template_schedule_id)) continue;
    await executor.execute(
      `INSERT INTO batch_operation_plans (
          batch_plan_id, template_schedule_id, operation_id,
          planned_start_datetime, planned_end_datetime, planned_duration,
          window_start_datetime, window_end_datetime, required_people
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchPlanId, op.template_schedule_id, op.operation_id,
        op.planned_start_datetime, op.planned_end_datetime, op.planned_duration,
        op.window_start_datetime, op.window_end_datetime, op.required_people,
      ],
    );
    addedCount += 1;
  }

  // 变更工序(锁定的跳过,保留其手工编辑)
  for (const op of diff.changed) {
    if (!isSelected(op.template_schedule_id)) continue;
    if (op.is_locked) {
      skippedLocked += 1;
      continue;
    }
    const target = targetMap.get(op.template_schedule_id);
    const current = maps.currentMap.get(op.template_schedule_id);
    if (!target || !current) continue;
    await executor.execute(
      `UPDATE batch_operation_plans
          SET operation_id = ?, planned_start_datetime = ?, planned_end_datetime = ?,
              planned_duration = ?, window_start_datetime = ?, window_end_datetime = ?, required_people = ?
        WHERE id = ?`,
      [
        target.operation_id, target.planned_start_datetime, target.planned_end_datetime,
        target.planned_duration, target.window_start_datetime, target.window_end_datetime, target.required_people,
        current.id,
      ],
    );
    changedCount += 1;
  }

  // 移除工序(模版已删除该操作;约束/资源/人员安排经 CASCADE 连带清理)
  for (const op of diff.removed) {
    if (!isSelected(op.template_schedule_id)) continue;
    const current = maps.currentMap.get(op.template_schedule_id);
    if (!current) continue;
    await executor.execute('DELETE FROM batch_operation_plans WHERE id = ?', [current.id]);
    removedCount += 1;
  }

  // 任一工序变动后都按当前工序集重建约束;并按当前模版重算批次工期/结束日期。
  await rebuildConstraints(executor, batchPlanId, templateId);
  await executor.execute(
    `UPDATE production_batch_plans
        SET template_duration_days = calculate_template_duration(template_id),
            planned_end_date = DATE_ADD(planned_start_date, INTERVAL (calculate_template_duration(template_id) - 1) DAY)
      WHERE id = ?`,
    [batchPlanId],
  );

  return { added: addedCount, removed: removedCount, changed: changedCount, skippedLocked };
};

export class BatchRefreshError extends Error {
  constructor(public code: 'NOT_FOUND', message: string) {
    super(message);
  }
}
