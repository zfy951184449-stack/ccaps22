/**
 * usePeakPersonnel - 计算每日人员峰值的 Hook
 * 
 * 基于当前操作数据实时计算每日并发人员需求峰值
 * 拖拽操作时会自动重新计算
 * 
 * 考虑人员共享：
 * - 有 share_personnel=true 约束的操作视为共享同一组人员
 * - 同组内并发操作取 max(required_people)
 * - 不同组间求和
 */

import { useMemo } from 'react';
import { GanttNode, TimeBlock, GanttConstraint } from '../types';

// 峰值计算结果
export interface DailyPeak {
    day: number;           // 相对于 startDay 的天数
    peak: number;          // 当日峰值人数
    peakHour: number;      // 峰值发生的小时 (0-23)
    color: string;         // 热力图颜色
}

// 根据相对位置获取热力图颜色
const getHeatColor = (peak: number, minPeak: number, maxPeak: number): string => {
    if (peak === 0) return 'transparent';
    if (maxPeak === minPeak) return 'rgba(52, 211, 153, 0.6)'; // 单一值用绿色

    const ratio = (peak - minPeak) / (maxPeak - minPeak);

    if (ratio < 0.25) return 'rgba(52, 211, 153, 0.6)';   // 绿 - 相对轻松
    if (ratio < 0.50) return 'rgba(251, 191, 36, 0.6)';   // 黄 - 相对正常
    if (ratio < 0.75) return 'rgba(251, 146, 60, 0.7)';   // 橙 - 相对较忙
    return 'rgba(239, 68, 68, 0.8)';                       // 红 - 相对高峰
};

// 并查集工具函数
const createUnionFind = () => {
    const parent = new Map<string, string>();

    const find = (x: string): string => {
        if (!parent.has(x)) parent.set(x, x);
        if (parent.get(x) !== x) {
            parent.set(x, find(parent.get(x)!));
        }
        return parent.get(x)!;
    };

    const union = (a: string, b: string) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) {
            parent.set(rootA, rootB);
        }
    };

    return { find, union };
};

interface UsePeakPersonnelProps {
    timeBlocks: TimeBlock[];
    ganttNodes: GanttNode[];
    startDay: number;
    endDay: number;
    constraints?: GanttConstraint[];
}

export const usePeakPersonnel = ({
    timeBlocks,
    ganttNodes,
    startDay,
    endDay,
    constraints = []
}: UsePeakPersonnelProps): Map<number, DailyPeak> => {
    return useMemo(() => {
        const dailyPeaks = new Map<number, DailyPeak>();

        // 构建 node_id -> required_people 映射
        const nodePersonnelMap = new Map<string, number>();
        const collectNodes = (nodes: GanttNode[]) => {
            for (const node of nodes) {
                if (node.type === 'operation' && node.required_people) {
                    nodePersonnelMap.set(node.id, node.required_people);
                }
                if (node.children) {
                    collectNodes(node.children);
                }
            }
        };
        collectNodes(ganttNodes);

        // 构建共享组：使用并查集将 share_personnel=true 的操作分组
        const uf = createUnionFind();
        for (const c of constraints) {
            if (c.share_personnel) {
                const nodeIdA = `operation_${c.from_schedule_id}`;
                const nodeIdB = `operation_${c.to_schedule_id}`;
                uf.union(nodeIdA, nodeIdB);
            }
        }

        // 过滤出操作条（非阶段、非时间窗口）
        const operationBlocks = timeBlocks.filter(
            block => !block.isStage && !block.isTimeWindow
        );

        if (operationBlocks.length === 0) {
            return dailyPeaks;
        }

        // 为每一天计算峰值
        for (let day = startDay; day <= endDay; day++) {
            const dayStartHour = day * 24;
            const dayEndHour = dayStartHour + 24;

            // 该天内每15分钟采样一次
            let maxPeople = 0;
            let peakHour = 0;

            for (let hour = dayStartHour; hour < dayEndHour; hour += 0.25) {
                // 收集该时刻并发的操作
                const concurrentOps: { nodeId: string; requiredPeople: number; groupRoot: string }[] = [];

                for (const block of operationBlocks) {
                    const blockStart = block.start_hour;
                    const blockEnd = block.start_hour + block.duration_hours;

                    // 检查该时刻是否在操作范围内
                    if (hour >= blockStart && hour < blockEnd) {
                        const requiredPeople = nodePersonnelMap.get(block.node_id) || 0;
                        const groupRoot = uf.find(block.node_id);
                        concurrentOps.push({ nodeId: block.node_id, requiredPeople, groupRoot });
                    }
                }

                // 按共享组计算人数：同组取 max，不同组求和
                const groupMaxMap = new Map<string, number>();
                for (const op of concurrentOps) {
                    const current = groupMaxMap.get(op.groupRoot) || 0;
                    groupMaxMap.set(op.groupRoot, Math.max(current, op.requiredPeople));
                }

                // 求和所有组的 max
                let concurrentPeople = 0;
                groupMaxMap.forEach(val => {
                    concurrentPeople += val;
                });

                if (concurrentPeople > maxPeople) {
                    maxPeople = concurrentPeople;
                    peakHour = hour - dayStartHour;
                }
            }

            dailyPeaks.set(day, {
                day,
                peak: maxPeople,
                peakHour: Math.floor(peakHour),
                color: '' // 颜色在后面统一计算
            });
        }

        // 计算动态颜色（基于所有峰值的相对位置）
        const allPeaks = Array.from(dailyPeaks.values()).map(d => d.peak);
        const nonZeroPeaks = allPeaks.filter(p => p > 0);

        if (nonZeroPeaks.length > 0) {
            const minPeak = Math.min(...nonZeroPeaks);
            const maxPeak = Math.max(...nonZeroPeaks);

            dailyPeaks.forEach((data, day) => {
                data.color = getHeatColor(data.peak, minPeak, maxPeak);
            });
        }

        return dailyPeaks;
    }, [timeBlocks, ganttNodes, startDay, endDay, constraints]);
};

export default usePeakPersonnel;
