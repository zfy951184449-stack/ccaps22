import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { SqlExecutor } from './operationResourceBindingService';
import { getTemplateScheduleResourceRules } from './templateResourceRuleService';
import {
  DEFAULT_DEPARTMENT_CODE,
  normalizeDepartmentCode,
  resolveDepartmentCodeFromOrgUnit,
} from './departmentCodeService';

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

export type ResourceNodeClass = 'SUITE' | 'ROOM' | 'EQUIPMENT' | 'COMPONENT' | 'GROUP';
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
  parent_id: number | null;
  department_code: string;
  owner_org_unit_id: number | null;
  owner_unit_name: string | null;
  owner_unit_code: string | null;
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
  sqlMessage?: string;
};

const RESOURCE_NODE_CLASS_CODE: Record<ResourceNodeClass, string> = {
  SUITE: 'STE',
  ROOM: 'ROM',
  EQUIPMENT: 'EQP',
  COMPONENT: 'CMP',
  GROUP: 'GRP',
};

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

const mapResourceNodeRow = (row: RowDataPacket): ResourceNodeRecord => ({
  id: Number(row.id),
  node_code: String(row.node_code),
  node_name: String(row.node_name),
  node_class: String(row.node_class) as ResourceNodeClass,
  parent_id: row.parent_id !== null && row.parent_id !== undefined ? Number(row.parent_id) : null,
  department_code: String(row.department_code),
  owner_org_unit_id:
    row.owner_org_unit_id !== null && row.owner_org_unit_id !== undefined ? Number(row.owner_org_unit_id) : null,
  owner_unit_name: row.owner_unit_name ? String(row.owner_unit_name) : null,
  owner_unit_code: row.owner_unit_code ? String(row.owner_unit_code) : null,
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

export const listResourceNodes = async (
  filters: {
    department_code?: string;
    owner_org_unit_id?: number;
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

  if (filters.owner_org_unit_id) {
    clauses.push('rn.owner_org_unit_id = ?');
    params.push(filters.owner_org_unit_id);
  }

  if (!filters.include_inactive) {
    clauses.push('rn.is_active = 1');
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
        rn.*,
        ou.unit_name AS owner_unit_name,
        ou.unit_code AS owner_unit_code,
        r.resource_code AS bound_resource_code,
        r.resource_name AS bound_resource_name,
        r.resource_type AS bound_resource_type,
        r.status AS bound_resource_status,
        r.is_schedulable AS bound_resource_is_schedulable,
        (SELECT COUNT(*) FROM resource_nodes child WHERE child.parent_id = rn.id) AS child_count
     FROM resource_nodes rn
     LEFT JOIN organization_units ou ON ou.id = rn.owner_org_unit_id
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

const generateNextResourceNodeCode = async (
  departmentCode: string,
  nodeClass: ResourceNodeClass,
  executor: SqlExecutor = pool,
): Promise<string> => {
  const classCode = RESOURCE_NODE_CLASS_CODE[nodeClass];
  const prefix = `RN-${departmentCode}-${classCode}`;

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
    parent_id?: number | null;
    department_code?: string;
    owner_org_unit_id?: number | null;
    bound_resource_id?: number | null;
    sort_order?: number;
    is_active?: boolean;
    metadata?: Record<string, unknown> | null;
  },
  executor: SqlExecutor = pool,
): Promise<number> => {
  const parentId = payload.parent_id ?? null;
  const parentNode = parentId ? await assertNodeExists(parentId, executor) : null;

  const resolvedDepartmentCode =
    normalizeDepartmentCode(payload.department_code) ??
    normalizeDepartmentCode(parentNode?.department_code) ??
    (await loadResourceDepartmentCode(payload.bound_resource_id, executor)) ??
    (await resolveDepartmentCodeFromOrgUnit(payload.owner_org_unit_id ?? null, executor)) ??
    DEFAULT_DEPARTMENT_CODE;

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
        node_code, node_name, node_class, parent_id, department_code,
        owner_org_unit_id, bound_resource_id, sort_order, is_active, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nodeCode,
        payload.node_name,
        payload.node_class,
        parentId,
        resolvedDepartmentCode,
        payload.owner_org_unit_id ?? null,
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
        resolvedDepartmentCode,
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
    parent_id: number | null;
    department_code: string;
    owner_org_unit_id: number | null;
    bound_resource_id: number | null;
    sort_order: number;
    is_active: boolean;
    metadata: Record<string, unknown> | null;
  }>,
  executor: SqlExecutor = pool,
): Promise<void> => {
  const currentNode = await assertNodeExists(nodeId, executor);
  const nextParentId = payload.parent_id !== undefined ? payload.parent_id : currentNode.parent_id;
  const nextOwnerOrgUnitId =
    payload.owner_org_unit_id !== undefined ? payload.owner_org_unit_id : currentNode.owner_org_unit_id;
  const nextBoundResourceId =
    payload.bound_resource_id !== undefined ? payload.bound_resource_id : currentNode.bound_resource_id;

  await ensureNoCycle(nodeId, nextParentId ?? null, executor);

  if (nextBoundResourceId) {
    const childCount = await loadChildCount(nodeId, executor);
    if (childCount > 0) {
      throw new Error('Only leaf nodes can bind a resource');
    }
  }

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
    assign('node_class', payload.node_class);
  }
  if (payload.parent_id !== undefined) {
    assign('parent_id', payload.parent_id ?? null);
  }
  if (payload.department_code !== undefined) {
    assign('department_code', normalizeDepartmentCode(payload.department_code) ?? DEFAULT_DEPARTMENT_CODE);
  } else if (
    payload.parent_id !== undefined ||
    payload.owner_org_unit_id !== undefined ||
    payload.bound_resource_id !== undefined
  ) {
    const nextParentNode = nextParentId ? await assertNodeExists(nextParentId, executor) : null;
    const resolvedDepartmentCode =
      normalizeDepartmentCode(nextParentNode?.department_code) ??
      (await loadResourceDepartmentCode(nextBoundResourceId, executor)) ??
      (await resolveDepartmentCodeFromOrgUnit(nextOwnerOrgUnitId ?? null, executor)) ??
      normalizeDepartmentCode(currentNode.department_code) ??
      DEFAULT_DEPARTMENT_CODE;
    assign('department_code', resolvedDepartmentCode);
  }
  if (payload.owner_org_unit_id !== undefined) {
    assign('owner_org_unit_id', payload.owner_org_unit_id ?? null);
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
  await ensureNoCycle(nodeId, nextParentId, executor);

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
        rn.parent_id,
        rn.department_code,
        rn.owner_org_unit_id,
        ou.unit_name AS owner_unit_name,
        ou.unit_code AS owner_unit_code,
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
     LEFT JOIN organization_units ou ON ou.id = rn.owner_org_unit_id
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
