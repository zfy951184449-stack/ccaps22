ALTER TABLE standalone_tasks
  ADD COLUMN allowed_employee_ids JSON DEFAULT NULL COMMENT '指定候选/指定人员ID列表' AFTER preferred_shift_ids;
