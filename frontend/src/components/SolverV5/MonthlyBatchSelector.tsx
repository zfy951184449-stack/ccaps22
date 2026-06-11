import React, { useState, useEffect } from 'react';
import { message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import OperationReviewModal from './OperationReviewModal';
import SolveProgressV5Modal from './SolveProgressV5Modal';
import SolveResultV5Page from './SolveResultV5Page';
import SolverConfigurationModalV5 from './SolverConfigurationModalV5';
import { DEFAULT_SOLVER_CONFIG_V5, SolverConfig } from '../../types/solverV5';
import SolveMonitorV5Drawer from './monitor/SolveMonitorV5Drawer';
import { useSolveStreamV5 } from './monitor/useSolveStreamV5';
import { stopRunV5 } from '../../services/schedulingV5Api';
import RunHistoryTab from './RunHistoryTab';
import IntervalSolveTab from './IntervalSolveTab';
import StandingDutyTab from './StandingDutyTab';
import {
    DepartmentFilterValue,
    filterBatchesByDepartment,
    getDefaultSelectedBatchIds,
    getVisibleSelectedBatchIds,
} from './batchSelection';
import {
    WxbBulkActionBar,
    WxbButton,
    WxbCard,
    WxbDataTable,
    WxbDatePicker,
    WxbFilterBar,
    WxbIcon,
    WxbPageHeader,
    WxbPageShell,
    WxbSelect,
    WxbTabs,
    WxbTag,
} from '../wxb-ui';
import type { WxbTagColor } from '../wxb-ui';

interface BatchPlan {
    id: number;
    batch_code: string;
    template_name: string; // Product in mockup
    team_id?: number;
    team_name?: string;
    team_code?: string;
    plan_status: string;
    planned_start_date: string;
    planned_end_date: string;
}

interface Team {
    id: number;
    teamName: string;
    teamCode: string;
}

const MonthlyBatchSelector: React.FC = () => {
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs()); // 默认当前月份
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<BatchPlan[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [modalVisible, setModalVisible] = useState(false);

    // Solver Configuration State
    const [configVisible, setConfigVisible] = useState(false);
    const [solverConfig, setSolverConfig] = useState<SolverConfig>(DEFAULT_SOLVER_CONFIG_V5);
    // 无解诊断「跳到配置」时需高亮的 config_keys
    const [configHighlightKeys, setConfigHighlightKeys] = useState<string[]>([]);

    // Department Filter State
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedDepartment, setSelectedDepartment] = useState<DepartmentFilterValue>('all');
    const [loadingTeams, setLoadingTeams] = useState(false);

    // Progress Modal State
    const [progressVis, setProgressVis] = useState(false);
    const [resultVis, setResultVis] = useState(false);
    const [monitorVis, setMonitorVis] = useState(false);
    const [currentRunId, setCurrentRunId] = useState<number | null>(null);

    // 页面级持有唯一 SSE 连接（单连接铁律）：进度小窗与监视器抽屉共享同一 state，
    // 只要进度小窗或监视器抽屉任一打开就保持连接。
    const { state: streamState, isTerminal: streamIsTerminal } = useSolveStreamV5(
        currentRunId,
        progressVis || monitorVis,
    );

    const fetchTeams = async () => {
        setLoadingTeams(true);
        try {
            const response = await fetch('/api/organization/solver-teams');
            const result = await response.json();
            if (Array.isArray(result)) {
                setTeams(result);
            }
        } catch (error) {
            console.error('Failed to fetch teams:', error);
        } finally {
            setLoadingTeams(false);
        }
    };

    useEffect(() => {
        fetchTeams();
    }, []);

    const fetchData = async (month: Dayjs) => {
        setLoading(true);
        try {
            const startDate = month.startOf('month').format('YYYY-MM-DD');
            const endDate = month.endOf('month').format('YYYY-MM-DD');

            const response = await fetch(`/api/batch-plans?start_date=${startDate}&end_date=${endDate}`);
            const result = await response.json();

            if (result.success && Array.isArray(result.data)) {
                setData(result.data);
            } else {
                // Fallback if API structure is different or returns error
                if (Array.isArray(result)) {
                    setData(result);
                } else {
                    console.error("Unexpected API response:", result);
                    message.error('加载批次数据失败');
                }
            }
        } catch (error) {
            console.error('Error fetching batches:', error);
            message.error('获取批次数据失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData(selectedMonth);
    }, [selectedMonth]);

    useEffect(() => {
        setSelectedRowKeys(getDefaultSelectedBatchIds(data, selectedDepartment));
    }, [data, selectedDepartment]);

    const handleMonthChange = (date: Dayjs | null) => {
        if (date) {
            setSelectedMonth(date);
        }
    };

    const handleDepartmentChange = (value: DepartmentFilterValue) => {
        setSelectedDepartment(value);
        // 自动同步到高级配置
        if (value === 'all') {
            setSolverConfig((prev) => ({ ...prev, team_ids: [] }));
        } else {
            setSolverConfig((prev) => ({
                ...prev,
                team_ids: [value],
            }));
        }
        // 自动勾选过滤后的 ACTIVATED 批次
        setSelectedRowKeys(getDefaultSelectedBatchIds(data, value));
    };

    // 高级配置关闭时反向同步部门筛选器
    const handleConfigClose = () => {
        setConfigVisible(false);
        setConfigHighlightKeys([]);
        const ids = solverConfig.team_ids || [];
        const nextDepartment = ids.length === 1 ? ids[0] : 'all';
        setSelectedDepartment(nextDepartment);
        setSelectedRowKeys(getDefaultSelectedBatchIds(data, nextDepartment));
    };

    // 无解诊断「跳到配置→」：关闭监视器/结果，打开配置弹窗并高亮对应开关
    const handleOpenConfigFromDiagnosis = (configKeys: string[]) => {
        setMonitorVis(false);
        setConfigHighlightKeys(configKeys);
        setConfigVisible(true);
    };

    // 停止求解（监视器抽屉头部「停止」按钮）
    const handleStopSolve = async () => {
        if (!currentRunId) return;
        try {
            await stopRunV5(currentRunId);
        } catch (e) {
            console.error('Stop failed', e);
        }
    };

    // 计算过滤后的数据
    const filteredData = Array.isArray(data)
        ? filterBatchesByDepartment(data, selectedDepartment)
        : [];
    const visibleSelectedRowKeys = getVisibleSelectedBatchIds(selectedRowKeys, filteredData);

    const handleScheduleSelected = () => {
        if (visibleSelectedRowKeys.length === 0) {
            message.warning('请至少选择一个批次进行排班。');
            return;
        }

        setModalVisible(true);
    };

    const handleResetSelection = () => {
        setSelectedRowKeys([]);
    };

    const onSelectChange = (newSelectedRowKeys: React.Key[]) => {
        setSelectedRowKeys(newSelectedRowKeys);
    };

    const handleSchedulingSuccess = (runId: number) => {
        setModalVisible(false); // Close review modal
        setCurrentRunId(runId);
        setProgressVis(true); // Open progress modal
    };

    const handleProgressClose = () => {
        setProgressVis(false);
        setCurrentRunId(null);
    };

    const rowSelection = {
        selectedRowKeys: visibleSelectedRowKeys,
        onChange: onSelectChange,
    };

    const getPlanStatusColor = (status?: string): WxbTagColor => {
        if (status === 'IN PROGRESS' || status === 'ACTIVATED') return 'blue';
        if (status === 'COMPLETED') return 'green';
        if (status === 'PENDING') return 'amber';
        return 'neutral';
    };

    const columns: ColumnsType<BatchPlan> = [
        {
            title: '批次编号',
            dataIndex: 'batch_code',
            key: 'batch_code',
            sorter: (a, b) => a.batch_code.localeCompare(b.batch_code),
        },
        {
            title: '产品',
            dataIndex: 'template_name',
            key: 'template_name',
            render: (text) => text || '-',
        },
        {
            title: '状态',
            dataIndex: 'plan_status',
            key: 'plan_status',
            render: (status) => {
                return <WxbTag color={getPlanStatusColor(status)}>{status || 'DRAFT'}</WxbTag>;
            },
        },
        {
            title: '部门',
            dataIndex: 'team_name',
            key: 'team_name',
            render: (text) => text || '-',
        },
        {
            title: '开始日期',
            dataIndex: 'planned_start_date',
            key: 'planned_start_date',
            sorter: (a, b) => dayjs(a.planned_start_date).unix() - dayjs(b.planned_start_date).unix(),
        },
        {
            title: '结束日期',
            dataIndex: 'planned_end_date',
            key: 'planned_end_date',
            sorter: (a, b) => dayjs(a.planned_end_date).unix() - dayjs(b.planned_end_date).unix(),
        },
    ];

    return (
        <WxbPageShell size="full" gap="md" className="solver-v5-shell">
            <WxbPageHeader
                eyebrow="Solver V5"
                title="排班调度"
                description="选择月度批次、区间求解或值班任务后启动 V5 自动排班，实时洞察求解过程。"
                actions={(
                    <WxbButton
                        type="button"
                        variant="secondary"
                        onClick={() => setConfigVisible(true)}
                    >
                        <WxbIcon name="cip-system" size={16} />
                        高级配置
                    </WxbButton>
                )}
            />

            <WxbCard className="solver-v5-card" noPadding>
            <WxbTabs
                defaultActiveKey="batches"
                items={[
                    {
                        key: 'batches',
                        label: (
                            <span className="solver-v5-tab-label">
                                <WxbIcon name="batch-record" size={15} />
                                批次列表
                            </span>
                        ),
                        children: (
                            <div className="solver-v5-tab-panel">
                                <WxbFilterBar
                                    resultCount={filteredData.length}
                                    resultLabel="个批次"
                                    filters={(
                                        <>
                                            <WxbSelect
                                                value={selectedDepartment}
                                                onChange={handleDepartmentChange}
                                                loading={loadingTeams}
                                                className="solver-v5-filter-select"
                                                options={[
                                                    { value: 'all', label: '所有部门' },
                                                    ...teams.map(team => ({
                                                        value: team.id,
                                                        label: team.teamName,
                                                    })),
                                                ]}
                                            />
                                            <WxbDatePicker
                                                picker="month"
                                                value={selectedMonth}
                                                onChange={handleMonthChange}
                                                allowClear={false}
                                                className="solver-v5-month-picker"
                                            />
                                        </>
                                    )}
                                />

                                <WxbDataTable<BatchPlan>
                                    rowSelection={rowSelection}
                                    columns={columns}
                                    dataSource={filteredData}
                                    rowKey="id"
                                    loading={loading}
                                    density="standard"
                                    emptyState={{ description: '当前月份没有可排班批次' }}
                                    pagination={{
                                        total: filteredData.length,
                                        pageSize: 10,
                                        showSizeChanger: true,
                                        showTotal: (total) => `共 ${total} 条`
                                    }}
                                />

                                <WxbBulkActionBar
                                    selectedCount={visibleSelectedRowKeys.length}
                                    onClear={handleResetSelection}
                                    clearLabel="重置选择"
                                    summary={(
                                        <span className="solver-v5-selection-text">
                                            已选 <strong>{visibleSelectedRowKeys.length}</strong> / 共 {filteredData.length} 个批次
                                        </span>
                                    )}
                                    actions={[
                                        {
                                            key: 'schedule',
                                            label: '排班选中批次',
                                            variant: 'primary',
                                            onClick: handleScheduleSelected,
                                        },
                                    ]}
                                />
                                {visibleSelectedRowKeys.length === 0 && (
                                    <div className="solver-v5-action-footer">
                                        <span className="solver-v5-selection-text">
                                            已选 <strong>0</strong> / 共 {filteredData.length} 个批次
                                        </span>
                                        <WxbButton type="button" variant="primary" onClick={handleScheduleSelected}>
                                            排班选中批次
                                        </WxbButton>
                                    </div>
                                )}
                            </div>
                        ),
                    },
                    {
                        key: 'interval',
                        label: (
                            <span className="solver-v5-tab-label">
                                <WxbIcon name="hold-time" size={15} />
                                区间求解
                            </span>
                        ),
                        children: <IntervalSolveTab />,
                    },
                    {
                        key: 'duties',
                        label: (
                            <span className="solver-v5-tab-label">
                                <WxbIcon name="kanban" size={15} />
                                值班任务
                            </span>
                        ),
                        children: <StandingDutyTab />,
                    },
                    {
                        key: 'history',
                        label: (
                            <span className="solver-v5-tab-label">
                                <WxbIcon name="oos-clock" size={15} />
                                历史记录
                            </span>
                        ),
                        children: <RunHistoryTab />,
                    },
                ]}
            />
            </WxbCard>

            <OperationReviewModal
                visible={modalVisible}
                onCancel={() => setModalVisible(false)}
                batchIds={visibleSelectedRowKeys as number[]}
                month={selectedMonth}
                onSuccess={handleSchedulingSuccess}
                solverConfig={solverConfig}
            />

            <SolverConfigurationModalV5
                visible={configVisible}
                config={solverConfig}
                onConfigChange={setSolverConfig}
                onClose={handleConfigClose}
                highlightKeys={configHighlightKeys}
            />

            <SolveProgressV5Modal
                visible={progressVis}
                runId={currentRunId}
                streamState={streamState}
                streamIsTerminal={streamIsTerminal}
                onCancel={handleProgressClose}
                onViewResults={(rid) => {
                    setProgressVis(false);
                    setResultVis(true);
                }}
                onOpenMonitor={() => setMonitorVis(true)}
            />

            <SolveMonitorV5Drawer
                visible={monitorVis}
                state={streamState}
                runId={currentRunId}
                isTerminal={streamIsTerminal}
                onClose={() => setMonitorVis(false)}
                onStop={handleStopSolve}
                onOpenConfig={handleOpenConfigFromDiagnosis}
            />

            <SolveResultV5Page
                visible={resultVis}
                runId={currentRunId}
                onClose={() => setResultVis(false)}
            />
        </WxbPageShell>
    );
};

export default MonthlyBatchSelector;
