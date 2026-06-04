/**
 * requireServiceAuth —— 机器对机器（solver → backend 回调）认证中间件。
 *
 * 校验请求头 'X-Solver-Callback-Token' 是否等于 env SOLVER_CALLBACK_SECRET，
 * 用 crypto.timingSafeEqual 做常量时间比较以防时序侧信道。
 *
 * 失败语义（统一信封 { success:false, error, code }）：
 *   - env SOLVER_CALLBACK_SECRET 未配置 → 503 { code:'SERVICE_AUTH_UNCONFIGURED' }
 *     （拒绝在"没设密钥"的情况下放行机器回调；也避免把回调暴露成无鉴权）
 *   - 头缺失 / 长度不等 / 值不匹配 → 401 { code:'SERVICE_AUTH_FAILED' }
 *
 * 注意：这条不受 AUTH_ENFORCE 影子开关影响 —— solver 回调本就该带共享密钥；
 * 但若密钥未配置则降级为 503（运维可见的"未配置"信号），而不是 500/裸放行。
 * 与人类用户的 requireAuth 不同：这里不挂 req.user。
 */
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const HEADER_NAME = 'x-solver-callback-token';

/** 常量时间比较两个字符串：长度不等直接判否（且不泄露长度信息给计时）。 */
const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

export function requireServiceAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.SOLVER_CALLBACK_SECRET;
  if (!secret || secret.trim().length === 0) {
    res.status(503).json({
      success: false,
      error: 'Service callback authentication is not configured',
      code: 'SERVICE_AUTH_UNCONFIGURED',
    });
    return;
  }

  const provided = req.headers[HEADER_NAME];
  const token = Array.isArray(provided) ? provided[0] : provided;

  if (!token || typeof token !== 'string' || !safeEqual(token, secret)) {
    res.status(401).json({
      success: false,
      error: 'Service authentication failed',
      code: 'SERVICE_AUTH_FAILED',
    });
    return;
  }

  next();
}

export default requireServiceAuth;
