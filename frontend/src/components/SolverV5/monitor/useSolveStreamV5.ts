/**
 * useSolveStreamV5 — SSE 消费 hook（唯一数据中枢）
 *
 * 设计约束（§6.2 + §8）：
 * - 单 EventSource：addEventListener('progress') + onmessage 兜底
 * - solver_progress 字符串先 JSON.parse
 * - 日志增量切片：logs_full 优先 + stripLogIcons
 * - incumbent 累积：超 300 点降采样（保头+尾+等距）
 * - phase/phaseTimings 跟踪（solver 内部 5 值）
 * - DIAGNOSIS → infeasibility 写入
 * - terminal（COMPLETED|APPLIED|FAILED）→ evtSource.close()
 * - SolveProgressV5Modal 持有此 hook，把 state props 传给 SolveMonitorV5Drawer（不双连接）
 */

import { useState, useEffect, useRef } from 'react';
import { getRunProgressSseUrl } from '../../../services/schedulingV5Api';
import type {
  SolveStreamState,
  SolverProgressPayload,
  PhaseKey,
  LogLine,
  IncumbentPoint,
} from './monitorTypes';

// ── 常量 ──────────────────────────────────────────────────────────────────────

const INCUMBENT_MAX = 300;
const SEARCH_HISTORY_MAX = 60;
const LOG_MAX = 1000;

const TERMINAL_STATUSES = new Set(['COMPLETED', 'APPLIED', 'FAILED', 'INFEASIBLE']);

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

/** 剥掉日志中的 emoji（沿用 V4 SolveProgressV4Modal 实现） */
export const stripLogIcons = (value: string): string =>
  value.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, '').trim();

/**
 * 降采样：保留首 + 尾 + 等距内部（总 ≤ max 点），始终保留最新末点
 */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const result: T[] = [arr[0]];
  const interior = max - 2;
  const step = (arr.length - 2) / (interior + 1);
  for (let i = 0; i < interior; i++) {
    result.push(arr[Math.round(step * (i + 1))]);
  }
  result.push(arr[arr.length - 1]);
  return result;
}

/** 把 ms 格式化为 mm:ss */
function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 初始状态工厂 */
function makeInitialState(): SolveStreamState {
  return {
    status: 'INIT',
    stage: 'INIT',
    progress: 0,
    phase: null,
    phaseTimings: {},
    modelStats: null,
    incumbents: [],
    latestPreview: null,
    searchStats: null,
    searchHistory: { branches: [], conflicts: [] },
    logs: [],
    infeasibility: null,
    metrics: { assigned: 0, elapsed: '00:00' },
    error: null,
  };
}

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * 订阅 V5 SSE 进度流，返回累积状态 + isTerminal 标志。
 *
 * @param runId - 当前求解运行 ID；null 时不建连接
 * @param open  - 组件是否打开（false 时关闭并重置）
 */
export function useSolveStreamV5(
  runId: number | null,
  open: boolean,
): { state: SolveStreamState; isTerminal: boolean } {
  const [state, setState] = useState<SolveStreamState>(makeInitialState);
  const evtSourceRef = useRef<EventSource | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open || runId === null) {
      // 关闭连接并重置
      if (evtSourceRef.current) {
        evtSourceRef.current.close();
        evtSourceRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setState(makeInitialState());
      return;
    }

    // 已有连接则先关
    if (evtSourceRef.current) {
      evtSourceRef.current.close();
      evtSourceRef.current = null;
    }

    startTimeRef.current = Date.now();

    // 启动计时器（每秒更新已用时）
    timerRef.current = setInterval(() => {
      setState(prev => {
        if (TERMINAL_STATUSES.has(prev.status)) return prev;
        return {
          ...prev,
          metrics: {
            ...prev.metrics,
            elapsed: fmtElapsed(Date.now() - startTimeRef.current),
          },
        };
      });
    }, 1000);

    const url = getRunProgressSseUrl(runId);
    const evtSource = new EventSource(url);
    evtSourceRef.current = evtSource;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        processPayload(data);
      } catch {
        // 忽略解析错误
      }
    };

    // V5 backend 发 named event 'progress'；同时保留 onmessage 兜底
    evtSource.addEventListener('progress', handleMessage);
    evtSource.onmessage = handleMessage;

    evtSource.onerror = () => {
      evtSource.close();
    };

    function closeConnection() {
      if (evtSourceRef.current) {
        evtSourceRef.current.close();
        evtSourceRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    function processPayload(data: Record<string, unknown>) {
      // 检测是否 terminal
      const dataStatus = typeof data.status === 'string' ? data.status : null;

      setState(prev => {
        const next = { ...prev };

        // ── 外层字段 ─────────────────────────────────────────────────────────
        if (dataStatus) {
          next.status = dataStatus;
          if (dataStatus === 'COMPLETED' || dataStatus === 'APPLIED') {
            next.progress = 100;
          }
        }
        if (typeof data.stage === 'string') {
          next.stage = data.stage;
        }
        if (data.error !== undefined) {
          next.error = typeof data.error === 'string' ? data.error : null;
        }

        // ── solver_progress（可能是字符串） ───────────────────────────────
        const rawSp = data.solver_progress;
        if (!rawSp) return next;

        let sp: SolverProgressPayload;
        try {
          sp = (typeof rawSp === 'string' ? JSON.parse(rawSp) : rawSp) as SolverProgressPayload;
        } catch {
          return next;
        }

        // progress
        if (typeof sp.progress === 'number') {
          next.progress = sp.progress;
        }

        // metrics（assigned_count）
        if (sp.metrics && typeof sp.metrics.assigned_count === 'number') {
          next.metrics = {
            ...next.metrics,
            assigned: sp.metrics.assigned_count,
          };
        }

        // ── 日志增量切片（logs_full 优先，stripLogIcons） ─────────────────
        if (sp.logs_full && Array.isArray(sp.logs_full)) {
          const prevCount = prev.logs.length;
          const newCount = sp.logs_full.length;
          if (newCount > prevCount) {
            const newItems: LogLine[] = sp.logs_full.slice(prevCount).map((l) => ({
              time: l.time || new Date().toLocaleTimeString(),
              message: stripLogIcons(l.message || ''),
              level: (['INFO', 'SUCCESS', 'WARNING', 'ERROR'].includes(l.level || '')
                ? l.level
                : 'INFO') as LogLine['level'],
              category: (['GENERAL', 'CONSTRAINT', 'CONFLICT', 'SOLVER', 'PROGRESS'].includes(l.category || '')
                ? l.category
                : 'GENERAL') as LogLine['category'],
            }));
            const combined = [...prev.logs, ...newItems];
            next.logs = combined.length > LOG_MAX ? combined.slice(-LOG_MAX) : combined;
          }
        } else if (sp.logs && Array.isArray(sp.logs)) {
          const prevCount = prev.logs.length;
          const newCount = sp.logs.length;
          if (newCount > prevCount) {
            const newItems: LogLine[] = (sp.logs as string[]).slice(prevCount).map((l: string) => ({
              time: new Date().toLocaleTimeString(),
              message: stripLogIcons(l),
              level: (/error|failed|失败|错误/i.test(l)
                ? 'ERROR'
                : /warning|warn|警告/i.test(l)
                ? 'WARNING'
                : /success|completed|完成|通过/i.test(l)
                ? 'SUCCESS'
                : 'INFO') as LogLine['level'],
              category: 'GENERAL' as LogLine['category'],
            }));
            const combined = [...prev.logs, ...newItems];
            next.logs = combined.length > LOG_MAX ? combined.slice(-LOG_MAX) : combined;
          }
        }

        // ── V5 累积结构：用后端已裁剪好的 convergence 数组（优先）─────────
        if (sp.convergence && Array.isArray(sp.convergence) && sp.convergence.length > 0) {
          next.incumbents = sp.convergence;
          const last = sp.convergence[sp.convergence.length - 1];
          if (last?.preview !== undefined) {
            next.latestPreview = last.preview ?? null;
          }
        }

        // ── incumbent（NEW_INCUMBENT 单点，来自实时回调，未经后端 convergence 裁剪） ──
        if (sp.incumbent) {
          const inc = sp.incumbent;
          if (
            typeof inc.wall_time === 'number' &&
            typeof inc.obj === 'number' &&
            typeof inc.bound === 'number' &&
            typeof inc.gap === 'number'
          ) {
            const point: IncumbentPoint = {
              wall_time: inc.wall_time,
              obj: inc.obj,
              bound: inc.bound,
              gap: inc.gap,
              solution_count: typeof inc.solution_count === 'number' ? inc.solution_count : 0,
              breakdown: inc.breakdown,
              preview: inc.preview !== undefined ? inc.preview : null,
            };
            // 避免重复：若 convergence 已经处理，不再 push 相同点
            if (!sp.convergence) {
              const raw = [...prev.incumbents, point];
              next.incumbents = downsample(raw, INCUMBENT_MAX);
            }
            if (inc.preview !== undefined) {
              next.latestPreview = inc.preview ?? null;
            }
          }
        }

        // ── phase 更新（solver 内部 5 值，不含 ASSEMBLING）────────────────
        if (sp.phase !== undefined) {
          next.phase = sp.phase ?? null;
        }

        // phase_timings 合并
        if (sp.phase_timings) {
          next.phaseTimings = {
            ...prev.phaseTimings,
            ...(sp.phase_timings as Partial<Record<PhaseKey, number>>),
          };
        }

        // ── model_stats（MODEL_STATS 事件，一次性） ───────────────────────
        if (sp.model_stats !== undefined) {
          next.modelStats = sp.model_stats ?? null;
        }

        // ── search_stats ──────────────────────────────────────────────────
        if (sp.search_stats) {
          next.searchStats = sp.search_stats;
          const branches = [...prev.searchHistory.branches, sp.search_stats.branches].slice(-SEARCH_HISTORY_MAX);
          const conflicts = [...prev.searchHistory.conflicts, sp.search_stats.conflicts].slice(-SEARCH_HISTORY_MAX);
          next.searchHistory = { branches, conflicts };
        }

        // ── infeasibility（DIAGNOSIS 事件） ───────────────────────────────
        if (sp.infeasibility !== undefined) {
          next.infeasibility = sp.infeasibility ?? null;
        }

        return next;
      });

      // terminal 状态 → 关闭连接
      if (dataStatus && TERMINAL_STATUSES.has(dataStatus)) {
        closeConnection();
        setState(prev => ({
          ...prev,
          metrics: {
            ...prev.metrics,
            elapsed: fmtElapsed(Date.now() - startTimeRef.current),
          },
        }));
      }
    }

    return () => {
      closeConnection();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, open]);

  const isTerminal = TERMINAL_STATUSES.has(state.status);

  return { state, isTerminal };
}
