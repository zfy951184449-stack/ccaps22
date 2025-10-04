-- 组织架构迁移脚本
-- 目标：将旧有 departments / teams / shifts / employee_team_roles 数据迁移至
--       organization_units 与 employee_org_membership 的统一结构。

USE aps_system;

START TRANSACTION;

-- ============================================================
-- 1. 迁移部门到 organization_units
-- ============================================================

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_department_unit_map (
    department_id INT PRIMARY KEY,
    unit_id INT
);

-- 插入缺失的部门单元
INSERT INTO organization_units (
    unit_type,
    unit_code,
    unit_name,
    default_shift_code,
    sort_order,
    is_active,
    metadata,
    created_at,
    updated_at
)
SELECT 'DEPARTMENT' AS unit_type,
       d.dept_code,
       d.dept_name,
       NULL,
       d.sort_order,
       d.is_active,
       CASE WHEN d.description IS NOT NULL AND d.description <> ''
            THEN JSON_OBJECT('description', d.description)
            ELSE NULL END,
       d.created_at,
       d.updated_at
  FROM departments d
 WHERE NOT EXISTS (
       SELECT 1
         FROM organization_units u
        WHERE u.unit_type = 'DEPARTMENT'
          AND u.unit_code = d.dept_code
       );

TRUNCATE TABLE tmp_department_unit_map;
INSERT INTO tmp_department_unit_map (department_id, unit_id)
SELECT d.id,
       u.id
  FROM departments d
  JOIN organization_units u
    ON u.unit_type = 'DEPARTMENT'
   AND u.unit_code = d.dept_code;

-- 更新父级关系
UPDATE organization_units u
JOIN tmp_department_unit_map map ON map.unit_id = u.id
JOIN departments d ON d.id = map.department_id
LEFT JOIN tmp_department_unit_map parent ON parent.department_id = d.parent_id
   SET u.parent_id = parent.unit_id;

-- ============================================================
-- 2. 迁移团队到 organization_units
-- ============================================================

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_team_unit_map (
    team_id INT PRIMARY KEY,
    unit_id INT
);

INSERT INTO organization_units (
    unit_type,
    unit_code,
    unit_name,
    default_shift_code,
    sort_order,
    is_active,
    metadata,
    created_at,
    updated_at
)
SELECT 'TEAM',
       t.team_code,
       t.team_name,
       t.default_shift_code,
       0,
       t.is_active,
       CASE WHEN t.description IS NOT NULL AND t.description <> ''
            THEN JSON_OBJECT('description', t.description)
            ELSE NULL END,
       t.created_at,
       t.updated_at
  FROM teams t
 WHERE NOT EXISTS (
       SELECT 1 FROM organization_units u
        WHERE u.unit_type = 'TEAM'
          AND u.unit_code = t.team_code
      );

TRUNCATE TABLE tmp_team_unit_map;
INSERT INTO tmp_team_unit_map (team_id, unit_id)
SELECT t.id,
       u.id
  FROM teams t
  JOIN organization_units u
    ON u.unit_type = 'TEAM'
   AND u.unit_code = t.team_code;

UPDATE organization_units u
JOIN tmp_team_unit_map tmap ON tmap.unit_id = u.id
JOIN teams t ON t.id = tmap.team_id
LEFT JOIN tmp_department_unit_map dmap ON dmap.department_id = t.department_id
   SET u.parent_id = dmap.unit_id;

-- ============================================================
-- 3. 迁移班次到 organization_units（可选）
-- ============================================================

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_shift_unit_map (
    shift_id INT PRIMARY KEY,
    unit_id INT
);

INSERT INTO organization_units (
    unit_type,
    unit_code,
    unit_name,
    default_shift_code,
    sort_order,
    is_active,
    metadata,
    created_at,
    updated_at
)
SELECT 'SHIFT',
       s.shift_code,
       s.shift_name,
       s.shift_code,
       s.sort_order,
       s.is_active,
       CASE WHEN s.description IS NOT NULL AND s.description <> ''
            THEN JSON_OBJECT('description', s.description)
            ELSE NULL END,
       s.created_at,
       s.updated_at
  FROM shifts s
 WHERE NOT EXISTS (
       SELECT 1 FROM organization_units u
        WHERE u.unit_type = 'SHIFT'
          AND u.unit_code = s.shift_code
      );

TRUNCATE TABLE tmp_shift_unit_map;
INSERT INTO tmp_shift_unit_map (shift_id, unit_id)
SELECT s.id,
       u.id
  FROM shifts s
  JOIN organization_units u
    ON u.unit_type = 'SHIFT'
   AND u.unit_code = s.shift_code;

UPDATE organization_units u
JOIN tmp_shift_unit_map smap ON smap.unit_id = u.id
JOIN shifts s ON s.id = smap.shift_id
LEFT JOIN tmp_team_unit_map tmap ON tmap.team_id = s.team_id
   SET u.parent_id = tmap.unit_id;

-- ============================================================
-- 4. 迁移员工主归属到 employee_org_membership
-- ============================================================

INSERT INTO employee_org_membership (
    employee_id,
    unit_id,
    assignment_type,
    role_at_unit,
    start_date,
    end_date,
    is_active
)
SELECT e.id,
       COALESCE(team.unit_id, dept.unit_id),
       'PRIMARY',
       CASE
         WHEN e.org_role IN ('DEPT_MANAGER','TEAM_LEADER','GROUP_LEADER','SHIFT_LEADER') THEN 'LEADER'
         ELSE 'MEMBER'
       END,
       e.hire_date,
       NULL,
       1
  FROM employees e
  LEFT JOIN tmp_team_unit_map team ON team.team_id = e.primary_team_id
  LEFT JOIN tmp_department_unit_map dept ON dept.department_id = e.department_id
 WHERE COALESCE(team.unit_id, dept.unit_id) IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM employee_org_membership m
        WHERE m.employee_id = e.id
          AND m.unit_id = COALESCE(team.unit_id, dept.unit_id)
          AND m.assignment_type = 'PRIMARY'
   );

-- ============================================================
-- 5. 迁移员工岗位关系（employee_team_roles）
-- ============================================================

INSERT INTO employee_org_membership (
    employee_id,
    unit_id,
    assignment_type,
    role_at_unit,
    start_date,
    end_date,
    is_active
)
SELECT etr.employee_id,
       COALESCE(shift.unit_id, team.unit_id),
       CASE WHEN etr.is_primary = 1 THEN 'PRIMARY' ELSE 'SECONDARY' END,
       CASE
         WHEN e.org_role IN ('DEPT_MANAGER','TEAM_LEADER','GROUP_LEADER','SHIFT_LEADER') THEN 'LEADER'
         ELSE 'MEMBER'
       END,
       etr.effective_from,
       etr.effective_to,
       1
  FROM employee_team_roles etr
  JOIN employees e ON e.id = etr.employee_id
  LEFT JOIN tmp_shift_unit_map shift ON shift.shift_id = etr.shift_id
  LEFT JOIN tmp_team_unit_map team ON team.team_id = etr.team_id
 WHERE COALESCE(shift.unit_id, team.unit_id) IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM employee_org_membership m
        WHERE m.employee_id = etr.employee_id
          AND m.unit_id = COALESCE(shift.unit_id, team.unit_id)
          AND m.assignment_type = CASE WHEN etr.is_primary = 1 THEN 'PRIMARY' ELSE 'SECONDARY' END
   );

COMMIT;
