import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { message } from 'antd';
import { ProcessTemplate, ProcessStage, StageOperation, Operation, GanttNode, TimeBlock } from '../types';
import { API_BASE_URL } from '../constants';
import { buildGanttNodes, generateTimeBlocks } from '../utils';

/**
 * 外部数据配置（用于批次模式）
 */
export interface ExternalGanttData {
    ganttNodes: GanttNode[];
    startDay: number;
    endDay: number;
    timeBlocks?: TimeBlock[];
    baseDate?: string; // ISO 日期字符串，用于显示实际日期
}

export interface UseGanttDataOptions {
    template: ProcessTemplate;
    externalData?: ExternalGanttData;
}

/**
 * useGanttData hook - 支持两种模式：
 * 1. 模板模式：从 API 加载数据（默认）
 * 2. 批次模式：使用外部提供的数据
 */
export const useGanttData = (options: UseGanttDataOptions | ProcessTemplate) => {
    // 兼容旧的调用方式
    const { template, externalData } = useMemo(() => {
        if ('template' in options) {
            return options as UseGanttDataOptions;
        }
        return { template: options as ProcessTemplate, externalData: undefined };
    }, [options]);

    const isExternalMode = !!externalData;

    const [stages, setStages] = useState<ProcessStage[]>([]);
    const [stageOperations, setStageOperations] = useState<{ [key: number]: StageOperation[] }>({});
    const [availableOperations, setAvailableOperations] = useState<Operation[]>([]);
    const [ganttNodes, setGanttNodes] = useState<GanttNode[]>([]);
    const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
    const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [personnelCurve, setPersonnelCurve] = useState<{ points: { hourIndex: number; requiredPeople: number }[]; peak?: { hourIndex: number; requiredPeople: number } | null }>({ points: [], peak: null });

    // 从 API 加载数据（模板模式）
    const fetchData = useCallback(async () => {
        if (isExternalMode) return; // 外部模式不从 API 加载

        setLoading(true);
        try {
            // 获取阶段数据
            const stagesResponse = await axios.get(`${API_BASE_URL}/process-stages/template/${template.id}`);
            const fetchedStages = stagesResponse.data;
            setStages(fetchedStages);

            // 获取可用操作
            const operationsResponse = await axios.get(`${API_BASE_URL}/stage-operations/available`);
            setAvailableOperations(operationsResponse.data);

            // 获取每个阶段的操作
            const stageOpsMap: { [key: number]: StageOperation[] } = {};
            for (const stage of fetchedStages) {
                const opsResponse = await axios.get(`${API_BASE_URL}/stage-operations/stage/${stage.id}`);
                stageOpsMap[stage.id] = opsResponse.data;
            }
            setStageOperations(stageOpsMap);

            // 构建甘特图节点
            const nodes = buildGanttNodes(template, fetchedStages, stageOpsMap);
            setGanttNodes(nodes);

            // 生成时间块
            const blocks = generateTimeBlocks(nodes, fetchedStages);
            setTimeBlocks(blocks);

            // 默认展开所有节点
            const defaultExpandedKeys = [template.id.toString()];
            nodes[0]?.children?.forEach(stageNode => {
                defaultExpandedKeys.push(stageNode.id);
            });
            setExpandedKeys(defaultExpandedKeys);

            // 加载人员用量曲线
            try {
                const curveResponse = await axios.get(`${API_BASE_URL}/process-templates/${template.id}/personnel-curve`);
                setPersonnelCurve({
                    points: curveResponse.data.points || [],
                    peak: curveResponse.data.peak || null
                });
            } catch (curveError) {
                console.error('Failed to load personnel curve:', curveError);
                setPersonnelCurve({ points: [], peak: null });
            }

        } catch (error) {
            message.error('加载模板数据失败');
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [template, isExternalMode]);

    // 追踪是否已初始化外部数据
    const externalDataInitialized = useRef(false);

    // 初始化外部数据（批次模式）
    useEffect(() => {
        if (isExternalMode && externalData) {
            setGanttNodes(externalData.ganttNodes);

            // 如果提供了 timeBlocks 则使用，否则尝试生成
            if (externalData.timeBlocks) {
                setTimeBlocks(externalData.timeBlocks);
            } else {
                // 从外部 ganttNodes 生成 timeBlocks
                const blocks = generateTimeBlocks(externalData.ganttNodes, []);
                setTimeBlocks(blocks);
            }

            // 只在首次初始化时设置默认展开节点
            if (!externalDataInitialized.current) {
                const defaultExpandedKeys: string[] = [];
                const collectKeys = (nodes: GanttNode[]) => {
                    nodes.forEach(node => {
                        if (node.type !== 'operation') {
                            defaultExpandedKeys.push(node.id);
                        }
                        if (node.children) {
                            collectKeys(node.children);
                        }
                    });
                };
                collectKeys(externalData.ganttNodes);
                setExpandedKeys(defaultExpandedKeys);
                externalDataInitialized.current = true;
            }
        }
    }, [isExternalMode, externalData]);

    // 模板模式下自动加载数据
    useEffect(() => {
        if (!isExternalMode) {
            fetchData();
        }
    }, [fetchData, isExternalMode]);

    // 刷新数据方法
    const refreshData = useCallback(async () => {
        if (isExternalMode) {
            // 外部模式：触发外部刷新（由调用者处理）
            console.log('[useGanttData] External mode refresh requested');
            return;
        }
        return fetchData();
    }, [fetchData, isExternalMode]);

    return {
        stages,
        stageOperations,
        availableOperations,
        setAvailableOperations,
        ganttNodes,
        timeBlocks,
        expandedKeys,
        setExpandedKeys,
        loading,
        personnelCurve,
        refreshData,
        setGanttNodes,
        setTimeBlocks,
        isExternalMode
    };
};
