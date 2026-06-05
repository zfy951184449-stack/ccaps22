import express from 'express';
import {
    getUnavailability,
    createUnavailability,
    updateUnavailability,
    deleteUnavailability
} from '../controllers/unavailabilityController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/', requirePermission('ROSTER_UNAVAILABILITY_READ'), getUnavailability);
router.post('/', requirePermission('ROSTER_UNAVAILABILITY_WRITE'), createUnavailability);
router.put('/:id', requirePermission('ROSTER_UNAVAILABILITY_WRITE'), updateUnavailability);
router.delete('/:id', requirePermission('ROSTER_UNAVAILABILITY_WRITE'), deleteUnavailability);

export default router;
