/**
 * Auth 接入层测试：登录、requireAuth（影子 vs 强制）、requirePermission、requireServiceAuth。
 *
 * 关键：JwtService 在模块加载时读 JWT_SECRET 并 fail-fast，而 import app 会传递性加载它。
 * 因此用 vi.hoisted 在所有 import 求值之前注入认证相关 env（hoisted 块由 vitest 提到最顶）。
 *
 * DB 全部走 vi.mock('../config/database')，按 SQL 文本路由返回，不连真实库。
 * 权限缓存测试直接 mock RbacDirectoryService.getUserPermissions。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// 在任何 import 求值前注入 env（vitest 会把 vi.hoisted 提到文件最顶执行）。
vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret-for-vitest-only-0123456789abcdef';
  process.env.JWT_EXPIRES_IN = '8h';
  process.env.JWT_ISSUER = 'mfg8aps';
  process.env.JWT_AUDIENCE = 'mfg8aps-web';
  process.env.SOLVER_CALLBACK_SECRET = 'test-solver-callback-secret';
  // 默认影子模式；个别用例内再覆盖。
  process.env.AUTH_ENFORCE = 'false';
});

// --- DB mock：pool.execute + pool.getConnection（登录成功路径用事务）。 ---
const connExecute = vi.fn(async () => [{}, []]);
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

// --- RbacDirectoryService mock：角色（issueToken/buildAuthenticatedUser 用）+ 权限（cache 用）。 ---
vi.mock('../services/governance/RbacDirectoryService', () => ({
  RbacDirectoryService: {
    getUserRoles: vi.fn(async () => [
      { id: 1, roleCode: 'GOVERNANCE_ADMIN', roleName: '治理管理员', roleScope: 'GOVERNANCE', roleStatus: 'ACTIVE' },
    ]),
    getUserPermissions: vi.fn(async () => [
      { id: 1, permissionCode: 'aps.solve.run', permissionName: '运行求解', permissionDomain: 'APS', actionCode: 'run', resourceCode: 'solve', permissionStatus: 'ACTIVE' },
    ]),
  },
}));

import app from '../server';
import pool from '../config/database';
import { JwtService } from '../services/auth/JwtService';
import { PermissionCacheService } from '../services/auth/PermissionCacheService';
import { RbacDirectoryService } from '../services/governance/RbacDirectoryService';

const mockPool = pool as unknown as { execute: ReturnType<typeof vi.fn>; getConnection: ReturnType<typeof vi.fn> };

// admin/admin 的 bcrypt 哈希（rounds=10）。
const ADMIN_HASH = '$2b$10$O157AyOFGY3bvcmIAxLmf.uTbt40qvvWhXm0htgig9oflRKWAiXIG';

/** 装配登录/身份相关 SQL 的默认返回（成功路径）。 */
const installAuthSqlMock = (overrides?: { passwordHash?: string; userStatus?: string; credentialStatus?: string; mustChange?: number }) => {
  const passwordHash = overrides?.passwordHash ?? ADMIN_HASH;
  const userStatus = overrides?.userStatus ?? 'ACTIVE';
  const credentialStatus = overrides?.credentialStatus ?? 'ACTIVE';
  const mustChange = overrides?.mustChange ?? 1;

  mockPool.execute.mockImplementation(async (sql: string) => {
    // LocalPasswordProvider: JOIN users + user_credentials
    if (sql.includes('FROM users u') && sql.includes('JOIN user_credentials uc')) {
      return [[{
        user_id: 1,
        user_status: userStatus,
        password_hash: passwordHash,
        failed_attempts: 0,
        locked_until: null,
        credential_status: credentialStatus,
      }], []];
    }
    // AuthService.loadUserIdentity
    if (sql.includes('SELECT id, username, display_name, auth_provider')) {
      return [[{ id: 1, username: 'admin', display_name: '超级管理员', auth_provider: 'LOCAL' }], []];
    }
    // readMustChangePassword
    if (sql.includes('SELECT must_change_password')) {
      return [[{ must_change_password: mustChange }], []];
    }
    // failure counter update / others
    return [[], []];
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  connExecute.mockResolvedValue([{}, []]);
  mockPool.getConnection.mockResolvedValue(fakeConnection);
  PermissionCacheService.clear();
  process.env.AUTH_ENFORCE = 'false';
});

afterEach(() => {
  process.env.AUTH_ENFORCE = 'false';
});

describe('POST /api/auth/login', () => {
  it('returns token + user + mustChangePassword on success', async () => {
    installAuthSqlMock({ mustChange: 1 });

    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).toMatchObject({ userId: 1, username: 'admin', source: 'LOCAL' });
    expect(res.body.data.user.roles).toContain('GOVERNANCE_ADMIN');
    expect(res.body.data.mustChangePassword).toBe(true);

    // 签出来的令牌能被 verify 回（同一密钥/iss/aud）。
    const claims = JwtService.verify(res.body.data.token);
    expect(claims.sub).toBe('1');
    expect(claims.src).toBe('LOCAL');
  });

  it('returns 401 INVALID_CREDENTIALS on wrong password', async () => {
    installAuthSqlMock({ passwordHash: ADMIN_HASH }); // 真哈希，但传错密码

    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: 'INVALID_CREDENTIALS' });
  });

  it('returns 400 when username/password missing', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });
});

describe('requireAuth (global mount on /api business routes)', () => {
  // 用一条受全局 requireAuth 保护的业务路径来观察拦/放行行为。
  // /api/auth/me 在路由级也挂了 requireAuth，且语义明确（无身份 401），用它最稳。
  it('shadow mode: no token -> not blocked by requireAuth (me returns 401 by its own user-check, not AUTH_REQUIRED enforce)', async () => {
    process.env.AUTH_ENFORCE = 'false';
    const res = await request(app).get('/api/auth/me');
    // 影子模式 requireAuth 放行（不挂 req.user）；me 控制器因无 req.user 自行回 401。
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('shadow mode: valid token -> req.user populated, me returns identity + permissions', async () => {
    process.env.AUTH_ENFORCE = 'false';
    const token = JwtService.sign({ sub: '1', username: 'admin', displayName: '超级管理员', roles: ['GOVERNANCE_ADMIN'], src: 'LOCAL' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ userId: 1, username: 'admin', source: 'LOCAL' });
    expect(res.body.data.permissions).toContain('aps.solve.run');
  });

  it('enforce mode: no token on a protected business route -> 401 AUTH_REQUIRED', async () => {
    process.env.AUTH_ENFORCE = 'true';
    // 任选一条业务路由（不在白名单里）；不需要它真处理，只要被全局 requireAuth 拦下。
    const res = await request(app).get('/api/organization');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('enforce mode: bad token -> 401 TOKEN_INVALID', async () => {
    process.env.AUTH_ENFORCE = 'true';
    const res = await request(app).get('/api/organization').set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('enforce mode: expired token -> 401 TOKEN_EXPIRED', async () => {
    process.env.AUTH_ENFORCE = 'true';
    // 直接用 jsonwebtoken 造一个已过期、但 iss/aud 正确的令牌。
    const jwt = (await import('jsonwebtoken')).default;
    const expired = jwt.sign(
      { sub: '1', username: 'admin', displayName: 'x', roles: [], src: 'LOCAL' },
      process.env.JWT_SECRET as string,
      { issuer: 'mfg8aps', audience: 'mfg8aps-web', expiresIn: -10 } as any,
    );
    const res = await request(app).get('/api/organization').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('health endpoint is always public (bypasses requireAuth even in enforce mode)', async () => {
    process.env.AUTH_ENFORCE = 'true';
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});

describe('requirePermission factory', () => {
  // 直接对中间件单测：构造最小 express app，避免依赖某条业务路由是否已挂权限。
  const buildMiniApp = async (permissionCode: string) => {
    const express = (await import('express')).default;
    const { requirePermission } = await import('../middleware/requirePermission');
    const mini = express();
    mini.use(express.json());
    // 模拟 requireAuth 已挂 req.user。
    mini.use((req, _res, next) => {
      (req as any).user = { userId: 1, username: 'admin', displayName: 'x', roles: ['GOVERNANCE_ADMIN'], source: 'LOCAL' };
      next();
    });
    mini.get('/guarded', requirePermission(permissionCode), (_req, res) => res.json({ ok: true }));
    return mini;
  };

  it('enforce mode: user HAS permission -> 200', async () => {
    process.env.AUTH_ENFORCE = 'true';
    (RbacDirectoryService.getUserPermissions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 1, permissionCode: 'aps.solve.run', permissionName: 'x', permissionDomain: 'APS', actionCode: 'run', resourceCode: 'solve', permissionStatus: 'ACTIVE' },
    ]);
    const mini = await buildMiniApp('aps.solve.run');
    const res = await request(mini).get('/guarded');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('enforce mode: user LACKS permission -> 403 FORBIDDEN with required code', async () => {
    process.env.AUTH_ENFORCE = 'true';
    (RbacDirectoryService.getUserPermissions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 2, permissionCode: 'aps.solve.run', permissionName: 'x', permissionDomain: 'APS', actionCode: 'run', resourceCode: 'solve', permissionStatus: 'ACTIVE' },
    ]);
    const mini = await buildMiniApp('roster.exception.approve');
    const res = await request(mini).get('/guarded');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN', required: 'roster.exception.approve' });
  });

  it('shadow mode: user LACKS permission -> still allowed (200)', async () => {
    process.env.AUTH_ENFORCE = 'false';
    (RbacDirectoryService.getUserPermissions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const mini = await buildMiniApp('roster.exception.approve');
    const res = await request(mini).get('/guarded');
    expect(res.status).toBe(200);
  });
});

describe('requireServiceAuth (solver callback)', () => {
  it('rejects with 401 SERVICE_AUTH_FAILED when token missing', async () => {
    const res = await request(app).post('/api/v4/scheduling/callback/progress').send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SERVICE_AUTH_FAILED');
  });

  it('rejects with 401 SERVICE_AUTH_FAILED when token mismatched', async () => {
    const res = await request(app)
      .post('/api/v4/scheduling/callback/progress')
      .set('X-Solver-Callback-Token', 'wrong-secret')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SERVICE_AUTH_FAILED');
  });

  it('passes service auth with correct token (then proceeds into controller)', async () => {
    // 正确密钥 → 通过 requireServiceAuth，进入控制器。控制器是否 200 取决于其内部逻辑/DB；
    // 这里只断言"没有被 requireServiceAuth 在 401 拦下"即可证明密钥校验通过。
    const res = await request(app)
      .post('/api/v4/scheduling/callback/progress')
      .set('X-Solver-Callback-Token', process.env.SOLVER_CALLBACK_SECRET as string)
      .send({ runId: 'x', progress: 1 });
    expect(res.status).not.toBe(401);
    expect(res.body?.code).not.toBe('SERVICE_AUTH_FAILED');
  });

  it('returns 503 when SOLVER_CALLBACK_SECRET is not configured', async () => {
    const saved = process.env.SOLVER_CALLBACK_SECRET;
    delete process.env.SOLVER_CALLBACK_SECRET;
    try {
      const res = await request(app).post('/api/v4/scheduling/callback/progress').send({});
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('SERVICE_AUTH_UNCONFIGURED');
    } finally {
      process.env.SOLVER_CALLBACK_SECRET = saved;
    }
  });

  // 安全修复：runs/:id/status 此前被排除在全局 requireAuth 之外却完全无鉴权，
  // 强制模式下任何匿名方猜到 runId 即可读取求解状态。现已挂 requireServiceAuth。
  it('status endpoint rejects anonymous (no service token) -> 401 SERVICE_AUTH_FAILED', async () => {
    process.env.AUTH_ENFORCE = 'true';
    const res = await request(app).get('/api/v4/scheduling/runs/some-run-id/status');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SERVICE_AUTH_FAILED');
  });

  it('status endpoint passes service auth with correct token (not blocked by 401)', async () => {
    // 让 getSolveStatusV4 的 SELECT 返回空行 → 控制器回 404（证明已越过 requireServiceAuth 进入控制器）。
    mockPool.execute.mockResolvedValue([[], []]);
    const res = await request(app)
      .get('/api/v4/scheduling/runs/some-run-id/status')
      .set('X-Solver-Callback-Token', process.env.SOLVER_CALLBACK_SECRET as string);
    // 通过 requireServiceAuth 后进入控制器；这里只断言没被 401 拦下。
    expect(res.status).not.toBe(401);
    expect(res.body?.code).not.toBe('SERVICE_AUTH_FAILED');
  });
});

describe('POST /api/auth/change-password', () => {
  it('requires auth -> 401 when anonymous (shadow mode, no token)', async () => {
    process.env.AUTH_ENFORCE = 'false';
    const res = await request(app).post('/api/auth/change-password').send({ oldPassword: 'admin', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('changes password for authenticated user', async () => {
    const token = JwtService.sign({ sub: '1', username: 'admin', displayName: 'x', roles: ['GOVERNANCE_ADMIN'], src: 'LOCAL' });
    // changePassword SQL: SELECT password_hash, credential_status + UPDATE
    mockPool.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT password_hash, credential_status')) {
        return [[{ password_hash: ADMIN_HASH, credential_status: 'ACTIVE' }], []];
      }
      return [[], []];
    });
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 'admin', newPassword: 'newpass123' });
    expect(res.status).toBe(200);
    expect(res.body.data.changed).toBe(true);
  });
});
