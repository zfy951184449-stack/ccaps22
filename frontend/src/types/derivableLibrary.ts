/**
 * 派生库(Derivable Library / 包管理)契约 —— 派生库界面用。
 *
 * 权威设计:docs/production_scheduling/10_process_flow_model_spec.md(D2、§3.7、§4 派生引擎)。
 * 关键不变量:
 *  - 派生库 = 引擎可 **pull 派生**的辅助操作模板(kind=DERIVABLE),**不在主链人编**(D2/D3)。
 *    主链操作只声明需求目标态;引擎用 effects 索引反向 effect-matching,按需派生 CIP/SIP/配液/房间放行/装袋…。
 *  - 模板层无时间无实例:这里只是「动作 schema」,不展开、不落实例(PDDL domain,非 problem)。
 *  - 每条派生操作 = 需求(demands)+ 产出(effects:它满足哪个目标态)+ 递归前置(派生操作自身又有需求)。
 *  - 包(Package)= 编排便利、非语义必需(§3.7):可命名复用的操作组,展开即普通操作串。
 */

/** 派生操作类别(用于分组 / 配色 / 图例) */
export type DlCategory =
  | 'cip' // CIP 清洗(设备/罐/skid → clean)
  | 'sip' // SIP 灭菌(clean → sterile)
  | 'buffer-prep' // 配液(buffer / 媒介 → 已配制·效期内)
  | 'room-release' // 房间放行(未放行 → released)
  | 'bagging' // 装袋 / 完整性测试(一次性反应器前期准备)
  | 'transfer'; // 转储释放(配液罐 → 储存态,腾出罐)

/** 需求:派生操作消费方声明的「目标态」(不点名产出方,由 effect 自动匹配) */
export interface DlDemand {
  kind: 'material' | 'equipment' | 'labor' | 'utility';
  target: string; // 如 'WFI@可用'、'CIP 站@available'、'操作工 ×1'
  qty?: string; // '4000L' | '按需'
}

/** 产出:派生操作满足的目标态(= effects 索引,引擎据此反向匹配派生) */
export interface DlEffect {
  kind: 'set-equipment-state' | 'produce-material';
  target: string; // 它满足哪个目标态,如 '设备.洁净=clean'、'CEX buffer@已配制·效期内'
  shelfLife?: string; // 效期(配方常数,落批次层为 max-lag),如 'CHT 72h'、'7d'
}

/** 派生操作模板(DERIVABLE 动作 schema,无时间无实例) */
export interface DlOperation {
  id: string;
  code?: string; // 如 DRV-CIP-01
  name: string;
  category: DlCategory;
  /** 一句话:这条派生「在什么缺口下被拉动、补上什么目标态」 */
  pullTrigger: string;
  demands: DlDemand[];
  effects: DlEffect[];
  /** 递归前置说明(如 CIP 自身需 CIP 站 + WFI + 人;非空即提示引擎会继续向下回归) */
  recursiveNote?: string;
  /** 多产出择一时的优先级提示(§3.4,数字越大越优先);可选 */
  priorityNote?: string;
}

/** 可复用包(编排便利):展开即一串普通派生操作 */
export interface DlPackage {
  id: string;
  code?: string;
  name: string; // 如 '反应器前期准备'、'层析 skid准备'
  description: string;
  /** 包内操作序列(引用 DlOperation.id,顺序即展开顺序) */
  opIds: string[];
}

export interface DlLibrary {
  id: string;
  name: string;
  /** 派生说明:本库只是动作 schema,引擎在批次层按需 pull 派生、不在此手编 */
  derivedNote: string;
  operations: DlOperation[];
  packages: DlPackage[];
}

export const DL_CATEGORY_LABEL: Record<DlCategory, string> = {
  cip: 'CIP 清洗',
  sip: 'SIP 灭菌',
  'buffer-prep': '配液',
  'room-release': '房间放行',
  bagging: '装袋 / 完整性',
  transfer: '转储释放',
};

/** 类别 → CSS 变量配色(语义色 / 蓝绿琥珀红梯度,禁硬编码 hex) */
export const DL_CATEGORY_COLOR_VAR: Record<DlCategory, string> = {
  cip: 'var(--wx-blue-600)',
  sip: 'var(--wx-red-500)',
  'buffer-prep': 'var(--wx-green-600)',
  'room-release': 'var(--wx-amber-500)',
  bagging: 'var(--wx-blue-300)',
  transfer: 'var(--wx-green-300)',
};
