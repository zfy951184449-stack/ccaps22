/**
 * userController —— /api/governance 的用户账号、密码、角色授权端点处理器。
 *
 * 纯 HTTP 适配层：解析/校验入参 → 调 UserAdminService → 统一信封返回。
 * 授权写操作需要操作者身份（assigned_by / revoked_by）取自 req.user.userId。
 * 强制模式下 requireAuth 已保证 req.user 存在；影子模式下若匿名（无 req.user）则
 * 授权类写操作无法确定操作者，按 401 处理（审计要求操作者可追溯）。
 */
import type { Request, Response, NextFunction } from 'express';
import '../../middleware/authTypes';
import { UserAdminService } from '../../services/governance/UserAdminService';
import { handleGovernanceError, parsePositiveInt, sendBadRequest, sendOk } from './governanceHttp';

/** 取当前操作者 userId；匿名（影子模式无 req.user）返回 null。 */
const actorId = (req: Request): number | null => (req.user ? req.user.userId : null);

/** GET /api/governance/users */
export async function listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await UserAdminService.listUsers();
    sendOk(res, users);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** GET /api/governance/users/:id */
export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    sendBadRequest(res, 'invalid user id');
    return;
  }
  try {
    const user = await UserAdminService.getUser(id);
    sendOk(res, user);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** POST /api/governance/users  body: { username, displayName, email?, password } */
export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.password !== 'string') {
    sendBadRequest(res, 'password is required');
    return;
  }
  try {
    const user = await UserAdminService.createUser({
      username: String(body.username ?? ''),
      displayName: String(body.displayName ?? ''),
      email: body.email === undefined ? undefined : (body.email as string | null),
      password: body.password,
    });
    sendOk(res, user, 201);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** PUT /api/governance/users/:id  body: { displayName?, email?, userStatus? } */
export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    sendBadRequest(res, 'invalid user id');
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const user = await UserAdminService.updateUser(
      id,
      {
        displayName: body.displayName === undefined ? undefined : String(body.displayName),
        email: body.email === undefined ? undefined : (body.email as string | null),
        userStatus: body.userStatus === undefined ? undefined : String(body.userStatus),
      },
      actorId(req),
    );
    sendOk(res, user);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** POST /api/governance/users/:id/reset-password  body: { newPassword } */
export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    sendBadRequest(res, 'invalid user id');
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.newPassword !== 'string') {
    sendBadRequest(res, 'newPassword is required');
    return;
  }
  try {
    await UserAdminService.resetPassword(id, body.newPassword);
    sendOk(res, { reset: true });
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** POST /api/governance/users/:id/role-assignments  body: { roleId, scopeUnitId?, reasonText? } */
export async function assignRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = parsePositiveInt(req.params.id);
  if (userId === null) {
    sendBadRequest(res, 'invalid user id');
    return;
  }
  const assignedBy = actorId(req);
  if (assignedBy === null) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const roleId = parsePositiveInt(body.roleId);
  if (roleId === null) {
    sendBadRequest(res, 'roleId is required');
    return;
  }
  let scopeUnitId: number | null | undefined;
  if (body.scopeUnitId === undefined || body.scopeUnitId === null) {
    scopeUnitId = null;
  } else {
    const parsed = parsePositiveInt(body.scopeUnitId);
    if (parsed === null) {
      sendBadRequest(res, 'scopeUnitId must be a positive integer or null');
      return;
    }
    scopeUnitId = parsed;
  }
  try {
    const assignment = await UserAdminService.assignRole({
      userId,
      roleId,
      scopeUnitId,
      assignedBy,
      reasonText: body.reasonText === undefined ? null : (body.reasonText as string | null),
    });
    sendOk(res, assignment, 201);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** DELETE /api/governance/users/:id/role-assignments/:assignmentId */
export async function revokeAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = parsePositiveInt(req.params.id);
  const assignmentId = parsePositiveInt(req.params.assignmentId);
  if (userId === null || assignmentId === null) {
    sendBadRequest(res, 'invalid user id or assignment id');
    return;
  }
  const revokedBy = actorId(req);
  if (revokedBy === null) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    await UserAdminService.revokeAssignment(
      userId,
      assignmentId,
      revokedBy,
      body.reasonText === undefined ? null : (body.reasonText as string | null),
    );
    sendOk(res, { revoked: true });
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}
