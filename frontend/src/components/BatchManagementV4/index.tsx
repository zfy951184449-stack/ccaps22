import React, { Suspense, useCallback, useMemo } from 'react';
import { Typography, Empty, Button, Segmented, Modal } from 'antd';
import { PlusOutlined, AppstoreOutlined, FileTextOutlined, RocketOutlined, CopyOutlined, BarsOutlined, BarChartOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { message } from 'antd';
import StatsCardV4 from './StatsCardV4';
import BatchListV4 from './BatchListV4';
import BatchFilterBar from './BatchFilterBar';
import CreateBatchModalV4 from './CreateBatchModalV4';
import BulkCreateModalV4 from './BulkCreateModalV4';
import { batchPlanApi, processTemplateApi } from '../../services/api';
import type { BatchStatistics, BatchPlan, BatchTemplateSummary, ProcessTemplate } from '../../types';

const { Title, Text } = Typography;
const BatchGanttV4 = React.lazy(() => import('./BatchGanttV4'));

/**
 * BatchManagementV4
 * 
 * A completely new implementation of Batch Management interface following Apple HIG.
 * Features:
 * - Glassmorphism effects (backdrop-filter)
 * - Large rounded corners (Squircle-like)
 * - Minimalist design
 * - Fluid animations
 * - Dual-Mode View: List vs Gantt
 * - Multi-select filtering by Team, Template, and Batch
 */

const BatchManagementV4: React.FC = () => {
    // State
    const [viewMode, setViewMode] = React.useState<'list' | 'gantt'>('list');
    const [stats, setStats] = React.useState<BatchStatistics>({
        total_batches: 0,
        draft_count: 0,
        activated_count: 0
    });
    const [batches, setBatches] = React.useState<BatchPlan[]>([]);
    const [templates, setTemplates] = React.useState<ProcessTemplate[]>([]);
    const [loading, setLoading] = React.useState(false);

    // Modal states
    const [createModalVisible, setCreateModalVisible] = React.useState(false);
    const [bulkModalVisible, setBulkModalVisible] = React.useState(false);
    const [editingBatch, setEditingBatch] = React.useState<BatchPlan | null>(null);

    // Filter states
    const [selectedBatchIds, setSelectedBatchIds] = React.useState<number[]>([]);
    const [selectedTemplateIds, setSelectedTemplateIds] = React.useState<number[]>([]);
    const [selectedTeamCodes, setSelectedTeamCodes] = React.useState<string[]>([]);

    // Initial data load
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [statsData, batchesData, templatesData] = await Promise.all([
                batchPlanApi.getStatistics(),
                batchPlanApi.list(),
                processTemplateApi.getAll().then(res => res.data)
            ]);
            setStats(statsData);
            setBatches(batchesData);
            setTemplates(templatesData);
        } catch (error) {
            console.error('Failed to load data', error);
            message.error('加载数据失败');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadData();
    }, [loadData]);

    const selectedBatchIdSet = useMemo(() => new Set(selectedBatchIds), [selectedBatchIds]);
    const selectedTemplateIdSet = useMemo(() => new Set(selectedTemplateIds), [selectedTemplateIds]);
    const selectedTeamCodeSet = useMemo(() => new Set(selectedTeamCodes), [selectedTeamCodes]);
    const templateTeamCodeById = useMemo(() => {
        const entries = templates
            .filter((template): template is ProcessTemplate & { id: number } => typeof template.id === 'number')
            .map((template) => [template.id, template.team_code] as const);
        return new Map<number, string | undefined>(entries);
    }, [templates]);
    const templateSummaries = useMemo<BatchTemplateSummary[]>(() => {
        return templates
            .filter((template): template is ProcessTemplate & { id: number } => typeof template.id === 'number')
            .map((template) => ({
                id: template.id,
                template_code: template.template_code,
                template_name: template.template_name,
                total_days: template.total_days ?? null,
            }));
    }, [templates]);

    // Filtered batches based on filter criteria
    const filteredBatches = useMemo(() => {
        return batches.filter(batch => {
            // Filter by batch IDs
            if (selectedBatchIdSet.size > 0 && !selectedBatchIdSet.has(batch.id)) {
                return false;
            }
            // Filter by template IDs
            if (selectedTemplateIdSet.size > 0 && !selectedTemplateIdSet.has(batch.template_id)) {
                return false;
            }
            // Filter by team codes (via batch's team_code or template lookup)
            if (selectedTeamCodeSet.size > 0) {
                const batchTeamCode = batch.team_code ?? templateTeamCodeById.get(batch.template_id);
                if (!batchTeamCode || !selectedTeamCodeSet.has(batchTeamCode)) {
                    return false;
                }
            }
            return true;
        });
    }, [batches, selectedBatchIdSet, selectedTemplateIdSet, selectedTeamCodeSet, templateTeamCodeById]);

    const hasActiveFilters = selectedBatchIds.length > 0 || selectedTemplateIds.length > 0 || selectedTeamCodes.length > 0;
    const filteredBatchIds = useMemo(() => filteredBatches.map((batch) => batch.id), [filteredBatches]);
    const ganttFilteredBatchIds = hasActiveFilters ? filteredBatchIds : undefined;

    // Clear all filters
    const handleClearFilters = useCallback(() => {
        setSelectedBatchIds([]);
        setSelectedTemplateIds([]);
        setSelectedTeamCodes([]);
    }, []);

    // Handlers
    const handleCreate = useCallback(() => {
        setEditingBatch(null);
        setCreateModalVisible(true);
    }, []);

    const handleEdit = useCallback((batch: BatchPlan) => {
        setEditingBatch(batch);
        setCreateModalVisible(true);
    }, []);

    const handleSuccess = useCallback(() => {
        setCreateModalVisible(false);
        setBulkModalVisible(false);
        setEditingBatch(null);
        loadData();
    }, [loadData]);

    const executeDelete = useCallback(async (batch: BatchPlan) => {
        try {
            await batchPlanApi.remove(batch.id, { force: true });
            message.success(`批次 ${batch.batch_code} 已删除`);
            loadData();
        } catch (error: any) {
            const serverMsg = error?.response?.data?.error;
            if (error?.response?.status === 404) {
                message.warning('批次不存在或已被删除');
                loadData();
            } else {
                message.error(serverMsg || '删除批次失败');
            }
        }
    }, [loadData]);

    const handleDelete = useCallback((batch: BatchPlan) => {
        if (batch.plan_status === 'ACTIVATED') {
            Modal.confirm({
                title: '删除已激活批次',
                icon: <ExclamationCircleFilled style={{ color: '#FF3B30' }} />,
                content: (
                    <div style={{ marginTop: 8 }}>
                        <p style={{ margin: '0 0 8px', fontWeight: 500 }}>
                            批次 <strong>{batch.batch_code}</strong> 当前处于激活状态。
                        </p>
                        <p style={{ margin: '0 0 4px', color: '#666' }}>
                            删除将同时执行以下操作：
                        </p>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 20, color: '#666', fontSize: 13 }}>
                            <li>撤销批次激活状态</li>
                            <li>清除人员排班分配数据</li>
                            <li>清除关联的班次计划</li>
                            <li>删除所有操作计划和约束</li>
                        </ul>
                        <p style={{ margin: '12px 0 0', color: '#FF3B30', fontSize: 13, fontWeight: 500 }}>
                            此操作不可撤销。
                        </p>
                    </div>
                ),
                okText: '确认删除',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => executeDelete(batch),
                width: 440,
            });
        } else {
            // DRAFT 批次由 BatchListV4 的 Popconfirm 处理确认，到这里直接执行
            executeDelete(batch);
        }
    }, [executeDelete]);

    const handleActivate = useCallback(async (batch: BatchPlan) => {
        try {
            await batchPlanApi.activate(batch.id);
            message.success('批次已激活');
            loadData();
        } catch (error) {
            message.error('激活失败');
        }
    }, [loadData]);

    const handleDeactivate = useCallback(async (batch: BatchPlan) => {
        try {
            await batchPlanApi.deactivate(batch.id);
            message.success('批次已撤销激活');
            loadData();
        } catch (error) {
            message.error('撤销激活失败');
        }
    }, [loadData]);

    // Apple HIG style constants that override/extend the base tokens for this specific new look
    const styles = {
        container: {
            height: '100%',
            width: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.6)', // Translucent background
            backdropFilter: 'blur(20px)', // Heavy blur for glass effect
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '24px', // Large rounded corners (approx. rounded-3xl)
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.07)', // Soft, diffused shadow
            border: '1px solid rgba(255, 255, 255, 0.18)', // Subtle white border
            padding: '24px',
            display: 'flex',
            flexDirection: 'column' as const,
            overflow: 'hidden',
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            padding: '0 8px', // Slight padding for alignment
        },
        statsRow: {
            display: 'flex',
            gap: '20px',
            marginBottom: '16px',
            flexShrink: 0, // Ensure stats don't shrink
        },
        content: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column' as const,
            background: 'rgba(245, 245, 247, 0.3)',
            borderRadius: '16px',
            overflow: 'hidden',
            opacity: 1,
            // For Gantt view, we want to remove extra padding/margin so it fits perfectly
            position: 'relative' as const,
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div>
                    <Title level={2} style={{ margin: 0, fontWeight: 600, letterSpacing: '-0.5px' }}>
                        批次管理
                    </Title>
                    <Text type="secondary" style={{ fontSize: '15px' }}>
                        管理您的生产批次与排程
                    </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* View Switcher */}
                    <Segmented
                        options={[
                            { label: '列表视图', value: 'list', icon: <BarsOutlined /> },
                            { label: '甘特图', value: 'gantt', icon: <BarChartOutlined /> },
                        ]}
                        value={viewMode}
                        onChange={(val) => setViewMode(val as 'list' | 'gantt')}
                        style={{ background: 'rgba(118, 118, 128, 0.12)', fontWeight: 500 }}
                    />

                    <div style={{ width: 1, height: 24, backgroundColor: 'rgba(0,0,0,0.1)' }}></div>

                    <Button
                        type="default"
                        size="large"
                        icon={<CopyOutlined />}
                        onClick={() => setBulkModalVisible(true)}
                        style={{
                            borderRadius: '12px',
                            height: '44px',
                            padding: '0 20px',
                            fontWeight: 500,
                            border: 'none',
                            background: 'rgba(255,255,255,0.5)',
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                        }}
                    >
                        批量创建
                    </Button>
                    <Button
                        type="primary"
                        size="large"
                        icon={<PlusOutlined />}
                        style={{
                            borderRadius: '12px',
                            height: '44px',
                            padding: '0 24px',
                            fontWeight: 500,
                            boxShadow: '0 4px 14px 0 rgba(0, 118, 255, 0.2)',
                            backgroundColor: '#007AFF', // Force Apple Blue
                            border: 'none',
                            color: '#ffffff'
                        }}
                        onClick={handleCreate}
                    >
                        新建批次
                    </Button>
                </div>
            </div>

            <div style={styles.statsRow}>
                <div style={{ flex: 1 }}>
                    <StatsCardV4
                        title="总批次"
                        value={stats.total_batches}
                        icon={<AppstoreOutlined />}
                        color="#007AFF"
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <StatsCardV4
                        title="草稿"
                        value={stats.draft_count}
                        icon={<FileTextOutlined />}
                        color="#8E8E93"
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <StatsCardV4
                        title="已激活"
                        value={stats.activated_count}
                        icon={<RocketOutlined />}
                        color="#34C759"
                    />
                </div>
            </div>

            {/* Filter Bar */}
            <BatchFilterBar
                batches={batches}
                templates={templates}
                selectedBatchIds={selectedBatchIds}
                selectedTemplateIds={selectedTemplateIds}
                selectedTeamCodes={selectedTeamCodes}
                onBatchChange={setSelectedBatchIds}
                onTemplateChange={setSelectedTemplateIds}
                onTeamChange={setSelectedTeamCodes}
                onClear={handleClearFilters}
            />

            <div style={styles.content}>
                {viewMode === 'list' ? (
                    loading || filteredBatches.length > 0 ? (
                        <BatchListV4
                            data={filteredBatches}
                            loading={loading}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onActivate={handleActivate}
                            onDeactivate={handleDeactivate}
                        />
                    ) : (
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '100%'
                        }}>
                            <Empty
                                image={<div style={{
                                    fontSize: '64px',
                                    color: 'rgba(0,0,0,0.1)',
                                    marginBottom: '16px',
                                    display: 'flex',
                                    justifyContent: 'center'
                                }}>
                                    <AppstoreOutlined />
                                </div>}
                                description={
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <Text strong style={{ fontSize: '18px', color: '#1d1d1f' }}>
                                            {selectedBatchIds.length > 0 || selectedTemplateIds.length > 0 || selectedTeamCodes.length > 0
                                                ? '没有匹配的批次'
                                                : '暂无批次数据'}
                                        </Text>
                                        <Text type="secondary">
                                            {selectedBatchIds.length > 0 || selectedTemplateIds.length > 0 || selectedTeamCodes.length > 0
                                                ? '请尝试调整筛选条件'
                                                : '点击右上角的按钮开始创建一个新的生产批次'}
                                        </Text>
                                    </div>
                                }
                            />
                        </div>
                    )
                ) : (
                    // Gantt View
                    <Suspense fallback={<div style={{ padding: 24, color: '#8E8E93' }}>甘特图加载中...</div>}>
                        <BatchGanttV4
                            filteredBatchIds={ganttFilteredBatchIds}
                            onCreateBatch={handleCreate}
                        />
                    </Suspense>
                )}
            </div>

            {createModalVisible && (
                <CreateBatchModalV4
                    visible={createModalVisible}
                    templates={templateSummaries}
                    initialValues={editingBatch}
                    onCancel={() => {
                        setCreateModalVisible(false);
                        setEditingBatch(null);
                    }}
                    onSuccess={handleSuccess}
                />
            )}

            {bulkModalVisible && (
                <BulkCreateModalV4
                    visible={bulkModalVisible}
                    templates={templateSummaries}
                    onCancel={() => setBulkModalVisible(false)}
                    onSuccess={handleSuccess}
                />
            )}
        </div>
    );
};

export default BatchManagementV4;
