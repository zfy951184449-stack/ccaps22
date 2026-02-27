import { Request, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../config/database';

import dayjs from 'dayjs';

export const getUnavailability = async (req: Request, res: Response) => {
    try {
        const { unitId, employeeId, startDate, endDate } = req.query;

        let sql = `
      WITH RECURSIVE UnitHierarchy AS (
        SELECT id FROM organization_units WHERE id = ?
        UNION ALL
        SELECT u.id FROM organization_units u
        INNER JOIN UnitHierarchy uh ON u.parent_id = uh.id
      )
      SELECT eu.id,
             eu.employee_id,
             e.employee_name,
             eu.start_datetime,
             eu.end_datetime,
             eu.reason_code,
             eu.reason_label,
             eu.notes,
             eu.created_at
        FROM employee_unavailability eu
        JOIN employees e ON eu.employee_id = e.id
       WHERE 1=1
    `;

        const params: any[] = [];

        if (employeeId) {
            // Need to handle the CTE parameter placeholder even if we don't use unitId logic primarily, 
            // but actually, if employeeId is present, we might disregard unitId strict filtering or still apply it.
            // However, the SQL structure above starts with CTE.
            // If unitId is NOT provided, the CTE might return empty or fail if we pass null.
            // Let's restructure to only use CTE if unitId is provided.
        }

        // RE-WRITING LOGIC TO BE SAFE:
        // We cannot easily inject CTE conditionally in the middle string without careful parameter management.
        // Better approach:

        let baseQuery = `
      SELECT eu.id,
             eu.employee_id,
             e.employee_name,
             eu.start_datetime,
             eu.end_datetime,
             eu.reason_code,
             eu.reason_label,
             eu.notes,
             eu.created_at
        FROM employee_unavailability eu
        JOIN employees e ON eu.employee_id = e.id
       WHERE 1=1
    `;

        if (employeeId) {
            baseQuery += ` AND eu.employee_id = ?`;
            params.push(employeeId);
        } else if (unitId) {
            // Use CTE only when filtering by unit
            sql = `
      WITH RECURSIVE UnitHierarchy AS (
        SELECT id FROM organization_units WHERE id = ?
        UNION ALL
        SELECT u.id FROM organization_units u
        INNER JOIN UnitHierarchy uh ON u.parent_id = uh.id
      )
      ${baseQuery}
      AND e.unit_id IN (SELECT id FROM UnitHierarchy)
      `;
            // CTE parameter comes first
            params.unshift(unitId);
        } else {
            // No unitId, no employeeId -> just base query (global fetch? might want to limit this but keeping original behavior)
            sql = baseQuery;
        }

        if (startDate) {
            sql += ` AND eu.end_datetime >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            sql += ` AND eu.start_datetime <= ?`;
            params.push(endDate);
        }

        sql += ` ORDER BY eu.start_datetime DESC`;

        const [rows] = await pool.execute<RowDataPacket[]>(sql, params);

        const formattedRows = rows.map(row => ({
            id: row.id,
            employeeId: row.employee_id,
            employeeName: row.employee_name,
            startDate: row.start_datetime,
            endDate: row.end_datetime,
            reasonCode: row.reason_code,
            reasonLabel: row.reason_label,
            notes: row.notes,
            createdAt: row.created_at
        }));

        res.json(formattedRows);
    } catch (error) {
        console.error('Failed to fetch unavailability:', error);
        res.status(500).json({ error: 'Failed to fetch unavailability records' });
    }
};

export const createUnavailability = async (req: Request, res: Response) => {
    try {
        const { employeeId, startDatetime, endDatetime, reasonCode, reasonLabel, notes } = req.body;

        if (!employeeId || !startDatetime || !endDatetime || !reasonCode) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const formattedStart = dayjs(startDatetime).format('YYYY-MM-DD HH:mm:ss');
        const formattedEnd = dayjs(endDatetime).format('YYYY-MM-DD HH:mm:ss');

        const sql = `
      INSERT INTO employee_unavailability 
      (employee_id, start_datetime, end_datetime, reason_code, reason_label, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

        const [result] = await pool.execute<ResultSetHeader>(sql, [
            employeeId,
            formattedStart,
            formattedEnd,
            reasonCode,
            reasonLabel || reasonCode,
            notes || null
        ]);

        res.status(201).json({ id: result.insertId, message: 'Record created successfully' });
    } catch (error) {
        console.error('Failed to create unavailability:', error);
        res.status(500).json({ error: 'Failed to create unavailability record' });
    }
};

export const updateUnavailability = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;
        const { startDatetime, endDatetime, reasonCode, reasonLabel, notes } = req.body;

        if (!id) {
            res.status(400).json({ error: 'Missing record ID' });
            return;
        }

        const formattedStart = dayjs(startDatetime).format('YYYY-MM-DD HH:mm:ss');
        const formattedEnd = dayjs(endDatetime).format('YYYY-MM-DD HH:mm:ss');

        const sql = `
      UPDATE employee_unavailability
         SET start_datetime = ?,
             end_datetime = ?,
             reason_code = ?,
             reason_label = ?,
             notes = ?,
             updated_at = NOW()
       WHERE id = ?
    `;

        const [result] = await pool.execute<ResultSetHeader>(sql, [
            formattedStart,
            formattedEnd,
            reasonCode,
            reasonLabel || reasonCode,
            notes || null,
            id
        ]);

        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Record not found' });
            return;
        }

        res.json({ message: 'Record updated successfully' });
    } catch (error) {
        console.error('Failed to update unavailability:', error);
        res.status(500).json({ error: 'Failed to update unavailability record' });
    }
};

export const deleteUnavailability = async (req: Request, res: Response) => {
    try {
        const id = req.params.id;

        if (!id) {
            res.status(400).json({ error: 'Missing record ID' });
            return;
        }

        const sql = `DELETE FROM employee_unavailability WHERE id = ?`;

        const [result] = await pool.execute<ResultSetHeader>(sql, [id]);

        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Record not found' });
            return;
        }

        res.json({ message: 'Record deleted successfully' });
    } catch (error) {
        console.error('Failed to delete unavailability:', error);
        res.status(500).json({ error: 'Failed to delete unavailability record' });
    }
};
