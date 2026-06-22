/**
 * rosterTriageService —— 排班分诊台的「写」操作层(指派 / 调班 / 报增援 / 标记不可用)。
 *
 * 读取仍走 rosterCalendarService(组织级联 + 日历)。这里只承载写操作。
 * v1 阶段后端接口尚未就绪:STUB=true 时不发请求,返回乐观结果,由调用方做本地乐观更新 +
 * Toast「已记录,待后端接入」;刷新数据即回落到真值。接口契约见下方注释,后端就绪后置 STUB=false。
 */
import api from './api';

/** v1:写接口未接,先本地乐观更新。后端就绪后改为 false。 */
export const TRIAGE_WRITES_STUBBED = true;

export interface AssignPayload {
    operationPlanId: number;
    employeeId: number;
    positionNumber: number;
}
export interface SwapPayload {
    operationPlanId: number;
    fromEmployeeId: number;
    toEmployeeId?: number;
    toPositionNumber?: number;
}
export interface ReinforcementPayload {
    unitId: number | null;
    date: string;
    role: string;
    requiredPeople: number;
    neededBy?: string;
    note?: string;
}
export interface AvailabilityPayload {
    employeeId: number;
    date: string;
    available: boolean;
}

export interface TriageWriteResult {
    ok: boolean;
    stub?: boolean;
}

export const rosterTriageService = {
    /** 指派一名员工到某操作的某岗位。NEW endpoint — backend pending。 */
    assign: async (p: AssignPayload): Promise<TriageWriteResult> => {
        if (TRIAGE_WRITES_STUBBED) return { ok: true, stub: true };
        const res = await api.post('/personnel-schedules/v2/assignments', p);
        return res.data;
    },

    /** 调班 / 对调。NEW endpoint — backend pending。 */
    swap: async (p: SwapPayload): Promise<TriageWriteResult> => {
        if (TRIAGE_WRITES_STUBBED) return { ok: true, stub: true };
        const res = await api.post('/personnel-schedules/v2/swaps', p);
        return res.data;
    },

    /** 报增援(跨组/外部补人)。NEW endpoint — backend pending。 */
    reinforce: async (p: ReinforcementPayload): Promise<TriageWriteResult> => {
        if (TRIAGE_WRITES_STUBBED) return { ok: true, stub: true };
        const res = await api.post('/personnel-schedules/v2/reinforcements', p);
        return res.data;
    },

    /** 标记某员工当日不可用。NEW endpoint — backend pending。 */
    setAvailability: async (p: AvailabilityPayload): Promise<TriageWriteResult> => {
        if (TRIAGE_WRITES_STUBBED) return { ok: true, stub: true };
        const res = await api.patch('/personnel-schedules/v2/availability', p);
        return res.data;
    }
};
