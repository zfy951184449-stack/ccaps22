/**
 * 约束传播 Hook
 * 
 * 在操作时间变更时自动计算下游操作的新时间
 */

import { useCallback, useState } from 'react';
import axios from 'axios';
import { message } from 'antd';

interface PropagationResult {
    scheduleId: number;
    newStart: string;
    newEnd: string;
    changed: boolean;
    reason?: string;
}

interface ConflictInfo {
    hasConflict: boolean;
    conflicts: string[];
}

interface UseConstraintPropagationOptions {
    templateId: number;
    onPropagationComplete?: (results: PropagationResult[]) => void;
    onConflictDetected?: (conflicts: string[]) => void;
}

export function useConstraintPropagation(options: UseConstraintPropagationOptions) {
    const { templateId, onPropagationComplete, onConflictDetected } = options;
    const [propagating, setPropagating] = useState(false);
    const [conflicts, setConflicts] = useState<string[]>([]);

    /**
     * 触发时间变更传播
     * 
     * 当操作拖拽完成后调用此函数，自动计算并更新下游操作时间
     */
    const propagateTimeChange = useCallback(async (
        scheduleId: number,
        newStartTime: Date | string,
        newEndTime: Date | string,
        autoApply: boolean = false
    ): Promise<PropagationResult[]> => {
        setPropagating(true);
        setConflicts([]);

        try {
            // 1. 首先检测冲突
            const conflictResult = await axios.post('/api/constraints/detect-conflicts', {
                schedule_id: scheduleId,
                proposed_start: typeof newStartTime === 'string' ? newStartTime : newStartTime.toISOString(),
                proposed_end: typeof newEndTime === 'string' ? newEndTime : newEndTime.toISOString()
            }).then(res => res.data).catch(() => ({ hasConflict: false, conflicts: [] }));

            if (conflictResult.hasConflict) {
                setConflicts(conflictResult.conflicts);
                onConflictDetected?.(conflictResult.conflicts);

                if (!autoApply) {
                    // 如果不是自动应用，显示冲突警告
                    message.warning(
                        `检测到约束冲突: ${conflictResult.conflicts.slice(0, 2).join('; ')}`,
                        4
                    );
                    return [];
                }
            }

            // 2. 计算传播结果
            const propagationResults = await axios.post('/api/constraints/propagate', {
                template_id: templateId,
                schedule_id: scheduleId,
                new_start: typeof newStartTime === 'string' ? newStartTime : newStartTime.toISOString(),
                new_end: typeof newEndTime === 'string' ? newEndTime : newEndTime.toISOString()
            }).then(res => res.data).catch(() => []);

            if (propagationResults.length > 0) {
                onPropagationComplete?.(propagationResults);

                if (autoApply) {
                    // 自动应用传播结果
                    await applyPropagationResults(propagationResults);
                    message.success(`已更新 ${propagationResults.length} 个下游操作的时间`);
                }
            }

            return propagationResults;
        } catch (error) {
            console.error('Propagation error:', error);
            message.error('时间传播失败');
            return [];
        } finally {
            setPropagating(false);
        }
    }, [templateId, onPropagationComplete, onConflictDetected]);

    /**
     * 应用传播结果到数据库
     */
    const applyPropagationResults = async (results: PropagationResult[]) => {
        const updates = results.filter(r => r.changed).map(r => ({
            schedule_id: r.scheduleId,
            planned_start_time: r.newStart,
            planned_end_time: r.newEnd
        }));

        if (updates.length === 0) return;

        await axios.put('/api/stage-operations/batch-update-times', { updates });
    };

    /**
     * 预览传播影响（不实际应用）
     */
    const previewPropagation = useCallback(async (
        scheduleId: number,
        newStartTime: Date | string,
        newEndTime: Date | string
    ): Promise<PropagationResult[]> => {
        return propagateTimeChange(scheduleId, newStartTime, newEndTime, false);
    }, [propagateTimeChange]);

    /**
     * 清除冲突状态
     */
    const clearConflicts = useCallback(() => {
        setConflicts([]);
    }, []);

    return {
        propagating,
        conflicts,
        propagateTimeChange,
        previewPropagation,
        clearConflicts,
        hasConflicts: conflicts.length > 0
    };
}

export default useConstraintPropagation;
