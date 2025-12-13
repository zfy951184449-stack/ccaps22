/**
 * 排班 V2 路由定义
 */

import { Router } from 'express';
import {
  createSolveTask,
  getRunStatus,
  getRunResult,
  retryRun,
  cancelRun,
  abortRun,
  listRuns,
  checkSolverHealth,
} from '../controllers/schedulingV2Controller';

const router = Router();

// 创建排班任务
router.post('/solve', createSolveTask);

// 列出排班任务
router.get('/runs', listRuns);

// 查询任务状态
router.get('/runs/:runId', getRunStatus);

// 获取任务结果
router.get('/runs/:runId/result', getRunResult);

// 重试失败任务
router.post('/runs/:runId/retry', retryRun);

// 取消任务
router.post('/runs/:runId/cancel', cancelRun);

// 中断求解并使用当前结果
router.post('/runs/:runId/abort', abortRun);

// 求解器健康检查
router.get('/solver/health', checkSolverHealth);

export default router;

