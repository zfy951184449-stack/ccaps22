/**
 * Batch Validation Service
 * 
 * 批次约束校验服务
 * 检测循环依赖、时间窗口冲突等问题
 */

import pool from '../config/database';
import { RowDataPacket } from 'mysql2';

interface BatchOperationInfo {
    operationPlanId: number;
    operationName: string;
    operationCode: string;
    plannedStart: Date;
    plannedEnd: Date;
    windowStart: Date | null;
    windowEnd: Date | null;
    durationHours: number;
}

interface BatchConstraintEdge {
    id: number;
    fromOperationPlanId: number;
    toOperationPlanId: number;
    type: number; // 1=FS, 2=SS, 3=FF, 4=SF
    lag: number;
}

type Severity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface BatchConstraintConflict {
    id: string;
    type: 'STRUCTURAL' | 'TIME';
    subType: string;
    severity: Severity;
    message: string;
    suggestion?: string;
    operationPlanIds?: number[];
    constraintIds?: number[];
    details?: Record<string, unknown>;
}

export interface BatchValidationResult {
    hasConflicts: boolean;
    summary: {
        total: number;
        critical: number;
        warning: number;
        info: number;
    };
    conflicts: BatchConstraintConflict[];
}

const toNumber = (value: any, fallback = 0): number => {
    if (value === null || value === undefined) return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
};

const formatDatetime = (date: Date): string => {
    return date.toISOString().replace('T', ' ').substring(0, 16);
};

/**
 * 校验批次约束
 */
export const runBatchValidation = async (batchPlanId: number): Promise<BatchValidationResult> => {
    // 加载批次操作
    const [operationRows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
            bop.id AS operation_plan_id,
            COALESCE(o.operation_name, bop.operation_name) AS operation_name,
            COALESCE(o.operation_code, bop.operation_code) AS operation_code,
            bop.planned_start_datetime,
            bop.planned_end_datetime,
            bop.window_start_datetime,
            bop.window_end_datetime,
            bop.planned_duration
         FROM batch_operation_plans bop
         LEFT JOIN operations o ON bop.operation_id = o.id
         WHERE bop.batch_plan_id = ?`,
        [batchPlanId]
    );

    const operations = new Map<number, BatchOperationInfo>();
    operationRows.forEach(row => {
        const plannedStart = new Date(row.planned_start_datetime);
        const plannedEnd = new Date(row.planned_end_datetime);
        const durationHours = toNumber(row.planned_duration,
            (plannedEnd.getTime() - plannedStart.getTime()) / (1000 * 60 * 60));

        operations.set(row.operation_plan_id, {
            operationPlanId: row.operation_plan_id,
            operationName: row.operation_name || '未知操作',
            operationCode: row.operation_code || `OP${row.operation_plan_id}`,
            plannedStart,
            plannedEnd,
            windowStart: row.window_start_datetime ? new Date(row.window_start_datetime) : null,
            windowEnd: row.window_end_datetime ? new Date(row.window_end_datetime) : null,
            durationHours,
        });
    });

    // 加载批次约束
    const [constraintRows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
            id,
            batch_operation_plan_id,
            predecessor_batch_operation_plan_id,
            constraint_type,
            time_lag
         FROM batch_operation_constraints
         WHERE batch_plan_id = ?`,
        [batchPlanId]
    );

    const constraints: BatchConstraintEdge[] = constraintRows.map(row => ({
        id: row.id,
        fromOperationPlanId: row.batch_operation_plan_id,
        toOperationPlanId: row.predecessor_batch_operation_plan_id,
        type: toNumber(row.constraint_type, 1),
        lag: toNumber(row.time_lag, 0),
    }));

    const conflicts: BatchConstraintConflict[] = [];

    if (operations.size === 0) {
        return {
            hasConflicts: false,
            summary: { total: 0, critical: 0, warning: 0, info: 0 },
            conflicts,
        };
    }

    // 构建有向图
    const adjacency = new Map<number, BatchConstraintEdge[]>();
    const indegree = new Map<number, number>();

    operations.forEach((_, opId) => {
        indegree.set(opId, 0);
        adjacency.set(opId, []);
    });

    constraints.forEach(edge => {
        if (!operations.has(edge.fromOperationPlanId) || !operations.has(edge.toOperationPlanId)) {
            return;
        }
        adjacency.get(edge.fromOperationPlanId)!.push(edge);
        indegree.set(edge.toOperationPlanId, (indegree.get(edge.toOperationPlanId) || 0) + 1);
    });

    // 拓扑排序检测循环
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

        (adjacency.get(current) || []).forEach(edge => {
            const to = edge.toOperationPlanId;
            if (!indegree.has(to)) return;
            indegree.set(to, (indegree.get(to)! - 1));
            if (indegree.get(to)! === 0) {
                queue.push(to);
            }
        });
    }

    // 检测循环
    if (topoOrder.length < operations.size) {
        const remainingNodes: number[] = [];
        operations.forEach((_, key) => {
            if (!processed.has(key)) {
                remainingNodes.push(key);
            }
        });

        const operationNames = remainingNodes
            .map(opId => operations.get(opId)?.operationName || `操作${opId}`)
            .join('、');

        const involvedConstraintIds = constraints
            .filter(edge => remainingNodes.includes(edge.fromOperationPlanId) && remainingNodes.includes(edge.toOperationPlanId))
            .map(edge => edge.id);

        conflicts.push({
            id: 'STRUCTURAL-CYCLE',
            type: 'STRUCTURAL',
            subType: 'CYCLE',
            severity: 'CRITICAL',
            message: `发现循环依赖，涉及操作：${operationNames}`,
            suggestion: '请调整或删除其中至少一条约束以消除闭环。',
            operationPlanIds: remainingNodes,
            constraintIds: involvedConstraintIds,
        });
    }

    // 检测时间窗口冲突
    operations.forEach((op, opId) => {
        // 检查计划时间是否在时间窗口内
        if (op.windowStart && op.plannedStart < op.windowStart) {
            conflicts.push({
                id: `TIME-BEFORE_WINDOW-${opId}`,
                type: 'TIME',
                subType: 'BEFORE_WINDOW',
                severity: 'WARNING',
                message: `${op.operationName} 的计划开始时间 (${formatDatetime(op.plannedStart)}) 早于时间窗口最早开始时间 (${formatDatetime(op.windowStart)})`,
                suggestion: '请调整计划开始时间或时间窗口。',
                operationPlanIds: [opId],
                details: {
                    plannedStart: formatDatetime(op.plannedStart),
                    windowStart: formatDatetime(op.windowStart),
                },
            });
        }

        if (op.windowEnd && op.plannedEnd > op.windowEnd) {
            conflicts.push({
                id: `TIME-AFTER_WINDOW-${opId}`,
                type: 'TIME',
                subType: 'AFTER_WINDOW',
                severity: 'CRITICAL',
                message: `${op.operationName} 的计划结束时间 (${formatDatetime(op.plannedEnd)}) 晚于时间窗口最晚完成时间 (${formatDatetime(op.windowEnd)})`,
                suggestion: '请调整计划时间或时间窗口。',
                operationPlanIds: [opId],
                details: {
                    plannedEnd: formatDatetime(op.plannedEnd),
                    windowEnd: formatDatetime(op.windowEnd),
                },
            });
        }
    });

    // 检测约束冲突
    constraints.forEach(edge => {
        const fromOp = operations.get(edge.fromOperationPlanId);
        const toOp = operations.get(edge.toOperationPlanId);
        if (!fromOp || !toOp) return;

        // FS: from结束后to才能开始
        if (edge.type === 1) { // FS
            const expectedToStart = new Date(fromOp.plannedEnd.getTime() + edge.lag * 60 * 60 * 1000);
            if (toOp.plannedStart < expectedToStart) {
                conflicts.push({
                    id: `TIME-CONSTRAINT_VIOLATION-${edge.id}`,
                    type: 'TIME',
                    subType: 'CONSTRAINT_VIOLATION',
                    severity: 'WARNING',
                    message: `${toOp.operationName} 应在 ${fromOp.operationName} 结束后 ${edge.lag}h 开始，但当前计划违反此约束`,
                    suggestion: '请调整操作时间以满足约束要求。',
                    operationPlanIds: [edge.fromOperationPlanId, edge.toOperationPlanId],
                    constraintIds: [edge.id],
                    details: {
                        expectedStart: formatDatetime(expectedToStart),
                        actualStart: formatDatetime(toOp.plannedStart),
                    },
                });
            }
        }
    });

    // 统计
    const summary = {
        total: conflicts.length,
        critical: conflicts.filter(c => c.severity === 'CRITICAL').length,
        warning: conflicts.filter(c => c.severity === 'WARNING').length,
        info: conflicts.filter(c => c.severity === 'INFO').length,
    };

    return {
        hasConflicts: conflicts.length > 0,
        summary,
        conflicts,
    };
};
