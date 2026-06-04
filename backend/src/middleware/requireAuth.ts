/**
 * requireAuth —— 令牌认证中间件（仅验签，不查库）。
 *
 * 两种运行模式由 env AUTH_ENFORCE 切换：
 *   - 影子模式（AUTH_ENFORCE !== 'true'，默认）：
 *       有 Bearer token → 验签成功就把 req.user 装配上；
 *       无 token / 验签失败 → **绝不拦截**，仅 console 记录后 next()。
 *       目的：在不破坏现有前端（尚未接入登录）的前提下，先让认证链上线观察。
 *   - 强制模式（AUTH_ENFORCE === 'true'）：
 *       无 token → 401 { code: 'AUTH_REQUIRED' }
 *       验签失败 → 401 { code: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' }（来自 JwtVerifyError.reason）
 *
 * 设计要点：
 *   - 只调 JwtService.verify（验签 + iss/aud/exp），不查库。AuthenticatedUser 所需字段
 *     （userId/username/displayName/roles/source）claims 全有，可直接由 claims 组装。
 *   - 统一 401 信封：{ success:false, error, code }（与全局错误处理器一致）。
 */
import type { Request, Response, NextFunction } from 'express';
import './authTypes';
import { JwtService, JwtVerifyError } from '../services/auth/JwtService';
import type { AuthenticatedUser, JwtClaims } from '../domain/auth/authTypes';

/** 是否强制认证（默认影子模式）。每次请求读 env，便于测试切换。 */
const isEnforced = (): boolean => process.env.AUTH_ENFORCE === 'true';

/** 从 Authorization: Bearer <token> 取出 token，没有则返回 null。 */
const extractBearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
};

/** 由 JWT 声明组装挂到 req.user 的运行时身份（无需查库）。 */
const toAuthenticatedUser = (claims: JwtClaims): AuthenticatedUser => ({
  userId: Number(claims.sub),
  username: claims.username,
  displayName: claims.displayName,
  roles: Array.isArray(claims.roles) ? claims.roles : [],
  source: claims.src,
});

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const enforced = isEnforced();
  const token = extractBearerToken(req);

  // 无 token
  if (!token) {
    if (enforced) {
      res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return;
    }
    // 影子模式：放行（匿名）。
    next();
    return;
  }

  // 有 token：验签
  try {
    const claims = JwtService.verify(token);
    req.user = toAuthenticatedUser(claims);
    next();
  } catch (error) {
    if (enforced) {
      const code = error instanceof JwtVerifyError ? error.reason : 'TOKEN_INVALID';
      res.status(401).json({ success: false, error: 'Invalid or expired token', code });
      return;
    }
    // 影子模式：坏 token 也不拦，仅记录，按匿名继续。
    const reason = error instanceof JwtVerifyError ? error.reason : 'TOKEN_INVALID';
    // eslint-disable-next-line no-console
    console.warn(`[requireAuth][shadow] bearer token rejected (${reason}) on ${req.method} ${req.originalUrl}; continuing as anonymous`);
    next();
  }
}

export default requireAuth;
