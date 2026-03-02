import { Router } from 'express';
import {
  getPlatformBusinessRulesCoverage,
  getPlatformConflictById,
  getPlatformConflicts,
  getPlatformMaintenanceImpact,
  getPlatformOverview,
  getPlatformOverviewReadiness,
  getPlatformProjectById,
  getPlatformProjectTimeline,
  getPlatformProjects,
  getPlatformResourceTimeline,
  getPlatformRunDetail,
  updatePlatformOperation,
  updatePlatformOperationResourceBinding,
} from '../controllers/platformController';

const router = Router();

router.get('/overview', getPlatformOverview);
router.get('/overview/readiness', getPlatformOverviewReadiness);
router.get('/projects', getPlatformProjects);
router.get('/projects/:id', getPlatformProjectById);
router.get('/projects/:id/timeline', getPlatformProjectTimeline);
router.patch('/operations/:operationPlanId', updatePlatformOperation);
router.patch('/operations/:operationPlanId/resource-binding', updatePlatformOperationResourceBinding);
router.get('/conflicts', getPlatformConflicts);
router.get('/conflicts/:id', getPlatformConflictById);
router.get('/resources/timeline', getPlatformResourceTimeline);
router.get('/maintenance/impact', getPlatformMaintenanceImpact);
router.get('/business-rules/coverage', getPlatformBusinessRulesCoverage);
router.get('/runs/:id', getPlatformRunDetail);

export default router;
