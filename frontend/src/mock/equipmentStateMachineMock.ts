/**
 * 设备状态机 mock(模板层,无时间、无实例)—— 设备状态机编辑器界面用。
 * 照 docs/production_scheduling/10_process_flow_model_spec.md §3.3 的四个真实例:
 *  ① 反应器 ABEC(SUS,一次性):attr 袋 —— 无 CIP/SIP。
 *  ② 配液罐/层析 skid(SS):attr 洁净 + attr 灭菌(SIP 前提 洁净=clean)—— 有 CIP/SIP + DHT/CHT。
 *  ③ 房间:attr 放行 —— 「房间放行」= 产出 released 的 DERIVABLE 转移(与 CIP 同机制)。
 *  ④ 树脂柱:attr 寿命=计数(N cycle + 日历过期)+ 产品绑定 + 洁净/灭菌。
 * CIP/SIP/装袋/换柱/房间放行 等转移标 origin='derivable'(引擎按需 pull 派生);投产/接种等标 'primary'。
 */
import type { EsmCatalog, EsmEquipmentClass } from '../types/equipmentStateMachine';

// ① 反应器 ABEC(SUS,一次性):attr 袋,无 CIP/SIP
const reactorAbec: EsmEquipmentClass = {
  id: 'reactor-abec',
  name: '反应器(ABEC 4000L · SUS)',
  code: 'EQ-ABEC-4000',
  fabrication: 'SUS',
  summary: '一次性袋式反应器:换袋即复位,无 CIP/SIP。复位靠耗材而非清洗。',
  hasCip: false,
  attributes: [
    {
      id: 'bag',
      name: '袋',
      attrType: 'discrete',
      readyText: 'ready := 袋=installed',
      values: [
        { id: 'none', label: '无袋', initial: true, note: '到货 / 换袋取走旧袋后' },
        { id: 'installed', label: 'installed', ready: true, note: '已装袋,可投产' },
        { id: 'used', label: 'used', note: '本批投产后袋已用,须换袋复位' },
      ],
      transitions: [
        { id: 't-bag-install', from: 'none', to: 'installed', operation: '装袋', origin: 'derivable', note: '消耗 袋耗材 + 人;含完整性测试 / 电极安装' },
        { id: 't-bag-prod', from: 'installed', to: 'used', operation: '投产', origin: 'primary', note: '主链消费(灌注/培养)→ 袋变 used' },
        { id: 't-bag-change', from: 'used', to: 'installed', operation: '换袋', origin: 'derivable', note: '取走旧袋装新袋 = 一次性复位(替代 CIP)' },
      ],
    },
  ],
  readyText: 'ready := 袋=installed',
  note: 'SUS 一次性:无洁净/灭菌状态线;污染防护靠单批次抛弃袋。',
};

// ② 配液罐 / 层析 skid(SS):attr 洁净 + attr 灭菌
const prepTank: EsmEquipmentClass = {
  id: 'prep-tank',
  name: '配液罐 / 层析 skid(SS)',
  code: 'EQ-SS-PREP',
  fabrication: 'SS',
  summary: '不锈钢可复用:CIP 清洗 + SIP 灭菌两条属性线;CHT 洁净有效期 + DHT 脏停放双钟。',
  hasCip: true,
  attributes: [
    {
      id: 'clean',
      name: '洁净',
      attrType: 'discrete',
      readyText: 'clean 是 ready 前提之一',
      values: [
        { id: 'dirty', label: 'dirty', initial: true, note: '上批投产后变脏;DHT 起算' },
        { id: 'clean', label: 'clean', ready: true, note: 'CIP 后洁净;CHT 起算,超期须重洗' },
      ],
      transitions: [
        { id: 't-clean-cip', from: 'dirty', to: 'clean', operation: 'CIP', origin: 'derivable', clock: 'CHT', clockText: 'CHT 72h', note: '被「需求:洁净=clean」拉动派生;占 CIP 站(容量=1)' },
        { id: 't-clean-prod', from: 'clean', to: 'dirty', operation: '投产', origin: 'primary', clock: 'DHT', clockText: 'DHT 8h', note: '主链消费后变 dirty;须在 DHT 内开始 CIP,否则违规' },
      ],
    },
    {
      id: 'sterile',
      name: '灭菌',
      attrType: 'discrete',
      readyText: 'sterile 是 ready 前提之一',
      values: [
        { id: 'non-sterile', label: '未灭', initial: true },
        { id: 'sterile', label: 'sterile', ready: true, note: 'SIP 后无菌;带有效期' },
      ],
      transitions: [
        {
          id: 't-sterile-sip',
          from: 'non-sterile',
          to: 'sterile',
          operation: 'SIP',
          origin: 'derivable',
          clock: 'shelf-life',
          clockText: '有效期 48h',
          preconditions: [{ attrId: 'clean', value: 'clean', label: '洁净=clean' }],
          note: '前提:须先 CIP 到 clean(跨属性前提);超有效期须重灭',
        },
        { id: 't-sterile-break', from: 'sterile', to: 'non-sterile', operation: '投产 / 开盖破菌', origin: 'primary', note: '主链消费破坏无菌态' },
      ],
    },
  ],
  readyText: 'ready := 洁净=clean ∧ 灭菌=sterile',
  note: 'SIP 挂跨属性前提「洁净=clean」:CIP 与 SIP 顺序由前提锁定。DHT/CHT 与物料效期同为 max-lag。',
};

// ③ 房间:attr 放行
const room: EsmEquipmentClass = {
  id: 'room',
  name: '房间(洁净区 / Suite)',
  code: 'EQ-ROOM',
  fabrication: 'fixed',
  summary: '房间 = 一类设备 + 放行状态机。「房间放行」= 产出 released 的 DERIVABLE 转移(与 CIP 同机制)。',
  hasCip: false,
  attributes: [
    {
      id: 'release',
      name: '放行',
      attrType: 'discrete',
      readyText: 'ready := 放行=released',
      values: [
        { id: 'not-released', label: '未放行', initial: true, note: '换批 / 清场后默认未放行' },
        { id: 'released', label: 'released', ready: true, note: '清场+环境监测+QA 放行后;CHT 洁净有效期' },
      ],
      transitions: [
        {
          id: 't-room-release',
          from: 'not-released',
          to: 'released',
          operation: '房间放行',
          origin: 'derivable',
          clock: 'CHT',
          clockText: 'CHT 24h',
          note: '清场 / 环境监测 / QA 放行;被「需求:房间=released」拉动派生 → 给目标回归补叶子',
        },
        { id: 't-room-soil', from: 'released', to: 'not-released', operation: '投产 / 跨批切换', origin: 'primary', note: '主链占用后失效;Suite 互斥另由 suite_id 约束(§3.3)' },
      ],
    },
  ],
  readyText: 'ready := 放行=released',
  note: '与 CIP 同机制的 DERIVABLE 转移,避免目标回归不终止(给房间需求补 producer / 叶子)。',
};

// ④ 树脂柱:计数寿命 + 产品绑定 + 洁净/灭菌
const resinColumn: EsmEquipmentClass = {
  id: 'resin-column',
  name: '树脂柱 / 层析填料',
  code: 'EQ-COLUMN',
  fabrication: 'consumable',
  summary: '跨批持久设备实例:计数寿命(N cycle + 日历)+ 产品绑定 + 洁净/灭菌;换柱 = 寿命清零的 DERIVABLE 转移。',
  hasCip: true,
  crossBatch: true,
  attributes: [
    {
      id: 'resin-life',
      name: '树脂寿命',
      attrType: 'counter',
      readyText: 'ready 前提:寿命 in-life(计数<上限 ∧ 未到日历效期)',
      counter: { unit: 'cycle', limit: 200, current: 142, calendarExpiryText: '或装柱后 90 天', productBound: true },
      values: [
        { id: 'fresh', label: '新柱(寿命清零)', initial: true, note: '换柱后计数=0,绑当前产品' },
        { id: 'in-life', label: 'in-life(在寿命)', ready: true, note: '计数<上限 且 在日历效期内' },
        { id: 'expired', label: '失效(超限)', note: '计数达上限 或 超日历效期 → 作废,须换柱' },
      ],
      transitions: [
        { id: 't-resin-mount', from: 'expired', to: 'fresh', operation: '换柱 / 装柱', origin: 'derivable', resetCount: true, note: '消耗 树脂+装柱站+人 → 产出新柱:计数清零、绑当前产品' },
        { id: 't-resin-cycle', from: 'in-life', to: 'in-life', operation: '层析循环(投产)', origin: 'primary', countDelta: 1, note: '每用一次 +1 cycle' },
        { id: 't-resin-fresh-cycle', from: 'fresh', to: 'in-life', operation: '首次投产', origin: 'primary', countDelta: 1, note: '新柱首次使用进入 in-life' },
        { id: 't-resin-wear', from: 'in-life', to: 'expired', operation: '达上限 / 到效期', origin: 'primary', note: '计数达上限或日历超期触发(或人工 pin「性能不行」)' },
      ],
    },
    {
      id: 'col-clean',
      name: '洁净 / 灭菌',
      attrType: 'discrete',
      readyText: 'clean ∧ sterile 是 ready 前提',
      values: [
        { id: 'dirty', label: 'dirty', initial: true },
        { id: 'clean-sterile', label: 'clean ∧ sterile', ready: true, note: '层析 skid CIP+SIP 后' },
      ],
      transitions: [
        { id: 't-col-cip', from: 'dirty', to: 'clean-sterile', operation: 'CIP + SIP', origin: 'derivable', clock: 'CHT', clockText: 'CHT 72h', note: '与 SS skid同机制' },
        { id: 't-col-prod', from: 'clean-sterile', to: 'dirty', operation: '投产', origin: 'primary', clock: 'DHT', clockText: 'DHT 8h', note: '主链消费后变脏' },
      ],
    },
  ],
  readyText: 'ready := 已装柱 ∧ 在寿命 ∧ 洁净∧灭菌 ∧ 绑当前产品',
  note: '四情形(不派生 / 切项目换 / 到效期换 / 人工 pin「性能不行」)= 同一按需 pull 派生,只是「需求满足不了」的原因不同。',
};

export function buildEsmCatalog(): EsmCatalog {
  return {
    id: 'esm-wbp2486',
    title: '设备状态机库 — WBP2486 工艺涉及设备类',
    spec: 'docs/production_scheduling/10_process_flow_model_spec.md §3.3',
    classes: [reactorAbec, prepTank, room, resinColumn],
  };
}
