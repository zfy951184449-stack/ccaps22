import pool from '../config/database';
import { RowDataPacket } from 'mysql2';

interface OperationRow extends RowDataPacket {
  schedule_id: number;
  stage_id: number;
  stage_order: number;
  stage_start_day: number;
  operation_day: number;
  recommended_time: number;
  window_start_time: number | null;
  window_end_time: number | null;
  standard_time: number | null;
  operation_order: number | null;
}

interface ConstraintRow extends RowDataPacket {
  id: number;
  schedule_id: number;
  predecessor_schedule_id: number;
  constraint_type: number;
  time_lag: number | null;
  constraint_level: number | null;
}

interface ShareRelationRow extends RowDataPacket {
  schedule_id: number;
  share_group_id: number;
  priority: number | null;
}

interface ScheduledOperation {
  scheduleId: number;
  originalOperationDay: number;
  originalRecommendedTime: number;
  newOperationDay: number;
  newRecommendedTime: number;
  startHour: number;
  finishHour: number;
}

interface SchedulingConflict {
  scheduleId: number;
  type: 'WINDOW' | 'CYCLE' | 'OVERLAP';
  message: string;
}

interface Edge {
  to: number;
  offset: number;
}

interface OperationInfo {
  scheduleId: number;
  stageId: number;
  stageOrder: number;
  stageStartHour: number;
  operationDay: number;
  recommendedTime: number;
  windowStart: number;
  windowEnd: number;
  duration: number;
}

const HOURS_PER_DAY = 24;

const roundToHalfHour = (value: number): number => {
  return Math.round(value * 2) / 2;
};

const computeEdgeOffset = (
  type: number,
  lag: number,
  predecessor: OperationInfo,
  successor: OperationInfo
): number => {
  const lagValue = lag || 0;

  switch (type) {
    case 2: // SS
      return lagValue;
    case 3: // FF
      return predecessor.duration - successor.duration + lagValue;
    case 4: // SF
      return -successor.duration + lagValue;
    case 1: // FS
    default:
      return predecessor.duration + lagValue;
  }
};

export interface SchedulingResult {
  scheduledOperations: ScheduledOperation[];
  conflicts: SchedulingConflict[];
  totalDays: number;
}

export const scheduleTemplateOperations = async (templateId: number): Promise<SchedulingResult> => {
  const connection = await pool.getConnection();

  const conflicts: SchedulingConflict[] = [];

  try {
    await connection.beginTransaction();

    const [operationRows] = await connection.execute<OperationRow[]>(
      `SELECT 
         sos.id AS schedule_id,
         sos.stage_id,
         ps.stage_order,
         ps.start_day AS stage_start_day,
         sos.operation_day,
         sos.recommended_time,
         sos.window_start_time,
         sos.window_end_time,
         sos.operation_order,
         COALESCE(op.standard_time, 1) AS standard_time
       FROM stage_operation_schedules sos
       JOIN process_stages ps ON sos.stage_id = ps.id
       JOIN operations op ON sos.operation_id = op.id
       WHERE ps.template_id = ?
       ORDER BY ps.stage_order, sos.operation_day, sos.operation_order`,
      [templateId]
    );

    if (!operationRows.length) {
      await connection.commit();
      return { scheduledOperations: [], conflicts: [], totalDays: 0 };
    }

    const operations = new Map<number, OperationInfo>();
    const adjacency = new Map<number, Edge[]>();
    const indegree = new Map<number, number>();
    const earliestStart = new Map<number, number>();
    const originalOperationDay = new Map<number, number>();
    const originalRecommendedTime = new Map<number, number>();

    for (const row of operationRows) {
      const stageStartHour = Number(row.stage_start_day) * HOURS_PER_DAY;
      const duration = Math.max(Number(row.standard_time) || 1, 0.5);
      const windowStart = row.window_start_time !== null ? Number(row.window_start_time) : Number(row.recommended_time);
      const windowEnd = row.window_end_time !== null ? Number(row.window_end_time) : windowStart + duration;

      const info: OperationInfo = {
        scheduleId: Number(row.schedule_id),
        stageId: Number(row.stage_id),
        stageOrder: Number(row.stage_order),
        stageStartHour,
        operationDay: Number(row.operation_day),
        recommendedTime: Number(row.recommended_time),
        windowStart,
        windowEnd,
        duration
      };

      operations.set(info.scheduleId, info);
      adjacency.set(info.scheduleId, []);
      indegree.set(info.scheduleId, 0);

      const baseDayHour = stageStartHour + info.operationDay * HOURS_PER_DAY;
      const absRecommended = baseDayHour + info.recommendedTime;
      const absWindowStart = baseDayHour + info.windowStart;

      originalOperationDay.set(info.scheduleId, info.operationDay);
      originalRecommendedTime.set(info.scheduleId, info.recommendedTime);

      earliestStart.set(info.scheduleId, Math.max(absWindowStart, absRecommended));
    }

    // 读取约束
    const [constraintRows] = await connection.execute<ConstraintRow[]>(
      `SELECT 
         oc.id,
         oc.schedule_id,
         oc.predecessor_schedule_id,
         oc.constraint_type,
         COALESCE(oc.time_lag, oc.lag_time, 0) AS time_lag,
         oc.constraint_level
       FROM operation_constraints oc
       JOIN stage_operation_schedules sos ON oc.schedule_id = sos.id
       JOIN process_stages ps ON sos.stage_id = ps.id
       WHERE ps.template_id = ?`,
      [templateId]
    );

    for (const constraint of constraintRows) {
      const successor = operations.get(Number(constraint.schedule_id));
      const predecessor = operations.get(Number(constraint.predecessor_schedule_id));

      if (!successor || !predecessor) {
        continue;
      }

      const offset = computeEdgeOffset(
        Number(constraint.constraint_type),
        Number(constraint.time_lag) || 0,
        predecessor,
        successor
      );

      adjacency.get(predecessor.scheduleId)!.push({
        to: successor.scheduleId,
        offset
      });
      indegree.set(successor.scheduleId, (indegree.get(successor.scheduleId) || 0) + 1);
    }

    // 共享组关系，按优先级创建串行约束
    const [shareRelations] = await connection.execute<ShareRelationRow[]>(
      `SELECT osgr.schedule_id, osgr.share_group_id, osgr.priority
       FROM operation_share_group_relations osgr
       JOIN stage_operation_schedules sos ON osgr.schedule_id = sos.id
       JOIN process_stages ps ON sos.stage_id = ps.id
       WHERE ps.template_id = ?
       ORDER BY osgr.share_group_id, COALESCE(osgr.priority, 999), sos.operation_day, sos.operation_order`,
      [templateId]
    );

    const groupBuckets = new Map<number, number[]>();
    for (const relation of shareRelations) {
      const groupId = Number(relation.share_group_id);
      if (!groupBuckets.has(groupId)) {
        groupBuckets.set(groupId, []);
      }
      groupBuckets.get(groupId)!.push(Number(relation.schedule_id));
    }

    for (const bucket of groupBuckets.values()) {
      if (bucket.length < 2) continue;
      for (let i = 0; i < bucket.length - 1; i++) {
        const current = operations.get(bucket[i]);
        const next = operations.get(bucket[i + 1]);
        if (!current || !next) continue;
        const offset = current.duration;
        adjacency.get(current.scheduleId)!.push({ to: next.scheduleId, offset });
        indegree.set(next.scheduleId, (indegree.get(next.scheduleId) || 0) + 1);
      }
    }

    // 拓扑排序
    const queue: number[] = [];
    indegree.forEach((value, key) => {
      if (value === 0) {
        queue.push(key);
      }
    });

    const processed: number[] = [];

    while (queue.length) {
      const currentId = queue.shift()!;
      processed.push(currentId);

      const currentStart = earliestStart.get(currentId)!;

      const edges = adjacency.get(currentId) || [];
      for (const edge of edges) {
        const candidate = currentStart + edge.offset;
        const existing = earliestStart.get(edge.to) ?? Number.NEGATIVE_INFINITY;
        if (candidate > existing) {
          earliestStart.set(edge.to, candidate);
        }
        const remaining = (indegree.get(edge.to) || 0) - 1;
        indegree.set(edge.to, remaining);
        if (remaining === 0) {
          queue.push(edge.to);
        }
      }
    }

    if (processed.length !== operations.size) {
      // 形成循环，记录冲突
      for (const [scheduleId] of operations) {
        if (!processed.includes(scheduleId)) {
          conflicts.push({
            scheduleId,
            type: 'CYCLE',
            message: '检测到循环约束，无法完成自动排程'
          });
        }
      }
      await connection.rollback();
      return { scheduledOperations: [], conflicts, totalDays: 0 };
    }

    const scheduledOperations: ScheduledOperation[] = [];
    const dayLatestFinish = new Map<string, number>();
    const dayEvents = new Map<string, { start: number; end: number; scheduleId: number }[]>();

    for (const [scheduleId, info] of operations) {
      const baseDayHour = info.stageStartHour + info.operationDay * HOURS_PER_DAY;
      const windowStartAbs = baseDayHour + info.windowStart;
      const windowEndAbs = baseDayHour + info.windowEnd;

      let startHour = earliestStart.get(scheduleId)!;
      startHour = Math.max(startHour, baseDayHour, windowStartAbs);

      const dayKey = `${info.stageId}-${info.operationDay}`;
      const latestFinishForDay = dayLatestFinish.get(dayKey);
      if (latestFinishForDay !== undefined && latestFinishForDay > startHour) {
        startHour = latestFinishForDay;
      }

      const dayList = dayEvents.get(dayKey) || [];
      for (const event of dayList) {
        if (startHour < event.end && startHour + info.duration > event.start) {
          conflicts.push({
            scheduleId,
            type: 'OVERLAP',
            message: '存在同日操作时间重叠，已自动串行错峰'
          });
          startHour = event.end;
        }
      }

      if (startHour + info.duration > windowEndAbs + 1e-4) {
        conflicts.push({
          scheduleId,
          type: 'WINDOW',
          message: '排程结果超出原始时间窗口'
        });
        // 尝试将开始时间压缩到窗口内
        const adjustedStart = windowEndAbs - info.duration;
        if (adjustedStart >= windowStartAbs) {
          startHour = Math.max(startHour, adjustedStart);
        } else {
          startHour = windowStartAbs;
        }
      }

      startHour = Math.min(startHour, windowEndAbs - info.duration);
      if (startHour < windowStartAbs) {
        startHour = windowStartAbs;
      }

      const finishHour = startHour + info.duration;

      if (finishHour > windowEndAbs + 1e-4) {
        conflicts.push({
          scheduleId,
          type: 'WINDOW',
          message: '排程结果超出原始时间窗口'
        });
      }

      let dayHour = startHour - baseDayHour;
      if (dayHour < 0) {
        dayHour = 0;
      }

      let newRecommendedTime = roundToHalfHour(dayHour);
      if (newRecommendedTime >= HOURS_PER_DAY) {
        newRecommendedTime = HOURS_PER_DAY - 0.5;
      }

      await connection.execute(
        `UPDATE stage_operation_schedules 
         SET operation_day = ?, recommended_time = ?
         WHERE id = ?`,
        [info.operationDay, newRecommendedTime, scheduleId]
      );

      scheduledOperations.push({
        scheduleId,
        originalOperationDay: originalOperationDay.get(scheduleId)!,
        originalRecommendedTime: originalRecommendedTime.get(scheduleId)!,
        newOperationDay: info.operationDay,
        newRecommendedTime,
        startHour,
        finishHour
      });

      dayLatestFinish.set(dayKey, finishHour);
      dayList.push({ start: startHour, end: finishHour, scheduleId });
      dayEvents.set(dayKey, dayList);
    }

    const [rangeRows] = await connection.execute<RowDataPacket[]>(
      `SELECT 
         MIN(ps.start_day + sos.operation_day) AS min_day,
         MAX(ps.start_day + sos.operation_day) AS max_day
       FROM process_stages ps
       JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
       WHERE ps.template_id = ?`,
      [templateId]
    );

    let totalDays = 1;
    if (rangeRows.length && rangeRows[0].min_day !== null && rangeRows[0].max_day !== null) {
      totalDays = Number(rangeRows[0].max_day) - Number(rangeRows[0].min_day) + 1;
    }

    await connection.execute(
      'UPDATE process_templates SET total_days = ? WHERE id = ?',
      [totalDays, templateId]
    );

    await connection.commit();

    return { scheduledOperations, conflicts, totalDays };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
