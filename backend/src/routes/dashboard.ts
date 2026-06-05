/**
 * Dashboard Routes
 * 
 * 调度中心仪表盘相关路由
 */

import express from 'express';
import { getManpowerCurve, getShiftOptions, getWorkHoursCurve, getDailyAssignments } from '../controllers/dashboardController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

// 人力供需曲线数据
router.get('/manpower-curve', requirePermission('SYSTEM_DASHBOARD_READ'), getManpowerCurve);

// 工时需求曲线数据
router.get('/work-hours-curve', requirePermission('SYSTEM_DASHBOARD_READ'), getWorkHoursCurve);

// 每日操作人员分配
router.get('/daily-assignments', requirePermission('SYSTEM_DASHBOARD_READ'), getDailyAssignments);

// 班次选项（用于筛选器）
router.get('/shifts', requirePermission('SYSTEM_DASHBOARD_READ'), getShiftOptions);

export default router;


