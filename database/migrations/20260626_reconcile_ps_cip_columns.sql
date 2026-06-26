-- ============================================================
-- 排产 CIP 拓扑 · 补列对账(幂等 ADD COLUMN)
-- 执行时间: 2026-06-26
--
-- 背景:20260625_create_ps_cip_topology.sql 的列是「直接改 CREATE TABLE 内联加」的
--   (org_unit_id / cleaning_mode / room_id / parent_equipment_id / cip·sip 时长 / dht·cht …)。
--   但 CREATE TABLE IF NOT EXISTS 碰到已存在的表会跳过、不补列 —— 凡早于某列被加入时就已建表的
--   环境,该列不会出现,后端 CRUD/导入引用它就会 Unknown column。本迁移把当前 schema 的列补齐。
--
-- 安全性:全部是「列不存在才 ADD」(information_schema 守卫),列已存在则空操作 DO 0;
--   只新增、对既有数据无损、可重跑(回滚重跑不报错)。MySQL 8/9 不支持 ADD COLUMN IF NOT EXISTS,
--   故用 PREPARE 守卫实现幂等。不补索引/外键(缺失只影响性能/约束、不致报错;新装由建表脚本带上)。
-- ============================================================

-- ps_cip_station.org_unit_id(归属 team)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_station' AND column_name='org_unit_id')=0,
  'ALTER TABLE ps_cip_station ADD COLUMN org_unit_id INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_room.org_unit_id
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_room' AND column_name='org_unit_id')=0,
  'ALTER TABLE ps_room ADD COLUMN org_unit_id INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_room.cleanroom_class
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_room' AND column_name='cleanroom_class')=0,
  'ALTER TABLE ps_room ADD COLUMN cleanroom_class ENUM(''A'',''B'',''C'',''D'',''CNC'') NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_cip_equipment.cleaning_mode(NOT NULL DEFAULT 'cip':既有行回填默认值,无损)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='cleaning_mode')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN cleaning_mode ENUM(''cip'',''single-use'',''cop'',''other'') NOT NULL DEFAULT ''cip''', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_cip_equipment.cip_station_id
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='cip_station_id')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN cip_station_id INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_cip_equipment.room_id
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='room_id')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN room_id INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_cip_equipment.org_unit_id
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='org_unit_id')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN org_unit_id INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_cip_equipment.parent_equipment_id(自引用上级设备)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='parent_equipment_id')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN parent_equipment_id INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_cip_equipment.cip_duration_minutes
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='cip_duration_minutes')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN cip_duration_minutes INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_cip_equipment.sip_duration_minutes
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='sip_duration_minutes')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN sip_duration_minutes INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_cip_equipment.dht_hours
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='dht_hours')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN dht_hours INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_cip_equipment.cht_hours
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='cht_hours')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN cht_hours INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_pipeline.cip_duration_minutes
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_pipeline' AND column_name='cip_duration_minutes')=0,
  'ALTER TABLE ps_pipeline ADD COLUMN cip_duration_minutes INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_pipeline.dht_hours
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_pipeline' AND column_name='dht_hours')=0,
  'ALTER TABLE ps_pipeline ADD COLUMN dht_hours INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_pipeline.cht_hours
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_pipeline' AND column_name='cht_hours')=0,
  'ALTER TABLE ps_pipeline ADD COLUMN cht_hours INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT '20260626_reconcile_ps_cip_columns 完成:已补齐 ps_* 缺列(幂等)' AS status;
