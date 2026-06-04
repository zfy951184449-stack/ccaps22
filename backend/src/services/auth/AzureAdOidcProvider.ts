/**
 * AzureAdOidcProvider —— Azure AD / Entra ID（OIDC）认证占位实现。
 *
 * 现状：未实现，authenticate() 直接抛错。保留此类是为了把"多 IdP"这件事在接口层固化下来，
 * 让 AuthService 的主流程从一开始就面向 IdentityProvider 编程，将来接 AAD 不动主流程。
 *
 * 将来实现要点（authorization code flow，后端换码）：
 *   1. 前端跳转到 AAD 授权端点拿 authorization code（PKCE）。
 *   2. 后端用 code 向 token 端点换 id_token，校验签名（JWKS）、iss、aud、nonce、exp。
 *   3. 从 id_token 取稳定主体标识（oid/sub）作为 external_subject，
 *      在 users 表里按 (auth_provider='AZURE_AD', external_subject=<oid>) 关联到本地 userId
 *      —— 即"外部身份 → 本地账号"映射；首次登录可按策略 just-in-time 建号或拒绝。
 *   4. 返回 { userId }，后续签 JWT（src='AZURE_AD'）与 LOCAL 完全一致，复用 AuthService.issueToken。
 *
 * 关联字段已在库里就位：users.auth_provider（默认 'LOCAL'）、users.external_subject。
 */
import type { IdentityProvider } from './IdentityProvider';
import { AuthError } from './IdentityProvider';
import type { IdentityResult } from '../../domain/auth/authTypes';

export class AzureAdOidcProvider implements IdentityProvider {
  async authenticate(_credentials: unknown): Promise<IdentityResult> {
    throw new AuthError('PROVIDER_UNAVAILABLE', 'AZURE_AD not implemented');
  }
}
