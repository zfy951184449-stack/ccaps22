-- 员工自助视角 RBAC:新增"查看本人排班"权限 + "一线员工(自助)"角色 + 授权。
-- 幂等、非破坏(全 INSERT IGNORE),用于增量上线。
-- 权威来源是 scripts/auth/run_auth_migrations.ts(已同步加入 ROSTER_SELF_READ / EMPLOYEE_SELF);
-- 本文件供"只增量、不跑会 reconcile 删非种子角色的全量脚本"时使用。

-- 1) 权限点
INSERT IGNORE INTO permissions (permission_code, permission_name, permission_domain, action_code, resource_code)
VALUES ('ROSTER_SELF_READ', '查看本人排班(员工自助)', 'ROSTER', 'READ', 'SELF_SCHEDULE');

-- 2) 员工自助角色
INSERT IGNORE INTO roles (role_code, role_name, role_scope)
VALUES ('EMPLOYEE_SELF', '一线员工(自助)', 'ROSTER');

-- 3) 角色 → 权限(只授本人排班只读)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code = 'ROSTER_SELF_READ' AND p.permission_status = 'ACTIVE'
WHERE r.role_code = 'EMPLOYEE_SELF';

-- 4) 权限目录元数据(资源标签;供治理界面分组显示)
INSERT IGNORE INTO permission_catalog_meta (meta_type, domain, resource_code, label_cn, sort_order)
VALUES ('RESOURCE', 'ROSTER', 'SELF_SCHEDULE', '本人排班(员工自助)', 99);

-- 账号开通(MVP 手动,后续做治理端点):给某员工开通自助账号,把下面 <...> 换成实际值
--   假设已在治理界面建好 user 并知道其 users.id 与目标 employees.id:
-- INSERT IGNORE INTO user_role_assignments (user_id, role_id)
--   SELECT <userId>, id FROM roles WHERE role_code = 'EMPLOYEE_SELF';
-- INSERT INTO user_employee_links (user_id, employee_id) VALUES (<userId>, <employeeId>);
