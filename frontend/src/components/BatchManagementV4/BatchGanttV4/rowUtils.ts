/**
 * 统一行计算工具
 * 确保 GanttSidebar 和 GanttTimeline 使用完全相同的行索引计算逻辑
 */
import dayjs from 'dayjs';
import { GanttBatch, GanttOperation, GanttStage, LayoutMode } from './types';

export interface StageLaneLayout {
    stageKey: string;
    laneCount: number;
    laneAssignments: Map<number, number>;
    lanes: GanttOperation[][];
}

export interface RowCalculationResult {
    /** 总行数 */
    totalRows: number;
    /** 扁平化后的可渲染行 */
    rows: GanttRenderRow[];
    /** 行索引映射: 'batch-{id}' | 'stage-{id}' | 'op-{id}' -> rowIndex */
    rowMap: Map<string, number>;
    /** Dense 模式的 lane 行映射: 'batch-{id}-stage-{id}-lane-{laneIndex}' -> rowIndex */
    laneRowMap: Map<string, number>;
    /** 阶段内操作压缩分层结果 */
    stageLayouts: Map<string, StageLaneLayout>;
}

export type GanttRenderRow =
    | {
        kind: 'batch';
        key: string;
        rowIndex: number;
        batch: GanttBatch;
        batchIndex: number;
    }
    | {
        kind: 'stage';
        key: string;
        rowIndex: number;
        batch: GanttBatch;
        batchIndex: number;
        stage: GanttStage;
        stageKey: string;
    }
    | {
        kind: 'lane';
        key: string;
        rowIndex: number;
        batch: GanttBatch;
        batchIndex: number;
        stage: GanttStage;
        stageKey: string;
        laneIndex: number;
        operations: GanttOperation[];
    }
    | {
        kind: 'operation';
        key: string;
        rowIndex: number;
        batch: GanttBatch;
        batchIndex: number;
        stage: GanttStage;
        stageKey: string;
        operation: GanttOperation;
    };

export const getVisibleOperations = (operations: GanttOperation[]): GanttOperation[] => {
    return operations.filter(op => !op.isOffScreen);
};

export const buildStageLaneLayout = (stage: GanttStage, stageKey: string): StageLaneLayout => {
    const visibleOperations = getVisibleOperations(stage.operations).sort((left, right) => {
        const startDiff = dayjs(left.startDate).valueOf() - dayjs(right.startDate).valueOf();
        if (startDiff !== 0) {
            return startDiff;
        }

        const endDiff = dayjs(left.endDate).valueOf() - dayjs(right.endDate).valueOf();
        if (endDiff !== 0) {
            return endDiff;
        }

        return left.id - right.id;
    });

    const lanes: GanttOperation[][] = [];
    const laneAssignments = new Map<number, number>();
    const laneEndTimes: dayjs.Dayjs[] = [];

    visibleOperations.forEach(operation => {
        const operationStart = dayjs(operation.startDate);
        const laneIndex = laneEndTimes.findIndex(laneEnd => !operationStart.isBefore(laneEnd));
        const nextLaneIndex = laneIndex === -1 ? laneEndTimes.length : laneIndex;

        if (!lanes[nextLaneIndex]) {
            lanes[nextLaneIndex] = [];
        }

        lanes[nextLaneIndex].push(operation);
        laneAssignments.set(operation.id, nextLaneIndex);
        laneEndTimes[nextLaneIndex] = dayjs(operation.endDate);
    });

    return {
        stageKey,
        laneCount: lanes.length,
        laneAssignments,
        lanes,
    };
};

/**
 * 计算甘特图行布局
 * 
 * @param data - 批次数据
 * @param expandedBatches - 展开的批次 ID 集合
 * @param expandedStages - 展开的阶段 ID 集合
 * @param layoutMode - 布局模式 (standard | compact)
 * @returns 行计算结果，包含总行数和每个元素的行索引
 */
export const calculateRowLayout = (
    data: GanttBatch[],
    expandedBatches: Set<number>,
    expandedStages: Set<string>,
    layoutMode: LayoutMode
): RowCalculationResult => {
    const rowMap = new Map<string, number>();
    const laneRowMap = new Map<string, number>();
    const stageLayouts = new Map<string, StageLaneLayout>();
    const rows: GanttRenderRow[] = [];
    let rowIndex = 0;

    data.forEach((batch, batchIndex) => {
        // Batch 行
        const batchKey = `batch-${batch.id}`;
        rowMap.set(batchKey, rowIndex);
        rows.push({
            kind: 'batch',
            key: batchKey,
            rowIndex,
            batch,
            batchIndex,
        });
        rowIndex++;

        if (expandedBatches.has(batch.id)) {
            batch.stages.forEach(stage => {
                // Stage 行 - 使用批次作用域复合键
                const stageKey = `batch-${batch.id}-stage-${stage.id}`;
                const stageLayout = buildStageLaneLayout(stage, stageKey);

                stageLayouts.set(stageKey, stageLayout);
                rowMap.set(stageKey, rowIndex);
                rows.push({
                    kind: 'stage',
                    key: stageKey,
                    rowIndex,
                    batch,
                    batchIndex,
                    stage,
                    stageKey,
                });
                rowIndex++;

                if (!expandedStages.has(stageKey)) {
                    return;
                }

                if (layoutMode === 'dense') {
                    for (let laneIndex = 0; laneIndex < stageLayout.laneCount; laneIndex += 1) {
                        const laneKey = `${stageKey}-lane-${laneIndex}`;
                        laneRowMap.set(laneKey, rowIndex);
                        rows.push({
                            kind: 'lane',
                            key: laneKey,
                            rowIndex,
                            batch,
                            batchIndex,
                            stage,
                            stageKey,
                            laneIndex,
                            operations: stageLayout.lanes[laneIndex] || [],
                        });
                        rowIndex++;
                    }
                    return;
                }

                // Operations 行 (仅 Standard 模式且 Stage 展开时)
                if (layoutMode === 'standard') {
                    getVisibleOperations(stage.operations).forEach(op => {
                        const opKey = `op-${op.id}`;
                        rowMap.set(opKey, rowIndex);
                        rows.push({
                            kind: 'operation',
                            key: opKey,
                            rowIndex,
                            batch,
                            batchIndex,
                            stage,
                            stageKey,
                            operation: op,
                        });
                        rowIndex++;
                    });
                }
            });
        }
    });

    return { totalRows: rowIndex, rows, rowMap, laneRowMap, stageLayouts };
};

/**
 * 辅助函数：根据行索引判断是否为交替行
 */
export const isAlternateRow = (rowIndex: number): boolean => {
    return rowIndex % 2 !== 0;
};
