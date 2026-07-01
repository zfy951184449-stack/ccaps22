/**
 * 资源节点 Excel 导入 — 中文表头 / 中文枚举 → 系统枚举 的反向映射。
 *
 * 与前端 frontend/src/components/EquipmentManagement/resourceNodeConstants.ts
 * 的 NODE_CLASS_LABEL / NODE_SUBTYPE_OPTIONS / NODE_SCOPE_OPTIONS / SYSTEM_TYPE_OPTIONS
 * 一一对应(导出写中文标签、导入读中文标签),改动须两边同步。
 *
 * 为兼容用户手填,所有枚举字段同时接受「中文标签」与「系统枚举值」两种写法。
 */

/** Excel 表头(去掉 `*`/括号提示后的规范名)→ 内部字段名。供 readSheet 用。 */
export const IMPORT_FIELD_BY_HEADER: Record<string, string> = {
  节点编码: 'nodeCode',
  节点名称: 'nodeName',
  节点类型: 'nodeClass',
  子类型: 'nodeSubtype',
  上级节点编码: 'parentCode',
  归属范围: 'nodeScope',
  部门编码: 'departmentCode',
  设备系统类型: 'equipmentSystemType',
  设备大类: 'equipmentClass',
  设备型号: 'equipmentModel',
  排序: 'sortOrder',
  启用: 'isActive',
};

/** 节点类型:中文标签 / 枚举值 → 枚举值 */
export const NODE_CLASS_BY_LABEL: Record<string, string> = {
  厂区: 'SITE',
  产线: 'LINE',
  房间: 'ROOM',
  设备: 'EQUIPMENT_UNIT',
  '组件/管线': 'COMPONENT',
  组件: 'COMPONENT',
  管线: 'COMPONENT',
  工作站: 'UTILITY_STATION',
  SITE: 'SITE',
  LINE: 'LINE',
  ROOM: 'ROOM',
  EQUIPMENT_UNIT: 'EQUIPMENT_UNIT',
  COMPONENT: 'COMPONENT',
  UTILITY_STATION: 'UTILITY_STATION',
};

/** 子类型:中文标签 / 枚举值 → 枚举值(仅 ROOM / UTILITY_STATION 受约束) */
export const NODE_SUBTYPE_BY_LABEL: Record<string, string> = {
  主工艺房间: 'MAIN_PROCESS',
  辅助间: 'AUXILIARY',
  通用房间: 'UTILITY_SHARED',
  MAIN_PROCESS: 'MAIN_PROCESS',
  AUXILIARY: 'AUXILIARY',
  UTILITY_SHARED: 'UTILITY_SHARED',
  CIP: 'CIP',
  SIP: 'SIP',
};

/** 归属范围:中文标签 / 枚举值 → 枚举值 */
export const NODE_SCOPE_BY_LABEL: Record<string, string> = {
  全局: 'GLOBAL',
  全局共享: 'GLOBAL',
  部门: 'DEPARTMENT',
  部门域: 'DEPARTMENT',
  GLOBAL: 'GLOBAL',
  DEPARTMENT: 'DEPARTMENT',
};

/** 设备系统类型:中文标签 / 枚举值 → 枚举值 */
export const SYSTEM_TYPE_BY_LABEL: Record<string, string> = {
  一次性: 'SUS',
  不锈钢: 'SS',
  虚拟: 'VIRTUAL',
  SUS: 'SUS',
  SS: 'SS',
  VIRTUAL: 'VIRTUAL',
};

/** 启用列:中文/英文/数字 → 布尔。空值由调用方决定默认(默认启用)。 */
export const parseActiveLabel = (raw: string): boolean => {
  const v = raw.trim().toUpperCase();
  if (v === '否' || v === 'N' || v === 'NO' || v === 'FALSE' || v === '0' || v === '停用') {
    return false;
  }
  return true;
};
