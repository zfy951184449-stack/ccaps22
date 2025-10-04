-- 为现有员工分配现有资质类型的测试数据
-- 使用现有的5个资质类型，为31个员工分配不同等级的资质

USE aps_system;

-- 清空现有的员工资质关联（重新分配）
DELETE FROM employee_qualifications;

-- 现有资质类型：
-- 1: 测试资质
-- 2: SUB反应器资质  
-- 3: 电极准备资质
-- 4: WAVE反应器资质
-- 5: 完整性测试

-- 为员工分配资质（模拟真实的技能分布）

-- 高级员工 (员工ID 1-5) - 拥有多项高等级资质
INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level) VALUES
-- 张伟 - 全能高级技术员
(1, 1, 5), (1, 2, 4), (1, 3, 4), (1, 4, 3), (1, 5, 4),
-- 李娜 - 反应器专家
(2, 2, 5), (2, 4, 5), (2, 1, 4), (2, 5, 3),
-- 王强 - 测试和电极专家  
(3, 1, 5), (3, 3, 5), (3, 5, 4), (3, 2, 3),
-- 刘敏 - WAVE和完整性测试专家
(4, 4, 5), (4, 5, 5), (4, 1, 4), (4, 2, 3), (4, 3, 2),
-- 陈杰 - 综合技术专家
(5, 1, 4), (5, 2, 4), (5, 3, 4), (5, 4, 4), (5, 5, 3);

-- 中高级员工 (员工ID 6-15) - 拥有2-4项中高等级资质
INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level) VALUES
(6, 1, 4), (6, 2, 3), (6, 5, 4),
(7, 2, 4), (7, 4, 4), (7, 1, 3), (7, 3, 2),
(8, 1, 3), (8, 3, 4), (8, 5, 3),
(9, 4, 4), (9, 5, 4), (9, 2, 3), (9, 1, 2),
(10, 1, 4), (10, 3, 3), (10, 4, 3),
(11, 2, 3), (11, 3, 4), (11, 5, 3), (11, 1, 3),
(12, 1, 3), (12, 4, 3), (12, 5, 2),
(13, 2, 4), (13, 3, 3), (13, 1, 3),
(14, 1, 3), (14, 5, 4), (14, 4, 2),
(15, 3, 3), (15, 4, 3), (15, 2, 2), (15, 1, 2);

-- 中级员工 (员工ID 16-25) - 拥有1-3项中等级资质
INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level) VALUES
(16, 1, 3), (16, 2, 2),
(17, 3, 3), (17, 5, 2), (17, 1, 2),
(18, 4, 3), (18, 1, 2),
(19, 2, 3), (19, 3, 2), (19, 5, 2),
(20, 1, 2), (20, 4, 2), (20, 5, 3),
(21, 2, 2), (21, 3, 3),
(22, 1, 3), (22, 5, 2),
(23, 4, 2), (23, 2, 2), (23, 1, 2),
(24, 3, 2), (24, 5, 2),
(25, 1, 2), (25, 2, 3), (25, 4, 2);

-- 初级员工 (员工ID 26-31) - 拥有1-2项初级资质
INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level) VALUES
(26, 1, 2), (26, 3, 1),
(27, 2, 1), (27, 1, 2),
(28, 4, 1), (28, 5, 2),
(29, 1, 1), (29, 2, 2),
(30, 3, 2), (30, 1, 1),
(31, 5, 1), (31, 1, 2);

-- 查看分配结果统计
SELECT 
    '=== 资质分配统计 ===' as 统计信息;

-- 按资质类型统计拥有人数和平均等级
SELECT 
    q.qualification_name as 资质名称,
    COUNT(eq.employee_id) as 拥有人数,
    ROUND(AVG(eq.qualification_level), 2) as 平均等级,
    MIN(eq.qualification_level) as 最低等级,
    MAX(eq.qualification_level) as 最高等级,
    -- 等级分布
    SUM(CASE WHEN eq.qualification_level = 1 THEN 1 ELSE 0 END) as '1级人数',
    SUM(CASE WHEN eq.qualification_level = 2 THEN 1 ELSE 0 END) as '2级人数',
    SUM(CASE WHEN eq.qualification_level = 3 THEN 1 ELSE 0 END) as '3级人数',
    SUM(CASE WHEN eq.qualification_level = 4 THEN 1 ELSE 0 END) as '4级人数',
    SUM(CASE WHEN eq.qualification_level = 5 THEN 1 ELSE 0 END) as '5级人数'
FROM qualifications q
LEFT JOIN employee_qualifications eq ON q.id = eq.qualification_id
GROUP BY q.id, q.qualification_name
ORDER BY 拥有人数 DESC;

-- 按员工统计拥有资质数量
SELECT 
    CASE 
        WHEN qualification_count = 0 THEN '0项资质'
        WHEN qualification_count = 1 THEN '1项资质'
        WHEN qualification_count = 2 THEN '2项资质'
        WHEN qualification_count = 3 THEN '3项资质'
        WHEN qualification_count = 4 THEN '4项资质'
        WHEN qualification_count = 5 THEN '5项资质'
    END as 资质数量,
    COUNT(*) as 员工数量
FROM (
    SELECT 
        e.id,
        COUNT(eq.qualification_id) as qualification_count
    FROM employees e
    LEFT JOIN employee_qualifications eq ON e.id = eq.employee_id
    GROUP BY e.id
) emp_qual_count
GROUP BY qualification_count
ORDER BY qualification_count DESC;

-- 显示前10名员工的资质详情
SELECT 
    e.employee_name as 员工姓名,
    e.employee_code as 工号,
    COUNT(eq.qualification_id) as 资质数量,
    GROUP_CONCAT(
        CONCAT(q.qualification_name, '(', eq.qualification_level, '级)')
        ORDER BY eq.qualification_level DESC
        SEPARATOR ', '
    ) as 资质详情
FROM employees e
LEFT JOIN employee_qualifications eq ON e.id = eq.employee_id
LEFT JOIN qualifications q ON eq.qualification_id = q.id
WHERE e.id <= 10
GROUP BY e.id, e.employee_name, e.employee_code
ORDER BY 资质数量 DESC, e.id;