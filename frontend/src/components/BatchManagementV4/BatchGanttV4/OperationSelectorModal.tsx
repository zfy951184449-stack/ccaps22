import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Tag, Spin, Input, Empty, Select, Badge } from 'antd';
import { SearchOutlined, CheckCircleFilled, FilterOutlined } from '@ant-design/icons';
import axios from 'axios';
import { debounce } from 'lodash';
import dayjs from 'dayjs';

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

const { Option } = Select;

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

    return (
        <Modal
            title={null}
            footer={null}
            open={visible}
            onCancel={onCancel}
            width={900}
            centered
            getContainer={getContainer}
            styles={{
                content: {
                    padding: 0,
                    borderRadius: 24,
                    // overflow: 'hidden', // REMOVED to allow dropdowns to overflow if needed, and verify visibility
                    backgroundColor: 'rgba(255,255,255,0.85)',
                    backdropFilter: 'blur(16px)',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                },
                body: { height: '650px', display: 'flex', flexDirection: 'column' }
            }}
        >
            {/* Top Filter Area - Manually apply top radius */}
            <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                display: 'flex',
                gap: '16px',
                backgroundColor: 'rgba(255,255,255,0.4)',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24
            }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4, fontWeight: 500 }}>Select Batch</div>
                    <Select
                        showSearch
                        optionFilterProp="children"
                        value={selectedFilterBatchId}
                        onChange={handleBatchChange}
                        style={{ width: '100%' }}
                        placeholder="Select Batch"
                        size="large"
                        loading={loadingHierarchy}
                        getPopupContainer={(trigger) => trigger.parentNode as HTMLElement} // FIX: Attach to parent to work in Fullscreen
                    >
                        {hierarchy.map(b => (
                            <Option key={b.id} value={b.id}>{b.title}</Option>
                        ))}
                    </Select>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4, fontWeight: 500 }}>Select Stage</div>
                    <Select
                        value={selectedFilterStageId}
                        onChange={setSelectedFilterStageId}
                        style={{ width: '100%' }}
                        placeholder="Select Stage"
                        size="large"
                        disabled={!selectedFilterBatchId}
                        getPopupContainer={(trigger) => trigger.parentNode as HTMLElement} // FIX: Attach to parent to work in Fullscreen
                    >
                        {stageOptions.map(s => (
                            <Option key={s.id} value={s.id}>{s.title}</Option>
                        ))}
                    </Select>
                </div>
            </div>

            {/* Status Bar & Search */}
            <div style={{ padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(249, 250, 251, 0.5)' }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: '#374151', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge count={selectedIds.length} overflowCount={99} style={{ backgroundColor: '#3B82F6' }} showZero />
                    <span>Operations Selected</span>
                </div>

                <Input
                    placeholder="Search visible operations..."
                    prefix={<SearchOutlined style={{ color: '#9CA3AF' }} />}
                    onChange={e => debouncedSearch(e.target.value)}
                    style={{ width: 280, borderRadius: 20, backgroundColor: 'white' }}
                    allowClear
                />
            </div>

            {/* Main Grid Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', backgroundColor: 'rgba(255,255,255,0.3)' }}>
                {loadingOps ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Spin size="large" /></div>
                ) : operations.length === 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', flexDirection: 'column', alignItems: 'center' }}>
                        <Empty description="No operations found in this stage" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        {(!selectedFilterBatchId || !selectedFilterStageId) && <div style={{ color: '#999', marginTop: 10 }}>Please select a Batch and Stage</div>}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                        {operations.map(op => {
                            const isSelected = selectedIds.includes(op.operation_plan_id);
                            const isCurrent = op.operation_plan_id === currentOperationId;
                            return (
                                <div
                                    key={op.operation_plan_id}
                                    onClick={() => !isCurrent && toggleSelection(op.operation_plan_id)}
                                    className={`group transition-all duration-300`}
                                    style={{
                                        position: 'relative',
                                        padding: '16px',
                                        borderRadius: '16px',
                                        cursor: isCurrent ? 'not-allowed' : 'pointer',
                                        border: isSelected ? '2px solid #3B82F6' : '1px solid rgba(229, 231, 235, 0.8)',
                                        backgroundColor: isCurrent
                                            ? 'rgba(243, 244, 246, 0.6)'
                                            : isSelected ? 'rgba(239, 246, 255, 0.9)' : 'rgba(255, 255, 255, 0.8)',
                                        backdropFilter: 'blur(4px)',
                                        boxShadow: isCurrent
                                            ? 'none'
                                            : isSelected ? '0 10px 15px -3px rgba(59, 130, 246, 0.2)' : '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
                                        transform: isCurrent ? 'none' : isSelected ? 'scale(1.02)' : 'scale(1)',
                                        opacity: isCurrent ? 0.6 : 1,
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                        <div style={{ fontWeight: 600, color: '#1F2937', fontSize: '15px', lineHeight: '1.2' }} title={op.operation_name}>
                                            {op.operation_name}
                                        </div>
                                        {isSelected && <CheckCircleFilled style={{ color: '#3B82F6', fontSize: '20px' }} />}
                                        {isCurrent && <Tag style={{ margin: 0 }}>This Op</Tag>}
                                    </div>

                                    <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: 6 }}>
                                        {op.operation_code || '#NoCode'}
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
                                        <Tag color="geekblue" style={{ margin: 0, borderRadius: '6px', fontSize: '11px', border: 'none' }}>
                                            {op.batch_code}
                                        </Tag>
                                        <Tag style={{ margin: 0, borderRadius: '6px', fontSize: '11px', border: 'none', background: '#F3F4F6' }}>
                                            {op.stage_name}
                                        </Tag>
                                    </div>

                                    <div style={{ fontSize: '12px', color: isSelected ? '#3B82F6' : '#9CA3AF', fontWeight: 500 }}>
                                        {op.planned_start_datetime
                                            ? dayjs(op.planned_start_datetime).format('MMM D, HH:mm')
                                            : 'Unscheduled'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer Buttons - Manually apply bottom radius */}
            <div style={{
                padding: '16px 24px',
                borderTop: '1px solid rgba(229, 231, 235, 0.5)',
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                borderBottomLeftRadius: 24,
                borderBottomRightRadius: 24
            }}>
                <Button onClick={onCancel} size="large" style={{ borderRadius: '12px', padding: '0 32px' }}>
                    Cancel
                </Button>
                <Button
                    type="primary"
                    onClick={handleConfirm}
                    loading={submitting}
                    disabled={selectedIds.length === 0}
                    size="large"
                    style={{
                        borderRadius: '12px',
                        padding: '0 32px',
                        background: 'linear-gradient(to right, #3B82F6, #4F46E5)',
                        border: 'none',
                        boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
                    }}
                >
                    Add {selectedIds.length > 0 ? `${selectedIds.length} Operations` : ''}
                </Button>
            </div>
        </Modal>
    );
};

export default OperationSelectorModal;
