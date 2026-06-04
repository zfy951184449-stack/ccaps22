/**
 * ProtectedRoute —— 路由级访问守卫。
 *
 *   - 启动水合中（loading）→ 渲染居中 Spinner，避免闪过登录页。
 *   - 未登录（user 为 null）→ 重定向到 /login，并把当前位置塞进 state.from，登录后跳回。
 *     例外：allowAnonymousInShadow 且当前为影子模式（REACT_APP_AUTH_ENFORCE !== 'true'，默认）→
 *     放行匿名访问（与后端 AUTH_ENFORCE 影子语义对齐，避免未登录的现有前端被整站重定向到 /login）。
 *   - 传了 requiredPermission 且当前用户不具备 → 渲染 403 占位（不跳转，保留导航）。
 *     注意：requiredPermission 不受影子放行影响——治理等敏感页仍按权限把关。
 *
 * 与后端的关系：后端默认 AUTH_ENFORCE=false（影子模式）对匿名放行；前端用 REACT_APP_AUTH_ENFORCE
 * 镜像该开关。两者均切到 'true' 即进入强制模式（整站登录 + 权限）。
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { WxbSpinner } from '../wxb-ui/Spinner/Spinner';
import { WxbEmpty } from '../wxb-ui/Empty/Empty';
import { useAuth } from '../../contexts/AuthContext';

/** 前端是否强制登录（镜像后端 AUTH_ENFORCE）。默认 false（影子模式，不拦匿名）。 */
export const isAuthEnforced = (): boolean => process.env.REACT_APP_AUTH_ENFORCE === 'true';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  /** 需要的权限码（permission_code）；不传则只校验是否登录。 */
  requiredPermission?: string;
  /** 影子模式下允许匿名访问（用于包裹现有非敏感页面，避免未登录被整站重定向）。 */
  allowAnonymousInShadow?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredPermission, allowAnonymousInShadow = false }) => {
  const location = useLocation();
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <WxbSpinner tip="加载中…" />
      </div>
    );
  }

  if (!user) {
    // 影子模式 + 允许匿名：直接渲染（不重定向）。否则跳登录页。
    if (allowAnonymousInShadow && !isAuthEnforced()) {
      return <>{children}</>;
    }
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div style={{ padding: 'var(--wx-space-48) var(--wx-space-24)' }}>
        <WxbEmpty description={`无权限访问该页面（需要权限：${requiredPermission}）`} />
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
