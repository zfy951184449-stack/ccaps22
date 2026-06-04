/**
 * IdentityProvider —— 身份认证策略接口（策略模式）。
 *
 * 一个 provider 只回答一件事："凭这些 credentials，你是哪个 userId？"，失败抛错。
 * 它不签令牌、不装配 roles —— 那是 AuthService 的职责。这样将来加 AZURE_AD 时，
 * AuthService 的"认证→签令牌"主流程不用改，只换/挑一个 provider。
 *
 * 失败语义：所有认证失败统一抛 AuthError（带 code），上层据 code 决定 HTTP 响应。
 */
import type { IdentityResult } from '../../domain/auth/authTypes';

/** 认证/登录类失败码（供上层映射 HTTP 状态与文案）。 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS' // 用户名或密码错误（含用户不存在；对外不区分，防枚举）
  | 'ACCOUNT_INACTIVE' // user_status 非 ACTIVE（INACTIVE/RETIRED）
  | 'ACCOUNT_LOCKED' // user_status=LOCKED 或 locked_until 未到期 或 credential_status=DISABLED
  | 'PROVIDER_UNAVAILABLE'; // provider 未实现/未配置（如 AZURE_AD 占位）

/** 认证/登录领域错误。 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export interface IdentityProvider {
  /**
   * 校验凭据并返回 userId。失败必须抛 AuthError，不要返回 null。
   * credentials 形状由具体 provider 约定（本地为 {username,password}）。
   */
  authenticate(credentials: unknown): Promise<IdentityResult>;
}
