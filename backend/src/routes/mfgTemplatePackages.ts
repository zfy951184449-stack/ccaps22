import express from 'express';
import {
  createMfgTemplatePackage,
  deleteMfgTemplatePackage,
  getMfgTemplatePackage,
  listMfgTemplatePackages,
  previewMfgTemplatePackage,
  updateMfgTemplatePackage,
} from '../controllers/mfgTemplatePackageController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/', requirePermission('APS_MFG_PACKAGE_READ'), listMfgTemplatePackages);
router.post('/', requirePermission('APS_MFG_PACKAGE_WRITE'), createMfgTemplatePackage);
router.get('/:id', requirePermission('APS_MFG_PACKAGE_READ'), getMfgTemplatePackage);
router.put('/:id', requirePermission('APS_MFG_PACKAGE_WRITE'), updateMfgTemplatePackage);
router.delete('/:id', requirePermission('APS_MFG_PACKAGE_WRITE'), deleteMfgTemplatePackage);
router.get('/:id/preview', requirePermission('APS_MFG_PACKAGE_READ'), previewMfgTemplatePackage);

export default router;
