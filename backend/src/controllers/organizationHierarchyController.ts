import { Request, Response } from 'express';
import { fetchOrganizationHierarchy } from '../services/organizationHierarchyService';

export const getOrganizationHierarchy = async (_req: Request, res: Response) => {
  try {
    const hierarchy = await fetchOrganizationHierarchy();
    res.json(hierarchy);
  } catch (error) {
    console.error('[OrganizationHierarchyController] Failed to fetch hierarchy:', error);
    res.status(500).json({ error: 'Failed to fetch organization hierarchy' });
  }
};

export default {
  getOrganizationHierarchy,
};
