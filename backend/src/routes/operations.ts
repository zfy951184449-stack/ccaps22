import express from 'express';
import {
  getAllOperations,
  getOperationById,
  createOperation,
  updateOperation,
  deleteOperation,
  getNextOperationCode,
  getOperationStatistics,
  getQualifiedPersonnelByOperation,
  getQualifiedPersonnelDetailsByOperation
} from '../controllers/operationController';
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';

const router = express.Router();

// scope resolver：操作主数据归属 = operations → operation_type_id → operation_types.team_id。
//   - 更新/删除：:id 是 operations.id → operation resolver。
//   - 创建：操作尚未落库，按 body.operation_type_id 解析其类型归属；缺/无类型(null)→ 放行，交 handler 校验。
const operationScopeById = (req: express.Request) =>
  ScopeService.resolveResourceUnit('operation', Number(req.params.id));
const operationScopeByBodyType = (req: express.Request) => {
  const operationTypeId = Number(req.body?.operation_type_id);
  return Number.isFinite(operationTypeId)
    ? ScopeService.resolveResourceUnit('operation_type', operationTypeId)
    : null;
};

// 获取统计信息
router.get('/statistics', requirePermission('MASTER_OPERATION_READ'), getOperationStatistics);

// 获取下一个操作编码预览
router.get('/next-code', requirePermission('MASTER_OPERATION_READ'), getNextOperationCode);

// 获取各操作按位置的合格人数
router.get('/qualified-personnel', requirePermission('MASTER_OPERATION_READ'), getQualifiedPersonnelByOperation);

// 获取单个操作按位置的合格人员明细
router.get('/:id/qualified-personnel-details', requirePermission('MASTER_OPERATION_READ'), getQualifiedPersonnelDetailsByOperation);

// CRUD路由
router.get('/', requirePermission('MASTER_OPERATION_READ'), getAllOperations);
router.get('/:id', requirePermission('MASTER_OPERATION_READ'), getOperationById);
router.post('/', requirePermission('MASTER_OPERATION_WRITE'), requireScope(operationScopeByBodyType), createOperation);
router.put('/:id', requirePermission('MASTER_OPERATION_WRITE'), requireScope(operationScopeById), updateOperation);
router.delete('/:id', requirePermission('MASTER_OPERATION_WRITE'), requireScope(operationScopeById), deleteOperation);

export default router;
