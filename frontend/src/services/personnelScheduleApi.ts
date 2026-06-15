/**
 * personnelScheduleApi —— 管理侧排班日历（按员工查看，非「只看自己」）。
 *
 * 与 employeeScheduleApi（/api/me/*，强制登录身份）区分：本模块走
 * /api/personnel-schedules/*，权限 ROSTER_SCHEDULE_READ，影子模式下匿名可访问，
 * 支持「选一个或多个员工」查看其排班 + 任务 + 同伴。
 * 共用 services/api.ts 实例（带 Bearer + 相对 /api 基址），不裸用 axios。
 */
import api from './api';

/** 一条排班行（对应 /overview 返回的一行：班次 + 任务 + 批次 + 阶段）。 */
export interface ShiftCalendarRow {
  plan_id: number;
  employee_id: number;
  employee_code: string;
  employee_name: string;
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
  batch_plan_id: number | null;
  batch_code: string | null;
  batch_name: string | null;
  stage_code: string | null;
  stage_name: string | null;
}

/** 同任务的一位同伴。 */
export interface ShiftPartner {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
}

/** operation_plan_id → 该任务的全部参与员工（含未被选中者）。 */
export type PartnersMap = Record<number, ShiftPartner[]>;

export const personnelScheduleApi = {
  /** GET /api/personnel-schedules/overview —— 选中员工在 [startDate, endDate] 的排班+任务。 */
  shiftCalendar: (params: { employeeIds: number[]; startDate: string; endDate: string }) =>
    api
      .get<ShiftCalendarRow[]>('/personnel-schedules/overview', {
        params: {
          start_date: params.startDate,
          end_date: params.endDate,
          employee_ids: params.employeeIds.join(','),
        },
      })
      .then((res) => res.data),

  /** GET /api/personnel-schedules/partners —— 按 operation_plan_id 反查同任务全部员工。 */
  partners: (operationPlanIds: number[]): Promise<PartnersMap> => {
    if (operationPlanIds.length === 0) {
      return Promise.resolve({});
    }
    return api
      .get<PartnersMap>('/personnel-schedules/partners', {
        params: { operation_plan_ids: operationPlanIds.join(',') },
      })
      .then((res) => res.data);
  },
};
