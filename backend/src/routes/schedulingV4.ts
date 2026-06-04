import express from 'express';
import * as schedulingV4Controller from '../controllers/schedulingV4';
import requireServiceAuth from '../middleware/requireServiceAuth';

const router = express.Router();

// 0. List Run History
/**
 * @route GET /api/v4/scheduling/runs
 * @desc List V4 solver run history
 * @access Private
 */
router.get('/runs', schedulingV4Controller.listRunsV4);

// 1. Trigger Solve
/**
 * @route POST /api/v4/scheduling/solve
 * @desc Trigger a new V4 solver task
 * @access Private
 */
router.post('/solve', schedulingV4Controller.createSolveTaskV4);

// 2. SSE Progress Stream
/**
 * @route GET /api/v4/scheduling/runs/:runId/progress
 * @desc Get real-time progress via SSE
 * @access Private
 */
router.get('/runs/:runId/progress', schedulingV4Controller.getSolveProgressSSEV4);

// 3. Internal Callback (for Python Solver) — machine-to-machine, guarded by shared secret.
// 注意：这两个回调由 solver 进程调用，带 X-Solver-Callback-Token，不走人类用户的 JWT；
// 故用 requireServiceAuth 校验共享密钥（server.ts 已把 /callback/* 排除在全局 requireAuth 之外）。
router.post('/callback/progress', requireServiceAuth, schedulingV4Controller.updateSolveProgressV4);

// 3b. Internal Callback for Final Result (for Python Solver)
router.post('/callback/result', requireServiceAuth, schedulingV4Controller.receiveSolveResultV4);

// 4. Get Solve Results
/**
 * @route GET /api/v4/scheduling/runs/:runId/result
 * @desc Get the results of a V4 solver run
 * @access Private
 */
router.get('/runs/:runId/result', schedulingV4Controller.getSolveResultV4);

// 5. Stop Solver
/**
 * @route POST /api/v4/scheduling/runs/:runId/stop
 * @desc Manually stop a V4 solver run
 * @access Private
 */
router.post('/runs/:runId/stop', schedulingV4Controller.stopSolveV4);

// 6. Get Solve Status (Lightweight for polling)
/**
 * @route GET /api/v4/scheduling/runs/:runId/status
 * @desc Get the current status of a V4 solver run
 * @access Service (machine-to-machine)
 *
 * 鉴权：此端点由 solver 进程轮询（poll_server_stop），server.ts 已把它排除在全局 requireAuth
 * （人类 JWT）之外。但若不设防，AUTH_ENFORCE=true 时任何匿名方猜到/遍历 runId 即可读取求解运行
 * 状态（敏感调度信息越权读取）。故与 /callback/* 一致挂 requireServiceAuth（共享密钥 X-Solver-
 * Callback-Token）。SOLVER_CALLBACK_SECRET 未配置时返回 503（与回调一致）；solver 轮询失败仅退化为
 * "无法经轮询感知服务端停止"，poll_server_stop 只在 200 时动作，非 200 静默忽略，不影响求解正确性。
 */
router.get('/runs/:runId/status', requireServiceAuth, schedulingV4Controller.getSolveStatusV4);

// 7. Apply Solver Result to Production Tables
/**
 * @route POST /api/v4/scheduling/runs/:runId/apply
 * @desc Apply V4 solver result to batch_personnel_assignments and employee_shift_plans
 * @access Private
 */
router.post('/runs/:runId/apply', schedulingV4Controller.applySolveResultV4);

// 8. Precheck (OPT-15 API)
/**
 * @route POST /api/v4/scheduling/precheck
 * @desc Run pre-solve sanity checks without starting solver
 * @access Private
 */
router.post('/precheck', schedulingV4Controller.runPrecheckV4);

// 9. Preview-only Proposal
/**
 * @route POST /api/v4/scheduling/preview-proposal
 * @desc Run a preview-only solver proposal with in-memory operation time overrides
 * @access Private
 */
router.post('/preview-proposal', schedulingV4Controller.createPreviewProposalV4);

export default router;
