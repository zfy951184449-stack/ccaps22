-- ============================================================
-- 排产 · 设备状态机 P0(模板版):状态机模板库 + 模板化转移规则
-- 执行时间: 2026-06-28
--
-- 模型(用户拍板,对齐 10_spec D6「设备态按类自配:模板+自定义+保存复用」):
--   设备的「轮转模式」不一样 → 不把时序铺在设备表上,而是做几个【状态机模板】,设备绑模板。
--   · ps_sm_template     状态机模板库(罐式CIP-SIP / 仅CIP / 层析RIP-SIP / 一次性换袋 …,可扩)。
--   · ps_sm_transition   每个模板的转移规则(显式算子图):脏→(洁净/淋洗)→无菌 / 装→用→废。
--       时序默认值在此(duration_minutes / start_within_hours / produces_validity_hours);
--       *_col 标明设备表上同名列可【覆盖】该默认(留空=用模板默认),实现 D6 的「模板为主+设备可改」。
--   设备/管线/设备类型 的 sm_template_id 绑定列见 20260628_sm_template_bind.sql。
--
-- 两类 max-lag(都落 STN,超期=时序不可行→报冲突,绝不反推主链 D21):
--   · start_within_hours/col      = from_state 须在此窗内发生本转移(DHT:变脏后须 N 时内开洗)
--   · produces_validity_hours/col = to_state 的有效期(CHT/RHT/SHT:洗/灭完须 N 时内被用)
--
-- 幂等:CREATE TABLE IF NOT EXISTS + INSERT IGNORE,可重跑。纯新增,走部署护栏白名单。
-- 回退:DROP TABLE ps_sm_transition, ps_sm_template;
-- ============================================================

-- ---- 1. 状态机模板库 ----
CREATE TABLE IF NOT EXISTS ps_sm_template (
  id          INT          NOT NULL AUTO_INCREMENT,
  code        VARCHAR(64)  NOT NULL                COMMENT '模板编码,如 cip-sip / rip-sip',
  name        VARCHAR(120) NOT NULL                COMMENT '模板名称',
  note        VARCHAR(255) DEFAULT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1      COMMENT '停用后:已绑设备不受影响,新建绑定下拉不再出现',
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ps_sm_template_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='排产·设备状态机模板库(设备按类绑定)';

INSERT IGNORE INTO ps_sm_template (code, name, sort_order, note) VALUES
  ('cip-sip',    '罐式 CIP+SIP',      10, '不锈钢罐/容器:脏→CIP→洁净→SIP→无菌'),
  ('cip-only',   '仅 CIP(不灭菌)',   20, '脏→CIP→洁净;不做 SIP'),
  ('rip-sip',    '层析/UFDF RIP+SIP', 30, 'skid:脏→RIP→淋洗→SIP→无菌(不做罐式 CIP)'),
  ('single-use', '一次性(换袋)',     40, '无袋→装→用→报废;不清洗');

-- ---- 2. 模板的状态转移规则(默认时序值在此;设备同名列可覆盖)----
CREATE TABLE IF NOT EXISTS ps_sm_transition (
  id                      INT          NOT NULL AUTO_INCREMENT,
  template_id             INT          NOT NULL            COMMENT '归属状态机模板',
  attribute               VARCHAR(32)  NOT NULL            COMMENT '状态属性:cleanliness洁净/sterility灭菌/bag袋',
  from_state              VARCHAR(32)  NOT NULL            COMMENT '起始态',
  action                  VARCHAR(16)  NOT NULL            COMMENT '动作:CIP/RIP/SIP/INSTALL/USE',
  to_state                VARCHAR(32)  NOT NULL            COMMENT '目标态',
  duration_minutes        INT          DEFAULT NULL        COMMENT '模板默认动作时长(分钟;NULL=瞬时)',
  duration_col            VARCHAR(40)  DEFAULT NULL        COMMENT '设备表同名列可覆盖默认(NULL=不可覆盖)',
  start_within_hours      INT          DEFAULT NULL        COMMENT '模板默认:from_state 须在此窗内发生本转移(DHT 这类·小时)',
  start_within_col        VARCHAR(40)  DEFAULT NULL        COMMENT '设备表同名列可覆盖该窗',
  produces_validity_hours INT          DEFAULT NULL        COMMENT '模板默认:to_state 有效期(CHT/RHT/SHT·小时)',
  produces_validity_col   VARCHAR(40)  DEFAULT NULL        COMMENT '设备表同名列可覆盖该窗',
  requires_json           JSON         DEFAULT NULL        COMMENT '跨属性前提,如 SIP 需 {"cleanliness":["clean"]}',
  sort_order              INT          NOT NULL DEFAULT 0,
  note                    VARCHAR(255) DEFAULT NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ps_sm_transition (template_id, attribute, from_state, action),
  KEY idx_ps_sm_transition_template (template_id),
  CONSTRAINT fk_ps_sm_transition_template FOREIGN KEY (template_id) REFERENCES ps_sm_template(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='排产·状态机模板的转移规则(默认时序在此,设备列可覆盖)';

-- ---- 3. 各模板的转移种子(默认时序为常见值,用户可在模板上改、或设备上覆盖)----
INSERT IGNORE INTO ps_sm_transition
  (template_id, attribute, from_state, action, to_state, duration_minutes, duration_col, start_within_hours, start_within_col, produces_validity_hours, produces_validity_col, requires_json, sort_order, note)
-- 罐式 CIP+SIP
SELECT t.id,'cleanliness','dirty','CIP','clean',        90,'cip_duration_minutes', 24,'dht_hours', 72,'cht_hours', NULL, 10,'罐式全清洗:脏→洁净' FROM ps_sm_template t WHERE t.code='cip-sip'
UNION ALL SELECT t.id,'sterility','non_sterile','SIP','sterile', 60,'sip_duration_minutes', NULL,NULL, 48,'sht_hours', JSON_OBJECT('cleanliness',JSON_ARRAY('clean')), 20,'灭菌:需先洁净' FROM ps_sm_template t WHERE t.code='cip-sip'
UNION ALL SELECT t.id,'cleanliness','clean','USE','dirty',       NULL,NULL, NULL,NULL, NULL,NULL, NULL, 30,'用后变脏(启 DHT 倒计时)' FROM ps_sm_template t WHERE t.code='cip-sip'
-- 仅 CIP(不灭菌)
UNION ALL SELECT t.id,'cleanliness','dirty','CIP','clean',       90,'cip_duration_minutes', 24,'dht_hours', 72,'cht_hours', NULL, 10,'罐式全清洗:脏→洁净' FROM ps_sm_template t WHERE t.code='cip-only'
UNION ALL SELECT t.id,'cleanliness','clean','USE','dirty',       NULL,NULL, NULL,NULL, NULL,NULL, NULL, 20,'用后变脏' FROM ps_sm_template t WHERE t.code='cip-only'
-- 层析/UFDF RIP+SIP
UNION ALL SELECT t.id,'cleanliness','dirty','RIP','rinsed',      40,'rip_duration_minutes', 24,'dht_hours', 8,'rht_hours', NULL, 10,'淋洗在位:脏→淋洗' FROM ps_sm_template t WHERE t.code='rip-sip'
UNION ALL SELECT t.id,'sterility','non_sterile','SIP','sterile', 30,'sip_duration_minutes', NULL,NULL, 12,'sht_hours', JSON_OBJECT('cleanliness',JSON_ARRAY('rinsed')), 20,'灭菌:需先淋洗' FROM ps_sm_template t WHERE t.code='rip-sip'
UNION ALL SELECT t.id,'cleanliness','rinsed','USE','dirty',      NULL,NULL, NULL,NULL, NULL,NULL, NULL, 30,'用后变脏' FROM ps_sm_template t WHERE t.code='rip-sip'
-- 一次性(换袋)
UNION ALL SELECT t.id,'bag','none','INSTALL','installed',        NULL,NULL, NULL,NULL, NULL,NULL, NULL, 10,'装一次性袋/耗材' FROM ps_sm_template t WHERE t.code='single-use'
UNION ALL SELECT t.id,'bag','installed','USE','used',            NULL,NULL, NULL,NULL, NULL,NULL, NULL, 20,'使用后报废(换新袋=回 none)' FROM ps_sm_template t WHERE t.code='single-use';

SELECT '20260628_sm_state_transition 完成:ps_sm_template(4 模板)+ ps_sm_transition(10 转移种子)' AS status;
