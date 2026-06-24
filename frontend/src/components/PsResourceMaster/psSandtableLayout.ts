/**
 * 房间内「分类成簇 + 簇内网格 + 自动对齐」布局(纯函数,声明式渲染用)。
 * 体验命门:乱摆=找不到。规则——按固定类别带顺序分簇,每簇标题 + 设备行优先填网格、自动换行,房间按内容增高。
 * 设备不存绝对坐标,只存 roomId + categoryOrder;格位由本函数实时算出,FLIP 动效让用户「看见」自动归位。
 */
import {
  PS_CATEGORY_LABEL,
  PS_CATEGORY_ORDER,
  PS_EQUIPMENT_CATEGORY,
  PS_SIZE_SCALE,
} from '../../types/psSandtable';
import type {
  PsEquipment,
  PsEquipmentCategory,
} from '../../types/psSandtable';

export interface PsRoomCell {
  equipment: PsEquipment;
  /** 单元格左上角(相对房间内容原点) */
  x: number;
  y: number;
  /** 单元格边长(固定,保证网格对齐) */
  cell: number;
  /** 图标渲染边长(反应器按尺寸档缩放,底对齐居中于单元格) */
  iconSize: number;
  /** 图标左上角(单元格内底对齐居中) */
  iconX: number;
  iconY: number;
}

export interface PsRoomBand {
  category: PsEquipmentCategory;
  label: string;
  count: number;
  /** 带标题基线 y */
  titleY: number;
  cells: PsRoomCell[];
}

export interface PsRoomLayout {
  bands: PsRoomBand[];
  width: number;
  height: number;
}

export interface LayoutOpts {
  maxCols?: number;
  cell?: number;
  gutter?: number;
  pad?: number;
  titleH?: number;
  bandGap?: number;
}

const sizeScale = (e: PsEquipment): number => {
  if (e.equipmentType === 'reactor') {
    if (e.volumeL) {
      if (e.volumeL >= 4000) return PS_SIZE_SCALE['4000L'];
      if (e.volumeL >= 2000) return PS_SIZE_SCALE['2000L'];
      if (e.volumeL >= 1000) return PS_SIZE_SCALE['1000L'];
      if (e.volumeL >= 250) return PS_SIZE_SCALE['250L'];
      return PS_SIZE_SCALE['50L'];
    }
    if (e.sizeClass) return PS_SIZE_SCALE[e.sizeClass];
  }
  if (e.sizeClass) return PS_SIZE_SCALE[e.sizeClass];
  return 0.9;
};

/** 簇内稳定排序:尺寸档降序 → categoryOrder/code 升序(保证同一台永远落可预测位置) */
const sortInBand = (a: PsEquipment, b: PsEquipment): number => {
  const sa = sizeScale(a);
  const sb = sizeScale(b);
  if (sb !== sa) return sb - sa;
  const oa = a.categoryOrder ?? Number.MAX_SAFE_INTEGER;
  const ob = b.categoryOrder ?? Number.MAX_SAFE_INTEGER;
  if (oa !== ob) return oa - ob;
  return a.code.localeCompare(b.code);
};

export function layoutRoom(equipment: PsEquipment[], opts: LayoutOpts = {}): PsRoomLayout {
  const maxCols = opts.maxCols ?? 4;
  const cell = opts.cell ?? 58;
  const gutter = opts.gutter ?? 16; // 含设备 code 标签的横向空隙
  const pad = opts.pad ?? 12;
  const titleH = opts.titleH ?? 20;
  const bandGap = opts.bandGap ?? 26; // 给单元格底部 code 标签留位,避免压下一带标题

  const width = pad * 2 + maxCols * cell + (maxCols - 1) * gutter;

  // 分簇
  const byCat = new Map<PsEquipmentCategory, PsEquipment[]>();
  for (const e of equipment) {
    const c = PS_EQUIPMENT_CATEGORY[e.equipmentType];
    const arr = byCat.get(c) ?? [];
    arr.push(e);
    byCat.set(c, arr);
  }

  const bands: PsRoomBand[] = [];
  let cursorY = pad;

  for (const category of PS_CATEGORY_ORDER) {
    const list = byCat.get(category);
    if (!list || list.length === 0) continue;
    list.sort(sortInBand);

    const titleY = cursorY + 12;
    const gridTop = cursorY + titleH;
    const cells: PsRoomCell[] = list.map((equipmentItem, i) => {
      const col = i % maxCols;
      const row = Math.floor(i / maxCols);
      const x = pad + col * (cell + gutter);
      const y = gridTop + row * (cell + gutter);
      const scale = sizeScale(equipmentItem);
      const iconSize = Math.round(cell * scale);
      return {
        equipment: equipmentItem,
        x,
        y,
        cell,
        iconSize,
        iconX: x + (cell - iconSize) / 2,
        iconY: y + (cell - iconSize), // 底对齐:大设备显得更高
      };
    });

    const rows = Math.ceil(list.length / maxCols);
    const bandHeight = titleH + rows * cell + (rows - 1) * gutter;
    bands.push({ category, label: PS_CATEGORY_LABEL[category], count: list.length, titleY, cells });
    cursorY = cursorY + bandHeight + bandGap;
  }

  const height = Math.max(cursorY - bandGap + pad, pad * 2 + cell);
  return { bands, width, height };
}
