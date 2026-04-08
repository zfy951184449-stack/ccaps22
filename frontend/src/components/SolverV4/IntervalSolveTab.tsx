import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Table, Tag, Typography, Space, Button, message, Select, Alert, Tooltip } from 'antd';
import { ThunderboltOutlined, InfoCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import SolveProgressV4Modal from './SolveProgressV4Modal';
import SolveResultV4Page from './SolveResultV4Page';
import SolverConfigurationModal, { DEFAULT_SOLVER_CONFIG, SolverConfig } from './SolverConfigurationModal';
import { SettingOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

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
    const [selectedDepartment, setSelectedDepartment] = useState<'all' | string>('all');
    const [loadingTeams, setLoadingTeams] = useState(false);

    // Solver Config
    const [configVisible, setConfigVisible] = useState(false);
    const [solverConfig, setSolverConfig] = useState<SolverConfig>(DEFAULT_SOLVER_CONFIG);

    // Progress Modal State
    const [progressVis, setProgressVis] = useState(false);
    const [resultVis, setResultVis] = useState(false);
    const [currentRunId, setCurrentRunId] = useState<number | null>(null);
    const [solving, setSolving] = useState(false);

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
                const activatedIds = result.data
                    .filter((batch: BatchPlan) => batch.plan_status === 'ACTIVATED')
                    .map((batch: BatchPlan) => batch.id);
                setSelectedRowKeys(activatedIds);
            } else if (Array.isArray(result)) {
                setData(result);
                const activatedIds = result
                    .filter((batch: BatchPlan) => batch.plan_status === 'ACTIVATED')
                    .map((batch: BatchPlan) => batch.id);
                setSelectedRowKeys(activatedIds);
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
        setSelectedRowKeys([]);
        // Reset solve range when month changes — default to full month
        setSolveRange(null);
    }, [selectedMonth]);

    const handleMonthChange = (date: Dayjs | null) => {
        if (date) {
            setSelectedMonth(date);
        }
    };

    const handleDepartmentChange = (value: 'all' | string) => {
        setSelectedDepartment(value);
        if (value === 'all') {
            setSolverConfig((prev) => ({ ...prev, team_ids: [] }));
        } else {
            const matchedTeam = teams.find(t => t.teamName === value);
            setSolverConfig((prev) => ({
                ...prev,
                team_ids: matchedTeam ? [matchedTeam.id] : [],
            }));
        }
        const filtered = data.filter(item => value === 'all' || item.team_name === value);
        const activatedIds = filtered
            .filter(batch => batch.plan_status === 'ACTIVATED')
            .map(batch => batch.id);
        setSelectedRowKeys(activatedIds);
    };

    const filteredData = Array.isArray(data)
        ? data.filter(item => selectedDepartment === 'all' || item.team_name === selectedDepartment)
        : [];

    const handleIntervalSolve = async () => {
        if (selectedRowKeys.length === 0) {
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
            const response = await fetch('/api/v4/scheduling/solve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    batch_ids: selectedRowKeys,
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
                let color = 'default';
                if (status === 'IN PROGRESS' || status === 'ACTIVATED') color = 'blue';
                if (status === 'COMPLETED') color = 'green';
                if (status === 'PENDING') color = 'gold';
                return <Tag color={color}>{status || 'DRAFT'}</Tag>;
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
        <>
            <Alert
                type="info"
                showIcon
                icon={<InfoCircleOutlined />}
                style={{ marginBottom: 16, borderRadius: 8 }}
                message="区间求解模式"
                description={
                    <span>
                        仅重新优化指定日期范围内的排班。区间外的已有排班数据（已执行的事实）将被<strong>完全冻结</strong>，
                        不会被修改。整月约束（连续工作天数、夜班间隔等）仍然有效。
                    </span>
                }
            />

            {/* Controls Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Text strong>月份：</Text>
                    <DatePicker.MonthPicker
                        value={selectedMonth}
                        onChange={handleMonthChange}
                        allowClear={false}
                        style={{ width: 150, borderRadius: '8px' }}
                    />
                    <Select
                        value={selectedDepartment}
                        onChange={handleDepartmentChange}
                        loading={loadingTeams}
                        style={{ width: 180, borderRadius: '12px' }}
                        options={[
                            { value: 'all', label: '所有部门' },
                            ...teams.map(team => ({
                                value: team.teamName,
                                label: team.teamName,
                            })),
                        ]}
                    />
                    <Button
                        icon={<SettingOutlined />}
                        onClick={() => setConfigVisible(true)}
                        size="small"
                    >
                        配置
                    </Button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Text strong style={{ whiteSpace: 'nowrap' }}>求解区间：</Text>
                    <Tooltip title="选择需要重新优化的日期范围。区间外的排班将被冻结保留。">
                        <RangePicker
                            value={solveRange}
                            onChange={(dates) => setSolveRange(dates as [Dayjs, Dayjs] | null)}
                            disabledDate={(current) => {
                                return current < selectedMonth.startOf('month') || current > selectedMonth.endOf('month');
                            }}
                            style={{ borderRadius: 8 }}
                            placeholder={['区间开始', '区间结束']}
                        />
                    </Tooltip>
                </div>
            </div>

            {/* Solve Range Visual Indicator */}
            {solveRange && solveRange[0] && solveRange[1] && (
                <div style={{
                    background: 'linear-gradient(135deg, #fef3cd 0%, #fff8e1 100%)',
                    border: '1px solid #ffc107',
                    borderRadius: 8,
                    padding: '10px 16px',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                }}>
                    <ThunderboltOutlined style={{ color: '#ff9800', fontSize: 18 }} />
                    <div>
                        <Text strong style={{ color: '#e65100' }}>
                            求解区间: {solveRange[0].format('MM-DD')} ~ {solveRange[1].format('MM-DD')}
                        </Text>
                        <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
                            冻结区域:
                            {solveRange[0].isAfter(selectedMonth.startOf('month'))
                                ? ` ${selectedMonth.startOf('month').format('MM-DD')} ~ ${solveRange[0].subtract(1, 'day').format('MM-DD')}`
                                : ' 无 (左侧)'
                            }
                            {solveRange[1].isBefore(selectedMonth.endOf('month'))
                                ? ` | ${solveRange[1].add(1, 'day').format('MM-DD')} ~ ${selectedMonth.endOf('month').format('MM-DD')}`
                                : ' | 无 (右侧)'
                            }
                        </Text>
                    </div>
                </div>
            )}

            <Table
                rowSelection={{
                    selectedRowKeys,
                    onChange: (keys) => setSelectedRowKeys(keys),
                }}
                columns={columns}
                dataSource={filteredData}
                rowKey="id"
                loading={loading}
                pagination={{
                    total: filteredData.length,
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`
                }}
                size="small"
            />

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#86868B', fontSize: 13 }}>
                    已选 <strong style={{ color: '#1D1D1F' }}>{selectedRowKeys.length}</strong> / 共 {filteredData.length} 个批次
                </span>
                <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={handleIntervalSolve}
                    loading={solving}
                    disabled={!solveRange || selectedRowKeys.length === 0}
                    style={{
                        background: solveRange ? 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)' : undefined,
                        borderColor: solveRange ? '#ff6b35' : undefined,
                        borderRadius: 8,
                    }}
                >
                    启动区间求解
                </Button>
            </div>

            {/* Modals */}
            <SolverConfigurationModal
                visible={configVisible}
                config={solverConfig}
                onConfigChange={setSolverConfig}
                onClose={() => setConfigVisible(false)}
            />

            <SolveProgressV4Modal
                visible={progressVis}
                runId={currentRunId}
                onCancel={() => { setProgressVis(false); setCurrentRunId(null); }}
                onViewResults={(rid) => {
                    setProgressVis(false);
                    setResultVis(true);
                }}
            />

            <SolveResultV4Page
                visible={resultVis}
                runId={currentRunId}
                onClose={() => setResultVis(false)}
            />
        </>
    );
};

export default IntervalSolveTab;
