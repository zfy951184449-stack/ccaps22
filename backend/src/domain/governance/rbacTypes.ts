export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'RETIRED';
export type RoleScope = 'SYSTEM' | 'APS' | 'ROSTER' | 'MASTER_DATA' | 'GOVERNANCE' | 'INTEGRATION';
export type PermissionDomain = 'APS' | 'ROSTER' | 'MASTER_DATA' | 'GOVERNANCE' | 'INTEGRATION' | 'SYSTEM';

export interface User {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  authProvider: string;
  externalSubject: string | null;
  userStatus: UserStatus;
  mfaRequired: boolean;
  lastLoginAt: string | null;
}

export interface Role {
  id: number;
  roleCode: string;
  roleName: string;
  roleScope: RoleScope;
  roleStatus: 'ACTIVE' | 'INACTIVE' | 'RETIRED';
}

export interface Permission {
  id: number;
  permissionCode: string;
  permissionName: string;
  permissionDomain: PermissionDomain;
  actionCode: string;
  resourceCode: string;
  permissionStatus: 'ACTIVE' | 'INACTIVE' | 'RETIRED';
}

export interface UserEmployeeLink {
  id: number;
  userId: number;
  employeeId: number;
  linkStatus: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  effectiveFrom: string;
  effectiveTo: string | null;
}
