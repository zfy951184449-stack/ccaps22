-- 为操作表增加操作类型字段，用于区分“准备/工艺”并在求解时做硬性满足
ALTER TABLE operations
  ADD COLUMN operation_type ENUM('PREP', 'PROCESS') DEFAULT NULL COMMENT '操作类型：PREP-准备/支撑，PROCESS-工艺/主生产' AFTER required_people,
  ADD INDEX idx_operation_type (operation_type);

-- 可根据业务需要批量回填，例如：
-- UPDATE operations SET operation_type = 'PROCESS' WHERE operation_type IS NULL;
