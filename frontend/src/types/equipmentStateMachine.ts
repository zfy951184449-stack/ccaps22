/**
 * 设备状态机(domain / 模板层)契约 —— 设备状态机编辑器界面用。
 *
 * 权威设计:docs/production_scheduling/10_process_flow_model_spec.md §3.3(设备与状态机)。
 * 关键不变量:
 *  - 设备状态 = **多属性状态向量**;每属性一条独立时间线 = 一个小状态机 `{值集, 转移边=操作, 过期钟}`(D)。
 *  - 属性三类(§3.3):**离散态**(洁净 clean/dirty)、**计数/消耗**(树脂寿命 N cycle)、**日历过期**(CHT 类时间)。
 *  - 转移边 = 一道操作;可挂**跨属性前提**(如 SIP 前提「洁净=clean」)。
 *  - 过期钟两类:**CHT**(洁净/灭菌有效期,clean/sterile 令牌带过期时刻)与 **DHT**(脏停放,变 dirty 后须开始 CIP)。
 *  - 模板层 = 无时间、无实例:这里只声明状态机的结构(值集/转移/过期钟规则),不含批次落点。
 *  - 转移边按是否人编分类:PRIMARY(主链人编,如「投产」)vs DERIVABLE(引擎按需 pull 派生,如 CIP/SIP/装袋/房间放行)。
 */

/** 属性类型(§3.3 三类) */
export type EsmAttrType = 'discrete' | 'counter' | 'calendar';

/** 过期钟类型 */
export type EsmClockType = 'CHT' | 'DHT' | 'shelf-life' | 'none';

/** 转移边来源:人编主链 vs 引擎派生 */
export type EsmEdgeOrigin = 'primary' | 'derivable';

/** 设备类制造类型:SUS = 一次性(换袋复位,无 CIP/SIP);SS = 不锈钢(有 CIP/SIP) */
export type EsmFabrication = 'SUS' | 'SS' | 'fixed' | 'consumable';

/** 状态机里的一个状态值(节点) */
export interface EsmStateValue {
  id: string; // 'clean'、'dirty'、'installed'
  label: string; // 显示名,如 '洁净 clean'
  initial?: boolean; // 是否初始态(设备到货/复位后的默认值)
  ready?: boolean; // 是否「就绪」目标态之一(被 ready := 引用)
  note?: string;
}

/** 跨属性前提(转移边可挂):另一属性须处于某值 */
export interface EsmEdgePrecondition {
  attrId: string; // 另一条属性线,如 'clean'
  value: string; // 须等于的值 id,如 'clean'
  label: string; // 显示文案,如 '洁净=clean'
}

/** 一条转移边(= 一道操作) */
export interface EsmTransition {
  id: string;
  from: string; // 源状态 value id
  to: string; // 目标状态 value id
  operation: string; // 边上的操作名,如 'CIP'、'SIP'、'装袋'、'投产'、'换袋'、'房间放行'
  origin: EsmEdgeOrigin; // primary(人编)| derivable(引擎派生)
  clock?: EsmClockType; // 该转移产出态携带的过期钟(CHT/DHT/shelf-life)
  clockText?: string; // 过期钟显示文案,如 'CHT 72h'、'DHT 8h'、'有效期 7d'
  preconditions?: EsmEdgePrecondition[]; // 跨属性前提
  countDelta?: number; // 计数属性:本转移对计数的增量(如 +1 cycle)
  resetCount?: boolean; // 计数属性:本转移是否清零(如「换柱」寿命清零)
  note?: string;
}

/** 计数/消耗属性的元数据(attrType=counter 时有效) */
export interface EsmCounterMeta {
  unit: string; // 'cycle'
  limit: number; // 上限,达上限作废
  current?: number; // 模板层示意当前计数(实例层才真实演进)
  calendarExpiryText?: string; // 计数属性常叠加日历过期,如 '或装柱后 90 天'
  productBound?: boolean; // 是否产品绑定(树脂柱)
}

/** 一条属性 = 一个小状态机 */
export interface EsmAttribute {
  id: string; // 'clean'、'sterile'、'bag'、'resin-life'、'release'
  name: string; // '洁净'、'灭菌'、'袋'、'树脂寿命'、'放行'
  attrType: EsmAttrType;
  values: EsmStateValue[];
  transitions: EsmTransition[];
  readyText?: string; // ready 派生公式文案,如 '洁净=clean ∧ 灭菌=sterile'
  counter?: EsmCounterMeta; // attrType=counter 时
  note?: string;
}

/** 一个设备类 */
export interface EsmEquipmentClass {
  id: string; // 'reactor-abec'、'prep-tank'、'room'、'resin-column'
  name: string; // '反应器(ABEC 4000L)'
  code?: string; // 'EQ-ABEC-4000'
  fabrication: EsmFabrication;
  summary: string; // 一句话定位
  hasCip: boolean; // 是否有 CIP/SIP(SUS 一次性无)
  crossBatch?: boolean; // 跨批持久(树脂柱)
  attributes: EsmAttribute[];
  readyText?: string; // 设备级就绪公式(汇总各属性 ready)
  note?: string;
}

export interface EsmCatalog {
  id: string;
  title: string;
  spec: string; // 权威出处文案
  classes: EsmEquipmentClass[];
}

// ── 展示常量 ──

export const ESM_ATTR_TYPE_LABEL: Record<EsmAttrType, string> = {
  discrete: '离散态',
  counter: '计数消耗',
  calendar: '日历过期',
};

/** 属性类型 → WxbTag 颜色 */
export const ESM_ATTR_TYPE_COLOR: Record<EsmAttrType, 'blue' | 'green' | 'amber'> = {
  discrete: 'blue',
  counter: 'green',
  calendar: 'amber',
};

export const ESM_CLOCK_LABEL: Record<EsmClockType, string> = {
  CHT: 'CHT 洁净有效期',
  DHT: 'DHT 脏停放',
  'shelf-life': '有效期',
  none: '',
};

export const ESM_EDGE_ORIGIN_LABEL: Record<EsmEdgeOrigin, string> = {
  primary: '主链人编',
  derivable: '引擎派生',
};
