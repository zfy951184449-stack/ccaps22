/**
 * rosterCalendarService —— 排班日历(员工 × 日:班次 + 对应工作)的数据层。
 *
 * 两个职责:
 *   1. 由组织树构建"部门 → Team → 组"的级联选项(裁掉 SHIFT 层,员工不进级联,单独下拉)。
 *   2. 拉取某组织范围 / 单个员工在日期段内的排班日历。
 */
import api, { organizationStructureApi } from './api';
import { OrgCascadeOption, RosterCalendarResponse, WorkdayMap, DayType } from '../pages/personnel-scheduling/types';

const toDayType = (row: any): DayType => {
    const di = row.display_info || {};
    if (di.is_makeup_work) return 'makeup';
    if (row.holiday_name && Number(row.is_workday) === 0) return 'holiday';
    if (row.is_weekend) return 'weekend';
    return 'workday';
};

const CASCADE_TYPES = new Set(['DEPARTMENT', 'TEAM', 'GROUP']);

/** 递归把组织树节点裁剪为级联选项:只保留 部门/Team/组,丢弃 SHIFT 及空壳。 */
const toCascadeOptions = (nodes: any[]): OrgCascadeOption[] => {
    if (!Array.isArray(nodes)) return [];
    return nodes
        .filter((n) => n && CASCADE_TYPES.has(n.unitType))
        .map((n) => {
            const children = toCascadeOptions(n.children || []);
            const option: OrgCascadeOption = {
                value: n.id,
                label: n.unitName,
                unitType: n.unitType
            };
            if (children.length > 0) option.children = children;
            return option;
        });
};

export const rosterCalendarService = {
    /** 部门 → Team → 组 的级联选项。 */
    getOrgCascade: async (): Promise<OrgCascadeOption[]> => {
        try {
            const res = await organizationStructureApi.getTree();
            const payload: any = (res as any)?.data ?? res;
            const units = payload?.units ?? payload?.tree ?? payload ?? [];
            return toCascadeOptions(units);
        } catch (error) {
            console.error('[rosterCalendarService] getOrgCascade failed', error);
            return [];
        }
    },

    /**
     * 拉取排班日历。
     * @param startDate YYYY-MM-DD
     * @param endDate   YYYY-MM-DD
     * @param unitId    选中的组织节点(部门/Team/组,任意层级);展开其子树下全部在职员工
     * @param employeeId 只看单个员工(优先于 unitId)
     */
    getCalendar: async (
        startDate: string,
        endDate: string,
        unitId?: number | null,
        employeeId?: number | null
    ): Promise<RosterCalendarResponse> => {
        const params: Record<string, string | number> = {
            start_date: startDate,
            end_date: endDate
        };
        if (employeeId) params.employee_id = employeeId;
        else if (unitId) params.unit_id = unitId;

        const res = await api.get<RosterCalendarResponse>('/personnel-schedules/v2/calendar', { params });
        return res.data;
    },

    /** 日历日类型(节假日/调休/周末/工作日),来自工作日历表。失败返回空 map(界面退化为无叠加)。 */
    getWorkdays: async (startDate: string, endDate: string): Promise<WorkdayMap> => {
        try {
            const res = await api.get<any[]>('/calendar/workdays', {
                params: { start_date: startDate, end_date: endDate }
            });
            const rows = Array.isArray(res.data) ? res.data : [];
            const map: WorkdayMap = {};
            rows.forEach((row) => {
                const dt = toDayType(row);
                map[String(row.calendar_date)] = {
                    dayType: dt,
                    holidayName: dt === 'holiday' || dt === 'makeup' ? (row.holiday_name || null) : null,
                    isTripleSalary: !!row.is_triple_salary
                };
            });
            return map;
        } catch (error) {
            console.error('[rosterCalendarService] getWorkdays failed', error);
            return {};
        }
    }
};
