/**
 * 共享常量与工具函数 — 提取自 V2 TemplateResourceNodeManagementTab
 *
 * 被以下组件共享：
 * - EquipmentManagementPage  (独立页面)
 * - TemplateResourceNodeManagementTab (V2 模板内嵌)
 */
import type {
  EquipmentSystemType,
  ResourceNode,
  ResourceNodeClass,
  ResourceNodeScope,
} from '../ProcessTemplateV2/types';

/* ────────────────── 节点蓝图 ────────────────── */

export interface NodeBlueprint {
  nodeClass: ResourceNodeClass;
  nodeSubtype?: string | null;
  label: string;
}

/* ────────────────── 节点类型选项 ────────────────── */

export interface NodeClassOption {
  label: string;
  value: ResourceNodeClass;
  icon: string; // SVG icon key
}

export const NODE_CLASS_OPTIONS: NodeClassOption[] = [
  { label: '厂区', value: 'SITE', icon: 'cluster' },
  { label: '产线', value: 'LINE', icon: 'apartment' },
  { label: '房间', value: 'ROOM', icon: 'home' },
  { label: '设备', value: 'EQUIPMENT_UNIT', icon: 'tool' },
  { label: '组件/管线', value: 'COMPONENT', icon: 'setting' },
  { label: '工作站', value: 'UTILITY_STATION', icon: 'tool' },
];

export const NODE_CLASS_LABEL: Record<ResourceNodeClass, string> = {
  SITE: '厂区',
  LINE: '产线',
  ROOM: '房间',
  EQUIPMENT_UNIT: '设备',
  COMPONENT: '组件/管线',
  UTILITY_STATION: '工作站',
};

export const NODE_CLASS_CODE: Record<ResourceNodeClass, string> = {
  SITE: 'SIT',
  LINE: 'LIN',
  ROOM: 'ROM',
  EQUIPMENT_UNIT: 'EUN',
  COMPONENT: 'CMP',
  UTILITY_STATION: 'UST',
};

/* ────────────────── 节点子类型选项 ────────────────── */

export const NODE_SUBTYPE_OPTIONS: Record<ResourceNodeClass, Array<{ label: string; value: string }>> = {
  SITE: [],
  LINE: [],
  ROOM: [
    { label: '主工艺房间', value: 'MAIN_PROCESS' },
    { label: '辅助间', value: 'AUXILIARY' },
    { label: '通用房间', value: 'UTILITY_SHARED' },
  ],
  EQUIPMENT_UNIT: [],
  COMPONENT: [],
  UTILITY_STATION: [
    { label: 'CIP', value: 'CIP' },
    { label: 'SIP', value: 'SIP' },
  ],
};

/* ────────────────── 域 & 部门 ────────────────── */

export const NODE_SCOPE_OPTIONS: Array<{ label: string; value: ResourceNodeScope }> = [
  { label: '全局共享', value: 'GLOBAL' },
  { label: '部门域', value: 'DEPARTMENT' },
];

export const DEPARTMENT_OPTIONS = [
  { value: 'USP', label: 'USP' },
  { value: 'DSP', label: 'DSP' },
  { value: 'SPI', label: 'SPI' },
  { value: 'MAINT', label: 'MAINT' },
];

/* ────────────────── 系统类型 ────────────────── */

export const SYSTEM_TYPE_OPTIONS: Array<{ label: string; value: EquipmentSystemType }> = [
  { label: 'SUS (一次性)', value: 'SUS' },
  { label: 'SS (不锈钢)', value: 'SS' },
  { label: 'VIRTUAL (虚拟)', value: 'VIRTUAL' },
];

/* ────────────────── 可绑定节点类型 ────────────────── */

export const BINDABLE_CLASSES = new Set<ResourceNodeClass>(['EQUIPMENT_UNIT', 'COMPONENT', 'UTILITY_STATION']);

/* ────────────────── 模板预设 ────────────────── */

export type RoomTemplateKey = 'USP_PROCESS' | 'DSP_PROCESS' | 'SUPPORT' | 'UTILITY';
export type EquipmentTemplateKey = 'BIOREACTOR' | 'SEED_TRAIN' | 'CHROM_SKID' | 'UFDF_SKID' | 'BUFFER_TANK';

export const ROOM_TEMPLATE_OPTIONS: Array<{
  value: RoomTemplateKey;
  label: string;
  nodeSubtype: string;
  departmentCode: string | null;
}> = [
  { value: 'USP_PROCESS', label: 'USP room', nodeSubtype: 'MAIN_PROCESS', departmentCode: 'USP' },
  { value: 'DSP_PROCESS', label: 'DSP room', nodeSubtype: 'MAIN_PROCESS', departmentCode: 'DSP' },
  { value: 'SUPPORT', label: 'Support', nodeSubtype: 'AUXILIARY', departmentCode: null },
  { value: 'UTILITY', label: 'Utility', nodeSubtype: 'UTILITY_SHARED', departmentCode: null },
];

export const EQUIPMENT_TEMPLATE_OPTIONS: Array<{
  value: EquipmentTemplateKey;
  label: string;
  systemType: EquipmentSystemType;
  equipmentClass: string;
  equipmentModel: string;
}> = [
  { value: 'BIOREACTOR', label: 'Bioreactor', systemType: 'SS', equipmentClass: 'REACTOR', equipmentModel: 'BIOREACTOR' },
  { value: 'SEED_TRAIN', label: 'Seed train', systemType: 'SS', equipmentClass: 'SEED', equipmentModel: 'SEED_TRAIN' },
  { value: 'CHROM_SKID', label: 'Chrom skid', systemType: 'SS', equipmentClass: 'CHROM', equipmentModel: 'CHROM_SKID' },
  { value: 'UFDF_SKID', label: 'UFDF skid', systemType: 'SS', equipmentClass: 'UFDF', equipmentModel: 'UFDF_SKID' },
  { value: 'BUFFER_TANK', label: 'Buffer tank', systemType: 'SS', equipmentClass: 'TANK', equipmentModel: 'BUFFER_TANK' },
];

/* ────────────────── 层级约束 ────────────────── */

/**
 * 给定一个父节点，返回允许创建的子节点蓝图列表。
 * 移植自 V2 TemplateResourceNodeManagementTab.allowedChildBlueprints
 */
export const allowedChildBlueprints = (parent: ResourceNode | null): NodeBlueprint[] => {
  if (!parent) {
    return [{ nodeClass: 'SITE', label: '厂区' }];
  }

  if (parent.nodeClass === 'SITE') {
    return [
      { nodeClass: 'LINE', label: '产线' },
      { nodeClass: 'ROOM', nodeSubtype: 'UTILITY_SHARED', label: '通用房间' },
    ];
  }

  if (parent.nodeClass === 'LINE') {
    return [{ nodeClass: 'ROOM', nodeSubtype: 'MAIN_PROCESS', label: '主工艺房间' }];
  }

  if (parent.nodeClass === 'ROOM' && parent.nodeSubtype === 'MAIN_PROCESS') {
    return [
      { nodeClass: 'ROOM', nodeSubtype: 'AUXILIARY', label: '辅助间' },
      { nodeClass: 'EQUIPMENT_UNIT', label: '设备' },
    ];
  }

  if (parent.nodeClass === 'ROOM' && parent.nodeSubtype === 'UTILITY_SHARED') {
    return [
      { nodeClass: 'UTILITY_STATION', nodeSubtype: 'CIP', label: 'CIP站' },
      { nodeClass: 'UTILITY_STATION', nodeSubtype: 'SIP', label: 'SIP站' },
    ];
  }

  if (parent.nodeClass === 'EQUIPMENT_UNIT') {
    return [{ nodeClass: 'COMPONENT', label: '组件/管线' }];
  }

  return [];
};

/* ────────────────── 节点编码预览 ────────────────── */

/**
 * 根据 nodeScope/departmentCode/nodeClass 自动生成下一个编码预览。
 * 移植自 V2 TemplateResourceNodeManagementTab.buildNodeCodePreview
 */
export const buildNodeCodePreview = (
  nodeScope: ResourceNodeScope,
  departmentCode: string | null,
  nodeClass: ResourceNodeClass,
  allNodes: ResourceNode[],
): string => {
  const scopeCode = nodeScope === 'GLOBAL' ? 'GLB' : 'DPT';
  const domainToken = nodeScope === 'DEPARTMENT' ? departmentCode || 'USP' : 'GLOBAL';
  const prefix = `RN-${scopeCode}-${domainToken}-${NODE_CLASS_CODE[nodeClass]}`;
  const maxSuffix = allNodes.reduce((max, node) => {
    if (!node.nodeCode.startsWith(`${prefix}-`)) {
      return max;
    }
    const match = node.nodeCode.match(/-(\\d{4,})$/);
    const suffix = Number(match?.[1] ?? 0);
    return Math.max(max, suffix);
  }, 0);

  return `${prefix}-${String(maxSuffix + 1).padStart(4, '0')}`;
};

/* ────────────────── 子类型辅助 ────────────────── */

export const requiresSubtype = (nodeClass: ResourceNodeClass): boolean =>
  nodeClass === 'ROOM' || nodeClass === 'UTILITY_STATION';

export const supportsOptionalSubtype = (nodeClass: ResourceNodeClass): boolean =>
  nodeClass === 'COMPONENT';

/* ────────────────── 树 / 平铺 工具 ────────────────── */

export const flattenNodes = (nodes: ResourceNode[]): ResourceNode[] => {
  const result: ResourceNode[] = [];
  const walk = (list: ResourceNode[]) => {
    for (const n of list) {
      result.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return result;
};

export const buildNodeMap = (nodes: ResourceNode[]): Map<number, ResourceNode> => {
  const map = new Map<number, ResourceNode>();
  nodes.forEach((node) => map.set(node.id, node));
  return map;
};

export const buildNodePath = (nodeId: number, nodeMap: Map<number, ResourceNode>): ResourceNode[] => {
  const visited = new Set<number>();
  const path: ResourceNode[] = [];
  let currentId: number | null = nodeId;

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const current = nodeMap.get(currentId);
    if (!current) break;
    path.unshift(current);
    currentId = current.parentId ?? null;
  }

  return path;
};

export const findNode = (nodes: ResourceNode[], nodeId: number | null): ResourceNode | null => {
  if (!nodeId) return null;
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findNode(node.children, nodeId);
    if (child) return child;
  }
  return null;
};

export const filterNodesByQuery = (nodes: ResourceNode[], query: string): ResourceNode[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  return nodes
    .map((node) => {
      const nextChildren = filterNodesByQuery(node.children, query);
      const matched = [node.nodeName, node.nodeCode, node.boundResourceCode ?? '', node.boundResourceName ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalized);

      if (!matched && !nextChildren.length) return null;
      return { ...node, children: nextChildren };
    })
    .filter((item): item is ResourceNode => Boolean(item));
};

/* ────────────────── 节点类型颜色 ────────────────── */

export type WxbTagColor = 'blue' | 'green' | 'amber' | 'red' | 'neutral' | 'cyan';

export const NODE_CLASS_COLOR: Record<ResourceNodeClass, WxbTagColor> = {
  SITE: 'blue',
  LINE: 'cyan',
  ROOM: 'green',
  EQUIPMENT_UNIT: 'amber',
  COMPONENT: 'neutral',
  UTILITY_STATION: 'red',
};
