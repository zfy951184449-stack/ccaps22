/**
 * 排班 V3 路由定义
 * 
 * V3 求解器的后端 API 路由，完全独立于 V2。
 * 调用 solver_v3 服务 (端口 5002)
 */

import { Router } from 'express';
import {
    createSolveTaskV3,
    getRunStatusV3,
    getRunResultV3,
    cancelRunV3,
    listRunsV3,
    checkSolverHealthV3,
    getSolveProgressSSE,
    applyRunResultV3,
} from '../controllers/schedulingV3Controller';

const router = Router();

// 创建 V3 排班任务
router.post('/solve', createSolveTaskV3);

// 列出 V3 排班任务
router.get('/runs', listRunsV3);

// 查询任务状态
router.get('/runs/:runId', getRunStatusV3);

// SSE 进度推送
router.get('/runs/:runId/progress', getSolveProgressSSE);

// 获取任务结果
router.get('/runs/:runId/result', getRunResultV3);

// 应用结果到系统
router.post('/runs/:runId/apply', applyRunResultV3);

// 取消/中止求解任务
router.post('/runs/:runId/cancel', cancelRunV3);

// V3 求解器健康检查
router.get('/solver/health', checkSolverHealthV3);

export default router;
