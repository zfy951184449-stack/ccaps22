/**
 * Dashboard Routes
 * 
 * 调度中心仪表盘相关路由
 */

import express from 'express';
import { getManpowerCurve, getShiftOptions, getWorkHoursCurve, getDailyAssignments } from '../controllers/dashboardController';

const router = express.Router();

// 人力供需曲线数据
router.get('/manpower-curve', getManpowerCurve);

// 工时需求曲线数据
router.get('/work-hours-curve', getWorkHoursCurve);

// 每日操作人员分配
router.get('/daily-assignments', getDailyAssignments);

// 班次选项（用于筛选器）
router.get('/shifts', getShiftOptions);

export default router;


