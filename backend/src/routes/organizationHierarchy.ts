import express from 'express';
import { getOrganizationHierarchy } from '../controllers/organizationHierarchyController';
import { createUnit, updateUnit, deleteUnit } from '../controllers/organizationUnitsController';

const router = express.Router();

router.get('/tree', getOrganizationHierarchy);
router.post('/units', createUnit);
router.put('/units/:id', updateUnit);
router.delete('/units/:id', deleteUnit);

export default router;
