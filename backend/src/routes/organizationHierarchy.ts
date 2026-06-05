import express from 'express';
import { getOrganizationHierarchy } from '../controllers/organizationHierarchyController';
import { createUnit, updateUnit, deleteUnit } from '../controllers/organizationUnitsController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/tree', requirePermission('MASTER_ORG_READ'), getOrganizationHierarchy);
router.post('/units', requirePermission('MASTER_ORG_WRITE'), createUnit);
router.put('/units/:id', requirePermission('MASTER_ORG_WRITE'), updateUnit);
router.delete('/units/:id', requirePermission('MASTER_ORG_WRITE'), deleteUnit);

export default router;
