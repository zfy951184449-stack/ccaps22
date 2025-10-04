-- APS系统常用查询脚本
-- 版本: v2.3
-- 创建日期: 2025-09-15

USE aps_system;

-- ====================================
-- 常用查询SQL
-- ====================================

-- 1. 查询人员完整信息
-- 查询所有人员及其资质信息
SELECT 
    e.employee_code AS '工号',
    e.employee_name AS '姓名',
    e.department AS '部门',
    GROUP_CONCAT(DISTINCT CONCAT(q.qualification_name, '(', eq.qualification_level, '级)')) AS '资质'
FROM employees e
LEFT JOIN employee_qualifications eq ON e.id = eq.employee_id
LEFT JOIN qualifications q ON eq.qualification_id = q.id
GROUP BY e.id, e.employee_code, e.employee_name, e.department;

-- 2. 查询操作及其资质要求
-- 显示所有操作的详细信息和所需资质
SELECT 
    o.operation_code AS '操作编码',
    o.operation_name AS '操作名称',
    o.standard_time AS '标准耗时(分钟)',
    o.required_people AS '所需人数',
    GROUP_CONCAT(CONCAT(q.qualification_name, '(>=', oqr.required_level, '级*', oqr.required_count, '人)')) AS '资质要求'
FROM operations o
LEFT JOIN operation_qualification_requirements oqr ON o.id = oqr.operation_id
LEFT JOIN qualifications q ON oqr.qualification_id = q.id
GROUP BY o.id, o.operation_code, o.operation_name, o.standard_time, o.required_people;

-- 3. 查询工艺模版完整结构
-- 显示模版的完整层次结构
SELECT 
    pt.template_code AS '模版编码',
    pt.template_name AS '模版名称',
    ps.stage_name AS '阶段名称',
    ps.stage_order AS '阶段顺序',
    CONCAT('day', ps.start_day) AS '阶段开始',
    o.operation_name AS '操作名称',
    CONCAT('day', sos.operation_day) AS '操作相对天数',
    sos.recommended_time AS '推荐时间',
    CONCAT(sos.window_start_time, '-', sos.window_end_time) AS '时间窗口',
    sos.operation_order AS '操作顺序'
FROM process_templates pt
LEFT JOIN process_stages ps ON pt.id = ps.template_id
LEFT JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
LEFT JOIN operations o ON sos.operation_id = o.id
ORDER BY pt.id, ps.stage_order, sos.operation_order;

-- 4. 查询特定模版的绝对时间线
-- 显示某个模版的完整时间安排（需要替换模版编码）
SELECT 
    pt.template_name AS '工艺模版',
    CONCAT('day', (ps.start_day + sos.operation_day)) AS '绝对执行天数',
    ps.stage_name AS '阶段',
    o.operation_name AS '操作',
    sos.recommended_time AS '推荐时间',
    CONCAT(sos.window_start_time, '-', sos.window_end_time) AS '时间窗口',
    o.standard_time AS '标准耗时(分钟)'
FROM process_templates pt
JOIN process_stages ps ON pt.id = ps.template_id
JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
JOIN operations o ON sos.operation_id = o.id
WHERE pt.template_code = 'PT001'  -- 请替换为实际的模版编码
ORDER BY (ps.start_day + sos.operation_day), sos.recommended_time;

-- 5. 查询阶段操作安排及其资质需求
-- 显示特定模版的操作安排和资质需求
SELECT 
    pt.template_name AS '工艺模版',
    ps.stage_name AS '阶段名称',
    CONCAT('day', (ps.start_day + sos.operation_day)) AS '绝对执行天数',
    o.operation_name AS '操作名称',
    o.standard_time AS '标准耗时(分钟)',
    sos.recommended_time AS '推荐时间',
    CONCAT(sos.window_start_time, '-', sos.window_end_time) AS '时间窗口',
    GROUP_CONCAT(CONCAT(q.qualification_name, '(>=', oqr.required_level, '级*', oqr.required_count, '人)')) AS '资质需求'
FROM process_templates pt
JOIN process_stages ps ON pt.id = ps.template_id
JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
JOIN operations o ON sos.operation_id = o.id
LEFT JOIN operation_qualification_requirements oqr ON o.id = oqr.operation_id
LEFT JOIN qualifications q ON oqr.qualification_id = q.id
WHERE pt.template_code = 'PT001'  -- 请替换为实际的模版编码
GROUP BY pt.template_name, ps.stage_name, ps.start_day, sos.operation_day, 
         o.operation_name, o.standard_time, sos.recommended_time, 
         sos.window_start_time, sos.window_end_time
ORDER BY (ps.start_day + sos.operation_day), sos.recommended_time;

-- 6. 查询操作约束关系
-- 显示操作之间的约束关系
SELECT 
    pt.template_name AS '工艺模版',
    ps1.stage_name AS '当前阶段',
    o1.operation_name AS '当前操作',
    CONCAT('day', (ps1.start_day + sos1.operation_day)) AS '当前操作天数',
    ps2.stage_name AS '前置阶段', 
    o2.operation_name AS '前置操作',
    CONCAT('day', (ps2.start_day + sos2.operation_day)) AS '前置操作天数',
    CASE oc.constraint_type 
        WHEN 1 THEN 'FS(完成后开始)'
        WHEN 2 THEN 'SS(开始后开始)'
        WHEN 3 THEN 'FF(完成后完成)'
        WHEN 4 THEN 'SF(开始后完成)'
    END AS '约束类型',
    oc.time_lag AS '时间滞后(小时)',
    CASE oc.constraint_level
        WHEN 1 THEN '强制'
        WHEN 2 THEN '优选'
        WHEN 3 THEN '建议'
    END AS '约束级别'
FROM process_templates pt
JOIN process_stages ps1 ON pt.id = ps1.template_id
JOIN stage_operation_schedules sos1 ON ps1.id = sos1.stage_id
JOIN operations o1 ON sos1.operation_id = o1.id
JOIN operation_constraints oc ON sos1.id = oc.schedule_id
JOIN stage_operation_schedules sos2 ON oc.predecessor_schedule_id = sos2.id
JOIN operations o2 ON sos2.operation_id = o2.id
JOIN process_stages ps2 ON sos2.stage_id = ps2.id
WHERE pt.template_code = 'PT001'  -- 请替换为实际的模版编码
ORDER BY (ps1.start_day + sos1.operation_day), sos1.recommended_time;

-- 7. 约束冲突检查查询
-- 检查FS类型约束是否存在冲突
SELECT 
    o1.operation_name AS '当前操作',
    (ps1.start_day + sos1.operation_day) AS '当前操作天数',
    sos1.recommended_time AS '当前推荐时间',
    o2.operation_name AS '前置操作',
    (ps2.start_day + sos2.operation_day) AS '前置操作天数',
    sos2.recommended_time AS '前置推荐时间',
    (o2.standard_time / 60.0) AS '前置操作耗时(小时)',
    (sos2.recommended_time + o2.standard_time / 60.0) AS '前置操作结束时间',
    CASE 
        WHEN (ps1.start_day + sos1.operation_day) * 24 + sos1.recommended_time < 
             (ps2.start_day + sos2.operation_day) * 24 + sos2.recommended_time + o2.standard_time / 60.0
        THEN '约束冲突'
        ELSE '约束满足'
    END AS '约束检查结果'
FROM operation_constraints oc
JOIN stage_operation_schedules sos1 ON oc.schedule_id = sos1.id
JOIN operations o1 ON sos1.operation_id = o1.id
JOIN process_stages ps1 ON sos1.stage_id = ps1.id
JOIN stage_operation_schedules sos2 ON oc.predecessor_schedule_id = sos2.id
JOIN operations o2 ON sos2.operation_id = o2.id
JOIN process_stages ps2 ON sos2.stage_id = ps2.id
WHERE oc.constraint_type = 1  -- FS类型约束
ORDER BY ps1.start_day + sos1.operation_day;