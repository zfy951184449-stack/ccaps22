-- ============================================================
-- 排产 CIP 时序 · 补 RIP/RHT/SHT(幂等 ADD COLUMN)
-- 执行时间: 2026-06-28
--
-- 背景:原 CIP 时序只建了 CIP/SIP 时长 + DHT/CHT 两个保持窗,漏了:
--   · RIP(Rinse In Place,淋洗在位):真实 DSP 里到处是「RIP &SIP」,层析/UFDF 根本不做罐式 CIP,
--     主清洗动作就是 RIP+SIP —— 缺它整条 DSP 清洗时序就缺一块(动作时长·分钟)。
--   · RHT(淋洗有效期)/ SHT(无菌有效期):RIP/SIP 的到期计时器,和 CHT 对 CIP 一样是配套保持窗。
--   完整模型 = 3 动作时长(CIP/RIP/SIP·分钟) × 4 保持窗(DHT 脏→RHT 淋洗→CHT 洁净→SHT 无菌·小时)。
--   设备与管线两张表都带全套(管线 = 转移线,可在线 RIP+SIP)。
--
-- 安全性:全部「列不存在才 ADD」(information_schema 守卫),已存在则空操作 DO 0;只新增、对既有数据
--   无损、可重跑。MySQL 8/9 不支持 ADD COLUMN IF NOT EXISTS,故用 PREPARE 守卫实现幂等。
--   纯 ADD COLUMN,符合部署护栏「严格新增自动跑」白名单,目标机自动应用、无需人工。
-- 回退: ALTER TABLE ... DROP COLUMN rip_duration_minutes / rht_hours / sht_hours(空列,无损)。
-- ============================================================

-- ---- ps_cip_equipment:补 RIP 时长 + RHT/SHT 保持窗 ----

-- rip_duration_minutes(RIP 淋洗在位时长·分钟)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='rip_duration_minutes')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN rip_duration_minutes INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- rht_hours(RHT 淋洗有效期·小时)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='rht_hours')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN rht_hours INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- sht_hours(SHT 无菌有效期·小时)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='sht_hours')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN sht_hours INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---- ps_pipeline:补 RIP/SIP 时长 + RHT/SHT 保持窗(转移线可在线灭菌)----

-- rip_duration_minutes
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_pipeline' AND column_name='rip_duration_minutes')=0,
  'ALTER TABLE ps_pipeline ADD COLUMN rip_duration_minutes INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- sip_duration_minutes
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_pipeline' AND column_name='sip_duration_minutes')=0,
  'ALTER TABLE ps_pipeline ADD COLUMN sip_duration_minutes INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- rht_hours
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_pipeline' AND column_name='rht_hours')=0,
  'ALTER TABLE ps_pipeline ADD COLUMN rht_hours INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- sht_hours
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_pipeline' AND column_name='sht_hours')=0,
  'ALTER TABLE ps_pipeline ADD COLUMN sht_hours INT NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SELECT '20260628_cip_timing_rip_rht_sht 完成:ps_cip_equipment / ps_pipeline 已补 RIP/RHT/SHT(幂等)' AS status;
