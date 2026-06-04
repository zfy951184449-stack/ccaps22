/**
 * JwtService —— 令牌签发与校验（HS256 / jsonwebtoken）。
 *
 * 契约（两实现阶段必须一致）：
 *   sign(claims): string                 —— 入参只含业务声明，iss/aud/exp 由本服务注入
 *   verify(token): JwtClaims             —— 校验签名/iss/aud/exp，失败抛错（区分过期/无效）
 *
 * 环境变量：
 *   JWT_SECRET      （必填，缺失即 fail-fast —— 模块加载时抛错，阻止服务带空密钥启动）
 *   JWT_EXPIRES_IN  （默认 '8h'）
 *   JWT_ISSUER      （默认 'mfg8aps'）
 *   JWT_AUDIENCE    （默认 'mfg8aps-web'）
 *
 * 为什么 fail-fast 放在模块加载：server.ts（下一阶段）会 import 认证链，
 * 模块求值时若没有 JWT_SECRET 直接抛错，比"运行到第一次登录才炸"更早暴露配置缺失。
 */
import jwt from 'jsonwebtoken';
import type { JwtClaims, JwtSignClaims } from '../../domain/auth/authTypes';

/** 校验失败的统一错误：reason 供中间件映射到 401 的 code。 */
export type JwtErrorReason = 'TOKEN_EXPIRED' | 'TOKEN_INVALID';

export class JwtVerifyError extends Error {
  readonly reason: JwtErrorReason;
  constructor(reason: JwtErrorReason, message: string) {
    super(message);
    this.name = 'JwtVerifyError';
    this.reason = reason;
  }
}

const readSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    // fail-fast：绝不允许用空/默认密钥签发或校验令牌。
    throw new Error('JWT_SECRET is not set — refuse to start auth subsystem without a signing secret');
  }
  return secret;
};

// 模块加载即求值一次：缺失 JWT_SECRET 时让进程在启动阶段就失败。
const JWT_SECRET: string = readSecret();
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '8h';
const JWT_ISSUER: string = process.env.JWT_ISSUER || 'mfg8aps';
const JWT_AUDIENCE: string = process.env.JWT_AUDIENCE || 'mfg8aps-web';

export class JwtService {
  /**
   * 用业务声明签发令牌。iss/aud/exp/iat 由本服务统一注入，调用方无法覆盖，保证一致性。
   */
  static sign(claims: JwtSignClaims): string {
    return jwt.sign(
      {
        sub: claims.sub,
        username: claims.username,
        displayName: claims.displayName,
        roles: claims.roles,
        src: claims.src,
      },
      JWT_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: JWT_EXPIRES_IN,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      } as jwt.SignOptions,
    );
  }

  /**
   * 校验令牌（签名 + iss + aud + 过期）。
   * 失败抛 JwtVerifyError：过期 → TOKEN_EXPIRED，其余（签名错/iss/aud 不符/格式坏）→ TOKEN_INVALID。
   * 只验签，不查库（契约要求）。
   */
  static verify(token: string): JwtClaims {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        // 显式锁定单一算法：消除算法漂移面（避免接受 HS384/HS512，且防止 JWT_SECRET 误配成 PEM/公钥
        // 材料时默认算法集随密钥类型变化），与 sign 的 HS256 严格一致。
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      // jsonwebtoken 校验通过后返回 object（我们的 payload 一定是对象，不是 string）。
      return decoded as unknown as JwtClaims;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new JwtVerifyError('TOKEN_EXPIRED', 'token expired');
      }
      // JsonWebTokenError（含 NotBeforeError、签名/iss/aud 不符）一律视作无效。
      throw new JwtVerifyError('TOKEN_INVALID', error instanceof Error ? error.message : 'invalid token');
    }
  }
}
