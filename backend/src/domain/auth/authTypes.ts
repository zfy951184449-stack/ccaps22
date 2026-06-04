/**
 * Auth 领域契约（认证 / 令牌 / 登录）。
 *
 * 本文件是认证子系统的"类型权威"，服务层与（下一阶段的）中间件、路由都从这里取类型，
 * 不要在各处各自重新声明 JwtClaims / AuthenticatedUser，避免契约漂移。
 *
 * 与 RBAC 域（domain/governance/rbacTypes.ts）的关系：
 *   - rbacTypes 描述"库里的角色/权限/用户行"（持久化视角）。
 *   - 本文件描述"一次会话/一个令牌里随身携带的身份"（运行时视角）。
 *   - roles 在令牌里是 role_code 字符串列表（来自 RbacDirectoryService.getUserRoles()），
 *     刻意只放 code 不放完整 Role 对象，令牌要小、要稳定。
 */

/** 身份来源：本地密码库 或 Azure AD（OIDC，后续实现）。 */
export type AuthSource = 'LOCAL' | 'AZURE_AD';

/**
 * JWT 载荷（payload）。
 *
 * 注意签发/校验的字段分工：
 *   - sub/username/displayName/roles/src 是我们自定义的业务声明，写进 payload。
 *   - iss/aud 通过 jsonwebtoken 的 issuer/audience 选项注入，verify 时一并校验。
 *   - iat/exp 由 jsonwebtoken 自动写入（expiresIn 选项）。
 * 因此 sign() 的入参只给业务声明（见 JwtSignClaims），iss/aud/iat/exp 在签发时由 JwtService 补齐；
 * verify() 返回的是完整的 JwtClaims（含 iss/aud/iat/exp）。
 */
export interface JwtClaims {
  /** subject = userId（字符串形式，JWT 习惯）。 */
  sub: string;
  username: string;
  displayName: string;
  /** role_code 列表（不是完整 Role 对象）。 */
  roles: string[];
  /** 身份来源。 */
  src: AuthSource;
  /** issued-at（秒级 epoch），由 jsonwebtoken 写入。 */
  iat: number;
  /** expiry（秒级 epoch），由 jsonwebtoken 写入。 */
  exp: number;
  /** issuer，由 JwtService 的 JWT_ISSUER 选项注入。 */
  iss: string;
  /** audience，由 JwtService 的 JWT_AUDIENCE 选项注入。 */
  aud: string;
}

/**
 * sign() 的入参：只含业务声明。
 * iss/aud/iat/exp 不在这里 —— 它们由 JwtService.sign 在签发时通过 jsonwebtoken 选项补齐，
 * 这样调用方不可能传入与服务端不一致的 issuer/audience/过期时间。
 */
export type JwtSignClaims = Pick<JwtClaims, 'sub' | 'username' | 'displayName' | 'roles' | 'src'>;

/**
 * 挂到 Express req.user 上的"已认证用户"（运行时身份）。
 * 与 JwtClaims 的差别：userId 是 number（库里 BIGINT），source 字段名对齐前后端可读性。
 * 中间件层用 `declare global namespace Express { interface Request { user?: AuthenticatedUser } }`
 * 来扩展（放在 middleware/authTypes.ts，下一阶段实现）。
 */
export interface AuthenticatedUser {
  userId: number;
  username: string;
  displayName: string;
  /** role_code 列表。 */
  roles: string[];
  source: AuthSource;
}

/**
 * IdentityProvider.authenticate() 的成功返回。
 * 只回 userId —— provider 只负责"证明你是谁"，组装令牌/装配身份是 AuthService 的事。
 */
export interface IdentityResult {
  userId: number;
}

/** 本地登录凭据。 */
export interface LocalCredentials {
  username: string;
  password: string;
}

/** POST /api/auth/login 的请求体。 */
export interface LoginRequest {
  username: string;
  password: string;
}

/** AuthService.login() 的返回（也是 /api/auth/login 的响应数据）。 */
export interface LoginResult {
  token: string;
  user: AuthenticatedUser;
  /** 为 true 时前端应强制走"首次/强制改密"流程。 */
  mustChangePassword: boolean;
}

/** POST /api/auth/change-password 的请求体。 */
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}
