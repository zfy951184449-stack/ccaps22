-- =====================================================
-- 排班系统 V2 表结构迁移（简化版）
-- 如果列已存在会报错，可以忽略
-- =====================================================

USE aps_system;

-- 添加 V2 所需的列到 scheduling_runs 表
ALTER TABLE scheduling_runs 
  ADD COLUMN run_code VARCHAR(64) NULL,
  ADD COLUMN stage VARCHAR(20) NOT NULL DEFAULT 'PREPARING',
  ADD COLUMN window_start DATE NULL,
  ADD COLUMN window_end DATE NULL,
  ADD COLUMN target_batch_ids JSON NULL,
  ADD COLUMN result_summary JSON NULL,
  ADD COLUMN error_message TEXT NULL;

-- 添加 is_locked 到 batch_personnel_assignments
ALTER TABLE batch_personnel_assignments 
  ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0;

-- 添加 is_locked 和 is_buffer 到 employee_shift_plans
ALTER TABLE employee_shift_plans 
  ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN is_buffer TINYINT(1) NOT NULL DEFAULT 0;

