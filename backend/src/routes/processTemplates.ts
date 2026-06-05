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
  getTemplatePersonnelCurve,
  getTemplateExportData,
  getTemplateReportData,
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
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';

const router = express.Router();

// scope resolver：模板写端点资源 id 在 :id，归属 = process_templates.team_id。
const templateScope = (req: express.Request) =>
  ScopeService.resolveResourceUnit('process_template', Number(req.params.id));
const workbookUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// 模版路由
router.get('/', requirePermission('APS_TEMPLATE_READ'), getAllTemplates);
router.get('/export-data', requirePermission('APS_TEMPLATE_READ'), getTemplateExportData);
router.post('/workbook/preview', requirePermission('APS_TEMPLATE_IMPORT'), workbookUpload.single('file'), previewProcessTemplateWorkbookImport);
router.post('/workbook/import', requirePermission('APS_TEMPLATE_IMPORT'), workbookUpload.single('file'), importProcessTemplateWorkbook);
router.get('/:id/workbook/export', requirePermission('APS_TEMPLATE_READ'), exportProcessTemplateWorkbook);
router.get('/:id/report-data', requirePermission('APS_TEMPLATE_READ'), getTemplateReportData);
router.get('/:id', requirePermission('APS_TEMPLATE_READ'), getTemplateById);
router.post('/', requirePermission('APS_TEMPLATE_WRITE'), createTemplate);
router.put('/:id', requirePermission('APS_TEMPLATE_WRITE'), requireScope(templateScope), updateTemplate);
router.put('/:id/recalculate', requirePermission('APS_TEMPLATE_WRITE'), requireScope(templateScope), recalculateTemplate);
router.delete('/:id', requirePermission('APS_TEMPLATE_WRITE'), requireScope(templateScope), deleteTemplate);
router.post('/:id/copy', requirePermission('APS_TEMPLATE_WRITE'), requireScope(templateScope), copyTemplate);
router.post('/:id/auto-schedule', requirePermission('APS_TEMPLATE_AUTOSCHEDULE'), requireScope(templateScope), autoScheduleTemplate);
router.get('/:id/personnel-curve', requirePermission('APS_TEMPLATE_READ'), getTemplatePersonnelCurve);
router.get('/:id/resource-planner', requirePermission('APS_TEMPLATE_READ'), getTemplateResourcePlanner);
router.get('/:id/resource-editor', requirePermission('APS_TEMPLATE_READ'), getTemplateResourceEditor);
router.post('/:id/editor-validate', requirePermission('APS_TEMPLATE_WRITE'), requireScope(templateScope), validateTemplateResourceEditor);
router.post('/:id/stage-operations/from-canvas', requirePermission('APS_TEMPLATE_WRITE'), requireScope(templateScope), createStageOperationFromCanvas);

export default router;
