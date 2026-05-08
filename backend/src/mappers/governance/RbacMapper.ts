import type { RowDataPacket } from 'mysql2/promise';
import type { Permission, Role, User, UserEmployeeLink } from '../../domain/governance/rbacTypes';

const nullableString = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

export const mapUserRow = (row: RowDataPacket): User => ({
  id: Number(row.id),
  username: String(row.username),
  displayName: String(row.display_name),
  email: nullableString(row.email),
  authProvider: String(row.auth_provider),
  externalSubject: nullableString(row.external_subject),
  userStatus: row.user_status,
  mfaRequired: toBoolean(row.mfa_required),
  lastLoginAt: nullableString(row.last_login_at),
});

export const mapRoleRow = (row: RowDataPacket): Role => ({
  id: Number(row.id),
  roleCode: String(row.role_code),
  roleName: String(row.role_name),
  roleScope: row.role_scope,
  roleStatus: row.role_status,
});

export const mapPermissionRow = (row: RowDataPacket): Permission => ({
  id: Number(row.id),
  permissionCode: String(row.permission_code),
  permissionName: String(row.permission_name),
  permissionDomain: row.permission_domain,
  actionCode: String(row.action_code),
  resourceCode: String(row.resource_code),
  permissionStatus: row.permission_status,
});

export const mapUserEmployeeLinkRow = (row: RowDataPacket): UserEmployeeLink => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  employeeId: Number(row.employee_id),
  linkStatus: row.link_status,
  effectiveFrom: String(row.effective_from),
  effectiveTo: nullableString(row.effective_to),
});
