import pool from '../config/database';
import { RowDataPacket } from 'mysql2';

interface OperationScheduleInfo {
  scheduleId: number;
  operationId: number;
  operationName: string;
  stageStartDay: number;
  operationDay: number;
  recommendedTime: number;
  recommendedDayOffset: number;
  windowStartTime?: number | null;
  windowStartDayOffset?: number | null;
  windowEndTime?: number | null;
  windowEndDayOffset?: number | null;
  durationHours: number;
}

interface ConstraintEdge {
  id: number;
  fromScheduleId: number;
  toScheduleId: number;
  type: number;
  lag: number;
  level?: number | null;
  sharePersonnel?: boolean | null;
  name?: string | null;
}

type Severity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface ConstraintConflict {
  id: string;
  type: 'STRUCTURAL' | 'TIME';
  subType: string;
  severity: Severity;
  message: string;
  suggestion?: string;
  operationScheduleIds?: number[];
  constraintIds?: number[];
  details?: Record<string, unknown>;
}

export interface ConstraintValidationResult {
  hasConflicts: boolean;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  conflicts: ConstraintConflict[];
}

const HOURS_PER_DAY = 24;
const DEFAULT_RECOMMENDED_TIME = 9;
const DEFAULT_DURATION = 4;
const EPSILON = 1e-4;

const formatAbsoluteHour = (hourValue: number): string => {
  const day = Math.floor(hourValue / HOURS_PER_DAY);
  const hour = Math.floor(hourValue % HOURS_PER_DAY);
  const minutes = Math.round((hourValue - Math.floor(hourValue)) * 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `Day${day} ${pad(hour)}:${pad(minutes)}`;
};

const toNumber = (value: any, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const buildOperationMap = (rows: RowDataPacket[]): Map<number, OperationScheduleInfo> => {
  const map = new Map<number, OperationScheduleInfo>();

  rows.forEach((row) => {
    const scheduleId = Number(row.schedule_id);
    const duration = toNumber(row.standard_time, DEFAULT_DURATION);
    map.set(scheduleId, {
      scheduleId,
      operationId: Number(row.operation_id),
      operationName: row.operation_name,
      stageStartDay: Number(row.stage_start_day),
      operationDay: Number(row.operation_day),
      recommendedTime: toNumber(row.recommended_time, DEFAULT_RECOMMENDED_TIME),
      recommendedDayOffset: toNumber(row.recommended_day_offset, 0),
      windowStartTime: row.window_start_time !== null ? Number(row.window_start_time) : null,
      windowStartDayOffset: row.window_start_day_offset !== null ? Number(row.window_start_day_offset) : 0,
      windowEndTime: row.window_end_time !== null ? Number(row.window_end_time) : null,
      windowEndDayOffset: row.window_end_day_offset !== null ? Number(row.window_end_day_offset) : 0,
      durationHours: duration > 0 ? duration : DEFAULT_DURATION,
    });
  });

  return map;
};

const buildConstraintEdges = (rows: RowDataPacket[]): ConstraintEdge[] => {
  return rows.map((row) => ({
    id: Number(row.id),
    fromScheduleId: Number(row.schedule_id),
    toScheduleId: Number(row.predecessor_schedule_id),
    type: Number(row.constraint_type) || 1,
    lag: toNumber(row.time_lag, 0),
    level: row.constraint_level !== undefined ? Number(row.constraint_level) : undefined,
    // sharePersonnel: row.share_personnel === null ? undefined : Boolean(row.share_personnel), (Removed)
    name: row.constraint_name || undefined,
  }));
};

const hoursForOperationStart = (
  op: OperationScheduleInfo,
  hourOffset?: number | null,
  dayOffset?: number | null,
) => {
  const baseDayHour = (op.stageStartDay + op.operationDay) * HOURS_PER_DAY;
  const resolvedDayOffset = dayOffset !== undefined && dayOffset !== null ? Number(dayOffset) : op.recommendedDayOffset;
  const resolvedHourOffset = hourOffset !== undefined && hourOffset !== null ? Number(hourOffset) : op.recommendedTime;
  return baseDayHour + resolvedDayOffset * HOURS_PER_DAY + resolvedHourOffset;
};

const hoursForWindowStart = (op: OperationScheduleInfo) => {
  const hourValue = op.windowStartTime ?? op.recommendedTime;
  const dayValue = op.windowStartDayOffset ?? op.recommendedDayOffset;
  return hoursForOperationStart(op, hourValue, dayValue);
};

const hoursForWindowEnd = (op: OperationScheduleInfo) => {
  if (op.windowEndTime === undefined || op.windowEndTime === null) return Number.POSITIVE_INFINITY;
  const dayValue = op.windowEndDayOffset ?? op.recommendedDayOffset;
  return hoursForOperationStart(op, op.windowEndTime, dayValue);
};

const ensureSet = <T>(map: Map<number, Set<T>>, key: number) => {
  if (!map.has(key)) {
    map.set(key, new Set<T>());
  }
  return map.get(key)!;
};

const severityCounter = (conflicts: ConstraintConflict[]) => {
  const counts = { total: conflicts.length, critical: 0, warning: 0, info: 0 };
  conflicts.forEach((conflict) => {
    if (conflict.severity === 'CRITICAL') counts.critical += 1;
    if (conflict.severity === 'WARNING') counts.warning += 1;
    if (conflict.severity === 'INFO') counts.info += 1;
  });
  return counts;
};

export const runConstraintValidation = async (templateId: number): Promise<ConstraintValidationResult> => {
  const [operationRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       sos.id AS schedule_id,
       sos.operation_id,
       sos.operation_day,
       sos.recommended_time,
       sos.recommended_day_offset,
       sos.window_start_time,
       sos.window_start_day_offset,
       sos.window_end_time,
       sos.window_end_day_offset,
       ps.start_day AS stage_start_day,
       op.operation_name,
       op.standard_time
     FROM stage_operation_schedules sos
     JOIN process_stages ps ON sos.stage_id = ps.id
     JOIN operations op ON sos.operation_id = op.id
     WHERE ps.template_id = ?`,
    [templateId]
  );

  const operations = buildOperationMap(operationRows);

  const [constraintRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       oc.id,
       oc.schedule_id,
       oc.predecessor_schedule_id,
       oc.constraint_type,
       oc.time_lag,
       oc.constraint_level,
       // oc.share_personnel, (Removed)
       oc.constraint_name
     FROM operation_constraints oc
     JOIN stage_operation_schedules sos ON oc.schedule_id = sos.id
     JOIN process_stages ps ON sos.stage_id = ps.id
     WHERE ps.template_id = ?`,
    [templateId]
  );

  const constraints = buildConstraintEdges(constraintRows);

  const conflicts: ConstraintConflict[] = [];

  if (operations.size === 0) {
    return {
      hasConflicts: false,
      summary: { total: 0, critical: 0, warning: 0, info: 0 },
      conflicts,
    };
  }

  const adjacency = new Map<number, ConstraintEdge[]>();
  const reverseAdjacency = new Map<number, ConstraintEdge[]>();
  const indegree = new Map<number, number>();

  operations.forEach((_, scheduleId) => {
    indegree.set(scheduleId, 0);
    adjacency.set(scheduleId, []);
    reverseAdjacency.set(scheduleId, []);
  });

  constraints.forEach((edge) => {
    if (!operations.has(edge.fromScheduleId) || !operations.has(edge.toScheduleId)) {
      return;
    }
    adjacency.get(edge.fromScheduleId)!.push(edge);
    reverseAdjacency.get(edge.toScheduleId)!.push(edge);
    indegree.set(edge.toScheduleId, (indegree.get(edge.toScheduleId) || 0) + 1);
  });

  const queue: number[] = [];
  indegree.forEach((value, key) => {
    if (value === 0) queue.push(key);
  });

  const topoOrder: number[] = [];
  const processed = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    topoOrder.push(current);
    processed.add(current);

    (adjacency.get(current) || []).forEach((edge) => {
      const to = edge.toScheduleId;
      if (!indegree.has(to)) return;
      indegree.set(to, (indegree.get(to)! - 1));
      if (indegree.get(to)! === 0) {
        queue.push(to);
      }
    });
  }

  if (topoOrder.length < operations.size) {
    const remainingNodes: number[] = [];
    operations.forEach((_, key) => {
      if (!processed.has(key)) {
        remainingNodes.push(key);
      }
    });

    const operationNames = remainingNodes
      .map((scheduleId) => operations.get(scheduleId)?.operationName || `操作${scheduleId}`)
      .join('、');

    const involvedConstraintIds = constraints
      .filter((edge) => remainingNodes.includes(edge.fromScheduleId) && remainingNodes.includes(edge.toScheduleId))
      .map((edge) => edge.id);

    conflicts.push({
      id: 'STRUCTURAL-CYCLE',
      type: 'STRUCTURAL',
      subType: 'CYCLE',
      severity: 'CRITICAL',
      message: `约束关系形成闭环，涉及操作：${operationNames}`,
      suggestion: '请调整或删除其中至少一条约束以消除闭环。',
      operationScheduleIds: remainingNodes,
      constraintIds: involvedConstraintIds,
    });
  }

  if (topoOrder.length === 0) {
    return {
      hasConflicts: conflicts.length > 0,
      summary: severityCounter(conflicts),
      conflicts,
    };
  }

  const est = new Map<number, number>();
  const lst = new Map<number, number>();
  const estSources = new Map<number, Set<number>>();
  const lstSources = new Map<number, Set<number>>();

  operations.forEach((op, scheduleId) => {
    const windowStart = hoursForWindowStart(op);
    const baseStart = hoursForOperationStart(op, op.recommendedTime);
    const initialEst = Math.max(windowStart, baseStart);
    est.set(scheduleId, initialEst);

    const windowEnd = hoursForWindowEnd(op);
    lst.set(scheduleId, windowEnd);
  });

  topoOrder.forEach((scheduleId) => {
    const currentNodeInfo = operations.get(scheduleId);
    if (!currentNodeInfo) return;

    const currentEst = est.get(scheduleId)!;

    (adjacency.get(scheduleId) || []).forEach((edge) => {
      const successorInfo = operations.get(edge.toScheduleId);
      if (!successorInfo) return;

      const anchor = (() => {
        switch (edge.type) {
          case 2:
            return { from: 'start' as const, to: 'start' as const };
          case 3:
            return { from: 'end' as const, to: 'end' as const };
          case 4:
            return { from: 'start' as const, to: 'end' as const };
          case 1:
          default:
            return { from: 'end' as const, to: 'start' as const };
        }
      })();

      const successorBaseStart = hoursForOperationStart(successorInfo, successorInfo.recommendedTime);
      const successorWindowStart = hoursForWindowStart(successorInfo);

      const fromDuration = currentNodeInfo.durationHours;
      const toDuration = successorInfo.durationHours;
      const lag = edge.lag;

      let constraintDrivenEst = successorWindowStart;

      if (anchor.from === 'end' && anchor.to === 'start') {
        constraintDrivenEst = Math.max(constraintDrivenEst, currentEst + fromDuration + lag);
        constraintDrivenEst = Math.max(constraintDrivenEst, successorBaseStart + Math.max(0, lag));
      } else if (anchor.from === 'start' && anchor.to === 'start') {
        constraintDrivenEst = Math.max(constraintDrivenEst, currentEst + lag);
        constraintDrivenEst = Math.max(constraintDrivenEst, successorBaseStart + Math.max(0, lag));
      } else if (anchor.from === 'end' && anchor.to === 'end') {
        const candidate = currentEst + fromDuration + lag - toDuration;
        constraintDrivenEst = Math.max(constraintDrivenEst, candidate);
        constraintDrivenEst = Math.max(constraintDrivenEst, successorBaseStart + Math.max(0, lag) - toDuration);
      } else if (anchor.from === 'start' && anchor.to === 'end') {
        const candidate = currentEst + lag - toDuration;
        constraintDrivenEst = Math.max(constraintDrivenEst, candidate);
        constraintDrivenEst = Math.max(constraintDrivenEst, successorBaseStart + Math.max(0, lag) - toDuration);
      }

      const successorCurrentEst = est.get(edge.toScheduleId)!;
      if (constraintDrivenEst > successorCurrentEst + EPSILON) {
        est.set(edge.toScheduleId, constraintDrivenEst);
        const source = ensureSet(estSources, edge.toScheduleId);
        source.clear();
        source.add(edge.id);
      } else if (constraintDrivenEst > successorCurrentEst - EPSILON) {
        const source = ensureSet(estSources, edge.toScheduleId);
        source.add(edge.id);
      }
    });
  });

  for (let i = topoOrder.length - 1; i >= 0; i -= 1) {
    const scheduleId = topoOrder[i];
    const currentInfo = operations.get(scheduleId);
    if (!currentInfo) continue;

    const currentLst = lst.get(scheduleId)!;

    (adjacency.get(scheduleId) || []).forEach((edge) => {
      const successorId = edge.toScheduleId;
      const successorInfo = operations.get(successorId);
      if (!successorInfo) return;

      const successorLst = lst.get(successorId) ?? Number.POSITIVE_INFINITY;
      const successorEst = est.get(successorId) ?? hoursForWindowStart(successorInfo);
      const fromDuration = currentInfo.durationHours;
      const toDuration = successorInfo.durationHours;
      const lag = edge.lag;

      if (!Number.isFinite(successorLst)) {
        return;
      }

      let candidate = currentLst;

      switch (edge.type) {
        case 1: { // FS
          candidate = successorLst - fromDuration - lag;
          break;
        }
        case 2: { // SS
          candidate = successorLst - lag;
          break;
        }
        case 3: { // FF
          candidate = successorLst + toDuration - fromDuration - lag;
          break;
        }
        case 4: { // SF
          candidate = successorLst + toDuration - lag;
          break;
        }
        default:
          candidate = successorLst - fromDuration - lag;
      }

      if (!Number.isFinite(candidate)) {
        return;
      }

      const existing = lst.get(scheduleId) ?? Number.POSITIVE_INFINITY;
      if (candidate < existing - EPSILON) {
        lst.set(scheduleId, candidate);
        const source = ensureSet(lstSources, scheduleId);
        source.clear();
        source.add(edge.id);
      } else if (candidate <= existing + EPSILON) {
        const source = ensureSet(lstSources, scheduleId);
        source.add(edge.id);
      }
    });
  }

  operations.forEach((operation, scheduleId) => {
    const operationName = operation.operationName || `操作${scheduleId}`;
    const windowEndHour = hoursForWindowEnd(operation);
    const windowStartHour = hoursForWindowStart(operation);
    const currentEst = est.get(scheduleId)!;
    const currentLst = lst.get(scheduleId)!;

    if (windowEndHour !== Number.POSITIVE_INFINITY && currentEst > windowEndHour + EPSILON) {
      const constraintIds = Array.from(estSources.get(scheduleId) ?? new Set<number>());
      conflicts.push({
        id: `TIME-WINDOW_OVERFLOW-${scheduleId}`,
        type: 'TIME',
        subType: 'WINDOW_OVERFLOW',
        severity: 'CRITICAL',
        message: `${operationName} 的最早可开始时间 ${formatAbsoluteHour(currentEst)} 超出了时间窗口上限 ${formatAbsoluteHour(windowEndHour)}`,
        suggestion: '请调整时间窗口或相关约束的滞后时间。',
        operationScheduleIds: [scheduleId],
        constraintIds,
        details: {
          earliestStart: formatAbsoluteHour(currentEst),
          windowEnd: formatAbsoluteHour(windowEndHour),
        },
      });
    }

    if (Number.isFinite(currentLst) && currentEst > currentLst + EPSILON) {
      const constraintIds = Array.from(lstSources.get(scheduleId) ?? new Set<number>());
      const estConstraintIds = Array.from(estSources.get(scheduleId) ?? new Set<number>());
      const mergedIds = new Set<number>([...constraintIds, ...estConstraintIds]);
      conflicts.push({
        id: `TIME-INFEASIBLE-${scheduleId}`,
        type: 'TIME',
        subType: 'INFEASIBLE_INTERVAL',
        severity: 'CRITICAL',
        message: `${operationName} 的可行时间区间为空（最早开始 ${formatAbsoluteHour(currentEst)}，最晚开始 ${formatAbsoluteHour(currentLst)}）`,
        suggestion: '请检查相关约束的滞后值或重新编排操作顺序。',
        operationScheduleIds: [scheduleId],
        constraintIds: Array.from(mergedIds),
        details: {
          earliestStart: formatAbsoluteHour(currentEst),
          latestStart: formatAbsoluteHour(currentLst),
          windowStart: formatAbsoluteHour(windowStartHour),
          windowEnd: windowEndHour === Number.POSITIVE_INFINITY ? '无上限' : formatAbsoluteHour(windowEndHour),
        },
      });
    }
  });

  return {
    hasConflicts: conflicts.length > 0,
    summary: severityCounter(conflicts),
    conflicts,
  };
};
