-- 系统设置表：用于存储后台可配置的密钥、开关等
CREATE TABLE IF NOT EXISTS system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NULL,
    description VARCHAR(255) NULL,
    updated_by VARCHAR(100) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通用系统配置表（如天行API密钥等）';

-- 初始化描述，方便识别
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('TIANAPI_KEY', NULL, '天行节假日API密钥（通过前端系统监控界面配置）')
ON DUPLICATE KEY UPDATE description = VALUES(description);
