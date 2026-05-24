import express from 'express';
import {
  createMfgTemplatePackage,
  deleteMfgTemplatePackage,
  getMfgTemplatePackage,
  listMfgTemplatePackages,
  previewMfgTemplatePackage,
  updateMfgTemplatePackage,
} from '../controllers/mfgTemplatePackageController';

const router = express.Router();

router.get('/', listMfgTemplatePackages);
router.post('/', createMfgTemplatePackage);
router.get('/:id', getMfgTemplatePackage);
router.put('/:id', updateMfgTemplatePackage);
router.delete('/:id', deleteMfgTemplatePackage);
router.get('/:id/preview', previewMfgTemplatePackage);

export default router;
