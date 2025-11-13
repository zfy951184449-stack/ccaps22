-- =====================================================
-- 批量设置所有员工为综合工时制
-- 说明：此脚本会将所有活跃员工设置为综合工时制
-- 执行方式：mysql -u root -p aps_system < database/set_all_employees_comprehensive_work_time.sql
-- =====================================================

USE aps_system;

-- 开始事务以确保原子性
START TRANSACTION;

-- =====================================================
-- 配置参数（请根据实际情况修改）
-- =====================================================

-- 综合工时制周期类型：WEEK(周)、MONTH(月)、QUARTER(季)、YEAR(年)
SET @comprehensive_period = 'MONTH';  -- 默认使用月度综合工时制

-- 生效日期（从何时开始生效）
SET @effective_from = CURDATE();  -- 默认从今天开始生效

-- 是否使用固定标准值（true）还是动态计算（false）
-- true: 使用法律规定的固定标准值（月166.64小时、季500小时等）
-- false: 根据实际工作日数动态计算
SET @use_fixed_standards = FALSE;  -- 默认使用动态计算

-- =====================================================
-- 固定标准工时值（根据《关于职工全年月平均工作时间和工资折算问题的通知》）
-- =====================================================
SET @year_standard_hours = 2000.00;      -- 年标准工时：250天 × 8小时
SET @quarter_standard_hours = 500.00;    -- 季标准工时：62.5天 × 8小时
SET @month_standard_hours = 166.64;      -- 月标准工时：20.83天 × 8小时
SET @week_standard_hours = 40.00;        -- 周标准工时：5天 × 8小时

-- =====================================================
-- 步骤1: 确保所有活跃员工都有employee_shift_limits记录
-- =====================================================

-- 为没有employee_shift_limits记录的员工创建默认记录
INSERT INTO employee_shift_limits (
    employee_id,
    effective_from,
    effective_to,
    max_daily_hours,
    max_consecutive_days,
    work_time_system_type,
    comprehensive_period,
    comprehensive_target_hours
)
SELECT 
    e.id AS employee_id,
    @effective_from AS effective_from,
    NULL AS effective_to,
    11.00 AS max_daily_hours,
    6 AS max_consecutive_days,
    'COMPREHENSIVE' AS work_time_system_type,
    @comprehensive_period AS comprehensive_period,
    CASE @comprehensive_period
        WHEN 'WEEK' THEN @week_standard_hours
        WHEN 'MONTH' THEN @month_standard_hours
        WHEN 'QUARTER' THEN @quarter_standard_hours
        WHEN 'YEAR' THEN @year_standard_hours
        ELSE NULL
    END AS comprehensive_target_hours
FROM employees e
WHERE e.employment_status = 'ACTIVE'
  AND NOT EXISTS (
      SELECT 1 
      FROM employee_shift_limits esl
      WHERE esl.employee_id = e.id
        AND esl.effective_from <= @effective_from
        AND (esl.effective_to IS NULL OR esl.effective_to >= @effective_from)
  );

-- =====================================================
-- 步骤2: 更新现有记录，将生效日期在@effective_from之前的记录设置为过期
-- =====================================================

-- 将现有记录的有效期结束日期设置为@effective_from前一天
UPDATE employee_shift_limits esl
INNER JOIN employees e ON esl.employee_id = e.id
SET esl.effective_to = DATE_SUB(@effective_from, INTERVAL 1 DAY)
WHERE e.employment_status = 'ACTIVE'
  AND esl.effective_from < @effective_from
  AND (esl.effective_to IS NULL OR esl.effective_to >= @effective_from);

-- =====================================================
-- 步骤3: 为所有活跃员工创建新的综合工时制记录
-- =====================================================

-- 如果使用固定标准值
INSERT INTO employee_shift_limits (
    employee_id,
    effective_from,
    effective_to,
    max_daily_hours,
    max_consecutive_days,
    work_time_system_type,
    comprehensive_period,
    comprehensive_target_hours,
    quarter_standard_hours,
    month_standard_hours
)
SELECT 
    e.id AS employee_id,
    @effective_from AS effective_from,
    NULL AS effective_to,
    COALESCE(esl_old.max_daily_hours, 11.00) AS max_daily_hours,
    COALESCE(esl_old.max_consecutive_days, 6) AS max_consecutive_days,
    'COMPREHENSIVE' AS work_time_system_type,
    @comprehensive_period AS comprehensive_period,
    CASE @comprehensive_period
        WHEN 'WEEK' THEN @week_standard_hours
        WHEN 'MONTH' THEN @month_standard_hours
        WHEN 'QUARTER' THEN @quarter_standard_hours
        WHEN 'YEAR' THEN @year_standard_hours
        ELSE NULL
    END AS comprehensive_target_hours,
    @quarter_standard_hours AS quarter_standard_hours,
    @month_standard_hours AS month_standard_hours
FROM employees e
LEFT JOIN (
    -- 获取每个员工最新的employee_shift_limits记录
    SELECT 
        employee_id,
        max_daily_hours,
        max_consecutive_days
    FROM employee_shift_limits
    WHERE employee_id IN (SELECT id FROM employees WHERE employment_status = 'ACTIVE')
      AND effective_from < @effective_from
    ORDER BY employee_id, effective_from DESC
) esl_old ON e.id = esl_old.employee_id
WHERE e.employment_status = 'ACTIVE'
  AND NOT EXISTS (
      SELECT 1 
      FROM employee_shift_limits esl_new
      WHERE esl_new.employee_id = e.id
        AND esl_new.effective_from = @effective_from
  )
ON DUPLICATE KEY UPDATE
    work_time_system_type = 'COMPREHENSIVE',
    comprehensive_period = @comprehensive_period,
    comprehensive_target_hours = CASE @comprehensive_period
        WHEN 'WEEK' THEN @week_standard_hours
        WHEN 'MONTH' THEN @month_standard_hours
        WHEN 'QUARTER' THEN @quarter_standard_hours
        WHEN 'YEAR' THEN @year_standard_hours
        ELSE NULL
    END,
    quarter_standard_hours = @quarter_standard_hours,
    month_standard_hours = @month_standard_hours;

-- =====================================================
-- 步骤4: 验证更新结果
-- =====================================================

-- 显示更新统计
SELECT 
    'Update Summary' AS report_type,
    COUNT(*) AS total_active_employees,
    COUNT(CASE WHEN esl.work_time_system_type = 'COMPREHENSIVE' 
               AND esl.comprehensive_period = @comprehensive_period 
               AND esl.effective_from = @effective_from 
               AND (esl.effective_to IS NULL OR esl.effective_to >= @effective_from)
          THEN 1 END) AS comprehensive_employees,
    COUNT(CASE WHEN esl.work_time_system_type != 'COMPREHENSIVE' 
               OR esl.comprehensive_period != @comprehensive_period
               OR esl.effective_from != @effective_from
          THEN 1 END) AS not_updated_employees
FROM employees e
LEFT JOIN employee_shift_limits esl ON e.id = esl.employee_id
    AND esl.effective_from <= @effective_from
    AND (esl.effective_to IS NULL OR esl.effective_to >= @effective_from)
WHERE e.employment_status = 'ACTIVE';

-- 显示综合工时制配置详情
SELECT 
    'Comprehensive Work Time Configuration' AS report_type,
    e.id AS employee_id,
    e.employee_code,
    e.employee_name,
    esl.work_time_system_type,
    esl.comprehensive_period,
    esl.comprehensive_target_hours,
    esl.max_daily_hours,
    esl.max_consecutive_days,
    esl.effective_from,
    esl.effective_to
FROM employees e
INNER JOIN employee_shift_limits esl ON e.id = esl.employee_id
WHERE e.employment_status = 'ACTIVE'
  AND esl.work_time_system_type = 'COMPREHENSIVE'
  AND esl.comprehensive_period = @comprehensive_period
  AND esl.effective_from = @effective_from
  AND (esl.effective_to IS NULL OR esl.effective_to >= @effective_from)
ORDER BY e.employee_code
LIMIT 20;  -- 只显示前20条，避免输出过多

-- 提交事务
COMMIT;

-- =====================================================
-- 使用说明
-- =====================================================
-- 
-- 1. 修改配置参数：
--    - @comprehensive_period: 设置周期类型（WEEK/MONTH/QUARTER/YEAR）
--    - @effective_from: 设置生效日期
--    - @use_fixed_standards: 是否使用固定标准值
--
-- 2. 执行脚本：
--    mysql -u root -p aps_system < database/set_all_employees_comprehensive_work_time.sql
--
-- 3. 验证结果：
--    脚本会自动显示更新统计和配置详情
--
-- 4. 注意事项：
--    - 脚本会为所有活跃员工创建新的employee_shift_limits记录
--    - 现有记录的有效期会被设置为新记录生效日期前一天
--    - 如果员工已有相同生效日期的记录，会更新该记录
--    - 目标工时会根据周期类型自动设置（使用固定标准值）
--
-- =====================================================

