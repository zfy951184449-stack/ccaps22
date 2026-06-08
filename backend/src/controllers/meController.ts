/**
 * meController —— /api/me 员工自助接口。
 *
 * 安全要点(员工视角的核心):
 *   - 强制登录由 requireAuthStrict 保证(req.user 必存在),不受全局影子模式影响。
 *   - **只看自己**:从 req.user.userId 经 user_employee_links 解析出 employeeId,强制用它查询,
 *     彻底忽略任何前端传入的 employee_id —— 杜绝越权查他人。
 *   - 账号未关联员工 → 403,提示去绑定。
 */
import type { Request, Response } from 'express';
import '../middleware/authTypes';
import pool from '../config/database';
import { RbacDirectoryService } from '../services/governance/RbacDirectoryService';

/**
 * GET /api/me/shift-plans?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * 返回当前登录员工在该日期段的班次日历(含关联批次/操作),按日期排序。
 */
export const getMyShiftPlans = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'start_date 和 end_date 为必填', code: 'BAD_REQUEST' });
    }

    const linked = await RbacDirectoryService.getLinkedEmployee(req.user.userId);
    if (!linked) {
      return res.status(403).json({
        success: false,
        error: '当前账号未关联员工,无法查看排班,请联系管理员绑定',
        code: 'NO_EMPLOYEE_LINK',
      });
    }

    // 强制用 linked.employeeId,忽略任何前端传参 → 只能查到自己
    const [rows] = await pool.execute(
      `SELECT
         esp.id AS plan_id,
         esp.plan_date,
         esp.plan_category,
         esp.plan_state,
         esp.plan_hours,
         esp.overtime_hours,
         esp.is_locked,
         sd.shift_code,
         sd.shift_name,
         sd.start_time AS shift_start_time,
         sd.end_time   AS shift_end_time,
         sd.nominal_hours AS shift_nominal_hours,
         sd.is_cross_day  AS shift_is_cross_day,
         bop.id AS operation_plan_id,
         bop.planned_start_datetime AS operation_start,
         bop.planned_end_datetime   AS operation_end,
         o.operation_code,
         o.operation_name,
         pbp.batch_code,
         pbp.batch_name
       FROM employee_shift_plans esp
       LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
       LEFT JOIN batch_personnel_assignments bpa ON esp.id = bpa.shift_plan_id
       LEFT JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
       LEFT JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
       LEFT JOIN operations o ON bop.operation_id = o.id
       WHERE esp.employee_id = ?
         AND esp.plan_date BETWEEN ? AND ?
       ORDER BY esp.plan_date, FIELD(esp.plan_category, 'REST', 'BASE', 'PRODUCTION', 'OVERTIME'), esp.id`,
      [linked.employeeId, start_date, end_date],
    );

    res.json({ success: true, data: { employee: linked, shiftPlans: rows } });
  } catch (error) {
    console.error('[meController] getMyShiftPlans error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
};
