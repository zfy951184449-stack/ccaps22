/**
 * RbacAdminService —— 治理配置界面用的「角色 / 权限目录 / 组织单元」管理服务。
 *
 * 与 RbacDirectoryService 的分工：
 *   - RbacDirectoryService：运行时「某用户有什么角色/权限」(认证链消费，只读热路径)。
 *   - RbacAdminService：管理面 CRUD —— 列角色、读权限目录、整体设置角色权限、软删角色、读组织树。
 * 这里只写「目录/角色定义」相关的库操作；用户账号与授权见 UserAdminService。
 *
 * 安全不变量（在服务层兜底，控制器再校验一次入参）：
 *   - GOVERNANCE_ADMIN（系统管理员）角色不可删除、不可停用——否则可一键自锁整个治理面。
 *
 * 缓存：角色权限组合变更会影响「持有该角色的所有用户」的有效权限。服务层负责
 *   失效这些用户的 PermissionCacheService（精确按受影响用户失效，避免全量清空）。
 */
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import type { DbExecutor } from '../../config/database';
import { mapRoleRow } from '../../mappers/governance/RbacMapper';
import type { Role, RoleScope } from '../../domain/governance/rbacTypes';
import { PermissionCacheService } from '../auth/PermissionCacheService';

/** 不可删除/停用的受保护角色码（删它=自锁治理面）。 */
export const PROTECTED_ROLE_CODE = 'GOVERNANCE_ADMIN';

const ROLE_SCOPES: RoleScope[] = ['SYSTEM', 'APS', 'ROSTER', 'MASTER_DATA', 'GOVERNANCE', 'INTEGRATION'];
const ROLE_STATUSES = ['ACTIVE', 'INACTIVE', 'RETIRED'] as const;

export type RoleStatus = (typeof ROLE_STATUSES)[number];

export class RbacAdminError extends Error {
  constructor(
    public readonly code:
      | 'ROLE_NOT_FOUND'
      | 'ROLE_CODE_EXISTS'
      | 'ROLE_PROTECTED'
      | 'PERMISSION_UNKNOWN'
      | 'BAD_REQUEST',
    message: string,
  ) {
    super(message);
    this.name = 'RbacAdminError';
  }
}

export interface RoleSummary extends Role {
  description: string | null;
  permissionCount: number;
  userCount: number;
}

export interface RoleDetail extends Role {
  description: string | null;
  permissionCodes: string[];
}

export interface PermissionCatalogAction {
  id: number;
  permissionCode: string;
  permissionName: string;
  actionCode: string;
  status: string;
}

export interface PermissionCatalogResource {
  resourceCode: string;
  label: string;
  actions: PermissionCatalogAction[];
}

export interface PermissionCatalogDomain {
  domain: string;
  label: string;
  resources: PermissionCatalogResource[];
}

export interface OrgUnitNode {
  id: number;
  parentId: number | null;
  unitType: string;
  unitCode: string | null;
  unitName: string;
  isActive: boolean;
  children: OrgUnitNode[];
}

const isValidScope = (value: unknown): value is RoleScope => ROLE_SCOPES.includes(value as RoleScope);
const isValidStatus = (value: unknown): value is RoleStatus => (ROLE_STATUSES as readonly string[]).includes(value as string);

export class RbacAdminService {
  // ---- 权限目录 -------------------------------------------------------------

  /**
   * 完整权限目录，按 域 → 资源 → 动作 三层分组，附 permission_catalog_meta 的中文标签。
   * 只暴露 ACTIVE 权限（停用/退役权限不应在配置界面被勾选）。
   */
  static async getPermissionCatalog(db: DbExecutor = pool): Promise<PermissionCatalogDomain[]> {
    const [permRows] = await db.execute<RowDataPacket[]>(
      `SELECT id, permission_code, permission_name, permission_domain, action_code, resource_code, permission_status
       FROM permissions
       WHERE permission_status = 'ACTIVE'
       ORDER BY permission_domain, resource_code, action_code, permission_code`,
    );
    const [metaRows] = await db.execute<RowDataPacket[]>(
      `SELECT meta_type, domain, resource_code, label_cn, sort_order
       FROM permission_catalog_meta
       ORDER BY meta_type, sort_order`,
    );

    const domainLabels = new Map<string, { label: string; sort: number }>();
    const resourceLabels = new Map<string, { label: string; sort: number }>();
    for (const m of metaRows) {
      if (m.meta_type === 'DOMAIN') {
        domainLabels.set(String(m.domain), { label: String(m.label_cn), sort: Number(m.sort_order) });
      } else if (m.meta_type === 'RESOURCE' && m.resource_code != null) {
        resourceLabels.set(`${m.domain}::${m.resource_code}`, { label: String(m.label_cn), sort: Number(m.sort_order) });
      }
    }

    // 分组（保留 SQL 已排序的稳定顺序，再按 meta sort_order 微调域/资源次序）。
    const domainMap = new Map<string, Map<string, PermissionCatalogResource>>();
    for (const row of permRows) {
      const domain = String(row.permission_domain);
      const resourceCode = String(row.resource_code);
      if (!domainMap.has(domain)) domainMap.set(domain, new Map());
      const resMap = domainMap.get(domain)!;
      if (!resMap.has(resourceCode)) {
        const label = resourceLabels.get(`${domain}::${resourceCode}`)?.label ?? resourceCode;
        resMap.set(resourceCode, { resourceCode, label, actions: [] });
      }
      resMap.get(resourceCode)!.actions.push({
        id: Number(row.id),
        permissionCode: String(row.permission_code),
        permissionName: String(row.permission_name),
        actionCode: String(row.action_code),
        status: String(row.permission_status),
      });
    }

    const domainSort = (d: string): number => domainLabels.get(d)?.sort ?? Number.MAX_SAFE_INTEGER;
    const resourceSort = (domain: string, r: string): number =>
      resourceLabels.get(`${domain}::${r}`)?.sort ?? Number.MAX_SAFE_INTEGER;

    return Array.from(domainMap.entries())
      .sort((a, b) => domainSort(a[0]) - domainSort(b[0]))
      .map(([domain, resMap]) => ({
        domain,
        label: domainLabels.get(domain)?.label ?? domain,
        resources: Array.from(resMap.values()).sort(
          (a, b) => resourceSort(domain, a.resourceCode) - resourceSort(domain, b.resourceCode),
        ),
      }));
  }

  // ---- 角色 -----------------------------------------------------------------

  /** 角色列表，附每角色权限数（ACTIVE grant）与当前活跃用户数。 */
  static async listRoles(db: DbExecutor = pool): Promise<RoleSummary[]> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT r.id, r.role_code, r.role_name, r.role_scope, r.role_status, r.description,
              (SELECT COUNT(*) FROM role_permissions rp
                 WHERE rp.role_id = r.id AND rp.grant_status = 'ACTIVE') AS permission_count,
              (SELECT COUNT(DISTINCT ura.user_id) FROM user_role_assignments ura
                 WHERE ura.role_id = r.id AND ura.assignment_status = 'ACTIVE'
                   AND (ura.effective_to IS NULL OR ura.effective_to > NOW())) AS user_count
       FROM roles r
       ORDER BY r.role_scope, r.role_code`,
    );
    return rows.map((row) => ({
      ...mapRoleRow(row),
      description: row.description == null ? null : String(row.description),
      permissionCount: Number(row.permission_count),
      userCount: Number(row.user_count),
    }));
  }

  /** 单角色详情 + 其 ACTIVE 权限码列表。不存在抛 ROLE_NOT_FOUND。 */
  static async getRole(roleId: number, db: DbExecutor = pool): Promise<RoleDetail> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, role_code, role_name, role_scope, role_status, description FROM roles WHERE id = ? LIMIT 1`,
      [roleId],
    );
    const row = rows[0];
    if (!row) throw new RbacAdminError('ROLE_NOT_FOUND', `role ${roleId} not found`);

    const [permRows] = await db.execute<RowDataPacket[]>(
      `SELECT p.permission_code
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ? AND rp.grant_status = 'ACTIVE'
       ORDER BY p.permission_domain, p.resource_code, p.action_code`,
      [roleId],
    );
    return {
      ...mapRoleRow(row),
      description: row.description == null ? null : String(row.description),
      permissionCodes: permRows.map((r) => String(r.permission_code)),
    };
  }

  /**
   * 新建角色。role_code 必填且唯一（大写规范化）；role_scope 默认 SYSTEM。
   * 唯一冲突映射成 ROLE_CODE_EXISTS（而非 500）。
   */
  static async createRole(input: {
    roleCode: string;
    roleName: string;
    roleScope?: string;
    description?: string | null;
  }): Promise<RoleDetail> {
    const roleCode = String(input.roleCode ?? '').trim().toUpperCase();
    const roleName = String(input.roleName ?? '').trim();
    if (!roleCode || !roleName) {
      throw new RbacAdminError('BAD_REQUEST', 'roleCode and roleName are required');
    }
    const roleScope: RoleScope = isValidScope(input.roleScope) ? input.roleScope : 'SYSTEM';

    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM roles WHERE role_code = ? LIMIT 1`,
      [roleCode],
    );
    if (existing.length > 0) {
      throw new RbacAdminError('ROLE_CODE_EXISTS', `role code ${roleCode} already exists`);
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO roles (role_code, role_name, role_scope, role_status, description)
       VALUES (?, ?, ?, 'ACTIVE', ?)`,
      [roleCode, roleName, roleScope, input.description ?? null],
    );
    return this.getRole(result.insertId);
  }

  /**
   * 更新角色定义（role_name/description/role_scope/role_status）。role_code 不可改（它是稳定锚点）。
   * 受保护角色 GOVERNANCE_ADMIN 不允许被停用/退役（status 改为非 ACTIVE）。
   */
  static async updateRole(
    roleId: number,
    input: { roleName?: string; description?: string | null; roleScope?: string; roleStatus?: string },
  ): Promise<RoleDetail> {
    const current = await this.getRole(roleId);

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.roleName !== undefined) {
      const name = String(input.roleName).trim();
      if (!name) throw new RbacAdminError('BAD_REQUEST', 'roleName cannot be empty');
      sets.push('role_name = ?');
      params.push(name);
    }
    if (input.description !== undefined) {
      sets.push('description = ?');
      params.push(input.description ?? null);
    }
    if (input.roleScope !== undefined) {
      if (!isValidScope(input.roleScope)) throw new RbacAdminError('BAD_REQUEST', `invalid roleScope: ${input.roleScope}`);
      sets.push('role_scope = ?');
      params.push(input.roleScope);
    }
    if (input.roleStatus !== undefined) {
      if (!isValidStatus(input.roleStatus)) throw new RbacAdminError('BAD_REQUEST', `invalid roleStatus: ${input.roleStatus}`);
      if (current.roleCode === PROTECTED_ROLE_CODE && input.roleStatus !== 'ACTIVE') {
        throw new RbacAdminError('ROLE_PROTECTED', `${PROTECTED_ROLE_CODE} cannot be deactivated`);
      }
      sets.push('role_status = ?');
      params.push(input.roleStatus);
    }

    if (sets.length === 0) return current;

    params.push(roleId);
    await pool.execute(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`, params);

    // 停用角色会改变持有者的有效权限 → 失效这些用户的缓存。
    if (input.roleStatus !== undefined && input.roleStatus !== current.roleStatus) {
      await this.invalidateRoleHolders(roleId);
    }
    return this.getRole(roleId);
  }

  /**
   * 整体设置角色的权限码集合：与现有 ACTIVE 授权做 diff，新增的 upsert 为 ACTIVE，移除的置 REVOKED。
   * 未知 permission_code 一律拒绝（防写入幽灵权限）。改完失效持有者缓存。
   */
  static async setRolePermissions(roleId: number, permissionCodes: string[]): Promise<RoleDetail> {
    await this.getRole(roleId); // 存在性校验
    const desired = Array.from(new Set((permissionCodes ?? []).map((c) => String(c).trim()).filter(Boolean)));

    // 解析 code → id，并校验全部已知。
    let permIdByCode = new Map<string, number>();
    if (desired.length > 0) {
      const inList = desired.map(() => '?').join(',');
      const [permRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, permission_code FROM permissions WHERE permission_code IN (${inList})`,
        desired,
      );
      permIdByCode = new Map(permRows.map((r) => [String(r.permission_code), Number(r.id)]));
      const unknown = desired.filter((c) => !permIdByCode.has(c));
      if (unknown.length > 0) {
        throw new RbacAdminError('PERMISSION_UNKNOWN', `unknown permission code(s): ${unknown.join(', ')}`);
      }
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 当前 ACTIVE 授权
      const [currentRows] = await connection.execute<RowDataPacket[]>(
        `SELECT p.permission_code
         FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ? AND rp.grant_status = 'ACTIVE'`,
        [roleId],
      );
      const currentCodes = new Set(currentRows.map((r) => String(r.permission_code)));
      const desiredSet = new Set(desired);

      const toAdd = desired.filter((c) => !currentCodes.has(c));
      const toRemove = Array.from(currentCodes).filter((c) => !desiredSet.has(c));

      // 新增：INSERT ... ON DUPLICATE KEY UPDATE 把历史 REVOKED 行复活成 ACTIVE（唯一键 role_id+permission_id）。
      for (const code of toAdd) {
        const permId = permIdByCode.get(code)!;
        await connection.execute(
          `INSERT INTO role_permissions (role_id, permission_id, grant_status)
           VALUES (?, ?, 'ACTIVE')
           ON DUPLICATE KEY UPDATE grant_status = 'ACTIVE'`,
          [roleId, permId],
        );
      }
      // 移除：置 REVOKED（保留行可审计）。
      if (toRemove.length > 0) {
        const inList = toRemove.map(() => '?').join(',');
        await connection.execute(
          `UPDATE role_permissions rp
           JOIN permissions p ON p.id = rp.permission_id
           SET rp.grant_status = 'REVOKED'
           WHERE rp.role_id = ? AND p.permission_code IN (${inList})`,
          [roleId, ...toRemove],
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await this.invalidateRoleHolders(roleId);
    return this.getRole(roleId);
  }

  /**
   * 软删角色：role_status = RETIRED。受保护角色 GOVERNANCE_ADMIN 拒绝删除。
   * 不物删（保留授权审计 / FK 完整）。删后失效持有者缓存。
   */
  static async retireRole(roleId: number): Promise<void> {
    const current = await this.getRole(roleId);
    if (current.roleCode === PROTECTED_ROLE_CODE) {
      throw new RbacAdminError('ROLE_PROTECTED', `${PROTECTED_ROLE_CODE} cannot be deleted`);
    }
    await pool.execute(`UPDATE roles SET role_status = 'RETIRED' WHERE id = ?`, [roleId]);
    await this.invalidateRoleHolders(roleId);
  }

  /** 失效所有当前活跃持有该角色的用户的权限缓存（角色/权限变更后调用）。 */
  private static async invalidateRoleHolders(roleId: number): Promise<void> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT user_id FROM user_role_assignments
       WHERE role_id = ? AND assignment_status = 'ACTIVE'`,
      [roleId],
    );
    for (const r of rows) {
      PermissionCacheService.invalidate(Number(r.user_id));
    }
  }

  // ---- 组织单元 -------------------------------------------------------------

  /** 组织单元树（供授权 scope 选择）。仅返回启用单元，按 sort_order 组装父子。 */
  static async getOrgUnitTree(db: DbExecutor = pool): Promise<OrgUnitNode[]> {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, parent_id, unit_type, unit_code, unit_name, is_active
       FROM organization_units
       WHERE is_active = 1
       ORDER BY COALESCE(parent_id, 0), sort_order, id`,
    );

    const nodes = new Map<number, OrgUnitNode>();
    for (const row of rows) {
      nodes.set(Number(row.id), {
        id: Number(row.id),
        parentId: row.parent_id == null ? null : Number(row.parent_id),
        unitType: String(row.unit_type),
        unitCode: row.unit_code == null ? null : String(row.unit_code),
        unitName: String(row.unit_name),
        isActive: row.is_active === 1 || row.is_active === true,
        children: [],
      });
    }

    const roots: OrgUnitNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId != null && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
}

export default RbacAdminService;
