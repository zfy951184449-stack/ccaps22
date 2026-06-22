import { useState, useEffect, useCallback } from 'react';
import { rosterCalendarService } from '../../../services/rosterCalendarService';
import { OrgCascadeOption, RosterCalendarResponse, WorkdayMap } from '../types';

interface UseRosterCalendarResult {
    orgOptions: OrgCascadeOption[];
    orgLoading: boolean;
    data: RosterCalendarResponse | null;
    dayTypes: WorkdayMap;
    loading: boolean;
    fetchCalendar: (startDate: string, endDate: string, unitId?: number | null) => void;
}

/** 排班日历数据:组织级联选项 + 某范围内员工的班次/工作 + 该范围的日历日类型(节假日/调休)。 */
export const useRosterCalendar = (): UseRosterCalendarResult => {
    const [orgOptions, setOrgOptions] = useState<OrgCascadeOption[]>([]);
    const [orgLoading, setOrgLoading] = useState(false);
    const [data, setData] = useState<RosterCalendarResponse | null>(null);
    const [dayTypes, setDayTypes] = useState<WorkdayMap>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        setOrgLoading(true);
        rosterCalendarService.getOrgCascade()
            .then((opts) => { if (alive) setOrgOptions(opts); })
            .finally(() => { if (alive) setOrgLoading(false); });
        return () => { alive = false; };
    }, []);

    const fetchCalendar = useCallback(async (startDate: string, endDate: string, unitId?: number | null) => {
        setLoading(true);
        try {
            const [res, workdays] = await Promise.all([
                rosterCalendarService.getCalendar(startDate, endDate, unitId ?? null, null),
                rosterCalendarService.getWorkdays(startDate, endDate)
            ]);
            setData(res);
            setDayTypes(workdays);
        } catch (error) {
            console.error('[useRosterCalendar] fetch failed', error);
            setData({ meta: { totalEmployees: 0, startDate, endDate }, employees: [] });
        } finally {
            setLoading(false);
        }
    }, []);

    return { orgOptions, orgLoading, data, dayTypes, loading, fetchCalendar };
};
