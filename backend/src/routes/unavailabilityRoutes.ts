import express from 'express';
import {
    getUnavailability,
    createUnavailability,
    updateUnavailability,
    deleteUnavailability
} from '../controllers/unavailabilityController';

const router = express.Router();

router.get('/', getUnavailability);
router.post('/', createUnavailability);
router.put('/:id', updateUnavailability);
router.delete('/:id', deleteUnavailability);

export default router;
