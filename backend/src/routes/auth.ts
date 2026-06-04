/**
 * /api/auth 路由。
 *
 * 装载顺序（见 server.ts）：本路由挂在全局 app.use('/api', requireAuth) 之前，
 * 因此这里的端点不会自动获得 req.user —— 需要登录态的端点（/me、/change-password）
 * 在路由级别显式挂 requireAuth 来装配 req.user（影子模式下匿名仍放行，由控制器内
 * 的 req.user 判空兜成 401）。
 *
 * 端点：
 *   POST /api/auth/login            公开（取得令牌）
 *   GET  /api/auth/me               需登录（回身份 + 权限码）
 *   POST /api/auth/logout           公开（无状态，前端清 token）
 *   POST /api/auth/change-password  需登录（改当前用户密码）
 */
import express from 'express';
import requireAuth from '../middleware/requireAuth';
import * as authController from '../controllers/auth/authController';

const router = express.Router();

router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);
router.post('/logout', authController.logout);
router.post('/change-password', requireAuth, authController.changePassword);

export default router;
