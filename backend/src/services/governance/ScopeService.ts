/**
 * ScopeService —— 数据范围（scope）地基服务。
 *
 * 背景（与用户对齐的规则）：
 *   user_role_assignments.scope_unit_id 指向 organization_units(id INT)。组织树层级为
 *   DEPARTMENT > TEAM > GROUP > SHIFT，parent_id 自引用，NULL=根。授权语义：
 *     - scope_unit_id 为 NULL          → 该角色对全组织生效（全局授权）。
 *     - scope_unit_id 非 NULL          → 仅在该单元【子树（含自身）】内生效。
 *     - 持 GOVERNANCE_ADMIN（或任意全局角色）→ 视为全局。
 *   判定规则（仅写操作生效，读不拦）：写资源所属单元 ∈ 可达单元集合 才放行；全局 → 放行。
 *
 * 本服务只提供两件事，不做拦截（拦截在 middleware/requireScope.ts）：
 *   1. getAccessibleScope(userId): 计算某用户的可达组织单元集合（或 isGlobal）。
 *   2. resolveResourceUnit(resourceType, resourceId): 解析某业务资源归属的组织单元 id。
 *
 * 资源归属规则（team_id / unit_id 均指向 organization_units.id）：
 *   - process_template       process_templates.team_id
 *   - process_stage          process_stages.template_id → process_templates.team_id
 *   - stage_operation        stage_operation_schedules.stage_id → process_stages.template_id → process_templates.team_id
 *   - batch_plan             production_batch_plans.template_id → process_templates.team_id
 *   - operation              operations.operation_type_id → operation_types.team_id
 *   - operation_type         operation_types.team_id
 *   - employee               employees.unit_id
 *   - shift_plan             employee_shift_plans.employee_id → employees.unit_id
 *   - personnel_schedule     personnel_schedules.employee_id → employees.unit_id
 *   - standalone_task        standalone_tasks.team_id
 *   解析不到归属（如主数据本就无 team，或资源不存在）→ 返回 null，调用方视为“全局资源”。
 *
 * 注意 personnel_schedules 与 employee_shift_plans 是两张不同的表：
 *   - shift_plan         → employee_shift_plans.id（V4 求解产物排班）
 *   - personnel_schedule → personnel_schedules.id（人工录入/旧排班）
 * 二者都按各自的 employee_id 归到 employees.unit_id，但 PK 来自不同表，不能互换。
 *
 * 「需全局」哨兵（REQUIRE_GLOBAL_SENTINEL = -1）：
 *   resolver 契约是 number|null，null=放行。但少数写端点（跨多团队的求解结果 apply、按月份范围
 *   批量删排班）无单一归属单元，规则要求「保守=仅全局可做」。此时 resolver 返回 -1：因为
 *   accessibleUnitIds 只含真实（正）org_unit id，-1 永不命中 → 非全局用户得 403；而全局用户在
 *   requireScope 第 3 步 isGlobal 已短路放行、根本不会调用 resolver。如此即可在不改 requireScope
 *   逻辑的前提下表达「require global」。
 *
 * 缓存：进程内短 TTL（60s），与 PermissionCacheService 同思路（单进程内存，多实例各自失效，
 * 最坏 60s 内 scope 变更未在某进程生效，对内部 APS 系统可接受）。getAccessibleScope 的结果
 * 按 userId 缓存；resolveResourceUnit 不缓存（资源归属变更频率与解析成本都低，避免脏读）。
 */
import type { RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';

/** 计算出的用户可达范围。 */
export interface AccessibleScope {
  /** true=全局（持全局授权/全局角色），不受单元限制。此时 accessibleUnitIds 为空且应被忽略。 */
  isGlobal: boolean;
  /** 可达组织单元 id 集合（已递归展开子树，含被授权单元自身）。isGlobal=true 时为空。 */
  accessibleUnitIds: Set<number>;
}

/** 支持解析归属的资源类型（与 requireScope resolver 共用）。 */
export type ScopeResourceType =
  | 'process_template'
  | 'process_stage'
  | 'stage_operation'
  | 'batch_plan'
  | 'operation'
  | 'operation_type'
  | 'employee'
  | 'shift_plan'
  | 'personnel_schedule'
  | 'standalone_task';

/**
 * 「需全局」哨兵。resolver 返回此值表示：该写操作无单一归属单元、按规则只允许全局角色执行。
 * 因 accessibleUnitIds 只含真实正整数 org_unit id，-1 对非全局用户必然不命中而被 403；
 * 全局用户在 requireScope 内 isGlobal 已先行短路放行、不会触达 resolver。
 */
export const REQUIRE_GLOBAL_SENTINEL = -1;

/** 视为“全局”的角色 code（持有任一即等同全局授权）。GOVERNANCE_ADMIN 为超管。 */
const GLOBAL_ROLE_CODES = new Set<string>(['GOVERNANCE_ADMIN']);

const SCOPE_TTL_MS = 60_000;

interface ScopeCacheEntry {
  scope: AccessibleScope;
  expireAt: number; // epoch ms
}

export class ScopeService {
  private static scopeCache = new Map<number, ScopeCacheEntry>();

  /**
   * 计算用户的可达范围。
   *
   * 步骤：
   *   1. 查该用户全部【活跃且未过期】的角色授权，取出 (scope_unit_id, role_code)。
   *   2. 若任一授权 scope_unit_id 为 NULL，或持任一全局角色 → {isGlobal:true}。
   *   3. 否则对每个非 NULL 的 scope_unit_id 递归展开子树（含自身），并集为 accessibleUnitIds。
   *      —— 单次查询拉全表 (id,parent_id) 在内存里 BFS 展开，避免对每个根做递归 SQL（组织树体量小）。
   *
   * 注意：JWT 里的 roles 只是 role_code 列表、不带 scope_unit_id，故必须回库才能拿到 scope。
   * 这里以库为准，不读 req.user.roles（令牌可能滞后于授权变更）。
   */
  static async getAccessibleScope(userId: number): Promise<AccessibleScope> {
    const now = Date.now();
    const hit = this.scopeCache.get(userId);
    if (hit && hit.expireAt > now) {
      return hit.scope;
    }

    const scope = await this.computeAccessibleScope(userId);
    this.scopeCache.set(userId, { scope, expireAt: now + SCOPE_TTL_MS });
    return scope;
  }

  private static async computeAccessibleScope(userId: number): Promise<AccessibleScope> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ura.scope_unit_id AS scopeUnitId, r.role_code AS roleCode
         FROM user_role_assignments ura
         JOIN roles r ON r.id = ura.role_id
        WHERE ura.user_id = ?
          AND ura.assignment_status = 'ACTIVE'
          AND (ura.effective_to IS NULL OR ura.effective_to > NOW())
          AND r.role_status = 'ACTIVE'`,
      [userId],
    );

    const seedUnitIds: number[] = [];
    for (const row of rows) {
      const roleCode = row.roleCode as string;
      if (GLOBAL_ROLE_CODES.has(roleCode)) {
        return { isGlobal: true, accessibleUnitIds: new Set() };
      }
      const scopeUnitId = row.scopeUnitId as number | null;
      if (scopeUnitId === null || scopeUnitId === undefined) {
        // 任一授权为全局范围（scope_unit_id=NULL）→ 全局。
        return { isGlobal: true, accessibleUnitIds: new Set() };
      }
      seedUnitIds.push(Number(scopeUnitId));
    }

    if (seedUnitIds.length === 0) {
      // 无任何活跃授权 → 不可达任何单元（写操作将被 requireScope 拒绝；读不拦）。
      return { isGlobal: false, accessibleUnitIds: new Set() };
    }

    const accessibleUnitIds = await this.expandSubtrees(seedUnitIds);
    return { isGlobal: false, accessibleUnitIds };
  }

  /**
   * 把若干种子单元 id 递归展开为“子树（含自身）”的并集。
   * 一次拉全量 (id,parent_id) 建邻接表，再从种子做 BFS。组织树规模小，整表加载成本可忽略。
   */
  private static async expandSubtrees(seedUnitIds: number[]): Promise<Set<number>> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, parent_id AS parentId FROM organization_units`,
    );

    const childrenByParent = new Map<number, number[]>();
    for (const row of rows) {
      const parentId = row.parentId as number | null;
      if (parentId === null || parentId === undefined) continue;
      const pid = Number(parentId);
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid)!.push(Number(row.id));
    }

    const result = new Set<number>();
    const queue: number[] = [...seedUnitIds];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (result.has(current)) continue;
      result.add(current);
      const children = childrenByParent.get(current);
      if (children) {
        for (const child of children) {
          if (!result.has(child)) queue.push(child);
        }
      }
    }
    return result;
  }

  /**
   * 解析业务资源归属的组织单元 id；解析不到归属（无 team / 资源不存在）返回 null（=全局资源）。
   * 参数化查询防注入；resourceType 映射到固定 SQL，绝不拼接表名。
   */
  static async resolveResourceUnit(
    resourceType: ScopeResourceType,
    resourceId: number,
  ): Promise<number | null> {
    if (!Number.isFinite(resourceId)) return null;

    switch (resourceType) {
      case 'process_template':
        return this.queryUnit(
          `SELECT team_id AS unitId FROM process_templates WHERE id = ? LIMIT 1`,
          resourceId,
        );
      case 'process_stage':
        return this.queryUnit(
          `SELECT pt.team_id AS unitId
             FROM process_stages ps
             JOIN process_templates pt ON pt.id = ps.template_id
            WHERE ps.id = ? LIMIT 1`,
          resourceId,
        );
      case 'stage_operation':
        return this.queryUnit(
          `SELECT pt.team_id AS unitId
             FROM stage_operation_schedules sos
             JOIN process_stages ps ON ps.id = sos.stage_id
             JOIN process_templates pt ON pt.id = ps.template_id
            WHERE sos.id = ? LIMIT 1`,
          resourceId,
        );
      case 'batch_plan':
        return this.queryUnit(
          `SELECT pt.team_id AS unitId
             FROM production_batch_plans pbp
             JOIN process_templates pt ON pt.id = pbp.template_id
            WHERE pbp.id = ? LIMIT 1`,
          resourceId,
        );
      case 'operation':
        return this.queryUnit(
          `SELECT ot.team_id AS unitId
             FROM operations o
             JOIN operation_types ot ON ot.id = o.operation_type_id
            WHERE o.id = ? LIMIT 1`,
          resourceId,
        );
      case 'operation_type':
        return this.queryUnit(
          `SELECT team_id AS unitId FROM operation_types WHERE id = ? LIMIT 1`,
          resourceId,
        );
      case 'employee':
        return this.queryUnit(
          `SELECT unit_id AS unitId FROM employees WHERE id = ? LIMIT 1`,
          resourceId,
        );
      case 'shift_plan':
        return this.queryUnit(
          `SELECT e.unit_id AS unitId
             FROM employee_shift_plans esp
             JOIN employees e ON e.id = esp.employee_id
            WHERE esp.id = ? LIMIT 1`,
          resourceId,
        );
      case 'personnel_schedule':
        return this.queryUnit(
          `SELECT e.unit_id AS unitId
             FROM personnel_schedules ps
             JOIN employees e ON e.id = ps.employee_id
            WHERE ps.id = ? LIMIT 1`,
          resourceId,
        );
      case 'standalone_task':
        return this.queryUnit(
          `SELECT team_id AS unitId FROM standalone_tasks WHERE id = ? LIMIT 1`,
          resourceId,
        );
      default:
        return null;
    }
  }

  /**
   * 解析一次求解运行（scheduling_runs.id）关联批次所归属的组织单元。
   * 链路：scheduling_run_batches.run_id → batch_plan_id → production_batch_plans.template_id
   *      → process_templates.team_id。
   *
   * 一个 run 可关联多个批次、可能跨多个团队。保守判定（与「写操作按 scope 限定」一致）：
   *   - 恰好解析出【单一】非空 team → 返回该 team，requireScope 按常规判定。
   *   - 解析不到任何 team（无关联批次 / 批次模板无 team / run 不存在）→ 返回 REQUIRE_GLOBAL_SENTINEL（需全局）。
   *   - 关联到【多个不同】team → 返回 REQUIRE_GLOBAL_SENTINEL（跨团队 apply，需全局）。
   * 全局用户在 requireScope 内 isGlobal 已短路、不会触达此解析。
   */
  static async resolveRunUnit(runId: number): Promise<number | null> {
    if (!Number.isFinite(runId)) return REQUIRE_GLOBAL_SENTINEL;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT pt.team_id AS unitId
         FROM scheduling_run_batches srb
         JOIN production_batch_plans pbp ON pbp.id = srb.batch_plan_id
         JOIN process_templates pt ON pt.id = pbp.template_id
        WHERE srb.run_id = ?
          AND pt.team_id IS NOT NULL`,
      [runId],
    );

    if (rows.length !== 1) {
      // 0 个（无归属）或 >1 个（跨团队）→ 保守要求全局。
      return REQUIRE_GLOBAL_SENTINEL;
    }
    const unitId = rows[0].unitId as number | null;
    return unitId === null || unitId === undefined ? REQUIRE_GLOBAL_SENTINEL : Number(unitId);
  }

  /** 跑一条“取归属单元”的查询，返回单元 id 或 null（无行 / 列为 NULL）。 */
  private static async queryUnit(sql: string, resourceId: number): Promise<number | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(sql, [resourceId]);
    if (rows.length === 0) return null;
    const unitId = rows[0].unitId as number | null;
    return unitId === null || unitId === undefined ? null : Number(unitId);
  }

  /** 主动失效某用户的 scope 缓存（授权/角色范围变更后调用）。 */
  static invalidate(userId: number): void {
    this.scopeCache.delete(userId);
  }

  /** 清空全部 scope 缓存（测试 / 组织树重建时用）。 */
  static clear(): void {
    this.scopeCache.clear();
  }
}

export default ScopeService;
