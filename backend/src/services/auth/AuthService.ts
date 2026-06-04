/**
 * AuthService —— 认证主流程编排（登录 / 签发令牌 / 改密）。
 *
 * 职责分层：
 *   - "你是谁" 交给 IdentityProvider（本地 = LocalPasswordProvider，将来 AAD = AzureAdOidcProvider）。
 *   - "你能干啥" 的角色来自 RbacDirectoryService.getUserRoles()（复用，绝不重写 SQL）。
 *   - "随身令牌" 交给 JwtService.sign。
 * AuthService 把这三段缝起来，对外只暴露 login / issueToken / changePassword。
 *
 * 契约（两实现阶段一致）：
 *   login(username, password): { token, user, mustChangePassword }
 *   issueToken(userId): string                 —— 查角色组 claims → 签发
 *   changePassword(userId, oldPwd, newPwd): void
 */
import type { RowDataPacket } from 'mysql2/promise';
import * as bcrypt from 'bcryptjs';
import pool from '../../config/database';
import { RbacDirectoryService } from '../governance/RbacDirectoryService';
import { JwtService } from './JwtService';
import { LocalPasswordProvider } from './LocalPasswordProvider';
import { AuthError } from './IdentityProvider';
import type { AuthenticatedUser, LoginResult } from '../../domain/auth/authTypes';

const BCRYPT_ROUNDS = 10;

interface UserIdentityRow extends RowDataPacket {
  id: number;
  username: string;
  display_name: string;
  auth_provider: string;
}

interface ChangePwdRow extends RowDataPacket {
  password_hash: string;
  credential_status: string;
}

export class AuthService {
  private static localProvider = new LocalPasswordProvider();

  /**
   * 本地用户名/密码登录。
   * 成功路径：provider 校验（含失败计数/锁定/last_login_at 副作用）→ issueToken → 读 mustChangePassword。
   * 失败：抛 AuthError（由路由层映射到统一 401 信封）。
   */
  static async login(username: string, password: string): Promise<LoginResult> {
    const { userId } = await this.localProvider.authenticate({ username, password });

    const token = await this.issueToken(userId);
    const user = await this.buildAuthenticatedUser(userId, 'LOCAL');
    const mustChangePassword = await this.readMustChangePassword(userId);

    return { token, user, mustChangePassword };
  }

  /**
   * 为已确认身份的 userId 签发 JWT。
   * 这里查 getUserRoles 组装 role_code 列表写进 claims —— 令牌只带 code，不带完整 Role。
   * 复用此方法即可让 LOCAL 与（将来）AZURE_AD 走同一套签发逻辑。
   */
  static async issueToken(userId: number, source: 'LOCAL' | 'AZURE_AD' = 'LOCAL'): Promise<string> {
    const userRow = await this.loadUserIdentity(userId);
    if (!userRow) {
      throw new AuthError('INVALID_CREDENTIALS', `user ${userId} not found`);
    }
    return JwtService.sign({
      sub: String(userId),
      username: userRow.username,
      displayName: userRow.display_name,
      roles: await this.loadRoleCodes(userId),
      src: source,
    });
  }

  /**
   * 改密：校验旧密码（bcrypt）→ 写新哈希、must_change_password=0、清失败计数/锁、更新时间戳。
   * 失败（凭据缺失/已禁用/旧密码不符）抛 AuthError。
   */
  static async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 8) {
      throw new AuthError('INVALID_CREDENTIALS', 'new password must be at least 8 characters');
    }

    const [rows] = await pool.execute<ChangePwdRow[]>(
      `SELECT password_hash, credential_status
       FROM user_credentials
       WHERE user_id = ? AND credential_type = 'PASSWORD'
       LIMIT 1`,
      [userId],
    );
    const cred = rows[0];
    if (!cred) {
      throw new AuthError('INVALID_CREDENTIALS', 'no password credential for this user');
    }
    if (cred.credential_status !== 'ACTIVE') {
      throw new AuthError('ACCOUNT_LOCKED', 'credential is disabled');
    }
    if (!bcrypt.compareSync(oldPassword, cred.password_hash)) {
      throw new AuthError('INVALID_CREDENTIALS', 'old password is incorrect');
    }

    const newHash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
    await pool.execute(
      `UPDATE user_credentials
       SET password_hash = ?,
           password_algo = 'BCRYPT',
           must_change_password = 0,
           failed_attempts = 0,
           locked_until = NULL,
           password_updated_at = NOW()
       WHERE user_id = ? AND credential_type = 'PASSWORD'`,
      [newHash, userId],
    );
  }

  /** 装配挂到 req.user 的运行时身份（用户标识 + role_code 列表）。 */
  static async buildAuthenticatedUser(userId: number, source: 'LOCAL' | 'AZURE_AD'): Promise<AuthenticatedUser> {
    const userRow = await this.loadUserIdentity(userId);
    if (!userRow) {
      throw new AuthError('INVALID_CREDENTIALS', `user ${userId} not found`);
    }
    return {
      userId: Number(userRow.id),
      username: userRow.username,
      displayName: userRow.display_name,
      roles: await this.loadRoleCodes(userId),
      source,
    };
  }

  /**
   * 取用户的去重 role_code 列表。
   * 防御性去重：user_role_assignments 上若存在重复的 (user_id, role_id) 活跃行（历史数据/缺唯一约束），
   * getUserRoles 会返回重复角色；这里收敛成 distinct，避免令牌里塞重复 role_code。
   */
  private static async loadRoleCodes(userId: number): Promise<string[]> {
    const roles = await RbacDirectoryService.getUserRoles(userId);
    return Array.from(new Set(roles.map((r) => r.roleCode)));
  }

  private static async loadUserIdentity(userId: number): Promise<UserIdentityRow | undefined> {
    const [rows] = await pool.execute<UserIdentityRow[]>(
      `SELECT id, username, display_name, auth_provider
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId],
    );
    return rows[0];
  }

  private static async readMustChangePassword(userId: number): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT must_change_password
       FROM user_credentials
       WHERE user_id = ? AND credential_type = 'PASSWORD'
       LIMIT 1`,
      [userId],
    );
    const value = rows[0]?.must_change_password;
    return value === 1 || value === true || value === '1';
  }
}
