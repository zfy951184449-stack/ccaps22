-- Allow standalone AD_HOC tasks to carry exact start/end times.
-- Existing DATE values are preserved as midnight DATETIME values by MySQL.
ALTER TABLE standalone_tasks
    MODIFY COLUMN earliest_start DATETIME DEFAULT NULL COMMENT '最早开始时间；FLEXIBLE/周期实例可使用日期 00:00:00',
    MODIFY COLUMN deadline DATETIME NOT NULL COMMENT '截止/结束时间；AD_HOC 表示固定结束时间';
