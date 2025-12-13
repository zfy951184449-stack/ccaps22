-- =====================================================
-- 排班系统 V2 表结构迁移
-- 创建日期：2024-12-03
-- 描述：为新的模块化排班系统创建必要的表结构
-- =====================================================

USE aps_system;

-- 1. 更新 scheduling_runs 表，添加 V2 所需的字段
-- 如果已存在则添加新列

-- 添加 run_code (唯一运行标识)
ALTER TABLE scheduling_runs
  ADD COLUMN IF NOT EXISTS run_code VARCHAR(64) NULL AFTER run_key;

-- 添加 stage (运行阶段)
ALTER TABLE scheduling_runs
  ADD COLUMN IF NOT EXISTS stage ENUM(
    'PREPARING',
    'ASSEMBLING',
    'SOLVING',
    'PARSING',
    'PERSISTING',
    'COMPLETED',
    'ERROR',
    'CANCELLED'
  ) NOT NULL DEFAULT 'PREPARING' AFTER status;

-- 重命名或添加时间窗口字段
ALTER TABLE scheduling_runs
  ADD COLUMN IF NOT EXISTS window_start DATE NULL AFTER stage,
  ADD COLUMN IF NOT EXISTS window_end DATE NULL AFTER window_start;

-- 添加目标批次 ID 列表
ALTER TABLE scheduling_runs
  ADD COLUMN IF NOT EXISTS target_batch_ids JSON NULL AFTER window_end;

-- 添加结果摘要
ALTER TABLE scheduling_runs
  ADD COLUMN IF NOT EXISTS result_summary JSON NULL AFTER target_batch_ids;

-- 添加错误消息
ALTER TABLE scheduling_runs
  ADD COLUMN IF NOT EXISTS error_message TEXT NULL AFTER result_summary;

-- 更新状态枚举以支持 V2 状态
-- 注意：MySQL 不支持直接修改 ENUM，需要使用 ALTER TABLE MODIFY
ALTER TABLE scheduling_runs
  MODIFY COLUMN status ENUM(
    'DRAFT',
    'PENDING_PUBLISH',
    'PUBLISHED',
    'FAILED',
    'ROLLED_BACK',
    'CANCELLED',
    'QUEUED',
    'RUNNING',
    'COMPLETED'
  ) NOT NULL DEFAULT 'DRAFT';

-- 添加索引
ALTER TABLE scheduling_runs
  ADD INDEX IF NOT EXISTS idx_run_code (run_code),
  ADD INDEX IF NOT EXISTS idx_stage (stage);

-- 2. 确保 batch_personnel_assignments 表有必要的列
ALTER TABLE batch_personnel_assignments
  ADD COLUMN IF NOT EXISTS is_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER assignment_status;

-- 3. 确保 employee_shift_plans 表有必要的列
ALTER TABLE employee_shift_plans
  ADD COLUMN IF NOT EXISTS is_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER is_generated;

-- 4. 添加 plan_category 枚举更新（支持 WORK/REST）
ALTER TABLE employee_shift_plans
  MODIFY COLUMN plan_category ENUM(
    'PRODUCTION',
    'BASE',
    'REST',
    'OVERTIME',
    'LEAVE',
    'WORK'
  ) NOT NULL DEFAULT 'PRODUCTION';

-- 5. 添加 is_buffer 字段用于标识缓冲期班次
ALTER TABLE employee_shift_plans
  ADD COLUMN IF NOT EXISTS is_buffer TINYINT(1) NOT NULL DEFAULT 0 AFTER is_locked;

-- 确认更改
SELECT 'Scheduling V2 migration completed successfully' AS message;

