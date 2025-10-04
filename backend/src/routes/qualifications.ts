import express from 'express';
import { getQualifications, createQualification, updateQualification, deleteQualification } from '../controllers/qualificationController';

const router = express.Router();

router.get('/', getQualifications);
router.post('/', createQualification);
router.put('/:id', updateQualification);
router.delete('/:id', deleteQualification);

export default router;