import express from 'express';
import {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  copyTemplate,
  recalculateTemplate,
  autoScheduleTemplate,
  getTemplatePersonnelCurve
} from '../controllers/processTemplateController';
import { getTemplateResourcePlanner } from '../controllers/templateResourcePlannerController';

const router = express.Router();

// 模版路由
router.get('/', getAllTemplates);
router.get('/:id', getTemplateById);
router.post('/', createTemplate);
router.put('/:id', updateTemplate);
router.put('/:id/recalculate', recalculateTemplate);
router.delete('/:id', deleteTemplate);
router.post('/:id/copy', copyTemplate);
router.post('/:id/auto-schedule', autoScheduleTemplate);
router.get('/:id/personnel-curve', getTemplatePersonnelCurve);
router.get('/:id/resource-planner', getTemplateResourcePlanner);

export default router;
