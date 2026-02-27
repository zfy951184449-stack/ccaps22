import axios from 'axios';
import {
    ManpowerCurveData,
    WorkHoursData,
    DailyAssignmentsData,
    DepartmentOption,
    ShiftOption
} from '../types/dashboard';
import { organizationStructureApi } from './api';

const API_BASE = '/api';

export const dashboardService = {
    // Options
    // Options
    getOrgOptions: async (): Promise<DepartmentOption[]> => {
        try {
            const treeData = await organizationStructureApi.getTree();

            // Recursively build options from the tree
            const buildOptions = (nodes: any[]): DepartmentOption[] => {
                return nodes.map(node => ({
                    value: node.id,
                    label: node.unitName,
                    children: node.children && node.children.length > 0 ? buildOptions(node.children) : undefined
                }));
            };

            return buildOptions(treeData.units);
        } catch (error) {
            console.error('Failed to load org tree:', error);
            return [];
        }
    },

    getShiftOptions: async (): Promise<ShiftOption[]> => {
        const res = await axios.get(`${API_BASE}/dashboard/shifts`);
        return res.data || [];
    },

    // Data
    getManpowerCurve: async (
        yearMonth: string,
        orgPath: number[] = [],
        shiftId?: number
    ): Promise<ManpowerCurveData> => {
        const params: any = { year_month: yearMonth };

        if (orgPath && orgPath.length > 0) {
            // The Cascader returns the full path (e.g., [DeptId, TeamId, GroupId]).
            // The actual selected node is always the last element.
            // We pass it to the backend as `unit_id` and let the backend figure out its type.
            params.unit_id = orgPath[orgPath.length - 1];
        }

        if (shiftId) {
            params.shift_id = shiftId;
        }

        const res = await axios.get(`${API_BASE}/dashboard/manpower-curve`, { params });
        return res.data;
    },

    getWorkHoursCurve: async (
        granularity: 'day' | 'month',
        dateOrRange: string | [string, string],
        orgPath: number[] = []
    ): Promise<WorkHoursData> => {
        const params: any = { granularity };

        if (granularity === 'day') {
            params.year_month = dateOrRange as string;
        } else {
            const [start, end] = dateOrRange as [string, string];
            params.start_month = start;
            params.end_month = end;
        }

        if (orgPath && orgPath.length > 0) {
            params.unit_id = orgPath[orgPath.length - 1];
        }

        const res = await axios.get(`${API_BASE}/dashboard/work-hours-curve`, { params });
        return res.data;
    },

    getDailyAssignments: async (date: string): Promise<DailyAssignmentsData> => {
        const res = await axios.get(`${API_BASE}/dashboard/daily-assignments`, {
            params: { date },
        });
        return res.data;
    }
};
