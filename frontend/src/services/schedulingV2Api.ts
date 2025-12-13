/**
 * 排班 V2 API 服务
 */

import axios from 'axios';
import { CreateSolveRequest, CreateSolveResponse, SolveRun } from '../components/ModularScheduling/types';

const API_BASE = '/api/v2/scheduling';

/**
 * API 响应类型
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 创建排班任务
 */
export async function createSolveTask(
  request: CreateSolveRequest
): Promise<CreateSolveResponse> {
  // 前端验证
  if (!request.batchIds || request.batchIds.length === 0) {
    return {
      success: false,
      error: '请选择至少一个批次',
    };
  }

  if (!request.window?.start_date || !request.window?.end_date) {
    return {
      success: false,
      error: '求解区间无效',
    };
  }

  try {
    const response = await axios.post<CreateSolveResponse>(
      `${API_BASE}/solve`,
      request
    );
    return response.data;
  } catch (error: any) {
    // 处理网络错误
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      return {
        success: false,
        error: '网络连接失败，请检查服务器是否运行',
      };
    }

    // 处理超时
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: '请求超时，请稍后重试',
      };
    }

    // 处理服务器错误
    const serverError = error.response?.data?.error;
    if (serverError) {
      return {
        success: false,
        error: serverError,
      };
    }

    return {
      success: false,
      error: error.message || '创建任务失败',
    };
  }
}

/**
 * 获取任务状态
 */
export async function getSolveRunStatus(runId: number): Promise<ApiResponse<SolveRun>> {
  try {
    const response = await axios.get<ApiResponse<SolveRun>>(
      `${API_BASE}/runs/${runId}`
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || '获取状态失败',
    };
  }
}

/**
 * 获取任务结果
 */
export async function getSolveRunResult(runId: number): Promise<ApiResponse<any>> {
  try {
    const response = await axios.get<ApiResponse<any>>(
      `${API_BASE}/runs/${runId}/result`
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || '获取结果失败',
    };
  }
}

/**
 * 重试失败的任务
 */
export async function retrySolveRun(runId: number): Promise<ApiResponse<any>> {
  try {
    const response = await axios.post<ApiResponse<any>>(
      `${API_BASE}/runs/${runId}/retry`
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || '重试失败',
    };
  }
}

/**
 * 取消任务
 */
export async function cancelSolveRun(runId: number): Promise<ApiResponse<any>> {
  try {
    const response = await axios.post<ApiResponse<any>>(
      `${API_BASE}/runs/${runId}/cancel`
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || '取消失败',
    };
  }
}

/**
 * 中断求解并使用当前结果
 * 
 * 请求求解器停止计算，并返回当前找到的最优解。
 * 注意：中断会在下次找到解时生效，可能需要等待片刻。
 */
export async function abortSolveRun(runId: number, requestId: string): Promise<ApiResponse<any>> {
  try {
    const response = await axios.post<ApiResponse<any>>(
      `${API_BASE}/runs/${runId}/abort`,
      { request_id: requestId }
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || '中断失败',
    };
  }
}

/**
 * 获取任务列表
 */
export async function listSolveRuns(
  options?: { limit?: number; offset?: number; status?: string }
): Promise<ApiResponse<SolveRun[]>> {
  try {
    const response = await axios.get<ApiResponse<SolveRun[]>>(
      `${API_BASE}/runs`,
      { params: options }
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || '获取列表失败',
    };
  }
}

/**
 * 检查求解器健康状态
 */
export async function checkSolverHealth(): Promise<ApiResponse<{ status: string; version: string }>> {
  try {
    const response = await axios.get<ApiResponse<{ status: string; version: string }>>(
      `${API_BASE}/solver/health`
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || '求解器服务不可用',
    };
  }
}

/**
 * 轮询任务状态的 Hook 辅助函数（备用方案）
 */
export function pollRunStatus(
  runId: number,
  onUpdate: (run: SolveRun) => void,
  onComplete: (run: SolveRun) => void,
  onError: (error: string) => void,
  intervalMs: number = 2000
): () => void {
  let active = true;

  const poll = async () => {
    if (!active) return;

    const result = await getSolveRunStatus(runId);
    
    if (!active) return;

    if (!result.success || !result.data) {
      onError(result.error || '获取状态失败');
      return;
    }

    const run = result.data;
    onUpdate(run);

    // 检查是否完成
    if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
      onComplete(run);
      return;
    }

    // 继续轮询
    setTimeout(poll, intervalMs);
  };

  poll();

  // 返回取消函数
  return () => {
    active = false;
  };
}

/**
 * 求解器进度数据
 */
export interface SolverProgressData {
  runId: number;
  stage: string;
  progress: number;
  objective?: number;
  elapsed?: number;
  solutionsFound?: number;
  message?: string;
}

/**
 * WebSocket + 轮询混合订阅求解进度
 * 
 * 同时使用 WebSocket 和轮询，确保状态更新不会丢失
 */
export function subscribeToSolveProgress(
  runId: number,
  onProgress: (progress: SolverProgressData) => void,
  onComplete: (run: SolveRun) => void,
  onError: (error: string) => void
): () => void {
  let ws: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let isClosing = false;
  let lastStatus = '';

  // 轮询检查状态（作为 WebSocket 的备份）
  const checkStatus = async () => {
    if (isClosing) return;
    
    try {
      const result = await getSolveRunStatus(runId);
      if (!result.success || !result.data) {
        if (!isClosing) {
          pollTimer = setTimeout(checkStatus, 2000);
        }
        return;
      }

      const run = result.data;
      
      // 更新进度
      if (run.solver_progress && run.status === 'RUNNING') {
        onProgress({
          runId,
          stage: run.stage,
          progress: run.solver_progress.progress_percent,
          objective: run.solver_progress.best_objective ?? undefined,
          elapsed: run.solver_progress.elapsed_seconds,
          solutionsFound: run.solver_progress.solutions_found,
        });
      }

      // 检查是否完成
      if (run.status !== lastStatus) {
        lastStatus = run.status;
        if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
          console.log(`[Poll] 检测到任务完成: ${run.status}`);
          onComplete(run);
          cleanup();
          return;
        }
      }

      // 继续轮询
      if (!isClosing) {
        pollTimer = setTimeout(checkStatus, 2000);
      }
    } catch (e) {
      console.error('[Poll] 状态检查失败:', e);
      if (!isClosing) {
        pollTimer = setTimeout(checkStatus, 3000);
      }
    }
  };

  // WebSocket 连接（提供实时更新）
  const connectWebSocket = () => {
    if (isClosing) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/solver-progress`;
      
      console.log(`[WS] 连接到 ${wsUrl}`);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] 已连接');
        ws?.send(JSON.stringify({ type: 'subscribe', runId }));
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WS] 收到消息:', data);

          if (data.type === 'subscribed') {
            console.log(`[WS] 已订阅 run ${data.runId}`);
            return;
          }

          if (data.type === 'progress') {
            onProgress({
              runId: data.runId,
              stage: data.stage,
              progress: data.progress,
              objective: data.objective,
              elapsed: data.elapsed,
              solutionsFound: data.solutionsFound,
              message: data.message,
            });
            
            if (data.stage === 'COMPLETED' || data.stage === 'FAILED') {
              const result = await getSolveRunStatus(runId);
              if (result.success && result.data) {
                onComplete(result.data);
              }
              cleanup();
            }
          }
        } catch (e) {
          console.error('[WS] 解析消息失败:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] 连接错误:', error);
      };

      ws.onclose = () => {
        console.log('[WS] 连接关闭');
        // WebSocket 关闭后，轮询会继续工作
      };
    } catch (e) {
      console.error('[WS] 创建连接失败:', e);
    }
  };

  const cleanup = () => {
    isClosing = true;
    if (ws) {
      ws.close();
      ws = null;
    }
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  // 同时启动 WebSocket 和轮询
  connectWebSocket();
  pollTimer = setTimeout(checkStatus, 1000); // 1秒后开始轮询

  return cleanup;
}

