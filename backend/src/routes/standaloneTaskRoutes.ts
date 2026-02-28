import { Router } from 'express';
import {
    getAllTasks,
    getTaskById,
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    generateRecurringTasks,
    getAssignments
} from '../controllers/standaloneTaskController';

const router = Router();

// /api/standalone-tasks
router.get('/', getAllTasks);
router.get('/assignments', getAssignments); // Must be before /:id
router.post('/generate-recurring', generateRecurringTasks); // Must be before /:id
router.get('/:id', getTaskById);
router.post('/', createTask);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);
router.post('/:id/complete', completeTask);

export default router;
