/**
 * AuthContext —— 前端认证状态的单一来源。
 *
 * 持有当前登录用户、权限码集合、角色列表与加载态，暴露 login / logout / hasPermission。
 * 令牌存于 localStorage（键见 services/api.ts 的 AUTH_TOKEN_STORAGE_KEY），
 * axios 请求拦截器据此注入 Authorization；本 Context 只管「身份水合 + 权限判定」。
 *
 * 生命周期：
 *   - 挂载时若本地有 token → 调 /api/auth/me 水合 user+permissions；失败（含 401）→ 清 token、置空。
 *   - login(username,password) → 调 /api/auth/login 存 token，再 me() 水合。
 *   - logout() → 调后端 logout（尽力而为）后清 token、置空状态。
 *
 * 注意：当前后端 AUTH_ENFORCE=false（影子模式），匿名请求仍可放行；但前端登录流程完整可用，
 * 后续切到强制模式时无需改动本层。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, AuthenticatedUser } from '../services/authApi';
import { clearAuthToken, getAuthToken, setAuthToken } from '../services/api';

export interface AuthContextValue {
  /** 当前登录用户；未登录 / 未水合时为 null。 */
  user: AuthenticatedUser | null;
  /** 权限码集合（permission_code），用于 hasPermission 快速查。 */
  permissions: Set<string>;
  /** 角色码列表（role_code）。 */
  roles: string[];
  /** 是否正在进行启动水合 / 登录。 */
  loading: boolean;
  /** 用户是否需强制改密（登录返回的 mustChangePassword）。 */
  mustChangePassword: boolean;
  /** 登录：成功返回 mustChangePassword（true=须强制改密，调用方应停在登录页改密）；失败抛原始异常给调用方读 code/error。 */
  login: (username: string, password: string) => Promise<boolean>;
  /** 登出：清 token + 置空状态。 */
  logout: () => Promise<void>;
  /** 权限判定：权限集合内含该码即为 true。 */
  hasPermission: (code: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);

  // 启动水合：有 token 则拉 /me，无 token 直接结束加载。
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      if (!getAuthToken()) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      try {
        const me = await authApi.me();
        if (cancelled) return;
        setUser(me.user);
        setPermissions(new Set(me.permissions));
      } catch {
        // token 失效 / 网络失败：清掉本地 token，回到匿名态（拦截器也会处理 401 跳转）。
        if (!cancelled) {
          clearAuthToken();
          setUser(null);
          setPermissions(new Set());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await authApi.login(username, password);
      setAuthToken(result.token);
      setUser(result.user);
      setMustChangePassword(result.mustChangePassword);
      // 用 /me 拉权限码（login 返回里不含 permissions）。
      try {
        const me = await authApi.me();
        setPermissions(new Set(me.permissions));
      } catch {
        setPermissions(new Set());
      }
      return result.mustChangePassword;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* 后端登出失败不阻塞前端清理 */
    } finally {
      clearAuthToken();
      setUser(null);
      setPermissions(new Set());
      setMustChangePassword(false);
    }
  }, []);

  const hasPermission = useCallback(
    (code: string) => permissions.has(code),
    [permissions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      permissions,
      roles: user?.roles ?? [],
      loading,
      mustChangePassword,
      login,
      logout,
      hasPermission,
    }),
    [user, permissions, loading, mustChangePassword, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth 必须在 <AuthProvider> 内部使用');
  }
  return ctx;
};
