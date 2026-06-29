-- ============================================================
-- 排产 · 设备状态机绑定列(幂等 ADD COLUMN)
-- 执行时间: 2026-06-28
--
-- 用户拍板:类型绑模板 + 设备可改。故三处加 sm_template_id(软链 ps_sm_template.id,无硬 FK,
--   同 resource_id 套路):
--   · ps_equipment_type.sm_template_id  设备类型的默认状态机模板(如 配液罐→cip-sip)。
--   · ps_cip_equipment.sm_template_id   单台设备覆盖(留空=随类型默认)。
--   · ps_pipeline.sm_template_id        管线覆盖(留空=随…管线无类型,留空即未绑)。
-- 有效模板 = 设备 sm_template_id ?? 其类型的 sm_template_id(读侧派生,后端 ProdDataAssembler 解析)。
-- 时序「设备列覆盖模板默认」复用已有的 cip/rip/sip_duration_minutes + dht/rht/cht/sht_hours 七列,无需新增。
--
-- 安全性:全部「列不存在才 ADD」(information_schema 守卫),只新增、无损、可重跑;走部署护栏白名单。
-- 回退:ALTER TABLE ... DROP COLUMN sm_template_id;
-- ============================================================

-- ps_equipment_type.sm_template_id(类型默认模板)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_equipment_type' AND column_name='sm_template_id')=0,
  'ALTER TABLE ps_equipment_type ADD COLUMN sm_template_id INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_cip_equipment.sm_template_id(设备覆盖)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='sm_template_id')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN sm_template_id INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ps_pipeline.sm_template_id(管线覆盖)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_pipeline' AND column_name='sm_template_id')=0,
  'ALTER TABLE ps_pipeline ADD COLUMN sm_template_id INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT '20260628_sm_template_bind 完成:ps_equipment_type / ps_cip_equipment / ps_pipeline 已加 sm_template_id(幂等)' AS status;
