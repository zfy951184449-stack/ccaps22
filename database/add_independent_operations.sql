-- 独立操作功能数据库变更
-- 执行时间: 2025-12-11
-- ============================================
-- 1. 修改 production_batch_plans 允许 template_id 为空
-- ============================================
ALTER TABLE production_batch_plans
MODIFY COLUMN template_id INT NULL COMMENT '工艺模版ID，独立操作批次为NULL';
-- ============================================
-- 2. 创建虚拟批次用于存储独立操作
-- ============================================
-- 检查是否已存在虚拟批次
INSERT INTO production_batch_plans (
        batch_code,
        batch_name,
        template_id,
        plan_status,
        planned_start_date,
        planned_end_date
    )
SELECT 'INDEPENDENT',
    '独立操作',
    NULL,
    'ACTIVATED',
    CURDATE(),
    DATE_ADD(CURDATE(), INTERVAL 1 YEAR)
FROM DUAL
WHERE NOT EXISTS (
        SELECT 1
        FROM production_batch_plans
        WHERE batch_code = 'INDEPENDENT'
    );
-- 获取虚拟批次ID
SELECT id AS independent_batch_id
FROM production_batch_plans
WHERE batch_code = 'INDEPENDENT';
-- ============================================
-- 3. 修改 batch_operation_plans 表
-- ============================================
-- 允许 template_schedule_id 为空
ALTER TABLE batch_operation_plans
MODIFY COLUMN template_schedule_id INT NULL COMMENT '模版操作安排ID，独立操作为NULL';
-- 删除唯一约束（如果存在）
-- 因为独立操作没有 template_schedule_id
SET @constraint_exists = (
        SELECT COUNT(*)
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = 'aps_system'
            AND TABLE_NAME = 'batch_operation_plans'
            AND CONSTRAINT_NAME = 'uk_batch_template_schedule'
    );
-- 需要手动执行：如果约束存在先删除
-- ALTER TABLE batch_operation_plans DROP INDEX uk_batch_template_schedule;
-- 添加独立操作标记字段
ALTER TABLE batch_operation_plans
ADD COLUMN is_independent TINYINT(1) DEFAULT 0 COMMENT '是否为独立操作';
-- 添加生成组ID字段
ALTER TABLE batch_operation_plans
ADD COLUMN generation_group_id VARCHAR(36) NULL COMMENT '批量生成组ID';
-- 添加索引
CREATE INDEX idx_is_independent ON batch_operation_plans(is_independent);
CREATE INDEX idx_generation_group ON batch_operation_plans(generation_group_id);
-- ============================================
-- 4. 验证变更
-- ============================================
SELECT '变更完成' AS status;
-- 查看虚拟批次
SELECT *
FROM production_batch_plans
WHERE batch_code = 'INDEPENDENT';