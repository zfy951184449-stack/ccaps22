-- Migration: Widen batch_share_groups.group_name / group_code to stop 1406 on batch generation
-- Date: 2026-06-17
-- =====================================================
-- 症状:新建 / 换模板重建批次时返回 500;诊断显示
--   ER_DATA_TOO_LONG(1406) "Data too long for column 'group_name'"。
--
-- 根因:存储过程 generate_batch_operation_plans 的 Step 4 把模板的人员共享组从
--   personnel_share_groups 拷入 batch_share_groups:
--     INSERT INTO batch_share_groups (... group_code, group_name ...)
--     SELECT ... psg.group_code, psg.group_name ... FROM personnel_share_groups psg ...
--   但两表列宽历史不一致(源宽、目标窄):
--     personnel_share_groups.group_name VARCHAR(100) / group_code VARCHAR(50)   (add_constraints_features.sql)
--     batch_share_groups       .group_name VARCHAR(50)  / group_code VARCHAR(20)   (20251215_add_share_groups_and_lag_type.sql)
--   当某共享组名字 > 50 字符时,STRICT_TRANS_TABLES 下该 INSERT 抛 1406,整事务回滚 → 控制器兜底 500。
--   与"修改/替换操作"无因果:只是那些模板恰好带了名字较长的共享组。
--
-- 修复方向:共享组名字现已是无用展示字段(共享组靠 id 区分、前端无录入入口),
--   故不截断、直接放宽目标列到 >= 源列。纯列宽加宽,无损:不截断任何现有值,
--   仅重建 batch_share_groups 这张小表;不动存储过程、不动批次数据、不重生成任何批次。
--   group_name 给足余量到 255(此字段无用,放大以彻底告别此类溢出);group_code 对齐源列 50。
-- =====================================================
USE aps_system;

ALTER TABLE batch_share_groups
  MODIFY COLUMN group_code VARCHAR(50)  NOT NULL,
  MODIFY COLUMN group_name VARCHAR(255) NULL;
