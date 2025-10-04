# APS系统批次计划安排设计方案

## 📋 项目概述

### 目标
将现有的工艺模版系统扩展为**生产批次计划安排系统**，实现从模版到具体生产计划的完整数据链路。

**重要定位：** 这是一个**纯粹的计划安排系统**，专注于生成和管理生产计划，不涉及任何执行跟踪和数据回馈。

### 核心需求
- 工艺模版转换为具体的生产批次计划
- 批次有明确的计划日期区间（开始到结束）
- 每个操作都有具体的计划开始和结束时间
- 操作直接关联操作库，获取资质、耗时、人数等信息
- 支持智能人员安排和资源配置
- **用户只需输入开始日期，结束日期根据模版工期自动计算**
- **无需考虑优先级，所有任务同等重要**
- **专注于计划生成，完全不涉及执行跟踪**

## 🗄️ 数据库设计

### 新增核心表结构

#### 1. 生产批次计划表 (production_batch_plans)

```sql
CREATE TABLE production_batch_plans (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '批次计划ID',
    batch_code VARCHAR(50) NOT NULL UNIQUE COMMENT '批次编号',
    batch_name VARCHAR(100) NOT NULL COMMENT '批次名称',
    template_id INT NOT NULL COMMENT '工艺模版ID',
    project_code VARCHAR(50) COMMENT '项目代码',
    
    -- 纯计划时间
    planned_start_date DATE NOT NULL COMMENT '计划开始日期（用户输入）',
    planned_end_date DATE GENERATED ALWAYS AS (
        DATE_ADD(planned_start_date, INTERVAL (
            SELECT (MAX(ps.start_day + sos.operation_day) - MIN(ps.start_day + sos.operation_day)) + 1
            FROM process_stages ps 
            JOIN stage_operation_schedules sos ON ps.id = sos.stage_id 
            WHERE ps.template_id = template_id
        ) - 1 DAY)
    ) STORED COMMENT '计划结束日期（自动计算）',
    
    -- 工期信息（动态计算）
    template_duration_days INT GENERATED ALWAYS AS (
        (SELECT (MAX(ps.start_day + sos.operation_day) - MIN(ps.start_day + sos.operation_day)) + 1
         FROM process_stages ps 
         JOIN stage_operation_schedules sos ON ps.id = sos.stage_id 
         WHERE ps.template_id = template_id)
    ) STORED COMMENT '模版标准工期（天，自动计算）',
    
    -- 纯计划状态
    plan_status ENUM('DRAFT', 'PLANNED', 'APPROVED', 'CANCELLED') DEFAULT 'DRAFT' COMMENT '计划状态',
    
    -- 描述信息
    description TEXT COMMENT '批次描述',
    notes TEXT COMMENT '备注信息',
    
    -- 时间戳
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (template_id) REFERENCES process_templates(id),
    
    INDEX idx_batch_code (batch_code),
    INDEX idx_template_id (template_id),
    INDEX idx_project_code (project_code),
    INDEX idx_planned_start_date (planned_start_date),
    INDEX idx_plan_status (plan_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产批次计划表';
```

#### 2. 批次操作计划表 (batch_operation_plans)

```sql
CREATE TABLE batch_operation_plans (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '操作计划ID',
    batch_plan_id INT NOT NULL COMMENT '批次计划ID',
    template_schedule_id INT NOT NULL COMMENT '模版操作安排ID',
    operation_id INT NOT NULL COMMENT '操作ID',
    
    -- 纯计划时间
    planned_start_datetime DATETIME NOT NULL COMMENT '计划开始时间',
    planned_end_datetime DATETIME NOT NULL COMMENT '计划结束时间',
    planned_duration DECIMAL(5,2) NOT NULL COMMENT '计划持续时间(小时)',
    
    -- 资源计划
    required_people INT NOT NULL COMMENT '计划需要人数',
    
    -- 计划备注
    notes TEXT COMMENT '计划备注',
    
    -- 创建时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (batch_plan_id) REFERENCES production_batch_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (template_schedule_id) REFERENCES stage_operation_schedules(id),
    FOREIGN KEY (operation_id) REFERENCES operations(id),
    
    INDEX idx_batch_plan_id (batch_plan_id),
    INDEX idx_planned_start_datetime (planned_start_datetime),
    INDEX idx_operation_id (operation_id),
    UNIQUE KEY uk_batch_template_schedule (batch_plan_id, template_schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批次操作计划表';
```

#### 3. 批次人员安排表 (batch_personnel_assignments)

```sql
CREATE TABLE batch_personnel_assignments (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '人员安排ID',
    batch_operation_plan_id INT NOT NULL COMMENT '批次操作计划ID',
    employee_id INT NOT NULL COMMENT '员工ID',
    
    -- 计划角色
    role ENUM('OPERATOR', 'SUPERVISOR', 'QC_INSPECTOR', 'ASSISTANT') DEFAULT 'OPERATOR' COMMENT '计划操作角色',
    is_primary BOOLEAN DEFAULT FALSE COMMENT '是否主要负责人',
    
    -- 资质匹配信息
    qualification_level INT COMMENT '员工相关资质等级',
    qualification_match_score DECIMAL(3,1) COMMENT '资质匹配度评分(0-10)',
    
    -- 安排状态
    assignment_status ENUM('PLANNED', 'CONFIRMED', 'CANCELLED') DEFAULT 'PLANNED' COMMENT '安排状态',
    
    -- 安排时间和备注
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP NULL COMMENT '确认时间',
    notes TEXT COMMENT '安排备注',
    
    FOREIGN KEY (batch_operation_plan_id) REFERENCES batch_operation_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    
    INDEX idx_batch_operation_plan_id (batch_operation_plan_id),
    INDEX idx_employee_id (employee_id),
    INDEX idx_assignment_status (assignment_status),
    UNIQUE KEY uk_batch_operation_employee (batch_operation_plan_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='批次人员安排表';
```

## 🔗 数据链路关系

```
工艺模版 (process_templates) 
    ↓
工艺阶段 (process_stages)
    ↓  
阶段操作安排 (stage_operation_schedules) → 操作库 (operations)
    ↓                                         ↓
批次计划 (production_batch_plans)             操作资质要求 (operation_qualification_requirements)
    ↓                                         ↓
批次操作计划 (batch_operation_plans)          → 资质库 (qualifications)
    ↓                                         ↓
批次人员安排 (batch_personnel_assignments)    → 人员资质 (employee_qualifications)
```

## ⚙️ 自动化计算逻辑

### 1. 模版工期计算函数

```sql
-- 创建函数：计算工艺模版的标准工期
DELIMITER //
CREATE FUNCTION calculate_template_duration(template_id INT) 
RETURNS INT
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE min_day INT DEFAULT 0;
    DECLARE max_day INT DEFAULT 0;
    DECLARE template_total_days INT DEFAULT 0;
    
    -- 方法1：从process_templates.total_days获取（如果已设置）
    SELECT total_days INTO template_total_days 
    FROM process_templates 
    WHERE id = template_id;
    
    -- 方法2：如果total_days为空，则动态计算工期
    IF template_total_days IS NULL OR template_total_days = 0 THEN
        SELECT 
            MIN(ps.start_day + sos.operation_day),
            MAX(ps.start_day + sos.operation_day)
        INTO min_day, max_day
        FROM process_stages ps
        JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
        WHERE ps.template_id = template_id;
        
        -- 工期 = 最晚天 - 最早天 + 1
        SET template_total_days = IFNULL((max_day - min_day + 1), 1);
    END IF;
    
    RETURN template_total_days;
END //
DELIMITER ;
```

### 2. 批次计划时间计算视图

```sql
-- 批次操作计划时间计算视图
CREATE VIEW batch_operation_timeline AS
SELECT 
    pbp.id AS batch_plan_id,
    pbp.batch_code,
    pbp.planned_start_date,
    pbp.planned_end_date,
    
    -- 模版信息
    pt.template_name,
    ps.stage_name,
    ps.start_day AS template_stage_start_day,
    sos.operation_day AS template_operation_day,
    sos.recommended_time AS template_recommended_hour,
    
    -- 操作信息
    o.operation_name,
    o.standard_time AS operation_duration_minutes,
    o.required_people,
    
    -- 计算计划时间（需要减去模版的最早开始天作为偏移）
    DATE_ADD(pbp.planned_start_date, INTERVAL (
        ps.start_day + sos.operation_day - (
            SELECT MIN(ps2.start_day + sos2.operation_day)
            FROM process_stages ps2
            JOIN stage_operation_schedules sos2 ON ps2.id = sos2.stage_id
            WHERE ps2.template_id = pbp.template_id
        )
    ) DAY) AS planned_operation_date,
    ADDTIME(
        DATE_ADD(pbp.planned_start_date, INTERVAL (ps.start_day + sos.operation_day) DAY),
        SEC_TO_TIME(sos.recommended_time * 3600)
    ) AS planned_start_datetime,
    ADDTIME(
        DATE_ADD(pbp.planned_start_date, INTERVAL (ps.start_day + sos.operation_day) DAY),
        SEC_TO_TIME((sos.recommended_time * 3600) + (o.standard_time * 60))
    ) AS planned_end_datetime,
    
    -- 资质需求信息
    GROUP_CONCAT(
        CONCAT(q.qualification_name, '(>=', oqr.required_level, '级×', oqr.required_count, '人)')
    ) AS qualification_requirements

FROM production_batch_plans pbp
JOIN process_templates pt ON pbp.template_id = pt.id
JOIN process_stages ps ON pt.id = ps.template_id
JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
JOIN operations o ON sos.operation_id = o.id
LEFT JOIN operation_qualification_requirements oqr ON o.id = oqr.operation_id
LEFT JOIN qualifications q ON oqr.qualification_id = q.id

GROUP BY pbp.id, sos.id
ORDER BY pbp.id, ps.start_day + sos.operation_day, sos.recommended_time;
```

## 🚀 批次计划创建流程

### 1. 简化的用户输入

```sql
-- 用户只需要输入：批次基本信息 + 开始日期
INSERT INTO production_batch_plans (
    batch_code, 
    batch_name, 
    template_id, 
    planned_start_date,  -- 只输入开始日期
    plan_status, 
    created_by
) VALUES (
    'BATCH-2024-001', 
    '产品A生产批次', 
    1,                   -- 工艺模版ID
    '2024-01-15',        -- 开始日期
    'DRAFT', 
    101
);

-- planned_end_date 将自动计算为：2024-01-15 + 模版工期
```

### 2. 自动生成操作计划

```sql
-- 自动生成批次操作计划
INSERT INTO batch_operation_plans (
    batch_plan_id, template_schedule_id, operation_id,
    planned_start_datetime, planned_end_datetime, planned_duration,
    required_people
)
SELECT 
    @batch_plan_id,
    sos.id,
    sos.operation_id,
    -- 时间计算基于批次开始日期
    ADDTIME(
        DATE_ADD(@batch_start_date, INTERVAL (ps.start_day + sos.operation_day) DAY),
        SEC_TO_TIME(sos.recommended_time * 3600)
    ),
    ADDTIME(
        DATE_ADD(@batch_start_date, INTERVAL (ps.start_day + sos.operation_day) DAY),
        SEC_TO_TIME((sos.recommended_time * 3600) + (o.standard_time * 60))
    ),
    (o.standard_time / 60.0),
    o.required_people
FROM stage_operation_schedules sos
JOIN process_stages ps ON sos.stage_id = ps.id
JOIN operations o ON sos.operation_id = o.id
WHERE ps.template_id = @template_id;
```

## 🤖 智能人员安排

### 资质匹配算法

```sql
-- 基于资质匹配的人员推荐查询
SELECT 
    e.id AS employee_id,
    e.employee_name,
    e.employee_code,
    eq.qualification_level,
    
    -- 资质匹配度计算
    CASE 
        WHEN eq.qualification_level >= oqr.required_level THEN 
            (eq.qualification_level - oqr.required_level + 5) * 2
        ELSE 
            0
    END AS match_score,
    
    -- 当前计划工作负荷检查
    COUNT(current_assignments.id) AS current_planned_workload

FROM employees e
JOIN employee_qualifications eq ON e.id = eq.employee_id
JOIN operation_qualification_requirements oqr ON eq.qualification_id = oqr.qualification_id
LEFT JOIN batch_personnel_assignments current_assignments ON e.id = current_assignments.employee_id
    AND current_assignments.assignment_status IN ('PLANNED', 'CONFIRMED')

WHERE oqr.operation_id = @operation_id
    AND eq.qualification_level >= oqr.required_level
    
GROUP BY e.id, eq.qualification_level, oqr.required_level
HAVING match_score > 0
ORDER BY match_score DESC, current_planned_workload ASC
LIMIT @required_people_count;
```

## 📊 核心查询和视图

### 1. 批次完整计划查询

```sql
-- 获取批次完整计划
SELECT 
    pbp.batch_code,
    pbp.batch_name,
    pbp.planned_start_date,
    pbp.planned_end_date,
    DATE(bop.planned_start_datetime) AS operation_date,
    TIME(bop.planned_start_datetime) AS start_time,
    TIME(bop.planned_end_datetime) AS end_time,
    o.operation_name,
    o.standard_time AS duration_minutes,
    o.required_people,
    pbp.plan_status,
    
    -- 关联的资质要求
    GROUP_CONCAT(
        CONCAT(q.qualification_name, '(≥', oqr.required_level, '级)')
    ) AS required_qualifications,
    
    -- 已安排的人员
    GROUP_CONCAT(
        CONCAT(e.employee_name, '(', e.employee_code, ')')
    ) AS assigned_personnel

FROM production_batch_plans pbp
JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
JOIN operations o ON bop.operation_id = o.id
LEFT JOIN operation_qualification_requirements oqr ON o.id = oqr.operation_id
LEFT JOIN qualifications q ON oqr.qualification_id = q.id
LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id
LEFT JOIN employees e ON bpa.employee_id = e.id

WHERE pbp.batch_code = 'BATCH-2024-001'
GROUP BY bop.id
ORDER BY bop.planned_start_datetime;
```

### 2. 批次计划概览视图

```sql
CREATE VIEW batch_plan_overview AS
SELECT 
    pbp.id AS batch_plan_id,
    pbp.batch_code,
    pbp.batch_name,
    pt.template_name,
    
    -- 计划信息
    pbp.planned_start_date,
    pbp.planned_end_date,
    pbp.template_duration_days,
    
    -- 计划状态
    pbp.plan_status,
    
    -- 统计信息
    COUNT(DISTINCT bop.id) AS total_operations,
    COUNT(DISTINCT bpa.employee_id) AS assigned_personnel_count,
    
    -- 人员安排完成度
    ROUND(
        COUNT(DISTINCT bpa.employee_id) / SUM(DISTINCT bop.required_people) * 100, 2
    ) AS assignment_completion_percentage

FROM production_batch_plans pbp
JOIN process_templates pt ON pbp.template_id = pt.id
LEFT JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id
    AND bpa.assignment_status IN ('PLANNED', 'CONFIRMED')

GROUP BY pbp.id, pbp.batch_code, pbp.batch_name, pt.template_name,
         pbp.planned_start_date, pbp.planned_end_date, pbp.template_duration_days, pbp.plan_status;
```

## 🎯 核心特性总结

### ✅ 实现的功能
1. **自动工期计算** - 用户只需输入开始日期，结束日期自动计算
2. **智能时间排程** - 基于模版自动生成每个操作的具体计划时间
3. **资质驱动分配** - 根据操作要求自动匹配合适人员
4. **完整计划链路** - 从模版到详细计划的完整生成
5. **无优先级设计** - 所有任务同等重要，简化管理
6. **纯计划系统** - 专注于计划生成，完全不涉及执行跟踪

### 📈 业务价值
1. **操作简化** - 大幅减少手动计算和输入
2. **数据一致性** - 自动化确保时间计算准确
3. **资源优化** - 智能人员安排提高效率
4. **计划标准化** - 统一的计划生成流程
5. **可扩展性** - 支持未来功能扩展

## 🔧 实施计划

### 阶段1：数据库设计实施
- [ ] 创建批次计划相关表结构
- [ ] 实现工期自动计算函数
- [ ] 创建必要的视图

### 阶段2：后端API开发
- [ ] 批次计划CRUD操作接口
- [ ] 批次计划生成算法实现
- [ ] 人员安排推荐算法

### 阶段3：前端界面开发
- [ ] 批次计划管理界面
- [ ] 批次计划展示界面
- [ ] 人员安排管理界面

### 阶段4：测试和优化
- [ ] 功能测试
- [ ] 性能优化
- [ ] 用户体验优化

---

**文档版本:** v2.0  
**创建日期:** 2024-09-19  
**最后更新:** 2024-09-19  
**设计负责人:** APS开发团队

**重要说明:** 本系统为纯粹的生产计划安排系统，专注于将工艺模版转化为详细的执行计划，不涉及任何执行跟踪功能。