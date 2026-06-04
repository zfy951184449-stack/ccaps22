/**
 * LocalPasswordProvider —— 本地用户名/密码认证（实现 IdentityProvider）。
 *
 * 数据来源：users（账号状态）+ user_credentials（密码哈希 / 失败计数 / 锁定）。
 * 校验顺序（任一不过即抛 AuthError，对外不泄露"是哪一步失败"以外的细节）：
 *   1. users 存在 且 user_status = ACTIVE        （否则 INVALID_CREDENTIALS / ACCOUNT_INACTIVE）
 *   2. user_credentials 存在 且 credential_status = ACTIVE
 *   3. locked_until 为空或已过期                  （否则 ACCOUNT_LOCKED）
 *   4. bcrypt 密码匹配                            （否则递增 failed_attempts，可能触发锁定）
 * 成功：failed_attempts 清零、locked_until 清空、users.last_login_at = NOW()。
 *
 * 锁定策略：失败累计到 MAX_FAILED_ATTEMPTS 时，把 user_credentials.locked_until 设为 NOW()+LOCK_MINUTES。
 * 这是"临时锁"——窗口过后 isLockedUntilActive 自然放行，无需人工解锁；故意只动凭据层的 locked_until，
 * 不去翻 users.user_status=LOCKED（那是治理层的"永久锁/账号停用"语义，应由管理员显式操作，
 * 不能被一次撞库自动触发且无法自愈）。阈值可经 env 覆盖（AUTH_MAX_FAILED_ATTEMPTS / AUTH_LOCK_MINUTES）。
 *
 * 防用户枚举：用户不存在 与 密码错误 都抛 INVALID_CREDENTIALS。
 */
import type { RowDataPacket } from 'mysql2/promise';
import * as bcrypt from 'bcryptjs';
import pool from '../../config/database';
import type { IdentityProvider, AuthErrorCode } from './IdentityProvider';
import { AuthError } from './IdentityProvider';
import type { IdentityResult, LocalCredentials } from '../../domain/auth/authTypes';

const MAX_FAILED_ATTEMPTS = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS) || 5;
const LOCK_MINUTES = Number(process.env.AUTH_LOCK_MINUTES) || 15;

/**
 * 常量时间登录：用户不存在/凭据缺失/账号或凭据非 ACTIVE 等"提前短路"分支若直接抛错，
 * 会跳过故意慢的 bcrypt.compareSync，使有效用户名(走密码比对)与无效用户名的响应时延出现可测差异，
 * 进而被用于枚举有效用户名。下面这个预生成的 dummy hash 用来在所有短路分支上消耗一次等价开销的
 * bcrypt 比对，让两类路径时延趋同。该 hash 是对随机串、以与生产相同 rounds(10) 生成的占位值，
 * 永不匹配任何真实密码。
 */
const DUMMY_BCRYPT_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMy.Mrqkq3sQ7Yr3sQ7Yr3sQ7Yr3sQ7Yr3a';

/** 消耗一次与真实校验等价开销的 bcrypt 比对（结果丢弃），用于平衡短路分支时延。 */
const burnPasswordCompare = (password: string): void => {
  try {
    bcrypt.compareSync(password, DUMMY_BCRYPT_HASH);
  } catch {
    // 忽略：仅为消耗时间，比对结果与异常都不影响后续抛错。
  }
};

interface CredentialRow extends RowDataPacket {
  user_id: number;
  user_status: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | null;
  credential_status: string;
}

const isLockedUntilActive = (lockedUntil: Date | null): boolean => {
  if (!lockedUntil) return false;
  return lockedUntil.getTime() > Date.now();
};

const normalizeCredentials = (credentials: unknown): LocalCredentials => {
  const c = credentials as Partial<LocalCredentials> | null | undefined;
  const username = typeof c?.username === 'string' ? c.username.trim() : '';
  const password = typeof c?.password === 'string' ? c.password : '';
  if (!username || !password) {
    throw new AuthError('INVALID_CREDENTIALS', 'username and password are required');
  }
  return { username, password };
};

export class LocalPasswordProvider implements IdentityProvider {
  async authenticate(credentials: unknown): Promise<IdentityResult> {
    const { username, password } = normalizeCredentials(credentials);

    // 一次取齐 users + user_credentials（PASSWORD 凭据）。
    const [rows] = await pool.execute<CredentialRow[]>(
      `SELECT u.id AS user_id,
              u.user_status AS user_status,
              uc.password_hash AS password_hash,
              uc.failed_attempts AS failed_attempts,
              uc.locked_until AS locked_until,
              uc.credential_status AS credential_status
       FROM users u
       JOIN user_credentials uc
         ON uc.user_id = u.id AND uc.credential_type = 'PASSWORD'
       WHERE u.username = ?
       LIMIT 1`,
      [username],
    );

    const row = rows[0];
    // 用户不存在 / 无本地密码凭据 → 一律 INVALID_CREDENTIALS（防枚举）。
    // 先消耗一次等价 bcrypt 开销，使"用户不存在"与"用户存在但密码错"时延趋同（常量时间登录）。
    if (!row) {
      burnPasswordCompare(password);
      throw new AuthError('INVALID_CREDENTIALS', 'invalid username or password');
    }

    // 账号状态：必须 ACTIVE。
    if (row.user_status !== 'ACTIVE') {
      burnPasswordCompare(password);
      const code: AuthErrorCode = row.user_status === 'LOCKED' ? 'ACCOUNT_LOCKED' : 'ACCOUNT_INACTIVE';
      throw new AuthError(code, `account is ${row.user_status}`);
    }

    // 凭据状态：必须 ACTIVE。
    if (row.credential_status !== 'ACTIVE') {
      burnPasswordCompare(password);
      throw new AuthError('ACCOUNT_LOCKED', 'credential is disabled');
    }

    // 锁定窗口仍在 → 拒绝。消耗一次等价开销后再抛，避免锁定分支因 short-circuit 暴露时延差。
    if (isLockedUntilActive(row.locked_until)) {
      burnPasswordCompare(password);
      throw new AuthError('ACCOUNT_LOCKED', 'account is temporarily locked');
    }

    // 密码校验。
    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) {
      await this.registerFailure(row.user_id);
      throw new AuthError('INVALID_CREDENTIALS', 'invalid username or password');
    }

    // 成功：清零失败计数 + 解锁 + 刷新 last_login_at。
    await this.registerSuccess(row.user_id);
    return { userId: Number(row.user_id) };
  }

  /**
   * 登录失败：原子自增 failed_attempts，并在同一条 UPDATE 内判定是否越过阈值上临时锁。
   *
   * 为什么必须在 SQL 内自增 + 判锁：若先 SELECT 读快照、再写 snapshot+1，N 个并发失败登录会读到
   * 同一 failed_attempts，各自写回 +1，最终只记 +1 而非 +N，攻击者用并发请求即可让计数长期低于
   * MAX_FAILED_ATTEMPTS、令锁定窗口永不触发（限速失效）。改为 failed_attempts = failed_attempts + 1
   * 让每次失败都被原子计入；locked_until 用 IF(...) 在自增后的值达到阈值时设为 NOW()+LOCK_MINUTES，
   * 否则保持原值（不缩短已有锁窗口）。注意 MySQL 会按列声明顺序求值同一 UPDATE 内的赋值，
   * 故 locked_until 表达式里的 failed_attempts 仍是自增前的旧值，这里用 (failed_attempts + 1) 与
   * SET 的新值保持一致。只动凭据层 locked_until，不动 users.user_status（治理层永久锁语义）。
   */
  private async registerFailure(userId: number): Promise<void> {
    await pool.execute(
      `UPDATE user_credentials
       SET locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), locked_until),
           failed_attempts = failed_attempts + 1
       WHERE user_id = ? AND credential_type = 'PASSWORD'`,
      [MAX_FAILED_ATTEMPTS, LOCK_MINUTES, userId],
    );
  }

  /** 登录成功：清零失败计数、清锁，并更新最近登录时间。 */
  private async registerSuccess(userId: number): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE user_credentials
         SET failed_attempts = 0, locked_until = NULL
         WHERE user_id = ? AND credential_type = 'PASSWORD'`,
        [userId],
      );
      await connection.execute(
        `UPDATE users SET last_login_at = NOW() WHERE id = ?`,
        [userId],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
