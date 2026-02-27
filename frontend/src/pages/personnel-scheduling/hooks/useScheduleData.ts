import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    PersonnelScheduleGridData,
    DepartmentFilter,
    ShiftStyleV2
} from '../types';

interface UseScheduleDataResult {
    loading: boolean;
    filtersLoading: boolean; // 新增：过滤器的加载状态
    filters: DepartmentFilter[];
    styles: Record<string, ShiftStyleV2>;
    gridData: PersonnelScheduleGridData | null;
    fetchGrid: (startDate: string, endDate: string, deptId?: number | null, teamId?: number | null) => void;
    refreshFilters: () => void; // 新增：手动刷新过滤器
}

export const useScheduleData = (): UseScheduleDataResult => {
    const [loading, setLoading] = useState(false);
    const [filtersLoading, setFiltersLoading] = useState(false);
    const [filters, setFilters] = useState<DepartmentFilter[]>([]);
    const [styles, setStyles] = useState<Record<string, ShiftStyleV2>>({});
    const [gridData, setGridData] = useState<PersonnelScheduleGridData | null>(null);

    // Initial data load: Filters & Styles
    const fetchInitData = useCallback(async () => {
        setFiltersLoading(true);
        try {
            console.log('[useScheduleData] Fetching filters and styles...');
            const [filterRes, styleRes] = await Promise.all([
                axios.get('/api/personnel-schedules/v2/filters'),
                axios.get('/api/personnel-schedules/v2/shift-styles')
            ]);

            console.log('[useScheduleData] Filters loaded:', filterRes.data);
            setFilters(filterRes.data.departments || []);
            setStyles(styleRes.data || {});
        } catch (error) {
            console.error('[useScheduleData] Failed to init schedule data', error);
        } finally {
            setFiltersLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInitData();
    }, [fetchInitData]);

    const fetchGrid = useCallback(async (
        startDate: string,
        endDate: string,
        deptId?: number | null,
        teamId?: number | null
    ) => {
        setLoading(true);
        try {
            const params: any = { start_date: startDate, end_date: endDate };
            if (deptId) params.department_id = deptId;
            if (teamId) params.team_id = teamId;

            console.log('[useScheduleData] Fetching grid with params:', params);
            const res = await axios.get('/api/personnel-schedules/v2/grid', { params });
            setGridData(res.data);
        } catch (error) {
            console.error('[useScheduleData] Failed to fetch grid data', error);
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        filtersLoading,
        filters,
        styles,
        gridData,
        fetchGrid,
        refreshFilters: fetchInitData
    };
};
