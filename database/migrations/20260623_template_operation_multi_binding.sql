-- ============================================================
-- 工艺模版「操作绑定多台设备」(候选池/任选其一) schema 升级
-- 执行时间: 2026-06-23
--
-- 背景:
--   V3 工艺模版的「操作」由单台设备绑定升级为多台设备绑定:
--     一个操作 = 1 条 binding_role='PRIMARY'(优选) + 0..N 条 'AUXILIARY'(备选)。
--   下游(批次派生 / 甘特 / 排班求解器)本期一律只认「优选」那台,行为不变;
--   备选只在模版层存储与展示,不进排产。
--
--   表 template_stage_operation_resource_bindings 原始建表
--   (20260304_create_process_template_v2_resource_nodes.sql) 为「旧 1:1 结构」:
--     - 单列唯一键 uk_template_schedule_default_node(template_schedule_id)
--       —— 每个操作只能绑 1 台设备;
--     - 缺 binding_role 列 —— 无法区分优选 / 备选。
--   目标「新结构」:
--     - 复合唯一键 uk_schedule_node(template_schedule_id, resource_node_id)
--       —— 同一操作允许多台设备(去重到设备级);
--     - binding_role ENUM('PRIMARY','AUXILIARY') NOT NULL DEFAULT 'PRIMARY'。
--
-- 适用范围:
--   本地开发库已是「新结构」,本迁移仅供仍停在「旧 1:1 结构」的其它环境升级。
--   全部 information_schema 判断 + 防御式动态 SQL,重复执行安全。
--
-- 幂等: 每步先查 information_schema 再决定是否变更;已是新结构则全部跳过。
--
-- 执行前请先选定目标库(本仓迁移逐环境手工执行、DB_NAME 可配,故不在此硬编码库名):
--   mysql -u<user> <DB_NAME> < 20260623_template_operation_multi_binding.sql
-- 下方判断均用 DATABASE() 跟随当前所选库。
-- ============================================================

-- ---- 1. 新增 binding_role 列(若缺)----
-- 旧结构无此列;新增后默认全部为 PRIMARY,与历史 1:1 语义一致(原绑定即优选)。
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'template_stage_operation_resource_bindings'
    AND COLUMN_NAME = 'binding_role');
SET @sql := IF(@col = 0,
  'ALTER TABLE template_stage_operation_resource_bindings
     ADD COLUMN binding_role ENUM(''PRIMARY'', ''AUXILIARY'') NOT NULL DEFAULT ''PRIMARY''
     COMMENT ''绑定角色:PRIMARY=优选(下游排产只认它),AUXILIARY=备选(仅模版层存储/展示)''
     AFTER binding_mode',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---- 2. 删旧单列唯一键 uk_template_schedule_default_node(若存在)----
-- 该键限制「每个操作只能绑 1 台设备」,与多设备语义冲突,必须先删再建复合键。
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'template_stage_operation_resource_bindings'
    AND INDEX_NAME = 'uk_template_schedule_default_node');
SET @sql := IF(@idx > 0,
  'ALTER TABLE template_stage_operation_resource_bindings DROP INDEX uk_template_schedule_default_node',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---- 3. 新增复合唯一键 uk_schedule_node(template_schedule_id, resource_node_id)(若缺)----
-- 允许同一操作绑多台设备,但同一操作同一设备不重复。
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'template_stage_operation_resource_bindings'
    AND INDEX_NAME = 'uk_schedule_node');
SET @sql := IF(@idx = 0,
  'ALTER TABLE template_stage_operation_resource_bindings
     ADD UNIQUE KEY uk_schedule_node (template_schedule_id, resource_node_id)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT '20260623_template_operation_multi_binding 完成' AS status;
