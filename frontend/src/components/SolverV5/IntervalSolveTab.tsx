import React, { useState, useEffect } from 'react';
import { message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import SolveProgressV5Modal from './SolveProgressV5Modal';
import SolveResultV5Page from './SolveResultV5Page';
import SolverConfigurationModalV5 from './SolverConfigurationModalV5';
import SolveMonitorV5Drawer from './monitor/SolveMonitorV5Drawer';
import { useSolveStreamV5 } from './monitor/useSolveStreamV5';
import { stopRunV5 } from '../../services/schedulingV5Api';
import { DEFAULT_SOLVER_CONFIG_V5, SolverConfig } from '../../types/solverV5';
import {
    DepartmentFilterValue,
    filterBatchesByDepartment,
    getDefaultSelectedBatchIds,
    getVisibleSelectedBatchIds,
} from './batchSelection';
import {
    WxbButton,
    WxbDataTable,
    WxbDatePicker,
    WxbFilterBar,
    WxbIcon,
    WxbRangePicker,
    WxbSelect,
    WxbTag,
} from '../wxb-ui';
import type { WxbTagColor } from '../wxb-ui';

interface BatchPlan {
    id: number;
    batch_code: string;
    template_name: string;
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

const IntervalSolveTab: React.FC = () => {
    // Month and date selection
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
    const [solveRange, setSolveRange] = useState<[Dayjs, Dayjs] | null>(null);
    
    // Data
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<BatchPlan[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    // Department Filter
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedDepartment, setSelectedDepartment] = useState<DepartmentFilterValue>('all');
    const [loadingTeams, setLoadingTeams] = useState(false);

    // Solver Config
    const [configVisible, setConfigVisible] = useState(false);
    const [solverConfig, setSolverConfig] = useState<SolverConfig>(DEFAULT_SOLVER_CONFIG_V5);

    // Progress Modal State
    const [progressVis, setProgressVis] = useState(false);
    const [resultVis, setResultVis] = useState(false);
    const [monitorVis, setMonitorVis] = useState(false);
    const [currentRunId, setCurrentRunId] = useState<number | null>(null);
    const [solving, setSolving] = useState(false);

    // 无解诊断「跳到配置」时需高亮的 config_keys
    const [configHighlightKeys, setConfigHighlightKeys] = useState<string[]>([]);

    // 页面级持有唯一 SSE 连接（单连接铁律）：进度小窗与监视器抽屉共享同一 state
    const { state: streamState, isTerminal: streamIsTerminal } = useSolveStreamV5(
        currentRunId,
        progressVis || monitorVis,
    );

    // Precheck state
    const [precheckLoading, setPrecheckLoading] = useState(false);
    const [precheckResults, setPrecheckResults] = useState<{
        status: 'PASS' | 'WARNING' | 'ERROR';
        checks: { name: string; status: string; message: string }[];
    } | null>(null);

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
            } else if (Array.isArray(result)) {
                setData(result);
            } else {
                message.error('加载批次数据失败');
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
        setSolveRange(null);
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
        if (value === 'all') {
            setSolverConfig((prev) => ({ ...prev, team_ids: [] }));
        } else {
            setSolverConfig((prev) => ({
                ...prev,
                team_ids: [value],
            }));
        }
        setSelectedRowKeys(getDefaultSelectedBatchIds(data, value));
    };

    const filteredData = Array.isArray(data)
        ? filterBatchesByDepartment(data, selectedDepartment)
        : [];
    const visibleSelectedRowKeys = getVisibleSelectedBatchIds(selectedRowKeys, filteredData);

    const getPlanStatusColor = (status?: string): WxbTagColor => {
        if (status === 'IN PROGRESS' || status === 'ACTIVATED') return 'blue';
        if (status === 'COMPLETED') return 'green';
        if (status === 'PENDING') return 'amber';
        return 'neutral';
    };

    const handleIntervalSolve = async () => {
        if (visibleSelectedRowKeys.length === 0) {
            message.warning('请至少选择一个批次进行排班。');
            return;
        }

        if (!solveRange || !solveRange[0] || !solveRange[1]) {
            message.warning('请选择求解区间（开始日期 ~ 结束日期）。');
            return;
        }

        const monthStart = selectedMonth.startOf('month').format('YYYY-MM-DD');
        const monthEnd = selectedMonth.endOf('month').format('YYYY-MM-DD');
        const solveStart = solveRange[0].format('YYYY-MM-DD');
        const solveEnd = solveRange[1].format('YYYY-MM-DD');

        if (solveStart < monthStart || solveEnd > monthEnd) {
            message.error('求解区间必须在所选月份范围内。');
            return;
        }

        setSolving(true);
        try {
            const response = await fetch('/api/v5/scheduling/solve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    batch_ids: visibleSelectedRowKeys,
                    start_date: monthStart,
                    end_date: monthEnd,
                    solve_start_date: solveStart,
                    solve_end_date: solveEnd,
                    config: { ...solverConfig },
                }),
            });

            const result = await response.json();
            if (result.success) {
                message.success(`区间求解已启动：${solveStart} ~ ${solveEnd}`);
                const runId = result.data?.runId || result.runId;
                if (runId) {
                    setCurrentRunId(runId);
                    setProgressVis(true);
                }
            } else {
                message.error('启动区间求解失败：' + result.error);
            }
        } catch (error) {
            console.error('Error starting interval solve:', error);
            message.error('启动区间求解出错');
        } finally {
            setSolving(false);
        }
    };

    // 无解诊断「跳到配置→」：关闭监视器/进度窗，打开配置弹窗并高亮对应开关
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

    const handlePrecheck = async () => {
        if (visibleSelectedRowKeys.length === 0 || !solveRange) return;
        setPrecheckLoading(true);
        try {
            const monthStart = selectedMonth.startOf('month').format('YYYY-MM-DD');
            const monthEnd = selectedMonth.endOf('month').format('YYYY-MM-DD');
            const response = await fetch('/api/v5/scheduling/precheck', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    batch_ids: visibleSelectedRowKeys,
                    start_date: monthStart,
                    end_date: monthEnd,
                    config: { ...solverConfig },
                }),
            });
            const result = await response.json();
            if (result.success) {
                setPrecheckResults(result.data);
                const status = result.data?.status;
                if (status === 'PASS') message.success('预检通过！');
                else if (status === 'WARNING') message.warning('预检有警告');
                else message.error('预检发现错误');
            } else {
                message.error('预检失败');
            }
        } catch (error) {
            message.error('预检请求失败');
        } finally {
            setPrecheckLoading(false);
        }
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
        <div className="solver-v5-tab-panel">
            <div className="solver-v5-info-panel">
                <WxbIcon name="hold-time" size={18} />
                <div>
                    <strong>区间求解模式</strong>
                    <p>仅重新优化指定日期范围内的排班。区间外的已有排班数据会被冻结，整月约束仍然参与校验。</p>
                </div>
            </div>

            <WxbFilterBar
                resultCount={filteredData.length}
                resultLabel="个批次"
                filters={(
                    <>
                        <WxbDatePicker
                            picker="month"
                            value={selectedMonth}
                            onChange={handleMonthChange}
                            allowClear={false}
                            className="solver-v5-month-picker"
                        />
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
                        <WxbRangePicker
                            value={solveRange}
                            onChange={(dates) => setSolveRange(dates as [Dayjs, Dayjs] | null)}
                            disabledDate={(current) => {
                                return current < selectedMonth.startOf('month') || current > selectedMonth.endOf('month');
                            }}
                            placeholder={['区间开始', '区间结束']}
                            className="solver-v5-range-picker"
                        />
                    </>
                )}
                actions={(
                    <WxbButton type="button" variant="secondary" size="sm" onClick={() => setConfigVisible(true)}>
                        <WxbIcon name="cip-system" size={14} />
                        配置
                    </WxbButton>
                )}
            />

            {solveRange && solveRange[0] && solveRange[1] && (
                <div className="solver-v5-range-summary">
                    <WxbIcon name="hold-time" size={18} />
                    <div>
                        <strong>求解区间: {solveRange[0].format('MM-DD')} ~ {solveRange[1].format('MM-DD')}</strong>
                        <span>
                            冻结区域:
                            {solveRange[0].isAfter(selectedMonth.startOf('month'))
                                ? ` ${selectedMonth.startOf('month').format('MM-DD')} ~ ${solveRange[0].subtract(1, 'day').format('MM-DD')}`
                                : ' 无 (左侧)'
                            }
                            {solveRange[1].isBefore(selectedMonth.endOf('month'))
                                ? ` | ${solveRange[1].add(1, 'day').format('MM-DD')} ~ ${selectedMonth.endOf('month').format('MM-DD')}`
                                : ' | 无 (右侧)'
                            }
                        </span>
                    </div>
                </div>
            )}

            <WxbDataTable<BatchPlan>
                rowSelection={{
                    selectedRowKeys: visibleSelectedRowKeys,
                    onChange: (keys) => setSelectedRowKeys(keys),
                }}
                columns={columns}
                dataSource={filteredData}
                rowKey="id"
                loading={loading}
                density="compact"
                emptyState={{ description: '当前筛选条件下没有可求解批次' }}
                pagination={{
                    total: filteredData.length,
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`
                }}
                size="small"
            />

            <div className="solver-v5-action-footer">
                <span className="solver-v5-selection-text">
                    已选 <strong>{visibleSelectedRowKeys.length}</strong> / 共 {filteredData.length} 个批次
                </span>
                <div className="solver-v5-action-group">
                    <WxbButton
                        type="button"
                        variant="secondary"
                        onClick={handlePrecheck}
                        disabled={!solveRange || visibleSelectedRowKeys.length === 0 || precheckLoading}
                        aria-busy={precheckLoading || undefined}
                    >
                        {precheckLoading ? '预检中...' : '预检'}
                    </WxbButton>
                    <WxbButton
                        type="button"
                        variant="primary"
                        onClick={handleIntervalSolve}
                        disabled={!solveRange || visibleSelectedRowKeys.length === 0 || solving}
                        aria-busy={solving || undefined}
                    >
                        <WxbIcon name="hold-time" size={15} />
                        {solving ? '启动中...' : '启动区间求解'}
                    </WxbButton>
                </div>
            </div>

            {precheckResults && (
                <div
                    className={`solver-v5-precheck-summary solver-v5-precheck-${precheckResults.status.toLowerCase()}`}
                    role="status"
                >
                    <strong>
                        预检{precheckResults.status === 'PASS' ? '通过' : precheckResults.status === 'WARNING' ? '有警告' : '有错误'}
                    </strong>
                    <div>
                        {precheckResults.checks.filter(c => c.status !== 'PASS').map((c, i) => (
                            <p key={i}>{c.status === 'ERROR' ? '错误' : '警告'}：{c.message}</p>
                        ))}
                        {precheckResults.checks.every(c => c.status === 'PASS') && (
                            <p>所有 {precheckResults.checks.length} 项检查均通过</p>
                        )}
                    </div>
                    <WxbButton type="button" variant="ghost" size="sm" onClick={() => setPrecheckResults(null)}>
                        关闭
                    </WxbButton>
                </div>
            )}

            {/* Modals */}
            <SolverConfigurationModalV5
                visible={configVisible}
                config={solverConfig}
                onConfigChange={setSolverConfig}
                onClose={() => { setConfigVisible(false); setConfigHighlightKeys([]); }}
                highlightKeys={configHighlightKeys}
            />

            <SolveProgressV5Modal
                visible={progressVis}
                runId={currentRunId}
                streamState={streamState}
                streamIsTerminal={streamIsTerminal}
                onCancel={() => { setProgressVis(false); setCurrentRunId(null); }}
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
        </div>
    );
};

export default IntervalSolveTab;
