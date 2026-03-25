import { Request, Response } from 'express';
import pool from '../config/database';
import { extractMissingTableName, isMissingTableError } from '../utils/missingTableGuard';
import {
  buildResourceNodeTree,
  clearResourceNodeTreeForRebuild,
  createResourceNode,
  deleteResourceNode,
  listCipCleanableTargets,
  listEligibleCipCleanableTargets,
  listResourceNodes,
  moveResourceNode,
  replaceCipCleanableTargets,
  updateResourceNode,
} from '../services/resourceNodeService';

const buildResourceNodeModelUnavailableWarning = (error: unknown) =>
  `Resource node model is not available because table ${extractMissingTableName(error) ?? 'resource_nodes'} is missing.`;

const sendResourceNodeModelUnavailable = (res: Response, error: unknown, status = 409) =>
  res.status(status).json({
    error: 'Resource node model is not available',
    warning: `Missing table: ${extractMissingTableName(error) ?? 'resource_nodes'}`,
  });

export const getResourceNodes = async (req: Request, res: Response) => {
  try {
    const departmentCode = typeof req.query.department_code === 'string' ? req.query.department_code : undefined;
    const includeInactive = req.query.include_inactive === 'true' || req.query.include_inactive === '1';
    const treeMode = req.query.tree !== 'false';

    const rows = await listResourceNodes({
      department_code: departmentCode,
      include_inactive: includeInactive,
    });

    res.json(treeMode ? buildResourceNodeTree(rows) : rows);
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.json({
        data: [],
        warnings: [buildResourceNodeModelUnavailableWarning(error)],
      });
    }
    console.error('Error fetching resource nodes:', error);
    res.status(500).json({ error: 'Failed to fetch resource nodes' });
  }
};

export const postResourceNode = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const {
      node_code,
      node_name,
      node_class,
      node_subtype,
      parent_id,
      node_scope,
      department_code,
      equipment_system_type,
      equipment_class,
      equipment_model,
      bound_resource_id,
      sort_order,
      is_active,
      metadata,
    } = req.body;

    if (!node_name || !node_class) {
      return res.status(400).json({ error: 'node_name and node_class are required' });
    }

    await connection.beginTransaction();
    const nodeId = await createResourceNode(
      {
        node_code,
        node_name,
        node_class,
        node_subtype: node_subtype ?? null,
        parent_id: parent_id ?? null,
        node_scope,
        department_code,
        equipment_system_type: equipment_system_type ?? null,
        equipment_class: equipment_class ?? null,
        equipment_model: equipment_model ?? null,
        bound_resource_id: bound_resource_id ?? null,
        sort_order,
        is_active,
        metadata: metadata ?? null,
      },
      connection,
    );
    await connection.commit();

    res.status(201).json({ id: nodeId, message: 'Resource node created successfully' });
  } catch (error) {
    await connection.rollback();
    if (isMissingTableError(error)) {
      return sendResourceNodeModelUnavailable(res, error);
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating resource node:', error);
    res.status(500).json({ error: 'Failed to create resource node' });
  } finally {
    connection.release();
  }
};

export const patchResourceNode = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const nodeId = Number(req.params.id);
    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      return res.status(400).json({ error: 'Invalid node id' });
    }

    await connection.beginTransaction();
    await updateResourceNode(nodeId, req.body ?? {}, connection);
    await connection.commit();
    res.json({ message: 'Resource node updated successfully' });
  } catch (error) {
    await connection.rollback();
    if (isMissingTableError(error)) {
      return sendResourceNodeModelUnavailable(res, error);
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating resource node:', error);
    res.status(500).json({ error: 'Failed to update resource node' });
  } finally {
    connection.release();
  }
};

export const moveResourceNodeController = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const nodeId = Number(req.params.id);
    const parentId =
      req.body.parent_id !== undefined && req.body.parent_id !== null ? Number(req.body.parent_id) : null;
    const sortOrder = req.body.sort_order !== undefined ? Number(req.body.sort_order) : undefined;

    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      return res.status(400).json({ error: 'Invalid node id' });
    }

    await connection.beginTransaction();
    await moveResourceNode(nodeId, parentId, sortOrder, connection);
    await connection.commit();

    res.json({ message: 'Resource node moved successfully' });
  } catch (error) {
    await connection.rollback();
    if (isMissingTableError(error)) {
      return sendResourceNodeModelUnavailable(res, error);
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error moving resource node:', error);
    res.status(500).json({ error: 'Failed to move resource node' });
  } finally {
    connection.release();
  }
};

export const removeResourceNode = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const nodeId = Number(req.params.id);
    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      return res.status(400).json({ error: 'Invalid node id' });
    }

    await connection.beginTransaction();
    await deleteResourceNode(nodeId, connection);
    await connection.commit();
    res.json({ message: 'Resource node deleted successfully' });
  } catch (error) {
    await connection.rollback();
    if (isMissingTableError(error)) {
      return sendResourceNodeModelUnavailable(res, error);
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error deleting resource node:', error);
    res.status(500).json({ error: 'Failed to delete resource node' });
  } finally {
    connection.release();
  }
};

export const getResourceNodeCleanableTargets = async (req: Request, res: Response) => {
  try {
    const nodeId = Number(req.params.id);
    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      return res.status(400).json({ error: 'Invalid node id' });
    }

    const [targets, candidateTargets] = await Promise.all([
      listCipCleanableTargets(nodeId),
      listEligibleCipCleanableTargets(nodeId),
    ]);

    res.json({
      source_node_id: nodeId,
      relation_type: 'CIP_CLEANABLE',
      targets,
      candidate_targets: candidateTargets,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return sendResourceNodeModelUnavailable(res, error, 404);
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error loading cleanable targets:', error);
    res.status(500).json({ error: 'Failed to load cleanable targets' });
  }
};

export const putResourceNodeCleanableTargets = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const nodeId = Number(req.params.id);
    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      return res.status(400).json({ error: 'Invalid node id' });
    }

    const targetNodeIds = Array.isArray(req.body?.target_node_ids)
      ? req.body.target_node_ids.map((item: unknown) => Number(item))
      : null;

    if (!targetNodeIds) {
      return res.status(400).json({ error: 'target_node_ids must be an array' });
    }

    await connection.beginTransaction();
    const targets = await replaceCipCleanableTargets(nodeId, targetNodeIds, connection);
    await connection.commit();

    res.json({
      source_node_id: nodeId,
      relation_type: 'CIP_CLEANABLE',
      targets,
    });
  } catch (error) {
    await connection.rollback();
    if (isMissingTableError(error)) {
      return sendResourceNodeModelUnavailable(res, error);
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating cleanable targets:', error);
    res.status(500).json({ error: 'Failed to update cleanable targets' });
  } finally {
    connection.release();
  }
};

export const clearResourceNodeTreeController = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: 'confirm=true is required for rebuild clear' });
    }

    await connection.beginTransaction();
    await clearResourceNodeTreeForRebuild(connection);
    await connection.commit();

    res.json({ message: 'Resource node tree and bindings cleared' });
  } catch (error) {
    await connection.rollback();
    if (isMissingTableError(error)) {
      return sendResourceNodeModelUnavailable(res, error);
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error clearing resource node tree:', error);
    res.status(500).json({ error: 'Failed to clear resource node tree' });
  } finally {
    connection.release();
  }
};
