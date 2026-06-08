/**
 * employeeScheduleApi —— 员工自助:查自己的排班(/api/me/shift-plans)。
 * 复用 services/api.ts 共享实例(带 Bearer)。后端强制只返回当前登录员工的数据。
 */
import api from './api';

/** 一条班次计划(对应 employee_shift_plans 一行,含关联班次/批次/操作)。 */
export interface MyShiftPlan {
  plan_id: number;
  plan_date: string;
  plan_category: string;
  plan_state: string;
  plan_hours: number | null;
  overtime_hours: number | null;
  is_locked: number;
  shift_code: string | null;
  shift_name: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  shift_nominal_hours: number | null;
  shift_is_cross_day: number | null;
  operation_plan_id: number | null;
  operation_start: string | null;
  operation_end: string | null;
  operation_code: string | null;
  operation_name: string | null;
  batch_code: string | null;
  batch_name: string | null;
}

export interface MyEmployee {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
}

export interface MyShiftPlansResult {
  employee: MyEmployee;
  shiftPlans: MyShiftPlan[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
  error?: string;
  code?: string;
}

export const employeeScheduleApi = {
  /** GET /api/me/shift-plans —— 当前登录员工在 [startDate, endDate] 的班次(只看自己)。 */
  myShiftPlans: (startDate: string, endDate: string) =>
    api
      .get<Envelope<MyShiftPlansResult>>('/me/shift-plans', {
        params: { start_date: startDate, end_date: endDate },
      })
      .then((res) => res.data.data),
};
