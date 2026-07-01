/**
 * 资源节点 Excel — 客户端模板下载 + 导出。
 *
 * 列与后端 backend/src/services/resourceNodeImportMaps.ts 的 IMPORT_FIELD_BY_HEADER
 * 一一对应(导出写中文标签、导入读中文标签),改动须两边同步。
 * 创建-only / 仅结构:不含「绑定资源编码」列(资源绑定仍在详情抽屉里手动操作)。
 */
import * as XLSX from 'xlsx';
import type { ResourceNode, ResourceNodeClass } from '../ProcessTemplateV2/types';
import {
  NODE_CLASS_LABEL,
  NODE_SUBTYPE_OPTIONS,
  flattenNodes,
} from './resourceNodeConstants';

const SHEET_NAME = '节点';

/** 导入/导出列(带 `*` 表示必填),顺序即列序。 */
export const RESOURCE_NODE_EXCEL_HEADERS = [
  '节点编码*',
  '节点名称*',
  '节点类型*',
  '子类型',
  '上级节点编码',
  '归属范围',
  '部门编码',
  '设备系统类型',
  '设备大类',
  '设备型号',
  '排序',
  '启用',
];

/** 子类型枚举值 → 中文标签(全类合并;CIP/SIP 自身即标签) */
const SUBTYPE_LABEL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  (Object.keys(NODE_SUBTYPE_OPTIONS) as ResourceNodeClass[]).forEach((cls) => {
    NODE_SUBTYPE_OPTIONS[cls].forEach((opt) => {
      map[opt.value] = opt.label;
    });
  });
  return map;
})();

const SCOPE_LABEL: Record<string, string> = { GLOBAL: '全局', DEPARTMENT: '部门' };
const SYSTEM_TYPE_LABEL: Record<string, string> = { SUS: '一次性', SS: '不锈钢', VIRTUAL: '虚拟' };

const exampleRows: string[][] = [
  ['RN-GLB-GLOBAL-SIT-0001', '示例厂区', '厂区', '', '', '全局', '', '', '', '', '1', '是'],
  ['RN-GLB-GLOBAL-LIN-0001', '示例产线', '产线', '', 'RN-GLB-GLOBAL-SIT-0001', '全局', '', '', '', '', '1', '是'],
  ['RN-DPT-USP-ROM-0001', 'USP 主工艺房间', '房间', '主工艺房间', 'RN-GLB-GLOBAL-LIN-0001', '部门', 'USP', '', '', '', '1', '是'],
  ['RN-DPT-USP-EUN-0001', '一次性生物反应器', '设备', '', 'RN-DPT-USP-ROM-0001', '部门', 'USP', '一次性', 'REACTOR', 'BIOREACTOR', '1', '是'],
];

const triggerDownload = (rows: string[][], fileName: string): void => {
  const ws = XLSX.utils.aoa_to_sheet([RESOURCE_NODE_EXCEL_HEADERS, ...rows]);
  // 适度列宽,便于阅读
  ws['!cols'] = RESOURCE_NODE_EXCEL_HEADERS.map((h) => ({ wch: Math.max(12, h.length * 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  XLSX.writeFile(wb, fileName);
};

/** 下载空白导入模板(含表头与示例行) */
export const downloadResourceNodeTemplate = (): void => {
  triggerDownload(exampleRows, '资源节点导入模板.xlsx');
};

const stamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};

/** 把当前节点树导出为与导入同列格式的 Excel(平铺,父用编码引用) */
export const exportResourceNodesToExcel = (nodes: ResourceNode[]): void => {
  const flat = flattenNodes(nodes);
  const codeById = new Map<number, string>(flat.map((n) => [n.id, n.nodeCode]));

  const rows: string[][] = flat.map((n) => [
    n.nodeCode,
    n.nodeName,
    NODE_CLASS_LABEL[n.nodeClass] ?? n.nodeClass,
    n.nodeSubtype ? SUBTYPE_LABEL[n.nodeSubtype] ?? n.nodeSubtype : '',
    n.parentId ? codeById.get(n.parentId) ?? '' : '',
    SCOPE_LABEL[n.nodeScope] ?? n.nodeScope,
    n.departmentCode ?? '',
    n.equipmentSystemType ? SYSTEM_TYPE_LABEL[n.equipmentSystemType] ?? n.equipmentSystemType : '',
    n.equipmentClass ?? '',
    n.equipmentModel ?? '',
    String(n.sortOrder ?? ''),
    n.isActive ? '是' : '否',
  ]);

  triggerDownload(rows, `资源节点-${stamp()}.xlsx`);
};
