/**
 * 约束传播服务
 * 
 * 根据约束类型(FS/SS/FF/SF)和lag_type自动计算下游操作的时间窗口。
 */

import pool from '../config/database';
import { RowDataPacket } from 'mysql2';
import dayjs from 'dayjs';

// lag_type 枚举
export type LagType = 'ASAP' | 'FIXED' | 'WINDOW' | 'NEXT_DAY' | 'NEXT_SHIFT' | 'COOLING' | 'BATCH_END';

// 约束类型
export type ConstraintType = 'FS' | 'SS' | 'FF' | 'SF';

interface OperationTime {
    scheduleId: number;
    plannedStart: Date;
    plannedEnd: Date;
    duration: number; // 小时
}

interface Constraint {
    id: number;
    fromScheduleId: number;
    toScheduleId: number;
    constraintType: ConstraintType;
    lagType: LagType;
    lagMin: number;
    lagMax: number | null;
    timeLag: number;
}

interface PropagationResult {
    scheduleId: number;
    newStart: Date;
    newEnd: Date;
    changed: boolean;
    reason?: string;
}

/**
 * 约束传播服务类
 */
export class ConstraintPropagationService {

    /**
     * 计算下游操作的新时间
     * 
     * @param constraint 约束关系
     * @param predecessorTime 前驱操作时间
     * @param successorDuration 后继操作时长(小时)
     * @returns 计算后的开始和结束时间
     */
    static calculateSuccessorTime(
        constraint: Constraint,
        predecessorTime: OperationTime,
        successorDuration: number
    ): { start: Date; end: Date } {
        const { constraintType, lagType, lagMin, lagMax, timeLag } = constraint;

        // 根据约束类型确定参考点
        let referenceTime: Date;
        let isStartReference: boolean;

        switch (constraintType) {
            case 'FS': // Finish-to-Start: 前驱结束 -> 后继开始
                referenceTime = predecessorTime.plannedEnd;
                isStartReference = true;
                break;
            case 'SS': // Start-to-Start: 前驱开始 -> 后继开始
                referenceTime = predecessorTime.plannedStart;
                isStartReference = true;
                break;
            case 'FF': // Finish-to-Finish: 前驱结束 -> 后继结束
                referenceTime = predecessorTime.plannedEnd;
                isStartReference = false;
                break;
            case 'SF': // Start-to-Finish: 前驱开始 -> 后继结束
                referenceTime = predecessorTime.plannedStart;
                isStartReference = false;
                break;
            default:
                referenceTime = predecessorTime.plannedEnd;
                isStartReference = true;
        }

        // 根据 lag_type 计算实际延迟时间（小时）
        let actualLagHours: number;

        switch (lagType) {
            case 'ASAP':
                // 尽早开始，无延迟
                actualLagHours = 0;
                break;

            case 'FIXED':
                // 固定延迟
                actualLagHours = lagMin || timeLag || 0;
                break;

            case 'WINDOW':
                // 时间窗口内，使用最小值
                actualLagHours = lagMin || 0;
                break;

            case 'NEXT_DAY':
                // 次日开始，计算到次日00:00的时间
                const nextDay = dayjs(referenceTime).add(1, 'day').startOf('day');
                actualLagHours = nextDay.diff(dayjs(referenceTime), 'hour', true);
                break;

            case 'NEXT_SHIFT':
                // 下一班次，简化处理：假设8小时后
                actualLagHours = 8;
                break;

            case 'COOLING':
                // 冷却/培养时间，使用 lag_min
                actualLagHours = lagMin || 0;
                break;

            case 'BATCH_END':
                // 批次结束后，需要查询批次结束时间
                // 简化处理：使用 lag_min
                actualLagHours = lagMin || 0;
                break;

            default:
                actualLagHours = timeLag || 0;
        }

        // 计算后继操作时间
        let successorStart: Date;
        let successorEnd: Date;

        if (isStartReference) {
            // 约束目标是开始时间
            successorStart = dayjs(referenceTime).add(actualLagHours, 'hour').toDate();
            successorEnd = dayjs(successorStart).add(successorDuration, 'hour').toDate();
        } else {
            // 约束目标是结束时间
            successorEnd = dayjs(referenceTime).add(actualLagHours, 'hour').toDate();
            successorStart = dayjs(successorEnd).subtract(successorDuration, 'hour').toDate();
        }

        return { start: successorStart, end: successorEnd };
    }

    /**
     * 传播操作时间变更
     * 
     * 当一个操作的时间发生变更时，自动计算并更新所有下游操作的时间。
     * 
     * @param templateId 模板ID
     * @param changedScheduleId 发生变更的操作ID
     * @param newStart 新的开始时间
     * @param newEnd 新的结束时间
     */
    static async propagateTimeChange(
        templateId: number,
        changedScheduleId: number,
        newStart: Date,
        newEnd: Date
    ): Promise<PropagationResult[]> {
        const results: PropagationResult[] = [];

        // 获取所有以该操作为前驱的约束
        const [constraints] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        oc.id,
        oc.schedule_id AS from_schedule_id,
        oc.predecessor_schedule_id AS to_schedule_id,
        oc.constraint_type,
        oc.lag_type,
        oc.lag_min,
        oc.lag_max,
        oc.time_lag,
        sos.planned_duration AS successor_duration
      FROM operation_constraints oc
      JOIN stage_operation_schedules sos ON oc.schedule_id = sos.id
      WHERE oc.predecessor_schedule_id = ?
    `, [changedScheduleId]);

        const predecessorTime: OperationTime = {
            scheduleId: changedScheduleId,
            plannedStart: newStart,
            plannedEnd: newEnd,
            duration: dayjs(newEnd).diff(dayjs(newStart), 'hour', true)
        };

        // 遍历所有下游约束
        for (const row of constraints) {
            const constraint: Constraint = {
                id: row.id,
                fromScheduleId: row.from_schedule_id,
                toScheduleId: row.to_schedule_id,
                constraintType: this.mapConstraintType(row.constraint_type),
                lagType: row.lag_type || 'FIXED',
                lagMin: Number(row.lag_min) || 0,
                lagMax: row.lag_max !== null ? Number(row.lag_max) : null,
                timeLag: Number(row.time_lag) || 0
            };

            const successorDuration = Number(row.successor_duration) || 1;
            const { start, end } = this.calculateSuccessorTime(constraint, predecessorTime, successorDuration);

            results.push({
                scheduleId: row.from_schedule_id,
                newStart: start,
                newEnd: end,
                changed: true,
                reason: `Propagated from schedule ${changedScheduleId} via ${constraint.constraintType} constraint`
            });
        }

        return results;
    }

    /**
     * 映射数字约束类型到字符串
     */
    private static mapConstraintType(type: number): ConstraintType {
        switch (type) {
            case 1: return 'FS';
            case 2: return 'SS';
            case 3: return 'FF';
            case 4: return 'SF';
            default: return 'FS';
        }
    }

    /**
     * 检测约束冲突
     * 
     * 检查给定的时间变更是否会导致约束冲突
     */
    static async detectConflicts(
        scheduleId: number,
        proposedStart: Date,
        proposedEnd: Date
    ): Promise<{ hasConflict: boolean; conflicts: string[] }> {
        const conflicts: string[] = [];

        // 检查作为后继操作的约束
        const [predecessorConstraints] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        oc.*,
        sos.planned_start_time,
        sos.planned_end_time,
        sos.operation_name
      FROM operation_constraints oc
      JOIN stage_operation_schedules sos ON oc.predecessor_schedule_id = sos.id
      WHERE oc.schedule_id = ?
    `, [scheduleId]);

        for (const row of predecessorConstraints) {
            const predecessorEnd = new Date(row.planned_end_time);
            const constraintType = this.mapConstraintType(row.constraint_type);
            const lagMin = Number(row.lag_min) || 0;

            // 检查 FS 约束：后继开始必须 >= 前驱结束 + lag
            if (constraintType === 'FS') {
                const requiredStart = dayjs(predecessorEnd).add(lagMin, 'hour').toDate();
                if (proposedStart < requiredStart) {
                    conflicts.push(`FS约束冲突: 开始时间早于 ${row.operation_name} 结束后 ${lagMin}h`);
                }
            }
        }

        return {
            hasConflict: conflicts.length > 0,
            conflicts
        };
    }
}

export default ConstraintPropagationService;
