/**
 * 工艺流模板(domain / 模板层)契约 —— 主工艺构建界面用。
 *
 * 权威设计:docs/production_scheduling/10_process_flow_model_spec.md(§3 概念模型、§3.7 钩子)。
 * 关键不变量:
 *  - 模板层 = 规划域:**无时间、无实例**(D4)。这里只编「主工艺链」(人编 PRIMARY)。
 *  - 辅助操作(CIP/SIP/配液/房间放行)**不在模板层**——由引擎在批次层按需求自动派生(D2/D3)。
 *  - 操作 = 需求(demands)+ 产出(effects),声明式、对称(D2)。
 *  - 时序 = 钉子+弹簧(相对,非绝对日期);FS/SS 为退化特例(D11)。
 */

export type PfPhase = 'USP' | 'DSP';

/** 需求:消费方声明的「目标态」(不点名产出方,effect 自动匹配) */
export interface PfDemand {
  kind: 'material' | 'equipment' | 'labor' | 'utility';
  target: string; // 目标态,如 '培养基@已配制·效期内'、'反应器·袋=installed'、'CEX skid@clean∧sterile'
  qty?: string; // '4000L'(模型层 fixed)| '按需'(批次层 batch)
}

/** 产出:操作的 effect(本身即索引,谁产出某态) */
export interface PfEffect {
  kind: 'produce-material' | 'set-equipment-state' | 'consume-material';
  target: string; // '培养液@ready'、'反应器.袋=used'
  shelfLife?: string; // 效期(配方常数),如 '24h' → 批次层落为 max-lag
}

/** 钉子+弹簧时序关系(相对,无绝对时间) */
export interface PfTemporal {
  refOpId?: string; // 参照操作(默认前一道)
  relation: 'after' | 'within' | 'daily' | 'zero-wait'; // 接续 / 窗内 / 每日 / 零等待
  windowText?: string; // '0–4h'、'±8h'、'次日'
  hard?: boolean;
}

export interface PfOperation {
  id: string;
  code?: string; // 如 OP-00048
  name: string;
  anchor: boolean; // 钉子(位置可定/固定)vs 弹簧(落点由调度定)
  interruptible?: boolean; // false = 不可中断块(如 USP 培养)
  durationText?: string; // 标称时长(模板层仅参考),如 '6h'、'10d'
  people?: number;
  demands: PfDemand[];
  effects: PfEffect[];
  temporal?: PfTemporal;
}

/** 生成规则钩子(挂主链上,不展开;批次层才派生)*/
export interface PfHook {
  id: string;
  type: 'push-calendar' | 'push-count' | 'pull' | 'link';
  label: string; // '每日取样'、'AC Cycle ×4'、'收获→AC 接力'
  boundTo: string; // 绑哪段(stageId / opId)
  note?: string;
}

export interface PfStage {
  id: string;
  name: string;
  phase: PfPhase;
  operations: PfOperation[];
}

export interface PfTemplate {
  id: string;
  code: string;
  name: string;
  stages: PfStage[];
  hooks: PfHook[];
  /** 派生说明:本模板只含主链;辅助由引擎在批次层自动派生 */
  derivedNote: string;
}

export const PF_HOOK_LABEL: Record<PfHook['type'], string> = {
  'push-calendar': 'push·日历',
  'push-count': 'push·计次',
  pull: 'pull·拉动派生',
  link: 'link·主链接力',
};
