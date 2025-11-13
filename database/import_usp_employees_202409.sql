SET NAMES utf8mb4;

-- 批量导入 USP 班组新员工（共32人）
-- 说明：执行前请确认 teams 表中存在 team_code = 'USP' 的记录

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP031', '高嘉玮', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP031'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP032', '范永辉', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP032'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP033', '庞梦宇', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP033'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP034', '贾晓菲', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP034'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP035', '焦文宴', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP035'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP036', '陈晓蛟', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP036'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP037', '王若楠', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP037'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP038', '郭红', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP038'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP039', '郝伟松', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP039'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP040', '张艳', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP040'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP041', '刘天畅', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP041'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP042', '杨齐锐', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP042'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP043', '高丽颖', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP043'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP044', '李起祥', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP044'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP045', '张伟红', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP045'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP046', '孟江泽', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP046'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP047', '王榆烨', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP047'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP048', '郑峰屹', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP048'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP049', '杨玲', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP049'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP050', '陈文烨', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP050'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP051', '张嘉辉', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP051'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP052', '王浩阳', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP052'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP053', '刘卫宝', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP053'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP054', '盖志聪', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP054'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP055', '孙维艳', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP055'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP056', '刘启航', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP056'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP057', '任春慧', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP057'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP058', '陈晓东', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP058'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP059', '董春燕', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP059'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP060', '陈永媛', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP060'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP061', '周永鹏', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP061'
  );

INSERT INTO employees (
  employee_code,
  employee_name,
  department_id,
  primary_team_id,
  employment_status,
  org_role
)
SELECT 'USP062', '张宇琪', t.department_id, t.id, 'ACTIVE', 'FRONTLINE'
FROM teams t
WHERE t.team_code = 'USP'
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = 'USP062'
  );
