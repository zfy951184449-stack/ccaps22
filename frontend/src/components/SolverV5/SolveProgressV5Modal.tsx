/**
 * SolveProgressV5Modal — V5 进度小窗（700px 居中弹窗）
 *
 * F3 增强（在 V4 基础上）：
 * - 使用 useSolveStreamV5 hook（单 SSE 连接，state 通过 props 向监视器抽屉托举，不双开连接）
 * - 小窗概览：进度条 + 最多 4 KPI（含 V5 目标值/Gap，字段缺失时退化为 V4 两卡）
 * - 迷你收敛 sparkline（incumbents 有数据时显示）
 * - 阶段点（V5 phase 字段缺失时隐藏，§3.7 降级铁律）
 * - 折叠日志（沿用 V4 双格式 + stripLogIcons）
 * - [展开监视器] 按钮（onOpenMonitor 可选，未传则不显示）
 * - 无 emoji 图标（用 WxbIcon 或内联 SVG）
 */

import React, { useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import {
    WxbButton,
    WxbIcon,
    WxbKpiCard,
    WxbModal,
    WxbPopconfirm,
    WxbProgress,
    WxbSparkline,
    WxbTag,
} from '../wxb-ui';
import type { WxbTagColor } from '../wxb-ui';
import { stopRunV5, applyRunResultV5 } from '../../services/schedulingV5Api';
import { useSolveStreamV5 } from './monitor/useSolveStreamV5';
import { MONITOR_COLORS } from './monitor/monitorColors';
import type { SolveStreamState } from './monitor/monitorTypes';

// ── 常量 ──────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
    CONSTRAINT: '约束',
    CONFLICT: '冲突',
    SOLVER: '求解',
    PROGRESS: '进度',
    GENERAL: '通用',
};

const PHASE_LABELS: Record<string, string> = {
    BUILDING: '建模',
    PRESOLVE: '预处理',
    SOLVING: '求解中',
    EXTRACTING: '提取解',
    DIAGNOSING: '诊断',
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SolveProgressV5ModalProps {
    visible: boolean;
    runId: number | null;
    onCancel: () => void;
    onViewResults: (runId: number) => void;
    /** 点「展开监视器」时调用（state 由上层持有，本回调只通知打开抽屉） */
    onOpenMonitor?: () => void;
    /**
     * 上层（页面级）持有的 useSolveStreamV5 state。
     * 传入时本组件不自建 EventSource（单连接由上层托管，与监视器抽屉共享）；
     * 不传时回退到内部自建连接（向后兼容）。
     */
    streamState?: SolveStreamState;
    streamIsTerminal?: boolean;
}

// ── 组件 ──────────────────────────────────────────────────────────────────────

const SolveProgressV5Modal: React.FC<SolveProgressV5ModalProps> = ({
    visible,
    runId,
    onCancel,
    onViewResults,
    onOpenMonitor,
    streamState,
    streamIsTerminal,
}) => {
    // 仅当上层未托管 state 时才自建连接，避免与监视器抽屉双开 EventSource（单连接铁律）
    const lifted = streamState !== undefined;
    const internal = useSolveStreamV5(runId, visible && !lifted);
    const state = lifted ? streamState! : internal.state;
    const isTerminal = lifted ? !!streamIsTerminal : internal.isTerminal;
    const logContainerRef = useRef<HTMLDivElement>(null);
    const [applying, setApplying] = useState(false);
    const [isApplied, setIsApplied] = useState(false);
    const [logsExpanded, setLogsExpanded] = useState(false);

    // 重置应用状态（新 runId 时）
    useEffect(() => {
        setApplying(false);
        setIsApplied(false);
        setLogsExpanded(false);
    }, [runId]);

    // 自动滚动日志到底
    useEffect(() => {
        if (logContainerRef.current && logsExpanded) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [state.logs, logsExpanded]);

    // ── 处理器 ─────────────────────────────────────────────────────────────────

    const handleStop = async () => {
        if (!runId) return;
        try {
            await stopRunV5(runId);
        } catch (e) {
            console.error('Stop failed', e);
        }
    };

    const handleApplyResult = async () => {
        if (!runId) return;
        setApplying(true);
        try {
            const data = await applyRunResultV5(runId);
            if (data.success) {
                const d = data.data ?? {};
                const summary = [
                    `批次分配 ${d.batch_assignments_inserted ?? 0} 条`,
                    `独立任务 ${d.standalone_assignments_inserted ?? 0} 条`,
                    `新班次 ${d.shift_plans_inserted ?? 0} 条`,
                ];
                if ((d.shift_plans_reused ?? 0) > 0) summary.push(`复用锁定班次 ${d.shift_plans_reused} 条`);
                if ((d.locked_assignments_skipped ?? 0) > 0) summary.push(`跳过锁定岗位 ${d.locked_assignments_skipped} 条`);
                if ((d.locked_shift_conflicts ?? 0) > 0) summary.push(`跳过锁定班次冲突 ${d.locked_shift_conflicts} 条`);
                message.success(`排班结果已应用：${summary.join('，')}`);
                setIsApplied(true);
            } else {
                message.error(data.error || '应用失败');
            }
        } catch (e) {
            console.error('Apply failed', e);
            message.error('应用失败，请重试');
        } finally {
            setApplying(false);
        }
    };

    // ── 衍生状态 ───────────────────────────────────────────────────────────────

    const isCompleted = state.status === 'COMPLETED' || state.status === 'APPLIED';
    const isFailed = state.status === 'FAILED' || state.status === 'INFEASIBLE';
    const isInfeasible = state.status === 'INFEASIBLE';

    const progressStatus: 'normal' | 'success' | 'error' = isFailed
        ? 'error'
        : isCompleted
        ? 'success'
        : 'normal';

    const statusColor: WxbTagColor = isFailed
        ? 'red'
        : isCompleted
        ? 'green'
        : state.status === 'STOPPING'
        ? 'amber'
        : 'blue';

    // V5 增强：迷你收敛 sparkline（obj 序列），字段缺失时隐藏
    const sparklineData = state.incumbents.map(p => p.obj);
    const latestInc = state.incumbents.length > 0 ? state.incumbents[state.incumbents.length - 1] : null;
    const gapDisplay = latestInc ? `${(latestInc.gap * 100).toFixed(1)}%` : '--';
    const objDisplay = latestInc ? latestInc.obj.toLocaleString() : '--';

    // V5 增强：阶段点（缺失时 null → 不渲染）
    const phaseLabel = state.phase ? (PHASE_LABELS[state.phase] ?? state.phase) : null;
    const assemblingLabel = state.stage === 'ASSEMBLING' ? '组装数据' : null;
    const currentPhaseDisplay = assemblingLabel ?? phaseLabel;

    // ── 渲染 ───────────────────────────────────────────────────────────────────

    return (
        <WxbModal
            open={visible}
            onCancel={onCancel}
            footer={null}
            closable
            width={700}
            centered
            maskClosable={false}
            className="solver-v5-progress-modal"
        >
            <div className="solver-v5-progress-shell">

                {/* Header */}
                <div className="solver-v5-progress-header">
                    <h2 className="solver-v5-progress-title">自动排班进度</h2>
                    <WxbTag color={statusColor}>{state.status}</WxbTag>
                    {/* V5 阶段点（缺失时不渲染，§3.7） */}
                    {currentPhaseDisplay && (
                        <span className="solver-v5-phase-badge">{currentPhaseDisplay}</span>
                    )}
                </div>

                {/* 进度条 */}
                <WxbProgress percent={state.progress} status={progressStatus} />

                {/* KPI 区 */}
                <div className="solver-v5-progress-kpis">
                    {/* V4 基础两卡（始终存在） */}
                    <WxbKpiCard title="已分配班次" value={state.metrics.assigned}>
                        <WxbIcon name="released" size={22} />
                    </WxbKpiCard>
                    <WxbKpiCard title="已用时" value={state.metrics.elapsed}>
                        <WxbIcon name="hold-time" size={22} />
                    </WxbKpiCard>
                    {/* V5 增强：目标值 + 迷你 sparkline（字段缺失时不渲染） */}
                    {latestInc !== null && (
                        <WxbKpiCard title="当前目标值" value={objDisplay}>
                            {sparklineData.length > 1 && (
                                <WxbSparkline
                                    data={sparklineData}
                                    width={60}
                                    height={20}
                                    color={MONITOR_COLORS.objective}
                                />
                            )}
                        </WxbKpiCard>
                    )}
                    {/* V5 增强：Gap（字段缺失时不渲染） */}
                    {latestInc !== null && (
                        <WxbKpiCard title="当前 Gap" value={gapDisplay}>
                            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                                <circle cx="11" cy="11" r="9" stroke="var(--wx-blue-500)" strokeWidth="2" fill="none" />
                                <circle cx="11" cy="11" r="5" fill="var(--wx-blue-100)" />
                            </svg>
                        </WxbKpiCard>
                    )}
                </div>

                {/* 展开监视器按钮（V5 新增，onOpenMonitor 未传则不渲染） */}
                {onOpenMonitor && (
                    <div className="solver-v5-monitor-entry">
                        <WxbButton
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenMonitor()}
                        >
                            {/* 内联 SVG（无 emoji） */}
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                <path
                                    d="M2 2h4v1.5H3.5V5H2V2zm10 0v3H10.5V3.5H9V2h3zM2 9h1.5v1.5H5V12H2V9zm9 1.5H9.5V12H12V9h-1.5v1.5z"
                                    fill="var(--wx-blue-600)"
                                />
                            </svg>
                            展开监视器
                        </WxbButton>
                    </div>
                )}

                {/* 日志区（折叠/展开，沿用 V4 双格式） */}
                <div className="solver-v5-log-section">
                    <div
                        className="solver-v5-log-title"
                        role="button"
                        tabIndex={0}
                        onClick={() => setLogsExpanded(v => !v)}
                        onKeyDown={e => e.key === 'Enter' && setLogsExpanded(v => !v)}
                        aria-expanded={logsExpanded}
                    >
                        <WxbIcon name="inspect" size={15} />
                        实时日志
                        <span className="solver-v5-log-count">({state.logs.length})</span>
                        <span className="solver-v5-log-toggle" aria-hidden="true">
                            {logsExpanded ? '▲' : '▼'}
                        </span>
                    </div>

                    {logsExpanded && (
                        <div ref={logContainerRef} className="solver-v5-log-panel">
                            {state.logs.length === 0 ? (
                                <div className="solver-v5-log-empty">等待求解器日志...</div>
                            ) : (
                                state.logs.map((log, i) => (
                                    <div key={i} className="solver-v5-log-line">
                                        <span className="solver-v5-log-time">[{log.time}]</span>
                                        {log.category && log.category !== 'GENERAL' && (
                                            <span
                                                className={`solver-v5-log-category solver-v5-log-cat-${log.category.toLowerCase()}`}
                                            >
                                                {CATEGORY_LABELS[log.category] ?? log.category}
                                            </span>
                                        )}
                                        <span className={`solver-v5-log-message solver-v5-log-${log.level.toLowerCase()}`}>
                                            {log.message}
                                        </span>
                                    </div>
                                ))
                            )}
                            {!isTerminal && <div className="solver-v5-log-cursor" aria-hidden="true">_</div>}
                        </div>
                    )}
                </div>

                {/* 无解提示（V5 有 infeasibility 时详细展示，否则降级为普通标签，§3.7） */}
                {isFailed && state.infeasibility?.located && (
                    <div className="solver-v5-infeasible-hint">
                        <WxbTag color="red">无可行解</WxbTag>
                        <span className="solver-v5-infeasible-text">
                            检测到 {state.infeasibility.groups.length} 个约束冲突组，展开监视器可查看详情
                        </span>
                    </div>
                )}
                {isInfeasible && !state.infeasibility?.located && (
                    <div className="solver-v5-infeasible-hint">
                        <WxbTag color="red">无可行解</WxbTag>
                        <span className="solver-v5-infeasible-text">
                            约束条件互相冲突，无法生成满足所有条件的排班方案
                        </span>
                    </div>
                )}
                {!isInfeasible && isFailed && !state.infeasibility?.located && (
                    <div className="solver-v5-infeasible-hint">
                        <WxbTag color="red">求解失败</WxbTag>
                        {state.error && (
                            <span className="solver-v5-infeasible-text">{state.error}</span>
                        )}
                    </div>
                )}

                {/* 底部操作区 */}
                <div className="solver-v5-modal-footer">
                    <WxbButton type="button" variant="ghost" onClick={onCancel}>关闭</WxbButton>

                    <div className="solver-v5-action-group">
                        {!isTerminal && (
                            <WxbPopconfirm
                                title="停止排班"
                                description="确定要停止当前排班任务吗？"
                                onConfirm={handleStop}
                                okText="确认停止"
                                cancelText="取消"
                            >
                                <WxbButton
                                    type="button"
                                    variant="danger"
                                    disabled={state.status === 'STOPPING'}
                                    aria-busy={state.status === 'STOPPING' || undefined}
                                >
                                    {state.status === 'STOPPING' ? '停止中...' : '停止排班'}
                                </WxbButton>
                            </WxbPopconfirm>
                        )}

                        {(isCompleted || (isFailed && state.metrics.assigned > 0)) && !isApplied && (
                            <WxbPopconfirm
                                title="应用排班结果"
                                description="将写入新的自动排班数据，但会保留已锁定的操作分配和班次。是否继续？"
                                onConfirm={handleApplyResult}
                                okText="确认应用"
                                cancelText="取消"
                                okButtonProps={{ loading: applying }}
                            >
                                <WxbButton
                                    type="button"
                                    variant="primary"
                                    disabled={applying}
                                    aria-busy={applying || undefined}
                                >
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
                            disabled={!isCompleted && state.metrics.assigned <= 0}
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

export default SolveProgressV5Modal;
