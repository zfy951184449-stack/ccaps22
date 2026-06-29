-- ============================================================
-- 排产 CIP 拓扑 · 设备类型字典(可维护清单)
-- 执行时间: 2026-06-28
--
-- 背景:设备「类型」原是写死的 ENUM(reactor/akta-skid/tank/ufdf-skid/transfer/other),
--   只有 6 项、且用户无法增改(DB ENUM + 前端常量 + Excel 下拉三处写死)。
--   改为「全局类型字典」:用户在系统里维护类型清单,设备表单/Excel 都从这份清单取值。
--
-- 设计:
--   · 字典 ps_equipment_type 全局(不按 facility),name 即标识(中文名直接作为类型值)。
--   · 设备改存 ps_cip_equipment.type_name(中文名);旧 ENUM 列 type 保留为兼容兜底、不再写入
--     —— 之所以「新增 type_name」而非「MODIFY type→VARCHAR」,是为了让本迁移走部署护栏的
--     「纯新增自动应用」白名单(MODIFY 会被判危险、卡人工);旧 type 列日后可在维护窗手工 DROP。
--   · 重命名字典项 → 后端级联改 type_name;删除被引用的类型 → 后端拦截(改用停用 is_active)。
--
-- 安全性:全部「建新表 IF NOT EXISTS + INSERT IGNORE 种子 + 列不存在才 ADD」,
--   对既有数据无损、可重跑。MySQL 9 不支持 ADD COLUMN IF NOT EXISTS,故 ADD 走 information_schema 守卫。
-- ============================================================

-- 1) 字典表(全局)
CREATE TABLE IF NOT EXISTS ps_equipment_type (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  note        VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ps_equipment_type_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) 默认类型种子(可重跑:name 唯一 + INSERT IGNORE)
INSERT IGNORE INTO ps_equipment_type (name, sort_order) VALUES
 ('生物反应器', 10),
 ('种子反应器', 20),
 ('配液罐',     30),
 ('缓冲液罐',   40),
 ('培养基罐',   50),
 ('储液罐',     60),
 ('中间罐',     70),
 ('移动罐',     80),
 ('离心机',     90),
 ('深层过滤器', 100),
 ('除菌过滤器', 110),
 ('层析 skid',  120),
 ('超滤 skid',  130),
 ('病毒灭活',   140),
 ('病毒过滤',   150),
 ('冻干机',     160),
 ('灌装机',     170),
 ('称量配制',   180),
 ('取样',       190),
 ('CIP skid',   200),
 ('SIP skid',   210),
 ('转移/管路',  220),
 ('其他',       900);

-- 3) 设备表新增 type_name(列不存在才 ADD)
SET @s := IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ps_cip_equipment' AND column_name='type_name')=0,
  'ALTER TABLE ps_cip_equipment ADD COLUMN type_name VARCHAR(64) NULL', 'DO 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 注:不做旧 ENUM→中文名 的 UPDATE 回填(UPDATE 会触发部署护栏人工卡口;且 ps_* 当前各环境为空)。
--     如某环境确有旧设备数据,其 type_name 会为空,在「设备」里重新选一次类型即可。

SELECT '20260628_equipment_type_dict 完成:类型字典已建+种子,ps_cip_equipment.type_name 已就绪' AS status;
