/**
 * requirePermission(code) —— 权限校验中间件工厂。
 *
 * 用法：router.post('/x', requirePermission('aps.solve.run'), handler)
 *
 * 判定：
 *   - 影子模式（AUTH_ENFORCE !== 'true'，默认）：始终放行（与 requireAuth 影子语义一致，
 *     避免现有未登录前端被 403）。若有 req.user 仍按其身份记录，但不拦。
 *     例外：options.requireAuthenticatedEvenInShadow=true 时，影子模式下仍要求“已认证”
 *     （无 req.user → 401）。用于 GOVERNANCE 写类高敏端点：影子模式下不强制具体权限，
 *     但绝不接受匿名直连（否则治理写 API 在网络层完全敞开）。仍不校验具体权限码（保持影子语义）。
 *   - 强制模式（AUTH_ENFORCE === 'true'）：
 *       无 req.user → 401 { code:'AUTH_REQUIRED' }（理论上 requireAuth 已先拦，这里兜底）
 *       PermissionCacheService.has() 为 false → 403 { code:'FORBIDDEN', required:<code> }
 *
 * 权限来源走 PermissionCacheService（60s TTL，未命中回源 RbacDirectoryService.getUserPermissions），
 * 不在中间件里写 SQL。
 */
import type { Request, Response, NextFunction } from 'express';
import './authTypes';
import { PermissionCacheService } from '../services/auth/PermissionCacheService';

export interface RequirePermissionOptions {
  /** 影子模式下也要求“已认证”（无 req.user 即 401），但仍不校验具体权限码。默认 false。 */
  requireAuthenticatedEvenInShadow?: boolean;
}

const isEnforced = (): boolean => process.env.AUTH_ENFORCE === 'true';

export function requirePermission(permissionCode: string, options: RequirePermissionOptions = {}) {
  const { requireAuthenticatedEvenInShadow = false } = options;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const enforced = isEnforced();

    if (!req.user) {
      if (!enforced && !requireAuthenticatedEvenInShadow) {
        // 影子模式：匿名也放行。
        next();
        return;
      }
      res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return;
    }

    try {
      const allowed = await PermissionCacheService.has(req.user.userId, permissionCode);
      if (allowed) {
        next();
        return;
      }
      if (!enforced) {
        // 影子模式：缺权限只记录、不拦，便于上线观察"将来谁会被挡"。
        // eslint-disable-next-line no-console
        console.warn(`[requirePermission][shadow] user ${req.user.userId} lacks '${permissionCode}' on ${req.method} ${req.originalUrl}; allowing (shadow)`);
        next();
        return;
      }
      res.status(403).json({ success: false, error: 'Permission denied', code: 'FORBIDDEN', required: permissionCode });
    } catch (error) {
      // 权限回源出错：交给全局错误处理器（500），不要静默放行受保护资源。
      next(error);
    }
  };
}

export default requirePermission;
