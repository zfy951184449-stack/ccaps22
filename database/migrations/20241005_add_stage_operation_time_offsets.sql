-- 添加阶段操作时间跨日偏移字段
-- 此脚本仅扩展表结构，不修改现有数据

ALTER TABLE stage_operation_schedules
  ADD COLUMN recommended_day_offset TINYINT NOT NULL DEFAULT 0 COMMENT '推荐开始时间跨日偏移（相对于 operation_day）' AFTER recommended_time,
  ADD COLUMN window_start_day_offset TINYINT NOT NULL DEFAULT 0 COMMENT '时间窗口开始跨日偏移（相对于 operation_day）' AFTER window_start_time,
  ADD COLUMN window_end_day_offset TINYINT NOT NULL DEFAULT 0 COMMENT '时间窗口结束跨日偏移（相对于 operation_day）' AFTER window_end_time;
