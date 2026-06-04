/**
 * Auth/RBAC 迁移与种子（幂等，脚本即权威）。
 *
 * 权限目录由多 agent 工作流设计 + 对抗性覆盖率审查定稿（63 条 / 6 域 / 25 资源，WRITE/SENSITIVE 端点 100% 覆盖）。
 * 本脚本只新增对象，不改动任何已有业务表：
 *   1. 建 user_credentials（本地密码凭据，与 users 解耦）
 *   2. 建 permission_catalog_meta（域/资源中文标签，供配置界面分组展示）
 *   3. upsert 权限目录（63 条权威），reconcile 删除目录外的幽灵权限
 *   4. 种子 2 个示例角色（系统管理员=全权 / 只读访客=全部READ），reconcile 删除其余示例角色
 *      —— 角色后续由管理员在配置界面自定义；这里仅留最小引导
 *   5. 种子超管 admin + GOVERNANCE_ADMIN + 本地密码（默认 admin/admin，must_change_password=1）
 *
 * 运行：cd backend && npm run migrate:auth        （显式改密：SEED_ADMIN_PASSWORD=xxx npm run migrate:auth）
 * 回滚：DROP TABLE user_credentials, permission_catalog_meta;（权限/角色/映射为新增种子，可按 code 删除）
 */
import pool from '../../backend/src/config/database';
import { tableExists, columnExists, indexExists, foreignKeyExists } from '../phase0a/preflight_schema_check';
import * as bcrypt from 'bcryptjs';

const USER_CREDENTIALS_DDL = `
  CREATE TABLE user_credentials (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    credential_type ENUM('PASSWORD') NOT NULL DEFAULT 'PASSWORD',
    password_hash VARCHAR(255) NOT NULL,
    password_algo VARCHAR(20) NOT NULL DEFAULT 'BCRYPT',
    must_change_password TINYINT(1) NOT NULL DEFAULT 1,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    password_updated_at DATETIME NULL,
    credential_status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_credential (user_id, credential_type),
    KEY idx_user_credentials_user (user_id),
    CONSTRAINT fk_user_credentials_user FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

const CATALOG_META_DDL = `
  CREATE TABLE permission_catalog_meta (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    meta_type ENUM('DOMAIN','RESOURCE') NOT NULL,
    domain VARCHAR(50) NOT NULL,
    resource_code VARCHAR(120) NULL,
    label_cn VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_catalog_meta (meta_type, domain)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// [code, name_cn, domain, action, resource] —— 权威权限目录（工作流定稿，63 条）
type Perm = [string, string, string, string, string];
const PERMISSIONS: Perm[] = [
  ['MASTER_EMPLOYEE_READ', '查看员工档案', 'MASTER_DATA', 'READ', 'EMPLOYEE'],
  ['MASTER_EMPLOYEE_WRITE', '维护员工档案', 'MASTER_DATA', 'WRITE', 'EMPLOYEE'],
  ['MASTER_ORG_READ', '查看组织架构', 'MASTER_DATA', 'READ', 'ORGANIZATION'],
  ['MASTER_ORG_WRITE', '维护组织架构', 'MASTER_DATA', 'WRITE', 'ORGANIZATION'],
  ['MASTER_QUALIFICATION_READ', '查看资质', 'MASTER_DATA', 'READ', 'QUALIFICATION'],
  ['MASTER_QUALIFICATION_WRITE', '维护资质', 'MASTER_DATA', 'WRITE', 'QUALIFICATION'],
  ['MASTER_OPERATION_READ', '查看操作主数据', 'MASTER_DATA', 'READ', 'OPERATION'],
  ['MASTER_OPERATION_WRITE', '维护操作主数据', 'MASTER_DATA', 'WRITE', 'OPERATION'],
  ['MASTER_SHIFT_DEF_READ', '查看班次定义', 'MASTER_DATA', 'READ', 'SHIFT_DEFINITION'],
  ['MASTER_SHIFT_DEF_WRITE', '维护班次定义', 'MASTER_DATA', 'WRITE', 'SHIFT_DEFINITION'],
  ['MASTER_RESOURCE_READ', '查看资源/设备', 'MASTER_DATA', 'READ', 'RESOURCE'],
  ['MASTER_RESOURCE_WRITE', '维护资源/设备', 'MASTER_DATA', 'WRITE', 'RESOURCE'],
  ['MASTER_RESOURCE_OPERATE', '资源树重建/清空', 'MASTER_DATA', 'OPERATE', 'RESOURCE'],
  ['MASTER_RECIPE_READ', '查看配方版本/主数据同步状态', 'MASTER_DATA', 'READ', 'RECIPE_VERSION'],
  ['MASTER_RECIPE_SYNC', '主数据同步(遗留主数据→V3落库)', 'MASTER_DATA', 'OPERATE', 'RECIPE_VERSION'],
  ['APS_TEMPLATE_READ', '查看工艺模板', 'APS', 'READ', 'PROCESS_TEMPLATE'],
  ['APS_TEMPLATE_WRITE', '维护工艺模板(模板/阶段/操作/资源绑定)', 'APS', 'WRITE', 'PROCESS_TEMPLATE'],
  ['APS_TEMPLATE_IMPORT', '工艺模板批量导入(工作簿落库)', 'APS', 'OPERATE', 'PROCESS_TEMPLATE'],
  ['APS_TEMPLATE_AUTOSCHEDULE', '工艺模板自动排程(整模板时序重排)', 'APS', 'OPERATE', 'PROCESS_TEMPLATE'],
  ['APS_MFG_PACKAGE_READ', '查看生产模板包', 'APS', 'READ', 'MFG_TEMPLATE_PACKAGE'],
  ['APS_MFG_PACKAGE_WRITE', '维护生产模板包', 'APS', 'WRITE', 'MFG_TEMPLATE_PACKAGE'],
  ['APS_BATCH_READ', '查看批次计划(含批次工作台/操作资源)', 'APS', 'READ', 'BATCH_PLAN'],
  ['APS_BATCH_WRITE', '维护批次计划(增删改/从包创建/批次操作资源)', 'APS', 'WRITE', 'BATCH_PLAN'],
  ['APS_BATCH_ACTIVATE', '批次计划激活/停用', 'APS', 'OPERATE', 'BATCH_PLAN'],
  ['APS_CONSTRAINT_READ', '查看排产约束与共享组', 'APS', 'READ', 'SCHEDULING_CONSTRAINT'],
  ['APS_CONSTRAINT_WRITE', '维护排产约束与共享组(模板级+批次级)', 'APS', 'WRITE', 'SCHEDULING_CONSTRAINT'],
  ['APS_GANTT_READ', '查看批次甘特图(V4/V5)', 'APS', 'READ', 'BATCH_GANTT'],
  ['APS_GANTT_WRITE', '编辑甘特操作(改期/删除)', 'APS', 'WRITE', 'BATCH_GANTT'],
  ['APS_CALENDAR_READ', '查看生产日历与操作/人员', 'APS', 'READ', 'PRODUCTION_CALENDAR'],
  ['APS_CALENDAR_WRITE', '编辑日历操作排期/分配人员', 'APS', 'WRITE', 'PRODUCTION_CALENDAR'],
  ['APS_CALENDAR_OPERATE', '日历高敏操作(锁定/批量自动分配/激活停用)', 'APS', 'OPERATE', 'PRODUCTION_CALENDAR'],
  ['APS_CALENDAR_HOLIDAY_OPERATE', '日历节假日数据维护(导入/预加载/缓存清理)', 'APS', 'OPERATE', 'PRODUCTION_CALENDAR'],
  ['ROSTER_SCHEDULE_READ', '查看人员排班', 'ROSTER', 'READ', 'PERSONNEL_SCHEDULE'],
  ['ROSTER_SCHEDULE_WRITE', '编辑人员排班', 'ROSTER', 'WRITE', 'PERSONNEL_SCHEDULE'],
  ['ROSTER_SCHEDULE_OPERATE', '排班高敏操作(按月清空/班次锁定解锁)', 'ROSTER', 'OPERATE', 'PERSONNEL_SCHEDULE'],
  ['ROSTER_UNAVAILABILITY_READ', '查看不可用登记', 'ROSTER', 'READ', 'UNAVAILABILITY'],
  ['ROSTER_UNAVAILABILITY_WRITE', '维护不可用登记', 'ROSTER', 'WRITE', 'UNAVAILABILITY'],
  ['ROSTER_TASK_READ', '查看独立任务', 'ROSTER', 'READ', 'STANDALONE_TASK'],
  ['ROSTER_TASK_WRITE', '维护独立任务', 'ROSTER', 'WRITE', 'STANDALONE_TASK'],
  ['ROSTER_TASK_COMPLETE', '标记任务完成(状态推进)', 'ROSTER', 'OPERATE', 'STANDALONE_TASK'],
  ['ROSTER_TASK_GENERATE', '批量生成周期任务', 'ROSTER', 'OPERATE', 'STANDALONE_TASK'],
  ['ROSTER_TASK_PURGE', '独立任务批量删除/清空模板实例', 'ROSTER', 'OPERATE', 'STANDALONE_TASK'],
  ['ROSTER_EXCEPTION_PREVIEW', '预览排班异常修复方案', 'ROSTER', 'READ', 'ROSTER_EXCEPTION'],
  ['ROSTER_EXCEPTION_APPLY', '应用排班修复方案落库', 'ROSTER', 'OPERATE', 'ROSTER_EXCEPTION'],
  ['ROSTER_COCKPIT_READ', '查看排班领导驾驶舱', 'ROSTER', 'READ', 'ROSTER_COCKPIT'],
  ['SOLVER_RUN_READ', '查看求解任务(历史/进度/状态/结果/预检/预览)', 'INTEGRATION', 'READ', 'SOLVER_RUN'],
  ['SOLVER_RUN_EXECUTE', '触发求解(发起求解任务)', 'INTEGRATION', 'OPERATE', 'SOLVER_RUN'],
  ['SOLVER_RUN_ABORT', '中止求解任务', 'INTEGRATION', 'OPERATE', 'SOLVER_RUN'],
  ['SOLVER_RESULT_APPLY', '应用求解结果落库(写入生产排班表)', 'INTEGRATION', 'OPERATE', 'SOLVER_RESULT'],
  ['SYSTEM_SETTING_READ', '查看系统设置', 'SYSTEM', 'READ', 'SYSTEM_SETTING'],
  ['SYSTEM_SETTING_WRITE', '维护系统设置(排班参数/节假日密钥)', 'SYSTEM', 'WRITE', 'SYSTEM_SETTING'],
  ['SYSTEM_HOLIDAY_OPERATE', '触发节假日数据导入', 'SYSTEM', 'OPERATE', 'SYSTEM_SETTING'],
  ['SYSTEM_DB_READ', '查看数据库连接配置', 'SYSTEM', 'READ', 'SYSTEM_DATABASE'],
  ['SYSTEM_DB_SWITCH', '切换数据库环境(改运行时连接并重启)', 'SYSTEM', 'OPERATE', 'SYSTEM_DATABASE'],
  ['SYSTEM_DB_SYNC', '执行库间数据同步(跨库覆写,极高危)', 'SYSTEM', 'OPERATE', 'SYSTEM_DATABASE'],
  ['SYSTEM_DASHBOARD_READ', '查看调度仪表盘', 'SYSTEM', 'READ', 'DASHBOARD'],
  ['GOVERNANCE_USER_READ', '查看用户账号', 'GOVERNANCE', 'READ', 'USER_ACCOUNT'],
  ['GOVERNANCE_USER_WRITE', '维护用户账号(增删改/绑定员工)', 'GOVERNANCE', 'WRITE', 'USER_ACCOUNT'],
  ['GOVERNANCE_USER_OPERATE', '账号启停/锁定解锁/重置MFA凭证(高敏)', 'GOVERNANCE', 'OPERATE', 'USER_ACCOUNT'],
  ['GOVERNANCE_ROLE_READ', '查看角色与权限目录', 'GOVERNANCE', 'READ', 'ROLE_ASSIGNMENT'],
  ['GOVERNANCE_ROLE_WRITE', '维护角色定义与角色-权限组合', 'GOVERNANCE', 'WRITE', 'ROLE_ASSIGNMENT'],
  ['GOVERNANCE_ROLE_GRANT', '授予/收回用户角色(提权审批)', 'GOVERNANCE', 'APPROVE', 'ROLE_ASSIGNMENT'],
  ['GOVERNANCE_ROLE_OPERATE', '启用/停用角色(高敏)', 'GOVERNANCE', 'OPERATE', 'ROLE_ASSIGNMENT'],
];

// [domain, name_cn]
const DOMAIN_LABELS: [string, string][] = [
  ['MASTER_DATA', '主数据'],
  ['APS', '排产计划'],
  ['ROSTER', '排班'],
  ['INTEGRATION', '求解集成'],
  ['SYSTEM', '系统'],
  ['GOVERNANCE', '治理（用户与权限）'],
];

// [domain, resource_code, name_cn]
const RESOURCE_LABELS: [string, string, string][] = [
  ['MASTER_DATA', 'EMPLOYEE', '员工档案'],
  ['MASTER_DATA', 'ORGANIZATION', '组织架构（部门/班组/角色/任职/不可用）'],
  ['MASTER_DATA', 'QUALIFICATION', '资质（资质目录/员工资质/资质矩阵）'],
  ['MASTER_DATA', 'OPERATION', '操作主数据（操作/操作类型/操作资质要求）'],
  ['MASTER_DATA', 'SHIFT_DEFINITION', '班次定义'],
  ['MASTER_DATA', 'RESOURCE', '资源/设备（资源树/资源/维保窗口）'],
  ['MASTER_DATA', 'RECIPE_VERSION', '配方版本/主数据同步(V3生物工艺)'],
  ['APS', 'PROCESS_TEMPLATE', '工艺模板'],
  ['APS', 'MFG_TEMPLATE_PACKAGE', '生产模板包(投产锚点包)'],
  ['APS', 'BATCH_PLAN', '批次计划'],
  ['APS', 'SCHEDULING_CONSTRAINT', '排产约束(时序/共享组)'],
  ['APS', 'BATCH_GANTT', '批次甘特图'],
  ['APS', 'PRODUCTION_CALENDAR', '生产日历(排产日历视图与人员排班)'],
  ['ROSTER', 'PERSONNEL_SCHEDULE', '人员排班计划'],
  ['ROSTER', 'UNAVAILABILITY', '员工不可用/请假登记'],
  ['ROSTER', 'STANDALONE_TASK', '独立任务'],
  ['ROSTER', 'ROSTER_EXCEPTION', '排班异常修复'],
  ['ROSTER', 'ROSTER_COCKPIT', '排班领导驾驶舱'],
  ['INTEGRATION', 'SOLVER_RUN', '求解任务(求解运行)'],
  ['INTEGRATION', 'SOLVER_RESULT', '求解结果应用'],
  ['SYSTEM', 'SYSTEM_SETTING', '系统设置（排班参数/节假日服务）'],
  ['SYSTEM', 'SYSTEM_DATABASE', '系统数据库（环境配置/数据同步）'],
  ['SYSTEM', 'DASHBOARD', '调度中心仪表盘'],
  ['GOVERNANCE', 'USER_ACCOUNT', '用户账号'],
  ['GOVERNANCE', 'ROLE_ASSIGNMENT', '角色与授权'],
];

// 仅保留 2 个示例角色（其余由管理员在配置界面自定义）。reconcile 会删除不在此列表的角色。
const SEED_ROLES: [string, string, string][] = [
  ['GOVERNANCE_ADMIN', '系统管理员', 'GOVERNANCE'],
  ['READONLY_VIEWER', '只读访客', 'SYSTEM'],
];
const KEEP_ROLE_CODES = SEED_ROLES.map((r) => r[0]);
type Grant = 'ALL' | 'ALL_READ';
const ROLE_GRANTS: Record<string, Grant> = {
  GOVERNANCE_ADMIN: 'ALL',
  READONLY_VIEWER: 'ALL_READ',
};

async function ensureTable(name: string, ddl: string): Promise<void> {
  if (await tableExists(name)) {
    console.log(`[auth] skip create-table:${name} (exists)`);
    return;
  }
  console.log(`[auth] execute create-table:${name}`);
  await pool.query(ddl);
}

// 给 user_role_assignments 增加"角色生效范围"：scope_unit_id 指向 organization_units(id)。
// NULL = 全局范围（该角色对全组织生效）；非 NULL = 仅在该组织单元（部门/班组/组/班）子树内生效。
// 数据驱动 RBAC 的 scope 维度由此落库，授权判定的 scope 收敛在后续阶段实现。
// 全程幂等：列/索引/外键各自用 *Exists 守卫，复跑安全。
async function ensureRoleAssignmentScope(): Promise<void> {
  const TABLE = 'user_role_assignments';
  const COLUMN = 'scope_unit_id';
  const INDEX = 'idx_ura_scope_unit';
  const FK = 'fk_ura_scope_unit';

  if (await columnExists(TABLE, COLUMN)) {
    console.log(`[auth] skip add-column:${TABLE}.${COLUMN} (exists)`);
  } else {
    console.log(`[auth] execute add-column:${TABLE}.${COLUMN}`);
    await pool.query(
      `ALTER TABLE ${TABLE} ADD COLUMN ${COLUMN} INT NULL COMMENT '角色生效的组织单元(NULL=全局范围)'`,
    );
  }

  if (await indexExists(TABLE, INDEX)) {
    console.log(`[auth] skip add-index:${TABLE}.${INDEX} (exists)`);
  } else {
    console.log(`[auth] execute add-index:${TABLE}.${INDEX}`);
    await pool.query(`ALTER TABLE ${TABLE} ADD INDEX ${INDEX} (${COLUMN})`);
  }

  if (await foreignKeyExists(TABLE, FK)) {
    console.log(`[auth] skip add-fk:${TABLE}.${FK} (exists)`);
  } else {
    console.log(`[auth] execute add-fk:${TABLE}.${FK}`);
    await pool.query(
      `ALTER TABLE ${TABLE}
       ADD CONSTRAINT ${FK} FOREIGN KEY (${COLUMN}) REFERENCES organization_units(id)
       ON DELETE SET NULL ON UPDATE CASCADE`,
    );
  }
}

// 给 user_role_assignments 增加 revoked_by（撤销人）列，与 assigned_by（授予人）分离。
// 根因：revokeUserRole 此前把撤销人写进 assigned_by（COALESCE 覆盖），破坏“谁授予”的审计。
// 改为撤销时写 revoked_by、保留 assigned_by 原值。列用 *Exists 守卫，复跑安全。
async function ensureRevokedByColumn(): Promise<void> {
  const TABLE = 'user_role_assignments';
  const COLUMN = 'revoked_by';
  const FK = 'fk_ura_revoked_by';

  if (await columnExists(TABLE, COLUMN)) {
    console.log(`[auth] skip add-column:${TABLE}.${COLUMN} (exists)`);
  } else {
    console.log(`[auth] execute add-column:${TABLE}.${COLUMN}`);
    await pool.query(
      `ALTER TABLE ${TABLE} ADD COLUMN ${COLUMN} BIGINT NULL COMMENT '撤销该授权的用户(NULL=未撤销/历史数据)'`,
    );
  }

  if (await foreignKeyExists(TABLE, FK)) {
    console.log(`[auth] skip add-fk:${TABLE}.${FK} (exists)`);
  } else {
    console.log(`[auth] execute add-fk:${TABLE}.${FK}`);
    await pool.query(
      `ALTER TABLE ${TABLE}
       ADD CONSTRAINT ${FK} FOREIGN KEY (${COLUMN}) REFERENCES users(id)`,
    );
  }
}

// 去重 + 给 user_role_assignments 加"单一活跃分配"硬约束。
// 根因：旧的 INSERT IGNORE 依赖的唯一键 uk_user_role_effective_from 含 effective_from（默认 NOW()），
// 每次迁移时间戳不同 → (user_id, role_id) 反复插入活跃行（超管 admin 已累积多条 GOVERNANCE_ADMIN）。
// 真正需要的是"每 (user_id, role_id) 至多一条 ACTIVE"的约束，而该约束此前并不存在。
// 修复分两步，全程幂等：
//   1) 同组活跃行只保留最小 id，其余置 REVOKED 并关闭 effective_to —— 可审计，且与服务层
//      (assignment_status='ACTIVE' AND effective_to 窗口) 的读取语义一致；复跑命中 0 行。
//   2) 加虚拟生成列 active_assignment_guard（仅 ACTIVE=1，否则 NULL）+ 唯一键 uk_ura_active
//      (user_id, role_id, active_assignment_guard)。InnoDB 唯一索引中 NULL 互不相等，
//      故历史 REVOKED/EXPIRED 行（guard=NULL）不冲突，仅活跃行被强制唯一；INSERT IGNORE 自此真正生效。
// 列/索引各用 *Exists 守卫；去重 UPDATE 天然幂等（与 reconcile* 同风格，无需额外守卫）。
async function ensureSingleActiveRoleAssignment(): Promise<void> {
  const TABLE = 'user_role_assignments';
  const GUARD_COLUMN = 'active_assignment_guard';
  const UNIQUE_KEY = 'uk_ura_active';

  // 1) 去重历史活跃重复行。必须先于建唯一索引，否则 ALTER ADD UNIQUE 会因重复冲突失败。
  //    derived table 带 GROUP BY 会被物化，不触发 MySQL 1093（不能边更新边自查）。
  const [dedup] = await pool.query<any>(
    `UPDATE ${TABLE} ura
     JOIN (
       SELECT user_id, role_id, MIN(id) AS keep_id
       FROM ${TABLE}
       WHERE assignment_status = 'ACTIVE'
       GROUP BY user_id, role_id
     ) keep ON keep.user_id = ura.user_id AND keep.role_id = ura.role_id
     SET ura.assignment_status = 'REVOKED',
         ura.effective_to = COALESCE(ura.effective_to, NOW()),
         ura.reason_text = COALESCE(ura.reason_text, '自动去重：同一(user_id,role_id)重复活跃分配')
     WHERE ura.assignment_status = 'ACTIVE' AND ura.id > keep.keep_id`,
  );
  console.log(`[auth] deduped duplicate active role assignments: revoked ${dedup.affectedRows} row(s)`);

  // 2a) 虚拟生成列：仅当 ACTIVE 时为 1，否则 NULL
  if (await columnExists(TABLE, GUARD_COLUMN)) {
    console.log(`[auth] skip add-column:${TABLE}.${GUARD_COLUMN} (exists)`);
  } else {
    console.log(`[auth] execute add-column:${TABLE}.${GUARD_COLUMN}`);
    await pool.query(
      `ALTER TABLE ${TABLE}
       ADD COLUMN ${GUARD_COLUMN} TINYINT
       GENERATED ALWAYS AS (CASE WHEN assignment_status = 'ACTIVE' THEN 1 ELSE NULL END) VIRTUAL
       COMMENT '仅当assignment_status=ACTIVE时为1否则NULL；配合 uk_ura_active 强制每(user_id,role_id)至多一条活跃分配'`,
    );
  }

  // 2b) 部分唯一索引：NULL 不参与唯一比较 → 历史非活跃行不冲突，仅活跃行唯一
  if (await indexExists(TABLE, UNIQUE_KEY)) {
    console.log(`[auth] skip add-unique:${TABLE}.${UNIQUE_KEY} (exists)`);
  } else {
    console.log(`[auth] execute add-unique:${TABLE}.${UNIQUE_KEY}`);
    await pool.query(
      `ALTER TABLE ${TABLE} ADD UNIQUE KEY ${UNIQUE_KEY} (user_id, role_id, ${GUARD_COLUMN})`,
    );
  }
}

async function seedPermissions(): Promise<void> {
  const placeholders = PERMISSIONS.map(() => '(?,?,?,?,?)').join(',');
  const params: string[] = [];
  for (const [code, name, domain, action, resource] of PERMISSIONS) params.push(code, name, domain, action, resource);
  await pool.query(
    `INSERT INTO permissions (permission_code, permission_name, permission_domain, action_code, resource_code)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       permission_name = VALUES(permission_name),
       permission_domain = VALUES(permission_domain),
       action_code = VALUES(action_code),
       resource_code = VALUES(resource_code)`,
    params,
  );
  console.log(`[auth] upserted ${PERMISSIONS.length} permissions`);
}

async function reconcilePermissions(): Promise<void> {
  const codes = PERMISSIONS.map((p) => p[0]);
  const inList = codes.map(() => '?').join(',');
  // 先删目录外权限的 role_permissions 引用，再删权限本身（清除幽灵权限）
  const [delRp] = await pool.query<any>(
    `DELETE rp FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
     WHERE p.permission_code NOT IN (${inList})`,
    codes,
  );
  const [delP] = await pool.query<any>(
    `DELETE FROM permissions WHERE permission_code NOT IN (${inList})`,
    codes,
  );
  console.log(`[auth] reconciled permissions: removed ${delP.affectedRows} ghost perms (${delRp.affectedRows} role-perm refs)`);
}

async function seedRoles(): Promise<void> {
  const placeholders = SEED_ROLES.map(() => '(?,?,?)').join(',');
  const params: string[] = [];
  for (const [code, name, scope] of SEED_ROLES) params.push(code, name, scope);
  await pool.query(
    `INSERT INTO roles (role_code, role_name, role_scope) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE role_name = VALUES(role_name), role_scope = VALUES(role_scope)`,
    params,
  );
  console.log(`[auth] upserted ${SEED_ROLES.length} seed roles`);
}

async function reconcileRoles(): Promise<void> {
  const inList = KEEP_ROLE_CODES.map(() => '?').join(',');
  await pool.query(
    `DELETE ura FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id
     WHERE r.role_code NOT IN (${inList})`,
    KEEP_ROLE_CODES,
  );
  await pool.query(
    `DELETE rp FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
     WHERE r.role_code NOT IN (${inList})`,
    KEEP_ROLE_CODES,
  );
  const [delR] = await pool.query<any>(`DELETE FROM roles WHERE role_code NOT IN (${inList})`, KEEP_ROLE_CODES);
  console.log(`[auth] reconciled roles: removed ${delR.affectedRows} non-seed roles`);
}

async function seedRolePermissions(): Promise<void> {
  for (const [roleCode, grant] of Object.entries(ROLE_GRANTS)) {
    if (grant === 'ALL') {
      await pool.query(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r JOIN permissions p
         WHERE r.role_code = ? AND p.permission_status = 'ACTIVE'`,
        [roleCode],
      );
    } else {
      await pool.query(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r JOIN permissions p
         WHERE r.role_code = ? AND p.action_code = 'READ' AND p.permission_status = 'ACTIVE'`,
        [roleCode],
      );
    }
    console.log(`[auth] mapped role_permissions: ${roleCode} (${grant})`);
  }
}

async function seedCatalogMeta(): Promise<void> {
  await pool.query(`DELETE FROM permission_catalog_meta`); // 纯元数据，全量刷新保证幂等
  const domParams: any[] = [];
  const domPh = DOMAIN_LABELS.map((d, i) => { domParams.push('DOMAIN', d[0], null, d[1], i); return '(?,?,?,?,?)'; }).join(',');
  await pool.query(
    `INSERT INTO permission_catalog_meta (meta_type, domain, resource_code, label_cn, sort_order) VALUES ${domPh}`,
    domParams,
  );
  const resParams: any[] = [];
  const resPh = RESOURCE_LABELS.map((r, i) => { resParams.push('RESOURCE', r[0], r[1], r[2], i); return '(?,?,?,?,?)'; }).join(',');
  await pool.query(
    `INSERT INTO permission_catalog_meta (meta_type, domain, resource_code, label_cn, sort_order) VALUES ${resPh}`,
    resParams,
  );
  console.log(`[auth] seeded catalog meta: ${DOMAIN_LABELS.length} domains + ${RESOURCE_LABELS.length} resources`);
}

async function ensureAdminUser(): Promise<{ username: string; password: string }> {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const explicitPwd = process.env.SEED_ADMIN_PASSWORD;
  const password = explicitPwd || 'admin';

  await pool.query(
    `INSERT IGNORE INTO users (username, display_name, auth_provider, user_status)
     VALUES (?, ?, 'LOCAL', 'ACTIVE')`,
    [username, '系统管理员'],
  );
  const [userRows] = await pool.query<any[]>(`SELECT id FROM users WHERE username = ? LIMIT 1`, [username]);
  const userId = userRows[0].id as number;

  await pool.query(
    `INSERT IGNORE INTO user_role_assignments (user_id, role_id)
     SELECT ?, id FROM roles WHERE role_code = 'GOVERNANCE_ADMIN'`,
    [userId],
  );

  const [credRows] = await pool.query<any[]>(
    `SELECT id FROM user_credentials WHERE user_id = ? AND credential_type = 'PASSWORD' LIMIT 1`,
    [userId],
  );
  const hash = bcrypt.hashSync(password, 10);
  if (credRows.length === 0) {
    await pool.query(
      `INSERT INTO user_credentials (user_id, password_hash, must_change_password, password_updated_at)
       VALUES (?, ?, 1, NOW())`,
      [userId, hash],
    );
    console.log(`[auth] created admin credential (user_id=${userId})`);
    return { username, password };
  }
  if (explicitPwd) {
    await pool.query(
      `UPDATE user_credentials SET password_hash = ?, must_change_password = 1, password_updated_at = NOW()
       WHERE user_id = ? AND credential_type = 'PASSWORD'`,
      [hash, userId],
    );
    console.log(`[auth] reset admin credential (user_id=${userId})`);
    return { username, password };
  }
  console.log(`[auth] admin credential exists (user_id=${userId}) — left unchanged`);
  return { username, password: '(unchanged)' };
}

async function summary(): Promise<void> {
  const q = async (sql: string) => { const [rows] = await pool.query<any[]>(sql); return rows[0]?.c ?? 0; };
  console.log('--- summary ---');
  console.log(`permissions:          ${await q('SELECT COUNT(*) c FROM permissions')}`);
  console.log(`catalog_meta:         ${await q('SELECT COUNT(*) c FROM permission_catalog_meta')}`);
  console.log(`roles:                ${await q('SELECT COUNT(*) c FROM roles')}`);
  console.log(`role_permissions:     ${await q('SELECT COUNT(*) c FROM role_permissions')}`);
  console.log(`users:                ${await q('SELECT COUNT(*) c FROM users')}`);
  console.log(`user_credentials:     ${await q('SELECT COUNT(*) c FROM user_credentials')}`);
  const [ap] = await pool.query<any[]>(
    `SELECT COUNT(DISTINCT rp.permission_id) c FROM users u
     JOIN user_role_assignments ura ON ura.user_id = u.id
     JOIN role_permissions rp ON rp.role_id = ura.role_id WHERE u.username = 'admin'`,
  );
  console.log(`admin effective perms: ${ap[0]?.c ?? 0}`);
  const [aa] = await pool.query<any[]>(
    `SELECT COUNT(*) c FROM user_role_assignments ura
     JOIN users u ON u.id = ura.user_id
     WHERE u.username = 'admin' AND ura.assignment_status = 'ACTIVE'`,
  );
  console.log(`admin active assignments: ${aa[0]?.c ?? 0}  (应为 1，>1 表示去重/唯一约束未生效)`);
}

async function run(): Promise<void> {
  const base = ['users', 'roles', 'permissions', 'role_permissions', 'user_role_assignments', 'organization_units'];
  for (const t of base) {
    if (!(await tableExists(t))) throw new Error(`MISSING_BASE_TABLE:${t} — 请先运行 phase0a 迁移建立 RBAC 基础表`);
  }
  await ensureTable('user_credentials', USER_CREDENTIALS_DDL);
  await ensureTable('permission_catalog_meta', CATALOG_META_DDL);
  await ensureRoleAssignmentScope();
  await ensureRevokedByColumn();
  await ensureSingleActiveRoleAssignment();
  await seedPermissions();
  await reconcilePermissions();
  await seedRoles();
  await reconcileRoles();
  await seedRolePermissions();
  await seedCatalogMeta();
  const admin = await ensureAdminUser();
  await summary();
  console.log('--- admin login ---');
  console.log(`username: ${admin.username}`);
  console.log(`password: ${admin.password}  (must_change_password=1，首次登录需改密)`);
}

if (require.main === module) {
  run()
    .then(() => { console.log('[auth] migrations complete'); return pool.end().then(() => process.exit(0)); })
    .catch((error) => { console.error('[auth] FAILED:', error instanceof Error ? error.message : String(error)); pool.end().finally(() => process.exit(1)); });
}

export { run as runAuthMigrations };
