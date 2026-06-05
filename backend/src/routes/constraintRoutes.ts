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
import requirePermission from '../middleware/requirePermission';

const router = Router();

// 获取模板的所有约束
router.get('/template/:templateId', requirePermission('APS_CONSTRAINT_READ'), getTemplateConstraints);

// 获取模板的所有约束关系（用于甘特图显示）
router.get('/template/:templateId/gantt', requirePermission('APS_CONSTRAINT_READ'), getTemplateConstraintsForGantt);

// 获取批次的约束关系（用于批次甘特图显示）
router.get('/batch/:batchPlanId/gantt', requirePermission('APS_CONSTRAINT_READ'), getBatchConstraintsForGantt);

// 批量获取批次的约束关系（新优化接口）
router.get('/batches/gantt', requirePermission('APS_CONSTRAINT_READ'), getBatchConstraintsForGanttBatches);

// 校验模板约束是否存在时间冲突
router.get('/template/:templateId/validate', requirePermission('APS_CONSTRAINT_READ'), validateTemplateConstraints);

// 获取模板的可用操作列表
router.get('/template/:templateId/available-operations', requirePermission('APS_CONSTRAINT_READ'), getAvailableOperations);

// 获取特定操作的约束
router.get('/operation/:scheduleId', requirePermission('APS_CONSTRAINT_READ'), getOperationConstraints);

// 创建约束
router.post('/', requirePermission('APS_CONSTRAINT_WRITE'), createConstraint);

// 更新约束
router.put('/:id', requirePermission('APS_CONSTRAINT_WRITE'), updateConstraint);

// 删除约束
router.delete('/:id', requirePermission('APS_CONSTRAINT_WRITE'), deleteConstraint);

export default router;
