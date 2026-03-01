import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { GanttProvider, useGantt } from './GanttContext';
import GanttSidebar from './GanttSidebar';
import GanttTimeline from './GanttTimeline';
import GanttMinimap from './GanttMinimap';
import EditOperationModal from './EditOperationModal';
import { GanttBatch, GanttDependency, GanttShareGroup, OffScreenOperation, GanttOperation, LayoutMode } from './types';
import { calculateRowLayout } from './rowUtils';
import axios from 'axios';
import dayjs from 'dayjs';
import { DatePicker, Tooltip, Slider, message, Tag } from 'antd';
import { ShareAltOutlined, ZoomInOutlined, ZoomOutOutlined, ArrowLeftOutlined, LeftOutlined, RightOutlined, PlusCircleOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import './BatchGanttV4.css';

const { RangePicker } = DatePicker;

interface BatchGanttV4ContentProps {
    filteredBatchIds?: number[];
    onCreateBatch?: () => void;
}

const BatchGanttV4Content: React.FC<BatchGanttV4ContentProps> = ({ filteredBatchIds, onCreateBatch }) => {
    const {
        startDate,
        endDate,
        viewMode,
        setLayoutMode,
        layoutMode,
        setStartDate,
        setEndDate,
        showShareGroupLines,
        setShowShareGroupLines,
        zoomLevel,
        setZoomLevel,
        exitSingleDayMode,
        navigateSingleDay,
        expandAll,
        expandedBatches,
        expandedStages,
    } = useGantt();
    const [batches, setBatches] = useState<GanttBatch[]>([]);
    const [dependencies, setDependencies] = useState<GanttDependency[]>([]);
    const [shareGroups, setShareGroups] = useState<GanttShareGroup[]>([]);
    const [offScreenOps, setOffScreenOps] = useState<OffScreenOperation[]>([]);
    const [loading, setLoading] = useState(false);

    // Editing Operation State
    const [editingOperation, setEditingOperation] = useState<GanttOperation | null>(null);

    // 快捷创建共享组模式状态
    const [isShareGroupMode, setIsShareGroupMode] = useState(false);
    const [selectedOperationIds, setSelectedOperationIds] = useState<number[]>([]);

    const handleEditOperation = useCallback((operation: GanttOperation) => {
        setEditingOperation(operation);
    }, []);

    const handleEditCancel = useCallback(() => {
        setEditingOperation(null);
    }, []);

    const handleSaveOperation = async (id: number, values: any) => {
        try {
            await axios.put(`/api/v5/gantt/operations/${id}`, values);
            message.success('操作更新成功');
            // Refresh data
            fetchData();
        } catch (error) {
            console.error('Failed to update operation:', error);
            message.error('更新失败，请重试');
        }
    };

    const handleDeleteOperation = async (id: number) => {
        try {
            await axios.delete(`/api/v5/gantt/operations/${id}`);
            message.success('操作删除成功');
            setEditingOperation(null);
            // Refresh data
            fetchData();
        } catch (error) {
            console.error('Failed to delete operation:', error);
            message.error('删除失败，请重试');
        }
    };

    // 快捷创建共享组处理函数
    const handleEnterShareGroupMode = useCallback(() => {
        setIsShareGroupMode(true);
        setSelectedOperationIds([]);
    }, []);

    const handleCancelShareGroup = useCallback(() => {
        setIsShareGroupMode(false);
        setSelectedOperationIds([]);
    }, []);

    const handleOperationCheck = useCallback((operationId: number, checked: boolean) => {
        setSelectedOperationIds(prev =>
            checked
                ? [...prev, operationId]
                : prev.filter(id => id !== operationId)
        );
    }, []);

    // Full Screen State
    const [isFullScreen, setIsFullScreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Scroll Sync Ref
    const sidebarBodyRef = useRef<HTMLDivElement>(null);

    // Minimap Visibility State
    const [minimapVisible, setMinimapVisible] = useState(false);
    const minimapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const skipNextFetchRef = useRef(false);
    const currentScrollLeftRef = useRef(0);
    const currentVisibleDayIndexRef = useRef(0);
    const [minimapDate, setMinimapDate] = useState(startDate);
    const filterBatchIdsKey = useMemo(() => (filteredBatchIds ? filteredBatchIds.join(',') : ''), [filteredBatchIds]);
    const hasExplicitBatchFilter = filteredBatchIds !== undefined;
    const rowHeight = 32;
    const rowLayout = useMemo(
        () => calculateRowLayout(batches, expandedBatches, expandedStages, layoutMode),
        [batches, expandedBatches, expandedStages, layoutMode]
    );

    const handleScrollInteraction = useCallback(() => {
        setMinimapVisible(true);
        if (minimapTimeoutRef.current) {
            clearTimeout(minimapTimeoutRef.current);
        }
        minimapTimeoutRef.current = setTimeout(() => {
            setMinimapVisible(false);
        }, 2000);
    }, []);

    const handleHorizontalScroll = useCallback((scrollLeft: number) => {
        currentScrollLeftRef.current = scrollLeft;
        const nextDayIndex = Math.max(0, Math.floor(scrollLeft / Math.max(zoomLevel, 1)));
        if (nextDayIndex !== currentVisibleDayIndexRef.current) {
            currentVisibleDayIndexRef.current = nextDayIndex;
            setMinimapDate(startDate.add(nextDayIndex, 'day'));
        }
    }, [startDate, zoomLevel]);

    const handleTimelineScroll = useCallback((scrollTop: number) => {
        if (sidebarBodyRef.current) {
            sidebarBodyRef.current.scrollTop = scrollTop;
        }
        // Also trigger visibility on vertical scroll from sidebar sync (if needed, but mainly Timeline drives it)
    }, []);

    useEffect(() => {
        const handleFullScreenChange = () => {
            setIsFullScreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullScreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullScreenChange);
        };
    }, []);

    useEffect(() => {
        currentVisibleDayIndexRef.current = Math.max(0, Math.floor(currentScrollLeftRef.current / Math.max(zoomLevel, 1)));
        setMinimapDate(startDate.add(currentVisibleDayIndexRef.current, 'day'));
    }, [startDate, zoomLevel]);

    useEffect(() => {
        return () => {
            if (minimapTimeoutRef.current) {
                clearTimeout(minimapTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (layoutMode !== 'standard' && isShareGroupMode) {
            handleCancelShareGroup();
        }
    }, [layoutMode, isShareGroupMode, handleCancelShareGroup]);

    const handleLayoutModeChange = useCallback((mode: LayoutMode) => {
        if (mode !== 'standard') {
            setIsShareGroupMode(false);
            setSelectedOperationIds([]);
        }
        setLayoutMode(mode);
    }, [setLayoutMode]);

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    const [hasAutoFit, setHasAutoFit] = useState(false);

    const fetchData = useCallback(async () => {
        if (hasExplicitBatchFilter && filteredBatchIds.length === 0) {
            setBatches([]);
            setDependencies([]);
            setShareGroups([]);
            setOffScreenOps([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // On initial auto-fit, we look back further (e.g., 6 months) to find the true "First Project"
            // efficiently, then snap the view to it.
            const fetchStart = !hasAutoFit ? dayjs().subtract(6, 'month') : startDate;
            // Ensure we cover enough future for initial load too
            const fetchEnd = !hasAutoFit ? dayjs().add(6, 'month') : endDate;
            const hierarchyParams: Record<string, string> = {
                start_date: fetchStart.format('YYYY-MM-DD HH:mm:ss'),
                end_date: fetchEnd.format('YYYY-MM-DD HH:mm:ss'),
                status: 'DRAFT,ACTIVATED,PLANNED'
            };

            if (filterBatchIdsKey) {
                hierarchyParams.batch_ids = filterBatchIdsKey;
            }

            const res = await axios.get('/api/v5/gantt/hierarchy', {
                params: hierarchyParams
            });

            // V2: API now returns { batches, offScreenOperations }
            const { batches: fetchedBatches, offScreenOperations: fetchedOffScreen } = res.data;
            const fetchedData: GanttBatch[] = fetchedBatches || res.data; // Fallback for old format

            // Auto-Fit Logic: Snap startDate to the earliest batch AND endDate to the latest batch
            if (!hasAutoFit && fetchedData.length > 0) {
                // Find global min start and max end date in the fetched set
                let minDate = dayjs(fetchedData[0].startDate);
                let maxDate = dayjs(fetchedData[0].endDate);

                fetchedData.forEach(b => {
                    const bStart = dayjs(b.startDate);
                    if (bStart.isBefore(minDate)) minDate = bStart;

                    const bEnd = dayjs(b.endDate);
                    if (bEnd.isAfter(maxDate)) maxDate = bEnd;
                });

                // Snap view. This will likely trigger a re-fetch via useEffect dependency.
                skipNextFetchRef.current = true;
                setHasAutoFit(true);
                setStartDate(minDate.startOf('day'));
                // Option B: Adaptive End Date + 1 week buffer
                setEndDate(maxDate.add(1, 'week').endOf('week'));

                // Apply filter from parent component if provided
                const displayBatches = hasExplicitBatchFilter
                    ? fetchedData.filter(b => filteredBatchIds.includes(b.id))
                    : fetchedData;

                // We update local batches to show something immediately, though re-fetch will overwrite
                setBatches(displayBatches);
                setOffScreenOps(fetchedOffScreen || []);
            } else {
                // Apply filter from parent component if provided
                const displayBatches = hasExplicitBatchFilter
                    ? fetchedData.filter(b => filteredBatchIds.includes(b.id))
                    : fetchedData;

                setBatches(displayBatches);
                setOffScreenOps(fetchedOffScreen || []);
            }

            // P1 Fix: Force expand all in Single Day Mode to ensure visibility
            if (viewMode === 'day') {
                expandAll(fetchedData);
            }

            // 获取共享组数据
            if (fetchedData.length > 0) {
                const batchIds = fetchedData.map(b => b.id);
                const batchIdsParam = batchIds.join(',');
                try {
                    const [sgRes, depRes] = await Promise.all([
                        axios.get('/api/share-groups/batches/gantt', {
                            params: { batch_ids: batchIdsParam }
                        }),
                        axios.get('/api/v5/gantt/dependencies', {
                            params: {
                                start_date: fetchStart.format('YYYY-MM-DD'),
                                end_date: fetchEnd.format('YYYY-MM-DD'),
                                batch_ids: batchIdsParam
                            }
                        })
                    ]);
                    setShareGroups(sgRes.data);
                    setDependencies(depRes.data);
                } catch (sgError) {
                    console.error('Failed to fetch auxiliary data (share groups or dependencies)', sgError);
                    // Non-critical, just empty them
                    setShareGroups([]);
                    // Keep dependencies empty if failed
                    setDependencies([]);
                }
            } else {
                setShareGroups([]);
                setDependencies([]);
            }
        } catch (error) {
            console.error('Failed to fetch gantt data', error);
        } finally {
            setLoading(false);
        }
    }, [endDate, expandAll, filterBatchIdsKey, filteredBatchIds, hasAutoFit, hasExplicitBatchFilter, setEndDate, setStartDate, startDate, viewMode]);

    useEffect(() => {
        if (skipNextFetchRef.current) {
            skipNextFetchRef.current = false;
            return;
        }
        fetchData();
    }, [fetchData]);

    const handleConfirmShareGroup = useCallback(async () => {
        if (selectedOperationIds.length < 2) {
            message.warning('请至少选择2个操作');
            return;
        }

        try {
            const groupName = `共享组-${shareGroups.length + 1}`;

            await axios.post('/api/share-groups/batch-operations/bulk', {
                operation_ids: selectedOperationIds,
                group_name: groupName,
                share_mode: 'SAME_TEAM'
            });

            message.success(`${groupName} 创建成功`);
            handleCancelShareGroup();
            await fetchData();
        } catch (error) {
            console.error('创建共享组失败:', error);
            message.error('创建共享组失败');
        }
    }, [selectedOperationIds, shareGroups.length, handleCancelShareGroup, fetchData]);

    return (
        <div
            ref={containerRef}
            className={`gantt-flex-col gantt-h-full gantt-w-full gantt-overflow-hidden gantt-relative ${isFullScreen ? 'gantt-fullscreen' : ''}`}
            style={{
                backgroundColor: '#fff',
                borderRadius: isFullScreen ? 0 : 16,
                border: isFullScreen ? 'none' : '1px solid #F3F4F6',
                boxShadow: isFullScreen ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
            }}
        >
            {/* Toolbar Area */}
            <div className="gantt-toolbar">
                <div className="gantt-btn-group">
                    {viewMode === 'day' && (
                        <div style={{ display: 'flex', alignItems: 'center', marginRight: 12 }}>
                            <button
                                onClick={exitSingleDayMode}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 12px',
                                    borderRadius: 8,
                                    border: 'none',
                                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                                    color: '#007AFF',
                                    fontSize: 13,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    marginRight: 8,
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0, 122, 255, 0.2)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(0, 122, 255, 0.1)'}
                            >
                                <ArrowLeftOutlined style={{ fontSize: 12 }} />
                                Exit Day View
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, padding: 2 }}>
                                <button
                                    onClick={() => navigateSingleDay('prev', batches)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 28,
                                        height: 28,
                                        borderRadius: 6,
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#374151',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fff'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    title="Previous Day"
                                >
                                    <LeftOutlined style={{ fontSize: 12 }} />
                                </button>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#1F2937', padding: '0 8px', minWidth: 100, textAlign: 'center' }}>
                                    {startDate.format('MMM D, YYYY')}
                                </div>
                                <button
                                    onClick={() => navigateSingleDay('next', batches)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 28,
                                        height: 28,
                                        borderRadius: 6,
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#374151',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fff'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    title="Next Day"
                                >
                                    <RightOutlined style={{ fontSize: 12 }} />
                                </button>
                            </div>
                        </div>
                    )}
                    <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1F2937' }}>Batch Schedule</h2>
                    <span style={{ color: '#D1D5DB', padding: '0 8px' }}>|</span>
                    <Tooltip title="密集模式适合快速浏览整体排程">
                        <button
                            onClick={() => handleLayoutModeChange('dense')}
                            className={`gantt-btn-mode ${layoutMode === 'dense' ? 'gantt-btn-mode-active' : ''}`}
                        >
                            密集
                        </button>
                    </Tooltip>
                    <Tooltip title="明细模式适合逐操作检查与共享组选择">
                        <button
                            onClick={() => handleLayoutModeChange('standard')}
                            className={`gantt-btn-mode ${layoutMode === 'standard' ? 'gantt-btn-mode-active' : ''}`}
                        >
                            明细
                        </button>
                    </Tooltip>
                    <button
                        onClick={() => handleLayoutModeChange('compact')}
                        className={`gantt-btn-mode ${layoutMode === 'compact' ? 'gantt-btn-mode-active' : ''}`}
                    >
                        概览
                    </button>
                    <Tooltip title={showShareGroupLines ? '隐藏共享组连接线' : '显示共享组连接线'}>
                        <button
                            onClick={() => setShowShareGroupLines(!showShareGroupLines)}
                            className={`gantt-btn-mode ${showShareGroupLines ? 'gantt-btn-mode-active' : ''}`}
                        >
                            <ShareAltOutlined style={{ fontSize: 14 }} />
                        </button>
                    </Tooltip>

                    {/* 快捷创建共享组（仅 Standard 模式） */}
                    {layoutMode === 'standard' && (
                        !isShareGroupMode ? (
                            <Tooltip title="快捷创建共享组">
                                <button
                                    onClick={handleEnterShareGroupMode}
                                    className="gantt-btn-mode"
                                    style={{ borderColor: '#52c41a', color: '#52c41a' }}
                                >
                                    <PlusCircleOutlined style={{ fontSize: 14, marginRight: 4 }} />
                                    添加共享组
                                </button>
                            </Tooltip>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Tag color="processing" style={{ margin: 0, padding: '4px 8px' }}>选择操作加入共享组</Tag>
                                <button
                                    onClick={handleConfirmShareGroup}
                                    disabled={selectedOperationIds.length < 2}
                                    className="gantt-btn-mode"
                                    style={{
                                        backgroundColor: selectedOperationIds.length >= 2 ? '#1890ff' : '#d9d9d9',
                                        color: selectedOperationIds.length >= 2 ? '#fff' : '#999',
                                        border: 'none'
                                    }}
                                >
                                    <CheckOutlined style={{ fontSize: 12, marginRight: 4 }} />
                                    确认创建 ({selectedOperationIds.length})
                                </button>
                                <button
                                    onClick={handleCancelShareGroup}
                                    className="gantt-btn-mode"
                                >
                                    <CloseOutlined style={{ fontSize: 12, marginRight: 4 }} />
                                    取消
                                </button>
                            </div>
                        )
                    )}
                </div>

                {/* Zoom Controls (Middle) */}
                <div className="gantt-btn-group" style={{ flex: 1, maxWidth: 300, minWidth: 200, padding: '0 12px' }}>
                    <ZoomOutOutlined style={{ color: '#9CA3AF', fontSize: 14 }} />
                    <Slider
                        min={viewMode === 'day' ? 720 : 60}
                        max={viewMode === 'day' ? 2880 : 600}
                        value={zoomLevel}
                        onChange={setZoomLevel}
                        step={1}
                        tooltip={{ formatter: (val) => `${val}%` }}
                        style={{ flex: 1, margin: '0 12px' }}
                    />
                    <ZoomInOutlined style={{ color: '#9CA3AF', fontSize: 14 }} />
                </div>

                <div className="gantt-btn-group">
                    <button className="gantt-btn-mode" onClick={toggleFullScreen} title={isFullScreen ? "Exit Full Screen" : "Full Screen"}>
                        {isFullScreen ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        )}
                    </button>
                    <button className="gantt-btn-mode" title="Refresh" onClick={fetchData}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                    <div style={{ height: 32, width: 1, backgroundColor: '#E5E5E5', margin: '0 8px' }}></div>
                    <button
                        onClick={onCreateBatch}
                        style={{
                        padding: '6px 16px',
                        backgroundColor: '#000',
                        color: 'white',
                        fontSize: 14,
                        fontWeight: 500,
                        borderRadius: 8,
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        border: 'none',
                        cursor: 'pointer'
                    }}
                    >
                        新建批次
                    </button>
                    <div style={{ marginRight: 12 }}>
                        <RangePicker
                            value={[startDate, endDate]}
                            onChange={(dates) => {
                                if (dates && dates[0] && dates[1]) {
                                    setStartDate(dates[0]);
                                    setEndDate(dates[1]);
                                }
                            }}
                            allowClear={false}
                            bordered={false}
                            style={{ backgroundColor: '#F9FAFB', borderRadius: 8, padding: '4px 12px' }}
                        />
                    </div>
                </div>
            </div>

            {/* Main Content Split View */}
            <div className="gantt-flex-row gantt-overflow-hidden gantt-relative" style={{ flex: 1 }}>
                {loading && (
                    <div className="gantt-relative" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', borderBottom: '2px solid #000', animation: 'spin 1s linear infinite' }}></div>
                        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    </div>
                )}

                <GanttSidebar
                    ref={sidebarBodyRef}
                    data={rowLayout.rows}
                    rowLayout={rowLayout}
                    rowHeight={rowHeight}
                    onOperationDoubleClick={handleEditOperation}
                    isShareGroupMode={isShareGroupMode}
                    selectedOperationIds={selectedOperationIds}
                    onOperationCheck={handleOperationCheck}
                />
                <GanttTimeline
                    batches={batches}
                    rows={rowLayout.rows}
                    rowLayout={rowLayout}
                    rowHeight={rowHeight}
                    shareGroups={shareGroups}
                    dependencies={dependencies}
                    offScreenOperations={offScreenOps}
                    onVerticalScroll={handleTimelineScroll}
                    onScrollInteraction={handleScrollInteraction}
                    onHorizontalScroll={handleHorizontalScroll}
                    onOperationDoubleClick={handleEditOperation}
                />

                {/* MiniMap integrated here */}
                <GanttMinimap
                    data={batches}
                    visible={minimapVisible}
                    currentDate={minimapDate}
                    onMouseEnter={() => {
                        if (minimapTimeoutRef.current) clearTimeout(minimapTimeoutRef.current);
                        setMinimapVisible(true);
                    }}
                    onMouseLeave={() => {
                        minimapTimeoutRef.current = setTimeout(() => {
                            setMinimapVisible(false);
                        }, 2000);
                    }}
                />
            </div>

            {/* Edit Modal */}
            <EditOperationModal
                visible={!!editingOperation}
                operation={editingOperation}
                onClose={handleEditCancel}
                onSave={handleSaveOperation}
                onDelete={handleDeleteOperation}
                getContainer={() => containerRef.current || document.body}
            />
        </div>
    );
};

interface BatchGanttV4Props {
    filteredBatchIds?: number[];
    onCreateBatch?: () => void;
}

const BatchGanttV4: React.FC<BatchGanttV4Props> = ({ filteredBatchIds, onCreateBatch }) => {
    return (
        <GanttProvider>
            <BatchGanttV4Content filteredBatchIds={filteredBatchIds} onCreateBatch={onCreateBatch} />
        </GanttProvider>
    );
};

export default BatchGanttV4;
