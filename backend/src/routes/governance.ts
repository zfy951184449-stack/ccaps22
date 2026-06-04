/**
 * /api/governance 路由 —— RBAC 管理 API（供治理配置界面消费）。
 *
 * 装载（见 server.ts）：挂在全局 app.use('/api', requireAuth) 之后，故 req.user 已由全局
 * requireAuth 装配。每个端点再显式挂 requireAuth（幂等，重验同一令牌）+ requirePermission(GOVERNANCE_*)，
 * 让「这条路由需要什么权限」在路由表上一目了然，也便于将来单独复用本 router。
 *
 * 权限矩阵：
 *   权限目录 / 角色读 / 组织树   → GOVERNANCE_ROLE_READ
 *   角色写（建/改/设权限/软删）   → GOVERNANCE_ROLE_WRITE
 *   用户读                       → GOVERNANCE_USER_READ
 *   用户写（建/改档案）          → GOVERNANCE_USER_WRITE
 *   账号启停锁定 / 重置密码       → GOVERNANCE_USER_OPERATE
 *   授予 / 收回用户角色          → GOVERNANCE_ROLE_GRANT
 *
 * 统一信封 { success, data } / { success:false, error, code }，由控制器层产出。
 */
import express from 'express';
import requireAuth from '../middleware/requireAuth';
import requirePermission from '../middleware/requirePermission';
import * as roleController from '../controllers/governance/roleController';
import * as userController from '../controllers/governance/userController';

const router = express.Router();

// 全部治理端点都要求登录态（在全局 requireAuth 之上再兜一层，幂等）。
router.use(requireAuth);

// --- 权限目录 -------------------------------------------------------------
router.get('/permission-catalog', requirePermission('GOVERNANCE_ROLE_READ'), roleController.getPermissionCatalog);

// --- 组织单元（供授权 scope 选择） ----------------------------------------
router.get('/org-units', requirePermission('GOVERNANCE_ROLE_READ'), roleController.getOrgUnits);

// 写类高敏端点：影子模式下也要求“已认证”（拒绝匿名直连），但仍不强制具体权限码。
// 见 requirePermission 的 requireAuthenticatedEvenInShadow 选项与 docs/pending-decisions.md。
const WRITE_GUARD = { requireAuthenticatedEvenInShadow: true } as const;

// --- 角色 -----------------------------------------------------------------
router.get('/roles', requirePermission('GOVERNANCE_ROLE_READ'), roleController.listRoles);
router.get('/roles/:id', requirePermission('GOVERNANCE_ROLE_READ'), roleController.getRole);
router.post('/roles', requirePermission('GOVERNANCE_ROLE_WRITE', WRITE_GUARD), roleController.createRole);
router.put('/roles/:id', requirePermission('GOVERNANCE_ROLE_WRITE', WRITE_GUARD), roleController.updateRole);
router.put('/roles/:id/permissions', requirePermission('GOVERNANCE_ROLE_WRITE', WRITE_GUARD), roleController.setRolePermissions);
router.delete('/roles/:id', requirePermission('GOVERNANCE_ROLE_WRITE', WRITE_GUARD), roleController.deleteRole);

// --- 用户账号 -------------------------------------------------------------
router.get('/users', requirePermission('GOVERNANCE_USER_READ'), userController.listUsers);
router.get('/users/:id', requirePermission('GOVERNANCE_USER_READ'), userController.getUser);
router.post('/users', requirePermission('GOVERNANCE_USER_WRITE', WRITE_GUARD), userController.createUser);
router.put('/users/:id', requirePermission('GOVERNANCE_USER_WRITE', WRITE_GUARD), userController.updateUser);
router.post('/users/:id/reset-password', requirePermission('GOVERNANCE_USER_OPERATE', WRITE_GUARD), userController.resetPassword);

// --- 用户角色授权 ---------------------------------------------------------
router.post('/users/:id/role-assignments', requirePermission('GOVERNANCE_ROLE_GRANT', WRITE_GUARD), userController.assignRole);
router.delete('/users/:id/role-assignments/:assignmentId', requirePermission('GOVERNANCE_ROLE_GRANT', WRITE_GUARD), userController.revokeAssignment);

export default router;
