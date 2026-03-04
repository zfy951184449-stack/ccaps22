import { Request, Response } from 'express';
import pool from '../config/database';
import {
  buildResourceNodeTree,
  createResourceNode,
  deleteResourceNode,
  listResourceNodes,
  moveResourceNode,
  updateResourceNode,
} from '../services/resourceNodeService';

export const getResourceNodes = async (req: Request, res: Response) => {
  try {
    const departmentCode = typeof req.query.department_code === 'string' ? req.query.department_code : undefined;
    const ownerOrgUnitId = req.query.owner_org_unit_id ? Number(req.query.owner_org_unit_id) : undefined;
    const includeInactive = req.query.include_inactive === 'true' || req.query.include_inactive === '1';
    const treeMode = req.query.tree !== 'false';

    const rows = await listResourceNodes({
      department_code: departmentCode,
      owner_org_unit_id: ownerOrgUnitId,
      include_inactive: includeInactive,
    });

    res.json(treeMode ? buildResourceNodeTree(rows) : rows);
  } catch (error) {
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
      parent_id,
      department_code,
      owner_org_unit_id,
      bound_resource_id,
      sort_order,
      is_active,
      metadata,
    } = req.body;

    if (!node_name || !node_class || !department_code) {
      return res.status(400).json({ error: 'node_name, node_class and department_code are required' });
    }

    await connection.beginTransaction();
    const nodeId = await createResourceNode(
      {
        node_code,
        node_name,
        node_class,
        parent_id: parent_id ?? null,
        department_code,
        owner_org_unit_id: owner_org_unit_id ?? null,
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
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error deleting resource node:', error);
    res.status(500).json({ error: 'Failed to delete resource node' });
  } finally {
    connection.release();
  }
};
