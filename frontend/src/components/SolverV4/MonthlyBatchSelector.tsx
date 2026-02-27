import React, { useState, useEffect } from 'react';
import { Card, DatePicker, Table, Tag, Typography, Space, Button, message } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import OperationReviewModal from './OperationReviewModal';
import SolveProgressV4Modal from './SolveProgressV4Modal';
import SolveResultV4Page from './SolveResultV4Page';
import SolverConfigurationModal, { DEFAULT_SOLVER_CONFIG, SolverConfig } from './SolverConfigurationModal';
import { SettingOutlined } from '@ant-design/icons';

const { Title } = Typography;

interface BatchPlan {
    id: number;
    batch_code: string;
    template_name: string; // Product in mockup
    plan_status: string;
    planned_start_date: string;
    planned_end_date: string;
}

const MonthlyBatchSelector: React.FC = () => {
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs('2026-01-01')); // Default to Jan 2026 as per mockup request
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<BatchPlan[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [modalVisible, setModalVisible] = useState(false);

    // Solver Configuration State
    const [configVisible, setConfigVisible] = useState(false);
    const [solverConfig, setSolverConfig] = useState<SolverConfig>(DEFAULT_SOLVER_CONFIG);

    // Progress Modal State
    const [progressVis, setProgressVis] = useState(false);
    const [resultVis, setResultVis] = useState(false);
    const [currentRunId, setCurrentRunId] = useState<number | null>(null);

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
                    message.error('Failed to load batch data');
                }
            }
        } catch (error) {
            console.error('Error fetching batches:', error);
            message.error('Error fetching batches');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData(selectedMonth);
        setSelectedRowKeys([]); // Reset selection when month changes
    }, [selectedMonth]);

    const handleMonthChange = (date: Dayjs | null) => {
        if (date) {
            setSelectedMonth(date);
        }
    };

    const handleScheduleSelected = () => {
        if (selectedRowKeys.length === 0) {
            message.warning('Please select at least one batch to schedule.');
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
            title: 'Batch Code',
            dataIndex: 'batch_code',
            key: 'batch_code',
            sorter: (a, b) => a.batch_code.localeCompare(b.batch_code),
        },
        {
            title: 'Product',
            dataIndex: 'template_name', // Mapping template_name to Product column
            key: 'template_name',
            render: (text) => text || '-',
        },
        {
            title: 'Status',
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
            title: 'Start Date',
            dataIndex: 'planned_start_date',
            key: 'planned_start_date',
            sorter: (a, b) => dayjs(a.planned_start_date).unix() - dayjs(b.planned_start_date).unix(),
        },
        {
            title: 'End Date',
            dataIndex: 'planned_end_date',
            key: 'planned_end_date',
            sorter: (a, b) => dayjs(a.planned_end_date).unix() - dayjs(b.planned_end_date).unix(),
        },
        {
            title: '',
            key: 'action',
            render: () => <Button type="text" icon={<MoreOutlined />} />,
            width: 50,
        },
    ];

    return (
        <Card
            bordered={false}
            style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
            bodyStyle={{ padding: '24px' }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Title level={4} style={{ margin: 0 }}>Production Scheduling</Title>
                    <Button
                        icon={<SettingOutlined />}
                        onClick={() => setConfigVisible(true)}
                    >
                        Advanced Configuration
                    </Button>
                </div>

                <Space>
                    <DatePicker.MonthPicker
                        value={selectedMonth}
                        onChange={handleMonthChange}
                        allowClear={false}
                        style={{ width: 150 }}
                    />
                </Space>
            </div>

            <Table
                rowSelection={rowSelection}
                columns={columns}
                dataSource={Array.isArray(data) ? data : []}
                rowKey="id"
                loading={loading}
                pagination={{
                    total: Array.isArray(data) ? data.length : 0,
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => `Showing 1 to ${Math.min(10, Array.isArray(data) ? data.length : 0)} of ${total} entries`
                }}
            />

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <Button onClick={handleResetSelection}>Reset Selection</Button>
                <Button type="primary" onClick={handleScheduleSelected}>
                    Schedule Selected
                </Button>
            </div>


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
                onClose={() => setConfigVisible(false)}
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
