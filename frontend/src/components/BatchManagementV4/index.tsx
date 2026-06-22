import React, { Suspense, useCallback, useMemo } from 'react';
import {
    WxbButton,
    WxbEmpty,
    WxbIcon,
    WxbModal,
    WxbPageSection,
    WxbPageShell,
    WxbSegmented,
    WxbSpinner,
    wxbToast,
} from '../wxb-ui';
import BatchListV4 from './BatchListV4';
import BatchFilterBar from './BatchFilterBar';
import CreateBatchModalV4 from './CreateBatchModalV4';
import BulkCreateModalV4 from './BulkCreateModalV4';
import RefreshFromTemplateModal from './RefreshFromTemplateModal';
import { batchPlanApi, mfgTemplatePackageApi, processTemplateApi } from '../../services/api';
import type { BatchPlan, BatchTemplateSummary, MfgTemplatePackageSummary, ProcessTemplate } from '../../types';
import './BatchManagementV4.css';

const BatchGanttV4 = React.lazy(() => import('./BatchGanttV4/index'));

const getInitialViewMode = (): 'list' | 'gantt' => {
    if (typeof window === 'undefined') {
        return 'list';
    }

    const params = new URLSearchParams(window.location.search);
    return params.has('gantt_from') || params.has('gantt_to') ? 'gantt' : 'list';
};

const BatchManagementV4: React.FC = () => {
    const [viewMode, setViewMode] = React.useState<'list' | 'gantt'>(getInitialViewMode);
    const [batches, setBatches] = React.useState<BatchPlan[]>([]);
    const [templates, setTemplates] = React.useState<ProcessTemplate[]>([]);
    const [mfgPackages, setMfgPackages] = React.useState<MfgTemplatePackageSummary[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [deleteTarget, setDeleteTarget] = React.useState<BatchPlan | null>(null);
    const [deleteLoading, setDeleteLoading] = React.useState(false);

    const [createModalVisible, setCreateModalVisible] = React.useState(false);
    const [bulkModalVisible, setBulkModalVisible] = React.useState(false);
    const [editingBatch, setEditingBatch] = React.useState<BatchPlan | null>(null);
    const [refreshTarget, setRefreshTarget] = React.useState<BatchPlan | null>(null);

    const [selectedBatchIds, setSelectedBatchIds] = React.useState<number[]>([]);
    const [selectedTemplateIds, setSelectedTemplateIds] = React.useState<number[]>([]);
    const [selectedTeamCodes, setSelectedTeamCodes] = React.useState<string[]>([]);
    const [selectedTableRowKeys, setSelectedTableRowKeys] = React.useState<React.Key[]>([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [batchesData, templatesData, packageData] = await Promise.all([
                batchPlanApi.list(),
                processTemplateApi.getAll().then((res) => res.data),
                mfgTemplatePackageApi.list().catch(() => [] as MfgTemplatePackageSummary[]),
            ]);
            setBatches(batchesData);
            setTemplates(templatesData);
            setMfgPackages(packageData);
        } catch (error) {
            console.error('Failed to load data', error);
            wxbToast.error('加载数据失败');
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

    const filteredBatches = useMemo(() => {
        return batches.filter((batch) => {
            if (selectedBatchIdSet.size > 0 && !selectedBatchIdSet.has(batch.id)) {
                return false;
            }

            if (selectedTemplateIdSet.size > 0 && !selectedTemplateIdSet.has(batch.template_id)) {
                return false;
            }

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
    const filteredBatchIdSet = useMemo(() => new Set(filteredBatchIds), [filteredBatchIds]);
    const ganttFilteredBatchIds = hasActiveFilters ? filteredBatchIds : undefined;
    const selectedTableBatchIds = useMemo(() => (
        new Set(selectedTableRowKeys.map((key) => Number(key)).filter(Number.isFinite))
    ), [selectedTableRowKeys]);
    const selectedTableBatches = useMemo(() => (
        batches.filter((batch) => selectedTableBatchIds.has(batch.id))
    ), [batches, selectedTableBatchIds]);
    const selectedDraftCount = useMemo(() => (
        selectedTableBatches.filter((batch) => batch.plan_status === 'DRAFT').length
    ), [selectedTableBatches]);
    const selectedActivatedCount = useMemo(() => (
        selectedTableBatches.filter((batch) => batch.plan_status === 'ACTIVATED').length
    ), [selectedTableBatches]);

    React.useEffect(() => {
        setSelectedTableRowKeys((previousKeys) => {
            const visibleKeys = previousKeys.filter((key) => filteredBatchIdSet.has(Number(key)));
            return visibleKeys.length === previousKeys.length ? previousKeys : visibleKeys;
        });
    }, [filteredBatchIdSet]);

    const handleClearFilters = useCallback(() => {
        setSelectedBatchIds([]);
        setSelectedTemplateIds([]);
        setSelectedTeamCodes([]);
    }, []);

    const handleCreate = useCallback(() => {
        setEditingBatch(null);
        setCreateModalVisible(true);
    }, []);

    const handleEdit = useCallback((batch: BatchPlan) => {
        setEditingBatch(batch);
        setCreateModalVisible(true);
    }, []);

    const handleRefresh = useCallback((batch: BatchPlan) => {
        setRefreshTarget(batch);
    }, []);

    const handleRefreshApplied = useCallback(() => {
        setRefreshTarget(null);
        loadData();
    }, [loadData]);

    const handleSuccess = useCallback(() => {
        setCreateModalVisible(false);
        setBulkModalVisible(false);
        setEditingBatch(null);
        loadData();
    }, [loadData]);

    const executeDelete = useCallback(async (batch: BatchPlan) => {
        try {
            await batchPlanApi.remove(batch.id, { force: true });
            wxbToast.success(`批次 ${batch.batch_code} 已删除`);
            loadData();
        } catch (error: any) {
            const serverMsg = error?.response?.data?.error;
            if (error?.response?.status === 404) {
                wxbToast.warning('批次不存在或已被删除');
                loadData();
            } else {
                wxbToast.error(serverMsg || '删除批次失败');
            }
            throw error;
        }
    }, [loadData]);

    const handleDelete = useCallback((batch: BatchPlan) => {
        if (batch.plan_status === 'ACTIVATED') {
            setDeleteTarget(batch);
            return;
        }

        executeDelete(batch).catch(() => undefined);
    }, [executeDelete]);

    const handleConfirmActivatedDelete = useCallback(async () => {
        if (!deleteTarget) {
            return;
        }

        setDeleteLoading(true);
        try {
            await executeDelete(deleteTarget);
            setDeleteTarget(null);
        } catch {
            // Toast is handled in executeDelete.
        } finally {
            setDeleteLoading(false);
        }
    }, [deleteTarget, executeDelete]);

    const handleActivate = useCallback(async (batch: BatchPlan) => {
        try {
            await batchPlanApi.activate(batch.id);
            wxbToast.success('批次已激活');
            loadData();
        } catch (error) {
            console.error('Failed to activate batch', error);
            wxbToast.error('激活失败');
        }
    }, [loadData]);

    const handleDeactivate = useCallback(async (batch: BatchPlan) => {
        try {
            await batchPlanApi.deactivate(batch.id);
            wxbToast.success('批次已撤销激活');
            loadData();
        } catch (error) {
            console.error('Failed to deactivate batch', error);
            wxbToast.error('撤销激活失败');
        }
    }, [loadData]);

    const runBulkMutation = useCallback(async (
        targets: BatchPlan[],
        mutation: (batch: BatchPlan) => Promise<unknown>,
        successMessage: string,
        failureMessage: string,
    ) => {
        if (targets.length === 0) {
            wxbToast.info('没有符合条件的批次');
            return;
        }

        try {
            await Promise.all(targets.map(mutation));
            wxbToast.success(successMessage);
            setSelectedTableRowKeys([]);
        } catch (error) {
            console.error(failureMessage, error);
            wxbToast.error(failureMessage);
        } finally {
            loadData();
        }
    }, [loadData]);

    const handleBulkActivate = useCallback(() => {
        const targets = selectedTableBatches.filter((batch) => batch.plan_status === 'DRAFT');
        void runBulkMutation(
            targets,
            (batch) => batchPlanApi.activate(batch.id),
            `已激活 ${targets.length} 个批次`,
            '批量激活失败',
        );
    }, [runBulkMutation, selectedTableBatches]);

    const handleBulkDeactivate = useCallback(() => {
        const targets = selectedTableBatches.filter((batch) => batch.plan_status === 'ACTIVATED');
        void runBulkMutation(
            targets,
            (batch) => batchPlanApi.deactivate(batch.id),
            `已撤销 ${targets.length} 个批次`,
            '批量撤销失败',
        );
    }, [runBulkMutation, selectedTableBatches]);

    const handleBulkDelete = useCallback(() => {
        void runBulkMutation(
            selectedTableBatches,
            (batch) => batchPlanApi.remove(batch.id, { force: true }),
            `已删除 ${selectedTableBatches.length} 个批次`,
            '批量删除失败',
        );
    }, [runBulkMutation, selectedTableBatches]);

    return (
        <WxbPageShell className="batch-management-v4" size="full" gap="sm" minHeight="100%">
            <BatchFilterBar
                className="batch-management-v4__topbar"
                batches={batches}
                templates={templates}
                selectedBatchIds={selectedBatchIds}
                selectedTemplateIds={selectedTemplateIds}
                selectedTeamCodes={selectedTeamCodes}
                onBatchChange={setSelectedBatchIds}
                onTemplateChange={setSelectedTemplateIds}
                onTeamChange={setSelectedTeamCodes}
                onClear={handleClearFilters}
                extraActions={(
                    <div className="batch-management-v4__topbar-actions">
                        <WxbSegmented
                            size="sm"
                            value={viewMode}
                            onChange={(value) => setViewMode(value as 'list' | 'gantt')}
                            options={[
                                { label: '列表视图', value: 'list', icon: <WxbIcon name="kanban" size={14} /> },
                                { label: '甘特图', value: 'gantt', icon: <WxbIcon name="hold-time" size={14} /> },
                            ]}
                        />
                        <WxbButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setBulkModalVisible(true)}
                        >
                            <WxbIcon name="receipt" size={16} />
                            批量创建
                        </WxbButton>
                        <WxbButton type="button" variant="primary" size="sm" onClick={handleCreate}>
                            <WxbIcon name="batch-record" size={16} />
                            新建批次
                        </WxbButton>
                    </div>
                )}
            />

            <WxbPageSection className="batch-management-v4__content" variant="framed" density="compact">
                {viewMode === 'list' ? (
                    loading || filteredBatches.length > 0 ? (
                        <BatchListV4
                            data={filteredBatches}
                            loading={loading}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onActivate={handleActivate}
                            onDeactivate={handleDeactivate}
                            onRefresh={handleRefresh}
                            selectedRowKeys={selectedTableRowKeys}
                            selectedDraftCount={selectedDraftCount}
                            selectedActivatedCount={selectedActivatedCount}
                            onSelectionChange={setSelectedTableRowKeys}
                            onBulkActivate={handleBulkActivate}
                            onBulkDeactivate={handleBulkDeactivate}
                            onBulkDelete={handleBulkDelete}
                        />
                    ) : (
                        <div className="batch-management-v4__empty">
                            <WxbEmpty
                                image={<WxbIcon className="batch-management-v4__empty-icon" name="batch-record" size={54} />}
                                description={hasActiveFilters ? '没有匹配的批次' : '暂无批次数据'}
                                action={(
                                    <WxbButton type="button" size="sm" onClick={hasActiveFilters ? handleClearFilters : handleCreate}>
                                        {hasActiveFilters ? '清除筛选' : '新建批次'}
                                    </WxbButton>
                                )}
                            />
                        </div>
                    )
                ) : (
                    <Suspense fallback={<WxbSpinner tip="甘特图加载中" />}>
                        <BatchGanttV4
                            filteredBatchIds={ganttFilteredBatchIds}
                            onCreateBatch={handleCreate}
                        />
                    </Suspense>
                )}
            </WxbPageSection>

            {createModalVisible && (
                <CreateBatchModalV4
                    visible={createModalVisible}
                    templates={templateSummaries}
                    mfgPackages={mfgPackages}
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
                    mfgPackages={mfgPackages}
                    onCancel={() => setBulkModalVisible(false)}
                    onSuccess={handleSuccess}
                />
            )}

            <RefreshFromTemplateModal
                batchId={refreshTarget?.id ?? null}
                visible={!!refreshTarget}
                onClose={() => setRefreshTarget(null)}
                onApplied={handleRefreshApplied}
            />

            <WxbModal
                open={!!deleteTarget}
                title="删除已激活批次"
                okText="确认删除"
                cancelText="取消"
                okVariant="danger"
                confirmLoading={deleteLoading}
                onOk={handleConfirmActivatedDelete}
                onCancel={() => setDeleteTarget(null)}
                width={480}
                centered
            >
                <div className="batch-modal-v4__body">
                    <div>
                        <div className="batch-modal-v4__section-title">
                            批次 {deleteTarget?.batch_code} 当前处于激活状态。
                        </div>
                        <p className="batch-modal-v4__delete-copy">
                            删除将同时撤销激活状态并清理关联排班数据，此操作不可撤销。
                        </p>
                        <ul className="batch-modal-v4__danger-list">
                            <li>撤销批次激活状态</li>
                            <li>清除人员排班分配数据</li>
                            <li>清除关联的班次计划</li>
                            <li>删除所有操作计划和约束</li>
                        </ul>
                    </div>
                </div>
            </WxbModal>
        </WxbPageShell>
    );
};

export default BatchManagementV4;
