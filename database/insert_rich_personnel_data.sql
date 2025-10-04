-- 丰富人员资质测试数据脚本
-- 为APS系统添加更多资质类型和员工资质关联

USE aps_system;

-- 1. 添加更多资质类型
INSERT INTO qualifications (qualification_name) VALUES
('细胞培养操作'),
('无菌操作技术'),
('发酵工艺管理'),
('质量控制检测'),
('设备维护保养'),
('工艺参数监控'),
('样品处理技术'),
('数据记录管理'),
('安全操作规程'),
('环境监测技术'),
('清洁验证操作'),
('培养基配制'),
('细胞传代技术'),
('冷冻保存技术'),
('病毒检测技术'),
('蛋白纯化技术'),
('层析操作技术'),
('过滤操作技术'),
('浓缩操作技术'),
('配液操作技术')
ON DUPLICATE KEY UPDATE qualification_name=VALUES(qualification_name);

-- 2. 为现有员工随机分配资质（模拟真实情况）
-- 获取员工ID范围并分配资质

-- 为员工ID 1-10 分配高级技能（等级4-5）
INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level) VALUES
-- 张伟 (员工1) - 高级技术员
(1, 1, 5), (1, 2, 5), (1, 3, 4), (1, 6, 4), (1, 9, 5),
-- 李娜 (员工2) - 质量控制专家  
(2, 4, 5), (2, 5, 4), (2, 8, 5), (2, 15, 4), (2, 9, 4),
-- 王强 (员工3) - 设备维护专家
(3, 5, 5), (3, 6, 4), (3, 9, 5), (3, 11, 4), (3, 1, 3),
-- 刘敏 (员工4) - 细胞培养专家
(4, 1, 5), (4, 12, 5), (4, 13, 4), (4, 14, 4), (4, 2, 5),
-- 陈杰 (员工5) - 工艺工程师
(5, 3, 5), (5, 6, 5), (5, 8, 4), (5, 16, 4), (5, 17, 3),
-- 杨丽 (员工6) - 分析技术员
(6, 4, 4), (6, 15, 5), (6, 7, 4), (6, 8, 4), (6, 18, 3),
-- 赵磊 (员工7) - 操作技术员
(7, 1, 4), (7, 2, 4), (7, 12, 4), (7, 20, 4), (7, 9, 4),
-- 孙婷 (员工8) - 质量保证专员
(8, 4, 4), (8, 8, 5), (8, 9, 5), (8, 11, 4), (8, 7, 3),
-- 周涛 (员工9) - 设备操作员
(9, 2, 3), (9, 5, 4), (9, 18, 4), (9, 19, 4), (9, 20, 4),
-- 吴静 (员工10) - 培养基配制专员
(10, 12, 5), (10, 20, 5), (10, 1, 3), (10, 2, 4), (10, 6, 3)
ON DUPLICATE KEY UPDATE qualification_level=VALUES(qualification_level);

-- 为员工ID 11-20 分配中级技能（等级2-4）
INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level) VALUES
-- 员工11-15 中级操作员
(11, 1, 3), (11, 2, 3), (11, 9, 3), (11, 12, 3),
(12, 1, 4), (12, 6, 3), (12, 8, 3), (12, 13, 3),
(13, 2, 3), (13, 7, 4), (13, 9, 4), (13, 18, 3),
(14, 3, 3), (14, 6, 3), (14, 16, 3), (14, 17, 2),
(15, 4, 3), (15, 5, 3), (15, 8, 4), (15, 15, 3),
-- 员工16-20 技术助理
(16, 1, 2), (16, 2, 3), (16, 12, 2), (16, 20, 3),
(17, 7, 3), (17, 8, 3), (17, 9, 3), (17, 11, 2),
(18, 18, 3), (18, 19, 3), (18, 20, 4), (18, 6, 2),
(19, 1, 3), (19, 13, 2), (19, 14, 2), (19, 2, 3),
(20, 5, 2), (20, 9, 3), (20, 11, 3), (20, 6, 2)
ON DUPLICATE KEY UPDATE qualification_level=VALUES(qualification_level);

-- 为员工ID 21-31 分配初级技能（等级1-3）
INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level) VALUES
-- 新员工和实习生
(21, 1, 2), (21, 2, 2), (21, 9, 2),
(22, 8, 2), (22, 9, 3), (22, 11, 2),
(23, 1, 1), (23, 2, 1), (23, 12, 2),
(24, 7, 2), (24, 8, 2), (24, 9, 2),
(25, 5, 1), (25, 6, 2), (25, 9, 2),
(26, 18, 2), (26, 19, 2), (26, 20, 2),
(27, 1, 2), (27, 12, 1), (27, 13, 1),
(28, 2, 2), (28, 9, 2), (28, 11, 2),
(29, 4, 1), (29, 7, 2), (29, 8, 2),
(30, 1, 1), (30, 2, 2), (30, 9, 1),
(31, 6, 2), (31, 8, 1), (31, 9, 2)
ON DUPLICATE KEY UPDATE qualification_level=VALUES(qualification_level);

-- 3. 为一些员工添加多重高级资质（模拟专家级员工）
INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level) VALUES
-- 张伟 - 全能专家
(1, 7, 4), (1, 8, 5), (1, 11, 4), (1, 16, 3),
-- 李娜 - 质量和分析专家
(2, 7, 4), (2, 11, 5), (2, 16, 4), (2, 17, 3),
-- 王强 - 设备和工艺专家  
(3, 16, 4), (3, 17, 4), (3, 18, 4), (3, 19, 3),
-- 刘敏 - 细胞培养全流程专家
(4, 7, 3), (4, 15, 4), (4, 16, 3), (4, 20, 4),
-- 陈杰 - 工艺开发专家
(5, 1, 4), (5, 2, 4), (5, 18, 4), (5, 19, 4)
ON DUPLICATE KEY UPDATE qualification_level=VALUES(qualification_level);

-- 4. 统计插入结果
SELECT 
    '员工总数' as 统计项目,
    COUNT(*) as 数量
FROM employees
UNION ALL
SELECT 
    '资质类型总数',
    COUNT(*)
FROM qualifications
UNION ALL
SELECT 
    '员工资质关联总数',
    COUNT(*)
FROM employee_qualifications;

-- 5. 显示资质分布统计
SELECT 
    q.qualification_name as 资质名称,
    COUNT(eq.employee_id) as 拥有人数,
    ROUND(AVG(eq.qualification_level), 2) as 平均等级,
    MIN(eq.qualification_level) as 最低等级,
    MAX(eq.qualification_level) as 最高等级
FROM qualifications q
LEFT JOIN employee_qualifications eq ON q.id = eq.qualification_id
GROUP BY q.id, q.qualification_name
ORDER BY 拥有人数 DESC;

-- 6. 显示员工资质统计
SELECT 
    CASE 
        WHEN qualification_count = 0 THEN '无资质'
        WHEN qualification_count BETWEEN 1 AND 2 THEN '1-2项资质'
        WHEN qualification_count BETWEEN 3 AND 5 THEN '3-5项资质'
        WHEN qualification_count BETWEEN 6 AND 8 THEN '6-8项资质'
        ELSE '9项以上资质'
    END as 资质数量范围,
    COUNT(*) as 员工数量
FROM (
    SELECT 
        e.id,
        COUNT(eq.qualification_id) as qualification_count
    FROM employees e
    LEFT JOIN employee_qualifications eq ON e.id = eq.employee_id
    GROUP BY e.id
) emp_qual_count
GROUP BY 
    CASE 
        WHEN qualification_count = 0 THEN '无资质'
        WHEN qualification_count BETWEEN 1 AND 2 THEN '1-2项资质'
        WHEN qualification_count BETWEEN 3 AND 5 THEN '3-5项资质'
        WHEN qualification_count BETWEEN 6 AND 8 THEN '6-8项资质'
        ELSE '9项以上资质'
    END
ORDER BY 员工数量 DESC;