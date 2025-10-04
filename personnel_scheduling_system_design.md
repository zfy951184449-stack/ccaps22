# 人员排班体系设计文档

## 1. 系统概述

### 1.1 设计目标
建立一套完整的人员排班管理体系，支持：
- 班次类型定义和管理
- 人员排班计划制定
- 排班冲突检测和优化
- 排班历史记录和统计
- 与现有APS系统的集成

### 1.2 核心功能
- **班次管理**：定义不同类型的班次（白班、夜班、中班等）
- **排班计划**：为员工安排具体的工作班次
- **冲突检测**：自动检测排班冲突和违规情况
- **统计分析**：提供排班统计和报表功能
- **集成接口**：与工艺模板和操作需求集成

## 2. 数据库设计

### 2.1 班次类型表 (shift_types)

```sql
CREATE TABLE shift_types (
    id INT PRIMARY KEY AUTO_INCREMENT,
    shift_code VARCHAR(20) NOT NULL UNIQUE COMMENT '班次代码',
    shift_name VARCHAR(50) NOT NULL COMMENT '班次名称',
    start_time TIME NOT NULL COMMENT '开始时间',
    end_time TIME NOT NULL COMMENT '结束时间',
    work_hours DECIMAL(4,2) NOT NULL COMMENT '标准工时(小时)',
    is_night_shift BOOLEAN DEFAULT FALSE COMMENT '是否夜班',
    is_weekend_shift BOOLEAN DEFAULT FALSE COMMENT '是否周末班',
    overtime_rate DECIMAL(3,2) DEFAULT 1.0 COMMENT '加班费率',
    description TEXT COMMENT '班次描述',
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**示例数据：**
```sql
INSERT INTO shift_types (shift_code, shift_name, start_time, end_time, work_hours, is_night_shift, overtime_rate, description) VALUES
('DAY_SHIFT', '常日班', '08:30:00', '17:00:00', 8.00, FALSE, 1.0, '常日班，8:30-17:00，标准工时8小时'),
('LONG_DAY_SHIFT', '长白班', '08:30:00', '21:00:00', 11.00, FALSE, 1.2, '长白班，8:30-21:00，标准工时11小时'),
('NIGHT_SHIFT', '夜班', '20:30:00', '09:00:00', 11.00, TRUE, 1.5, '夜班，20:30-次日9:00，跨天班次，标准工时11小时');
```

### 2.2 人员排班表 (personnel_schedules)

```sql
CREATE TABLE personnel_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL COMMENT '员工ID',
    schedule_date DATE NOT NULL COMMENT '排班日期',
    shift_type_id INT NOT NULL COMMENT '班次类型ID',
    actual_start_time DATETIME COMMENT '实际开始时间',
    actual_end_time DATETIME COMMENT '实际结束时间',
    actual_work_hours DECIMAL(4,2) COMMENT '实际工时(小时)',
    status ENUM('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') DEFAULT 'SCHEDULED' COMMENT '排班状态',
    is_overtime BOOLEAN DEFAULT FALSE COMMENT '是否加班',
    overtime_hours DECIMAL(4,2) DEFAULT 0 COMMENT '加班时长',
    notes TEXT COMMENT '备注信息',
    created_by INT COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_type_id) REFERENCES shift_types(id),
    FOREIGN KEY (created_by) REFERENCES employees(id),
    
    UNIQUE KEY unique_employee_date (employee_id, schedule_date),
    INDEX idx_schedule_date (schedule_date),
    INDEX idx_employee_id (employee_id),
    INDEX idx_shift_type_id (shift_type_id)
);
```

### 2.3 排班规则表 (scheduling_rules)

```sql
CREATE TABLE scheduling_rules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
    rule_type ENUM('MIN_REST_HOURS', 'MAX_CONSECUTIVE_DAYS', 'WEEKEND_REST', 'NIGHT_SHIFT_LIMIT', 'LONG_DAY_SHIFT_LIMIT', 'CROSS_DAY_SHIFT_LIMIT', 'DAILY_HOURS_LIMIT', 'OVERTIME_LIMIT') NOT NULL COMMENT '规则类型',
    rule_value DECIMAL(8,2) NOT NULL COMMENT '规则值',
    rule_unit VARCHAR(20) COMMENT '规则单位',
    description TEXT COMMENT '规则描述',
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**示例规则：**
```sql
INSERT INTO scheduling_rules (rule_name, rule_type, rule_value, rule_unit, description) VALUES
('最小休息时间', 'MIN_REST_HOURS', 12.00, 'hours', '两个班次之间最小休息时间'),
('最大连续工作天数', 'MAX_CONSECUTIVE_DAYS', 6.00, 'days', '最大连续工作天数不超过6天'),
('夜班限制', 'NIGHT_SHIFT_LIMIT', 1.00, 'days', '连续夜班不超过1天'),
('跨天班次限制', 'CROSS_DAY_SHIFT_LIMIT', 2.00, 'days', '连续跨天班次不超过2天'),
('每日工时限制', 'DAILY_HOURS_LIMIT', 11.00, 'hours', '每天总工时（排班+加班）不超过11小时'),
('加班限制', 'OVERTIME_LIMIT', 36.00, 'hours', '每月加班不超过36小时'),
('季度标准工时', 'QUARTERLY_STANDARD_HOURS', 0.00, 'hours', '每季度标准工时不少于国家规定工作日*8小时'),
('夜班后休息', 'NIGHT_SHIFT_REST', 1.00, 'days', '夜班后最低休息1天');
```

### 2.4 排班冲突记录表 (scheduling_conflicts)

```sql
CREATE TABLE scheduling_conflicts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    conflict_type ENUM('RULE_VIOLATION', 'DOUBLE_BOOKING', 'INSUFFICIENT_REST', 'OVERTIME_EXCEEDED', 'DAILY_HOURS_EXCEEDED', 'CONSECUTIVE_DAYS_EXCEEDED', 'NIGHT_SHIFT_REST_VIOLATION', 'QUARTERLY_HOURS_INSUFFICIENT', 'CROSS_DAY_CONFLICT') NOT NULL COMMENT '冲突类型',
    employee_id INT NOT NULL COMMENT '员工ID',
    schedule_id INT COMMENT '排班ID',
    conflict_date DATE NOT NULL COMMENT '冲突日期',
    conflict_description TEXT NOT NULL COMMENT '冲突描述',
    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM' COMMENT '严重程度',
    is_resolved BOOLEAN DEFAULT FALSE COMMENT '是否已解决',
    resolved_by INT COMMENT '解决人ID',
    resolved_at TIMESTAMP NULL COMMENT '解决时间',
    resolution_notes TEXT COMMENT '解决方案备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (schedule_id) REFERENCES personnel_schedules(id),
    FOREIGN KEY (resolved_by) REFERENCES employees(id),
    
    INDEX idx_conflict_date (conflict_date),
    INDEX idx_employee_id (employee_id),
    INDEX idx_severity (severity)
);
```

### 2.6 法定节假日配置表 (national_holidays)

```sql
CREATE TABLE national_holidays (
    id INT PRIMARY KEY AUTO_INCREMENT,
    year INT NOT NULL COMMENT '年份',
    holiday_name VARCHAR(100) NOT NULL COMMENT '节假日名称',
    holiday_date DATE NOT NULL COMMENT '节假日日期',
    holiday_type ENUM('LEGAL_HOLIDAY', 'WEEKEND_ADJUSTMENT', 'MAKEUP_WORK') NOT NULL COMMENT '节假日类型',
    is_working_day BOOLEAN DEFAULT FALSE COMMENT '是否为工作日',
    description TEXT COMMENT '说明',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_year_date (year, holiday_date),
    INDEX idx_year (year),
    INDEX idx_holiday_type (holiday_type)
);
```

**示例数据：**
```sql
INSERT INTO national_holidays (year, holiday_name, holiday_date, holiday_type, is_working_day, description) VALUES
-- 2024年法定节假日
(2024, '元旦', '2024-01-01', 'LEGAL_HOLIDAY', FALSE, '元旦节'),
(2024, '春节', '2024-02-10', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-11', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-12', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-13', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-14', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-15', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-16', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '春节', '2024-02-17', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2024, '清明节', '2024-04-04', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2024, '清明节', '2024-04-05', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2024, '清明节', '2024-04-06', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2024, '劳动节', '2024-05-01', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2024, '劳动节', '2024-05-02', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2024, '劳动节', '2024-05-03', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2024, '端午节', '2024-06-10', 'LEGAL_HOLIDAY', FALSE, '端午节'),
(2024, '中秋节', '2024-09-15', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2024, '中秋节', '2024-09-16', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2024, '中秋节', '2024-09-17', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2024, '国庆节', '2024-10-01', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-02', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-03', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-04', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-05', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-06', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2024, '国庆节', '2024-10-07', 'LEGAL_HOLIDAY', FALSE, '国庆节'),

-- 2024年调休工作日
(2024, '春节调休', '2024-02-04', 'WEEKEND_ADJUSTMENT', TRUE, '春节调休工作日'),
(2024, '春节调休', '2024-02-18', 'WEEKEND_ADJUSTMENT', TRUE, '春节调休工作日'),
(2024, '清明节调休', '2024-04-07', 'WEEKEND_ADJUSTMENT', TRUE, '清明节调休工作日'),
(2024, '劳动节调休', '2024-04-28', 'WEEKEND_ADJUSTMENT', TRUE, '劳动节调休工作日'),
(2024, '劳动节调休', '2024-05-11', 'WEEKEND_ADJUSTMENT', TRUE, '劳动节调休工作日'),
(2024, '国庆节调休', '2024-09-29', 'WEEKEND_ADJUSTMENT', TRUE, '国庆节调休工作日'),
(2024, '国庆节调休', '2024-10-12', 'WEEKEND_ADJUSTMENT', TRUE, '国庆节调休工作日'),

-- 2025年法定节假日
(2025, '元旦', '2025-01-01', 'LEGAL_HOLIDAY', FALSE, '元旦节'),
(2025, '春节', '2025-01-28', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-01-29', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-01-30', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-01-31', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-02-01', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-02-02', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '春节', '2025-02-03', 'LEGAL_HOLIDAY', FALSE, '春节假期'),
(2025, '清明节', '2025-04-05', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2025, '清明节', '2025-04-06', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2025, '清明节', '2025-04-07', 'LEGAL_HOLIDAY', FALSE, '清明节'),
(2025, '劳动节', '2025-05-01', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2025, '劳动节', '2025-05-02', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2025, '劳动节', '2025-05-03', 'LEGAL_HOLIDAY', FALSE, '劳动节'),
(2025, '端午节', '2025-05-31', 'LEGAL_HOLIDAY', FALSE, '端午节'),
(2025, '中秋节', '2025-10-06', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2025, '中秋节', '2025-10-07', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2025, '中秋节', '2025-10-08', 'LEGAL_HOLIDAY', FALSE, '中秋节'),
(2025, '国庆节', '2025-10-01', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2025, '国庆节', '2025-10-02', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2025, '国庆节', '2025-10-03', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2025, '国庆节', '2025-10-04', 'LEGAL_HOLIDAY', FALSE, '国庆节'),
(2025, '国庆节', '2025-10-05', 'LEGAL_HOLIDAY', FALSE, '国庆节'),

-- 2025年调休工作日
(2025, '春节调休', '2025-01-26', 'WEEKEND_ADJUSTMENT', TRUE, '春节调休工作日'),
(2025, '春节调休', '2025-02-08', 'WEEKEND_ADJUSTMENT', TRUE, '春节调休工作日'),
(2025, '清明节调休', '2025-04-27', 'WEEKEND_ADJUSTMENT', TRUE, '清明节调休工作日'),
(2025, '劳动节调休', '2025-04-27', 'WEEKEND_ADJUSTMENT', TRUE, '劳动节调休工作日'),
(2025, '劳动节调休', '2025-05-04', 'WEEKEND_ADJUSTMENT', TRUE, '劳动节调休工作日'),
(2025, '国庆节调休', '2025-09-28', 'WEEKEND_ADJUSTMENT', TRUE, '国庆节调休工作日'),
(2025, '国庆节调休', '2025-10-11', 'WEEKEND_ADJUSTMENT', TRUE, '国庆节调休工作日');
```

### 2.7 季度标准工时配置表 (quarterly_standard_hours)

```sql
CREATE TABLE quarterly_standard_hours (
    id INT PRIMARY KEY AUTO_INCREMENT,
    year INT NOT NULL COMMENT '年份',
    quarter INT NOT NULL COMMENT '季度(1-4)',
    total_days INT NOT NULL COMMENT '该季度总天数',
    weekend_days INT NOT NULL COMMENT '周末天数',
    legal_holiday_days INT NOT NULL COMMENT '法定节假日天数',
    makeup_work_days INT NOT NULL COMMENT '调休工作日天数',
    actual_working_days INT NOT NULL COMMENT '实际工作日数',
    standard_hours DECIMAL(5,2) NOT NULL COMMENT '标准工时(实际工作日*8小时)',
    calculation_details TEXT COMMENT '计算详情JSON',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_year_quarter (year, quarter),
    INDEX idx_year (year)
);
```

**示例数据：**
```sql
INSERT INTO quarterly_standard_hours (year, quarter, total_days, weekend_days, legal_holiday_days, makeup_work_days, actual_working_days, standard_hours, calculation_details) VALUES
-- 2024年数据
(2024, 1, 91, 26, 3, 2, 64, 512.00, '{"weekend_days": 26, "legal_holidays": 3, "makeup_work": 2, "calculation": "91-26-3+2=64"}'),
(2024, 2, 91, 26, 3, 2, 64, 512.00, '{"weekend_days": 26, "legal_holidays": 3, "makeup_work": 2, "calculation": "91-26-3+2=64"}'),
(2024, 3, 92, 26, 1, 1, 66, 528.00, '{"weekend_days": 26, "legal_holidays": 1, "makeup_work": 1, "calculation": "92-26-1+1=66"}'),
(2024, 4, 92, 26, 7, 2, 61, 488.00, '{"weekend_days": 26, "legal_holidays": 7, "makeup_work": 2, "calculation": "92-26-7+2=61"}'),

-- 2025年数据
(2025, 1, 90, 26, 8, 2, 58, 464.00, '{"weekend_days": 26, "legal_holidays": 8, "makeup_work": 2, "calculation": "90-26-8+2=58"}'),
(2025, 2, 90, 26, 3, 2, 63, 504.00, '{"weekend_days": 26, "legal_holidays": 3, "makeup_work": 2, "calculation": "90-26-3+2=63"}'),
(2025, 3, 92, 26, 1, 1, 66, 528.00, '{"weekend_days": 26, "legal_holidays": 1, "makeup_work": 1, "calculation": "92-26-1+1=66"}'),
(2025, 4, 92, 26, 5, 2, 63, 504.00, '{"weekend_days": 26, "legal_holidays": 5, "makeup_work": 2, "calculation": "92-26-5+2=63"}');
```

### 2.8 节假日自动更新机制

```sql
-- 节假日更新日志表
CREATE TABLE holiday_update_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    update_year INT NOT NULL COMMENT '更新年份',
    update_source VARCHAR(100) NOT NULL COMMENT '更新来源',
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
    records_count INT NOT NULL COMMENT '更新记录数',
    update_status ENUM('SUCCESS', 'FAILED', 'PARTIAL') DEFAULT 'SUCCESS' COMMENT '更新状态',
    error_message TEXT COMMENT '错误信息',
    
    INDEX idx_update_year (update_year),
    INDEX idx_update_time (update_time)
);
```

**节假日数据更新策略：**
1. **自动更新**：每年12月自动从国家法定节假日API获取下一年数据
2. **手动更新**：支持管理员手动导入节假日数据
3. **数据验证**：更新前验证数据完整性和准确性
4. **版本控制**：保留历史更新记录，支持回滚
5. **通知机制**：更新完成后通知相关人员

**API集成示例：**
```javascript
// 从国家法定节假日API获取数据
async function fetchHolidaysFromAPI(year) {
    try {
        const response = await fetch(`https://api.example.com/holidays/${year}`);
        const holidays = await response.json();
        
        // 批量插入数据库
        await batchInsertHolidays(year, holidays);
        
        // 重新计算季度标准工时
        await recalculateQuarterlyHours(year);
        
        return { success: true, count: holidays.length };
    } catch (error) {
        console.error('获取节假日数据失败:', error);
        return { success: false, error: error.message };
    }
}
```

### 2.10 员工排班历史记录表 (employee_schedule_history)

```sql
CREATE TABLE employee_schedule_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL COMMENT '员工ID',
    schedule_date DATE NOT NULL COMMENT '排班日期',
    shift_type_id INT NOT NULL COMMENT '班次类型ID',
    start_time TIME NOT NULL COMMENT '班次开始时间',
    end_time TIME NOT NULL COMMENT '班次结束时间',
    work_hours DECIMAL(4,2) NOT NULL COMMENT '工作时长(小时)',
    overtime_hours DECIMAL(4,2) DEFAULT 0.00 COMMENT '加班时长(小时)',
    status ENUM('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED') DEFAULT 'SCHEDULED' COMMENT '排班状态',
    notes TEXT COMMENT '备注信息',
    created_by INT COMMENT '创建人ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT COMMENT '更新人ID',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_type_id) REFERENCES shift_types(id),
    FOREIGN KEY (created_by) REFERENCES employees(id),
    FOREIGN KEY (updated_by) REFERENCES employees(id),
    
    UNIQUE KEY uk_employee_date (employee_id, schedule_date),
    INDEX idx_schedule_date (schedule_date),
    INDEX idx_employee_id (employee_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

**示例数据：**
```sql
INSERT INTO employee_schedule_history (employee_id, schedule_date, shift_type_id, start_time, end_time, work_hours, overtime_hours, status, notes, created_by) VALUES
-- 历史排班记录
(1, '2024-01-15', 1, '08:30:00', '17:00:00', 8.00, 0.00, 'COMPLETED', '正常排班', 1),
(1, '2024-01-16', 1, '08:30:00', '17:00:00', 8.00, 1.00, 'COMPLETED', '加班1小时', 1),
(1, '2024-01-17', 2, '20:30:00', '09:00:00', 11.00, 0.00, 'COMPLETED', '夜班', 1),
(1, '2024-01-18', 1, '08:30:00', '17:00:00', 8.00, 0.00, 'CANCELLED', '取消排班', 1),
(1, '2024-01-19', 1, '08:30:00', '17:00:00', 8.00, 0.00, 'COMPLETED', '正常排班', 1),

-- 未来排班记录
(1, '2025-01-15', 1, '08:30:00', '17:00:00', 8.00, 0.00, 'SCHEDULED', '计划排班', 1),
(1, '2025-01-16', 2, '20:30:00', '09:00:00', 11.00, 0.00, 'SCHEDULED', '夜班计划', 1),
(1, '2025-01-17', 3, '08:30:00', '21:00:00', 11.00, 0.00, 'SCHEDULED', '长白班计划', 1);
```

### 2.11 排班变更记录表 (schedule_change_log)

```sql
CREATE TABLE schedule_change_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    schedule_history_id INT NOT NULL COMMENT '排班历史记录ID',
    change_type ENUM('CREATE', 'UPDATE', 'CANCEL', 'RESCHEDULE', 'STATUS_CHANGE') NOT NULL COMMENT '变更类型',
    old_values JSON COMMENT '变更前的值',
    new_values JSON COMMENT '变更后的值',
    change_reason VARCHAR(500) COMMENT '变更原因',
    changed_by INT NOT NULL COMMENT '变更人ID',
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '变更时间',
    approval_status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING' COMMENT '审批状态',
    approved_by INT COMMENT '审批人ID',
    approved_at TIMESTAMP NULL COMMENT '审批时间',
    approval_notes TEXT COMMENT '审批备注',
    
    FOREIGN KEY (schedule_history_id) REFERENCES employee_schedule_history(id),
    FOREIGN KEY (changed_by) REFERENCES employees(id),
    FOREIGN KEY (approved_by) REFERENCES employees(id),
    
    INDEX idx_schedule_history_id (schedule_history_id),
    INDEX idx_change_type (change_type),
    INDEX idx_changed_by (changed_by),
    INDEX idx_changed_at (changed_at),
    INDEX idx_approval_status (approval_status)
);
```

**示例数据：**
```sql
INSERT INTO schedule_change_log (schedule_history_id, change_type, old_values, new_values, change_reason, changed_by, approval_status) VALUES
(1, 'UPDATE', '{"overtime_hours": 0.00}', '{"overtime_hours": 1.00}', '临时加班需求', 1, 'APPROVED'),
(2, 'CANCEL', '{"status": "SCHEDULED"}', '{"status": "CANCELLED"}', '员工请假', 1, 'APPROVED'),
(3, 'RESCHEDULE', '{"schedule_date": "2025-01-15", "shift_type_id": 1}', '{"schedule_date": "2025-01-16", "shift_type_id": 2}', '班次调整', 1, 'PENDING');
```

### 2.12 员工班次偏好表 (employee_shift_preferences)

```sql
CREATE TABLE employee_shift_preferences (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_id INT NOT NULL COMMENT '员工ID',
    shift_type_id INT NOT NULL COMMENT '班次类型ID',
    preference_score INT DEFAULT 0 COMMENT '偏好评分(-10到10)',
    is_available BOOLEAN DEFAULT TRUE COMMENT '是否可用',
    notes TEXT COMMENT '备注',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_type_id) REFERENCES shift_types(id),
    
    UNIQUE KEY unique_employee_shift (employee_id, shift_type_id)
);
```

## 3. 工时计算逻辑

### 3.1 工时概念说明

#### 3.1.1 工时概念说明
- **标准工时** (`work_hours`)：班次的标准工作时间
- **实际工时** (`actual_work_hours`)：员工实际工作的时间
- **加班工时** (`overtime_hours`)：超过标准工时的部分

#### 3.1.3 季度标准工时计算
```javascript
// 获取季度标准工时（精确计算）
function getQuarterlyStandardHours(year, quarter) {
    const quarterlyHours = getQuarterlyStandardHoursFromDB(year, quarter);
    if (quarterlyHours) {
        return quarterlyHours.standard_hours;
    }
    
    // 如果数据库中没有配置，则动态计算
    return calculateQuarterlyStandardHours(year, quarter);
}

// 动态计算季度标准工时
function calculateQuarterlyStandardHours(year, quarter) {
    const quarterStart = new Date(year, (quarter - 1) * 3, 1);
    const quarterEnd = new Date(year, quarter * 3, 0);
    
    let totalDays = 0;
    let weekendDays = 0;
    let legalHolidayDays = 0;
    let makeupWorkDays = 0;
    
    // 遍历季度每一天
    for (let date = new Date(quarterStart); date <= quarterEnd; date.setDate(date.getDate() + 1)) {
        totalDays++;
        
        const dayOfWeek = date.getDay();
        const dateStr = date.toISOString().split('T')[0];
        
        // 检查是否为周末
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            weekendDays++;
        }
        
        // 检查是否为法定节假日
        const holiday = getNationalHoliday(year, dateStr);
        if (holiday) {
            if (holiday.holiday_type === 'LEGAL_HOLIDAY') {
                legalHolidayDays++;
            } else if (holiday.holiday_type === 'WEEKEND_ADJUSTMENT' && holiday.is_working_day) {
                makeupWorkDays++;
            }
        }
    }
    
    // 计算实际工作日
    // 实际工作日 = 总天数 - 周末天数 - 法定节假日天数 + 调休工作日天数
    const actualWorkingDays = totalDays - weekendDays - legalHolidayDays + makeupWorkDays;
    const standardHours = actualWorkingDays * 8;
    
    // 保存计算结果到数据库
    saveQuarterlyStandardHours(year, quarter, {
        totalDays,
        weekendDays,
        legalHolidayDays,
        makeupWorkDays,
        actualWorkingDays,
        standardHours
    });
    
    return standardHours;
}

// 获取法定节假日信息
function getNationalHoliday(year, date) {
    // 从数据库查询法定节假日
    return queryNationalHoliday(year, date);
}

// 计算工时完成率
function calculateWorkHoursRatio(totalWorkHours, standardHours) {
    if (standardHours === 0) return 0;
    return (totalWorkHours / standardHours) * 100;
}

// 跨天班次时长计算
function calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    // 如果结束时间小于开始时间，说明跨天了
    if (end < start) {
        // 跨天情况：结束时间 + 24小时
        end.setDate(end.getDate() + 1);
    }
    
    const diffMs = end - start;
    const diffHours = diffMs / (1000 * 60 * 60);
    
    return Math.round(diffHours * 100) / 100; // 保留2位小数
}

// 加班工时计算
function calculateOvertimeHours(schedule) {
    const standardWorkHours = schedule.shift_type.work_hours;
    const actualWorkHours = schedule.actual_work_hours;
    
    if (actualWorkHours > standardWorkHours) {
        return actualWorkHours - standardWorkHours;
    }
    
    return 0;
}

// 示例：常日班 8:30-17:00
// 开始时间：2024-01-15 08:30:00
// 结束时间：2024-01-15 17:00:00
// 计算时长：8小时
// 标准工时：8小时

// 示例：长白班 8:30-21:00
// 开始时间：2024-01-15 08:30:00
// 结束时间：2024-01-15 21:00:00
// 计算时长：11小时
// 标准工时：11小时

// 示例：夜班 20:30-次日9:00
// 开始时间：2024-01-15 20:30:00
// 结束时间：2024-01-16 09:00:00
// 计算时长：11小时
// 标准工时：11小时
```

### 3.2 加班工时计算

#### 3.2.1 加班判定规则
- **标准工时外工作**：超过标准工时的部分
- **休息日工作**：周末或节假日工作
- **夜班加班**：夜班时段的额外工作

#### 3.2.2 加班费率应用
```javascript
// 加班工时和费用计算
function calculateOvertimeHours(schedule) {
    const standardWorkHours = schedule.shift_type.work_hours;
    const actualWorkHours = schedule.actual_work_hours;
    
    if (actualWorkHours > standardWorkHours) {
        return actualWorkHours - standardWorkHours;
    }
    
    return 0;
}

function calculateOvertimePay(schedule) {
    const overtimeHours = calculateOvertimeHours(schedule);
    const hourlyRate = schedule.employee.hourly_rate;
    const overtimeRate = schedule.shift_type.overtime_rate;
    
    return overtimeHours * hourlyRate * overtimeRate;
}
```

## 4. 业务逻辑设计

### 4.1 排班生成算法

#### 4.1.1 基础排班规则
1. **时间冲突检测**：同一员工同一天不能安排多个班次
2. **休息时间要求**：班次之间必须有足够的休息时间
3. **连续工作限制**：限制连续工作天数不超过6天
4. **夜班限制**：限制连续夜班天数
5. **夜班后休息**：夜班后最低休息1天
6. **跨天班次限制**：限制连续跨天班次天数
7. **每日工时限制**：每天总工时（排班+加班）不超过11小时
8. **加班限制**：控制加班时长
9. **季度工时要求**：每季度工时不少于国家规定工作日*8小时
10. **工时平衡**：确保员工工时分配合理

#### 4.1.2 特殊班次处理
1. **长白班处理**：
   - 工时较长：11小时，需要特别关注员工疲劳度
   - 休息时间：确保长白班后有足够的休息时间
   - 连续限制：限制连续长白班天数，避免过度疲劳
   - 费率调整：长白班使用1.2倍费率

2. **夜班处理**：
   - 跨天班次：20:30-次日9:00，需要特殊处理
   - 跨天识别：自动识别结束时间小于开始时间的班次
   - 日期归属：跨天班次归属到开始日期
   - 休息时间计算：考虑跨天班次对后续班次休息时间的影响
   - 工时统计：正确计算跨天班次的实际工时
   - 冲突检测：检测跨天班次与次日班次的时间冲突
   - 夜班后休息：夜班后必须休息至少1天，不能连续安排其他班次
   - 费率调整：夜班使用1.5倍费率

#### 4.1.3 排班优化策略
1. **员工偏好**：优先考虑员工班次偏好
2. **技能匹配**：根据员工技能匹配班次需求
3. **负载均衡**：平衡员工工作负载
4. **成本优化**：最小化加班成本
5. **工时优化**：合理分配工时，避免工时不足或过度
6. **班次优化**：合理安排长白班和夜班，避免过度疲劳

### 4.2 冲突检测机制

#### 4.2.1 实时冲突检测
```javascript
// 伪代码示例
function detectSchedulingConflicts(schedule) {
    const conflicts = [];
    
    // 检测时间冲突
    if (hasTimeConflict(schedule)) {
        conflicts.push({
            type: 'DOUBLE_BOOKING',
            severity: 'HIGH',
            description: '员工在同一时间被安排多个班次'
        });
    }
    
    // 检测跨天班次冲突
    if (hasCrossDayConflict(schedule)) {
        conflicts.push({
            type: 'CROSS_DAY_CONFLICT',
            severity: 'HIGH',
            description: '跨天班次与次日班次时间冲突'
        });
    }
    
    // 检测休息时间不足
    if (insufficientRestTime(schedule)) {
        conflicts.push({
            type: 'INSUFFICIENT_REST',
            severity: 'MEDIUM',
            description: '班次间休息时间不足'
        });
    }
    
    // 检测夜班后休息要求
    if (violatesNightShiftRestRule(schedule)) {
        conflicts.push({
            type: 'NIGHT_SHIFT_REST_VIOLATION',
            severity: 'HIGH',
            description: '夜班后未满足最低休息1天要求'
        });
    }
    
    // 检测连续工作天数限制
    if (exceedsConsecutiveDaysLimit(schedule)) {
        conflicts.push({
            type: 'CONSECUTIVE_DAYS_EXCEEDED',
            severity: 'HIGH',
            description: '连续工作天数超过6天限制'
        });
    }
    
    // 检测每日工时限制
    if (exceedsDailyHoursLimit(schedule)) {
        conflicts.push({
            type: 'DAILY_HOURS_EXCEEDED',
            severity: 'HIGH',
            description: '每天总工时超过11小时限制'
        });
    }
    
    // 检测季度工时要求
    if (violatesQuarterlyHoursRequirement(schedule)) {
        conflicts.push({
            type: 'QUARTERLY_HOURS_INSUFFICIENT',
            severity: 'MEDIUM',
            description: '季度工时未达到国家规定工作日*8小时要求'
        });
    }
    
    // 检测规则违反
    const ruleViolations = checkSchedulingRules(schedule);
    conflicts.push(...ruleViolations);
    
    return conflicts;
}

// 跨天班次冲突检测
function hasCrossDayConflict(schedule) {
    if (!isCrossDayShift(schedule.shift_type)) {
        return false;
    }
    
    // 检查次日是否有班次安排
    const nextDay = new Date(schedule.schedule_date);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const nextDaySchedule = getEmployeeSchedule(schedule.employee_id, nextDay);
    if (nextDaySchedule) {
        // 检查时间是否冲突
        const currentEndTime = getShiftEndTime(schedule);
        const nextStartTime = getShiftStartTime(nextDaySchedule);
        
        if (nextStartTime < currentEndTime) {
            return true;
        }
    }
    
    return false;
}

// 判断是否为跨天班次
function isCrossDayShift(shiftType) {
    return shiftType.end_time < shiftType.start_time;
}

// 每日工时限制检测
function exceedsDailyHoursLimit(schedule) {
    const dailyLimit = 11.0; // 每天11小时限制
    const scheduledHours = schedule.shift_type.work_hours;
    const overtimeHours = schedule.overtime_hours || 0;
    const totalDailyHours = scheduledHours + overtimeHours;
    
    return totalDailyHours > dailyLimit;
}

// 夜班后休息要求检测
function violatesNightShiftRestRule(schedule) {
    const employeeId = schedule.employee_id;
    const scheduleDate = new Date(schedule.schedule_date);
    
    // 检查前一天是否有夜班
    const previousDate = new Date(scheduleDate);
    previousDate.setDate(previousDate.getDate() - 1);
    
    const previousSchedule = getEmployeeSchedule(employeeId, previousDate);
    
    if (previousSchedule && previousSchedule.status !== 'CANCELLED') {
        const previousShiftType = getShiftType(previousSchedule.shift_type_id);
        
        // 如果前一天是夜班，则当前安排违反夜班后休息规则
        if (previousShiftType.is_night_shift) {
            return true;
        }
    }
    
    return false;
}

// 连续工作天数限制检测
function exceedsConsecutiveDaysLimit(schedule) {
    const maxConsecutiveDays = 6; // 最大连续工作6天
    const employeeId = schedule.employee_id;
    const scheduleDate = new Date(schedule.schedule_date);
    
    // 计算连续工作天数
    let consecutiveDays = 1;
    let currentDate = new Date(scheduleDate);
    
    // 向前查找连续工作天数
    for (let i = 1; i <= maxConsecutiveDays; i++) {
        currentDate.setDate(currentDate.getDate() - 1);
        const previousSchedule = getEmployeeSchedule(employeeId, currentDate);
        
        if (previousSchedule && previousSchedule.status !== 'CANCELLED') {
            consecutiveDays++;
        } else {
            break;
        }
    }
    
    // 向后查找连续工作天数
    currentDate = new Date(scheduleDate);
    for (let i = 1; i <= maxConsecutiveDays; i++) {
        currentDate.setDate(currentDate.getDate() + 1);
        const nextSchedule = getEmployeeSchedule(employeeId, currentDate);
        
        if (nextSchedule && nextSchedule.status !== 'CANCELLED') {
            consecutiveDays++;
        } else {
            break;
        }
    }
    
    return consecutiveDays > maxConsecutiveDays;
}

// 季度工时要求检测
function violatesQuarterlyHoursRequirement(schedule) {
    const employeeId = schedule.employee_id;
    const scheduleDate = new Date(schedule.schedule_date);
    const year = scheduleDate.getFullYear();
    const quarter = Math.ceil((scheduleDate.getMonth() + 1) / 3);
    
    // 获取该季度标准工时
    const standardHours = getQuarterlyStandardHours(year, quarter);
    
    // 计算该季度已完成的工时
    const quarterStart = new Date(year, (quarter - 1) * 3, 1);
    const quarterEnd = new Date(year, quarter * 3, 0);
    
    const completedHours = calculateEmployeeQuarterlyHours(employeeId, quarterStart, quarterEnd);
    
    // 检查是否达到标准工时要求
    return completedHours < standardHours;
}

// 计算员工季度工时
function calculateEmployeeQuarterlyHours(employeeId, startDate, endDate) {
    const schedules = getEmployeeSchedulesInPeriod(employeeId, startDate, endDate);
    let totalHours = 0;
    
    schedules.forEach(schedule => {
        if (schedule.status !== 'CANCELLED') {
            const shiftType = getShiftType(schedule.shift_type_id);
            totalHours += shiftType.work_hours;
            totalHours += schedule.overtime_hours || 0;
        }
    });
    
    return totalHours;
}
```

### 3.3 与APS系统集成

#### 3.3.1 操作需求匹配
```sql
-- 查询特定时间段的可用员工
SELECT e.*, st.shift_name, st.start_time, st.end_time
FROM employees e
JOIN personnel_schedules ps ON e.id = ps.employee_id
JOIN shift_types st ON ps.shift_type_id = st.id
WHERE ps.schedule_date = '2024-01-15'
  AND ps.status = 'CONFIRMED'
  AND st.start_time <= '14:00:00'
  AND st.end_time >= '18:00:00';
```

#### 3.3.2 技能匹配查询
```sql
-- 查询具备特定技能的可用员工
SELECT e.*, ps.schedule_date, st.shift_name
FROM employees e
JOIN employee_qualifications eq ON e.id = eq.employee_id
JOIN personnel_schedules ps ON e.id = ps.employee_id
JOIN shift_types st ON ps.shift_type_id = st.id
WHERE eq.qualification_id = ? -- 特定技能ID
  AND ps.schedule_date BETWEEN ? AND ?
  AND ps.status = 'CONFIRMED';
```

## 4. API接口设计

### 4.1 班次管理接口

```typescript
// 班次类型管理
interface ShiftTypeAPI {
    // 获取所有班次类型
    getShiftTypes(): Promise<ShiftType[]>;
    
    // 创建班次类型
    createShiftType(shiftType: CreateShiftTypeRequest): Promise<ShiftType>;
    
    // 更新班次类型
    updateShiftType(id: number, shiftType: UpdateShiftTypeRequest): Promise<ShiftType>;
    
    // 删除班次类型
    deleteShiftType(id: number): Promise<void>;
}

// 排班管理
interface SchedulingAPI {
    // 获取排班计划
    getSchedules(startDate: string, endDate: string, employeeId?: number): Promise<Schedule[]>;
    
    // 创建排班
    createSchedule(schedule: CreateScheduleRequest): Promise<Schedule>;
    
    // 批量创建排班
    createSchedulesBatch(schedules: CreateScheduleRequest[]): Promise<Schedule[]>;
    
    // 更新排班状态
    updateScheduleStatus(id: number, status: ScheduleStatus): Promise<Schedule>;
    
    // 检测排班冲突
    detectConflicts(schedules: CreateScheduleRequest[]): Promise<Conflict[]>;
}
```

### 4.2 排班查询接口

```typescript
// 排班查询
interface ScheduleQueryAPI {
    // 获取员工排班历史
    getEmployeeScheduleHistory(employeeId: number, startDate: string, endDate: string): Promise<Schedule[]>;
    
    // 获取班次统计
    getShiftStatistics(startDate: string, endDate: string): Promise<ShiftStatistics>;
    
    // 获取加班统计
    getOvertimeStatistics(employeeId: number, month: string): Promise<OvertimeStatistics>;
    
    // 获取工时统计
    getWorkHoursStatistics(employeeId: number, startDate: string, endDate: string): Promise<WorkHoursStatistics>;
    
    // 获取可用员工
    getAvailableEmployees(date: string, shiftTypeId: number): Promise<Employee[]>;
}

// 节假日管理接口
interface HolidayAPI {
    // 获取法定节假日
    getNationalHolidays(year: number): Promise<NationalHoliday[]>;
    
    // 添加法定节假日
    addNationalHoliday(holiday: CreateHolidayRequest): Promise<NationalHoliday>;
    
    // 更新法定节假日
    updateNationalHoliday(id: number, holiday: UpdateHolidayRequest): Promise<NationalHoliday>;
    
    // 删除法定节假日
    deleteNationalHoliday(id: number): Promise<void>;
    
    // 计算季度标准工时
    calculateQuarterlyStandardHours(year: number, quarter: number): Promise<QuarterlyStandardHours>;
    
    // 批量导入节假日
    importHolidaysFromAPI(year: number): Promise<void>;
    
    // 获取季度标准工时配置
    getQuarterlyStandardHours(year: number): Promise<QuarterlyStandardHours[]>;
    
    // 更新季度标准工时配置
    updateQuarterlyStandardHours(year: number, quarter: number, config: QuarterlyStandardHoursConfig): Promise<void>;
}

// 排班历史记录管理接口
interface ScheduleHistoryAPI {
    // 获取员工排班历史
    getEmployeeScheduleHistory(employeeId: number, startDate: string, endDate: string): Promise<EmployeeScheduleHistory[]>;
    
    // 创建排班记录
    createScheduleRecord(schedule: CreateScheduleRequest): Promise<EmployeeScheduleHistory>;
    
    // 更新排班记录
    updateScheduleRecord(id: number, schedule: UpdateScheduleRequest): Promise<EmployeeScheduleHistory>;
    
    // 取消排班
    cancelSchedule(id: number, reason: string): Promise<void>;
    
    // 重新安排排班
    rescheduleRecord(id: number, newSchedule: RescheduleRequest): Promise<EmployeeScheduleHistory>;
    
    // 获取排班变更记录
    getScheduleChangeLog(scheduleId: number): Promise<ScheduleChangeLog[]>;
    
    // 审批排班变更
    approveScheduleChange(changeId: number, approval: ApprovalRequest): Promise<void>;
    
    // 批量导入排班记录
    batchImportScheduleRecords(records: CreateScheduleRequest[]): Promise<ImportResult>;
    
    // 导出排班记录
    exportScheduleRecords(employeeId: number, startDate: string, endDate: string): Promise<ExportResult>;
}

// 节假日数据类型
interface NationalHoliday {
    id: number;
    year: number;
    holidayName: string;
    holidayDate: string;
    holidayType: 'LEGAL_HOLIDAY' | 'WEEKEND_ADJUSTMENT' | 'MAKEUP_WORK';
    isWorkingDay: boolean;
    description?: string;
}

interface CreateHolidayRequest {
    year: number;
    holidayName: string;
    holidayDate: string;
    holidayType: 'LEGAL_HOLIDAY' | 'WEEKEND_ADJUSTMENT' | 'MAKEUP_WORK';
    isWorkingDay: boolean;
    description?: string;
}

interface QuarterlyStandardHoursConfig {
    totalDays: number;
    weekendDays: number;
    legalHolidayDays: number;
    makeupWorkDays: number;
    actualWorkingDays: number;
    standardHours: number;
    calculationDetails: string;
}

// 排班历史记录数据类型
interface EmployeeScheduleHistory {
    id: number;
    employeeId: number;
    scheduleDate: string;
    shiftTypeId: number;
    startTime: string;
    endTime: string;
    workHours: number;
    overtimeHours: number;
    status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
    notes?: string;
    createdBy: number;
    createdAt: string;
    updatedBy?: number;
    updatedAt: string;
}

interface CreateScheduleRequest {
    employeeId: number;
    scheduleDate: string;
    shiftTypeId: number;
    overtimeHours?: number;
    notes?: string;
}

interface UpdateScheduleRequest {
    shiftTypeId?: number;
    overtimeHours?: number;
    notes?: string;
}

interface RescheduleRequest {
    newScheduleDate: string;
    newShiftTypeId: number;
    reason: string;
}

interface ScheduleChangeLog {
    id: number;
    scheduleHistoryId: number;
    changeType: 'CREATE' | 'UPDATE' | 'CANCEL' | 'RESCHEDULE' | 'STATUS_CHANGE';
    oldValues?: any;
    newValues?: any;
    changeReason: string;
    changedBy: number;
    changedAt: string;
    approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
    approvedBy?: number;
    approvedAt?: string;
    approvalNotes?: string;
}

interface ApprovalRequest {
    approvalStatus: 'APPROVED' | 'REJECTED';
    approvalNotes?: string;
}

interface ImportResult {
    success: boolean;
    totalRecords: number;
    successCount: number;
    failedCount: number;
    errors: string[];
}

interface ExportResult {
    success: boolean;
    fileUrl?: string;
    recordCount: number;
    error?: string;
}

// 工时管理接口
interface WorkHoursAPI {
    // 更新实际工时
    updateActualWorkHours(scheduleId: number, actualWorkHours: number): Promise<Schedule>;
    
    // 计算工时
    calculateWorkHours(scheduleId: number): Promise<WorkHoursCalculation>;
    
    // 获取工时报表
    getWorkHoursReport(startDate: string, endDate: string, employeeId?: number): Promise<WorkHoursReport>;
    
    // 工时异常检测
    detectWorkHoursAnomalies(startDate: string, endDate: string): Promise<WorkHoursAnomaly[]>;
}

// 数据类型定义
interface WorkHoursStatistics {
    employeeId: number;
    employeeName: string;
    period: string; // 统计周期 (如: "2024-Q1", "2024-03")
    totalWorkHours: number; // 总工时
    scheduledHours: number; // 排班工时
    overtimeHours: number; // 加班工时
    standardHours: number; // 标准工时(根据季度工作日*8小时计算)
    workHoursRatio: number; // 工时完成率 (总工时/标准工时)
    averageDailyHours: number; // 平均每日工时
    workDays: number; // 工作天数
    restDays: number; // 休息天数
    shiftTypeDistribution: ShiftTypeDistribution[]; // 班次类型分布
    monthlyBreakdown: MonthlyWorkHours[]; // 月度明细
    quarterlyDetails: QuarterlyWorkHoursDetails; // 季度详细信息
}

// 季度工时详细信息
interface QuarterlyWorkHoursDetails {
    year: number;
    quarter: number;
    totalDays: number; // 季度总天数
    weekendDays: number; // 周末天数
    legalHolidayDays: number; // 法定节假日天数
    makeupWorkDays: number; // 调休工作日天数
    actualWorkingDays: number; // 实际工作日数
    standardHours: number; // 标准工时
    calculationFormula: string; // 计算公式
}

// 月度工时明细
interface MonthlyWorkHours {
    month: string; // 月份 (如: "2024-03")
    totalHours: number;
    scheduledHours: number;
    overtimeHours: number;
    workDays: number;
    averageDailyHours: number;
}

// 季度标准工时计算
interface QuarterlyStandardHours {
    year: number;
    quarter: number;
    workingDays: number;
    standardHours: number; // workingDays * 8
}

interface WorkHoursCalculation {
    scheduledWorkHours: number;
    actualWorkHours: number;
    overtimeHours: number;
    hourlyRate: number;
    totalPay: number;
}

interface WorkHoursReport {
    employeeId: number;
    employeeName: string;
    period: string;
    totalWorkDays: number;
    totalWorkHours: number;
    totalOvertimeHours: number;
    averageDailyHours: number;
    totalPay: number;
}

interface WorkHoursAnomaly {
    employeeId: number;
    scheduleId: number;
    date: string;
    anomalyType: 'EXCESSIVE_HOURS' | 'INSUFFICIENT_HOURS' | 'IRREGULAR_PATTERN';
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
}
```

## 5. 前端界面设计

### 5.1 排班管理界面

#### 5.1.1 排班日历视图
- **月视图**：显示整月的排班情况
- **周视图**：显示一周的详细排班
- **日视图**：显示单日的班次安排

#### 5.1.2 排班编辑功能
- **拖拽排班**：支持拖拽方式调整排班
- **批量操作**：支持批量创建和修改排班
- **冲突提示**：实时显示排班冲突警告
- **规则验证**：自动验证排班规则

### 5.2 班次管理界面

#### 5.2.1 班次类型配置
- **班次定义**：创建和编辑班次类型
- **时间设置**：设置班次开始和结束时间
- **工时配置**：设置标准工时
- **费率配置**：设置加班费率和特殊费率

#### 5.2.2 员工偏好设置
- **班次偏好**：员工设置班次偏好
- **可用性设置**：设置员工可用时间
- **技能标签**：关联员工技能和班次需求

### 5.3 工时管理界面

#### 5.3.1 工时录入界面
- **实际工时录入**：员工或管理员录入实际工作时间
- **工时计算显示**：实时显示工时计算结果
- **异常提醒**：工时异常时显示警告信息

#### 5.3.2 工时统计界面
- **个人工时统计**：员工查看个人工时统计
- **部门工时统计**：部门工时汇总统计
- **工时趋势分析**：工时变化趋势图表
- **工时对比分析**：不同时期工时对比

#### 5.3.3 工时报表界面
- **工时明细报表**：详细的工时记录报表
- **加班统计报表**：加班工时和费用统计
- **工时异常报表**：工时异常情况报表

## 6. 实施计划

### 6.1 开发阶段

#### 阶段1：基础功能（2周）
- 数据库表创建
- 基础API接口开发
- 班次类型管理功能

#### 阶段2：排班核心功能（3周）
- 排班创建和编辑功能
- 冲突检测机制
- 排班规则验证

#### 阶段3：高级功能（2周）
- 排班优化算法
- 统计报表功能
- 与APS系统集成

#### 阶段4：前端界面（3周）
- 排班管理界面
- 日历视图组件
- 用户交互优化

### 6.2 测试计划

#### 单元测试
- API接口测试
- 业务逻辑测试
- 数据库操作测试

#### 集成测试
- 与APS系统集成测试
- 排班冲突检测测试
- 性能压力测试

#### 用户验收测试
- 排班管理流程测试
- 用户界面友好性测试
- 数据准确性验证

## 7. 扩展功能

### 7.1 智能排班
- **机器学习算法**：基于历史数据优化排班
- **预测分析**：预测排班需求和员工可用性
- **自动排班**：AI辅助自动生成排班计划

### 7.2 移动端支持
- **移动应用**：员工查看排班信息
- **推送通知**：排班变更通知
- **签到打卡**：班次签到功能

### 7.3 高级报表
- **成本分析**：排班成本统计和分析
- **效率分析**：员工工作效率分析
- **合规报告**：劳动法规合规性报告

## 8. 总结

本设计文档提供了一个完整的人员排班体系解决方案，包括：

1. **完整的数据库设计**：涵盖班次类型、排班计划、规则管理、冲突检测等
2. **灵活的业务逻辑**：支持多种排班规则和优化策略
3. **丰富的API接口**：提供完整的排班管理功能
4. **用户友好的界面**：直观的排班管理和查看界面
5. **可扩展的架构**：支持未来功能扩展和集成

该体系可以与现有的APS系统无缝集成，为生产计划提供人员保障，确保生产任务的顺利执行。
