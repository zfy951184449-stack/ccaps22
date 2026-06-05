import express from 'express';
import {
  getTemplateStages,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  updateStageSchedule
} from '../controllers/processStageController';
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';

const router = express.Router();

// scope resolver：阶段写端点归属 = 所属模板 team。
//   - :templateId 直接按模板解析；
//   - :stageId 经 process_stages.template_id → process_templates.team_id 解析。
const stageByTemplate = (req: express.Request) =>
  ScopeService.resolveResourceUnit('process_template', Number(req.params.templateId));
const stageById = (req: express.Request) =>
  ScopeService.resolveResourceUnit('process_stage', Number(req.params.stageId));

// 阶段路由
router.get('/template/:templateId', requirePermission('APS_TEMPLATE_READ'), getTemplateStages);
router.post('/template/:templateId', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageByTemplate), createStage);
router.put('/:stageId', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageById), updateStage);
router.delete('/:stageId', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageById), deleteStage);
router.put('/template/:templateId/reorder', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageByTemplate), reorderStages);
router.put('/template/:templateId/schedule', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageByTemplate), updateStageSchedule);

export default router;