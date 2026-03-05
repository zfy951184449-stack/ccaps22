import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { SqlExecutor } from './operationResourceBindingService';
import { getTemplateScheduleResourceRules } from './templateResourceRuleService';
import { DEFAULT_DEPARTMENT_CODE, normalizeDepartmentCode } from './departmentCodeService';

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

export type ResourceNodeClass =
  | 'SITE'
  | 'LINE'
  | 'ROOM'
  | 'EQUIPMENT_UNIT'
  | 'COMPONENT'
  | 'UTILITY_STATION';

export type ResourceNodeScope = 'GLOBAL' | 'DEPARTMENT';
export type EquipmentSystemType = 'SUS' | 'SS';
export type ResourceNodeRelationType = 'CIP_CLEANABLE';

export type TemplateBindingStatus =
  | 'BOUND'
  | 'UNBOUND'
  | 'INVALID_NODE'
  | 'NODE_INACTIVE'
  | 'RESOURCE_UNBOUND'
  | 'RESOURCE_INACTIVE'
  | 'RESOURCE_RULE_MISMATCH';

export interface ResourceNodeRecord {
  id: number;
  node_code: string;
  node_name: string;
  node_class: ResourceNodeClass;
  node_subtype: string | null;
  parent_id: number | null;
  node_scope: ResourceNodeScope;
  department_code: string | null;
  equipment_system_type: EquipmentSystemType | null;
  equipment_class: string | null;
  equipment_model: string | null;
  bound_resource_id: number | null;
  bound_resource_code: string | null;
  bound_resource_name: string | null;
  bound_resource_type: string | null;
  bound_resource_status: string | null;
  bound_resource_is_schedulable: boolean;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  child_count: number;
}

export interface ResourceNodeTreeRecord extends ResourceNodeRecord {
  children: ResourceNodeTreeRecord[];
}

export interface ResourceNodeRelationRecord {
  id: number;
  source_node_id: number;
  target_node_id: number;
  relation_type: ResourceNodeRelationType;
  metadata: Record<string, unknown> | null;
  target: ResourceNodeRecord;
}

export interface TemplateScheduleBindingRecord {
  id: number;
  template_schedule_id: number;
  resource_node_id: number;
  binding_mode: 'DEFAULT';
  node: ResourceNodeRecord | null;
  status: TemplateBindingStatus;
  reason: string | null;
}

type MySqlErrorWithCode = Error & {
  code?: string;
};

const RESOURCE_NODE_CLASS_CODE: Record<ResourceNodeClass, string> = {
  SITE: 'SIT',
  LINE: 'LIN',
  ROOM: 'ROM',
  EQUIPMENT_UNIT: 'EUN',
  COMPONENT: 'CMP',
  UTILITY_STATION: 'UST',
};

const RESOURCE_NODE_SCOPE_CODE: Record<ResourceNodeScope, string> = {
  GLOBAL: 'GLB',
  DEPARTMENT: 'DPT',
};

const ROOM_SUBTYPES = new Set(['MAIN_PROCESS', 'AUXILIARY', 'UTILITY_SHARED']);
const UTILITY_STATION_SUBTYPES = new Set(['CIP', 'SIP']);
const EQUIPMENT_SYSTEM_TYPES = new Set<EquipmentSystemType>(['SUS', 'SS']);
const BINDABLE_NODE_CLASSES = new Set<ResourceNodeClass>(['EQUIPMENT_UNIT', 'COMPONENT', 'UTILITY_STATION']);
const CLEANABLE_TARGET_NODE_CLASSES = new Set<ResourceNodeClass>(['EQUIPMENT_UNIT', 'COMPONENT']);

const normalizeMetadata = (value: unknown): Record<string, unknown> | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return null;
};

const normalizeNodeSubtype = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    return null;
  }

  if (normalized.length > 64) {
    throw new Error('node_subtype length must be <= 64');
  }

  return normalized;
};

const normalizeNodeScope = (value: unknown): ResourceNodeScope | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === 'GLOBAL' || normalized === 'DEPARTMENT') {
    return normalized as ResourceNodeScope;
  }

  return null;
};

const normalizeEquipmentSystemType = (value: unknown): EquipmentSystemType | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('equipment_system_type must be SUS or SS');
  }
  const normalized = value.trim().toUpperCase();
  if (!EQUIPMENT_SYSTEM_TYPES.has(normalized as EquipmentSystemType)) {
    throw new Error('equipment_system_type must be SUS or SS');
  }
  return normalized as EquipmentSystemType;
};

const normalizeEquipmentText = (field: 'equipment_class' | 'equipment_model', value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > 64) {
    throw new Error(`${field} length must be <= 64`);
  }

  return trimmed;
};

const assertNodeSubtype = (nodeClass: ResourceNodeClass, rawSubtype: unknown): string | null => {
  const subtype = normalizeNodeSubtype(rawSubtype);

  if (nodeClass === 'SITE' || nodeClass === 'LINE' || nodeClass === 'EQUIPMENT_UNIT') {
    if (subtype) {
      throw new Error(`${nodeClass} does not allow node_subtype`);
    }
    return null;
  }

  if (nodeClass === 'ROOM') {
    if (!subtype || !ROOM_SUBTYPES.has(subtype)) {
      throw new Error('ROOM node_subtype must be MAIN_PROCESS, AUXILIARY or UTILITY_SHARED');
    }
    return subtype;
  }

  if (nodeClass === 'UTILITY_STATION') {
    if (!subtype || !UTILITY_STATION_SUBTYPES.has(subtype)) {
      throw new Error('UTILITY_STATION node_subtype must be CIP or SIP');
    }
    return subtype;
  }

  if (nodeClass === 'COMPONENT') {
    return subtype;
  }

  throw new Error('Unsupported node_class');
};

const assertEquipmentAttributes = (
  nodeClass: ResourceNodeClass,
  attrs: {
    equipmentSystemType: unknown;
    equipmentClass: unknown;
    equipmentModel: unknown;
  },
): {
  equipmentSystemType: EquipmentSystemType | null;
  equipmentClass: string | null;
  equipmentModel: string | null;
} => {
  const equipmentSystemType = normalizeEquipmentSystemType(attrs.equipmentSystemType);
  const equipmentClass = normalizeEquipmentText('equipment_class', attrs.equipmentClass);
  const equipmentModel = normalizeEquipmentText('equipment_model', attrs.equipmentModel);

  if (nodeClass === 'EQUIPMENT_UNIT') {
    if (!equipmentSystemType || !equipmentClass || !equipmentModel) {
      throw new Error('EQUIPMENT_UNIT requires equipment_system_type, equipment_class and equipment_model');
    }

    return {
      equipmentSystemType,
      equipmentClass,
      equipmentModel,
    };
  }

  if (equipmentSystemType || equipmentClass || equipmentModel) {
    throw new Error(`${nodeClass} must not set equipment_system_type/equipment_class/equipment_model`);
  }

  return {
    equipmentSystemType: null,
    equipmentClass: null,
    equipmentModel: null,
  };
};

const assertParentChildRule = (
  parentNode: Pick<ResourceNodeRecord, 'node_class' | 'node_subtype'> | null,
  childClass: ResourceNodeClass,
  childSubtype: string | null,
): void => {
  if (!parentNode) {
    if (childClass !== 'SITE') {
      throw new Error('Root node must be SITE');
    }
    return;
  }

  const parentClass = parentNode.node_class;
  const parentSubtype = parentNode.node_subtype;

  if (parentClass === 'SITE') {
    if (childClass === 'LINE') {
      return;
    }
    if (childClass === 'ROOM' && childSubtype === 'UTILITY_SHARED') {
      return;
    }
  }

  if (parentClass === 'LINE') {
    if (childClass === 'ROOM' && childSubtype === 'MAIN_PROCESS') {
      return;
    }
  }

  if (parentClass === 'ROOM') {
    if (parentSubtype === 'MAIN_PROCESS') {
      if (childClass === 'ROOM' && childSubtype === 'AUXILIARY') {
        return;
      }
      if (childClass === 'EQUIPMENT_UNIT') {
        return;
      }
    }

    if (parentSubtype === 'UTILITY_SHARED') {
      if (childClass === 'UTILITY_STATION' && (childSubtype === 'CIP' || childSubtype === 'SIP')) {
        return;
      }
    }
  }

  if (parentClass === 'EQUIPMENT_UNIT') {
    if (childClass === 'COMPONENT') {
      return;
    }
  }

  throw new Error(
    `Invalid hierarchy: cannot place ${childClass}${childSubtype ? `(${childSubtype})` : ''} under ${parentClass}${
      parentSubtype ? `(${parentSubtype})` : ''
    }`,
  );
};

const mapResourceNodeRow = (row: RowDataPacket): ResourceNodeRecord => ({
  id: Number(row.id),
  node_code: String(row.node_code),
  node_name: String(row.node_name),
  node_class: String(row.node_class) as ResourceNodeClass,
  node_subtype: row.node_subtype ? String(row.node_subtype) : null,
  parent_id: row.parent_id !== null && row.parent_id !== undefined ? Number(row.parent_id) : null,
  node_scope:
    normalizeNodeScope(row.node_scope) ??
    (normalizeDepartmentCode(row.department_code) ? 'DEPARTMENT' : 'GLOBAL'),
  department_code: normalizeDepartmentCode(row.department_code) ?? null,
  equipment_system_type: row.equipment_system_type ? (String(row.equipment_system_type) as EquipmentSystemType) : null,
  equipment_class: row.equipment_class ? String(row.equipment_class) : null,
  equipment_model: row.equipment_model ? String(row.equipment_model) : null,
  bound_resource_id:
    row.bound_resource_id !== null && row.bound_resource_id !== undefined ? Number(row.bound_resource_id) : null,
  bound_resource_code: row.bound_resource_code ? String(row.bound_resource_code) : null,
  bound_resource_name: row.bound_resource_name ? String(row.bound_resource_name) : null,
  bound_resource_type: row.bound_resource_type ? String(row.bound_resource_type) : null,
  bound_resource_status: row.bound_resource_status ? String(row.bound_resource_status) : null,
  bound_resource_is_schedulable: toBoolean(row.bound_resource_is_schedulable),
  sort_order: Number(row.sort_order ?? 0),
  is_active: toBoolean(row.is_active),
  metadata: normalizeMetadata(row.metadata),
  child_count: Number(row.child_count ?? 0),
});

const buildNodeMap = (nodes: ResourceNodeRecord[]) => new Map<number, ResourceNodeRecord>(nodes.map((node) => [node.id, node]));

const isSsCleanableNode = (node: ResourceNodeRecord, nodeMap: Map<number, ResourceNodeRecord>): boolean => {
  if (node.node_class === 'EQUIPMENT_UNIT') {
    return node.equipment_system_type === 'SS';
  }

  if (node.node_class === 'COMPONENT') {
    if (!node.parent_id) {
      return false;
    }
    const parentNode = nodeMap.get(node.parent_id);
    return Boolean(parentNode && parentNode.node_class === 'EQUIPMENT_UNIT' && parentNode.equipment_system_type === 'SS');
  }

  return false;
};

export const listResourceNodes = async (
  filters: {
    department_code?: string;
    include_inactive?: boolean;
  } = {},
  executor: SqlExecutor = pool,
): Promise<ResourceNodeRecord[]> => {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.department_code) {
    clauses.push('rn.department_code = ?');
    params.push(filters.department_code);
  }

  if (!filters.include_inactive) {
    clauses.push('rn.is_active = 1');
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
        rn.*,
        r.resource_code AS bound_resource_code,
        r.resource_name AS bound_resource_name,
        r.resource_type AS bound_resource_type,
        r.status AS bound_resource_status,
        r.is_schedulable AS bound_resource_is_schedulable,
        (SELECT COUNT(*) FROM resource_nodes child WHERE child.parent_id = rn.id) AS child_count
     FROM resource_nodes rn
     LEFT JOIN resources r ON r.id = rn.bound_resource_id
     ${whereClause}
     ORDER BY rn.department_code, COALESCE(rn.parent_id, 0), rn.sort_order, rn.node_name`,
    params,
  );

  return rows.map(mapResourceNodeRow);
};

export const buildResourceNodeTree = (rows: ResourceNodeRecord[]): ResourceNodeTreeRecord[] => {
  const nodeMap = new Map<number, ResourceNodeTreeRecord>();

  rows.forEach((row) => {
    nodeMap.set(row.id, {
      ...row,
      children: [],
    });
  });

  const roots: ResourceNodeTreeRecord[] = [];
  nodeMap.forEach((node) => {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id)!.children.push(node);
      return;
    }

    roots.push(node);
  });

  const sortNodes = (nodes: ResourceNodeTreeRecord[]) => {
    nodes.sort((left, right) => {
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }
      return left.node_name.localeCompare(right.node_name, 'zh-CN');
    });
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
};

const assertNodeExists = async (nodeId: number, executor: SqlExecutor = pool): Promise<ResourceNodeRecord> => {
  const rows = await listResourceNodes({ include_inactive: true }, executor);
  const node = rows.find((item) => item.id === nodeId);

  if (!node) {
    throw new Error('Resource node not found');
  }

  return node;
};

const assertCipStationNode = async (nodeId: number, executor: SqlExecutor = pool): Promise<ResourceNodeRecord> => {
  const node = await assertNodeExists(nodeId, executor);
  if (node.node_class !== 'UTILITY_STATION' || node.node_subtype !== 'CIP') {
    throw new Error('Cleanable targets can only be configured on UTILITY_STATION(CIP) nodes');
  }
  return node;
};

const generateNextResourceNodeCode = async (
  nodeScope: ResourceNodeScope,
  departmentCode: string | null,
  nodeClass: ResourceNodeClass,
  executor: SqlExecutor = pool,
): Promise<string> => {
  const classCode = RESOURCE_NODE_CLASS_CODE[nodeClass];
  const scopeCode = RESOURCE_NODE_SCOPE_CODE[nodeScope];
  const domainToken = nodeScope === 'DEPARTMENT' ? departmentCode ?? DEFAULT_DEPARTMENT_CODE : 'GLOBAL';
  const prefix = `RN-${scopeCode}-${domainToken}-${classCode}`;

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT node_code
     FROM resource_nodes
     WHERE node_code LIKE ?
     ORDER BY node_code DESC
     LIMIT 1`,
    [`${prefix}-%`],
  );

  if (!rows.length) {
    return `${prefix}-0001`;
  }

  const lastCode = String(rows[0].node_code || `${prefix}-0000`);
  const match = lastCode.match(/-(\d{4,})$/);
  const lastNumber = Number(match?.[1] ?? 0);
  return `${prefix}-${String(lastNumber + 1).padStart(4, '0')}`;
};

const ensureNoCycle = async (nodeId: number, parentId: number | null, executor: SqlExecutor = pool) => {
  if (!parentId) {
    return;
  }

  if (nodeId === parentId) {
    throw new Error('Resource node cannot be its own parent');
  }

  const rows = await listResourceNodes({ include_inactive: true }, executor);
  const parentMap = new Map<number, number | null>(rows.map((row) => [row.id, row.parent_id]));
  let currentParent: number | null = parentId;

  while (currentParent) {
    if (currentParent === nodeId) {
      throw new Error('Resource node cannot move under its descendant');
    }
    currentParent = parentMap.get(currentParent) ?? null;
  }
};

const loadChildCount = async (nodeId: number, executor: SqlExecutor = pool): Promise<number> => {
  const [rows] = await executor.execute<RowDataPacket[]>(
    'SELECT COUNT(*) AS child_count FROM resource_nodes WHERE parent_id = ?',
    [nodeId],
  );
  return Number(rows[0]?.child_count ?? 0);
};

const loadResourceDepartmentCode = async (
  resourceId: number | null | undefined,
  executor: SqlExecutor = pool,
): Promise<string | null> => {
  if (!resourceId) {
    return null;
  }

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT department_code
     FROM resources
     WHERE id = ?
     LIMIT 1`,
    [resourceId],
  );

  if (!rows.length) {
    return null;
  }

  return normalizeDepartmentCode(rows[0].department_code) ?? null;
};

const resolveNodeGovernance = async (
  input: {
    nodeScope: ResourceNodeScope;
    departmentCodeInput: unknown;
    parentNode: ResourceNodeRecord | null;
    currentNode?: ResourceNodeRecord | null;
    boundResourceId?: number | null;
  },
  executor: SqlExecutor = pool,
): Promise<{
  nodeScope: ResourceNodeScope;
  departmentCode: string | null;
}> => {
  if (input.nodeScope === 'GLOBAL') {
    return {
      nodeScope: 'GLOBAL',
      departmentCode: null,
    };
  }

  const resolvedDepartmentCode =
    normalizeDepartmentCode(input.departmentCodeInput) ??
    normalizeDepartmentCode(input.parentNode?.department_code) ??
    (await loadResourceDepartmentCode(input.boundResourceId, executor)) ??
    normalizeDepartmentCode(input.currentNode?.department_code) ??
    DEFAULT_DEPARTMENT_CODE;

  return {
    nodeScope: 'DEPARTMENT',
    departmentCode: resolvedDepartmentCode,
  };
};

const assertChildrenCompatibleWithNode = async (
  nodeId: number,
  nodeClass: ResourceNodeClass,
  nodeSubtype: string | null,
  executor: SqlExecutor = pool,
): Promise<void> => {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id, node_name, node_class, node_subtype
     FROM resource_nodes
     WHERE parent_id = ?`,
    [nodeId],
  );

  const parentNode = {
    node_class: nodeClass,
    node_subtype: nodeSubtype,
  };

  for (const row of rows) {
    const childClass = String(row.node_class) as ResourceNodeClass;
    const childSubtype = row.node_subtype ? String(row.node_subtype) : null;
    const childName = String(row.node_name ?? row.id);

    try {
      assertParentChildRule(parentNode, childClass, childSubtype);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Cannot update node: child "${childName}" becomes invalid (${error.message})`);
      }
      throw error;
    }
  }
};

export const normalizeResourceNodeOrder = async (
  parentId: number | null,
  executor: SqlExecutor = pool,
): Promise<void> => {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM resource_nodes
     WHERE ${parentId ? 'parent_id = ?' : 'parent_id IS NULL'}
     ORDER BY sort_order, id`,
    parentId ? [parentId] : [],
  );

  for (let index = 0; index < rows.length; index += 1) {
    await executor.execute('UPDATE resource_nodes SET sort_order = ? WHERE id = ?', [index + 1, Number(rows[index].id)]);
  }
};

export const createResourceNode = async (
  payload: {
    node_code?: string;
    node_name: string;
    node_class: ResourceNodeClass;
    node_subtype?: string | null;
    parent_id?: number | null;
    node_scope?: ResourceNodeScope;
    department_code?: string | null;
    equipment_system_type?: EquipmentSystemType | null;
    equipment_class?: string | null;
    equipment_model?: string | null;
    bound_resource_id?: number | null;
    sort_order?: number;
    is_active?: boolean;
    metadata?: Record<string, unknown> | null;
  },
  executor: SqlExecutor = pool,
): Promise<number> => {
  const parentId = payload.parent_id ?? null;
  const parentNode = parentId ? await assertNodeExists(parentId, executor) : null;
  const normalizedSubtype = assertNodeSubtype(payload.node_class, payload.node_subtype ?? null);

  assertParentChildRule(parentNode, payload.node_class, normalizedSubtype);

  if (payload.bound_resource_id && !BINDABLE_NODE_CLASSES.has(payload.node_class)) {
    throw new Error(`Only ${Array.from(BINDABLE_NODE_CLASSES).join(', ')} can bind a resource`);
  }

  const equipment = assertEquipmentAttributes(payload.node_class, {
    equipmentSystemType: payload.equipment_system_type,
    equipmentClass: payload.equipment_class,
    equipmentModel: payload.equipment_model,
  });

  const explicitNodeScope = normalizeNodeScope(payload.node_scope);
  if (payload.node_scope !== undefined && !explicitNodeScope) {
    throw new Error('node_scope must be GLOBAL or DEPARTMENT');
  }

  const inferredNodeScope =
    explicitNodeScope ??
    parentNode?.node_scope ??
    (normalizeDepartmentCode(payload.department_code)
      ? 'DEPARTMENT'
      : 'GLOBAL');

  if (payload.node_class === 'SITE' && inferredNodeScope !== 'GLOBAL') {
    throw new Error('SITE nodes must use GLOBAL node_scope');
  }

  const governance = await resolveNodeGovernance(
    {
      nodeScope: inferredNodeScope,
      departmentCodeInput: payload.department_code,
      parentNode,
      boundResourceId: payload.bound_resource_id ?? null,
    },
    executor,
  );

  const finalSortOrder =
    payload.sort_order ??
    (async () => {
      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_sort
         FROM resource_nodes
         WHERE ${parentId ? 'parent_id = ?' : 'parent_id IS NULL'}`,
        parentId ? [parentId] : [],
      );
      return Number(rows[0]?.max_sort ?? 0) + 1;
    })();

  const resolvedSortOrder = await finalSortOrder;

  const insertNode = async (nodeCode: string) => {
    const [result] = await executor.execute<ResultSetHeader>(
      `INSERT INTO resource_nodes (
        node_code, node_name, node_class, node_subtype, parent_id, node_scope, department_code,
        equipment_system_type, equipment_class, equipment_model,
        bound_resource_id, sort_order, is_active, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nodeCode,
        payload.node_name,
        payload.node_class,
        normalizedSubtype,
        parentId,
        governance.nodeScope,
        governance.departmentCode,
        equipment.equipmentSystemType,
        equipment.equipmentClass,
        equipment.equipmentModel,
        payload.bound_resource_id ?? null,
        resolvedSortOrder,
        payload.is_active === false ? 0 : 1,
        payload.metadata ? JSON.stringify(payload.metadata) : null,
      ],
    );

    return result.insertId;
  };

  let insertedNodeId: number | null = null;
  const manualNodeCode = payload.node_code?.trim();

  if (manualNodeCode) {
    insertedNodeId = await insertNode(manualNodeCode);
  } else {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const generatedNodeCode = await generateNextResourceNodeCode(
        governance.nodeScope,
        governance.departmentCode,
        payload.node_class,
        executor,
      );

      try {
        insertedNodeId = await insertNode(generatedNodeCode);
        break;
      } catch (error) {
        const mysqlError = error as MySqlErrorWithCode;
        if (mysqlError.code === 'ER_DUP_ENTRY') {
          continue;
        }
        throw error;
      }
    }
  }

  if (!insertedNodeId) {
    throw new Error('Failed to generate a unique resource node code');
  }

  await normalizeResourceNodeOrder(parentId, executor);
  return insertedNodeId;
};

export const updateResourceNode = async (
  nodeId: number,
  payload: Partial<{
    node_code: string;
    node_name: string;
    node_class: ResourceNodeClass;
    node_subtype: string | null;
    parent_id: number | null;
    node_scope: ResourceNodeScope;
    department_code: string | null;
    equipment_system_type: EquipmentSystemType | null;
    equipment_class: string | null;
    equipment_model: string | null;
    bound_resource_id: number | null;
    sort_order: number;
    is_active: boolean;
    metadata: Record<string, unknown> | null;
  }>,
  executor: SqlExecutor = pool,
): Promise<void> => {
  const currentNode = await assertNodeExists(nodeId, executor);
  const nextClass = payload.node_class ?? currentNode.node_class;
  const nextSubtype =
    payload.node_subtype !== undefined
      ? assertNodeSubtype(nextClass, payload.node_subtype)
      : payload.node_class !== undefined
        ? assertNodeSubtype(nextClass, currentNode.node_subtype)
        : currentNode.node_subtype;

  const nextParentId = payload.parent_id !== undefined ? payload.parent_id : currentNode.parent_id;
  const nextParentNode = nextParentId ? await assertNodeExists(nextParentId, executor) : null;

  await ensureNoCycle(nodeId, nextParentId ?? null, executor);
  assertParentChildRule(nextParentNode, nextClass, nextSubtype);

  if (payload.node_class !== undefined || payload.node_subtype !== undefined) {
    await assertChildrenCompatibleWithNode(nodeId, nextClass, nextSubtype, executor);
  }

  const explicitNodeScope = payload.node_scope !== undefined ? normalizeNodeScope(payload.node_scope) : null;
  if (payload.node_scope !== undefined && !explicitNodeScope) {
    throw new Error('node_scope must be GLOBAL or DEPARTMENT');
  }
  const nextNodeScope = explicitNodeScope ?? currentNode.node_scope;
  if (nextClass === 'SITE' && nextNodeScope !== 'GLOBAL') {
    throw new Error('SITE nodes must use GLOBAL node_scope');
  }

  const nextBoundResourceId =
    payload.bound_resource_id !== undefined ? payload.bound_resource_id : currentNode.bound_resource_id;

  if (nextBoundResourceId && !BINDABLE_NODE_CLASSES.has(nextClass)) {
    throw new Error(`Only ${Array.from(BINDABLE_NODE_CLASSES).join(', ')} can bind a resource`);
  }

  if (nextBoundResourceId) {
    const childCount = await loadChildCount(nodeId, executor);
    if (childCount > 0) {
      throw new Error('Only leaf nodes can bind a resource');
    }
  }

  const nextEquipment = assertEquipmentAttributes(nextClass, {
    equipmentSystemType:
      payload.equipment_system_type !== undefined
        ? payload.equipment_system_type
        : nextClass === 'EQUIPMENT_UNIT'
          ? currentNode.equipment_system_type
          : null,
    equipmentClass:
      payload.equipment_class !== undefined
        ? payload.equipment_class
        : nextClass === 'EQUIPMENT_UNIT'
          ? currentNode.equipment_class
          : null,
    equipmentModel:
      payload.equipment_model !== undefined
        ? payload.equipment_model
        : nextClass === 'EQUIPMENT_UNIT'
          ? currentNode.equipment_model
          : null,
  });

  const governanceNeedsRefresh =
    payload.node_scope !== undefined ||
    payload.department_code !== undefined ||
    payload.parent_id !== undefined ||
    payload.bound_resource_id !== undefined ||
    payload.node_class !== undefined;

  const governance = governanceNeedsRefresh
    ? await resolveNodeGovernance(
        {
          nodeScope: nextNodeScope,
          departmentCodeInput:
            payload.department_code !== undefined ? payload.department_code : currentNode.department_code,
          parentNode: nextParentNode,
          currentNode,
          boundResourceId: nextBoundResourceId ?? null,
        },
        executor,
      )
    : null;

  const updates: string[] = [];
  const params: Array<string | number | null> = [];

  const assign = (field: string, value: string | number | null) => {
    updates.push(`${field} = ?`);
    params.push(value);
  };

  if (payload.node_code !== undefined) {
    assign('node_code', payload.node_code);
  }
  if (payload.node_name !== undefined) {
    assign('node_name', payload.node_name);
  }
  if (payload.node_class !== undefined) {
    assign('node_class', nextClass);
    assign('node_subtype', nextSubtype);
  } else if (payload.node_subtype !== undefined) {
    assign('node_subtype', nextSubtype);
  }
  if (payload.parent_id !== undefined) {
    assign('parent_id', payload.parent_id ?? null);
  }
  if (governance) {
    assign('node_scope', governance.nodeScope);
    assign('department_code', governance.departmentCode);
  }
  if (
    payload.node_class !== undefined ||
    payload.equipment_system_type !== undefined ||
    payload.equipment_class !== undefined ||
    payload.equipment_model !== undefined
  ) {
    assign('equipment_system_type', nextEquipment.equipmentSystemType);
    assign('equipment_class', nextEquipment.equipmentClass);
    assign('equipment_model', nextEquipment.equipmentModel);
  }
  if (payload.bound_resource_id !== undefined) {
    assign('bound_resource_id', payload.bound_resource_id ?? null);
  }
  if (payload.sort_order !== undefined) {
    assign('sort_order', payload.sort_order);
  }
  if (payload.is_active !== undefined) {
    assign('is_active', payload.is_active ? 1 : 0);
  }
  if (payload.metadata !== undefined) {
    assign('metadata', payload.metadata ? JSON.stringify(payload.metadata) : null);
  }

  if (!updates.length) {
    return;
  }

  params.push(nodeId);
  await executor.execute(`UPDATE resource_nodes SET ${updates.join(', ')} WHERE id = ?`, params);

  await normalizeResourceNodeOrder(currentNode.parent_id, executor);
  if (nextParentId !== currentNode.parent_id) {
    await normalizeResourceNodeOrder(nextParentId ?? null, executor);
  }
};

export const moveResourceNode = async (
  nodeId: number,
  nextParentId: number | null,
  sortOrder: number | undefined,
  executor: SqlExecutor = pool,
): Promise<void> => {
  const currentNode = await assertNodeExists(nodeId, executor);
  const nextParentNode = nextParentId ? await assertNodeExists(nextParentId, executor) : null;

  await ensureNoCycle(nodeId, nextParentId, executor);
  assertParentChildRule(nextParentNode, currentNode.node_class, currentNode.node_subtype);

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_sort
     FROM resource_nodes
     WHERE ${nextParentId ? 'parent_id = ?' : 'parent_id IS NULL'}`,
    nextParentId ? [nextParentId] : [],
  );
  const finalSortOrder = sortOrder ?? Number(rows[0]?.max_sort ?? 0) + 1;

  await executor.execute(
    'UPDATE resource_nodes SET parent_id = ?, sort_order = ? WHERE id = ?',
    [nextParentId, finalSortOrder, nodeId],
  );

  await normalizeResourceNodeOrder(currentNode.parent_id, executor);
  await normalizeResourceNodeOrder(nextParentId, executor);
};

export const deleteResourceNode = async (nodeId: number, executor: SqlExecutor = pool): Promise<void> => {
  const childCount = await loadChildCount(nodeId, executor);
  if (childCount > 0) {
    throw new Error('Cannot delete resource node with children');
  }

  const [bindingRows] = await executor.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS binding_count
     FROM template_stage_operation_resource_bindings
     WHERE resource_node_id = ?`,
    [nodeId],
  );

  if (Number(bindingRows[0]?.binding_count ?? 0) > 0) {
    throw new Error('Cannot delete resource node referenced by template operations');
  }

  const [relationRows] = await executor.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS relation_count
     FROM resource_node_relations
     WHERE source_node_id = ? OR target_node_id = ?`,
    [nodeId, nodeId],
  );

  if (Number(relationRows[0]?.relation_count ?? 0) > 0) {
    throw new Error('Cannot delete resource node referenced by CIP cleanable relations');
  }

  const currentNode = await assertNodeExists(nodeId, executor);
  await executor.execute('DELETE FROM resource_nodes WHERE id = ?', [nodeId]);
  await normalizeResourceNodeOrder(currentNode.parent_id, executor);
};

export const listTemplateScheduleBindings = async (
  scheduleIds: number[],
  executor: SqlExecutor = pool,
): Promise<Map<number, TemplateScheduleBindingRecord>> => {
  const result = new Map<number, TemplateScheduleBindingRecord>();
  if (!scheduleIds.length) {
    return result;
  }

  const placeholders = scheduleIds.map(() => '?').join(', ');
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
        b.id,
        b.template_schedule_id,
        b.resource_node_id,
        b.binding_mode,
        rn.node_code,
        rn.node_name,
        rn.node_class,
        rn.node_subtype,
        rn.parent_id,
        rn.node_scope,
        rn.department_code,
        rn.equipment_system_type,
        rn.equipment_class,
        rn.equipment_model,
        rn.bound_resource_id,
        r.resource_code AS bound_resource_code,
        r.resource_name AS bound_resource_name,
        r.resource_type AS bound_resource_type,
        r.status AS bound_resource_status,
        r.is_schedulable AS bound_resource_is_schedulable,
        rn.sort_order,
        rn.is_active,
        rn.metadata,
        (SELECT COUNT(*) FROM resource_nodes child WHERE child.parent_id = rn.id) AS child_count
     FROM template_stage_operation_resource_bindings b
     LEFT JOIN resource_nodes rn ON rn.id = b.resource_node_id
     LEFT JOIN resources r ON r.id = rn.bound_resource_id
     WHERE b.template_schedule_id IN (${placeholders})`,
    scheduleIds,
  );

  rows.forEach((row) => {
    const node = row.resource_node_id ? mapResourceNodeRow(row) : null;
    result.set(Number(row.template_schedule_id), {
      id: Number(row.id),
      template_schedule_id: Number(row.template_schedule_id),
      resource_node_id: Number(row.resource_node_id),
      binding_mode: 'DEFAULT',
      node,
      status: node ? 'BOUND' : 'INVALID_NODE',
      reason: node ? null : 'Resource node not found',
    });
  });

  return result;
};

export const evaluateTemplateScheduleBinding = async (
  scheduleId: number,
  resourceNodeId: number,
  executor: SqlExecutor = pool,
): Promise<{ node: ResourceNodeRecord; status: TemplateBindingStatus; reason: string | null }> => {
  const node = await assertNodeExists(resourceNodeId, executor);

  if (!node.is_active) {
    return { node, status: 'NODE_INACTIVE', reason: 'Resource node is inactive' };
  }

  if (!BINDABLE_NODE_CLASSES.has(node.node_class)) {
    return {
      node,
      status: 'INVALID_NODE',
      reason: `Default binding must target ${Array.from(BINDABLE_NODE_CLASSES).join(', ')}`,
    };
  }

  if (node.child_count > 0) {
    return {
      node,
      status: 'INVALID_NODE',
      reason: 'Default binding must target a leaf resource node',
    };
  }

  if (!node.bound_resource_id || !node.bound_resource_type) {
    return {
      node,
      status: 'RESOURCE_UNBOUND',
      reason: 'Resource node is not bound to a schedulable resource',
    };
  }

  if (node.bound_resource_status !== 'ACTIVE' || !node.bound_resource_is_schedulable) {
    return {
      node,
      status: 'RESOURCE_INACTIVE',
      reason: 'Bound resource is inactive or not schedulable',
    };
  }

  const rules = await getTemplateScheduleResourceRules(scheduleId, executor);
  const requirements = rules?.requirements ?? [];
  if (!requirements.length) {
    return { node, status: 'BOUND', reason: null };
  }

  const matchedRequirements = requirements.filter(
    (requirement) => requirement.resource_type === node.bound_resource_type,
  );
  if (!matchedRequirements.length) {
    return {
      node,
      status: 'RESOURCE_RULE_MISMATCH',
      reason: `Bound resource type ${node.bound_resource_type} does not match current requirements`,
    };
  }

  const candidateMismatch = matchedRequirements.every(
    (requirement) =>
      requirement.candidate_resource_ids.length > 0 &&
      !requirement.candidate_resource_ids.includes(node.bound_resource_id!),
  );
  if (candidateMismatch) {
    return {
      node,
      status: 'RESOURCE_RULE_MISMATCH',
      reason: 'Bound resource is not in candidate resource list',
    };
  }

  return { node, status: 'BOUND', reason: null };
};

export const upsertTemplateScheduleBinding = async (
  scheduleId: number,
  resourceNodeId: number | null,
  executor: SqlExecutor = pool,
): Promise<TemplateScheduleBindingRecord | null> => {
  if (!resourceNodeId) {
    await executor.execute(
      'DELETE FROM template_stage_operation_resource_bindings WHERE template_schedule_id = ?',
      [scheduleId],
    );
    return null;
  }

  const evaluation = await evaluateTemplateScheduleBinding(scheduleId, resourceNodeId, executor);
  if (evaluation.status !== 'BOUND') {
    throw new Error(evaluation.reason ?? 'Resource node binding is invalid');
  }

  const [existingRows] = await executor.execute<RowDataPacket[]>(
    'SELECT id FROM template_stage_operation_resource_bindings WHERE template_schedule_id = ?',
    [scheduleId],
  );

  if (existingRows.length) {
    await executor.execute(
      `UPDATE template_stage_operation_resource_bindings
       SET resource_node_id = ?, binding_mode = 'DEFAULT'
       WHERE template_schedule_id = ?`,
      [resourceNodeId, scheduleId],
    );
  } else {
    await executor.execute(
      `INSERT INTO template_stage_operation_resource_bindings
       (template_schedule_id, resource_node_id, binding_mode)
       VALUES (?, ?, 'DEFAULT')`,
      [scheduleId, resourceNodeId],
    );
  }

  const bindingMap = await listTemplateScheduleBindings([scheduleId], executor);
  const record = bindingMap.get(scheduleId);
  if (!record) {
    return null;
  }

  return {
    ...record,
    status: evaluation.status,
    reason: evaluation.reason,
  };
};

export const copyTemplateScheduleBindings = async (
  executor: SqlExecutor,
  scheduleIdMap: Map<number, number>,
): Promise<void> => {
  const sourceScheduleIds = Array.from(scheduleIdMap.keys());
  if (!sourceScheduleIds.length) {
    return;
  }

  const placeholders = sourceScheduleIds.map(() => '?').join(', ');
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT template_schedule_id, resource_node_id
     FROM template_stage_operation_resource_bindings
     WHERE template_schedule_id IN (${placeholders})`,
    sourceScheduleIds,
  );

  for (const row of rows) {
    const targetScheduleId = scheduleIdMap.get(Number(row.template_schedule_id));
    if (!targetScheduleId) {
      continue;
    }

    await executor.execute(
      `INSERT INTO template_stage_operation_resource_bindings
       (template_schedule_id, resource_node_id, binding_mode)
       VALUES (?, ?, 'DEFAULT')`,
      [targetScheduleId, Number(row.resource_node_id)],
    );
  }
};

export const listCipCleanableTargets = async (
  stationNodeId: number,
  executor: SqlExecutor = pool,
): Promise<ResourceNodeRelationRecord[]> => {
  await assertCipStationNode(stationNodeId, executor);

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
        rel.id AS relation_id,
        rel.source_node_id,
        rel.target_node_id,
        rel.relation_type,
        rel.metadata AS relation_metadata,
        rn.id,
        rn.node_code,
        rn.node_name,
        rn.node_class,
        rn.node_subtype,
        rn.parent_id,
        rn.node_scope,
        rn.department_code,
        rn.equipment_system_type,
        rn.equipment_class,
        rn.equipment_model,
        rn.bound_resource_id,
        r.resource_code AS bound_resource_code,
        r.resource_name AS bound_resource_name,
        r.resource_type AS bound_resource_type,
        r.status AS bound_resource_status,
        r.is_schedulable AS bound_resource_is_schedulable,
        rn.sort_order,
        rn.is_active,
        rn.metadata,
        (SELECT COUNT(*) FROM resource_nodes child WHERE child.parent_id = rn.id) AS child_count
     FROM resource_node_relations rel
     JOIN resource_nodes rn ON rn.id = rel.target_node_id
     LEFT JOIN resources r ON r.id = rn.bound_resource_id
     WHERE rel.source_node_id = ? AND rel.relation_type = 'CIP_CLEANABLE'
     ORDER BY rn.node_name`,
    [stationNodeId],
  );

  return rows.map((row) => ({
    id: Number(row.relation_id),
    source_node_id: Number(row.source_node_id),
    target_node_id: Number(row.target_node_id),
    relation_type: String(row.relation_type) as ResourceNodeRelationType,
    metadata: normalizeMetadata(row.relation_metadata),
    target: mapResourceNodeRow(row),
  }));
};

export const listEligibleCipCleanableTargets = async (
  stationNodeId: number,
  executor: SqlExecutor = pool,
): Promise<ResourceNodeRecord[]> => {
  await assertCipStationNode(stationNodeId, executor);

  const nodes = await listResourceNodes({ include_inactive: true }, executor);
  const nodeMap = buildNodeMap(nodes);

  return nodes
    .filter((node) => node.id !== stationNodeId)
    .filter((node) => node.is_active)
    .filter((node) => CLEANABLE_TARGET_NODE_CLASSES.has(node.node_class))
    .filter((node) => isSsCleanableNode(node, nodeMap))
    .sort((left, right) => left.node_name.localeCompare(right.node_name, 'zh-CN'));
};

export const replaceCipCleanableTargets = async (
  stationNodeId: number,
  targetNodeIds: number[],
  executor: SqlExecutor = pool,
): Promise<ResourceNodeRelationRecord[]> => {
  await assertCipStationNode(stationNodeId, executor);

  const nodes = await listResourceNodes({ include_inactive: true }, executor);
  const nodeMap = buildNodeMap(nodes);

  const dedupedTargetIds = Array.from(
    new Set(
      targetNodeIds
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );

  for (const targetNodeId of dedupedTargetIds) {
    const targetNode = nodeMap.get(targetNodeId);
    if (!targetNode) {
      throw new Error(`Cleanable target node ${targetNodeId} not found`);
    }

    if (!CLEANABLE_TARGET_NODE_CLASSES.has(targetNode.node_class)) {
      throw new Error('CIP cleanable targets must be COMPONENT or EQUIPMENT_UNIT');
    }

    if (!targetNode.is_active) {
      throw new Error('CIP cleanable targets must be active nodes');
    }

    if (!isSsCleanableNode(targetNode, nodeMap)) {
      throw new Error('CIP cleanable targets must belong to SS equipment');
    }
  }

  await executor.execute(
    `DELETE FROM resource_node_relations
     WHERE source_node_id = ? AND relation_type = 'CIP_CLEANABLE'`,
    [stationNodeId],
  );

  for (const targetNodeId of dedupedTargetIds) {
    await executor.execute(
      `INSERT INTO resource_node_relations
       (source_node_id, target_node_id, relation_type, metadata)
       VALUES (?, ?, 'CIP_CLEANABLE', NULL)`,
      [stationNodeId, targetNodeId],
    );
  }

  return listCipCleanableTargets(stationNodeId, executor);
};

export const clearResourceNodeTreeForRebuild = async (executor: SqlExecutor = pool): Promise<void> => {
  await executor.execute('DELETE FROM template_stage_operation_resource_bindings');
  await executor.execute('DELETE FROM resource_node_relations');
  await executor.execute('UPDATE resource_nodes SET parent_id = NULL');
  await executor.execute('DELETE FROM resource_nodes');
};
