/**
 * rosterCalendarAssembler —— 排班日历(员工 × 日:班次 + 对应工作)的共享聚合逻辑。
 *
 * 被两处复用,保证管理视角与员工自助视角口径一致:
 *   - personnelScheduleV2Controller.getCalendarData (/api/personnel-schedules/v2/calendar)
 *   - meController.getMyCalendar               (/api/me/calendar)
 *
 * 输入约定:`rows` 为 班次计划 LEFT JOIN 工作 展开后的明细行,字段名见 fold 实现;
 * `employees` 为待装配的员工基础行(id/employee_code/employee_name/org_role/unit_id);
 * `unitMap` 为全部启用组织单元,用于回溯 部门/Team/组 标签。
 */
import dayjs from 'dayjs';

export interface OrgUnitLite {
    id: number;
    parent_id: number | null;
    unit_type: 'DEPARTMENT' | 'TEAM' | 'GROUP' | 'SHIFT' | string;
    unit_name: string;
}

/** 由 unit_id 向上回溯,解析出该员工所属的 部门 / Team / 组 名称。 */
export const resolveOrgLabels = (
    unitId: number | null,
    unitMap: Map<number, OrgUnitLite>
): { departmentName: string; teamName: string; groupName: string } => {
    let departmentName = '';
    let teamName = '';
    let groupName = '';
    let cur = unitId != null ? unitMap.get(unitId) : undefined;
    let guard = 0;
    while (cur && guard++ < 16) {
        if (cur.unit_type === 'DEPARTMENT' && !departmentName) departmentName = cur.unit_name;
        else if (cur.unit_type === 'TEAM' && !teamName) teamName = cur.unit_name;
        else if (cur.unit_type === 'GROUP' && !groupName) groupName = cur.unit_name;
        cur = cur.parent_id != null ? unitMap.get(cur.parent_id) : undefined;
    }
    return { departmentName, teamName, groupName };
};

/** 由选中的 unit_id 向下收集其子树(含自身)的全部 unit id —— 用于把"组/Team/部门"展开成员工集合。 */
export const collectSubtreeUnitIds = (rootId: number, unitMap: Map<number, OrgUnitLite>): number[] => {
    const childrenByParent = new Map<number, number[]>();
    unitMap.forEach((u) => {
        if (u.parent_id != null) {
            const arr = childrenByParent.get(u.parent_id) || [];
            arr.push(u.id);
            childrenByParent.set(u.parent_id, arr);
        }
    });
    const result: number[] = [];
    const queue: number[] = [rootId];
    let guard = 0;
    while (queue.length && guard++ < 5000) {
        const id = queue.shift()!;
        result.push(id);
        (childrenByParent.get(id) || []).forEach((c) => queue.push(c));
    }
    return result;
};

/** WORK 班次细分:白班 / 夜班 / 长白班(供前端配色,与排班矩阵一致)。 */
export const classifyWorkShift = (shiftName: string | null, isNight: boolean): 'day' | 'night' | 'long' => {
    const name = (shiftName || '').toLowerCase();
    if (isNight || name.includes('夜') || name.includes('night')) return 'night';
    if (name.includes('长白') || name.includes('long')) return 'long';
    return 'day';
};

const fmtTime = (v: any): string => {
    if (!v) return '';
    const d = dayjs(v);
    return d.isValid() ? d.format('HH:mm') : String(v).slice(0, 5);
};

export interface RosterEmployeeBase {
    id: number;
    employee_code: string;
    employee_name: string;
    org_role?: string | null;
    unit_id?: number | null;
}

export interface OpTeamMember {
    employeeId: number;
    name: string;
    code: string;
    positionNumber: number | null;
    role: string;
}
export interface OpTeamInfo {
    requiredPeople: number;
    members: OpTeamMember[];
}

/**
 * 把明细行折叠成 员工 → 日期 → { 班次, 工作[] },并算出当期四项汇总。
 * JOIN 会把"班次计划 × 工作"展开成多行,需按 plan_id / operation_plan_id 去重。
 *
 * @param opTeamMap 可选:operation_plan_id → 该操作全部岗位的成员 + 需求人数,
 *                  用于在每道工作上挂"同岗成员/空缺"。
 */
export const foldEmployeeDays = (
    rows: any[],
    employees: RosterEmployeeBase[],
    unitMap: Map<number, OrgUnitLite>,
    opTeamMap?: Map<number, OpTeamInfo>
) => {
    interface DayAgg {
        plans: Map<number, any>;
        ops: Map<number, any>;
    }
    const empDayMap = new Map<number, Map<string, DayAgg>>();

    rows.forEach((row) => {
        const empId = row.employee_id;
        const dateStr = dayjs(row.plan_date).format('YYYY-MM-DD');
        if (!empDayMap.has(empId)) empDayMap.set(empId, new Map());
        const dayMap = empDayMap.get(empId)!;
        if (!dayMap.has(dateStr)) dayMap.set(dateStr, { plans: new Map(), ops: new Map() });
        const agg = dayMap.get(dateStr)!;

        if (row.plan_id != null && !agg.plans.has(row.plan_id)) {
            agg.plans.set(row.plan_id, row);
        }
        if (row.operation_plan_id != null && !agg.ops.has(row.operation_plan_id)) {
            agg.ops.set(row.operation_plan_id, row);
        }
    });

    return employees.map((emp) => {
        const labels = resolveOrgLabels(emp.unit_id ?? null, unitMap);
        const dayMap = empDayMap.get(emp.id);
        const days: Record<string, any> = {};

        let attendanceDays = 0;
        let planHours = 0;
        let nightCount = 0;
        let opCount = 0;

        if (dayMap) {
            dayMap.forEach((agg, date) => {
                const planArr = Array.from(agg.plans.values());
                const workPlan = planArr.find((p) => p.plan_category !== 'REST' && p.shift_id != null)
                    || planArr.find((p) => p.plan_category !== 'REST')
                    || planArr[0];

                const isRest = !workPlan || workPlan.plan_category === 'REST';
                const isNight = !!(workPlan && workPlan.is_night_shift);
                const type = isRest ? 'REST' : 'WORK';

                const shift = workPlan ? {
                    shiftId: workPlan.shift_id ?? null,
                    shiftName: workPlan.shift_name ?? null,
                    shiftCode: workPlan.shift_code ?? null,
                    startTime: fmtTime(workPlan.start_time),
                    endTime: fmtTime(workPlan.end_time),
                    hours: Number(workPlan.plan_hours ?? workPlan.nominal_hours ?? 0),
                    isNight,
                    category: workPlan.plan_category,
                    isLocked: !!workPlan.is_locked,
                    type,
                    kind: isRest ? 'rest' : classifyWorkShift(workPlan.shift_name, isNight)
                } : null;

                const operations = Array.from(agg.ops.values())
                    .sort((a, b) => String(a.op_start || '').localeCompare(String(b.op_start || '')))
                    .map((op) => {
                        const teamInfo = opTeamMap ? opTeamMap.get(op.operation_plan_id) : undefined;
                        const members = teamInfo ? teamInfo.members : [];
                        return {
                            operationPlanId: op.operation_plan_id,
                            batchCode: op.batch_code || '',
                            batchName: op.batch_name || '',
                            operationName: op.operation_name || '未命名操作',
                            stageName: op.stage_name || '',
                            start: op.op_start,
                            end: op.op_end,
                            startTime: fmtTime(op.op_start),
                            endTime: fmtTime(op.op_end),
                            role: op.assignment_role || '',
                            positionNumber: op.position_number ?? null,
                            requiredPeople: teamInfo ? teamInfo.requiredPeople : members.length,
                            team: members
                        };
                    });

                days[date] = { shift, operations };

                if (!isRest) {
                    attendanceDays += 1;
                    planHours += Number(workPlan?.plan_hours ?? 0);
                    if (isNight) nightCount += 1;
                }
                opCount += operations.length;
            });
        }

        return {
            id: emp.id,
            code: emp.employee_code,
            name: emp.employee_name,
            role: emp.org_role || '',
            departmentName: labels.departmentName,
            teamName: labels.teamName,
            groupName: labels.groupName,
            summary: {
                attendanceDays,
                planHours: Number(planHours.toFixed(1)),
                nightCount,
                opCount
            },
            days
        };
    });
};

/** 班次计划 + 对应工作 的明细行查询(列名与 foldEmployeeDays 约定一致)。两个 controller 共用。 */
export const ROSTER_CALENDAR_ROWS_SELECT = `
    SELECT
        esp.employee_id,
        esp.id            AS plan_id,
        esp.plan_date,
        esp.plan_category,
        esp.plan_hours,
        esp.overtime_hours,
        esp.is_locked,
        sd.id             AS shift_id,
        sd.shift_code,
        sd.shift_name,
        sd.start_time,
        sd.end_time,
        sd.nominal_hours,
        sd.is_night_shift,
        bop.id            AS operation_plan_id,
        bop.planned_start_datetime AS op_start,
        bop.planned_end_datetime   AS op_end,
        o.operation_name,
        pbp.batch_code,
        pbp.batch_name,
        bpa.role          AS assignment_role,
        bpa.position_number,
        ps.stage_name
    FROM employee_shift_plans esp
    LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
    LEFT JOIN batch_personnel_assignments bpa
           ON esp.id = bpa.shift_plan_id
          AND bpa.assignment_status IN ('PLANNED', 'CONFIRMED')
    LEFT JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
    LEFT JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
    LEFT JOIN operations o ON bop.operation_id = o.id
    LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
    LEFT JOIN process_stages ps ON sos.stage_id = ps.id`;

/**
 * 某些 operation_plan_id 下"全部岗位的分配 + 需求人数"——用于在工作上挂同岗成员/空缺。
 * 用法:`${ROSTER_OP_TEAM_SELECT} WHERE bpa.batch_operation_plan_id IN (?,?,...) ...`
 */
export const ROSTER_OP_TEAM_SELECT = `
    SELECT
        bpa.batch_operation_plan_id AS op_id,
        bpa.employee_id,
        bpa.position_number,
        bpa.role,
        e.employee_name,
        e.employee_code,
        COALESCE(o.required_people, bop.required_people) AS required_people
    FROM batch_personnel_assignments bpa
    JOIN employees e ON e.id = bpa.employee_id
    JOIN batch_operation_plans bop ON bop.id = bpa.batch_operation_plan_id
    LEFT JOIN operations o ON o.id = bop.operation_id`;

/** 把 ROSTER_OP_TEAM_SELECT 的明细行折叠成 operation_plan_id → { requiredPeople, members[] }。 */
export const buildOpTeamMap = (rows: any[]): Map<number, OpTeamInfo> => {
    const map = new Map<number, OpTeamInfo>();
    rows.forEach((r) => {
        const opId = Number(r.op_id);
        if (!map.has(opId)) {
            map.set(opId, { requiredPeople: Number(r.required_people ?? 0), members: [] });
        }
        const info = map.get(opId)!;
        // 同一员工可能因多岗去重;按 employee_id + position 唯一
        const exists = info.members.some(
            (m) => m.employeeId === Number(r.employee_id) && m.positionNumber === (r.position_number ?? null)
        );
        if (!exists) {
            info.members.push({
                employeeId: Number(r.employee_id),
                name: r.employee_name || '',
                code: r.employee_code || '',
                positionNumber: r.position_number ?? null,
                role: r.role || ''
            });
        }
    });
    // 成员按岗位号排序,缺岗在前端按 requiredPeople 推算
    map.forEach((info) => info.members.sort(
        (a, b) => (a.positionNumber ?? 99) - (b.positionNumber ?? 99)
    ));
    return map;
};
