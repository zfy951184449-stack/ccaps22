/**
 * 排产资源主数据(production scheduling resource master)契约 —— 排产专属维度,模板层无时间无实例。
 *
 * 权威设计:docs/production_scheduling/40_scheduling_layer_spec.md(§5 资源 / C10、C11、C16)、
 *           docs/production_scheduling/10_process_flow_model_spec.md(§3.3 共享清洗/配制资源拓扑 / D20)。
 *
 * 关键不变量(违反即与设计矛盾):
 *  - CIP 站:独立资源、跨部门共用、**容量 = 1**;拓扑三层 **设备/罐 → 管线 → {主站, 备站}**;
 *    引擎只往「主站」排,主站塞不下 → **报增援**,动备站交给人(备站=人工应急余量,D20/C10)。
 *  - 配液罐:配制期短占 + 转储释放、通常非瓶颈;溶液在效期内占的是**储存容器**(C11)。
 *  - 房间:带「放行」状态机的设备实例 + suite 归属;同 suite 同刻不得并行 pre/post-viral(suite 互斥,审计强约束)。
 *  - 物料效期:配方常数(培养基 24h、各 buffer 24–72h、碱液 7d 等)→ 批次层落为生产者→消费者 max-lag。
 *  这些都是「主数据」(无时间、无批次实例),供排产引擎在批次层做资源传播 + 确定性落点时查询。
 */

/** 资源大类 —— 界面按此分 Tab / 分区 */
export type PsResourceKind =
  | 'cip-station' // CIP 站(容量 1)
  | 'pipeline' // 管线(挂主备站)
  | 'cip-equipment' // 挂在管线上的设备/罐
  | 'prep-tank' // 配液罐
  | 'storage' // 储存容器(储袋/储罐)
  | 'room' // 房间(放行状态机 + suite 归属)
  | 'shelf-life'; // 物料效期常数

/** CIP 站(独立、跨部门、容量 1) */
export interface PsCipStation {
  id: string;
  code: string; // CIP-S1
  name: string;
  department: string; // 跨部门共用
  capacity: 1; // 硬:容量恒为 1(同刻只洗一条管线)
  emergencyOnly?: boolean; // 仅作某些管线的备站(引擎默认不排)
  note?: string;
}

/** 一道 CIP 的候选资源 = 它管线的 {主站(优先), 备站(应急)} */
export interface PsPipeline {
  id: string;
  code: string; // M1 / M3
  name: string;
  primaryStationId: string; // 主站(引擎只往这排)
  backupStationId?: string; // 备站(人工应急)
}

/** 挂在某条管线上的设备 / 罐(CIP 拓扑叶子) */
export interface PsCipEquipment {
  id: string;
  code: string; // PT1810 / AKTA-1850 / T1813
  name: string;
  type: 'reactor' | 'akta-skid' | 'tank' | 'ufdf-skid' | 'transfer' | 'other';
  pipelineId: string; // 挂哪条管线 → 决定主备站
  note?: string;
}

/** 配液罐(配制期短占 + 转储释放,通常非瓶颈) */
export interface PsPrepTank {
  id: string;
  code: string; // BH1701 / PT1810
  name: string;
  volume: string; // '2000L'
  pou?: string; // POU A / POU B
  occupancyNote: string; // 占用语义:配制 + CIP 那几小时,转储后释放
}

/** 储存容器(储袋/储罐,溶液在效期内占的就是它) */
export interface PsStorageVessel {
  id: string;
  code: string; // T1812 / SB-2000
  name: string;
  kind: 'bag' | 'tank'; // 储袋 / 储罐
  volume: string; // '15000L'
  holds: string; // 典型承载:'终配料液 / buffer 储存态'
  note?: string;
}

/** 房间放行状态机 attr */
export type PsRoomReleaseState = 'unreleased' | 'released';
/** suite 角色:pre/post-viral 互斥的依据 */
export type PsSuiteRole = 'pre-viral' | 'post-viral' | 'neutral';

/** 房间(带放行状态机的设备实例 + suite 归属) */
export interface PsRoom {
  id: string;
  code: string; // Room-1510
  name: string;
  suiteId: string; // 物理套间归属(suite 级互斥的范围)
  suiteRole: PsSuiteRole; // pre-viral / post-viral / neutral
  releaseState: PsRoomReleaseState; // 当前主数据标称态(实例态在批次层演进)
  chtHours: number; // 放行后洁净有效期(CHT),小时
  note?: string;
}

/** 物料效期常数(配方常数 → 批次层 max-lag) */
export interface PsShelfLife {
  id: string;
  material: string; // 培养基 / AC buffer / 碱液(清洗剂)
  category: 'media' | 'buffer' | 'cleaning-agent' | 'intermediate' | 'reagent';
  shelfLifeHours: number; // 24 / 72 / 168 …
  basis: string; // 产出后起算 / 配制后起算
  note?: string;
}

/** suite 卡片(房间分组用) */
export interface PsSuite {
  id: string;
  name: string;
  role: PsSuiteRole;
  note?: string;
}

/** 整套排产资源主数据(界面单一真值源) */
export interface PsResourceMaster {
  facility: string; // 设施 / 厂区标识
  cipStations: PsCipStation[];
  pipelines: PsPipeline[];
  cipEquipment: PsCipEquipment[];
  prepTanks: PsPrepTank[];
  storageVessels: PsStorageVessel[];
  suites: PsSuite[];
  rooms: PsRoom[];
  shelfLives: PsShelfLife[];
}

/** Tab key */
export type PsResourceTab = 'cip' | 'prep' | 'storage' | 'room' | 'shelf-life';

export const PS_RESOURCE_TAB_LABEL: Record<PsResourceTab, string> = {
  cip: 'CIP 站 & 拓扑',
  prep: '配液罐',
  storage: '储存容器',
  room: '房间 & suite',
  'shelf-life': '物料效期',
};

export const PS_SUITE_ROLE_LABEL: Record<PsSuiteRole, string> = {
  'pre-viral': '病毒前(pre-viral)',
  'post-viral': '病毒后(post-viral)',
  neutral: '中性(neutral)',
};

export const PS_SHELF_CATEGORY_LABEL: Record<PsShelfLife['category'], string> = {
  media: '培养基',
  buffer: '缓冲液 buffer',
  'cleaning-agent': '清洗剂',
  intermediate: '中间产物',
  reagent: '试剂',
};

export const PS_CIP_EQUIP_TYPE_LABEL: Record<PsCipEquipment['type'], string> = {
  reactor: '反应器',
  'akta-skid': 'AKTA 层析 skid',
  tank: '储罐',
  'ufdf-skid': 'UFDF skid',
  transfer: '转料单元',
  other: '其他',
};

/** suite 角色 → WxbTag 颜色(语义) */
export const psSuiteRoleColor = (role: PsSuiteRole): 'blue' | 'amber' | 'neutral' => {
  if (role === 'pre-viral') return 'blue';
  if (role === 'post-viral') return 'amber';
  return 'neutral';
};

/** 效期类别 → WxbTag 颜色 */
export const psShelfCategoryColor = (
  c: PsShelfLife['category'],
): 'blue' | 'green' | 'amber' | 'cyan' | 'neutral' => {
  switch (c) {
    case 'media':
      return 'green';
    case 'buffer':
      return 'blue';
    case 'cleaning-agent':
      return 'amber';
    case 'intermediate':
      return 'cyan';
    default:
      return 'neutral';
  }
};
