/**
 * 工厂数字沙盘 数据契约(production scheduling factory sandtable)—— 自成一套、独立,不依赖现有资源节点管理。
 *
 * 设计来源:本会话多轮访谈 + 设计 workflow w7r9ju97r。需求要点:
 *  - 层级 厂区(Site) → 产线(ProductionLine) → 房间(Room) → 设备(Equipment);**部分房间多产线共用**(RoomLineLink 多对多)。
 *  - 本轮范围:只做「有什么设备 / 在哪个房间 / 设备间关系(仅 CIP 路由)」;**不做**状态(放行/CHT/维护)、**不做**物料/效期、**不要**套间概念。
 *  - CIP 站本身 = 一台 equipmentType='cip-station' 的设备(关系两端统一在 Equipment 表)。
 *  - 设备在房间内**不存绝对坐标**,由 layoutRoom 按「类别成簇 + 簇内网格」算格位(categoryOrder 定簇内次序)。
 *  - 设备图标中性灰(形状管「是什么」);产线色只上房间(管「属哪条线」)。
 */

/** 设备类型(锁定枚举,对齐图标库;reactor 的上/下搅拌与尺寸是另外的属性) */
export type PsEquipmentType =
  | 'reactor' // 反应器(上/下搅拌见 stirDirection,尺寸见 sizeClass/volumeL)
  | 'centrifuge' // 连续流离心机
  | 'wave' // Wave 摇摆反应器
  | 'shaker' // 摇床(摇瓶)
  | 'prep-tank' // 配液罐
  | 'storage-tank' // 储罐
  | 'storage-bag' // 储袋
  | 'chromatography-skid' // 层析 skid(柱)
  | 'ufdf-skid' // 超滤 / DF skid(膜包夹具)
  | 'bsc' // 生物安全柜
  | 'laf' // 层流罩
  | 'cip-station'; // CIP 站(撬装)

export type PsStirDirection = 'top' | 'bottom';
export type PsSizeClass = '50L' | '250L' | '1000L' | '2000L' | '4000L' | 'sm' | 'md' | 'lg';

/** 厂区:沙盘根容器,本轮只一个 */
export interface PsSite {
  id: string;
  code: string;
  name: string;
  canvasWidth?: number;
  canvasHeight?: number;
  note?: string;
}

/** 产线:替代被砍掉的套间;沙盘里用颜色 + 聚焦筛选表达 */
export interface PsProductionLine {
  id: string;
  siteId: string;
  code: string;
  name: string;
  /** 沙盘分区色,存 --ps-line-* CSS 变量名(禁 hex);前端按 orderIndex 默认分配 */
  colorToken?: string;
  orderIndex?: number;
  note?: string;
}

/** 房间功能(软约束,影响房间排序/底色,不强制) */
export type PsRoomFunction =
  | 'media'
  | 'buffer'
  | 'usp'
  | 'harvest'
  | 'chromatography'
  | 'ufdf'
  | 'fill'
  | 'utility'
  | 'corridor';

/** 房间:设备的物理归属;房间↔产线多对多(共用)。x/y/w/h = 用户拖拽设计的布局(非测绘) */
export interface PsRoom {
  id: string;
  siteId: string;
  code: string;
  name: string;
  function?: PsRoomFunction;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  note?: string;
}

/** 设备:沙盘叶子;roomId=null 表示尚未归位 */
export interface PsEquipment {
  id: string;
  roomId: string | null;
  code: string;
  name: string;
  equipmentType: PsEquipmentType;
  /** 反应器专属:上/下搅拌,决定画哪个图标 */
  stirDirection?: PsStirDirection;
  /** 容积(升),优先用于挑反应器尺寸档图标 */
  volumeL?: number;
  /** 无明确升数时的尺寸档;volumeL 优先 */
  sizeClass?: PsSizeClass;
  brand?: string;
  model?: string;
  /** 房间内同类别设备的排序;layoutRoom 据此定格位 */
  categoryOrder?: number;
  note?: string;
}

/** 管线:CIP 拓扑中间层(设备/罐 → 管线 → 主/备站) */
export interface PsPipeline {
  id: string;
  siteId: string;
  code: string;
  name?: string;
  primaryStationId: string; // 指向一台 equipmentType='cip-station' 的设备
  backupStationId?: string;
  note?: string;
}

/** 设备↔设备 通用关系边(本轮仅 cip-route) */
export type PsRelationType = 'cip-route' | 'material-transfer' | 'process-link';

export interface PsEquipmentRelation {
  id: string;
  relationType: PsRelationType;
  sourceEquipmentId: string;
  targetEquipmentId: string;
  /** cip-route:'primary' 主站 | 'backup' 备站 */
  role?: 'primary' | 'backup';
  /** cip-route 专用:经哪条管线 */
  pipelineId?: string;
  orderIndex?: number;
  note?: string;
}

/** 房间↔产线 多对多(解共用房间) */
export interface PsRoomLineLink {
  id: string;
  roomId: string;
  lineId: string;
  /** 沙盘里画到哪条产线为主归属;其余产线显示为共用引用 */
  isPrimary?: boolean;
}

/** 整套工厂模型(界面单一真值源) */
export interface PsFactoryModel {
  site: PsSite;
  lines: PsProductionLine[];
  rooms: PsRoom[];
  equipment: PsEquipment[];
  pipelines: PsPipeline[];
  relations: PsEquipmentRelation[];
  roomLines: PsRoomLineLink[];
}

// ── 房间内分类摆放:类别带 ──────────────────────────────────────────────

/** 设备类别(房间内成簇的分组;固定带顺序保证「好找」) */
export type PsEquipmentCategory =
  | 'reactor'
  | 'centrifuge'
  | 'culture' // wave + shaker
  | 'prep'
  | 'storage' // tank + bag
  | 'chrom' // chromatography + ufdf
  | 'cleanroom' // bsc + laf
  | 'cip';

export const PS_EQUIPMENT_CATEGORY: Record<PsEquipmentType, PsEquipmentCategory> = {
  reactor: 'reactor',
  centrifuge: 'centrifuge',
  wave: 'culture',
  shaker: 'culture',
  'prep-tank': 'prep',
  'storage-tank': 'storage',
  'storage-bag': 'storage',
  'chromatography-skid': 'chrom',
  'ufdf-skid': 'chrom',
  bsc: 'cleanroom',
  laf: 'cleanroom',
  'cip-station': 'cip',
};

/** 房间内类别带的固定优先顺序(从前到后) */
export const PS_CATEGORY_ORDER: PsEquipmentCategory[] = [
  'reactor',
  'centrifuge',
  'culture',
  'prep',
  'storage',
  'chrom',
  'cleanroom',
  'cip',
];

export const PS_CATEGORY_LABEL: Record<PsEquipmentCategory, string> = {
  reactor: '反应器',
  centrifuge: '离心机',
  culture: '培养器具',
  prep: '配液罐',
  storage: '储存',
  chrom: '层析 / 超滤',
  cleanroom: '洁净设备',
  cip: 'CIP 站',
};

export const PS_EQUIPMENT_TYPE_LABEL: Record<PsEquipmentType, string> = {
  reactor: '反应器',
  centrifuge: '连续流离心机',
  wave: 'Wave 摇摆反应器',
  shaker: '摇床(摇瓶)',
  'prep-tank': '配液罐',
  'storage-tank': '储罐',
  'storage-bag': '储袋',
  'chromatography-skid': '层析 skid',
  'ufdf-skid': '超滤 / DF skid',
  bsc: '生物安全柜 BSC',
  laf: '层流罩 LAF',
  'cip-station': 'CIP 站',
};

/** 设备图标在网格里的相对占格大小(反应器按尺寸档;上限 1.0,绝不溢出单元格) */
export const PS_SIZE_SCALE: Record<PsSizeClass, number> = {
  '50L': 0.55,
  '250L': 0.66,
  '1000L': 0.8,
  '2000L': 0.92,
  '4000L': 1.0,
  sm: 0.7,
  md: 0.85,
  lg: 1.0,
};

/** 产线默认色板(--ps-line-* 定义在 PsFactorySandtablePage.css) */
export const PS_LINE_COLOR_TOKENS = [
  'var(--ps-line-1)',
  'var(--ps-line-2)',
  'var(--ps-line-3)',
  'var(--ps-line-4)',
  'var(--ps-line-5)',
  'var(--ps-line-6)',
];
