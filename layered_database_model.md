# APS系统完整数据库设计（含操作约束条件）

## 1. 概述

### 1.1 项目简介
本文档描述了APS系统的完整分层数据库模型设计，包含人员库、操作库、工艺模版库和操作约束管理，基于MySQL实现。

### 1.2 时间轴说明
- **工艺模版时间轴**：以day0为原点，day0=第1天，day1=第2天，以此类推
- **阶段开始时间**：相对于工艺模版的day0开始计算
- **操作执行时间**：相对于阶段开始时间计算
- **操作绝对天数** = 阶段开始天数 + 操作相对天数

### 1.3 分层架构
```
┌─────────────────────────────┐
│      应用层 (Application)     │  
├─────────────────────────────┤
│      业务层 (Business)        │
├─────────────────────────────┤
│      数据层 (Data)            │
└─────────────────────────────┘
```

## 2. 数据层：核心表设计

### 2.1 人员基础信息表 (employees)

```sql
CREATE TABLE employees (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    employee_code VARCHAR(20) NOT NULL UNIQUE COMMENT '工号',
    employee_name VARCHAR(50) NOT NULL COMMENT '姓名',
    department VARCHAR(50) COMMENT '部门',
    position VARCHAR(50) COMMENT '岗位',
    
    INDEX idx_employee_code (employee_code),
    INDEX idx_employee_name (employee_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人员基础信息表';
```

### 2.2 资质信息表 (qualifications)

```sql
CREATE TABLE qualifications (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '资质ID',
    qualification_name VARCHAR(100) NOT NULL COMMENT '资质名称'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资质信息表';
```

### 2.3 人员资质表 (employee_qualifications)

```sql
CREATE TABLE employee_qualifications (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    employee_id INT NOT NULL COMMENT '人员ID',
    qualification_id INT NOT NULL COMMENT '资质ID',
    qualification_level TINYINT NOT NULL COMMENT '资质等级（1-5级）',
    
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (qualification_id) REFERENCES qualifications(id),
    INDEX idx_employee_id (employee_id),
    INDEX idx_qualification_id (qualification_id),
    INDEX idx_qualification_level (qualification_level),
    UNIQUE KEY uk_emp_qual (employee_id, qualification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人员资质表';
```

### 2.4 操作信息表 (operations)

```sql
CREATE TABLE operations (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '操作ID',
    operation_code VARCHAR(20) NOT NULL UNIQUE COMMENT '操作编码',
    operation_name VARCHAR(100) NOT NULL COMMENT '操作名称',
    standard_time DECIMAL(8,2) NOT NULL COMMENT '标准耗时（分钟）',
    required_people INT DEFAULT 1 COMMENT '所需人数',
    description TEXT COMMENT '操作描述',
    
    INDEX idx_operation_code (operation_code),
    INDEX idx_operation_name (operation_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作信息表';
```

### 2.5 操作资质要求表 (operation_qualification_requirements)

```sql
CREATE TABLE operation_qualification_requirements (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    operation_id INT NOT NULL COMMENT '操作ID',
    qualification_id INT NOT NULL COMMENT '资质ID',
    required_level TINYINT NOT NULL COMMENT '要求等级（1-5级）',
    required_count INT DEFAULT 1 COMMENT '该等级要求人数',
    is_mandatory TINYINT DEFAULT 1 COMMENT '是否必须：1-必须，0-可选',
    
    FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE,
    FOREIGN KEY (qualification_id) REFERENCES qualifications(id),
    INDEX idx_operation_id (operation_id),
    INDEX idx_qualification_id (qualification_id),
    INDEX idx_required_level (required_level),
    INDEX idx_required_count (required_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作资质要求表';
```

### 2.6 工艺模版表 (process_templates)

```sql
CREATE TABLE process_templates (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '模版ID',
    template_code VARCHAR(20) NOT NULL UNIQUE COMMENT '模版编码',
    template_name VARCHAR(100) NOT NULL COMMENT '模版名称',
    description TEXT COMMENT '模版描述',
    total_days INT COMMENT '总工期（天）',
    
    INDEX idx_template_code (template_code),
    INDEX idx_template_name (template_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工艺模版表';
```

### 2.7 工艺阶段表 (process_stages)

```sql
CREATE TABLE process_stages (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '阶段ID',
    template_id INT NOT NULL COMMENT '模版ID',
    stage_code VARCHAR(20) NOT NULL COMMENT '阶段编码',
    stage_name VARCHAR(100) NOT NULL COMMENT '阶段名称',
    stage_order INT NOT NULL COMMENT '在模版中的顺序',
    start_day INT NOT NULL COMMENT '开始天数（从day0开始，day0=第1天）',
    description TEXT COMMENT '阶段描述',
    
    FOREIGN KEY (template_id) REFERENCES process_templates(id) ON DELETE CASCADE,
    INDEX idx_template_id (template_id),
    INDEX idx_stage_order (stage_order),
    INDEX idx_start_day (start_day),
    UNIQUE KEY uk_template_stage_order (template_id, stage_order),
    UNIQUE KEY uk_template_stage_code (template_id, stage_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工艺阶段表';
```

### 2.8 阶段操作安排表 (stage_operation_schedules)

```sql
CREATE TABLE stage_operation_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '安排ID',
    stage_id INT NOT NULL COMMENT '阶段ID',
    operation_id INT NOT NULL COMMENT '操作ID',
    operation_day INT NOT NULL COMMENT '操作相对天数（相对阶段开始的第几天，day0=阶段第1天）',
    recommended_time DECIMAL(3,1) NOT NULL COMMENT '推荐开始时间（小时，0.5粒度）',
    window_start_time DECIMAL(3,1) NOT NULL COMMENT '窗口开始时间（小时，0.5粒度）',
    window_end_time DECIMAL(3,1) NOT NULL COMMENT '窗口结束时间（小时，0.5粒度）',
    operation_order INT COMMENT '操作在阶段中的顺序',
    
    FOREIGN KEY (stage_id) REFERENCES process_stages(id) ON DELETE CASCADE,
    FOREIGN KEY (operation_id) REFERENCES operations(id),
    INDEX idx_stage_id (stage_id),
    INDEX idx_operation_id (operation_id),
    INDEX idx_operation_day (operation_day),
    INDEX idx_recommended_time (recommended_time),
    INDEX idx_operation_order (operation_order),
    UNIQUE KEY uk_stage_operation_order (stage_id, operation_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='阶段操作安排表';
```

### 2.9 操作约束条件表 (operation_constraints)

```sql
CREATE TABLE operation_constraints (
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT '约束ID',
    schedule_id INT NOT NULL COMMENT '当前操作安排ID',
    predecessor_schedule_id INT NOT NULL COMMENT '前置操作安排ID',
    constraint_type TINYINT DEFAULT 1 COMMENT '约束类型：1-完成后开始(FS)，2-开始后开始(SS)，3-完成后完成(FF)，4-开始后完成(SF)',
    time_lag DECIMAL(4,1) DEFAULT 0 COMMENT '时间滞后（小时，可为负数）',
    constraint_level TINYINT DEFAULT 1 COMMENT '约束级别：1-强制，2-优选，3-建议',
    description TEXT COMMENT '约束说明',
    
    FOREIGN KEY (schedule_id) REFERENCES stage_operation_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (predecessor_schedule_id) REFERENCES stage_operation_schedules(id) ON DELETE CASCADE,
    INDEX idx_schedule_id (schedule_id),
    INDEX idx_predecessor_schedule_id (predecessor_schedule_id),
    INDEX idx_constraint_type (constraint_type),
    INDEX idx_constraint_level (constraint_level),
    UNIQUE KEY uk_schedule_predecessor (schedule_id, predecessor_schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作约束条件表';
```

## 3. 业务层：常用查询

### 3.1 查询人员完整信息
```sql
SELECT 
    e.employee_code AS '工号',
    e.employee_name AS '姓名',
    e.department AS '部门',
    GROUP_CONCAT(DISTINCT CONCAT(q.qualification_name, '(', eq.qualification_level, '级)')) AS '资质'
FROM employees e
LEFT JOIN employee_qualifications eq ON e.id = eq.employee_id
LEFT JOIN qualifications q ON eq.qualification_id = q.id
GROUP BY e.id, e.employee_code, e.employee_name, e.department;
```

### 3.2 查询操作及其资质要求
```sql
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
```

### 3.3 查询工艺模版完整结构
```sql
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
```

### 3.4 查询特定模版的绝对时间线
```sql
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
WHERE pt.template_code = 'PT001'
ORDER BY (ps.start_day + sos.operation_day), sos.recommended_time;
```

### 3.5 查询阶段操作安排及其资质需求
```sql
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
WHERE pt.template_code = 'PT001'
GROUP BY pt.template_name, ps.stage_name, ps.start_day, sos.operation_day, 
         o.operation_name, o.standard_time, sos.recommended_time, 
         sos.window_start_time, sos.window_end_time
ORDER BY (ps.start_day + sos.operation_day), sos.recommended_time;
```

### 3.6 查询操作约束关系
```sql
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
WHERE pt.template_code = 'PT001'
ORDER BY (ps1.start_day + sos1.operation_day), sos1.recommended_time;
```

### 3.7 约束冲突检查查询
```sql
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
WHERE oc.constraint_type = 1
ORDER BY ps1.start_day + sos1.operation_day;
```

## 4. 系统配置

### 4.1 数据库连接配置
```properties
spring.datasource.url=jdbc:mysql://localhost:3306/aps_system?useUnicode=true&characterEncoding=utf8mb4
spring.datasource.username=aps_user
spring.datasource.password=aps_password
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
```

## 5. 约束类型说明

### 5.1 操作约束类型
- **FS (Finish-to-Start)**: 前置操作完成后，当前操作才能开始
- **SS (Start-to-Start)**: 前置操作开始后，当前操作才能开始  
- **FF (Finish-to-Finish)**: 前置操作完成后，当前操作才能完成
- **SF (Start-to-Finish)**: 前置操作开始后，当前操作才能完成

### 5.2 约束级别
- **强制约束**: 必须严格遵守，违反会导致工艺失败
- **优选约束**: 优先考虑，可在资源冲突时调整
- **建议约束**: 参考性约束，可根据实际情况灵活处理

### 5.3 时间滞后
- **正数**: 前置操作结束后需等待指定时间
- **零**: 前置操作结束后立即开始
- **负数**: 前置操作结束前指定时间可以开始（重叠执行）

---

**版本：** v2.3  
**创建日期：** 2025-09-14  
**包含模块：** 人员库、操作库、工艺模版库、约束管理