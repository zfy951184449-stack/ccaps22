/**
 * 排产引擎路由(排产 ≠ 排班)。挂在 /api/prod。
 * 第一刀只有 CIP 容量尖峰分析;后续放置/STN/派发再增量挂。
 */
import { Router } from 'express';
import multer from 'multer';
import { postCipPeak } from '../controllers/schedulingProd/cipPeakController';
import {
  createEntity,
  deleteEntity,
  listEntity,
  updateEntity,
} from '../controllers/schedulingProd/cipTopologyController';
import { downloadTemplate, importWorkbook } from '../controllers/schedulingProd/cipImportController';
import requirePermission from '../middleware/requirePermission';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// CIP 容量尖峰分析(调引擎)
router.post('/v1/cip-peak', requirePermission('APS_TEMPLATE_READ'), postCipPeak);

// CIP 拓扑 Excel 模板下载 / 批量导入
router.get('/cip/template', downloadTemplate);
router.post('/cip/import', requirePermission('APS_TEMPLATE_WRITE'), upload.single('file'), importWorkbook);

// CIP 拓扑资源主数据 CRUD(用户自录):entity ∈ {stations, pipelines, equipment, shelf-life}
router.get('/cip/:entity', requirePermission('APS_TEMPLATE_READ'), listEntity);
router.post('/cip/:entity', requirePermission('APS_TEMPLATE_WRITE'), createEntity);
router.put('/cip/:entity/:id', requirePermission('APS_TEMPLATE_WRITE'), updateEntity);
router.delete('/cip/:entity/:id', requirePermission('APS_TEMPLATE_WRITE'), deleteEntity);

export default router;
