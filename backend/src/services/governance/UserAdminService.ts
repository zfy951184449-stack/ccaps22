/**
 * UserAdminService —— 治理配置界面用的「用户账号 / 凭据 / 角色授权」管理服务。
 *
 * 复用既有 RBAC 读服务（RbacDirectoryService）取用户角色；写授权用本服务的 SQL。
 * 密码一律 bcrypt（bcryptjs，rounds=10，与 AuthService 一致）存 user_credentials；绝不回传 hash。
 *
 * 安全不变量（服务层兜底）：
 *   - 撤销角色授权时，禁止移除「某用户对 GOVERNANCE_ADMIN 的最后一个活跃授权且该用户是操作者本人」——
 *     防止管理员把自己唯一的治理权撤掉造成自锁。更宽：禁止撤掉全系统最后一个 GOVERNANCE_ADMIN 持有者，
 *     避免无人能再管理。
 *   - 新建用户的初始密码 must_change_password=1，强制首次登录改密。
 */
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import * as bcrypt from 'bcryptjs';
import pool from '../../config/database';
import type { DbExecutor } from '../../config/database';
import { mapUserRow } from '../../mappers/governance/RbacMapper';
import type { User, UserStatus } from '../../domain/governance/rbacTypes';
import { RbacDirectoryService } from './RbacDirectoryService';
import { PermissionCacheService } from '../auth/PermissionCacheService';
import { PROTECTED_ROLE_CODE } from './RbacAdminService';

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED', 'RETIRED'] as const;

export class UserAdminError extends Error {
  constructor(
    public readonly code:
      | 'USER_NOT_FOUND'
      | 'USERNAME_EXISTS'
      | 'ROLE_NOT_FOUND'
      | 'ASSIGNMENT_NOT_FOUND'
      | 'ORG_UNIT_NOT_FOUND'
      | 'LAST_ADMIN_PROTECTED'
      | 'WEAK_PASSWORD'
      | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'UserAdminError';
  }
}

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

export interface UserSummary extends User {
  roles: RoleAssignmentView[];
}

const isValidUserStatus = (value: unknown): value is UserStatus =>
  (USER_STATUSES as readonly string[]).includes(value as string);

export class UserAdminService {
  // ---- 列表 / 详情 ----------------------------------------------------------

  /** 用户列表，每个用户附其当前活跃角色授权（含 scope 单元名）。 */
  static async listUsers(db: DbExecutor = pool): Promise<UserSummary[]> {
    const [userRows] = await db.execute<RowDataPacket[]>(
      `SELECT id, username, display_name, email, auth_provider, external_subject,
              user_status, mfa_required, last_login_at
       FROM users
       ORDER BY username`,
    );
    if (userRows.length === 0) return [];

    const assignments = await this.loadActiveAssignments(
      userRows.map((u) => Number(u.id)),
      db,
    );
    return userRows.map((row) => ({
      ...mapUserRow(row),
      roles: assignments.get(Number(row.id)) ?? [],
    }));
  }

  /** 单用户详情 + 活跃角色授权。不存在抛 USER_NOT_FOUND。 */
  static async getUser(userId: number, db: DbExecutor = pool): Promise<UserSummary> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, username, display_name, email, auth_provider, external_subject,
              user_status, mfa_required, last_login_at
       FROM users WHERE id = ? LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) throw new UserAdminError('USER_NOT_FOUND', `user ${userId} not found`);

    const assignments = await this.loadActiveAssignments([userId], db);
    return { ...mapUserRow(row), roles: assignments.get(userId) ?? [] };
  }

  /** 批量取用户的活跃角色授权，按 userId 分组。 */
  private static async loadActiveAssignments(
    userIds: number[],
    db: DbExecutor = pool,
  ): Promise<Map<number, RoleAssignmentView[]>> {
    const result = new Map<number, RoleAssignmentView[]>();
    if (userIds.length === 0) return result;
    const inList = userIds.map(() => '?').join(',');
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT ura.id AS assignment_id, ura.user_id, ura.role_id, ura.scope_unit_id,
              ura.assignment_status, ura.effective_from, ura.effective_to,
              r.role_code, r.role_name,
              ou.unit_name AS scope_unit_name
       FROM user_role_assignments ura
       JOIN roles r ON r.id = ura.role_id
       LEFT JOIN organization_units ou ON ou.id = ura.scope_unit_id
       WHERE ura.user_id IN (${inList})
         AND ura.assignment_status = 'ACTIVE'
         AND (ura.effective_to IS NULL OR ura.effective_to > NOW())
       ORDER BY r.role_scope, r.role_code`,
      userIds,
    );
    for (const row of rows) {
      const uid = Number(row.user_id);
      if (!result.has(uid)) result.set(uid, []);
      result.get(uid)!.push({
        assignmentId: Number(row.assignment_id),
        roleId: Number(row.role_id),
        roleCode: String(row.role_code),
        roleName: String(row.role_name),
        scopeUnitId: row.scope_unit_id == null ? null : Number(row.scope_unit_id),
        scopeUnitName: row.scope_unit_name == null ? null : String(row.scope_unit_name),
        assignmentStatus: String(row.assignment_status),
        effectiveFrom: String(row.effective_from),
        effectiveTo: row.effective_to == null ? null : String(row.effective_to),
      });
    }
    return result;
  }

  // ---- 用户 CRUD ------------------------------------------------------------

  /**
   * 新建本地用户 + 初始密码凭据（bcrypt，must_change_password=1）。事务保证用户与凭据同进退。
   * username 唯一冲突映射 USERNAME_EXISTS。
   */
  static async createUser(input: {
    username: string;
    displayName: string;
    email?: string | null;
    password: string;
  }): Promise<UserSummary> {
    const username = String(input.username ?? '').trim();
    const displayName = String(input.displayName ?? '').trim();
    const email = input.email == null || input.email === '' ? null : String(input.email).trim();
    if (!username || !displayName) {
      throw new UserAdminError('BAD_REQUEST', 'username and displayName are required');
    }
    if (typeof input.password !== 'string' || input.password.length < MIN_PASSWORD_LENGTH) {
      throw new UserAdminError('WEAK_PASSWORD', `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM users WHERE username = ? LIMIT 1`,
      [username],
    );
    if (existing.length > 0) {
      throw new UserAdminError('USERNAME_EXISTS', `username ${username} already exists`);
    }

    const hash = bcrypt.hashSync(input.password, BCRYPT_ROUNDS);

    const connection = await pool.getConnection();
    let newUserId: number;
    try {
      await connection.beginTransaction();
      const [userResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users (username, display_name, email, auth_provider, user_status)
         VALUES (?, ?, ?, 'LOCAL', 'ACTIVE')`,
        [username, displayName, email],
      );
      newUserId = userResult.insertId;
      await connection.execute(
        `INSERT INTO user_credentials (user_id, credential_type, password_hash, password_algo, must_change_password, password_updated_at)
         VALUES (?, 'PASSWORD', ?, 'BCRYPT', 1, NOW())`,
        [newUserId, hash],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return this.getUser(newUserId);
  }

  /**
   * 更新用户档案：display_name / email / user_status。username 不可改（稳定登录名）。
   * 账号停用/锁定（user_status 改非 ACTIVE）属高敏，由控制器挂 GOVERNANCE_USER_OPERATE。
   * 状态改变后失效该用户权限缓存（停用账号应立即丢权）。
   *
   * 自锁/最后管理员防护（与 revokeAssignment 的 LAST_ADMIN_PROTECTED 语义一致）：
   * 当把账号状态改为非 ACTIVE（停用/锁定/退役）时，
   *   - 禁止操作者停用/锁定自己（防自锁）；
   *   - 若目标持有活跃 GOVERNANCE_ADMIN 且其为最后一个活跃持有者，拒绝（防治理面无人可管）。
   * actorId 为当前操作者（控制器从 req.user.userId 传入）；匿名（影子模式）传 null，跳过自锁判定。
   */
  static async updateUser(
    userId: number,
    input: { displayName?: string; email?: string | null; userStatus?: string },
    actorId: number | null = null,
  ): Promise<UserSummary> {
    const current = await this.getUser(userId);

    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.displayName !== undefined) {
      const name = String(input.displayName).trim();
      if (!name) throw new UserAdminError('BAD_REQUEST', 'displayName cannot be empty');
      sets.push('display_name = ?');
      params.push(name);
    }
    if (input.email !== undefined) {
      sets.push('email = ?');
      params.push(input.email == null || input.email === '' ? null : String(input.email).trim());
    }
    if (input.userStatus !== undefined) {
      if (!isValidUserStatus(input.userStatus)) {
        throw new UserAdminError('BAD_REQUEST', `invalid userStatus: ${input.userStatus}`);
      }
      // 仅当真的从 ACTIVE 切到非 ACTIVE 时做防护（重复设同值或激活账号不受限）。
      const deactivating = input.userStatus !== 'ACTIVE' && current.userStatus === 'ACTIVE';
      if (deactivating) {
        // 防自锁：操作者不能停用/锁定自己。
        if (actorId != null && actorId === userId) {
          throw new UserAdminError(
            'LAST_ADMIN_PROTECTED',
            'cannot disable or lock your own account',
          );
        }
        // 防最后一个 GOVERNANCE_ADMIN 被停用：若目标当前持有活跃 GOVERNANCE_ADMIN 授权，
        // 且全系统活跃持有者 <= 1，则拒绝。
        const targetHasAdmin = current.roles.some(
          (r) => r.roleCode === PROTECTED_ROLE_CODE && r.assignmentStatus === 'ACTIVE',
        );
        if (targetHasAdmin && (await this.countActiveAdminHolders()) <= 1) {
          throw new UserAdminError(
            'LAST_ADMIN_PROTECTED',
            `cannot deactivate the last active ${PROTECTED_ROLE_CODE} holder (would lock out governance)`,
          );
        }
      }
      sets.push('user_status = ?');
      params.push(input.userStatus);
    }

    if (sets.length === 0) return current;
    params.push(userId);
    await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);

    if (input.userStatus !== undefined && input.userStatus !== current.userStatus) {
      PermissionCacheService.invalidate(userId);
    }
    return this.getUser(userId);
  }

  /** 全系统持有活跃 GOVERNANCE_ADMIN 授权的去重用户数（自锁防护共用）。 */
  private static async countActiveAdminHolders(db: DbExecutor = pool): Promise<number> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT ura.user_id) AS holders
       FROM user_role_assignments ura
       JOIN roles r ON r.id = ura.role_id
       WHERE r.role_code = ?
         AND ura.assignment_status = 'ACTIVE'
         AND (ura.effective_to IS NULL OR ura.effective_to > NOW())`,
      [PROTECTED_ROLE_CODE],
    );
    return Number(rows[0]?.holders ?? 0);
  }

  /**
   * 重置用户密码（管理员操作）：bcrypt 写新哈希、must_change_password=1、清失败计数/锁、凭据置 ACTIVE。
   * 凭据不存在则创建（容错历史只建 users 未建凭据的账号）。
   */
  static async resetPassword(userId: number, newPassword: string): Promise<void> {
    await this.getUser(userId); // 存在性
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new UserAdminError('WEAK_PASSWORD', `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const hash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
    await pool.execute(
      `INSERT INTO user_credentials
         (user_id, credential_type, password_hash, password_algo, must_change_password, failed_attempts, locked_until, password_updated_at, credential_status)
       VALUES (?, 'PASSWORD', ?, 'BCRYPT', 1, 0, NULL, NOW(), 'ACTIVE')
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         password_algo = 'BCRYPT',
         must_change_password = 1,
         failed_attempts = 0,
         locked_until = NULL,
         password_updated_at = NOW(),
         credential_status = 'ACTIVE'`,
      [userId, hash],
    );
  }

  // ---- 角色授权 -------------------------------------------------------------

  /**
   * 给用户分配角色（可选 scope_unit_id）。校验：用户存在、角色存在且 ACTIVE、scope 单元存在。
   *
   * 幂等策略（库级 upsert）：库层唯一活跃约束 uk_ura_active —— 虚拟列 active_assignment_guard
   * + UNIQUE(user_id, role_id, active_assignment_guard) —— 保证每 (user_id, role_id) 至多一条 ACTIVE
   * （由 scripts/auth/run_auth_migrations.ts 的 ensureSingleActiveRoleAssignment 建立）。
   * 因此不能用 INSERT IGNORE（对已存在的活跃行会被静默忽略 → 改 scope 时 scope 改不动）。
   * 改用 INSERT ... ON DUPLICATE KEY UPDATE：命中 uk_ura_active 时复活/更新该活跃行的 scope_unit_id /
   * reason_text / assigned_by，否则插入新行。原子、幂等，无“匹配但未变更→重复插入”的边角。
   * 授权后失效该用户缓存，再回读返回最新活跃授权。
   */
  static async assignRole(input: {
    userId: number;
    roleId: number;
    scopeUnitId?: number | null;
    assignedBy: number;
    reasonText?: string | null;
  }): Promise<RoleAssignmentView> {
    await this.getUser(input.userId); // 用户存在性

    const [roleRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, role_status FROM roles WHERE id = ? LIMIT 1`,
      [input.roleId],
    );
    const role = roleRows[0];
    if (!role) throw new UserAdminError('ROLE_NOT_FOUND', `role ${input.roleId} not found`);
    if (role.role_status !== 'ACTIVE') {
      throw new UserAdminError('ROLE_NOT_FOUND', `role ${input.roleId} is not active`);
    }

    const scopeUnitId = input.scopeUnitId == null ? null : Number(input.scopeUnitId);
    if (scopeUnitId != null) {
      const [unitRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM organization_units WHERE id = ? LIMIT 1`,
        [scopeUnitId],
      );
      if (unitRows.length === 0) {
        throw new UserAdminError('ORG_UNIT_NOT_FOUND', `organization unit ${scopeUnitId} not found`);
      }
    }

    // 库级 upsert：命中 uk_ura_active(user_id, role_id, ACTIVE) 则更新该活跃行，否则插入新行。
    await pool.execute(
      `INSERT INTO user_role_assignments (user_id, role_id, scope_unit_id, assignment_status, assigned_by, reason_text)
       VALUES (?, ?, ?, 'ACTIVE', ?, ?)
       ON DUPLICATE KEY UPDATE
         scope_unit_id = VALUES(scope_unit_id),
         reason_text = COALESCE(VALUES(reason_text), reason_text),
         assigned_by = VALUES(assigned_by),
         assignment_status = 'ACTIVE',
         effective_to = NULL`,
      [input.userId, input.roleId, scopeUnitId, input.assignedBy, input.reasonText ?? null],
    );

    PermissionCacheService.invalidate(input.userId);

    // 回读该 (user, role) 的活跃授权（既有或刚建）。
    const assignments = await this.loadActiveAssignments([input.userId]);
    const view = (assignments.get(input.userId) ?? []).find((a) => a.roleId === input.roleId);
    if (!view) {
      // 理论不可达（刚插入或既有），兜底报错而非返回半成品。
      throw new UserAdminError('ASSIGNMENT_NOT_FOUND', 'assignment not found after insert');
    }
    return view;
  }

  /**
   * 撤销某条角色授权。校验该授权属于该用户且为活跃。
   * 自锁防护：若被撤的是 GOVERNANCE_ADMIN，且撤后全系统将不再有任何活跃 GOVERNANCE_ADMIN 持有者 → 拒绝。
   * 复用 RbacDirectoryService.revokeUserRole 执行撤销（不重写 RBAC SQL）。撤销后失效该用户缓存。
   */
  static async revokeAssignment(
    userId: number,
    assignmentId: number,
    revokedBy: number,
    reasonText?: string | null,
  ): Promise<void> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ura.id, ura.role_id, r.role_code
       FROM user_role_assignments ura
       JOIN roles r ON r.id = ura.role_id
       WHERE ura.id = ? AND ura.user_id = ? AND ura.assignment_status = 'ACTIVE'
       LIMIT 1`,
      [assignmentId, userId],
    );
    const assignment = rows[0];
    if (!assignment) {
      throw new UserAdminError('ASSIGNMENT_NOT_FOUND', `active assignment ${assignmentId} not found for user ${userId}`);
    }

    // 自锁防护：撤掉最后一个 GOVERNANCE_ADMIN 持有者会让治理面无人可管。
    if (String(assignment.role_code) === PROTECTED_ROLE_CODE && (await this.countActiveAdminHolders()) <= 1) {
      throw new UserAdminError(
        'LAST_ADMIN_PROTECTED',
        `cannot revoke the last active ${PROTECTED_ROLE_CODE} assignment (would lock out governance)`,
      );
    }

    await RbacDirectoryService.revokeUserRole(userId, Number(assignment.role_id), revokedBy, reasonText ?? null);
    PermissionCacheService.invalidate(userId);
  }
}

export default UserAdminService;
