import { Router } from 'express';
import multer from 'multer';
import {
  clearResourceNodeTreeController,
  getResourceNodeCleanableTargets,
  getResourceNodes,
  moveResourceNodeController,
  patchResourceNode,
  postResourceNode,
  putResourceNodeCleanableTargets,
  removeResourceNode,
} from '../controllers/resourceNodeController';
import {
  importResourceNodes,
  previewResourceNodeImport,
} from '../controllers/resourceNodeImportController';
import requirePermission from '../middleware/requirePermission';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', requirePermission('MASTER_RESOURCE_READ'), getResourceNodes);
router.post('/', requirePermission('MASTER_RESOURCE_WRITE'), postResourceNode);
// Excel 导入(静态路径须在 /:id 动态路由之前注册)
router.post(
  '/import/preview',
  requirePermission('MASTER_RESOURCE_WRITE'),
  upload.single('file'),
  previewResourceNodeImport,
);
router.post(
  '/import',
  requirePermission('MASTER_RESOURCE_WRITE'),
  upload.single('file'),
  importResourceNodes,
);
router.post('/rebuild/clear', requirePermission('MASTER_RESOURCE_OPERATE'), clearResourceNodeTreeController);
router.get('/:id/cleanable-targets', requirePermission('MASTER_RESOURCE_READ'), getResourceNodeCleanableTargets);
router.put('/:id/cleanable-targets', requirePermission('MASTER_RESOURCE_WRITE'), putResourceNodeCleanableTargets);
router.patch('/:id', requirePermission('MASTER_RESOURCE_WRITE'), patchResourceNode);
router.post('/:id/move', requirePermission('MASTER_RESOURCE_WRITE'), moveResourceNodeController);
router.delete('/:id', requirePermission('MASTER_RESOURCE_WRITE'), removeResourceNode);

export default router;
