/**
 * Scheduling V4 - Precheck Handler
 * 
 * Assembles solver request data and proxies it to the Solver /api/v4/precheck endpoint.
 * Frontend calls POST /api/v4/scheduling/precheck with { batch_ids, start_date, end_date, config }.
 */
import { Request, Response } from 'express';
import { DataAssemblerV4 } from '../../services/schedulingV4/DataAssemblerV4';
import { SOLVER_V4_URL } from './types';

export const runPrecheckV4 = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date, batch_ids, config } = req.body;

        if (!start_date || !end_date) {
            return res.status(400).json({ success: false, error: 'start_date and end_date are required' });
        }

        if (!batch_ids || !Array.isArray(batch_ids) || batch_ids.length === 0) {
            return res.status(400).json({ success: false, error: 'batch_ids are required' });
        }

        console.log(`[SchedulingV4] Precheck requested: ${start_date} ~ ${end_date}, ${batch_ids.length} batches`);

        // 1. Assemble solver request data (same as solve flow)
        const teamIds = config?.team_ids || [];
        const solverRequest = await DataAssemblerV4.assemble(start_date, end_date, batch_ids, teamIds);

        console.log(`[SchedulingV4] Precheck data assembled: ${solverRequest.operation_demands.length} ops, ${solverRequest.employee_profiles.length} employees`);

        // 2. Forward to Solver precheck endpoint
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30 * 1000); // 30s timeout (precheck is fast)

        const response = await fetch(`${SOLVER_V4_URL}/api/v4/precheck`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...solverRequest,
                config: {
                    ...config,
                    ...(solverRequest.config || {}),
                },
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[SchedulingV4] Solver precheck error: ${response.statusText}`, errorText);
            return res.status(502).json({
                success: false,
                error: `Solver precheck failed: ${response.statusText}`,
            });
        }

        const result = await response.json() as { status: string; checks: any[]; total_checks: number };

        console.log(`[SchedulingV4] Precheck result: ${result.status} (${result.total_checks} checks)`);

        // 3. Return to frontend
        res.json({
            success: true,
            data: result,
        });

    } catch (error: any) {
        console.error('[SchedulingV4] Precheck Failed:', error);

        if (error.name === 'AbortError') {
            return res.status(504).json({ success: false, error: 'Precheck timed out' });
        }

        res.status(500).json({ success: false, error: error.message });
    }
};
