
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

/* ───────── 排班日历(员工 × 日:班次 + 对应工作)───────── */

/** 组织级联选项(部门 / Team / 组),由组织树裁剪得到,SHIFT 层不进级联。 */
export interface OrgCascadeOption {
    value: number;
    label: string;
    unitType: 'DEPARTMENT' | 'TEAM' | 'GROUP';
    children?: OrgCascadeOption[];
}

export type ShiftKind = 'day' | 'night' | 'long' | 'rest' | 'leave';

/** 日历日类型(独立于班次:这一"天"本身是工作日/周末/法定节假日/调休补班)。 */
export type DayType = 'workday' | 'weekend' | 'holiday' | 'makeup';
export interface DayTypeInfo {
    dayType: DayType;
    holidayName: string | null;
    isTripleSalary: boolean;
}
export type WorkdayMap = Record<string, DayTypeInfo>;

export interface RosterCalendarShift {
    shiftId: number | null;
    shiftName: string | null;
    shiftCode: string | null;
    startTime: string;
    endTime: string;
    hours: number;
    isNight: boolean;
    category: string;
    isLocked: boolean;
    type: 'WORK' | 'REST' | 'LEAVE' | 'UNKNOWN';
    kind: ShiftKind;
}

export interface RosterCalendarTeamMember {
    employeeId: number;
    name: string;
    code: string;
    positionNumber: number | null;
    role: string;
}

export interface RosterCalendarOperation {
    operationPlanId: number;
    batchCode: string;
    batchName: string;
    operationName: string;
    stageName: string;
    start: string | null;
    end: string | null;
    startTime: string;
    endTime: string;
    role: string;
    positionNumber: number | null;
    requiredPeople: number;
    team: RosterCalendarTeamMember[];
}

export interface RosterCalendarDay {
    shift: RosterCalendarShift | null;
    operations: RosterCalendarOperation[];
}

export interface RosterCalendarEmployeeSummary {
    attendanceDays: number;
    planHours: number;
    nightCount: number;
    opCount: number;
}

export interface RosterCalendarEmployee {
    id: number;
    code: string;
    name: string;
    role: string;
    departmentName: string;
    teamName: string;
    groupName: string;
    summary: RosterCalendarEmployeeSummary;
    days: Record<string, RosterCalendarDay>;
}

export interface RosterCalendarResponse {
    meta: {
        totalEmployees: number;
        startDate: string;
        endDate: string;
    };
    employees: RosterCalendarEmployee[];
}
