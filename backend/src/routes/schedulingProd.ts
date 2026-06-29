/**
 * 排产引擎路由(排产 ≠ 排班)。挂在 /api/prod。
 * 第一刀只有 CIP 容量尖峰分析;后续放置/STN/派发再增量挂。
 */
import { Router } from 'express';
import multer from 'multer';
import { postCipPeak } from '../controllers/schedulingProd/cipPeakController';
import { postStateCheck } from '../controllers/schedulingProd/stateCheckController';
import {
  createEntity,
  createTransition,
  deleteEntity,
  deleteTransition,
  listEntity,
  listOrgUnits,
  listTemplateTransitions,
  updateEntity,
  updateTransition,
} from '../controllers/schedulingProd/cipTopologyController';
import { downloadTemplate, importWorkbook } from '../controllers/schedulingProd/cipImportController';
import requirePermission from '../middleware/requirePermission';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// CIP 容量尖峰分析(调引擎)
router.post('/v1/cip-peak', requirePermission('APS_TEMPLATE_READ'), postCipPeak);

// 设备状态机·保持窗检测(调引擎)
router.post('/v1/state-check', requirePermission('APS_TEMPLATE_READ'), postStateCheck);

// 组织单元清单(部门/team/组),供「归属组织」下拉
router.get('/org-units', requirePermission('APS_TEMPLATE_READ'), listOrgUnits);

// CIP 拓扑 Excel 模板下载 / 批量导入
router.get('/cip/template', downloadTemplate);
router.post('/cip/import', requirePermission('APS_TEMPLATE_WRITE'), upload.single('file'), importWorkbook);

// 状态机模板的转移规则:列表 + 完整 CRUD(自由建模;须在通配 /cip/:entity 之前)
router.get('/cip/sm-templates/:id/transitions', requirePermission('APS_TEMPLATE_READ'), listTemplateTransitions);
router.post('/cip/sm-templates/:id/transitions', requirePermission('APS_TEMPLATE_WRITE'), createTransition);
router.put('/cip/sm-transitions/:id', requirePermission('APS_TEMPLATE_WRITE'), updateTransition);
router.delete('/cip/sm-transitions/:id', requirePermission('APS_TEMPLATE_WRITE'), deleteTransition);

// CIP 拓扑资源主数据 CRUD(用户自录):entity ∈ {stations, pipelines, equipment, shelf-life}
router.get('/cip/:entity', requirePermission('APS_TEMPLATE_READ'), listEntity);
router.post('/cip/:entity', requirePermission('APS_TEMPLATE_WRITE'), createEntity);
router.put('/cip/:entity/:id', requirePermission('APS_TEMPLATE_WRITE'), updateEntity);
router.delete('/cip/:entity/:id', requirePermission('APS_TEMPLATE_WRITE'), deleteEntity);

export default router;
