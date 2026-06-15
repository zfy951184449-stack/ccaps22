/**
 * calendarService
 *
 * 运营总览看板取数：当前/在产批次的工序计划（用于阶段甘特与「当前操作」卡）。
 * 仅做读取，集中封装 /api/calendar 相关端点（此前前端无 calendar service）。
 */
import axios from 'axios';

const API_BASE = '/api';

const extractArrayPayload = <T = any>(payload: any): T[] => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.rows)) return payload.rows;
    if (Array.isArray(payload?.list)) return payload.list;
    return [];
};

/** /api/calendar/operations/active 返回的单条操作计划。 */
export interface CalendarOperation {
    operation_plan_id: number;
    batch_id: number;
    batch_code: string;
    batch_name: string;
    batch_color?: string;
    plan_status: string;
    stage_id: number | null;
    stage_name: string;
    operation_name: string;
    planned_start_datetime: string;
    planned_end_datetime: string;
    planned_duration: number;
    required_people: number;
    assigned_people: number;
    assignment_status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED';
    is_independent?: number;
}

export const calendarService = {
    /**
     * 当前在产批次的全部工序计划。
     * status：默认仅 'ACTIVATED'（已激活批次）；传 'all' 返回所有有计划的批次。
     */
    getActiveOperations: async (status: string = 'ACTIVATED'): Promise<CalendarOperation[]> => {
        const res = await axios.get(`${API_BASE}/calendar/operations/active`, {
            params: { status },
        });
        return extractArrayPayload<CalendarOperation>(res.data);
    },
};

export default calendarService;
