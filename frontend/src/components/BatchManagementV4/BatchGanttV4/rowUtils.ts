/**
 * 统一行计算工具
 * 确保 GanttSidebar 和 GanttTimeline 使用完全相同的行索引计算逻辑
 */
import { GanttBatch, LayoutMode } from './types';

export interface RowCalculationResult {
    /** 总行数 */
    totalRows: number;
    /** 行索引映射: 'batch-{id}' | 'stage-{id}' | 'op-{id}' -> rowIndex */
    rowMap: Map<string, number>;
}

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
    let rowIndex = 0;

    data.forEach(batch => {
        // Batch 行
        rowMap.set(`batch-${batch.id}`, rowIndex);
        rowIndex++;

        if (expandedBatches.has(batch.id)) {
            batch.stages.forEach(stage => {
                // Stage 行 - 使用批次作用域复合键
                const stageKey = `batch-${batch.id}-stage-${stage.id}`;
                rowMap.set(stageKey, rowIndex);
                rowIndex++;

                // Operations 行 (仅 Standard 模式且 Stage 展开时)
                if (layoutMode === 'standard' && expandedStages.has(stageKey)) {
                    stage.operations.forEach(op => {
                        rowMap.set(`op-${op.id}`, rowIndex);
                        rowIndex++;
                    });
                }
            });
        }
    });

    return { totalRows: rowIndex, rowMap };
};

/**
 * 辅助函数：根据行索引判断是否为交替行
 */
export const isAlternateRow = (rowIndex: number): boolean => {
    return rowIndex % 2 !== 0;
};
