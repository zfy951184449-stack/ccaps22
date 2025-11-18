-- 创建缺失的系统表
-- 执行顺序：先创建基础表，再创建依赖表

-- 1. 系统设置表（用于存储API密钥等配置）
CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NULL,
    description VARCHAR(255) NULL,
    updated_by VARCHAR(100) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通用系统配置表（如天行API密钥等）';

-- 2. 节假日更新日志表
CREATE TABLE IF NOT EXISTS holiday_update_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    update_year INT NOT NULL COMMENT '更新年份',
    update_source VARCHAR(100) NOT NULL COMMENT '更新来源',
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
    records_count INT NOT NULL COMMENT '更新记录数',
    update_status ENUM('SUCCESS', 'FAILED', 'PARTIAL') DEFAULT 'SUCCESS' COMMENT '更新状态',
    error_message TEXT COMMENT '错误信息',

    INDEX idx_update_year (update_year),
    INDEX idx_update_time (update_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节假日更新日志表';

-- 3. 初始化系统设置
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('TIANAPI_KEY', NULL, '天行节假日API密钥（通过前端系统监控界面配置）')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- 显示创建结果
SELECT 'system_settings table created/verified' as status;
SELECT 'holiday_update_log table created/verified' as status;
