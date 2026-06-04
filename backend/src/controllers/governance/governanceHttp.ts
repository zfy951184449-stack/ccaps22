/**
 * governanceHttp —— 治理控制器共用的 HTTP 适配工具。
 *
 * 统一信封：成功 { success:true, data }，失败 { success:false, error, code }（与 auth 模块一致）。
 * 把领域错误（RbacAdminError / UserAdminError）的 code 映射成合适的 HTTP status；
 * 其它异常交给 Express 全局错误处理器（500），不在此静默吞。
 */
import type { Response } from 'express';
import { RbacAdminError } from '../../services/governance/RbacAdminService';
import { UserAdminError } from '../../services/governance/UserAdminService';

type DomainCode = RbacAdminError['code'] | UserAdminError['code'];

/** 领域错误码 → HTTP 状态码。 */
const statusForCode = (code: DomainCode): number => {
  switch (code) {
    case 'ROLE_NOT_FOUND':
    case 'USER_NOT_FOUND':
    case 'ASSIGNMENT_NOT_FOUND':
    case 'ORG_UNIT_NOT_FOUND':
      return 404;
    case 'ROLE_CODE_EXISTS':
    case 'USERNAME_EXISTS':
      return 409;
    case 'ROLE_PROTECTED':
    case 'LAST_ADMIN_PROTECTED':
      return 409;
    case 'PERMISSION_UNKNOWN':
    case 'BAD_REQUEST':
    case 'WEAK_PASSWORD':
    case 'ROLE_NOT_FOUND_FOR_ASSIGN' as DomainCode:
      return 400;
    default:
      return 400;
  }
};

export const sendOk = (res: Response, data: unknown, status = 200): void => {
  res.status(status).json({ success: true, data });
};

export const sendBadRequest = (res: Response, error: string): void => {
  res.status(400).json({ success: false, error, code: 'BAD_REQUEST' });
};

/**
 * 处理控制器抛出的错误：领域错误映射为对应 status + code；其余 rethrow 给 next（全局 500）。
 * 用法：catch (e) { handleGovernanceError(e, res, next); }
 */
export const handleGovernanceError = (
  error: unknown,
  res: Response,
  next: (err?: unknown) => void,
): void => {
  if (error instanceof RbacAdminError || error instanceof UserAdminError) {
    res.status(statusForCode(error.code)).json({ success: false, error: error.message, code: error.code });
    return;
  }
  next(error);
};

/** 解析路由参数中的正整数 id；非法返回 null（调用方负责回 400）。 */
export const parsePositiveInt = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
};
