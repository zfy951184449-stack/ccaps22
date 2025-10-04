-- 更新操作表字段注释：将标准耗时单位从分钟改为小时
-- 执行日期: 2025-09-15
-- 说明: 为了与甘特图显示保持一致，将标准耗时单位统一为小时

USE aps_system;

-- 更新operations表的standard_time字段注释
ALTER TABLE operations MODIFY COLUMN standard_time DECIMAL(8,2) NOT NULL COMMENT '标准耗时（小时）';

-- 显示更新后的表结构
DESCRIBE operations;