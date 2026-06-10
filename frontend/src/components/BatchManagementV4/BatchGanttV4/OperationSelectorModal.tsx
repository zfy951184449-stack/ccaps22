import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { debounce } from 'lodash';
import dayjs from 'dayjs';
import {
    WxbBadge,
    WxbButton,
    WxbEmpty,
    WxbIcon,
    WxbModal,
    WxbSearchInput,
    WxbSelect,
    WxbSpinner,
    WxbTag,
} from '../../wxb-ui';
import './OperationSelectorModal.css';

interface OperationSelectorModalProps {
    visible: boolean;
    batchId?: number; // Current batch ID
    defaultStageId?: number; // Current stage ID
    currentOperationId: number;
    onCancel: () => void;
    onSelect: (selectedIds: number[]) => Promise<void>;
    getContainer?: () => HTMLElement;
}

interface HierarchyNode {
    key: string;
    title: string;
    isLeaf: boolean;
    type: 'batch' | 'stage';
    id: number;
    children?: HierarchyNode[];
    batchId?: number;
}

interface SearchResult {
    operation_plan_id: number;
    operation_name: string;
    operation_code: string;
    stage_name?: string;
    planned_start_datetime?: string;
    batch_code?: string;
    batch_name?: string;
    batch_id: number;
    stage_id: number;
}

const OperationSelectorModal: React.FC<OperationSelectorModalProps> = ({
    visible,
    batchId,
    defaultStageId,
    currentOperationId,
    onCancel,
    onSelect,
    getContainer
}) => {
    // State
    const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);

    // Selection state (Top Filters)
    const [selectedFilterBatchId, setSelectedFilterBatchId] = useState<number | null>(null);
    const [selectedFilterStageId, setSelectedFilterStageId] = useState<number | null>(null);

    // Operation Data
    const [searchTerm, setSearchTerm] = useState('');
    const [operations, setOperations] = useState<SearchResult[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    // Loading states
    const [loadingHierarchy, setLoadingHierarchy] = useState(false);
    const [loadingOps, setLoadingOps] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Initial Load & Reset
    useEffect(() => {
        if (visible) {
            fetchHierarchy();
        } else {
            // Reset state on close
            setSearchTerm('');
            setSelectedIds([]);
            // Don't reset filters yet, waiting for open to set defaults
        }
    }, [visible]);

    // Set defaults after hierarchy loads or on open
    useEffect(() => {
        if (visible && hierarchy.length > 0) {
            // Default to props if available, otherwise first batch
            const targetBatchId = batchId || (hierarchy[0]?.id);
            setSelectedFilterBatchId(targetBatchId);

            // Default stage logic
            if (targetBatchId) {
                // If prop provided and matches current batch
                if (defaultStageId && batchId === targetBatchId) {
                    setSelectedFilterStageId(defaultStageId);
                } else {
                    // Select first stage of the batch if available
                    const batchNode = hierarchy.find(b => b.id === targetBatchId);
                    if (batchNode && batchNode.children && batchNode.children.length > 0) {
                        setSelectedFilterStageId(batchNode.children[0].id);
                    } else {
                        setSelectedFilterStageId(null);
                    }
                }
            }
        }
    }, [visible, hierarchy, batchId, defaultStageId]);

    const fetchHierarchy = async () => {
        setLoadingHierarchy(true);
        try {
            const res = await axios.get('/api/batch-operations/hierarchy');
            setHierarchy(res.data);
        } catch (error) {
            console.error('Failed to load hierarchy', error);
        } finally {
            setLoadingHierarchy(false);
        }
    };

    const fetchOperations = async () => {
        setLoadingOps(true);
        try {
            const params: any = {
                // excludeOperationPlanId: currentOperationId // Don't exclude, we want to show it as disabled
            };
            if (searchTerm) params.q = searchTerm;
            if (selectedFilterBatchId) params.batchId = selectedFilterBatchId;
            if (selectedFilterStageId) params.stageId = selectedFilterStageId;

            const res = await axios.get('/api/batch-operations/search', { params });
            setOperations(res.data);
        } catch (error) {
            console.error('Failed to search operations', error);
        } finally {
            setLoadingOps(false);
        }
    };

    // Debounced search
    const debouncedSearch = useMemo(() => debounce((val) => {
        setSearchTerm(val);
    }, 500), []);

    // Trigger fetch on filter change
    useEffect(() => {
        if (visible) {
            fetchOperations();
        }
    }, [searchTerm, selectedFilterBatchId, selectedFilterStageId]);

    const handleBatchChange = (val: number) => {
        setSelectedFilterBatchId(val);
        // Reset stage or select first
        const batchNode = hierarchy.find(b => b.id === val);
        if (batchNode && batchNode.children && batchNode.children.length > 0) {
            setSelectedFilterStageId(batchNode.children[0].id);
        } else {
            setSelectedFilterStageId(null);
        }
    };

    const toggleSelection = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleConfirm = async () => {
        if (selectedIds.length === 0) return;
        setSubmitting(true);
        try {
            await onSelect(selectedIds);
            onCancel();
        } catch (error) {
            // handled by parent
        } finally {
            setSubmitting(false);
        }
    };

    // Computed Options
    const currentBatchNode = hierarchy.find(b => b.id === selectedFilterBatchId);
    const stageOptions = currentBatchNode?.children || [];

    const footer = (
        <div className="operation-selector__footer">
            <WxbButton variant="ghost" onClick={onCancel}>
                取消
            </WxbButton>
            <WxbButton
                onClick={handleConfirm}
                disabled={selectedIds.length === 0 || submitting}
            >
                {submitting
                    ? '添加中...'
                    : selectedIds.length > 0
                        ? `添加 ${selectedIds.length} 个操作`
                        : '添加操作'}
            </WxbButton>
        </div>
    );

    return (
        <WxbModal
            className="operation-selector-modal"
            title="关联操作"
            footer={footer}
            open={visible}
            onCancel={onCancel}
            width={900}
            centered
            getContainer={getContainer}
        >
            <div className="operation-selector">
                {/* Top Filter Area */}
                <div className="operation-selector__filters">
                    <div className="operation-selector__filter">
                        <WxbSelect
                            label="选择批次"
                            showSearch
                            optionFilterProp="label"
                            value={selectedFilterBatchId ?? undefined}
                            onChange={(val) => handleBatchChange(val as number)}
                            placeholder="选择批次"
                            size="large"
                            loading={loadingHierarchy}
                            options={hierarchy.map(b => ({ label: b.title, value: b.id }))}
                            getPopupContainer={(trigger) => trigger.parentNode as HTMLElement} // FIX: Attach to parent to work in Fullscreen
                        />
                    </div>
                    <div className="operation-selector__filter">
                        <WxbSelect
                            label="选择阶段"
                            value={selectedFilterStageId ?? undefined}
                            onChange={(val) => setSelectedFilterStageId(val as number)}
                            placeholder="选择阶段"
                            size="large"
                            disabled={!selectedFilterBatchId}
                            options={stageOptions.map(s => ({ label: s.title, value: s.id }))}
                            getPopupContainer={(trigger) => trigger.parentNode as HTMLElement} // FIX: Attach to parent to work in Fullscreen
                        />
                    </div>
                </div>

                {/* Status Bar & Search */}
                <div className="operation-selector__statusbar">
                    <div className="operation-selector__count">
                        <WxbBadge variant="bar" status="info" label={String(selectedIds.length)} />
                        <span>已选操作</span>
                    </div>

                    <WxbSearchInput
                        className="operation-selector__search"
                        placeholder="搜索当前可见操作..."
                        onChange={(val) => debouncedSearch(val)}
                    />
                </div>

                {/* Main Grid Content */}
                <div className="operation-selector__grid-area">
                    {loadingOps ? (
                        <div className="operation-selector__loading">
                            <WxbSpinner size={40} />
                        </div>
                    ) : operations.length === 0 ? (
                        <div className="operation-selector__empty">
                            <WxbEmpty description="暂无匹配操作" />
                            {(!selectedFilterBatchId || !selectedFilterStageId) && (
                                <div className="operation-selector__empty-hint">请选择批次与阶段</div>
                            )}
                        </div>
                    ) : (
                        <div className="operation-selector__grid">
                            {operations.map(op => {
                                const isSelected = selectedIds.includes(op.operation_plan_id);
                                const isCurrent = op.operation_plan_id === currentOperationId;
                                const cardClass = [
                                    'operation-selector__card',
                                    isSelected ? 'is-selected' : '',
                                    isCurrent ? 'is-current' : '',
                                ].filter(Boolean).join(' ');
                                return (
                                    <button
                                        type="button"
                                        key={op.operation_plan_id}
                                        className={cardClass}
                                        disabled={isCurrent}
                                        onClick={() => !isCurrent && toggleSelection(op.operation_plan_id)}
                                    >
                                        <div className="operation-selector__card-head">
                                            <div className="operation-selector__card-name" title={op.operation_name}>
                                                {op.operation_name}
                                            </div>
                                            {isSelected && (
                                                <WxbIcon
                                                    name="released"
                                                    size={20}
                                                    className="operation-selector__card-check"
                                                />
                                            )}
                                            {isCurrent && <WxbTag color="neutral">当前操作</WxbTag>}
                                        </div>

                                        <div className="operation-selector__card-code">
                                            {op.operation_code || '#无编码'}
                                        </div>

                                        <div className="operation-selector__card-tags">
                                            <WxbTag color="blue">{op.batch_code}</WxbTag>
                                            <WxbTag color="neutral">{op.stage_name}</WxbTag>
                                        </div>

                                        <div className="operation-selector__card-time">
                                            {op.planned_start_datetime
                                                ? dayjs(op.planned_start_datetime).format('MM-DD HH:mm')
                                                : '未排程'}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </WxbModal>
    );
};

export default OperationSelectorModal;
