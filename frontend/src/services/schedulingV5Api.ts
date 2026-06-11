/**
 * V5 求解 API 服务层（集中化，修 06 文档坑「V4 fetch 散落各组件」）
 *
 * 规则（§1.1 冻结契约 + AGENTS.md）：
 *   - 全部使用相对路径 /api/v5/scheduling/* ，严禁硬编码 host
 *   - SSE 例外：EventSource 仍在 useSolveStreamV5.ts 里建（SSE 不走 axios）
 *   - 权限码沿用 V4，不新增
 */

import type { SolverConfig } from '../types/solverV5';
import type { SolveRunV5, SolveResultV5 } from '../types/solverV5';

/** API 基础路径（相对路径，无 host） */
const BASE = '/api/v5/scheduling';

// ── 通用 fetch 封装 ────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = (() => {
    try { return localStorage.getItem('auth_token'); } catch { return null; }
  })();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      errMsg = body.error || body.message || errMsg;
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}

// ── Solve ──────────────────────────────────────────────────────────────────────

export interface SolveRequest {
  batch_ids: number[];
  solve_start_date: string;
  solve_end_date: string;
  config?: Partial<SolverConfig>;
}

export interface SolveResponse {
  success: boolean;
  run_id?: number;
  error?: string;
}

/**
 * 发起 V5 求解（SOLVER_RUN_EXECUTE）
 * POST /api/v5/scheduling/solve
 */
export async function solveV5(req: SolveRequest): Promise<SolveResponse> {
  return apiFetch<SolveResponse>(`${BASE}/solve`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ── Precheck ──────────────────────────────────────────────────────────────────

export interface PrecheckRequest {
  batch_ids: number[];
  solve_start_date: string;
  solve_end_date: string;
  config?: Partial<SolverConfig>;
}

export interface PrecheckResponse {
  success: boolean;
  warnings?: Array<{ code: string; message: string; [key: string]: unknown }>;
  errors?: Array<{ code: string; message: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * 预检（SOLVER_RUN_READ）
 * POST /api/v5/scheduling/precheck
 */
export async function precheckV5(req: PrecheckRequest): Promise<PrecheckResponse> {
  return apiFetch<PrecheckResponse>(`${BASE}/precheck`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ── Preview Proposal ──────────────────────────────────────────────────────────

export interface PreviewRequest {
  batch_ids: number[];
  solve_start_date: string;
  solve_end_date: string;
  config?: Partial<SolverConfig>;
}

export interface PreviewResponse {
  success: boolean;
  preview?: unknown;
  capability_gap?: { code: string; message?: string };
  [key: string]: unknown;
}

/**
 * 预览提案（SOLVER_RUN_READ）
 * POST /api/v5/scheduling/preview-proposal
 */
export async function previewProposalV5(req: PreviewRequest): Promise<PreviewResponse> {
  return apiFetch<PreviewResponse>(`${BASE}/preview-proposal`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ── Run List ──────────────────────────────────────────────────────────────────

export interface GetRunsResponse {
  success: boolean;
  data?: SolveRunV5[];
  [key: string]: unknown;
}

/**
 * 获取 V5 历史运行列表（SOLVER_RUN_READ）
 * GET /api/v5/scheduling/runs  （WHERE run_code LIKE 'V5-%'）
 */
export async function getRunsV5(): Promise<GetRunsResponse> {
  return apiFetch<GetRunsResponse>(`${BASE}/runs`);
}

// ── Run Status ────────────────────────────────────────────────────────────────

export interface GetRunStatusResponse {
  success: boolean;
  status?: string;
  stage?: string;
  [key: string]: unknown;
}

/**
 * 查询单次运行状态（机器路径，SOLVER_RUN_READ）
 * GET /api/v5/scheduling/runs/:id/status
 */
export async function getRunStatusV5(runId: number): Promise<GetRunStatusResponse> {
  return apiFetch<GetRunStatusResponse>(`${BASE}/runs/${runId}/status`);
}

// ── Run Result ────────────────────────────────────────────────────────────────

export interface GetResultResponse {
  success: boolean;
  data?: SolveResultV5;
  infeasibility_analysis?: unknown;
  objective_breakdown?: unknown;
  viz?: unknown;
  [key: string]: unknown;
}

/**
 * 获取求解结果（SOLVER_RUN_READ）
 * GET /api/v5/scheduling/runs/:id/result
 */
export async function getRunResultV5(runId: number): Promise<GetResultResponse> {
  return apiFetch<GetResultResponse>(`${BASE}/runs/${runId}/result`);
}

// ── Stop ──────────────────────────────────────────────────────────────────────

export interface StopResponse {
  success: boolean;
  message?: string;
}

/**
 * 停止求解（SOLVER_RUN_ABORT）
 * POST /api/v5/scheduling/runs/:id/stop
 */
export async function stopRunV5(runId: number): Promise<StopResponse> {
  return apiFetch<StopResponse>(`${BASE}/runs/${runId}/stop`, {
    method: 'POST',
  });
}

// ── Apply ─────────────────────────────────────────────────────────────────────

export interface ApplyResponse {
  success: boolean;
  data?: {
    batch_assignments_inserted?: number;
    standalone_assignments_inserted?: number;
    shift_plans_inserted?: number;
    shift_plans_reused?: number;
    locked_assignments_skipped?: number;
    locked_shift_conflicts?: number;
    [key: string]: unknown;
  };
  error?: string;
}

/**
 * 应用排班结果（SOLVER_RESULT_APPLY）
 * POST /api/v5/scheduling/runs/:id/apply
 */
export async function applyRunResultV5(runId: number): Promise<ApplyResponse> {
  return apiFetch<ApplyResponse>(`${BASE}/runs/${runId}/apply`, {
    method: 'POST',
  });
}

// ── SSE URL helper（EventSource 不走 fetch，在 hook 里使用）─────────────────

/**
 * 返回 SSE 进度端点相对 URL（前端 hook 建 EventSource 时使用）
 * GET /api/v5/scheduling/runs/:id/progress  （SSE）
 *
 * 注意：此函数不发请求，只构造 URL，以便调用方能 new EventSource(url)。
 */
export function getRunProgressSseUrl(runId: number): string {
  return `${BASE}/runs/${runId}/progress`;
}
