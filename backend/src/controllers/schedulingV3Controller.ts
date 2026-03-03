/**
 * V3 排班 API 控制器
 * 
 * 独立于 V2，调用 solver_v3 服务 (端口 5002)
 */

import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { DataAssemblerV3 } from '../services/schedulingV3/dataAssemblerV3';
import solverProgressService from '../services/solverProgressService';
import pool from '../config/database';

// V3 求解器服务地址
const SOLVER_V3_URL = process.env.SOLVER_V3_URL || 'http://localhost:5002';

/**
 * 创建 V3 排班任务
 * POST /api/v3/scheduling/solve
 */
export const createSolveTaskV3 = async (req: Request, res: Response) => {
    try {
        const { mode, start_date, end_date, batch_ids, config } = req.body;

        // 参数验证
        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                error: 'start_date 和 end_date 必填',
            });
        }

        // 创建运行记录
        const runId = await createRunRecord(start_date, end_date, batch_ids, mode);

        // 异步执行求解
        executeSolveV3(runId, {
            mode,
            start_date,
            end_date,
            batch_ids,
            config,
        }).catch(err => {
            console.error(`[SchedulingV3] 求解任务 ${runId} 失败:`, err);
            updateRunStatus(runId, 'FAILED', err.message);
        });

        res.json({
            success: true,
            data: {
                runId,
                status: 'QUEUED',
                message: 'V3 排班任务已创建',
            },
        });
    } catch (error: any) {
        console.error('[SchedulingV3] 创建任务失败:', error);
        res.status(500).json({
            success: false,
            error: error.message || '创建任务失败',
        });
    }
};

/**
 * 执行 V3 求解（异步）
 */
async function executeSolveV3(
    runId: number,
    params: {
        mode: string;
        start_date: string;
        end_date: string;
        batch_ids?: number[];
        config?: any;
    }
): Promise<void> {
    try {
        // 1. 组装数据
        await updateRunStatus(runId, 'RUNNING', null, 'ASSEMBLING');

        const solverRequest = await DataAssemblerV3.assemble({
            startDate: params.start_date,
            endDate: params.end_date,
            batchIds: params.batch_ids,
            config: params.config,
        });

        console.log(`[SchedulingV3] 数据组装完成: ${solverRequest.operations.length} 操作, ${solverRequest.employees.length} 员工`);

        // 2. 调用 V3 求解器
        await updateRunStatus(runId, 'RUNNING', null, 'SOLVING');

        const response = await fetch(`${SOLVER_V3_URL}/api/v3/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(solverRequest),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`V3 求解器返回错误: ${response.status} - ${text}`);
        }

        const solverResponse: any = await response.json();
        console.log(`[SchedulingV3] 求解完成: 状态=${solverResponse.status}`);

        // 3. 检查结果
        if (solverResponse.status === 'INFEASIBLE') {
            throw new Error('无可行解');
        }

        if (solverResponse.status === 'ERROR') {
            throw new Error(solverResponse.message || '求解器错误');
        }

        // 4. 保存结果
        await updateRunStatus(runId, 'RUNNING', null, 'PERSISTING');
        await saveResultsV3(runId, solverResponse);

        // 5. 完成
        await updateRunStatus(runId, 'COMPLETED', null, 'DONE');
        solverProgressService.completeRun(runId, true, 'V3 求解完成');

    } catch (error: any) {
        console.error(`[SchedulingV3] 求解失败:`, error);
        await updateRunStatus(runId, 'FAILED', error.message);
        solverProgressService.completeRun(runId, false, error.message);
        throw error;
    }
}

/**
 * 列出 V3 排班任务
 * GET /api/v3/scheduling/runs
 */
export const listRunsV3 = async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id, status, stage, window_start, window_end, created_at, completed_at
       FROM scheduling_runs 
       WHERE run_code LIKE 'V3-%'
       ORDER BY created_at DESC 
       LIMIT 50`
        );

        res.json({
            success: true,
            data: rows,
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * 查询 V3 任务状态
 * GET /api/v3/scheduling/runs/:runId
 */
export const getRunStatusV3 = async (req: Request, res: Response) => {
    try {
        const { runId } = req.params;
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT * FROM scheduling_runs WHERE id = ? AND run_code LIKE 'V3-%'`,
            [runId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'V3 运行记录不存在' });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * SSE 实时进度推送 (增强版)
 * GET /api/v3/scheduling/runs/:runId/progress
 * 
 * 推送事件:
 * - progress: 进度更新 (stage, progress, metrics)
 * - objective: 目标函数值更新
 * - complete: 求解完成
 * - error: 错误信息
 */
export const getSolveProgressSSE = async (req: Request, res: Response) => {
    const { runId } = req.params;
    const startTime = Date.now();

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',  // 禁用 nginx 缓冲
    });

    // 发送初始连接确认
    res.write(`event: connected\ndata: {"runId":${runId},"message":"SSE连接已建立"}\n\n`);

    let lastObjectiveValue: number | null = null;
    let solutionCount = 0;

    // 500ms 轮询检查状态
    const checkInterval = setInterval(async () => {
        try {
            const [rows] = await pool.execute<RowDataPacket[]>(
                `SELECT status, stage, solver_progress, options_json, completed_at
                 FROM scheduling_runs WHERE id = ?`,
                [runId]
            );

            if (rows.length === 0) {
                res.write(`event: error\ndata: {"error":"任务不存在"}\n\n`);
                clearInterval(checkInterval);
                res.end();
                return;
            }

            const run = rows[0];
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

            // 解析求解进度 (如果有)
            let progressPercent = 0;
            let currentObjective: number | undefined;
            let metrics = {
                hard_constraint_satisfaction: 100,
                understaffed_operations: 0,
                share_group_consistency: 100,
                fairness_deviation: 0,
                solutions_found: solutionCount,
            };

            if (run.solver_progress) {
                try {
                    const progressData = typeof run.solver_progress === 'string'
                        ? JSON.parse(run.solver_progress)
                        : run.solver_progress;
                    progressPercent = progressData.progress || 0;
                    currentObjective = progressData.best_objective;

                    // 如果有新的解
                    if (currentObjective !== undefined && currentObjective !== lastObjectiveValue) {
                        lastObjectiveValue = currentObjective;
                        solutionCount++;
                        metrics.solutions_found = solutionCount;

                        // 推送目标函数更新
                        res.write(`event: objective\ndata: ${JSON.stringify({
                            time: elapsedSeconds,
                            value: currentObjective
                        })}\n\n`);
                    }

                    // 合并来自solver的指标
                    if (progressData.metrics) {
                        metrics = { ...metrics, ...progressData.metrics };
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }

            // 推送进度更新
            res.write(`event: progress\ndata: ${JSON.stringify({
                runId: Number(runId),
                status: run.status,
                stage: run.stage,
                progress: progressPercent,
                elapsed: elapsedSeconds,
                metrics,
                bestObjective: currentObjective,
            })}\n\n`);

            // 检查是否完成
            if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
                res.write(`event: complete\ndata: ${JSON.stringify({
                    status: run.status,
                    runId: Number(runId),
                    resultUrl: `/api/v3/scheduling/runs/${runId}/result`
                })}\n\n`);
                clearInterval(checkInterval);
                res.end();
            }
        } catch (e) {
            console.error('[SSE] 状态检查失败:', e);
        }
    }, 500);

    req.on('close', () => {
        clearInterval(checkInterval);
        console.log(`[SSE] 客户端断开连接 (runId: ${runId})`);
    });
};

/**
 * 获取 V3 任务结果
 * GET /api/v3/scheduling/runs/:runId/result
 */
export const getRunResultV3 = async (req: Request, res: Response) => {
    try {
        const { runId } = req.params;

        // 获取分配结果
        const [assignments] = await pool.execute<RowDataPacket[]>(
            `SELECT 
         bpa.id,
         bpa.batch_operation_plan_id as operation_plan_id,
         bpa.employee_id,
         bpa.position_number,
         bpa.assignment_status,
         e.employee_name, 
         e.employee_code, 
         o.operation_name,
         bop.planned_start_datetime as planned_start,
         bop.planned_end_datetime as planned_end
       FROM batch_personnel_assignments bpa
       JOIN employees e ON bpa.employee_id = e.id
       JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
       JOIN operations o ON bop.operation_id = o.id
       WHERE bpa.scheduling_run_id = ?
       ORDER BY bpa.batch_operation_plan_id, bpa.position_number`,
            [runId]
        );

        // 获取班次计划
        const [shiftPlans] = await pool.execute<RowDataPacket[]>(
            `SELECT esp.*, e.employee_name, e.employee_code
       FROM employee_shift_plans esp
       JOIN employees e ON esp.employee_id = e.id
       WHERE esp.scheduling_run_id = ?
       ORDER BY esp.plan_date, esp.employee_id`,
            [runId]
        );

        res.json({
            success: true,
            data: {
                assignments,
                shift_plans: shiftPlans,
            },
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};



/**
 * 中止 V3 求解任务
 * POST /api/v3/scheduling/runs/:runId/cancel
 * 
 * 设置取消标志，求解器会在下次检查时停止并返回当前最优解
 */
export const cancelRunV3 = async (req: Request, res: Response) => {
    try {
        const { runId } = req.params;

        // 检查任务是否存在且正在运行
        const [rows] = await pool.execute<RowDataPacket[]>(
            'SELECT status FROM scheduling_runs WHERE id = ? AND run_code LIKE \'V3-%\'',
            [runId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'V3 运行记录不存在' });
        }

        const currentStatus = rows[0].status;
        if (currentStatus !== 'RUNNING' && currentStatus !== 'QUEUED') {
            return res.status(400).json({
                success: false,
                error: `任务状态为 ${currentStatus}，无法取消`
            });
        }

        // 设置取消标志 (通过 options_json 字段传递)
        // 不改变 status，让求解器在检测到标志后自行更新状态为 FAILED
        await pool.execute(
            `UPDATE scheduling_runs 
             SET options_json = JSON_SET(COALESCE(options_json, '{}'), '$.cancel_requested', true)
             WHERE id = ?`,
            [runId]
        );

        // 添加取消标记到内存缓存 (供求解器检查)
        cancelledRuns.add(Number(runId));

        console.log(`[SchedulingV3] 任务 ${runId} 已标记为取消`);

        res.json({
            success: true,
            message: '取消请求已发送，求解器将在下一检查点停止',
            runId: Number(runId)
        });
    } catch (error: any) {
        console.error('[SchedulingV3] 取消任务失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// 取消任务的内存缓存 (用于快速检查)
const cancelledRuns = new Set<number>();

/**
 * 检查任务是否被请求取消
 */
export const isCancelRequested = (runId: number): boolean => {
    return cancelledRuns.has(runId);
};

/**
 * 清除取消标记
 */
export const clearCancelFlag = (runId: number): void => {
    cancelledRuns.delete(runId);
};

/**
 * V3 求解器健康检查
 */
export const checkSolverHealthV3 = async (req: Request, res: Response) => {
    try {
        const response = await fetch(`${SOLVER_V3_URL}/api/v3/health`);
        const data = await response.json();
        res.json({ success: true, data });
    } catch (error: any) {
        res.json({
            success: false,
            error: 'V3 求解器不可用',
            solverUrl: SOLVER_V3_URL,
        });
    }
};

// ============ 辅助函数 ============

/**
 * 创建运行记录
 */
async function createRunRecord(
    startDate: string,
    endDate: string,
    batchIds?: number[],
    mode?: string
): Promise<number> {
    const runCode = `V3-${Date.now()}`;
    const [result] = await pool.execute<any>(
        `INSERT INTO scheduling_runs 
     (run_code, run_key, status, stage, window_start, window_end, period_start, period_end, target_batch_ids, options_json)
     VALUES (?, ?, 'QUEUED', 'INIT', ?, ?, ?, ?, ?, ?)`,
        [
            runCode,
            runCode,  // run_key uses same value as run_code
            startDate,
            endDate,
            startDate,  // period_start
            endDate,    // period_end
            JSON.stringify(batchIds || []),
            JSON.stringify({ mode }),
        ]
    );
    return result.insertId;
}

/**
 * 更新运行状态
 */
async function updateRunStatus(
    runId: number,
    status: string,
    errorMessage?: string | null,
    stage?: string
): Promise<void> {
    const updates: string[] = ['status = ?'];
    const values: any[] = [status];

    if (stage) {
        updates.push('stage = ?');
        values.push(stage);
    }

    if (errorMessage !== undefined) {
        updates.push('error_message = ?');
        values.push(errorMessage);
    }

    if (status === 'COMPLETED' || status === 'FAILED') {
        updates.push('completed_at = NOW()');
    }

    values.push(runId);

    await pool.execute(
        `UPDATE scheduling_runs SET ${updates.join(', ')} WHERE id = ?`,
        values
    );
}

/**
 * 保存 V3 结果 (覆盖模式)
 * 
 * 1. 删除旧的非锁定分配记录
 * 2. 插入新的分配结果
 */
async function saveResultsV3(runId: number, solverResponse: any): Promise<void> {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const assignments = solverResponse.assignments || [];

        // 获取所有涉及的操作ID
        const operationIds = [...new Set(assignments.map((a: any) => a.operation_id))];

        if (operationIds.length > 0) {
            // 删除旧的非锁定记录 (保留 is_locked=1 的记录)
            const placeholders = operationIds.map(() => '?').join(',');
            await conn.execute(
                `DELETE FROM batch_personnel_assignments 
                 WHERE batch_operation_plan_id IN (${placeholders})
                 AND (is_locked IS NULL OR is_locked = 0)`,
                operationIds as any[]
            );
            console.log(`[SchedulingV3] 已删除 ${operationIds.length} 个操作的旧分配记录 (保留锁定记录)`);
        }

        // 插入新的分配结果
        for (const assignment of assignments) {
            await conn.execute(
                `INSERT INTO batch_personnel_assignments 
         (batch_operation_plan_id, position_number, employee_id, scheduling_run_id)
         VALUES (?, ?, ?, ?)`,
                [
                    assignment.operation_id,
                    assignment.position_number,
                    assignment.employee_id,
                    runId,
                ]
            );
        }

        // 更新运行记录
        await conn.execute(
            `UPDATE scheduling_runs 
       SET result_summary = ?, solver_progress = ?
       WHERE id = ?`,
            [
                JSON.stringify({
                    status: solverResponse.status,
                    assignments_count: (solverResponse.assignments || []).length,
                }),
                JSON.stringify(solverResponse.diagnostics || {}),
                runId,
            ]
        );

        await conn.commit();
        console.log(`[SchedulingV3] 保存完成: ${(solverResponse.assignments || []).length} 分配`);
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

// ============ 应用结果到系统 ============

/**
 * 应用 V3 求解结果到系统
 * POST /api/v3/scheduling/runs/:runId/apply
 * 
 * 将暂存的 V3 求解结果正式写入生产表:
 * - batch_personnel_assignments (插入/更新分配)
 * - employee_shift_plans (生成班次计划)
 */
export async function applyRunResultV3(req: Request, res: Response) {
    const { runId } = req.params;
    const conn = await pool.getConnection();

    try {
        // 1. 检查任务状态
        const [runs] = await conn.execute<RowDataPacket[]>(
            `SELECT id, status, window_start, window_end FROM scheduling_runs WHERE id = ?`,
            [runId]
        );

        if (runs.length === 0) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }

        const run = runs[0];
        if (run.status !== 'COMPLETED') {
            return res.status(400).json({ success: false, error: '任务未完成，无法应用' });
        }

        await conn.beginTransaction();

        // 2. 获取暂存的分配结果
        const [assignments] = await conn.execute<RowDataPacket[]>(
            `SELECT bpa.* 
       FROM batch_personnel_assignments bpa
       JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
       WHERE bpa.scheduling_run_id = ?`,
            [runId]
        );

        if (assignments.length === 0) {
            await conn.rollback();
            return res.json({
                success: true,
                message: '无需应用 - 没有分配记录',
                applied_count: 0
            });
        }

        // 3. 更新分配状态为已确认
        await conn.execute(
            `UPDATE batch_personnel_assignments 
       SET assignment_status = 'ACTIVE' 
       WHERE scheduling_run_id = ?`,
            [runId]
        );

        // 4. 生成/更新班次计划 (基于分配的操作时间)
        const shiftPlansGenerated = await generateShiftPlansFromAssignments(conn, Number(runId));

        // 5. 更新任务状态为已应用
        await conn.execute(
            `UPDATE scheduling_runs SET stage = 'APPLIED' WHERE id = ?`,
            [runId]
        );

        await conn.commit();

        console.log(`[SchedulingV3] 结果已应用: ${assignments.length} 分配, ${shiftPlansGenerated} 班次`);

        res.json({
            success: true,
            message: '结果已成功应用到系统',
            applied_count: assignments.length,
            shift_plans_generated: shiftPlansGenerated,
        });
    } catch (error: any) {
        await conn.rollback();
        console.error('[SchedulingV3] 应用结果失败:', error);
        res.status(500).json({ success: false, error: error.message || '应用失败' });
    } finally {
        conn.release();
    }
}

/**
 * 基于操作分配生成班次计划
 */
async function generateShiftPlansFromAssignments(
    conn: any,
    runId: number
): Promise<number> {
    // 获取分配记录及操作时间
    const [assignments] = await conn.execute(
        `SELECT 
      bpa.employee_id,
      DATE(bop.planned_start_datetime) as plan_date,
      MIN(TIME(bop.planned_start_datetime)) as earliest_start,
      MAX(TIME(bop.planned_end_datetime)) as latest_end,
      SUM(TIMESTAMPDIFF(HOUR, bop.planned_start_datetime, bop.planned_end_datetime)) as total_hours
    FROM batch_personnel_assignments bpa
    JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
    WHERE bpa.scheduling_run_id = ?
    GROUP BY bpa.employee_id, DATE(bop.planned_start_datetime)`,
        [runId]
    );

    // 1. 获取所有通过定义的班次
    const [allShifts] = await conn.execute(
        `SELECT id, shift_name, start_time, end_time, is_night_shift, nominal_hours 
         FROM shift_definitions WHERE is_active = 1`
    );

    let generatedCount = 0;

    for (const row of assignments) {
        let selectedShiftId = 1; // 默认白班
        let maxOverlap = -1;

        // 简单的班次匹配逻辑: 找覆盖对应时间段的班次
        // 如果有多个，选重叠时间最长的 (或工时最接近的)

        // 解析行数据
        const earliest = row.earliest_start; // "HH:MM:SS"
        // row.plan_date (Date object or string)

        // 尝试匹配最佳班次
        // 这里做一个简化的逻辑：匹配开始时间最接近的班次
        // 这比之前的 >= 18:00 更准确，因为它依赖于数据库里的真实定义

        let bestMatch = null;
        let minDiff = 999999;

        for (const shift of (allShifts as any[])) {
            // 计算开始时间差异 (分钟)
            // shift.start_time is "HH:MM:SS"
            const shiftStart = parseTime(shift.start_time);
            const workStart = parseTime(earliest);

            let diff = Math.abs(shiftStart - workStart);
            if (diff > 720) diff = 1440 - diff; // 处理跨午夜差异

            if (diff < minDiff) {
                minDiff = diff;
                bestMatch = shift;
            }
        }

        if (bestMatch) {
            selectedShiftId = bestMatch.id;
        } else {
            // Fallback to old heuristic if no match found (should not happen if generic shifts form a basis)
            const isNightShift = row.earliest_start >= '18:00:00' || row.latest_end <= '06:00:00';
            const fallback = (allShifts as any[]).find((s: any) => s.is_night_shift === (isNightShift ? 1 : 0));
            if (fallback) selectedShiftId = fallback.id;
        }

        // 插入或更新班次计划
        await conn.execute(
            `INSERT INTO employee_shift_plans 
       (employee_id, plan_date, shift_id, plan_hours, plan_category, scheduling_run_id)
       VALUES (?, ?, ?, ?, 'PRODUCTION', ?)
       ON DUPLICATE KEY UPDATE 
         plan_hours = VALUES(plan_hours),
         scheduling_run_id = VALUES(scheduling_run_id),
         shift_id = VALUES(shift_id)`, // 更新 shift_id
            [row.employee_id, row.plan_date, selectedShiftId, row.total_hours || 8, runId]
        );

        generatedCount++;
    }

    return generatedCount;
}

function parseTime(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}
