import React, { useState, useEffect, useCallback } from 'react';
import {
    Card,
    Table,
    Tag,
    Button,
    Space,
    Typography,
    Badge,
    Descriptions,
    Modal,
    Timeline,
    Alert,
    Statistic,
    Row,
    Col,
    Spin,
    Empty,
    message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    ReloadOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    SyncOutlined,
    ClockCircleOutlined,
    EyeOutlined,
    RobotOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Title, Text } = Typography;

// 类型定义
interface SchedulingRun {
    id: number;
    run_code: string;
    stage: string;
    status: string;
    window_start?: string;
    window_end?: string;
    target_batch_ids?: number[];
    solver_time_limit?: number;
    created_at: string;
    updated_at?: string;
    completed_at?: string;
    error_message?: string;
    metadata?: any;
}

interface SchedulingRunEvent {
    id: number;
    run_id: number;
    event_key: string;
    stage: string;
    status: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'PROGRESS';
    message?: string;
    metadata?: any;
    created_at: string;
}

// 运行阶段映射
const STAGE_LABELS: Record<string, string> = {
    QUEUED: '排队中',
    PREPARING: '准备数据',
    LOADING_DATA: '加载数据',
    PLANNING: '求解中',
    PERSISTING: '保存结果',
    COMPLETED: '已完成',
    FAILED: '失败',
};

const STAGE_COLORS: Record<string, string> = {
    QUEUED: 'default',
    PREPARING: 'processing',
    LOADING_DATA: 'processing',
    PLANNING: 'processing',
    PERSISTING: 'processing',
    COMPLETED: 'success',
    FAILED: 'error',
};

const EVENT_STATUS_COLORS: Record<string, string> = {
    INFO: 'blue',
    WARN: 'orange',
    ERROR: 'red',
    SUCCESS: 'green',
    PROGRESS: 'cyan',
};

const AutoSchedulingDebugPage: React.FC = () => {
    const [runs, setRuns] = useState<SchedulingRun[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRun, setSelectedRun] = useState<SchedulingRun | null>(null);
    const [runEvents, setRunEvents] = useState<SchedulingRunEvent[]>([]);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const API_BASE_URL = 'http://localhost:3001/api';

    // 加载运行列表
    const loadRuns = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/scheduling-runs`);
            if (!response.ok) throw new Error('Failed to load runs');
            const data = await response.json();
            setRuns(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to load scheduling runs:', error);
            message.error('加载排班任务失败');
        } finally {
            setLoading(false);
        }
    }, []);

    // 加载运行事件
    const loadRunEvents = useCallback(async (runId: number) => {
        setEventsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/scheduling-runs/${runId}/events`);
            if (!response.ok) throw new Error('Failed to load events');
            const data = await response.json();
            setRunEvents(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to load run events:', error);
            message.error('加载事件日志失败');
        } finally {
            setEventsLoading(false);
        }
    }, []);

    // 查看详情
    const handleViewDetails = async (run: SchedulingRun) => {
        setSelectedRun(run);
        setDetailModalVisible(true);
        await loadRunEvents(run.id);
    };

    // 自动刷新
    useEffect(() => {
        loadRuns();

        if (!autoRefresh) return;

        const interval = setInterval(() => {
            loadRuns();
            if (selectedRun && detailModalVisible) {
                loadRunEvents(selectedRun.id);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [loadRuns, loadRunEvents, selectedRun, detailModalVisible, autoRefresh]);

    // 统计信息
    const statistics = React.useMemo(() => {
        const total = runs.length;
        const running = runs.filter(r =>
            ['QUEUED', 'PREPARING', 'LOADING_DATA', 'PLANNING', 'PERSISTING'].includes(r.stage)
        ).length;
        const completed = runs.filter(r => r.stage === 'COMPLETED').length;
        const failed = runs.filter(r => r.stage === 'FAILED').length;

        return { total, running, completed, failed };
    }, [runs]);

    // 表格列定义
    const columns: ColumnsType<SchedulingRun> = [
        {
            title: '任务ID',
            dataIndex: 'run_code',
            key: 'run_code',
            width: 150,
            render: (text) => <Text code>{text}</Text>,
        },
        {
            title: '状态',
            dataIndex: 'stage',
            key: 'stage',
            width: 120,
            render: (stage: string) => (
                <Tag color={STAGE_COLORS[stage] || 'default'}>
                    {STAGE_LABELS[stage] || stage}
                </Tag>
            ),
        },
        {
            title: '排班窗口',
            key: 'window',
            width: 200,
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text type="secondary">
                        {record.window_start ? dayjs(record.window_start).format('YYYY-MM-DD') : '-'}
                    </Text>
                    <Text type="secondary">
                        ~ {record.window_end ? dayjs(record.window_end).format('YYYY-MM-DD') : '-'}
                    </Text>
                </Space>
            ),
        },
        {
            title: '批次数量',
            dataIndex: 'target_batch_ids',
            key: 'batch_count',
            width: 100,
            render: (ids: number[]) => (
                <Badge count={ids?.length || 0} showZero />
            ),
        },
        {
            title: '求解器超时',
            dataIndex: 'solver_time_limit',
            key: 'solver_time_limit',
            width: 120,
            render: (limit: number) => limit ? `${limit}s` : '-',
        },
        {
            title: '创建时间',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 180,
            render: (time: string) => (
                <Space direction="vertical" size={0}>
                    <Text>{dayjs(time).format('YYYY-MM-DD HH:mm:ss')}</Text>
                    <Text type="secondary">{dayjs(time).fromNow()}</Text>
                </Space>
            ),
        },
        {
            title: '耗时',
            key: 'duration',
            width: 100,
            render: (_, record) => {
                if (!record.completed_at) {
                    return <Text type="secondary">-</Text>;
                }
                const duration = dayjs(record.completed_at).diff(dayjs(record.created_at), 'second');
                return <Text>{duration}s</Text>;
            },
        },
        {
            title: '操作',
            key: 'actions',
            width: 100,
            fixed: 'right',
            render: (_, record) => (
                <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => handleViewDetails(record)}
                >
                    详情
                </Button>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* 标题和操作区 */}
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space align="center">
                        <RobotOutlined style={{ fontSize: 24 }} />
                        <Title level={3} style={{ margin: 0 }}>
                            自动排班调试监控
                        </Title>
                    </Space>
                    <Space>
                        <Button
                            type={autoRefresh ? 'primary' : 'default'}
                            icon={<SyncOutlined spin={autoRefresh} />}
                            onClick={() => setAutoRefresh(!autoRefresh)}
                        >
                            {autoRefresh ? '自动刷新中' : '已暂停刷新'}
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={loadRuns}
                            loading={loading}
                        >
                            手动刷新
                        </Button>
                    </Space>
                </Space>

                {/* 统计卡片 */}
                <Row gutter={16}>
                    <Col xs={24} sm={12} md={6}>
                        <Card>
                            <Statistic
                                title="总任务数"
                                value={statistics.total}
                                prefix={<RobotOutlined />}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Card>
                            <Statistic
                                title="运行中"
                                value={statistics.running}
                                valueStyle={{ color: '#1890ff' }}
                                prefix={<SyncOutlined spin />}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Card>
                            <Statistic
                                title="已完成"
                                value={statistics.completed}
                                valueStyle={{ color: '#52c41a' }}
                                prefix={<CheckCircleOutlined />}
                            />
                        </Card>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Card>
                            <Statistic
                                title="失败"
                                value={statistics.failed}
                                valueStyle={{ color: '#ff4d4f' }}
                                prefix={<CloseCircleOutlined />}
                            />
                        </Card>
                    </Col>
                </Row>

                {/* 任务列表 */}
                <Card>
                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={runs}
                        loading={loading}
                        pagination={{
                            pageSize: 20,
                            showSizeChanger: true,
                            showTotal: (total) => `共 ${total} 条任务`,
                        }}
                        scroll={{ x: 1200 }}
                    />
                </Card>

                {/* 详情弹窗 */}
                <Modal
                    title={
                        <Space>
                            <RobotOutlined />
                            <span>任务详情</span>
                            {selectedRun && (
                                <Tag color={STAGE_COLORS[selectedRun.stage]}>
                                    {STAGE_LABELS[selectedRun.stage]}
                                </Tag>
                            )}
                        </Space>
                    }
                    open={detailModalVisible}
                    onCancel={() => {
                        setDetailModalVisible(false);
                        setSelectedRun(null);
                        setRunEvents([]);
                    }}
                    width={900}
                    footer={[
                        <Button key="close" onClick={() => setDetailModalVisible(false)}>
                            关闭
                        </Button>,
                    ]}
                >
                    {selectedRun && (
                        <Space direction="vertical" size="large" style={{ width: '100%' }}>
                            {/* 基本信息 */}
                            <Descriptions bordered size="small" column={2}>
                                <Descriptions.Item label="任务ID" span={2}>
                                    <Text code>{selectedRun.run_code}</Text>
                                </Descriptions.Item>
                                <Descriptions.Item label="创建时间">
                                    {dayjs(selectedRun.created_at).format('YYYY-MM-DD HH:mm:ss')}
                                </Descriptions.Item>
                                <Descriptions.Item label="完成时间">
                                    {selectedRun.completed_at
                                        ? dayjs(selectedRun.completed_at).format('YYYY-MM-DD HH:mm:ss')
                                        : '-'
                                    }
                                </Descriptions.Item>
                                <Descriptions.Item label="排班窗口" span={2}>
                                    {selectedRun.window_start && selectedRun.window_end
                                        ? `${dayjs(selectedRun.window_start).format('YYYY-MM-DD')} ~ ${dayjs(selectedRun.window_end).format('YYYY-MM-DD')}`
                                        : '-'
                                    }
                                </Descriptions.Item>
                                <Descriptions.Item label="批次数量">
                                    {selectedRun.target_batch_ids?.length || 0}
                                </Descriptions.Item>
                                <Descriptions.Item label="求解器超时">
                                    {selectedRun.solver_time_limit ? `${selectedRun.solver_time_limit}s` : '-'}
                                </Descriptions.Item>
                            </Descriptions>

                            {/* 错误信息 */}
                            {selectedRun.stage === 'FAILED' && selectedRun.error_message && (
                                <Alert
                                    type="error"
                                    message="执行失败"
                                    description={selectedRun.error_message}
                                    showIcon
                                />
                            )}

                            {/* 执行日志 */}
                            <Card
                                title="执行日志"
                                size="small"
                                extra={
                                    <Button
                                        type="link"
                                        size="small"
                                        icon={<ReloadOutlined />}
                                        onClick={() => loadRunEvents(selectedRun.id)}
                                        loading={eventsLoading}
                                    >
                                        刷新
                                    </Button>
                                }
                            >
                                <Spin spinning={eventsLoading}>
                                    {runEvents.length > 0 ? (
                                        <Timeline
                                            items={runEvents.map((event) => ({
                                                key: event.id,
                                                color: EVENT_STATUS_COLORS[event.status] || 'blue',
                                                dot: event.status === 'ERROR' ? <CloseCircleOutlined /> :
                                                    event.status === 'SUCCESS' ? <CheckCircleOutlined /> :
                                                        event.status === 'PROGRESS' ? <SyncOutlined spin /> :
                                                            <ClockCircleOutlined />,
                                                children: (
                                                    <Space direction="vertical" size={0}>
                                                        <Space>
                                                            <Tag color={EVENT_STATUS_COLORS[event.status]}>
                                                                {event.status}
                                                            </Tag>
                                                            <Text type="secondary">
                                                                {dayjs(event.created_at).format('HH:mm:ss')}
                                                            </Text>
                                                        </Space>
                                                        <Text>{event.message || event.event_key}</Text>
                                                        {event.metadata && (
                                                            <Text type="secondary" code>
                                                                {JSON.stringify(event.metadata, null, 2)}
                                                            </Text>
                                                        )}
                                                    </Space>
                                                ),
                                            }))}
                                        />
                                    ) : (
                                        <Empty description="暂无日志" />
                                    )}
                                </Spin>
                            </Card>
                        </Space>
                    )}
                </Modal>
            </Space>
        </div>
    );
};

export default AutoSchedulingDebugPage;
