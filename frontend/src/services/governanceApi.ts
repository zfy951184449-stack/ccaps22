/**
 * governanceApi —— 对接后端 /api/governance/* 端点（角色 / 权限目录 / 用户 / 用户角色授予 / 组织单元）。
 *
 * 复用 services/api.ts 的共享 axios 实例（Bearer 注入 + 401/403 拦截）。
 * 所有端点需 Bearer token（强制模式），统一信封 { success, data, error?, code? }。
 * 本模块只解包 data；权限/校验错误以 axios 异常向上抛，由调用方读 err.response.data.code 处理：
 *   400 BAD_REQUEST/WEAK_PASSWORD/PERMISSION_UNKNOWN, 401 AUTH_REQUIRED,
 *   403 FORBIDDEN(带 required), 404 *_NOT_FOUND, 409 ROLE_CODE_EXISTS/USERNAME_EXISTS/ROLE_PROTECTED/LAST_ADMIN_PROTECTED。
 *
 * 这是给「治理配置界面」消费的唯一数据层入口，组件不要再散落 axios 调用。
 */
import api from './api';

// ── 枚举 / 字面量 ────────────────────────────────────────────────
export type RoleScope = 'SYSTEM' | 'APS' | 'ROSTER' | 'MASTER_DATA' | 'GOVERNANCE' | 'INTEGRATION';
export type RoleStatus = 'ACTIVE' | 'INACTIVE' | 'RETIRED';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'RETIRED';
export type UnitType = 'DEPARTMENT' | 'TEAM' | 'GROUP' | 'SHIFT';

// ── 权限目录（#1） ───────────────────────────────────────────────
export interface PermissionAction {
  id: number;
  permissionCode: string;
  permissionName: string;
  actionCode: string;
  status: string;
}
export interface PermissionResource {
  resourceCode: string;
  label: string;
  actions: PermissionAction[];
}
export interface PermissionDomainGroup {
  domain: string;
  label: string;
  resources: PermissionResource[];
}

// ── 角色（#2-#7） ────────────────────────────────────────────────
/** 列表行（含计数）。 */
export interface RoleListItem {
  id: number;
  roleCode: string;
  roleName: string;
  roleScope: RoleScope;
  roleStatus: RoleStatus;
  description: string | null;
  permissionCount: number;
  userCount: number;
}
/** 详情（含 permissionCodes）。 */
export interface RoleDetail {
  id: number;
  roleCode: string;
  roleName: string;
  roleScope: RoleScope;
  roleStatus: RoleStatus;
  description: string | null;
  permissionCodes: string[];
}
export interface CreateRolePayload {
  roleCode: string;
  roleName: string;
  roleScope?: RoleScope;
  description?: string | null;
}
export interface UpdateRolePayload {
  roleName?: string;
  description?: string | null;
  roleScope?: RoleScope;
  roleStatus?: RoleStatus;
}

// ── 用户（#8-#14） ───────────────────────────────────────────────
/** 用户身上一条角色授予的视图。 */
export interface RoleAssignmentView {
  assignmentId: number;
  roleId: number;
  roleCode: string;
  roleName: string;
  scopeUnitId: number | null;
  scopeUnitName: string | null;
  assignmentStatus: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}
export interface UserSummary {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  authProvider: string;
  externalSubject: string | null;
  userStatus: UserStatus;
  mfaRequired: boolean;
  lastLoginAt: string | null;
  roles: RoleAssignmentView[];
}
export interface CreateUserPayload {
  username: string;
  displayName: string;
  email?: string | null;
  password: string;
}
export interface UpdateUserPayload {
  displayName?: string;
  email?: string | null;
  userStatus?: UserStatus;
}
export interface AssignRolePayload {
  roleId: number;
  scopeUnitId?: number | null;
  reasonText?: string | null;
}

// ── 组织单元（#15） ──────────────────────────────────────────────
export interface OrgUnitNode {
  id: number;
  parentId: number | null;
  unitType: UnitType;
  unitCode: string | null;
  unitName: string;
  isActive: boolean;
  children: OrgUnitNode[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
  error?: string;
  code?: string;
}

const unwrap = <T,>(p: Promise<{ data: Envelope<T> }>): Promise<T> => p.then((res) => res.data.data);

export const governanceApi = {
  // #1 GET /permission-catalog
  getPermissionCatalog: () =>
    unwrap(api.get<Envelope<PermissionDomainGroup[]>>('/governance/permission-catalog')),

  // ── 角色 ──
  // #2 GET /roles
  listRoles: () => unwrap(api.get<Envelope<RoleListItem[]>>('/governance/roles')),
  // #3 GET /roles/:id
  getRole: (id: number) => unwrap(api.get<Envelope<RoleDetail>>(`/governance/roles/${id}`)),
  // #4 POST /roles
  createRole: (payload: CreateRolePayload) =>
    unwrap(api.post<Envelope<RoleDetail>>('/governance/roles', payload)),
  // #5 PUT /roles/:id
  updateRole: (id: number, payload: UpdateRolePayload) =>
    unwrap(api.put<Envelope<RoleDetail>>(`/governance/roles/${id}`, payload)),
  // #6 PUT /roles/:id/permissions （整体覆盖）
  setRolePermissions: (id: number, permissionCodes: string[]) =>
    unwrap(api.put<Envelope<RoleDetail>>(`/governance/roles/${id}/permissions`, { permissionCodes })),
  // #7 DELETE /roles/:id （软删 RETIRED）
  deleteRole: (id: number) =>
    unwrap(api.delete<Envelope<{ retired: true }>>(`/governance/roles/${id}`)),

  // ── 用户 ──
  // #8 GET /users
  listUsers: () => unwrap(api.get<Envelope<UserSummary[]>>('/governance/users')),
  // #9 GET /users/:id
  getUser: (id: number) => unwrap(api.get<Envelope<UserSummary>>(`/governance/users/${id}`)),
  // #10 POST /users
  createUser: (payload: CreateUserPayload) =>
    unwrap(api.post<Envelope<UserSummary>>('/governance/users', payload)),
  // #11 PUT /users/:id
  updateUser: (id: number, payload: UpdateUserPayload) =>
    unwrap(api.put<Envelope<UserSummary>>(`/governance/users/${id}`, payload)),
  // #12 POST /users/:id/reset-password
  resetUserPassword: (id: number, newPassword: string) =>
    unwrap(api.post<Envelope<{ reset: true }>>(`/governance/users/${id}/reset-password`, { newPassword })),

  // ── 用户角色授予 ──
  // #13 POST /users/:id/role-assignments
  assignRole: (userId: number, payload: AssignRolePayload) =>
    unwrap(api.post<Envelope<RoleAssignmentView>>(`/governance/users/${userId}/role-assignments`, payload)),
  // #14 DELETE /users/:id/role-assignments/:assignmentId
  revokeRoleAssignment: (userId: number, assignmentId: number, reasonText?: string | null) =>
    unwrap(
      api.delete<Envelope<{ revoked: true }>>(`/governance/users/${userId}/role-assignments/${assignmentId}`, {
        data: reasonText !== undefined ? { reasonText } : undefined,
      }),
    ),

  // ── 组织单元（scopeUnitId 选择用） ──
  // #15 GET /org-units
  listOrgUnits: () => unwrap(api.get<Envelope<OrgUnitNode[]>>('/governance/org-units')),
};
