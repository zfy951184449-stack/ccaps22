import { Request, Response } from 'express';
import pool from '../config/database';
import dayjs from 'dayjs';
import {
    ScheduleV2GridResponse,
    ScheduleV2GridEmployee,
    ScheduleV2FiltersResponse,
    ShiftStylesV2Response,
    ShiftStyleV2
} from '../models/types';

/**
 * GET /api/personnel-schedules/v2/filters
 * Retrieves cascading filter data: Departments -> Teams
 */
export const getFilters = async (_req: Request, res: Response) => {
    try {
        // Fetch all active departments
        const [deptRows] = await pool.execute<any[]>(
            `SELECT id, unit_name as name 
       FROM organization_units 
       WHERE unit_type = 'DEPARTMENT' AND is_active = 1 
       ORDER BY sort_order, unit_name`
        );

        // Fetch all active teams from \`organization_units\` table
        const [teamRows] = await pool.execute<any[]>(
            `SELECT id, parent_id, unit_name as name 
             FROM organization_units 
             WHERE unit_type = 'TEAM' AND is_active = 1 
             ORDER BY sort_order, unit_name`
        );

        // Map teams to departments
        const departments = deptRows.map((dept) => {
            const teams = teamRows
                .filter((team) => team.parent_id === dept.id)
                .map((team) => ({ id: team.id, name: team.name }));

            return {
                id: dept.id,
                name: dept.name,
                teams
            };
        });

        const response: ScheduleV2FiltersResponse = { departments };
        res.json(response);
    } catch (error) {
        console.error('Error fetching V2 filters:', error);
        res.status(500).json({ error: 'Failed to fetch filters' });
    }
};

/**
 * GET /api/personnel-schedules/v2/shift-styles
 * Returns style mapping for all active shifts based on their properties
 */
export const getShiftStyles = async (_req: Request, res: Response) => {
    try {
        const [rows] = await pool.execute<any[]>(
            `SELECT id, shift_name, is_night_shift, nominal_hours, category 
       FROM shift_definitions 
       WHERE is_active = 1`
        );

        const styles: ShiftStylesV2Response = {};

        rows.forEach((row) => {
            let style: ShiftStyleV2;

            // Logic for determining style
            if (row.category === 'REST') {
                style = {
                    color: 'bg-gray-100',
                    label: '休',
                    textColor: 'text-gray-400'
                };
            } else if (row.is_night_shift) {
                style = {
                    color: 'bg-blue-500/10',
                    label: String(row.nominal_hours),
                    textColor: 'text-blue-600',
                    borderColor: 'border-blue-200'
                };
            } else if (row.nominal_hours >= 11) {
                // Long day shift
                style = {
                    color: 'bg-indigo-500/10',
                    label: String(row.nominal_hours),
                    textColor: 'text-indigo-600'
                };
            } else {
                // Standard day shift (e.g. 8h)
                style = {
                    color: 'bg-emerald-500/10',
                    label: String(row.nominal_hours),
                    textColor: 'text-emerald-600'
                };
            }

            styles[row.id] = style;
        });

        res.json(styles);
    } catch (error) {
        console.error('Error fetching V2 shift styles:', error);
        res.status(500).json({ error: 'Failed to fetch shift styles' });
    }
};

/**
 * GET /api/personnel-schedules/v2/grid
 * Returns the main grid data
 * Params: start_date, end_date, department_id?, team_id?
 */
export const getGridData = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date, department_id, team_id } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({ error: 'start_date and end_date are required' });
        }

        // 1. Build Employee Query
        // Updated: Join `organization_units` for both department and team
        let employeeSql = `
      SELECT e.id, e.employee_code, e.employee_name, 
             dept.unit_name as department_name, 
             team.unit_name as team_name
      FROM employees e
      LEFT JOIN organization_units u ON e.unit_id = u.id
      LEFT JOIN organization_units team ON (
        (u.unit_type = 'TEAM' AND u.id = team.id) OR
        (u.unit_type = 'GROUP' AND u.parent_id = team.id)
      )
      LEFT JOIN organization_units dept ON (
        (u.unit_type = 'DEPARTMENT' AND u.id = dept.id) OR
        (team.parent_id = dept.id) OR
        (u.unit_type = 'TEAM' AND u.parent_id = dept.id)
      )
      WHERE e.employment_status = 'ACTIVE'
    `;

        const params: any[] = [];

        if (department_id) {
            employeeSql += ` AND dept.id = ?`;
            params.push(department_id);
        }

        if (team_id) {
            employeeSql += ` AND team.id = ?`;
            params.push(team_id);
        }

        employeeSql += ` ORDER BY dept.sort_order, team.unit_name, e.employee_code`;

        const [employees] = await pool.execute<any[]>(employeeSql, params);

        // 2. Build Shift Plan Query
        // We fetch ALL shifts for the date range for simplicity, or we could filter by the employee IDs if needed.
        // Given potentially large range but limited employees, filtering by employee IDs is safer.

        if (employees.length === 0) {
            return res.json({
                meta: {
                    totalEmployees: 0,
                    startDate: start_date,
                    endDate: end_date
                },
                employees: []
            });
        }

        const employeeIds = employees.map(e => e.id);
        const placeHolders = employeeIds.map(() => '?').join(',');

        const shiftSql = `
      SELECT esp.employee_id, esp.plan_date, esp.shift_id, esp.plan_category, esp.plan_hours,
             sd.shift_name, esp.is_locked
      FROM employee_shift_plans esp
      LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
      WHERE esp.plan_date BETWEEN ? AND ?
        AND esp.employee_id IN (${placeHolders})
    `;

        const [shifts] = await pool.execute<any[]>(shiftSql, [start_date, end_date, ...employeeIds]);

        // 3. Assemble Response
        // Map shifts by EmployeeID -> Date
        const shiftMap = new Map<number, Map<string, any>>();

        shifts.forEach((row) => {
            if (!shiftMap.has(row.employee_id)) {
                shiftMap.set(row.employee_id, new Map());
            }
            // Date format from DB might be Date object or string
            const dateStr = dayjs(row.plan_date).format('YYYY-MM-DD');
            shiftMap.get(row.employee_id)?.set(dateStr, row);
        });

        const gridEmployees: ScheduleV2GridEmployee[] = employees.map((emp) => {
            const empShifts: Record<string, any> = {};
            const map = shiftMap.get(emp.id);

            if (map) {
                map.forEach((shiftData, date) => {
                    let type = 'UNKNOWN';
                    if (shiftData.plan_category === 'REST') type = 'REST';
                    else if (['PRODUCTION', 'OPERATION', 'BASE', 'OVERTIME'].includes(shiftData.plan_category)) type = 'WORK';

                    empShifts[date] = {
                        type,
                        shiftId: shiftData.shift_id,
                        shiftName: shiftData.shift_name,
                        hours: shiftData.plan_hours,
                        isOvertime: shiftData.plan_category === 'OVERTIME'
                    };
                });
            }

            return {
                id: emp.id,
                code: emp.employee_code,
                name: emp.employee_name,
                departmentName: emp.department_name || '',
                teamName: emp.team_name || '',
                shifts: empShifts
            };
        });

        const response: ScheduleV2GridResponse = {
            meta: {
                totalEmployees: gridEmployees.length,
                startDate: String(start_date),
                endDate: String(end_date)
            },
            employees: gridEmployees
        };

        res.json(response);

    } catch (error) {
        console.error('Error fetching V2 grid data:', error);
        res.status(500).json({ error: 'Failed to fetch grid data' });
    }
};
