import pool from '../config/database';
import { RowDataPacket } from 'mysql2';

interface OperationRow extends RowDataPacket {
  schedule_id: number;
  stage_id: number;
  stage_order: number;
  stage_start_day: number;
  operation_day: number;
  recommended_time: number;
  recommended_day_offset: number | null;
  window_start_time: number | null;
  window_start_day_offset: number | null;
  window_end_time: number | null;
  window_end_day_offset: number | null;
  standard_time: number | null;
  operation_order: number | null;
  operation_id: number;
  operation_name: string;
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
  operationId: number;
  operationName?: string;
  stageId: number;
  severity: 'CRITICAL' | 'WARNING';
  operationScheduleIds?: number[];
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
  operationId: number;
  operationName?: string;
  operationDay: number;
  recommendedTime: number;
  recommendedDayOffset: number;
  windowStart: number;
  windowStartDayOffset: number;
  windowEnd: number;
  windowEndDayOffset: number;
  duration: number;
}

const HOURS_PER_DAY = 24;
const SHIFT_TOLERANCE = 1e-4;
const MAX_SHIFT_ITERATIONS = 256;

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
  const conflictKeys = new Set<string>();
  const ssConstraintPairs = new Set<string>();
  const parallelPartners = new Map<number, Set<number>>();

  const recordConflict = (conflict: SchedulingConflict) => {
    const key = `${conflict.type}-${conflict.scheduleId}`;
    if (conflictKeys.has(key)) {
      return;
    }
    conflictKeys.add(key);
    conflicts.push(conflict);
  };

  const registerParallelPair = (a: number, b: number) => {
    if (!parallelPartners.has(a)) {
      parallelPartners.set(a, new Set<number>());
    }
    if (!parallelPartners.has(b)) {
      parallelPartners.set(b, new Set<number>());
    }
    parallelPartners.get(a)!.add(b);
    parallelPartners.get(b)!.add(a);
  };

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
        sos.recommended_day_offset,
        sos.window_start_time,
        sos.window_start_day_offset,
        sos.window_end_time,
        sos.window_end_day_offset,
        sos.operation_order,
        sos.operation_id,
        op.operation_name,
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
      const recommendedOffset = Number(row.recommended_day_offset ?? 0);
      const windowStartOffset = Number(row.window_start_day_offset ?? 0);
      const windowEndOffset = Number(row.window_end_day_offset ?? 0);

      const info: OperationInfo = {
        scheduleId: Number(row.schedule_id),
        stageId: Number(row.stage_id),
        stageOrder: Number(row.stage_order),
        stageStartHour,
        operationId: Number(row.operation_id),
        operationName: row.operation_name ? String(row.operation_name) : undefined,
        operationDay: Number(row.operation_day),
        recommendedTime: Number(row.recommended_time),
        recommendedDayOffset: recommendedOffset,
        windowStart,
        windowStartDayOffset: windowStartOffset,
        windowEnd,
        windowEndDayOffset: windowEndOffset,
        duration,
      };

      operations.set(info.scheduleId, info);
      adjacency.set(info.scheduleId, []);
      indegree.set(info.scheduleId, 0);

      const baseDayHour = stageStartHour + info.operationDay * HOURS_PER_DAY;
      const absRecommended =
        baseDayHour + info.recommendedDayOffset * HOURS_PER_DAY + info.recommendedTime;
      const absWindowStart =
        baseDayHour + info.windowStartDayOffset * HOURS_PER_DAY + info.windowStart;

      originalOperationDay.set(info.scheduleId, info.operationDay);
      originalRecommendedTime.set(info.scheduleId, info.recommendedTime);

      earliestStart.set(info.scheduleId, Math.max(absWindowStart, absRecommended));
    }

    // 读取约束
    const [lagColumnRows] = await connection.query<RowDataPacket[]>(
      'SHOW COLUMNS FROM operation_constraints LIKE \'lag_time\'',
    );
    const lagColumnExists = lagColumnRows.length > 0;

    const timeLagSelect = lagColumnExists
      ? 'COALESCE(oc.lag_time, oc.time_lag, 0)'
      : 'COALESCE(oc.time_lag, 0)';

    const [constraintRows] = await connection.execute<ConstraintRow[]>(
      `SELECT 
         oc.id,
         oc.schedule_id,
         oc.predecessor_schedule_id,
         oc.constraint_type,
         ${timeLagSelect} AS time_lag,
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

      if (Number(constraint.constraint_type) === 2) {
        const forwardKey = `${predecessor.scheduleId}->${successor.scheduleId}`;
        const backwardKey = `${successor.scheduleId}->${predecessor.scheduleId}`;
        ssConstraintPairs.add(forwardKey);
        ssConstraintPairs.add(backwardKey);
        registerParallelPair(predecessor.scheduleId, successor.scheduleId);
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
    let shareGroupsAvailable = false;
    try {
      const [shareTableRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
           FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name = 'operation_share_group_relations'`
      );
      shareGroupsAvailable = Boolean(
        Array.isArray(shareTableRows) && shareTableRows.length && Number(shareTableRows[0].total || 0) > 0,
      );
    } catch (error) {
      shareGroupsAvailable = false;
    }

    if (shareGroupsAvailable) {
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

          const forwardKey = `${current.scheduleId}->${next.scheduleId}`;
          const backwardKey = `${next.scheduleId}->${current.scheduleId}`;
          const hasSsConstraint = ssConstraintPairs.has(forwardKey) || ssConstraintPairs.has(backwardKey);

          if (hasSsConstraint) {
            continue;
          }

          const offset = current.duration;
          adjacency.get(current.scheduleId)!.push({ to: next.scheduleId, offset });
          indegree.set(next.scheduleId, (indegree.get(next.scheduleId) || 0) + 1);
        }
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
          const operation = operations.get(scheduleId);
          recordConflict({
            scheduleId,
            type: 'CYCLE',
            message: '检测到循环约束，无法完成自动排程',
            operationId: operation?.operationId ?? scheduleId,
            operationName: operation?.operationName,
            stageId: operation?.stageId ?? 0,
            severity: 'CRITICAL',
            operationScheduleIds: [scheduleId]
          });
        }
      }
      await connection.rollback();
      return { scheduledOperations: [], conflicts, totalDays: 0 };
    }

    const scheduledOperations: ScheduledOperation[] = [];
    const dayEvents = new Map<string, { start: number; end: number; scheduleId: number }[]>();

    for (const [scheduleId, info] of operations) {
      const baseDayHour = info.stageStartHour + info.operationDay * HOURS_PER_DAY;
      const windowStartAbs =
        baseDayHour + info.windowStartDayOffset * HOURS_PER_DAY + info.windowStart;
      const rawWindowEndAbs =
        baseDayHour + info.windowEndDayOffset * HOURS_PER_DAY + info.windowEnd;
      const windowEndAbs =
        rawWindowEndAbs > windowStartAbs ? rawWindowEndAbs : windowStartAbs + info.duration;

      let startHour = Math.max(earliestStart.get(scheduleId) ?? windowStartAbs, windowStartAbs);
      startHour = Math.min(startHour, windowEndAbs - info.duration);

      const parallelSet = parallelPartners.get(scheduleId);
      const isParallelCapable = Boolean(parallelSet && parallelSet.size > 0);

      const ensureWithinWindow = () => {
        if (!Number.isFinite(startHour)) {
          startHour = windowStartAbs;
        }
        if (startHour < windowStartAbs) {
          startHour = windowStartAbs;
        }
        if (startHour + info.duration > windowEndAbs + SHIFT_TOLERANCE) {
          recordConflict({
            scheduleId,
            type: 'WINDOW',
            message: '排程结果超出原始时间窗口',
            operationId: info.operationId,
            operationName: info.operationName,
            stageId: info.stageId,
            severity: 'CRITICAL',
            operationScheduleIds: [scheduleId],
          });
          startHour = Math.max(windowStartAbs, windowEndAbs - info.duration);
        }
      };

      const findOverlapShift = (currentStart: number): number | null => {
        const startDayIndex = Math.floor(currentStart / HOURS_PER_DAY);
        const endDayIndex = Math.floor((currentStart + info.duration - 1e-6) / HOURS_PER_DAY);

        for (let dayIdx = startDayIndex; dayIdx <= endDayIndex; dayIdx += 1) {
          const dayKey = `${info.stageId}-${dayIdx}`;
          const dayList = dayEvents.get(dayKey) || [];
          for (const event of dayList) {
            const partnerSet = parallelPartners.get(event.scheduleId);
            const allowParallelWithEvent =
              (parallelSet && parallelSet.has(event.scheduleId)) ||
              (partnerSet && partnerSet.has(scheduleId));

            if (!allowParallelWithEvent && currentStart < event.end && currentStart + info.duration > event.start) {
              recordConflict({
                scheduleId,
                type: 'OVERLAP',
                message: '存在同日操作时间重叠，已自动串行错峰',
                operationId: info.operationId,
                operationName: info.operationName,
                stageId: info.stageId,
                severity: 'WARNING',
                operationScheduleIds: [scheduleId],
              });
              return event.end;
            }
          }
        }
        return null;
      };

      ensureWithinWindow();

      const clampStartHour = (candidate: number) => {
        const upperBound = windowEndAbs - info.duration;
        if (!Number.isFinite(candidate)) {
          return windowStartAbs;
        }
        if (upperBound <= windowStartAbs) {
          return windowStartAbs;
        }
        return Math.min(Math.max(candidate, windowStartAbs), upperBound);
      };

      let shiftIterations = 0;
      ensureWithinWindow();

      while (shiftIterations < MAX_SHIFT_ITERATIONS) {
        const nextStart = findOverlapShift(startHour);
        if (nextStart === null) {
          break;
        }

        const candidate = clampStartHour(nextStart);

        if (!Number.isFinite(candidate)) {
          recordConflict({
            scheduleId,
            type: 'OVERLAP',
            message: '无法计算有效的错峰时间，请检查窗口配置。',
            operationId: info.operationId,
            operationName: info.operationName,
            stageId: info.stageId,
            severity: 'CRITICAL',
            operationScheduleIds: [scheduleId],
          });
          startHour = windowStartAbs;
          break;
        }

        if (candidate <= startHour + SHIFT_TOLERANCE) {
          recordConflict({
            scheduleId,
            type: 'OVERLAP',
            message: '存在同日操作时间重叠且时间窗口不足，自动错峰终止，请手动调整。',
            operationId: info.operationId,
            operationName: info.operationName,
            stageId: info.stageId,
            severity: 'CRITICAL',
            operationScheduleIds: [scheduleId],
          });
          startHour = candidate;
          break;
        }

        const previousStart = startHour;
        startHour = candidate;
        ensureWithinWindow();

        if (!Number.isFinite(startHour) || Math.abs(startHour - previousStart) <= SHIFT_TOLERANCE) {
          recordConflict({
            scheduleId,
            type: 'OVERLAP',
            message: '时间窗口限制导致自动错峰停滞，请调整窗口或相关约束。',
            operationId: info.operationId,
            operationName: info.operationName,
            stageId: info.stageId,
            severity: 'CRITICAL',
            operationScheduleIds: [scheduleId],
          });
          startHour = clampStartHour(previousStart);
          break;
        }

        if (startHour + info.duration > windowEndAbs + SHIFT_TOLERANCE) {
          startHour = clampStartHour(windowEndAbs - info.duration);
          break;
        }

        shiftIterations += 1;
      }

      if (shiftIterations >= MAX_SHIFT_ITERATIONS) {
        recordConflict({
          scheduleId,
          type: 'OVERLAP',
          message: '自动错峰尝试次数过多，可能存在无法满足的窗口或约束，请手动处理。',
          operationId: info.operationId,
          operationName: info.operationName,
          stageId: info.stageId,
          severity: 'CRITICAL',
          operationScheduleIds: [scheduleId],
        });
        startHour = clampStartHour(startHour);
      }

      ensureWithinWindow();
      const finishHour = startHour + info.duration;

      if (finishHour > windowEndAbs + 1e-4) {
        recordConflict({
          scheduleId,
          type: 'WINDOW',
          message: '排程结果超出原始时间窗口',
          operationId: info.operationId,
          operationName: info.operationName,
          stageId: info.stageId,
          severity: 'CRITICAL',
          operationScheduleIds: [scheduleId],
        });
      }

      const relativeStart = startHour - baseDayHour;
      let recommendedOffset = Math.floor(relativeStart / HOURS_PER_DAY);
      let recommendedTimeWithinDay = roundToHalfHour(
        relativeStart - recommendedOffset * HOURS_PER_DAY,
      );
      if (recommendedTimeWithinDay < 0) {
        recommendedTimeWithinDay += HOURS_PER_DAY;
        recommendedOffset -= 1;
      }
      if (recommendedTimeWithinDay >= HOURS_PER_DAY) {
        recommendedTimeWithinDay -= HOURS_PER_DAY;
        recommendedOffset += 1;
      }

      await connection.execute(
        `UPDATE stage_operation_schedules
           SET operation_day = ?,
               recommended_time = ?,
               recommended_day_offset = ?
         WHERE id = ?`,
        [info.operationDay, recommendedTimeWithinDay, recommendedOffset, scheduleId],
      );

      scheduledOperations.push({
        scheduleId,
        originalOperationDay: originalOperationDay.get(scheduleId)!,
        originalRecommendedTime: originalRecommendedTime.get(scheduleId)!,
        newOperationDay: info.operationDay,
        newRecommendedTime: recommendedTimeWithinDay,
        startHour,
        finishHour,
      });

      const startDayIndex = Math.floor(startHour / HOURS_PER_DAY);
      const endDayIndex = Math.floor((finishHour - 1e-6) / HOURS_PER_DAY);
      for (let dayIdx = startDayIndex; dayIdx <= endDayIndex; dayIdx += 1) {
        const dayKey = `${info.stageId}-${dayIdx}`;
        const dayList = dayEvents.get(dayKey) || [];
        dayList.push({ start: startHour, end: finishHour, scheduleId });
        dayEvents.set(dayKey, dayList);
      }
    }

    const [rangeRows] = await connection.execute<RowDataPacket[]>(
      `SELECT 
         MIN(ps.start_day + sos.operation_day + IFNULL(sos.window_start_day_offset, 0)) AS min_day,
         MAX(ps.start_day + sos.operation_day + IFNULL(sos.window_end_day_offset, 0)) AS max_day
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
