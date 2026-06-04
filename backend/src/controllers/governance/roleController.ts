/**
 * roleController —— /api/governance 的角色、权限目录、组织单元端点处理器。
 *
 * 纯 HTTP 适配层：解析/校验入参 → 调 RbacAdminService → 统一信封返回。
 * 权限校验由路由层 requirePermission 完成，这里不再判权。
 */
import type { Request, Response, NextFunction } from 'express';
import '../../middleware/authTypes';
import { RbacAdminService } from '../../services/governance/RbacAdminService';
import { handleGovernanceError, parsePositiveInt, sendBadRequest, sendOk } from './governanceHttp';

/** GET /api/governance/permission-catalog */
export async function getPermissionCatalog(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const catalog = await RbacAdminService.getPermissionCatalog();
    sendOk(res, catalog);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** GET /api/governance/roles */
export async function listRoles(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await RbacAdminService.listRoles();
    sendOk(res, roles);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** GET /api/governance/roles/:id */
export async function getRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    sendBadRequest(res, 'invalid role id');
    return;
  }
  try {
    const role = await RbacAdminService.getRole(id);
    sendOk(res, role);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** POST /api/governance/roles  body: { roleCode, roleName, roleScope?, description? } */
export async function createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const role = await RbacAdminService.createRole({
      roleCode: String(body.roleCode ?? ''),
      roleName: String(body.roleName ?? ''),
      roleScope: body.roleScope === undefined ? undefined : String(body.roleScope),
      description: body.description === undefined ? undefined : (body.description as string | null),
    });
    sendOk(res, role, 201);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** PUT /api/governance/roles/:id  body: { roleName?, description?, roleScope?, roleStatus? } */
export async function updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    sendBadRequest(res, 'invalid role id');
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const role = await RbacAdminService.updateRole(id, {
      roleName: body.roleName === undefined ? undefined : String(body.roleName),
      description: body.description === undefined ? undefined : (body.description as string | null),
      roleScope: body.roleScope === undefined ? undefined : String(body.roleScope),
      roleStatus: body.roleStatus === undefined ? undefined : String(body.roleStatus),
    });
    sendOk(res, role);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** PUT /api/governance/roles/:id/permissions  body: { permissionCodes: string[] } */
export async function setRolePermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    sendBadRequest(res, 'invalid role id');
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(body.permissionCodes)) {
    sendBadRequest(res, 'permissionCodes must be an array of permission codes');
    return;
  }
  try {
    const role = await RbacAdminService.setRolePermissions(id, body.permissionCodes.map((c) => String(c)));
    sendOk(res, role);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** DELETE /api/governance/roles/:id  (软删 = RETIRED) */
export async function deleteRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    sendBadRequest(res, 'invalid role id');
    return;
  }
  try {
    await RbacAdminService.retireRole(id);
    sendOk(res, { retired: true });
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}

/** GET /api/governance/org-units */
export async function getOrgUnits(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tree = await RbacAdminService.getOrgUnitTree();
    sendOk(res, tree);
  } catch (error) {
    handleGovernanceError(error, res, next);
  }
}
