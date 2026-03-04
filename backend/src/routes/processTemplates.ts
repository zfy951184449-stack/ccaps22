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
import {
  getTemplateResourceEditor,
  getTemplateResourcePlanner,
  validateTemplateResourceEditor,
} from '../controllers/templateResourcePlannerController';
import { createStageOperationFromCanvas } from '../controllers/stageOperationController';

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
router.get('/:id/resource-editor', getTemplateResourceEditor);
router.post('/:id/editor-validate', validateTemplateResourceEditor);
router.post('/:id/stage-operations/from-canvas', createStageOperationFromCanvas);

export default router;
