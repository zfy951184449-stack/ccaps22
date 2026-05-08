import React, { useEffect, useState, useRef } from 'react';
import { message } from 'antd';
import {
    WxbButton,
    WxbIcon,
    WxbKpiCard,
    WxbModal,
    WxbPopconfirm,
    WxbProgress,
    WxbTag,
} from '../wxb-ui';
import type { WxbTagColor } from '../wxb-ui';

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

const CATEGORY_LABELS: Record<string, string> = {
    CONSTRAINT: '约束',
    CONFLICT: '冲突',
    SOLVER: '求解',
    PROGRESS: '进度',
    GENERAL: '通用',
};

const stripLogIcons = (value: string) =>
    value.replace(/\p{Extended_Pictographic}/gu, '').replace(/\uFE0F/g, '').trim();

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
                                    message: stripLogIcons(l.message || ''),
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
                                    message: stripLogIcons(l),
                                    type: /error|failed|失败|错误/i.test(l) ? 'ERROR' :
                                        /warning|warn|警告/i.test(l) ? 'WARNING' :
                                            /success|completed|完成|通过/i.test(l) ? 'SUCCESS' : 'INFO',
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
    const isTerminal = isTerminalStatus(status);

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

    const progressStatus = status === 'FAILED' ? 'error' : (isCompleted ? 'success' : 'normal');
    const statusColor: WxbTagColor = status === 'FAILED' ? 'red' : isCompleted ? 'green' : status === 'STOPPING' ? 'amber' : 'blue';

    return (
        <WxbModal
            open={visible}
            onCancel={onCancel}
            footer={null}
            closable
            width={700}
            centered
            maskClosable={false}
            className="solver-v4-progress-modal"
        >
            <div className="solver-v4-progress-shell">
                <div className="solver-v4-progress-header">
                    <h2>自动排班进度</h2>
                    <WxbTag color={statusColor}>{status}</WxbTag>
                </div>

                <WxbProgress
                    percent={progress}
                    status={progressStatus}
                />

                <div className="solver-v4-progress-kpis">
                    <WxbKpiCard title="已分配班次" value={metrics.assigned}>
                        <WxbIcon name="released" size={22} />
                    </WxbKpiCard>
                    <WxbKpiCard title="已用时" value={metrics.elapsed}>
                        <WxbIcon name="hold-time" size={22} />
                    </WxbKpiCard>
                </div>

                <div className="solver-v4-log-title">
                    <WxbIcon name="inspect" size={15} />
                    实时日志
                </div>

                <div ref={logContainerRef} className="solver-v4-log-panel">
                    {logs.length === 0 ? (
                        <div className="solver-v4-log-empty">等待求解器日志...</div>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index} className="solver-v4-log-line">
                                <span className="solver-v4-log-time">[{log.time}]</span>
                                {log.category && log.category !== 'GENERAL' && (
                                    <span className="solver-v4-log-category">{CATEGORY_LABELS[log.category] || log.category}</span>
                                )}
                                <span className={`solver-v4-log-message solver-v4-log-${log.type.toLowerCase()}`}>
                                    {log.message}
                                </span>
                            </div>
                        ))
                    )}
                    {status === 'RUNNING' && <div className="solver-v4-log-cursor">_</div>}
                </div>

                <div className="solver-v4-modal-footer">
                    <WxbButton type="button" variant="ghost" onClick={onCancel}>关闭</WxbButton>

                    <div className="solver-v4-action-group">
                        {!isTerminal && (
                            <WxbButton
                                type="button"
                                variant="danger"
                                onClick={handleStop}
                                disabled={status === 'STOPPING'}
                                aria-busy={status === 'STOPPING' || undefined}
                            >
                                {status === 'STOPPING' ? '停止中...' : '停止排班'}
                            </WxbButton>
                        )}

                        {(isCompleted || (status === 'FAILED' && (metrics.assigned || 0) > 0)) && !isApplied && (
                            <WxbPopconfirm
                                title="应用排班结果"
                                description="将写入新的自动排班数据，但会保留已锁定的操作分配和班次。是否继续？"
                                onConfirm={handleApplyResult}
                                okText="确认应用"
                                cancelText="取消"
                                okButtonProps={{ loading: applying }}
                            >
                                <WxbButton type="button" variant="primary" disabled={applying} aria-busy={applying || undefined}>
                                    <WxbIcon name="released" size={15} />
                                    {applying ? '应用中...' : '应用排班结果'}
                                </WxbButton>
                            </WxbPopconfirm>
                        )}

                        {isApplied && (
                            <WxbButton type="button" variant="primary" disabled>
                                <WxbIcon name="released" size={15} />
                                已应用
                            </WxbButton>
                        )}

                        <WxbButton
                            type="button"
                            variant="secondary"
                            disabled={!isCompleted && !((metrics.assigned || 0) > 0)}
                            onClick={() => runId && onViewResults(runId)}
                        >
                            查看结果
                        </WxbButton>
                    </div>
                </div>
            </div>
        </WxbModal>
    );
};

export default SolveProgressV4Modal;
