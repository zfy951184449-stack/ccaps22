/**
 * authApi —— 对接后端 /api/auth/* 端点（login / me / logout / change-password）。
 *
 * 复用 services/api.ts 的共享 axios 实例（已装配 Bearer 注入与 401/403 拦截）。
 * 统一响应信封：成功 { success:true, data }，失败 { success:false, error, code }。
 * 这里只解包 data 给上层（AuthContext / LoginPage），错误以 axios 异常向上抛。
 */
import api from './api';

/** 身份来源：本地密码库 或 Azure AD。 */
export type AuthSource = 'LOCAL' | 'AZURE_AD';

/** 已认证用户（与后端 AuthenticatedUser 对齐）。 */
export interface AuthenticatedUser {
  userId: number;
  username: string;
  displayName: string;
  /** role_code 列表。 */
  roles: string[];
  source: AuthSource;
}

/** POST /api/auth/login 的 data。 */
export interface LoginResult {
  token: string;
  user: AuthenticatedUser;
  mustChangePassword: boolean;
}

/** GET /api/auth/me 的 data。 */
export interface MeResult {
  user: AuthenticatedUser;
  /** 该用户的权限码列表（permission_code）。 */
  permissions: string[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
  error?: string;
  code?: string;
}

export const authApi = {
  /** 登录取令牌。失败时后端回 401 INVALID_CREDENTIALS 等，由调用方捕获展示。 */
  login: (username: string, password: string) =>
    api
      .post<Envelope<LoginResult>>('/auth/login', { username, password })
      .then((res) => res.data.data),

  /** 用当前令牌水合身份 + 权限。无效令牌触发 401（拦截器会清 token+跳登录）。 */
  me: () =>
    api.get<Envelope<MeResult>>('/auth/me').then((res) => res.data.data),

  /** 登出（JWT 无状态，后端仅回成功，真正清 token 在前端）。 */
  logout: () =>
    api.post<Envelope<{ loggedOut: boolean }>>('/auth/logout').then((res) => res.data.data),

  /** 修改当前登录用户密码。 */
  changePassword: (oldPassword: string, newPassword: string) =>
    api
      .post<Envelope<{ changed: boolean }>>('/auth/change-password', { oldPassword, newPassword })
      .then((res) => res.data.data),
};
