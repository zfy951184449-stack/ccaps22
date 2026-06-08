/**
 * /api/me —— 员工自助路由(只看自己)。
 *
 * 中间件链:
 *   requireAuthStrict      —— 强制登录(即使全局 AUTH_ENFORCE=false 影子模式也要求 token)
 *   requirePermission(...) —— 强制模式下额外校验 ROSTER_SELF_READ 角色(影子模式只记录不拦)
 * controller 再从登录身份解析 employeeId,强制只查本人 → 三重保障不越权。
 */
import { Router } from 'express';
import requireAuthStrict from '../middleware/requireAuthStrict';
import { requirePermission } from '../middleware/requirePermission';
import { getMyShiftPlans } from '../controllers/meController';

const router = Router();

router.get('/shift-plans', requireAuthStrict, requirePermission('ROSTER_SELF_READ'), getMyShiftPlans);

export default router;
