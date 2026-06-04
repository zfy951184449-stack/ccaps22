/**
 * 治理（RBAC 管理）API 接入层测试。
 *
 * 与 authRoutes.test.ts 同款骨架：
 *   - vi.hoisted 在所有 import 求值前注入认证 env（JwtService 模块加载即 fail-fast 读 JWT_SECRET）。
 *   - DB 全部走 vi.mock('../config/database')，按 SQL 文本路由返回，不连真实库。
 *   - 用 AUTH_ENFORCE='true' 强制模式跑，真正触发 requirePermission；权限命中/缺失通过
 *     mock PermissionCacheService.has 控制（避免依赖 RBAC 多表 JOIN）。
 *
 * 覆盖：权限目录分组、角色 CRUD/设权限、GOVERNANCE_ADMIN 不可删/停用、用户建+授权+scope 校验、
 *       撤销最后一个 GOVERNANCE_ADMIN 防自锁、权限不足 403。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret-for-vitest-only-0123456789abcdef';
  process.env.JWT_EXPIRES_IN = '8h';
  process.env.JWT_ISSUER = 'mfg8aps';
  process.env.JWT_AUDIENCE = 'mfg8aps-web';
  process.env.SOLVER_CALLBACK_SECRET = 'test-solver-callback-secret';
  process.env.AUTH_ENFORCE = 'true'; // 强制模式：真正触发 requirePermission
});

// --- DB mock：pool.execute + pool.getConnection（事务）。 ---
// 签名显式接受 (sql, params)，以便各用例用 mockImplementation 读 SQL 文本路由返回（strict tsc 要求）。
const connExecute = vi.fn(async (_sql: string, _params?: unknown[]): Promise<unknown> => [[{}], []]);
const fakeConnection = {
  beginTransaction: vi.fn(async () => undefined),
  execute: connExecute,
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(() => undefined),
};
vi.mock('../config/database', () => ({
  default: {
    execute: vi.fn(),
    getConnection: vi.fn(async () => fakeConnection),
  },
}));

// RbacDirectoryService：revokeUserRole（撤销授权复用它）+ getUserPermissions（缓存回源兜底，本测试直接 mock cache.has）。
vi.mock('../services/governance/RbacDirectoryService', () => ({
  RbacDirectoryService: {
    revokeUserRole: vi.fn(async () => undefined),
    getUserPermissions: vi.fn(async () => []),
  },
}));

import app from '../server';
import pool from '../config/database';
import { JwtService } from '../services/auth/JwtService';
import { PermissionCacheService } from '../services/auth/PermissionCacheService';
import { RbacDirectoryService } from '../services/governance/RbacDirectoryService';

const mockPool = pool as unknown as { execute: ReturnType<typeof vi.fn>; getConnection: ReturnType<typeof vi.fn> };

/** 签一个 admin 令牌（roles 仅放 claims，不影响 requirePermission —— 后者读 PermissionCacheService）。 */
const adminToken = (): string =>
  JwtService.sign({ sub: '1', username: 'admin', displayName: '系统管理员', roles: ['GOVERNANCE_ADMIN'], src: 'LOCAL' });

/** 让 PermissionCacheService.has 对任意 code 返回 allowed（默认全放行）。 */
const grantAll = (): void => {
  vi.spyOn(PermissionCacheService, 'has').mockResolvedValue(true);
};
/** 让 has 只对给定 code 集放行，其余拒绝（用于 403 用例）。 */
const grantOnly = (allowed: string[]): void => {
  vi.spyOn(PermissionCacheService, 'has').mockImplementation(async (_uid: number, code: string) =>
    allowed.includes(code),
  );
};

const auth = (req: request.Test): request.Test => req.set('Authorization', `Bearer ${adminToken()}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  connExecute.mockResolvedValue([[{}], []] as unknown);
  mockPool.getConnection.mockResolvedValue(fakeConnection);
  PermissionCacheService.clear();
  process.env.AUTH_ENFORCE = 'true';
});

afterEach(() => {
  process.env.AUTH_ENFORCE = 'true';
});

describe('GET /api/governance/permission-catalog', () => {
  it('groups permissions by domain -> resource -> action with cn labels', async () => {
    grantAll();
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM permissions') && sql.includes("permission_status = 'ACTIVE'")) {
        return [[
          { id: 10, permission_code: 'GOVERNANCE_USER_READ', permission_name: '查看用户账号', permission_domain: 'GOVERNANCE', action_code: 'READ', resource_code: 'USER_ACCOUNT', permission_status: 'ACTIVE' },
          { id: 11, permission_code: 'GOVERNANCE_USER_WRITE', permission_name: '维护用户账号', permission_domain: 'GOVERNANCE', action_code: 'WRITE', resource_code: 'USER_ACCOUNT', permission_status: 'ACTIVE' },
          { id: 12, permission_code: 'APS_BATCH_READ', permission_name: '查看批次计划', permission_domain: 'APS', action_code: 'READ', resource_code: 'BATCH_PLAN', permission_status: 'ACTIVE' },
        ], []];
      }
      if (sql.includes('FROM permission_catalog_meta')) {
        return [[
          { meta_type: 'DOMAIN', domain: 'APS', resource_code: null, label_cn: '排产计划', sort_order: 0 },
          { meta_type: 'DOMAIN', domain: 'GOVERNANCE', resource_code: null, label_cn: '治理（用户与权限）', sort_order: 1 },
          { meta_type: 'RESOURCE', domain: 'GOVERNANCE', resource_code: 'USER_ACCOUNT', label_cn: '用户账号', sort_order: 0 },
          { meta_type: 'RESOURCE', domain: 'APS', resource_code: 'BATCH_PLAN', label_cn: '批次计划', sort_order: 0 },
        ], []];
      }
      return [[], []];
    });

    const res = await auth(request(app).get('/api/governance/permission-catalog'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const domains = res.body.data as Array<any>;
    // 域按 meta sort_order：APS(0) 在 GOVERNANCE(1) 前。
    expect(domains.map((d) => d.domain)).toEqual(['APS', 'GOVERNANCE']);
    const gov = domains.find((d) => d.domain === 'GOVERNANCE');
    expect(gov.label).toBe('治理（用户与权限）');
    const userRes = gov.resources.find((r: any) => r.resourceCode === 'USER_ACCOUNT');
    expect(userRes.label).toBe('用户账号');
    expect(userRes.actions.map((a: any) => a.permissionCode)).toEqual(['GOVERNANCE_USER_READ', 'GOVERNANCE_USER_WRITE']);
  });

  it('returns 403 when caller lacks GOVERNANCE_ROLE_READ', async () => {
    grantOnly(['GOVERNANCE_USER_READ']); // 没有 ROLE_READ
    const res = await auth(request(app).get('/api/governance/permission-catalog'));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN', required: 'GOVERNANCE_ROLE_READ' });
  });
});

describe('GET /api/governance/roles', () => {
  it('lists roles with permission/user counts', async () => {
    grantAll();
    mockPool.execute.mockResolvedValueOnce([[
      { id: 1, role_code: 'GOVERNANCE_ADMIN', role_name: '系统管理员', role_scope: 'GOVERNANCE', role_status: 'ACTIVE', description: '全权', permission_count: 63, user_count: 1 },
      { id: 2, role_code: 'READONLY_VIEWER', role_name: '只读访客', role_scope: 'SYSTEM', role_status: 'ACTIVE', description: null, permission_count: 20, user_count: 0 },
    ], []]);

    const res = await auth(request(app).get('/api/governance/roles'));
    expect(res.status).toBe(200);
    const roles = res.body.data as Array<any>;
    expect(roles).toHaveLength(2);
    expect(roles[0]).toMatchObject({ roleCode: 'GOVERNANCE_ADMIN', permissionCount: 63, userCount: 1 });
    expect(roles[1].description).toBeNull();
  });
});

describe('GET /api/governance/roles/:id', () => {
  it('returns role detail with permission codes', async () => {
    grantAll();
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM roles WHERE id = ?')) {
        return [[{ id: 2, role_code: 'READONLY_VIEWER', role_name: '只读访客', role_scope: 'SYSTEM', role_status: 'ACTIVE', description: null }], []];
      }
      if (sql.includes('FROM role_permissions rp') && sql.includes("grant_status = 'ACTIVE'")) {
        return [[{ permission_code: 'APS_BATCH_READ' }, { permission_code: 'ROSTER_SCHEDULE_READ' }], []];
      }
      return [[], []];
    });
    const res = await auth(request(app).get('/api/governance/roles/2'));
    expect(res.status).toBe(200);
    expect(res.body.data.permissionCodes).toEqual(['APS_BATCH_READ', 'ROSTER_SCHEDULE_READ']);
  });

  it('returns 404 for unknown role', async () => {
    grantAll();
    mockPool.execute.mockResolvedValue([[], []]);
    const res = await auth(request(app).get('/api/governance/roles/999'));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ROLE_NOT_FOUND');
  });
});

describe('POST /api/governance/roles', () => {
  it('creates a role (uppercases code) and returns detail', async () => {
    grantAll();
    let inserted = false;
    mockPool.execute.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('SELECT id FROM roles WHERE role_code = ?')) {
        return [[], []]; // 不冲突
      }
      if (sql.startsWith('INSERT INTO roles')) {
        // 断言 code 被规范化为大写
        expect(params?.[0]).toBe('APS_VIEWER');
        inserted = true;
        return [{ insertId: 7 } as any, []];
      }
      if (sql.includes('FROM roles WHERE id = ?')) {
        return [[{ id: 7, role_code: 'APS_VIEWER', role_name: 'APS查看', role_scope: 'APS', role_status: 'ACTIVE', description: null }], []];
      }
      if (sql.includes('FROM role_permissions rp')) return [[], []];
      return [[], []];
    });
    const res = await auth(request(app).post('/api/governance/roles')).send({ roleCode: 'aps_viewer', roleName: 'APS查看', roleScope: 'APS' });
    expect(res.status).toBe(201);
    expect(inserted).toBe(true);
    expect(res.body.data).toMatchObject({ roleCode: 'APS_VIEWER', roleScope: 'APS' });
  });

  it('returns 409 when role code already exists', async () => {
    grantAll();
    mockPool.execute.mockResolvedValueOnce([[{ id: 1 }], []]); // SELECT existing -> found
    const res = await auth(request(app).post('/api/governance/roles')).send({ roleCode: 'GOVERNANCE_ADMIN', roleName: 'dup' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ROLE_CODE_EXISTS');
  });

  it('returns 400 when required fields missing', async () => {
    grantAll();
    const res = await auth(request(app).post('/api/governance/roles')).send({ roleName: 'no code' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('returns 403 with only READ permission (needs WRITE)', async () => {
    grantOnly(['GOVERNANCE_ROLE_READ']);
    const res = await auth(request(app).post('/api/governance/roles')).send({ roleCode: 'X', roleName: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.required).toBe('GOVERNANCE_ROLE_WRITE');
  });
});

describe('PUT /api/governance/roles/:id/permissions', () => {
  it('diffs and sets permissions (adds new, revokes removed), rejects unknown codes', async () => {
    grantAll();
    // unknown-code path: desired has an unknown code -> PERMISSION_UNKNOWN 400
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM roles WHERE id = ?')) {
        return [[{ id: 2, role_code: 'READONLY_VIEWER', role_name: '只读访客', role_scope: 'SYSTEM', role_status: 'ACTIVE', description: null }], []];
      }
      if (sql.includes('FROM role_permissions rp')) return [[], []];
      if (sql.includes('SELECT id, permission_code FROM permissions WHERE permission_code IN')) {
        return [[{ id: 100, permission_code: 'APS_BATCH_READ' }], []]; // 只识别一个，另一个未知
      }
      return [[], []];
    });
    const resBad = await auth(request(app).put('/api/governance/roles/2/permissions')).send({ permissionCodes: ['APS_BATCH_READ', 'NOPE_UNKNOWN'] });
    expect(resBad.status).toBe(400);
    expect(resBad.body.code).toBe('PERMISSION_UNKNOWN');
  });

  it('happy path: applies diff and returns updated detail', async () => {
    grantAll();
    let revokedCalled = false;
    let addedCalled = false;
    // pool.execute for role existence + permission resolution + final getRole
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM roles WHERE id = ?')) {
        return [[{ id: 2, role_code: 'READONLY_VIEWER', role_name: '只读访客', role_scope: 'SYSTEM', role_status: 'ACTIVE', description: null }], []];
      }
      if (sql.includes('SELECT id, permission_code FROM permissions WHERE permission_code IN')) {
        return [[{ id: 100, permission_code: 'APS_BATCH_READ' }], []];
      }
      if (sql.includes('FROM role_permissions rp') && sql.includes("grant_status = 'ACTIVE'") && sql.includes('JOIN permissions p ON p.id = rp.permission_id\n       WHERE rp.role_id = ?')) {
        // getRole final read
        return [[{ permission_code: 'APS_BATCH_READ' }], []];
      }
      if (sql.includes('FROM role_permissions rp')) return [[], []];
      // invalidateRoleHolders DISTINCT user_id
      if (sql.includes('SELECT DISTINCT user_id FROM user_role_assignments')) return [[{ user_id: 1 }], []];
      return [[], []];
    });
    // transaction: current ACTIVE perms (empty) + inserts + revokes
    connExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM role_permissions rp') && sql.includes("grant_status = 'ACTIVE'")) {
        return [[], []]; // 当前无授权 -> 全是 toAdd
      }
      if (sql.startsWith('INSERT INTO role_permissions')) {
        addedCalled = true;
        return [[{}], []];
      }
      if (sql.includes('UPDATE role_permissions') && sql.includes("'REVOKED'")) {
        revokedCalled = true;
        return [[{}], []];
      }
      return [[{}], []];
    });

    const res = await auth(request(app).put('/api/governance/roles/2/permissions')).send({ permissionCodes: ['APS_BATCH_READ'] });
    expect(res.status).toBe(200);
    expect(addedCalled).toBe(true);
    expect(revokedCalled).toBe(false); // nothing to remove
    expect(res.body.data.permissionCodes).toEqual(['APS_BATCH_READ']);
    expect(fakeConnection.commit).toHaveBeenCalled();
  });

  it('returns 400 when permissionCodes is not an array', async () => {
    grantAll();
    const res = await auth(request(app).put('/api/governance/roles/2/permissions')).send({ permissionCodes: 'oops' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });
});

describe('DELETE /api/governance/roles/:id (soft delete)', () => {
  it('refuses to delete GOVERNANCE_ADMIN', async () => {
    grantAll();
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM roles WHERE id = ?')) {
        return [[{ id: 1, role_code: 'GOVERNANCE_ADMIN', role_name: '系统管理员', role_scope: 'GOVERNANCE', role_status: 'ACTIVE', description: null }], []];
      }
      if (sql.includes('FROM role_permissions rp')) return [[], []];
      return [[], []];
    });
    const res = await auth(request(app).delete('/api/governance/roles/1'));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ROLE_PROTECTED');
  });

  it('soft-deletes a normal role (RETIRED)', async () => {
    grantAll();
    let retired = false;
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM roles WHERE id = ?')) {
        return [[{ id: 5, role_code: 'TEMP_ROLE', role_name: '临时', role_scope: 'APS', role_status: 'ACTIVE', description: null }], []];
      }
      if (sql.includes('FROM role_permissions rp')) return [[], []];
      if (sql.includes("UPDATE roles SET role_status = 'RETIRED'")) { retired = true; return [[{}], []]; }
      if (sql.includes('SELECT DISTINCT user_id FROM user_role_assignments')) return [[], []];
      return [[], []];
    });
    const res = await auth(request(app).delete('/api/governance/roles/5'));
    expect(res.status).toBe(200);
    expect(retired).toBe(true);
    expect(res.body.data.retired).toBe(true);
  });
});

describe('PUT /api/governance/roles/:id (update) protects GOVERNANCE_ADMIN deactivation', () => {
  it('refuses to set GOVERNANCE_ADMIN to INACTIVE', async () => {
    grantAll();
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM roles WHERE id = ?')) {
        return [[{ id: 1, role_code: 'GOVERNANCE_ADMIN', role_name: '系统管理员', role_scope: 'GOVERNANCE', role_status: 'ACTIVE', description: null }], []];
      }
      if (sql.includes('FROM role_permissions rp')) return [[], []];
      return [[], []];
    });
    const res = await auth(request(app).put('/api/governance/roles/1')).send({ roleStatus: 'INACTIVE' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ROLE_PROTECTED');
  });
});

describe('POST /api/governance/users (create) + role assignment + scope', () => {
  it('creates user with bcrypt credential (must_change_password=1) and never returns hash', async () => {
    grantAll();
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE username = ?')) return [[], []]; // 不冲突
      if (sql.includes('SELECT id, username, display_name, email')) {
        // getUser final read
        return [[{ id: 50, username: 'jdoe', display_name: '张三', email: 'j@x.com', auth_provider: 'LOCAL', external_subject: null, user_status: 'ACTIVE', mfa_required: 0, last_login_at: null }], []];
      }
      if (sql.includes('FROM user_role_assignments')) return [[], []]; // loadActiveAssignments
      return [[], []];
    });
    let credInsertSql = '';
    connExecute.mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.startsWith('INSERT INTO users')) return [{ insertId: 50 } as any, []];
      if (sql.startsWith('INSERT INTO user_credentials')) {
        credInsertSql = sql;
        // password_hash 必须是 bcrypt（$2a/$2b 开头），不是明文
        expect(String(params?.[1])).toMatch(/^\$2[aby]\$/);
        return [{ insertId: 1 } as any, []];
      }
      return [[{}], []];
    });
    const res = await auth(request(app).post('/api/governance/users')).send({ username: 'jdoe', displayName: '张三', email: 'j@x.com', password: 'secret123' });
    expect(res.status).toBe(201);
    expect(credInsertSql).toContain('must_change_password');
    // 响应里不得含任何 hash 字段
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    expect(res.body.data).toMatchObject({ id: 50, username: 'jdoe' });
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('rejects weak password (<8 chars) with 400 WEAK_PASSWORD', async () => {
    grantAll();
    mockPool.execute.mockResolvedValue([[], []]);
    const res = await auth(request(app).post('/api/governance/users')).send({ username: 'jdoe', displayName: '张三', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });

  it('returns 409 on duplicate username', async () => {
    grantAll();
    mockPool.execute.mockResolvedValueOnce([[{ id: 1 }], []]); // username exists
    const res = await auth(request(app).post('/api/governance/users')).send({ username: 'admin', displayName: 'dup', password: 'secret123' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USERNAME_EXISTS');
  });

  it('assigns a role with scope_unit_id (validates org unit exists) and invalidates cache', async () => {
    grantAll();
    const invalidateSpy = vi.spyOn(PermissionCacheService, 'invalidate');
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, username, display_name, email')) {
        return [[{ id: 50, username: 'jdoe', display_name: '张三', email: null, auth_provider: 'LOCAL', external_subject: null, user_status: 'ACTIVE', mfa_required: 0, last_login_at: null }], []];
      }
      if (sql.includes('SELECT id, role_status FROM roles WHERE id = ?')) {
        return [[{ id: 2, role_status: 'ACTIVE' }], []];
      }
      if (sql.includes('FROM organization_units WHERE id = ?')) {
        return [[{ id: 3 }], []]; // 单元存在
      }
      if (sql.startsWith('INSERT INTO user_role_assignments') && sql.includes('ON DUPLICATE KEY UPDATE')) {
        return [{ insertId: 900, affectedRows: 1 } as any, []];
      }
      if (sql.includes('FROM user_role_assignments ura')) {
        // loadActiveAssignments 回读
        return [[{ assignment_id: 900, user_id: 50, role_id: 2, scope_unit_id: 3, assignment_status: 'ACTIVE', effective_from: '2026-01-01 00:00:00', effective_to: null, role_code: 'READONLY_VIEWER', role_name: '只读访客', scope_unit_name: '上游班组' }], []];
      }
      return [[], []];
    });
    const res = await auth(request(app).post('/api/governance/users/50/role-assignments')).send({ roleId: 2, scopeUnitId: 3 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ assignmentId: 900, roleId: 2, scopeUnitId: 3, scopeUnitName: '上游班组' });
    expect(invalidateSpy).toHaveBeenCalledWith(50);
  });

  it('returns 404 when scope_unit_id does not exist', async () => {
    grantAll();
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, username, display_name, email')) {
        return [[{ id: 50, username: 'jdoe', display_name: '张三', email: null, auth_provider: 'LOCAL', external_subject: null, user_status: 'ACTIVE', mfa_required: 0, last_login_at: null }], []];
      }
      if (sql.includes('FROM user_role_assignments ura')) return [[], []];
      if (sql.includes('SELECT id, role_status FROM roles WHERE id = ?')) return [[{ id: 2, role_status: 'ACTIVE' }], []];
      if (sql.includes('FROM organization_units WHERE id = ?')) return [[], []]; // 不存在
      return [[], []];
    });
    const res = await auth(request(app).post('/api/governance/users/50/role-assignments')).send({ roleId: 2, scopeUnitId: 999 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORG_UNIT_NOT_FOUND');
  });

  it('returns 403 for assign without GOVERNANCE_ROLE_GRANT', async () => {
    grantOnly(['GOVERNANCE_USER_WRITE']);
    const res = await auth(request(app).post('/api/governance/users/50/role-assignments')).send({ roleId: 2 });
    expect(res.status).toBe(403);
    expect(res.body.required).toBe('GOVERNANCE_ROLE_GRANT');
  });
});

describe('DELETE /api/governance/users/:id/role-assignments/:assignmentId', () => {
  it('refuses to revoke the LAST active GOVERNANCE_ADMIN assignment (anti self-lock)', async () => {
    grantAll();
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM user_role_assignments ura') && sql.includes('JOIN roles r ON r.id = ura.role_id') && sql.includes('WHERE ura.id = ?')) {
        return [[{ id: 900, role_id: 1, role_code: 'GOVERNANCE_ADMIN' }], []];
      }
      if (sql.includes('COUNT(DISTINCT ura.user_id) AS holders')) {
        return [[{ holders: 1 }], []]; // 只剩 1 个持有者
      }
      return [[], []];
    });
    const res = await auth(request(app).delete('/api/governance/users/1/role-assignments/900'));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LAST_ADMIN_PROTECTED');
    expect(RbacDirectoryService.revokeUserRole).not.toHaveBeenCalled();
  });

  it('revokes a normal assignment via RbacDirectoryService and invalidates cache', async () => {
    grantAll();
    const invalidateSpy = vi.spyOn(PermissionCacheService, 'invalidate');
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM user_role_assignments ura') && sql.includes('WHERE ura.id = ?')) {
        return [[{ id: 901, role_id: 2, role_code: 'READONLY_VIEWER' }], []];
      }
      return [[], []];
    });
    const res = await auth(request(app).delete('/api/governance/users/50/role-assignments/901'));
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(true);
    expect(RbacDirectoryService.revokeUserRole).toHaveBeenCalledWith(50, 2, 1, null);
    expect(invalidateSpy).toHaveBeenCalledWith(50);
  });

  it('returns 404 when assignment not found for user', async () => {
    grantAll();
    mockPool.execute.mockResolvedValue([[], []]);
    const res = await auth(request(app).delete('/api/governance/users/50/role-assignments/123'));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ASSIGNMENT_NOT_FOUND');
  });
});

describe('PUT /api/governance/users/:id (status) anti self-lock / last-admin protection', () => {
  // 目标用户持有活跃 GOVERNANCE_ADMIN 且为最后一个持有者 → 停用应被拒。
  const mockTargetAdmin = (statusRows: any) => {
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, username, display_name, email')) {
        return [[{ id: 9, username: 'admin2', display_name: '管理员二', email: null, auth_provider: 'LOCAL', external_subject: null, user_status: 'ACTIVE', mfa_required: 0, last_login_at: null }], []];
      }
      if (sql.includes('FROM user_role_assignments ura') && sql.includes('JOIN roles r ON r.id = ura.role_id') && sql.includes('IN (')) {
        // loadActiveAssignments：目标持有活跃 GOVERNANCE_ADMIN
        return [[{ assignment_id: 5, user_id: 9, role_id: 1, scope_unit_id: null, assignment_status: 'ACTIVE', effective_from: '2026-01-01 00:00:00', effective_to: null, role_code: 'GOVERNANCE_ADMIN', role_name: '系统管理员', scope_unit_name: null }], []];
      }
      if (sql.includes('COUNT(DISTINCT ura.user_id) AS holders')) {
        return [[statusRows], []];
      }
      return [[], []];
    });
  };

  it('refuses to deactivate the last active GOVERNANCE_ADMIN holder', async () => {
    grantAll();
    mockTargetAdmin({ holders: 1 });
    const res = await auth(request(app).put('/api/governance/users/9').send({ userStatus: 'INACTIVE' }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LAST_ADMIN_PROTECTED');
  });

  it('refuses to lock/disable your own account (actor === target)', async () => {
    grantAll();
    // actor 的 token sub=1；这里目标也设为 1。
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, username, display_name, email')) {
        return [[{ id: 1, username: 'admin', display_name: '系统管理员', email: null, auth_provider: 'LOCAL', external_subject: null, user_status: 'ACTIVE', mfa_required: 0, last_login_at: null }], []];
      }
      if (sql.includes('FROM user_role_assignments ura') && sql.includes('IN (')) return [[], []];
      return [[], []];
    });
    const res = await auth(request(app).put('/api/governance/users/1').send({ userStatus: 'LOCKED' }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LAST_ADMIN_PROTECTED');
  });

  it('allows deactivating a non-admin user', async () => {
    grantAll();
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, username, display_name, email')) {
        return [[{ id: 9, username: 'jdoe', display_name: '张三', email: null, auth_provider: 'LOCAL', external_subject: null, user_status: 'ACTIVE', mfa_required: 0, last_login_at: null }], []];
      }
      if (sql.includes('FROM user_role_assignments ura') && sql.includes('IN (')) return [[], []];
      if (sql.startsWith('UPDATE users SET')) return [{ affectedRows: 1 } as any, []];
      return [[], []];
    });
    const res = await auth(request(app).put('/api/governance/users/9').send({ userStatus: 'INACTIVE' }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/governance/org-units', () => {
  it('returns org units as a tree', async () => {
    grantAll();
    mockPool.execute.mockResolvedValueOnce([[
      { id: 1, parent_id: null, unit_type: 'DEPARTMENT', unit_code: 'DEP1', unit_name: '生产部', is_active: 1 },
      { id: 2, parent_id: 1, unit_type: 'TEAM', unit_code: 'T1', unit_name: '上游班组', is_active: 1 },
      { id: 3, parent_id: 1, unit_type: 'TEAM', unit_code: 'T2', unit_name: '下游班组', is_active: 1 },
    ], []]);
    const res = await auth(request(app).get('/api/governance/org-units'));
    expect(res.status).toBe(200);
    const roots = res.body.data as Array<any>;
    expect(roots).toHaveLength(1);
    expect(roots[0].unitName).toBe('生产部');
    expect(roots[0].children.map((c: any) => c.unitName)).toEqual(['上游班组', '下游班组']);
  });
});

describe('auth enforcement on governance routes', () => {
  it('rejects anonymous (no token) with 401 in enforce mode', async () => {
    process.env.AUTH_ENFORCE = 'true';
    const res = await request(app).get('/api/governance/roles');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('shadow mode: anonymous READ is allowed (shadow), but anonymous WRITE is rejected 401', async () => {
    process.env.AUTH_ENFORCE = 'false';
    grantAll();
    mockPool.execute.mockResolvedValue([[], []]);
    // READ 仍放行（影子语义不破坏现有前端）。
    const readRes = await request(app).get('/api/governance/roles');
    expect(readRes.status).toBe(200);
    // WRITE 端点（创建用户）即便影子模式也拒绝匿名直连。
    const writeRes = await request(app).post('/api/governance/users').send({ username: 'x', displayName: 'X', password: 'abcdefgh' });
    expect(writeRes.status).toBe(401);
    expect(writeRes.body.code).toBe('AUTH_REQUIRED');
    process.env.AUTH_ENFORCE = 'true';
  });
});
