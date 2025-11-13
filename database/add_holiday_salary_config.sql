-- 节假日工资配置表
-- 用于存储3倍工资法定节假日配置，替代硬编码

USE aps_system;

-- 节假日工资配置表
CREATE TABLE IF NOT EXISTS holiday_salary_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    year INT NOT NULL COMMENT '年份',
    calendar_date DATE NOT NULL COMMENT '日期',
    holiday_name VARCHAR(100) NOT NULL COMMENT '节假日名称',
    salary_multiplier DECIMAL(3,2) NOT NULL DEFAULT 3.00 COMMENT '工资倍数（3.00=3倍工资，2.00=2倍工资）',
    config_source ENUM('RULE_ENGINE', 'MANUAL', 'IMPORTED', 'API') NOT NULL DEFAULT 'RULE_ENGINE' COMMENT '配置来源',
    config_rule VARCHAR(255) DEFAULT NULL COMMENT '识别规则（如：春节前4天、国庆前3天等）',
    region VARCHAR(50) DEFAULT NULL COMMENT '适用地区（NULL表示全国通用）',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    notes TEXT COMMENT '备注说明',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    UNIQUE KEY uk_year_date (year, calendar_date),
    INDEX idx_year (year),
    INDEX idx_calendar_date (calendar_date),
    INDEX idx_salary_multiplier (salary_multiplier),
    INDEX idx_config_source (config_source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节假日工资配置表（3倍工资/2倍工资）';

-- 节假日工资识别规则表
CREATE TABLE IF NOT EXISTS holiday_salary_rules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
    holiday_name VARCHAR(100) NOT NULL COMMENT '节假日名称',
    rule_type ENUM('FIXED_DATE', 'LUNAR_DATE', 'RELATIVE_DATE', 'FIXED_COUNT') NOT NULL COMMENT '规则类型',
    rule_config JSON NOT NULL COMMENT '规则配置（JSON格式）',
    salary_multiplier DECIMAL(3,2) NOT NULL DEFAULT 3.00 COMMENT '工资倍数',
    priority INT NOT NULL DEFAULT 100 COMMENT '优先级（数字越小优先级越高）',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    description TEXT COMMENT '规则描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    INDEX idx_holiday_name (holiday_name),
    INDEX idx_rule_type (rule_type),
    INDEX idx_is_active (is_active),
    INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节假日工资识别规则表';

-- 插入默认规则（基于《全国年节及纪念日放假办法》）
INSERT INTO holiday_salary_rules (rule_name, holiday_name, rule_type, rule_config, salary_multiplier, priority, description) VALUES
-- 元旦：1月1日
('元旦固定日期', '元旦', 'FIXED_DATE', '{"month": 1, "day": 1}', 3.00, 10, '元旦节固定为1月1日，3倍工资'),

-- 春节：除夕、正月初一、初二、初三（共4天）
('春节前4天', '春节', 'RELATIVE_DATE', '{"holiday_name": "春节", "days": [-3, -2, -1, 0], "description": "除夕、正月初一、初二、初三"}', 3.00, 10, '春节假期前4天（除夕到正月初三）为3倍工资'),

-- 清明节：清明节当天（公历4月4日或5日）
('清明节固定日期', '清明节', 'FIXED_DATE', '{"month": 4, "day": 4}', 3.00, 10, '清明节固定为4月4日，3倍工资'),

-- 劳动节：5月1日（如果放假多天，则5月1-2日）
('劳动节固定日期', '劳动节', 'FIXED_DATE', '{"month": 5, "day": 1}', 3.00, 10, '劳动节固定为5月1日，3倍工资'),

-- 端午节：农历五月初五对应的公历日期
('端午节农历日期', '端午节', 'LUNAR_DATE', '{"lunar_month": 5, "lunar_day": 5}', 3.00, 10, '端午节为农历五月初五，3倍工资'),

-- 中秋节：农历八月十五对应的公历日期
('中秋节农历日期', '中秋节', 'LUNAR_DATE', '{"lunar_month": 8, "lunar_day": 15}', 3.00, 10, '中秋节为农历八月十五，3倍工资'),

-- 国庆节：10月1-3日
('国庆节前3天', '国庆节', 'FIXED_DATE', '{"month": 10, "days": [1, 2, 3]}', 3.00, 10, '国庆节前3天（10月1-3日）为3倍工资')
ON DUPLICATE KEY UPDATE 
    rule_config = VALUES(rule_config),
    updated_at = CURRENT_TIMESTAMP;

