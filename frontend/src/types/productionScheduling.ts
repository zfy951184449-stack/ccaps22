/**
 * 排产(production scheduling)领域契约 —— 结果 / 调度视图
 *
 * 权威设计:docs/production_scheduling/{50_end_to_end_flow,10_process_flow_model_spec,40_scheduling_layer_spec}.md
 * 关键不变量(见 CLAUDE.md「Production scheduling」):
 *  - v1 纯传播、无求解器;主链(工艺步钉子 + Day0)是墙;双闸派发。
 *  - 时间单位 = 相对时间轴原点的「小时」(originDate 绑小时 0),与 WxbGanttChart 对齐。
 *
 * 注:这是新独立模型的前端契约(camelCase);后端引擎(新建 Python/Flask 微服务)产出 JSON 时按此对接。
 */

/** 操作类别 —— 决定甘特配色与语义(见 10_spec 操作 schema / 生成钩子) */
export type PsOpCategory =
  | 'usp-main' // USP 主工艺步(钉子)
  | 'dsp-main' // DSP 主工艺步(钉子)
  | 'cip' // CIP 清洗(派生)
  | 'sip' // SIP 灭菌(派生)
  | 'buffer-prep' // 配液(派生,pull)
  | 'room-release' // 房间放行(派生)
  | 'sampling' // 取样(push 日历钩子派生)
  | 'campaign'; // 攒批 campaign 配制(跨批)

/** PRIMARY = 人编主链;DERIVED = 引擎派生(目标回归 / 钩子) */
export type PsOpKind = 'PRIMARY' | 'DERIVED';

/** 资源占用(主设备 / CIP 站 / 配液罐 / 房间 / 储存容器) */
export interface PsResourceUse {
  kind: 'equipment' | 'cip-station' | 'prep-tank' | 'room' | 'storage';
  id: string; // 资源实例 / 站 id,如 'CIP-S1'、'AKTA-1850'
  label: string;
  line?: string; // CIP 拓扑:所属管线(设备→管线→{主站,备站})
  isBackup?: boolean; // CIP 备站(仅应急,排产不默认占用)
}

/** 攒批领用:某批从 campaign 大令牌扣量(最小数量账) */
export interface PsCampaignDraw {
  batchId: string;
  qty: number;
  consumeOpId: string; // 在哪道操作消耗
  dueHour: number; // 领用时刻(相对原点小时),须落在 campaign 效期窗内
}

/** 攒批 campaign(跨批共用的料,见 40_spec §10 / C14) */
export interface PsCampaign {
  id: string;
  materialCode: string;
  materialName: string;
  totalQty: number;
  unit: string;
  shelfLifeHours: number;
  scope: 'in-batch' | 'cross-batch'; // (A) 限本批 / (B) 跨多批
  prepOpId: string; // 配制操作 id
  draws: PsCampaignDraw[];
  cipSaved: number; // 省下的配液 + CIP 次数(决策支持,削 Day5 尖峰)
}

/** 一道排定的操作(结果态) */
export interface PsScheduledOp {
  id: string;
  code?: string; // 如 OP-00048
  name: string;
  kind: PsOpKind;
  category: PsOpCategory;
  batchId: string;
  stageId: string;
  startHour: number;
  endHour: number;
  /** 钉子+弹簧:派生操作的可行窗 [最早,最晚](主链钉子无窗) */
  windowStartHour?: number;
  windowEndHour?: number;
  isAnchor?: boolean; // 主链钉子(Day0 / 收获等),引擎绝不自动挪
  interruptible?: boolean; // false = 不可中断块(如 USP 培养),整块平移
  requiredPeople?: number;
  resource?: PsResourceUse;
  conflict?: 'CYCLE' | 'WINDOW' | 'OVERLAP'; // 报增援 / 冲突标记
  note?: string;
}

export interface PsStage {
  id: string;
  batchId: string;
  name: string;
  phase: 'USP' | 'DSP';
}

export interface PsBatch {
  id: string;
  code: string;
  productName: string;
  day0Hour: number; // Day0 锚点(TAT 定,相对原点小时)
}

/** 工序间时序关系(主链 FS / 收获→AC 接力 / 效期 max-lag) */
export interface PsDependency {
  id: string;
  fromOpId: string;
  toOpId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lagHours?: number;
  relation?: 'main-chain' | 'handoff' | 'expiry-maxlag';
  hard?: boolean; // 硬约束(甘特 level 1);软 = level 2
}

/** 一份排产结果(喂结果甘特) */
export interface PsSchedule {
  id: string;
  name: string;
  originDate: string; // 时间轴原点真实日期(绑小时 0),如 '2026-09-17'
  batches: PsBatch[];
  stages: PsStage[];
  operations: PsScheduledOp[];
  dependencies: PsDependency[];
  campaigns: PsCampaign[];
  /** 资源争用尖峰(真实数据:Day5 = 16 CIP) */
  cipPeak?: { dayIndex: number; count: number; label: string };
}
