import express from 'express';
import multer from 'multer';
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
  exportProcessTemplateWorkbook,
  importProcessTemplateWorkbook,
  previewProcessTemplateWorkbookImport,
} from '../controllers/processTemplateWorkbookController';
import {
  getTemplateResourceEditor,
  getTemplateResourcePlanner,
  validateTemplateResourceEditor,
} from '../controllers/templateResourcePlannerController';
import { createStageOperationFromCanvas } from '../controllers/stageOperationController';

const router = express.Router();
const workbookUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// 模版路由
router.get('/', getAllTemplates);
router.post('/workbook/preview', workbookUpload.single('file'), previewProcessTemplateWorkbookImport);
router.post('/workbook/import', workbookUpload.single('file'), importProcessTemplateWorkbook);
router.get('/:id/workbook/export', exportProcessTemplateWorkbook);
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
