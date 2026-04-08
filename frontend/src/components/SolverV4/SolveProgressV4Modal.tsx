import React, { useEffect, useState, useRef } from 'react';
import { Modal, Progress, Button, Statistic, Row, Col, Typography, Tag, message, Popconfirm } from 'antd';
import { StopOutlined, CheckCircleOutlined, ClockCircleOutlined, CodeOutlined, SaveOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface SolveProgressV4ModalProps {
    visible: boolean;
    runId: number | null;
    onCancel: () => void; // Triggered on Stop or Close
    onViewResults: (runId: number) => void;
}

interface LogLine {
    time: string;
    message: string;
    type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
    category?: 'GENERAL' | 'CONSTRAINT' | 'CONFLICT' | 'SOLVER' | 'PROGRESS';
}

// 日志颜色配置
const LOG_COLORS: Record<string, string> = {
    SUCCESS: '#4ec9b0',   // 绿色 - 成功
    WARNING: '#dcdcaa',   // 黄色 - 警告
    ERROR: '#f48771',     // 红色 - 错误
    INFO: '#9cdcfe',      // 蓝色 - 信息
};

// 分类图标
const CATEGORY_ICONS: Record<string, string> = {
    CONSTRAINT: '⚙️',
    CONFLICT: '⚠️',
    SOLVER: '🧠',
    PROGRESS: '📈',
    GENERAL: '📝',
};

const SolveProgressV4Modal: React.FC<SolveProgressV4ModalProps> = ({ visible, runId, onCancel, onViewResults }) => {
    const [status, setStatus] = useState<string>('INIT');
    const [progress, setProgress] = useState<number>(0);
    const [metrics, setMetrics] = useState({
        assigned: 0,
        total: 0,
        elapsed: '00:00'
    });
    const [logs, setLogs] = useState<LogLine[]>([]);
    const [applying, setApplying] = useState(false);
    const [isApplied, setIsApplied] = useState(false);

    const eventSourceRef = useRef<EventSource | null>(null);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const isTerminalStatus = (value: string) => ['COMPLETED', 'APPLIED', 'FAILED'].includes(value);

    useEffect(() => {
        if (visible && runId) {
            startListening(runId);
        } else {
            stopListening();
            // Reset state
            setStatus('INIT');
            setProgress(0);
            setLogs([]);
            setApplying(false);
            setIsApplied(false);
        }

        return () => stopListening();
    }, [visible, runId]);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const startListening = (id: number) => {
        // Close existing connection if any
        if (eventSourceRef.current) eventSourceRef.current.close();

        // Connect to SSE
        const evtSource = new EventSource(`/api/v4/scheduling/runs/${id}/progress`);
        eventSourceRef.current = evtSource;

        const handleMessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);

                // Update basic info
                if (data.status) {
                    setStatus(data.status);
                    if (data.status === 'COMPLETED' || data.status === 'APPLIED') {
                        setProgress(100);
                    }
                }

                // Parse Solver Progress JSON
                if (data.solver_progress) {
                    const sp = typeof data.solver_progress === 'string' ? JSON.parse(data.solver_progress) : data.solver_progress;

                    if (sp.progress !== undefined) setProgress(sp.progress);

                    if (sp.metrics) {
                        setMetrics(prev => ({
                            ...prev,
                            assigned: sp.metrics.assigned_count || prev.assigned,
                        }));
                    }

                    // Handle Logs - Support both old (string[]) and new (logs_full) formats
                    if (sp.logs_full && Array.isArray(sp.logs_full)) {
                        // New format: logs_full contains full log objects
                        setLogs(prevLogs => {
                            const prevCount = prevLogs.length;
                            const newCount = sp.logs_full.length;

                            if (newCount > prevCount) {
                                const newItems = sp.logs_full.slice(prevCount).map((l: any) => ({
                                    time: l.time || new Date().toLocaleTimeString(),
                                    message: l.message,
                                    type: l.level || 'INFO',
                                    category: l.category || 'GENERAL',
                                } as LogLine));
                                return [...prevLogs, ...newItems];
                            }
                            return prevLogs;
                        });
                    } else if (sp.logs && Array.isArray(sp.logs)) {
                        // Old format: logs is string[]
                        setLogs(prevLogs => {
                            const prevCount = prevLogs.length;
                            const newCount = sp.logs.length;

                            if (newCount > prevCount) {
                                const newItems = sp.logs.slice(prevCount).map((l: string) => ({
                                    time: new Date().toLocaleTimeString(),
                                    message: l,
                                    type: l.includes('✅') ? 'SUCCESS' :
                                        l.includes('❌') ? 'ERROR' :
                                            l.includes('⚠️') ? 'WARNING' : 'INFO',
                                    category: 'GENERAL',
                                } as LogLine));
                                return [...prevLogs, ...newItems];
                            }
                            return prevLogs;
                        });
                    }
                }

                if (isTerminalStatus(data.status)) {
                    evtSource.close();
                }

            } catch (e) {
                console.error("SSE Parse Error", e);
            }
        };

        // Backend sends 'event: progress', so we MUST use addEventListener('progress')
        evtSource.addEventListener('progress', handleMessage);

        // Also keep onmessage for generic events (fallback)
        evtSource.onmessage = handleMessage;

        evtSource.onerror = (err) => {
            console.error("SSE Error", err);
            evtSource.close();
        };
    };

    const stopListening = () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
    };

    const isCompleted = status === 'COMPLETED' || status === 'APPLIED';

    const handleStop = async () => {
        if (!runId) return;
        try {
            await fetch(`/api/v4/scheduling/runs/${runId}/stop`, { method: 'POST' });
        } catch (e) {
            console.error("Stop failed", e);
        }
    };

    const handleApplyResult = async () => {
        if (!runId) return;
        setApplying(true);
        try {
            const res = await fetch(`/api/v4/scheduling/runs/${runId}/apply`, { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
                const summary = [
                    `批次分配 ${data.data.batch_assignments_inserted ?? 0} 条`,
                    `独立任务 ${data.data.standalone_assignments_inserted ?? 0} 条`,
                    `新班次 ${data.data.shift_plans_inserted ?? 0} 条`,
                ];

                if ((data.data.shift_plans_reused ?? 0) > 0) {
                    summary.push(`复用锁定班次 ${data.data.shift_plans_reused} 条`);
                }
                if ((data.data.locked_assignments_skipped ?? 0) > 0) {
                    summary.push(`跳过锁定岗位 ${data.data.locked_assignments_skipped} 条`);
                }
                if ((data.data.locked_shift_conflicts ?? 0) > 0) {
                    summary.push(`跳过锁定班次冲突 ${data.data.locked_shift_conflicts} 条`);
                }

                message.success(`排班结果已应用：${summary.join('，')}`);
                setIsApplied(true);
                setStatus('APPLIED');
                setProgress(100);
            } else {
                message.error(data.error || '应用失败');
            }
        } catch (e) {
            console.error("Apply failed", e);
            message.error('应用失败，请重试');
        } finally {
            setApplying(false);
        }
    };

    return (
        <Modal
            open={visible}
            onCancel={onCancel}
            footer={null}
            closable={false}
            width={700}
            centered
            maskClosable={false}
            styles={{ body: { padding: 0 } }} // Clean style
        >
            <div style={{ padding: '24px 24px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Typography.Title level={4} style={{ margin: 0 }}>自动排班进度</Typography.Title>
                    <Tag color={isCompleted ? 'green' : (status === 'STOPPING' ? 'orange' : 'blue')}>{status}</Tag>
                </div>

                {/* Progress Bar */}
                <Progress
                    percent={progress}
                    status={status === 'FAILED' ? 'exception' : (isCompleted ? 'success' : 'active')}
                    strokeWidth={12}
                />
            </div>

            {/* Metrics Cards */}
            <div style={{ background: '#f5f7fa', padding: '16px 24px', margin: '16px 0', borderTop: '1px solid #eee', borderBottom: '1px solid #eee' }}>
                <Row gutter={16}>
                    <Col span={12}>
                        <Statistic
                            title="已分配班次"
                            value={metrics.assigned}
                            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                        />
                    </Col>
                    <Col span={12}>
                        <Statistic
                            title="已用时"
                            value={metrics.elapsed}
                            prefix={<ClockCircleOutlined />}
                        />
                    </Col>
                </Row>
            </div>

            {/* Terminal Console */}
            <div style={{ padding: '0 24px 24px' }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    <CodeOutlined /> 实时日志
                </Text>

                <div
                    ref={logContainerRef}
                    style={{
                        background: '#1e1e1e',
                        color: '#d4d4d4',
                        padding: '12px',
                        borderRadius: '8px',
                        height: '250px',
                        overflowY: 'auto',
                        fontFamily: "'Consolas', 'Monaco', monospace",
                        fontSize: '12px',
                        lineHeight: '1.5'
                    }}
                >
                    {logs.length === 0 ? (
                        <div style={{ color: '#666' }}>等待求解器日志...</div>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index} style={{ marginBottom: 4, display: 'flex', alignItems: 'flex-start' }}>
                                <span style={{ color: '#666', marginRight: 6, flexShrink: 0 }}>[{log.time}]</span>
                                {log.category && log.category !== 'GENERAL' && (
                                    <span style={{ marginRight: 4 }}>{CATEGORY_ICONS[log.category] || ''}</span>
                                )}
                                <span style={{
                                    color: LOG_COLORS[log.type] || '#d4d4d4',
                                    wordBreak: 'break-word',
                                }}>
                                    {log.message}
                                </span>
                            </div>
                        ))
                    )}
                    {status === 'RUNNING' && <div style={{ color: '#666' }}>_</div>}
                </div>
            </div>

            {/* Footer Actions */}
            <div style={{ padding: '0 24px 24px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                {!isCompleted ? (
                    <Button
                        danger
                        icon={<StopOutlined />}
                        onClick={handleStop}
                        loading={status === 'STOPPING'}
                        disabled={status === 'STOPPING'}
                    >
                        {status === 'STOPPING' ? '停止中...' : '停止排班'}
                    </Button>
                ) : (
                    <Button onClick={onCancel}>关闭</Button>
                )}

                {(isCompleted || (status === 'FAILED' && (metrics.assigned || 0) > 0)) && !isApplied && (
                    <Popconfirm
                        title="应用排班结果"
                        description="将写入新的自动排班数据，但会保留已锁定的操作分配和班次。是否继续？"
                        onConfirm={handleApplyResult}
                        okText="确认应用"
                        cancelText="取消"
                        okButtonProps={{ loading: applying }}
                    >
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            loading={applying}
                        >
                            应用排班结果
                        </Button>
                    </Popconfirm>
                )}

                {isApplied && (
                    <Button type="primary" disabled icon={<CheckCircleOutlined />}>
                        已应用
                    </Button>
                )}

                <Button
                    disabled={!isCompleted && !((metrics.assigned || 0) > 0)}
                    onClick={() => runId && onViewResults(runId)}
                >
                    查看结果
                </Button>
            </div>
        </Modal>
    );
};

export default SolveProgressV4Modal;
