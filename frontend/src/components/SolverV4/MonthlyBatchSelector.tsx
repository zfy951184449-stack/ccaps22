import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Table, Tag, Typography, Space, Button, message, Select, Tabs } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import OperationReviewModal from './OperationReviewModal';
import SolveProgressV4Modal from './SolveProgressV4Modal';
import SolveResultV4Page from './SolveResultV4Page';
import SolverConfigurationModal, { DEFAULT_SOLVER_CONFIG, SolverConfig } from './SolverConfigurationModal';
import { SettingOutlined, HistoryOutlined, UnorderedListOutlined, ThunderboltOutlined, TeamOutlined, AppstoreOutlined } from '@ant-design/icons';
import RunHistoryTab from './RunHistoryTab';
import IntervalSolveTab from './IntervalSolveTab';
import TalentDashboard from './components/TalentDashboard';
import IndependentOperationsTab from './IndependentOperationsTab';

const { Title } = Typography;

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
    const [solverConfig, setSolverConfig] = useState<SolverConfig>(DEFAULT_SOLVER_CONFIG);

    // Department Filter State
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedDepartment, setSelectedDepartment] = useState<'all' | number>('all');
    const [loadingTeams, setLoadingTeams] = useState(false);

    // Progress Modal State
    const [progressVis, setProgressVis] = useState(false);
    const [resultVis, setResultVis] = useState(false);
    const [currentRunId, setCurrentRunId] = useState<number | null>(null);

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
                // Default select all ACTIVATED batches
                const activatedIds = result.data
                    .filter((batch: BatchPlan) => batch.plan_status === 'ACTIVATED')
                    .map((batch: BatchPlan) => batch.id);
                setSelectedRowKeys(activatedIds);
            } else {
                // Fallback if API structure is different or returns error
                if (Array.isArray(result)) {
                    setData(result);
                    // Default select all ACTIVATED batches for fallback case too
                    const activatedIds = result
                        .filter((batch: BatchPlan) => batch.plan_status === 'ACTIVATED')
                        .map((batch: BatchPlan) => batch.id);
                    setSelectedRowKeys(activatedIds);
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
        // Note: selectedRowKeys reset is handled inside fetchData via auto-selecting ACTIVATED
    }, [selectedMonth]);

    const handleMonthChange = (date: Dayjs | null) => {
        if (date) {
            setSelectedMonth(date);
        }
    };

    const handleDepartmentChange = (value: 'all' | number) => {
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
        const filtered = data.filter(item => value === 'all' || item.team_id === value);
        const activatedIds = filtered
            .filter(batch => batch.plan_status === 'ACTIVATED')
            .map(batch => batch.id);
        setSelectedRowKeys(activatedIds);
    };

    // 高级配置关闭时反向同步部门筛选器
    const handleConfigClose = () => {
        setConfigVisible(false);
        const ids = solverConfig.team_ids || [];
        if (ids.length === 1) {
            setSelectedDepartment(ids[0]);
        } else {
            setSelectedDepartment('all');
        }
    };

    // 计算过滤后的数据
    const filteredData = Array.isArray(data)
        ? data.filter(item => selectedDepartment === 'all' || item.team_id === selectedDepartment)
        : [];

    const handleScheduleSelected = () => {
        if (selectedRowKeys.length === 0) {
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
        selectedRowKeys,
        onChange: onSelectChange,
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
        <Card
            bordered={false}
            style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
            bodyStyle={{ padding: '24px' }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Title level={4} style={{ margin: 0 }}>排班调度</Title>
                    <Button
                        icon={<SettingOutlined />}
                        onClick={() => setConfigVisible(true)}
                    >
                        高级配置
                    </Button>
                </div>
            </div>

            <Tabs
                defaultActiveKey="batches"
                items={[
                    {
                        key: 'batches',
                        label: (
                            <span><UnorderedListOutlined style={{ marginRight: 6 }} />批次列表</span>
                        ),
                        children: (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                                    <Space size="middle">
                                        <Select
                                            value={selectedDepartment}
                                            onChange={handleDepartmentChange}
                                            loading={loadingTeams}
                                            style={{
                                                width: 200,
                                                borderRadius: '12px',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                            }}
                                            options={[
                                                { value: 'all', label: '所有部门' },
                                                ...teams.map(team => ({
                                                    value: team.id,
                                                    label: team.teamName,
                                                })),
                                            ]}
                                        />
                                        <DatePicker.MonthPicker
                                            value={selectedMonth}
                                            onChange={handleMonthChange}
                                            allowClear={false}
                                            style={{ width: 150, borderRadius: '8px' }}
                                        />
                                    </Space>
                                </div>

                                <Table
                                    rowSelection={rowSelection}
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
                                />

                                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#86868B', fontSize: 13 }}>
                                        已选 <strong style={{ color: '#1D1D1F' }}>{selectedRowKeys.length}</strong> / 共 {filteredData.length} 个批次
                                    </span>
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <Button onClick={handleResetSelection}>重置选择</Button>
                                        <Button type="primary" onClick={handleScheduleSelected}>
                                            排班选中批次
                                        </Button>
                                    </div>
                                </div>
                            </>
                        ),
                    },
                    {
                        key: 'interval',
                        label: (
                            <span><ThunderboltOutlined style={{ marginRight: 6 }} />区间求解</span>
                        ),
                        children: <IntervalSolveTab />,
                    },
                    {
                        key: 'history',
                        label: (
                            <span><HistoryOutlined style={{ marginRight: 6 }} />历史记录</span>
                        ),
                        children: <RunHistoryTab />,
                    },
                    {
                        key: 'talent',
                        label: (
                            <span><TeamOutlined style={{ marginRight: 6 }} />人才供需</span>
                        ),
                        children: <TalentDashboard />,
                    },
                    {
                        key: 'independent-ops',
                        label: (
                            <span><AppstoreOutlined style={{ marginRight: 6 }} />独立操作</span>
                        ),
                        children: <IndependentOperationsTab />,
                    },
                ]}
            />

            <OperationReviewModal
                visible={modalVisible}
                onCancel={() => setModalVisible(false)}
                batchIds={selectedRowKeys as number[]}
                month={selectedMonth}
                onSuccess={handleSchedulingSuccess}
                solverConfig={solverConfig}
            />

            <SolverConfigurationModal
                visible={configVisible}
                config={solverConfig}
                onConfigChange={setSolverConfig}
                onClose={handleConfigClose}
            />

            <SolveProgressV4Modal
                visible={progressVis}
                runId={currentRunId}
                onCancel={handleProgressClose}
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
        </Card >
    );
};

export default MonthlyBatchSelector;
