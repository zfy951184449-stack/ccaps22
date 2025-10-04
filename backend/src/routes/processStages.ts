import express from 'express';
import {
  getTemplateStages,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  updateStageSchedule
} from '../controllers/processStageController';

const router = express.Router();

// 阶段路由
router.get('/template/:templateId', getTemplateStages);
router.post('/template/:templateId', createStage);
router.put('/:stageId', updateStage);
router.delete('/:stageId', deleteStage);
router.put('/template/:templateId/reorder', reorderStages);
router.put('/template/:templateId/schedule', updateStageSchedule);

export default router;