import express from 'express';
import { getOrganizationHierarchy } from '../controllers/organizationHierarchyController';

const router = express.Router();

router.get('/tree', getOrganizationHierarchy);

export default router;
