import express from 'express';
import * as schedulingV5Controller from '../controllers/schedulingV5';
import requireServiceAuth from '../middleware/requireServiceAuth';
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';

const router = express.Router();

// scope resolver：apply 写端点归属 = 该 run 关联批次→模板的 team。
// run 可跨多团队：单一 team→按常规判定；零/多团队/解析不到→保守要求全局（resolveRunUnit 内返回哨兵）。
const applyRunScope = (req: express.Request) =>
  ScopeService.resolveRunUnit(Number(req.params.runId));

// 0. List Run History
/**
 * @route GET /api/v5/scheduling/runs
 * @desc List V5 solver run history
 * @access Private
 */
router.get('/runs', requirePermission('SOLVER_RUN_READ'), schedulingV5Controller.listRunsV5);

// 1. Trigger Solve
/**
 * @route POST /api/v5/scheduling/solve
 * @desc Trigger a new V5 solver task
 * @access Private
 */
router.post('/solve', requirePermission('SOLVER_RUN_EXECUTE'), schedulingV5Controller.createSolveTaskV5);

// 2. SSE Progress Stream
/**
 * @route GET /api/v5/scheduling/runs/:runId/progress
 * @desc Get real-time progress via SSE
 * @access Private
 */
router.get('/runs/:runId/progress', requirePermission('SOLVER_RUN_READ'), schedulingV5Controller.getSolveProgressSSEV5);

// 3. Internal Callback (for Python Solver) — machine-to-machine, guarded by shared secret.
// 注意：这两个回调由 solver 进程调用，带 X-Solver-Callback-Token，不走人类用户的 JWT；
// 故用 requireServiceAuth 校验共享密钥（server.ts 已把 /callback/* 排除在全局 requireAuth 之外）。
router.post('/callback/progress', requireServiceAuth, schedulingV5Controller.updateSolveProgressV5);

// 3b. Internal Callback for Final Result (for Python Solver)
router.post('/callback/result', requireServiceAuth, schedulingV5Controller.receiveSolveResultV5);

// 4. Get Solve Results
/**
 * @route GET /api/v5/scheduling/runs/:runId/result
 * @desc Get the results of a V5 solver run
 * @access Private
 */
router.get('/runs/:runId/result', requirePermission('SOLVER_RUN_READ'), schedulingV5Controller.getSolveResultV5);

// 5. Stop Solver
/**
 * @route POST /api/v5/scheduling/runs/:runId/stop
 * @desc Manually stop a V5 solver run
 * @access Private
 */
router.post('/runs/:runId/stop', requirePermission('SOLVER_RUN_ABORT'), schedulingV5Controller.stopSolveV5);

// 6. Get Solve Status (Lightweight for polling)
/**
 * @route GET /api/v5/scheduling/runs/:runId/status
 * @desc Get the current status of a V5 solver run
 * @access Service (machine-to-machine)
 *
 * 鉴权：此端点由 solver 进程轮询（poll_server_stop），server.ts 已把它排除在全局 requireAuth
 * （人类 JWT）之外。但若不设防，AUTH_ENFORCE=true 时任何匿名方猜到/遍历 runId 即可读取求解运行
 * 状态（敏感调度信息越权读取）。故与 /callback/* 一致挂 requireServiceAuth（共享密钥 X-Solver-
 * Callback-Token）。SOLVER_CALLBACK_SECRET 未配置时返回 503（与回调一致）；solver 轮询失败仅退化为
 * "无法经轮询感知服务端停止"，poll_server_stop 只在 200 时动作，非 200 静默忽略，不影响求解正确性。
 */
router.get('/runs/:runId/status', requireServiceAuth, schedulingV5Controller.getSolveStatusV5);

// 7. Apply Solver Result to Production Tables
/**
 * @route POST /api/v5/scheduling/runs/:runId/apply
 * @desc Apply V5 solver result to batch_personnel_assignments and employee_shift_plans
 * @access Private
 */
router.post('/runs/:runId/apply', requirePermission('SOLVER_RESULT_APPLY'), requireScope(applyRunScope), schedulingV5Controller.applySolveResultV5);

// 8. Precheck (OPT-15 API)
/**
 * @route POST /api/v5/scheduling/precheck
 * @desc Run pre-solve sanity checks without starting solver
 * @access Private
 */
router.post('/precheck', requirePermission('SOLVER_RUN_READ'), schedulingV5Controller.runPrecheckV5);

// 9. Preview-only Proposal
/**
 * @route POST /api/v5/scheduling/preview-proposal
 * @desc Run a preview-only solver proposal with in-memory operation time overrides
 * @access Private
 */
router.post('/preview-proposal', requirePermission('SOLVER_RUN_READ'), schedulingV5Controller.createPreviewProposalV5);

export default router;
