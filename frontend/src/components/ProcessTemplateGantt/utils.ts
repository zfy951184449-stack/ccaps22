import { GanttNode, FlattenedRow, TimeBlock, StageOperation, ProcessStage, ProcessTemplate, Operation } from './types';
import { STAGE_COLORS } from './constants';

export const toRgba = (hex: string, alpha: number) => {
    const color = hex.replace('#', '');
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const normalizeSearchInput = (text: string) =>
    text
        .toLowerCase()
        .replace(/[\u3000\s]+/g, ' ')
        .trim();

export const normalizeForFuzzyMatch = (text: string) =>
    normalizeSearchInput(text).replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');

export const isSubsequence = (pattern: string, target: string) => {
    if (!pattern) {
        return true;
    }
    let patternIndex = 0;
    for (let i = 0; i < target.length && patternIndex < pattern.length; i += 1) {
        if (target[i] === pattern[patternIndex]) {
            patternIndex += 1;
        }
    }
    return patternIndex === pattern.length;
};

export const fuzzyMatch = (query: string, target: string) => {
    if (!query) {
        return true;
    }
    if (!target) {
        return false;
    }

    const normalizedTarget = normalizeSearchInput(target);
    const compressedTarget = normalizeForFuzzyMatch(target);
    const tokens = normalizeSearchInput(query).split(' ').filter(Boolean);

    if (!tokens.length) {
        return true;
    }

    return tokens.every((token) => {
        const compressedToken = normalizeForFuzzyMatch(token);
        if (!compressedToken) {
            return true;
        }
        if (normalizedTarget.includes(token)) {
            return true;
        }
        return isSubsequence(compressedToken, compressedTarget);
    });
};

/**
 * 收集所有可展开的节点 ID（非操作节点）
 * 用于单日模式下自动展开 sidebar 到操作层级
 */
export const collectAllExpandableKeys = (nodes: GanttNode[]): string[] => {
    const keys: string[] = [];
    const traverse = (nodeList: GanttNode[]) => {
        nodeList.forEach(node => {
            // 模板和阶段节点都可展开，操作节点不可展开（无子节点）
            if (node.type !== 'operation') {
                keys.push(node.id);
            }
            if (node.children) {
                traverse(node.children);
            }
        });
    };
    traverse(nodes);
    return keys;
};

export const flattenGanttNodes = (nodes: GanttNode[], expandedKeys: string[], depth = 0, parentId?: string): FlattenedRow[] => {
    const expandedSet = new Set(expandedKeys);
    const result: FlattenedRow[] = [];

    nodes.forEach((node) => {
        const hasChildren = Array.isArray(node.children) && node.children.length > 0;
        const isExpanded = expandedSet.has(node.id);

        result.push({
            id: node.id,
            node,
            depth,
            hasChildren,
            isExpanded,
            parentId
        });

        if (hasChildren && isExpanded) {
            result.push(...flattenGanttNodes(node.children!, expandedKeys, depth + 1, node.id));
        }
    });

    return result;
};

export const getOperationColor = (stageCode: string, alpha: number = 1): string => {
    const baseColor = STAGE_COLORS[stageCode] || STAGE_COLORS.DEFAULT;

    // 转换为RGBA格式
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const generateTimeBlocks = (nodes: GanttNode[], stages: ProcessStage[]): TimeBlock[] => {
    const blocks: TimeBlock[] = [];
    const processedNodeIds = new Set<string>();

    const processNode = (node: GanttNode) => {
        if (processedNodeIds.has(node.id)) {
            return;
        }
        processedNodeIds.add(node.id);

        if (node.type === 'stage') {
            const stageCode = node.stage_code || 'DEFAULT';

            let stageStartHour = (node.start_day || 0) * 24;
            let stageEndHour = stageStartHour + 24;

            if (node.children && node.children.length > 0) {
                let earliestDay = Infinity;
                let maxEndHour = -Infinity;

                node.children.forEach(child => {
                    const operationData = child.data as StageOperation;

                    const stageDayBase = node.start_day || 0;
                    const opDay = child.start_day ?? stageDayBase;
                    const recommendedTime = typeof operationData?.recommended_time === 'string'
                        ? parseFloat(operationData.recommended_time)
                        : (operationData?.recommended_time ?? 9);

                    const opStartHour = opDay * 24 + recommendedTime;

                    let duration = typeof child.standard_time === 'string'
                        ? parseFloat(child.standard_time)
                        : child.standard_time;

                    if (!duration || isNaN(duration) || duration <= 0) {
                        duration = 4;
                    }

                    const opEndHour = opStartHour + duration;

                    earliestDay = Math.min(earliestDay, opDay);
                    maxEndHour = Math.max(maxEndHour, opEndHour);
                });

                if (earliestDay !== Infinity) {
                    stageStartHour = earliestDay * 24;
                    stageEndHour = Math.max(stageStartHour + 24, Math.ceil(maxEndHour / 24) * 24);
                }
            }

            const durationHours = stageEndHour - stageStartHour;

            if (isNaN(stageStartHour) || isNaN(durationHours) || durationHours <= 0) {
                console.error('Invalid stage block data:', {
                    nodeId: node.id,
                    stageStartHour,
                    stageEndHour,
                    durationHours
                });
                return;
            }

            const stageBlock: TimeBlock = {
                id: `stage_block_${node.id}`,
                node_id: node.id,
                title: `${stageCode} - ${node.title}`,
                start_hour: stageStartHour,
                duration_hours: durationHours,
                color: getOperationColor(stageCode, 0.2),
                isStage: true
            };
            blocks.push(stageBlock);
        }

        if (node.type === 'operation') {
            if (!node.standard_time || node.standard_time <= 0) {
                console.warn('Operation has invalid standard_time, using default:', node);
                node.standard_time = 4; // 使用默认4小时
            }
            // 获取阶段信息来确定颜色
            let stageCode = 'DEFAULT';
            if (node.parent_id?.includes('stage_')) {
                const stageId = node.parent_id.replace('stage_', '');
                const stage = stages.find(s => s.id.toString() === stageId);
                stageCode = stage?.stage_code || 'DEFAULT';
            }

            const operationData = node.data as StageOperation;

            // 解析推荐时间（确保是数字格式）
            const recommendedTime = typeof operationData?.recommended_time === 'string'
                ? parseFloat(operationData.recommended_time)
                : (operationData?.recommended_time || 9); // 默认9:00

            // 计算操作的绝对开始时间（小时）
            const nodeStartDay = node.start_day || 0;
            let operationAbsoluteStartHour = nodeStartDay * 24 + recommendedTime;

            // 数据验证 - 使用默认值而不是跳过
            if (isNaN(operationAbsoluteStartHour)) {
                console.warn('Invalid operationAbsoluteStartHour, using default:', node);
                operationAbsoluteStartHour = nodeStartDay * 24 + 9; // 默认9:00
            }

            // 处理 standard_time 可能是字符串的情况
            let actualStandardTime = typeof node.standard_time === 'string'
                ? parseFloat(node.standard_time)
                : node.standard_time;

            if (!actualStandardTime || isNaN(actualStandardTime) || actualStandardTime <= 0) {
                console.warn('Invalid standard_time, using default:', node);
                actualStandardTime = 4; // 默认4小时
            }

            // 时间窗口块 - 显示在操作块下方
            // 解析时间窗口参数
            const windowStartTime = typeof operationData?.window_start_time === 'string'
                ? parseFloat(operationData.window_start_time)
                : (operationData?.window_start_time ?? 7); // 默认7:00
            const windowEndTime = typeof operationData?.window_end_time === 'string'
                ? parseFloat(operationData.window_end_time)
                : (operationData?.window_end_time ?? 18); // 默认18:00

            // 获取窗口日偏移量（相对于 operation_day）
            const windowStartDayOffset = typeof operationData?.window_start_day_offset === 'number'
                ? operationData.window_start_day_offset : 0;
            const windowEndDayOffset = typeof operationData?.window_end_day_offset === 'number'
                ? operationData.window_end_day_offset : 0;

            // 计算窗口的绝对小时（基于操作所在天 + 偏移量）
            const windowStartHour = (node.start_day || 0) * 24 + windowStartDayOffset * 24 + windowStartTime;
            const windowEndHour = (node.start_day || 0) * 24 + windowEndDayOffset * 24 + windowEndTime;


            if (!isNaN(windowStartHour) && !isNaN(windowEndHour) && windowEndHour > windowStartHour) {
                const windowBlock: TimeBlock = {
                    id: `window_${node.id}`,
                    node_id: node.id,
                    title: `${node.title} - 时间窗口`,
                    start_hour: windowStartHour,
                    duration_hours: windowEndHour - windowStartHour,
                    color: getOperationColor(stageCode, 0.15), // 更透明
                    isTimeWindow: true
                };
                blocks.push(windowBlock);
            }

            // 操作时间块 - 显示在时间窗口上方
            const operationBlock: TimeBlock = {
                id: `block_${node.id}`,
                node_id: node.id,
                title: `${node.title} (Day${node.start_day} ${recommendedTime}:00-${recommendedTime + actualStandardTime}:00)`,
                start_hour: operationAbsoluteStartHour,
                duration_hours: actualStandardTime,
                color: getOperationColor(stageCode),
                isRecommended: true
            };
            blocks.push(operationBlock);
        }

        if (node.children) {
            node.children.forEach(processNode);
        }
    };

    nodes.forEach(processNode);
    return blocks;
};

export const calculateTimeRange = (timeBlocks: TimeBlock[]) => {
    if (timeBlocks.length === 0) {
        return { startDay: -2, endDay: 10 }; // 默认范围
    }

    let minDay = Infinity;
    let maxDay = -Infinity;
    let hasValidBlocks = false;

    // 只计算操作时间块（排除阶段块和时间窗口）
    timeBlocks.forEach(block => {
        if (block.isStage || block.isTimeWindow) {
            return; // 跳过阶段块和时间窗口
        }

        // 验证时间块数据的有效性
        if (isNaN(block.start_hour) || isNaN(block.duration_hours)) {
            console.error('Invalid time block data in calculateTimeRange:', block);
            return;
        }

        const blockStartDay = Math.floor(block.start_hour / 24);
        // 计算操作结束所在的天数（操作可能跨天）
        const blockEndDay = Math.floor((block.start_hour + block.duration_hours) / 24);

        if (!isNaN(blockStartDay) && !isNaN(blockEndDay)) {
            minDay = Math.min(minDay, blockStartDay);
            maxDay = Math.max(maxDay, blockEndDay);
            hasValidBlocks = true;
        }
    });

    // 如果没有有效的操作块，使用默认范围
    if (!hasValidBlocks) {
        return { startDay: -2, endDay: 10 };
    }

    // 在实际范围基础上添加缓冲区
    const startDay = minDay - 1; // 在最早操作前留1天
    const endDay = maxDay + 2;   // 在最晚操作后留2天

    // 最终验证结果
    if (isNaN(startDay) || isNaN(endDay)) {
        console.error('Invalid time range calculated:', { startDay, endDay, minDay, maxDay });
        return { startDay: -2, endDay: 10 }; // 返回默认值
    }

    return { startDay, endDay };
};

export const buildGanttNodes = (template: ProcessTemplate, stages: ProcessStage[], stageOpsMap: { [key: number]: StageOperation[] }): GanttNode[] => {
    const nodes: GanttNode[] = [];

    // 根节点
    const templateNode: GanttNode = {
        id: template.id.toString(),
        title: template.template_name,
        type: 'template',
        expanded: true,
        children: [],
        level: 0
    };

    // 阶段节点
    const sortedStages = stages
        .slice()
        .sort((a, b) => {
            if (a.start_day !== b.start_day) {
                return a.start_day - b.start_day;
            }
            if (a.stage_order !== b.stage_order) {
                return a.stage_order - b.stage_order;
            }
            return a.id - b.id;
        });

    sortedStages.forEach((stage) => {
        const stageNode: GanttNode = {
            id: `stage_${stage.id}`,
            title: `${stage.stage_code} - ${stage.stage_name}`,
            type: 'stage',
            parent_id: template.id.toString(),
            stage_code: stage.stage_code,
            start_day: stage.start_day,
            start_hour: 0,
            expanded: false,
            children: [],
            editable: true,
            level: 1,
            data: stage
        };

        // 操作节点 - 按照绝对开始时间（天 + 小时）排序
        const operations = (stageOpsMap[stage.id] || [])
            .slice()
            .sort((a, b) => {
                // 计算操作 A 的绝对开始时间（以小时为单位）
                const aDayOffset = a.operation_day + (a.recommended_day_offset ?? 0);
                const aAbsoluteDay = stage.start_day + aDayOffset;
                const aTime = typeof a.recommended_time === 'number' ? a.recommended_time : 9;
                const aAbsoluteStartHour = aAbsoluteDay * 24 + aTime;

                // 计算操作 B 的绝对开始时间（以小时为单位）
                const bDayOffset = b.operation_day + (b.recommended_day_offset ?? 0);
                const bAbsoluteDay = stage.start_day + bDayOffset;
                const bTime = typeof b.recommended_time === 'number' ? b.recommended_time : 9;
                const bAbsoluteStartHour = bAbsoluteDay * 24 + bTime;

                // 首先按绝对开始时间排序
                if (aAbsoluteStartHour !== bAbsoluteStartHour) {
                    return aAbsoluteStartHour - bAbsoluteStartHour;
                }

                // 如果开始时间相同，按 operation_order 排序
                return a.operation_order - b.operation_order;
            });

        operations.forEach((operation) => {
            const recommendedDayOffset = operation.recommended_day_offset ?? 0;
            const absoluteStartDay = stage.start_day + operation.operation_day + recommendedDayOffset;
            const operationNode: GanttNode = {
                id: `operation_${operation.id}`,
                title: operation.operation_name,
                type: 'operation',
                parent_id: `stage_${stage.id}`,
                required_people: operation.required_people || 1,
                standard_time: typeof operation.standard_time === 'string'
                    ? parseFloat(operation.standard_time) || 4
                    : operation.standard_time || 4, // 默认4小时
                start_day: absoluteStartDay,
                start_hour: Math.floor(operation.recommended_time),
                editable: true,
                level: 2,
                data: operation
            };

            stageNode.children?.push(operationNode);
        });

        templateNode.children?.push(stageNode);
    });

    nodes.push(templateNode);
    return nodes;
};

export const findNodeById = (nodes: GanttNode[], id: string): GanttNode | null => {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNodeById(node.children, id);
            if (found) return found;
        }
    }
    return null;
};

export const generateOperationCode = (availableOperations: Operation[]) => {
    const base = `OP-${Date.now()}`;
    if (!availableOperations.some((op) => op.operation_code === base)) {
        return base;
    }
    let counter = 1;
    let candidate = `${base}-${counter}`;
    while (availableOperations.some((op) => op.operation_code === candidate)) {
        counter += 1;
        candidate = `${base}-${counter}`;
    }
    return candidate;
};
