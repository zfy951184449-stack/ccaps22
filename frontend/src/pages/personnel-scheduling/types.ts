
export interface ShiftStyleV2 {
    color: string;
    label: string;
    textColor: string;
    borderColor?: string;
}

export interface ScheduleV2GridShift {
    type: 'WORK' | 'REST' | 'LEAVE' | 'UNKNOWN';
    shiftId?: number;
    shiftName?: string;
    hours?: number;
    isOvertime?: boolean;
    specialCoverageCount?: number;
    specialCoverageCodes?: string[];
}

export interface ScheduleV2GridEmployee {
    id: number;
    name: string;
    code: string;
    departmentName: string;
    teamName: string;
    shifts: {
        [date: string]: ScheduleV2GridShift;
    };
}

export interface PersonnelScheduleGridData {
    meta: {
        totalEmployees: number;
        startDate: string;
        endDate: string;
    };
    employees: ScheduleV2GridEmployee[];
}

export interface DepartmentFilter {
    id: number;
    name: string;
    teams: { id: number; name: string }[];
}
