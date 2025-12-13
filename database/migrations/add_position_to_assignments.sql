-- 迁移脚本：为 batch_personnel_assignments 添加 position_number 支持
-- 用于支持按岗位分配不同员工

-- 1. 添加 position_number 列
ALTER TABLE batch_personnel_assignments
ADD COLUMN position_number INT NOT NULL DEFAULT 1 
COMMENT '岗位编号，对应 operation_qualification_requirements.position_number' 
AFTER batch_operation_plan_id;

-- 2. 删除旧的唯一索引（如果存在）
-- 注意：需要先检查索引名称
-- DROP INDEX IF EXISTS idx_unique_assignment ON batch_personnel_assignments;

-- 3. 添加新的唯一索引：同一操作的同一岗位只能分配一个人
-- 注意：这会替换原来的 (batch_operation_plan_id, employee_id) 唯一约束
-- 现在允许同一员工被分配到同一操作的不同岗位（如果业务允许的话）
-- 但同一岗位只能有一个人

-- 先查看现有索引
-- SHOW INDEX FROM batch_personnel_assignments;

-- 创建新的唯一索引
CREATE UNIQUE INDEX idx_unique_position_assignment 
ON batch_personnel_assignments (batch_operation_plan_id, position_number);

-- 4. 如果需要保持原有约束（同一人不能被分配到同一操作多次），可以添加：
-- CREATE UNIQUE INDEX idx_unique_employee_assignment 
-- ON batch_personnel_assignments (batch_operation_plan_id, employee_id);

-- 5. 添加索引以支持按岗位查询
CREATE INDEX idx_position ON batch_personnel_assignments (position_number);

