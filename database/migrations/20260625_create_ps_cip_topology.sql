-- ============================================================
-- 排产资源模型 · 第一刀:CIP 站拓扑 + 物料效期
-- 执行时间: 2026-06-25
--
-- 目的:
--   建立排产引擎做「CIP 容量落点」所需的最小资源模型,用来复现并验证
--   WBP2486 已知的 Day5 CIP 尖峰(同刻 16 次清洗争 1 台 CIP 站)。
--   只建结构,不种数据 —— 真实 CIP 拓扑(设备-管线-站)由用户在平台录入(无 mock)。
--
-- 设计要点(对齐 docs/production_scheduling 的 D20 / C10 / C11):
--   · 清洗对象有两类、平级:设备(罐/单元)与 管线(设备-设备的连接,如 pouA-PT)。
--   · 每个清洗对象「直接归属一个 CIP 站」(它由哪个站洗记在自己身上),无中间路由层。
--     管线额外有 起点设备 / 终点设备(都引用已录设备)。一台站可洗多个对象。
--   · 设备有「清洗方式 cleaning_mode」:cip(归属一个 CIP 站)/ single-use(一次性免洗,如一次性反应器)
--     / cop(离线清洗)/ other。仅 cip 时 cip_station_id 有效;非 cip 设备不进 CIP 排程。
--   · 房间 ps_room(物理位置)归属一个组织单元(软链 organization_units,排班 team 即在该表);
--     设备挂 room_id + 可选 org_unit_id(留空随房间)。组织绑定让排产→排班共用同一套组织。
--     suite / 产线 等更高层级本期不做。
--   · 暂不做备用站;capacity = 站可并行清洗的对象数,通常 1。
--   · ps_* 表族独立于通用 resources 表(后者要喂 V4 排班,不污染);
--     设备身份不重复录入 —— 通过可空 resource_id 软链回 resources.id,
--     第一刀该列留空,等设备主数据导入后按 code 回填对齐。
--   · 与 Phase 0A 表零硬 FK 耦合,互不阻塞。
--
-- 幂等: 全部 CREATE TABLE IF NOT EXISTS,重复执行安全。
-- 回退: DROP TABLE ps_shelf_life, ps_pipeline, ps_cip_equipment, ps_room, ps_cip_station;
-- ============================================================

-- ---- 1. CIP 站(共享资源,容量恒 1)----
CREATE TABLE IF NOT EXISTS ps_cip_station (
  id             INT          NOT NULL AUTO_INCREMENT,
  facility_code  VARCHAR(32)  NOT NULL                COMMENT '设施编码(多设施隔离)',
  code           VARCHAR(64)  NOT NULL                COMMENT 'CIP 站编码,如 CIP-S1',
  name           VARCHAR(120) NOT NULL                COMMENT 'CIP 站名称',
  org_unit_id    INT          DEFAULT NULL            COMMENT '归属 team(软链 organization_units.id,只到 team 层级)',
  capacity       TINYINT      NOT NULL DEFAULT 1      COMMENT '容量:可并行清洗的回路数,通常为 1',
  resource_id    INT          DEFAULT NULL            COMMENT '软链 resources.id(设备身份只读链回,可空后填)',
  note           VARCHAR(255) DEFAULT NULL            COMMENT '备注',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ps_cip_station_code (facility_code, code),
  KEY idx_ps_cip_station_org (org_unit_id),
  KEY idx_ps_cip_station_resource (resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='排产·CIP 站(容量 1 的共享清洗资源)';

-- ---- 2. 房间:物理位置,归属一个组织单元(部门/team/组,软链 organization_units)----
CREATE TABLE IF NOT EXISTS ps_room (
  id              INT          NOT NULL AUTO_INCREMENT,
  facility_code   VARCHAR(32)  NOT NULL                COMMENT '设施编码',
  code            VARCHAR(64)  NOT NULL                COMMENT '房间编码',
  name            VARCHAR(120) NOT NULL                COMMENT '房间名称',
  org_unit_id     INT          DEFAULT NULL            COMMENT '归属组织单元(软链 organization_units.id,排班 team 即在该表)',
  cleanroom_class ENUM('A','B','C','D','CNC')         DEFAULT NULL COMMENT '洁净级别(CNC=非控)',
  note            VARCHAR(255) DEFAULT NULL            COMMENT '备注',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ps_room_code (facility_code, code),
  KEY idx_ps_room_org (org_unit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='排产·房间(物理位置 → 组织单元)';

-- ---- 3. CIP 设备/罐:清洗对象,归属站 + 所在房间 + 部门(留空随房间)----
CREATE TABLE IF NOT EXISTS ps_cip_equipment (
  id             INT          NOT NULL AUTO_INCREMENT,
  facility_code  VARCHAR(32)  NOT NULL                COMMENT '设施编码',
  code           VARCHAR(64)  NOT NULL                COMMENT '设备编码,如 PT1810 / pouA',
  name           VARCHAR(120) NOT NULL                COMMENT '设备名称',
  type           ENUM('reactor','akta-skid','tank','ufdf-skid','transfer','other')
                              NOT NULL DEFAULT 'other' COMMENT '设备类型',
  cleaning_mode  ENUM('cip','single-use','cop','other')
                              NOT NULL DEFAULT 'cip'   COMMENT '清洗方式/策略:cip在线 / single-use一次性免洗 / cop离线 / other',
  cip_station_id INT          DEFAULT NULL            COMMENT '由哪个 CIP 站清洗(仅清洗方式=cip 时有效)',
  room_id        INT          DEFAULT NULL            COMMENT '所在房间',
  org_unit_id    INT          DEFAULT NULL            COMMENT '归属组织单元(软链 organization_units.id,留空则随所在房间)',
  resource_id    INT          DEFAULT NULL            COMMENT '软链 resources.id(设备身份不重录,可空后填)',
  note           VARCHAR(255) DEFAULT NULL            COMMENT '备注',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ps_cip_equipment_code (facility_code, code),
  KEY idx_ps_cip_equipment_station (cip_station_id),
  KEY idx_ps_cip_equipment_room (room_id),
  KEY idx_ps_cip_equipment_org (org_unit_id),
  KEY idx_ps_cip_equipment_resource (resource_id),
  CONSTRAINT fk_ps_cip_equipment_station FOREIGN KEY (cip_station_id) REFERENCES ps_cip_station(id),
  CONSTRAINT fk_ps_cip_equipment_room FOREIGN KEY (room_id) REFERENCES ps_room(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='排产·CIP 设备/罐(清洗对象 → 站 + 房间)';

-- ---- 3. 管线:设备-设备的连接,本身是清洗对象,直接归属一个 CIP 站 ----
CREATE TABLE IF NOT EXISTS ps_pipeline (
  id                INT          NOT NULL AUTO_INCREMENT,
  facility_code     VARCHAR(32)  NOT NULL             COMMENT '设施编码',
  code              VARCHAR(64)  NOT NULL             COMMENT '管线编码,如 pouA-PT',
  name              VARCHAR(120) NOT NULL             COMMENT '管线名称',
  from_equipment_id INT          NOT NULL             COMMENT '起点设备',
  to_equipment_id   INT          NOT NULL             COMMENT '终点设备',
  cip_station_id    INT          NOT NULL             COMMENT '由哪个 CIP 站清洗',
  note              VARCHAR(255) DEFAULT NULL         COMMENT '备注',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ps_pipeline_code (facility_code, code),
  KEY idx_ps_pipeline_station (cip_station_id),
  KEY idx_ps_pipeline_from (from_equipment_id),
  KEY idx_ps_pipeline_to (to_equipment_id),
  CONSTRAINT fk_ps_pipeline_station FOREIGN KEY (cip_station_id) REFERENCES ps_cip_station(id),
  CONSTRAINT fk_ps_pipeline_from FOREIGN KEY (from_equipment_id) REFERENCES ps_cip_equipment(id),
  CONSTRAINT fk_ps_pipeline_to   FOREIGN KEY (to_equipment_id)   REFERENCES ps_cip_equipment(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='排产·管线(设备-设备连接,清洗对象 → 站)';

-- ---- 4. 物料/设备效期常数(CHT/DHT 的来源,落为批次层 max-lag)----
CREATE TABLE IF NOT EXISTS ps_shelf_life (
  id               INT          NOT NULL AUTO_INCREMENT,
  facility_code    VARCHAR(32)  NOT NULL             COMMENT '设施编码',
  material         VARCHAR(120) NOT NULL             COMMENT '物料/对象,如 培养基 / AC buffer / 碱液 / 洁净设备',
  category         ENUM('media','buffer','cleaning-agent','intermediate','reagent','equipment-clean')
                                NOT NULL              COMMENT '类别',
  shelf_life_hours INT          NOT NULL             COMMENT '效期(小时),如 24 / 72 / 168',
  basis            ENUM('after_produced','after_prepared','after_clean')
                                NOT NULL DEFAULT 'after_produced' COMMENT '效期起算基准',
  note             VARCHAR(255) DEFAULT NULL         COMMENT '说明(→ 批次层生产者→消费者 max-lag)',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ps_shelf_life (facility_code, material, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='排产·物料/设备效期常数(CHT/DHT)';

SELECT '20260625_create_ps_cip_topology 完成:ps_cip_station / ps_pipeline / ps_cip_equipment / ps_shelf_life' AS status;
