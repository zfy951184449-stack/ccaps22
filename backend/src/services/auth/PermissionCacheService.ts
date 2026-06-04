/**
 * PermissionCacheService —— 进程内权限缓存（短 TTL）。
 *
 * 动机：requirePermission 中间件会在每个受保护请求上做一次"用户是否有某权限"判定。
 * 直接每次打 RBAC 的多表 JOIN 太重；这里用 60s TTL 的进程内 Map 兜一层热缓存，
 * 缓存命中只看内存，未命中才回源 RbacDirectoryService.getUserPermissions()。
 *
 * 契约：
 *   has(userId, code): Promise<boolean>   —— miss 时回源整套权限并回填
 *   invalidate(userId)                    —— 角色/权限变更后主动失效（治理接口在下一阶段调用）
 *
 * 边界与权衡（有意为之）：
 *   - 单进程内存缓存：多实例部署下各进程独立失效，最坏 60s 内权限变更未在某进程生效；
 *     对内部 APS 系统可接受。若将来多实例，再换成共享缓存或缩短 TTL。
 *   - 缓存整张权限集（Set<code>）而非单条命中，避免对同一用户的不同 code 反复回源。
 */
import { RbacDirectoryService } from '../governance/RbacDirectoryService';

interface CacheEntry {
  perms: Set<string>;
  expireAt: number; // epoch ms
}

const TTL_MS = 60_000;

export class PermissionCacheService {
  private static cache = new Map<number, CacheEntry>();

  /** 当前用户的权限码集合（命中走内存，未命中回源 + 回填）。 */
  private static async getPerms(userId: number): Promise<Set<string>> {
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && hit.expireAt > now) {
      return hit.perms;
    }
    const permissions = await RbacDirectoryService.getUserPermissions(userId);
    const perms = new Set(permissions.map((p) => p.permissionCode));
    this.cache.set(userId, { perms, expireAt: now + TTL_MS });
    return perms;
  }

  /** 用户是否拥有指定权限码。 */
  static async has(userId: number, permissionCode: string): Promise<boolean> {
    const perms = await this.getPerms(userId);
    return perms.has(permissionCode);
  }

  /** 主动失效某用户缓存（授权变更后调用）。 */
  static invalidate(userId: number): void {
    this.cache.delete(userId);
  }

  /** 清空全部缓存（测试 / 全局权限重置时用）。 */
  static clear(): void {
    this.cache.clear();
  }
}
