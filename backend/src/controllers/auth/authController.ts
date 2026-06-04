/**
 * authController —— /api/auth 路由的处理器（login / me / logout / change-password）。
 *
 * 职责：HTTP 适配层。解析/校验入参 → 调 AuthService（服务层已实现，不重写逻辑）→
 * 把领域错误（AuthError）映射成统一 401/4xx 信封 { success:false, error, code }。
 *
 * 关键约束：
 *   - 不直接碰 DB、不签令牌、不查角色 —— 全部走 AuthService / RbacDirectoryService。
 *   - 成功响应统一 { success:true, data:... }，与现有控制器风格保持一致即可（前端读 data）。
 *   - logout：JWT 无状态，服务端不维护会话；这里仅返回成功，由前端丢弃本地 token。
 *     （将来若上黑名单/刷新令牌，再在此扩展。）
 */
import type { Request, Response, NextFunction } from 'express';
import '../../middleware/authTypes';
import { AuthService } from '../../services/auth/AuthService';
import { AuthError, type AuthErrorCode } from '../../services/auth/IdentityProvider';
import { RbacDirectoryService } from '../../services/governance/RbacDirectoryService';

/** AuthError.code → HTTP status。登录/凭据类一律 401（防枚举 + 简单一致）。 */
const authErrorStatus = (code: AuthErrorCode): number => {
  switch (code) {
    case 'PROVIDER_UNAVAILABLE':
      return 503;
    case 'ACCOUNT_INACTIVE':
    case 'ACCOUNT_LOCKED':
    case 'INVALID_CREDENTIALS':
    default:
      return 401;
  }
};

/**
 * 把认证链上的错误写成统一信封。
 *   - AuthError：用其领域 code + message（这些 message 是我们自定义的安全文案，可外泄）。
 *   - 非 AuthError（如 RBAC/DB 回源抛出的底层异常）：服务端记录原始错误，但对外只回收敛后的
 *     500 信封，绝不把 err.message 透出。这样不依赖全局错误处理器的 NODE_ENV 判断——
 *     即便误以非生产环境部署，认证/授权链也不会泄露表名/SQL 片段给未授权调用方。
 */
const handleAuthError = (error: unknown, res: Response, _next: NextFunction): void => {
  if (error instanceof AuthError) {
    res.status(authErrorStatus(error.code)).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[authController] unexpected error on auth path:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
};

/**
 * POST /api/auth/login
 * body: { username, password } → { token, user, mustChangePassword }
 */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    res.status(400).json({ success: false, error: 'username and password are required', code: 'BAD_REQUEST' });
    return;
  }

  try {
    const result = await AuthService.login(username.trim(), password);
    res.json({ success: true, data: result });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

/**
 * GET /api/auth/me  （需登录）
 * 返回 req.user + 该用户的权限码列表。强制模式下 requireAuth 已保证 req.user 存在；
 * 影子模式下若匿名（无 req.user）→ 401（/me 语义上必须有身份）。
 */
export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  try {
    const permissions = await RbacDirectoryService.getUserPermissions(req.user.userId);
    res.json({
      success: true,
      data: {
        user: req.user,
        permissions: permissions.map((p) => p.permissionCode),
      },
    });
  } catch (error) {
    // RBAC/DB 回源失败：经 handleAuthError 收敛为不含底层 message 的 500，避免泄露。
    handleAuthError(error, res, next);
  }
}

/**
 * POST /api/auth/logout
 * JWT 无状态：服务端无会话可销毁，返回成功，前端自行清除 token。
 */
export async function logout(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: { loggedOut: true } });
}

/**
 * POST /api/auth/change-password  （需登录）
 * body: { oldPassword, newPassword }。改密针对当前登录用户（req.user.userId），
 * 不允许通过 body 指定他人 userId。
 */
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }

  const { oldPassword, newPassword } = (req.body ?? {}) as { oldPassword?: unknown; newPassword?: unknown };
  if (typeof oldPassword !== 'string' || !oldPassword || typeof newPassword !== 'string' || !newPassword) {
    res.status(400).json({ success: false, error: 'oldPassword and newPassword are required', code: 'BAD_REQUEST' });
    return;
  }

  try {
    await AuthService.changePassword(req.user.userId, oldPassword, newPassword);
    res.json({ success: true, data: { changed: true } });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}
