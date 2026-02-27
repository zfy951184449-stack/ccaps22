/**
 * V3 求解中心组件
 * 
 * 独立的 V3 求解器前端界面，不使用 Tab 切换。
 * 路由: /scheduling-v3
 * 
 * 支持三种模式:
 * - 按月排班 (BY_MONTH)
 * - 自定义时间范围 (BY_PERIOD)
 * - 按批次排班 (BY_BATCH)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    Card,
    Button,
    Space,
    message,
    DatePicker,
    Radio,
    Progress,
    Alert,
    Table,
    Typography,
    Divider,
    Tag,
    Spin,
    Empty,
    Select,
    Checkbox,
} from 'antd';
import {
    RocketOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    SyncOutlined,
    ClockCircleOutlined,
    AppstoreOutlined,
    CalendarOutlined,
} from '@ant-design/icons';
import { SettingOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';

import './SolvingCenterV3.css';
import SolveResultV3 from './SolveResultV3';
import ObjectiveCurveChart from './ObjectiveCurveChart';
import ConstraintConfigPanel, { ConstraintConfig, DEFAULT_CONFIG } from './ConstraintConfigPanel';
import AdvancedConfigModal, { AdvancedConfig, DEFAULT_ADVANCED_CONFIG } from './AdvancedConfigModal';
import HistoryRunList from './HistoryRunList';
import BatchSelectorPanel from './BatchSelectorPanel';
import SolveProgressPanel from './SolveProgressPanel';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

dayjs.locale('zh-cn');

// API 基础 URL
const API_BASE = '/api/v3/scheduling';

// 类型定义
interface SolveRunV3 {
    runId: number;
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    stage?: string;
    message?: string;
}

interface AssignmentResult {
    operation_plan_id: number;
    employee_id: number;
    employee_name: string;
    employee_code: string;
    operation_name: string;
    position_number: number;
}

interface SolveResultV3Type {
    assignments: AssignmentResult[];
    shift_plans: any[];
}

interface BatchInfo {
    id: number;
    batch_code: string;
    batch_name: string;
    plan_status: string;
}

// 求解模式
type SolveMode = 'MONTH' | 'PERIOD' | 'BATCH';

const SolvingCenterV3: React.FC = () => {
    // 模式状态
    const [solveMode, setSolveMode] = useState<SolveMode>('MONTH');

    // 时间范围状态
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
    const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);

    // 批次状态
    const [batches, setBatches] = useState<BatchInfo[]>([]);
    const [batchesLoading, setBatchesLoading] = useState(false);
    const [selectedBatchIds, setSelectedBatchIds] = useState<number[]>([]);

    // 求解状态
    const [solving, setSolving] = useState(false);
    const [currentRun, setCurrentRun] = useState<SolveRunV3 | null>(null);
    const [progress, setProgress] = useState(0);

    // 结果状态
    const [result, setResult] = useState<SolveResultV3Type | null>(null);
    const [resultLoading, setResultLoading] = useState(false);
    const [resultModalVisible, setResultModalVisible] = useState(false);

    // 目标函数曲线数据
    const [objectiveHistory, setObjectiveHistory] = useState<{ time: number; value: number }[]>([]);
    const solveStartTimeRef = useRef<number>(0);

    // 约束配置
    const [constraintConfig, setConstraintConfig] = useState<ConstraintConfig>(DEFAULT_CONFIG);
    const [advancedConfig, setAdvancedConfig] = useState<AdvancedConfig>(DEFAULT_ADVANCED_CONFIG);
    const [advancedModalVisible, setAdvancedModalVisible] = useState(false);

    // 轮询引用 和 SSE 引用
    const pollIntervalRef = useRef<number | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    // 实时指标状态
    const [metrics, setMetrics] = useState({
        hard_constraint_satisfaction: 100,
        understaffed_operations: 0,
        share_group_consistency: 100,
        fairness_deviation: 0,
        solutions_found: 0,
    });

    // 加载批次数据 - MONTH 模式需要按日期范围过滤
    useEffect(() => {
        if (solveMode === 'BATCH' || solveMode === 'MONTH') {
            loadBatches();
        }
    }, [solveMode, selectedMonth]);

    const loadBatches = async () => {
        setBatchesLoading(true);
        try {
            // 构建查询参数
            let url = '/api/batch-plans?status=ACTIVATED';

            // MONTH 模式: 传递日期范围过滤批次
            if (solveMode === 'MONTH') {
                const startDate = selectedMonth.startOf('month').format('YYYY-MM-DD');
                const endDate = selectedMonth.endOf('month').format('YYYY-MM-DD');
                url += `&start_date=${startDate}&end_date=${endDate}`;
            }

            const response = await fetch(url);
            const data = await response.json();
            if (data.success) {
                setBatches(data.data || []);
            }
        } catch (error) {
            console.error('加载批次失败:', error);
        } finally {
            setBatchesLoading(false);
        }
    };

    // 计算时间范围
    const getDateRange = useCallback((): { start_date: string; end_date: string } => {
        if (solveMode === 'MONTH') {
            return {
                start_date: selectedMonth.startOf('month').format('YYYY-MM-DD'),
                end_date: selectedMonth.endOf('month').format('YYYY-MM-DD'),
            };
        } else if (solveMode === 'PERIOD' && customRange) {
            return {
                start_date: customRange[0].format('YYYY-MM-DD'),
                end_date: customRange[1].format('YYYY-MM-DD'),
            };
        } else if (solveMode === 'BATCH') {
            // 批次模式下使用当月范围
            return {
                start_date: dayjs().startOf('month').format('YYYY-MM-DD'),
                end_date: dayjs().endOf('month').format('YYYY-MM-DD'),
            };
        }
        return {
            start_date: dayjs().startOf('month').format('YYYY-MM-DD'),
            end_date: dayjs().endOf('month').format('YYYY-MM-DD'),
        };
    }, [solveMode, selectedMonth, customRange]);

    // 检查是否可以开始求解
    const canStartSolve = useCallback(() => {
        if (solving) return false;
        if (solveMode === 'PERIOD' && !customRange) return false;
        if (solveMode === 'BATCH' && selectedBatchIds.length === 0) return false;
        return true;
    }, [solving, solveMode, customRange, selectedBatchIds]);

    // 开始求解
    const handleStartSolve = useCallback(async () => {
        const dateRange = getDateRange();

        setSolving(true);
        setProgress(0);
        setResult(null);
        setCurrentRun(null);
        setObjectiveHistory([]);
        solveStartTimeRef.current = Date.now();

        try {
            const response = await fetch(`${API_BASE}/solve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: solveMode === 'BATCH' ? 'BY_BATCH' : solveMode === 'MONTH' ? 'BY_MONTH' : 'BY_PERIOD',
                    start_date: dateRange.start_date,
                    end_date: dateRange.end_date,
                    batch_ids: solveMode === 'BATCH' ? selectedBatchIds : undefined,
                    config: {
                        solver_time_limit_seconds: 60,
                    },
                }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || '创建求解任务失败');
            }

            const runId = data.data.runId;
            setCurrentRun({ runId, status: 'QUEUED' });
            message.success('V3 求解任务已创建');

            // 开始 SSE 订阅进度
            startSSE(runId);

        } catch (error: any) {
            message.error(error.message || '求解失败');
            setSolving(false);
        }
    }, [getDateRange, solveMode, selectedBatchIds]);

    // SSE 实时进度订阅
    const startSSE = useCallback((runId: number) => {
        // 关闭旧的连接
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource(`${API_BASE}/runs/${runId}/progress`);
        eventSourceRef.current = eventSource;

        eventSource.addEventListener('connected', () => {
            console.log('[SSE] 连接已建立');
        });

        eventSource.addEventListener('progress', (event) => {
            try {
                const data = JSON.parse(event.data);
                setCurrentRun({
                    runId: data.runId,
                    status: data.status,
                    stage: data.stage,
                    message: data.message,
                });
                setProgress(data.progress || 0);

                // 更新实时指标
                if (data.metrics) {
                    setMetrics(data.metrics);
                }
            } catch (e) {
                console.error('[SSE] 解析进度数据失败:', e);
            }
        });

        eventSource.addEventListener('objective', (event) => {
            try {
                const data = JSON.parse(event.data);
                setObjectiveHistory(prev => [...prev, { time: data.time, value: data.value }]);
            } catch (e) {
                console.error('[SSE] 解析目标函数数据失败:', e);
            }
        });

        eventSource.addEventListener('complete', (event) => {
            try {
                const data = JSON.parse(event.data);
                eventSource.close();
                eventSourceRef.current = null;
                setSolving(false);

                if (data.status === 'COMPLETED') {
                    message.success('V3 求解完成');
                    loadResult(runId);
                } else if (data.status === 'FAILED') {
                    message.error('求解失败');
                } else if (data.status === 'CANCELLED') {
                    message.warning('求解已取消');
                }
            } catch (e) {
                console.error('[SSE] 解析完成数据失败:', e);
            }
        });

        eventSource.addEventListener('error', () => {
            console.error('[SSE] 连接错误，3秒后重试');
            eventSource.close();
            // 3秒后重试
            setTimeout(() => startSSE(runId), 3000);
        });
    }, []);

    // 取消求解
    const handleCancelSolve = useCallback(async () => {
        if (!currentRun?.runId) return;

        try {
            const response = await fetch(`${API_BASE}/runs/${currentRun.runId}/cancel`, {
                method: 'POST',
            });
            const data = await response.json();

            if (data.success) {
                message.info('取消请求已发送');
            } else {
                message.error(data.error || '取消失败');
            }
        } catch (error) {
            message.error('取消请求失败');
        }
    }, [currentRun]);

    // 加载结果
    const loadResult = useCallback(async (runId: number) => {
        setResultLoading(true);
        try {
            const response = await fetch(`${API_BASE}/runs/${runId}/result`);
            const data = await response.json();

            if (data.success) {
                setResult(data.data);
            } else {
                message.error('加载结果失败');
            }
        } catch (error) {
            message.error('加载结果失败');
        } finally {
            setResultLoading(false);
        }
    }, []);

    // 清理
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    // 状态标签渲染
    const renderStatusTag = (status: string) => {
        const statusConfig: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
            'QUEUED': { color: 'default', icon: <ClockCircleOutlined />, text: '排队中' },
            'RUNNING': { color: 'processing', icon: <SyncOutlined spin />, text: '求解中' },
            'COMPLETED': { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
            'FAILED': { color: 'error', icon: <CloseCircleOutlined />, text: '失败' },
        };
        const config = statusConfig[status] || statusConfig['QUEUED'];
        return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>;
    };

    // 分配结果表格列
    const assignmentColumns = [
        { title: '操作名称', dataIndex: 'operation_name', key: 'operation_name' },
        { title: '岗位', dataIndex: 'position_number', key: 'position_number', width: 80, render: (v: number) => `#${v + 1}` },
        { title: '分配员工', dataIndex: 'employee_name', key: 'employee_name' },
        { title: '员工编号', dataIndex: 'employee_code', key: 'employee_code' },
    ];

    return (
        <div className="solving-center-v3">
            {/* 页面标题区 */}
            <div className="page-header">
                <Title level={3}>
                    <RocketOutlined /> V3 自动排班中心
                </Title>
                <Text type="secondary">
                    使用 V3 求解器进行自动排班，支持按月、自定义时间范围或按批次排班。
                </Text>
            </div>

            {/* 主内容区 - 两栏布局 */}
            <div className="main-content">
                {/* 左侧面板 - 求解选项 */}
                <div className="options-panel">
                    <div className="section-title">求解选项</div>

                    {/* 模式选择 */}
                    <div className="mode-selector">
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>模式选择:</Text>
                        <Radio.Group
                            value={solveMode}
                            onChange={(e) => setSolveMode(e.target.value)}
                        >
                            <Space direction="vertical">
                                <Radio value="MONTH">
                                    <CalendarOutlined /> 按月排班 (推荐)
                                </Radio>
                                <Radio value="PERIOD">
                                    <CalendarOutlined /> 自定义时间范围
                                </Radio>
                                <Radio value="BATCH">
                                    <AppstoreOutlined /> 按生产批次
                                </Radio>
                            </Space>
                        </Radio.Group>
                    </div>

                    <Divider style={{ margin: '16px 0' }} />

                    {/* 日期/批次选择 */}
                    <div className="date-section">
                        {solveMode === 'MONTH' && (
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Text strong>选择月份:</Text>
                                <DatePicker
                                    picker="month"
                                    value={selectedMonth}
                                    onChange={(v) => v && setSelectedMonth(v)}
                                    style={{ width: '100%' }}
                                    size="large"
                                />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    范围: {getDateRange().start_date} 至 {getDateRange().end_date}
                                </Text>
                            </Space>
                        )}

                        {/* 范围内批次预览 - 仅在 MONTH 模式显示 */}
                        {solveMode === 'MONTH' && (
                            <div className="batch-preview" style={{ marginTop: 16 }}>
                                <Text strong style={{ fontSize: 12 }}>
                                    📋 范围内批次 ({batches.length}个):
                                </Text>
                                <Spin spinning={batchesLoading} size="small">
                                    {batches.length > 0 ? (
                                        <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, fontSize: 12 }}>
                                            {batches.slice(0, 5).map((batch) => (
                                                <li key={batch.id} style={{ color: '#595959' }}>
                                                    {batch.batch_code}
                                                </li>
                                            ))}
                                            {batches.length > 5 && (
                                                <li style={{ color: '#8c8c8c' }}>+{batches.length - 5} 更多...</li>
                                            )}
                                        </ul>
                                    ) : (
                                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                                            暂无批次
                                        </Text>
                                    )}
                                </Spin>
                            </div>
                        )}

                        {solveMode === 'PERIOD' && (
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Text strong>选择时间范围:</Text>
                                <RangePicker
                                    value={customRange}
                                    onChange={(v) => setCustomRange(v as [Dayjs, Dayjs] | null)}
                                    style={{ width: '100%' }}
                                />
                                {customRange && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        范围: {getDateRange().start_date} 至 {getDateRange().end_date}
                                    </Text>
                                )}
                            </Space>
                        )}

                        {solveMode === 'BATCH' && (
                            <div>
                                <Text strong style={{ marginBottom: 8, display: 'block' }}>选择批次:</Text>
                                <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                                    已选 {selectedBatchIds.length} 个批次
                                </Text>
                            </div>
                        )}
                    </div>

                    {/* 手动分段提示 */}
                    <div className="manual-tip">
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            💡 建议每次求解半个月，大范围排班请分段进行以获得最佳性能。
                        </Text>
                    </div>

                    {/* 开始求解按钮 */}
                    <div className="solve-button-container">
                        <Button
                            type="primary"
                            size="large"
                            icon={<RocketOutlined />}
                            onClick={handleStartSolve}
                            loading={solving}
                            disabled={!canStartSolve()}
                            block
                        >
                            开始 V3 求解
                        </Button>
                    </div>
                </div>

                {/* 右侧面板 - BATCH 模式显示批次选择器,其他模式显示约束配置 */}
                <div className="constraint-panel">
                    {solveMode === 'BATCH' ? (
                        <>
                            <div className="section-title">待排产批次选择</div>
                            <BatchSelectorPanel
                                batches={batches}
                                loading={batchesLoading}
                                selectedIds={selectedBatchIds}
                                onChange={setSelectedBatchIds}
                                disabled={solving}
                            />
                        </>
                    ) : (
                        <>
                            <div className="section-title">
                                约束配置与优先级
                                <Button
                                    type="link"
                                    icon={<SettingOutlined />}
                                    onClick={() => setAdvancedModalVisible(true)}
                                    style={{ float: 'right', padding: 0 }}
                                >
                                    高级配置
                                </Button>
                            </div>
                            <ConstraintConfigPanel
                                config={constraintConfig}
                                onChange={setConstraintConfig}
                                disabled={solving}
                            />
                        </>
                    )}
                </div>
            </div>


            {/* 进度区域 - 使用增强版进度面板 */}
            {currentRun && (
                <div className="progress-section">
                    <SolveProgressPanel
                        runId={currentRun.runId}
                        status={currentRun.status}
                        stage={currentRun.stage}
                        progress={progress}
                        message={currentRun.message}
                        bestObjective={objectiveHistory.length > 0 ? objectiveHistory[objectiveHistory.length - 1].value : undefined}
                        startTime={solveStartTimeRef.current}
                        metrics={metrics}
                        onStop={handleCancelSolve}
                    />

                    {/* 目标函数曲线图 */}
                    {objectiveHistory.length > 1 && (
                        <div style={{ marginTop: 16 }}>
                            <ObjectiveCurveChart data={objectiveHistory} />
                        </div>
                    )}
                </div>
            )}

            {/* 结果区域 */}
            {result && (
                <div className="result-section">
                    <Card
                        size="small"
                        title={
                            <Space>
                                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                求解完成
                            </Space>
                        }
                        extra={
                            <Button type="primary" onClick={() => setResultModalVisible(true)}>
                                查看详细结果
                            </Button>
                        }
                    >
                        <Alert
                            type="success"
                            message={`已分配 ${result.assignments.length} 个岗位`}
                            description="点击右上角按钮查看详细结果，包含岗位分配、班次计划、工时统计等信息"
                        />
                    </Card>
                </div>
            )}

            {/* 结果详情弹窗 */}
            <SolveResultV3
                visible={resultModalVisible}
                onClose={() => setResultModalVisible(false)}
                runId={currentRun?.runId || null}
                onApply={() => {
                    setResult(null);
                    setCurrentRun(null);
                }}
            />

            {/* 高级配置弹窗 */}
            <AdvancedConfigModal
                visible={advancedModalVisible}
                config={advancedConfig}
                onCancel={() => setAdvancedModalVisible(false)}
                onConfirm={(config) => {
                    setAdvancedConfig(config);
                    setAdvancedModalVisible(false);
                }}
            />

            {/* 历史记录 - 页面底部 */}
            <div className="history-section" style={{ marginTop: 24 }}>
                <HistoryRunList
                    onViewResult={(runId) => {
                        setCurrentRun({ runId, status: 'COMPLETED' });
                        setResultModalVisible(true);
                    }}
                    refreshTrigger={currentRun?.runId}
                />
            </div>
        </div>
    );
};

export default SolvingCenterV3;

