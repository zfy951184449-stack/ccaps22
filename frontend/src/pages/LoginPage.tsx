/**
 * LoginPage —— 本地账号登录页（/login，在 AppLayout 之外，不套顶部导航）。
 *
 * 用 wxb-ui 组件（WxbCard/WxbInput/WxbButton/WxbAlert），无 emoji（图标用内联 SVG），
 * 配色走 CSS 变量。登录成功后跳回来源页（location.state.from）或首页。
 * 若返回 mustChangePassword，提示用户尽快改密并提供一个就地改密入口。
 */
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { WxbCard } from '../components/wxb-ui/Card/Card';
import { WxbInput } from '../components/wxb-ui/Input/Input';
import { WxbButton } from '../components/wxb-ui/Button/Button';
import { WxbAlert } from '../components/wxb-ui/Alert/Alert';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/authApi';
import './LoginPage.css';

interface FromState {
  from?: { pathname?: string };
}

const ShieldMark: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3l7 3v5c0 4.5-3 8.2-7 9-4-0.8-7-4.5-7-9V6l7-3z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const extractErrorMessage = (err: unknown): string => {
  const anyErr = err as { response?: { data?: { error?: string; code?: string } } };
  const code = anyErr?.response?.data?.code;
  const serverMsg = anyErr?.response?.data?.error;
  if (code === 'ACCOUNT_LOCKED') return '账号已锁定，请联系管理员';
  if (code === 'ACCOUNT_INACTIVE') return '账号未启用，请联系管理员';
  if (code === 'INVALID_CREDENTIALS') return '用户名或密码错误';
  if (serverMsg) return serverMsg;
  return '登录失败，请稍后重试';
};

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, mustChangePassword } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 就地改密（仅在登录返回 mustChangePassword 时出现）。
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePwdError, setChangePwdError] = useState<string | null>(null);
  const [changingPwd, setChangingPwd] = useState(false);
  const [changeDone, setChangeDone] = useState(false);

  const redirectTarget = (location.state as FromState)?.from?.pathname || '/dashboard';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setSubmitting(true);
    try {
      const needsChange = await login(username.trim(), password);
      if (needsChange) {
        // 强制改密：不跳转，停在登录页自动展开就地改密表单，仅在改密成功后再跳转。
        setShowChangePwd(true);
        return;
      }
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (changingPwd) return;
    setChangePwdError(null);

    if (newPassword.length < 8) {
      setChangePwdError('新密码至少 8 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangePwdError('两次输入的新密码不一致');
      return;
    }

    setChangingPwd(true);
    try {
      // 旧密码即刚才登录用的密码。
      await authApi.changePassword(password, newPassword);
      setChangeDone(true);
      // 改密成功后进入目标页（已登录，token 仍有效）。
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      const anyErr = err as { response?: { data?: { error?: string; code?: string } } };
      setChangePwdError(
        anyErr?.response?.data?.code === 'WEAK_PASSWORD'
          ? '新密码强度不足'
          : anyErr?.response?.data?.error || '改密失败，请稍后重试',
      );
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <div className="wxb-login-shell">
      <WxbCard className="wxb-login-card">
        <div className="wxb-login-brand">
          <span className="wxb-login-brand-mark">
            <ShieldMark />
          </span>
          <span className="wxb-login-brand-text">
            <span className="wxb-login-brand-title">MFG8 APS</span>
            <span className="wxb-login-brand-sub">WuXi Biologics · 排产调度平台</span>
          </span>
        </div>

        <h1 className="wxb-login-heading">登录</h1>
        <p className="wxb-login-subheading">请输入账号凭据以继续</p>

        {error ? (
          <WxbAlert variant="error" style={{ marginBottom: 'var(--wx-space-16)' }}>
            {error}
          </WxbAlert>
        ) : null}

        <form className="wxb-login-form" onSubmit={handleSubmit}>
          <WxbInput
            label="用户名"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="请输入用户名"
            disabled={submitting}
          />
          <WxbInput
            label="密码"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            disabled={submitting}
          />
          <div className="wxb-login-actions">
            <WxbButton type="submit" variant="primary" className="wxb-login-submit" disabled={submitting}>
              {submitting ? '登录中…' : '登录'}
            </WxbButton>
          </div>
        </form>

        {mustChangePassword ? (
          <div style={{ marginTop: 'var(--wx-space-16)' }}>
            <WxbAlert variant="warning" title="需要修改密码">
              出于安全要求，请尽快修改初始密码。
              {!showChangePwd && !changeDone ? (
                <div style={{ marginTop: 'var(--wx-space-8)' }}>
                  <WxbButton variant="ghost" size="sm" onClick={() => setShowChangePwd(true)}>
                    立即修改
                  </WxbButton>
                </div>
              ) : null}
            </WxbAlert>
          </div>
        ) : null}

        {showChangePwd && !changeDone ? (
          <form className="wxb-login-form" style={{ marginTop: 'var(--wx-space-16)' }} onSubmit={handleChangePassword}>
            {changePwdError ? <WxbAlert variant="error">{changePwdError}</WxbAlert> : null}
            <WxbInput
              label="新密码"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 8 位"
              disabled={changingPwd}
            />
            <WxbInput
              label="确认新密码"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              disabled={changingPwd}
            />
            <div className="wxb-login-actions">
              <WxbButton type="submit" variant="primary" className="wxb-login-submit" disabled={changingPwd}>
                {changingPwd ? '提交中…' : '确认修改'}
              </WxbButton>
            </div>
          </form>
        ) : null}

        {changeDone ? (
          <div style={{ marginTop: 'var(--wx-space-16)' }}>
            <WxbAlert variant="warning" title="密码已修改">
              新密码已生效，请继续使用。
            </WxbAlert>
          </div>
        ) : null}

        <p className="wxb-login-hint">如忘记密码或账号异常，请联系系统管理员</p>
      </WxbCard>
    </div>
  );
};

export default LoginPage;
