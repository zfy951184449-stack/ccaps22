/**
 * requireAuthStrict —— 无论全局 AUTH_ENFORCE 是否开启,都要求已认证身份。
 *
 * 用途:给"员工自助"等**必须登录**的接口单独强制,而不改动全局影子模式。
 * 链路:全局 requireAuth(影子模式)会在有有效 token 时装配 req.user;本中间件再强制
 * req.user 必须存在,否则 401。于是管理端继续影子(不登录可用),员工接口单独强制登录。
 *
 * 与 authController.me / changePassword 里"if (!req.user) 401"是同一策略,这里抽成中间件复用。
 */
import type { Request, Response, NextFunction } from 'express';
import './authTypes';

export function requireAuthStrict(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }
  next();
}

export default requireAuthStrict;
