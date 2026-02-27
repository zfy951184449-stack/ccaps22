import { Router } from 'express';
import {
  getTemplateConstraints,
  getTemplateConstraintsForGantt,
  getBatchConstraintsForGantt,
  getOperationConstraints,
  createConstraint,
  updateConstraint,
  deleteConstraint,
  getAvailableOperations,
  validateTemplateConstraints,
  getBatchConstraintsForGanttBatches
} from '../controllers/constraintController';

const router = Router();

// 获取模板的所有约束
router.get('/template/:templateId', getTemplateConstraints);

// 获取模板的所有约束关系（用于甘特图显示）
router.get('/template/:templateId/gantt', getTemplateConstraintsForGantt);

// 获取批次的约束关系（用于批次甘特图显示）
router.get('/batch/:batchPlanId/gantt', getBatchConstraintsForGantt);

// 批量获取批次的约束关系（新优化接口）
router.get('/batches/gantt', getBatchConstraintsForGanttBatches);

// 校验模板约束是否存在时间冲突
router.get('/template/:templateId/validate', validateTemplateConstraints);

// 获取模板的可用操作列表
router.get('/template/:templateId/available-operations', getAvailableOperations);

// 获取特定操作的约束
router.get('/operation/:scheduleId', getOperationConstraints);

// 创建约束
router.post('/', createConstraint);

// 更新约束
router.put('/:id', updateConstraint);

// 删除约束
router.delete('/:id', deleteConstraint);

export default router;
