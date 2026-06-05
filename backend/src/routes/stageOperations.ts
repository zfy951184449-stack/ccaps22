import express from 'express';
import {
  getStageOperations,
  addOperationToStage,
  updateStageOperation,
  removeOperationFromStage,
  batchAddOperations,
  reorderStageOperations,
  getAvailableOperations,
  moveStageOperationToStage,
} from '../controllers/stageOperationController';
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';

const router = express.Router();

// scope resolver：操作安排写端点归属 = 所属阶段→模板 team。
//   - :stageId        经 process_stages.template_id → process_templates.team_id；
//   - :scheduleId      经 stage_operation_schedules.stage_id → process_stages.template_id → team_id。
const stageOpByStage = (req: express.Request) =>
  ScopeService.resolveResourceUnit('process_stage', Number(req.params.stageId));
const stageOpBySchedule = (req: express.Request) =>
  ScopeService.resolveResourceUnit('stage_operation', Number(req.params.scheduleId));

// 操作安排路由
router.get('/available', requirePermission('APS_TEMPLATE_READ'), getAvailableOperations);
router.get('/stage/:stageId', requirePermission('APS_TEMPLATE_READ'), getStageOperations);
router.post('/stage/:stageId', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageOpByStage), addOperationToStage);
router.post('/stage/:stageId/batch', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageOpByStage), batchAddOperations);
router.put('/:scheduleId', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageOpBySchedule), updateStageOperation);
router.post('/:scheduleId/move-stage', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageOpBySchedule), moveStageOperationToStage);
router.delete('/:scheduleId', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageOpBySchedule), removeOperationFromStage);
router.put('/stage/:stageId/reorder', requirePermission('APS_TEMPLATE_WRITE'), requireScope(stageOpByStage), reorderStageOperations);

export default router;
