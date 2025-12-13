-- 扩展操作类型，新增 MONITOR（监控操作）
ALTER TABLE operations
  MODIFY COLUMN operation_type ENUM('PREP','PROCESS','MONITOR') DEFAULT NULL COMMENT '操作类型：PREP-准备/支撑，PROCESS-工艺/主生产，MONITOR-监控';

