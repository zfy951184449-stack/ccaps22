/**
 * 排班 V2 API 控制器
 */

import { Request, Response } from 'express';
import axios from 'axios';
import { EventSource } from 'eventsource';
import { RowDataPacket } from 'mysql2';
import { DataAssembler } from '../services/schedulingV2/dataAssembler';
import { ResultParser } from '../services/schedulingV2/resultParser';
import { PersistenceService } from '../services/schedulingV2/persistenceService';
import { SolverResponse, SolverConfig, SolverRequest, SchedulingMode } from '../types/schedulingV2';
import solverProgressService from '../services/solverProgressService';
import pool from '../config/database';

// 求解器服务地址
const SOLVER_URL = process.env.SOLVER_URL || 'http://localhost:5001';

/**
 * 使用 SSE 调用求解器并广播进度
 */
async function callSolverWithProgress(
  solverRequest: SolverRequest,
  runId: number,
  timeLimit: number
): Promise<SolverResponse> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('求解器响应超时'));
    }, (timeLimit + 60) * 1000);

    // 使用 fetch 进行 SSE 流式请求
    fetch(`${SOLVER_URL}/api/v2/solve-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(solverRequest),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`求解器返回错误: ${response.status} - ${text}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('无法获取响应流');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEventType = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.substring(7).trim();
              continue;
            }
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              try {
                const parsed = JSON.parse(data);

                // 根据事件类型处理
                if (currentEventType === 'progress') {
                  // 进度更新
                  solverProgressService.broadcastProgress({
                    runId,
                    stage: 'SOLVING',
                    progress: parsed.progress_percent || 0,
                    objective: parsed.best_objective,
                    elapsed: parsed.elapsed_seconds,
                    solutionsFound: parsed.solutions_found,
                    message: `已找到 ${parsed.solutions_found} 个解`,
                  });
                  // 同时更新数据库
                  await PersistenceService.updateSolverProgress(runId, parsed);
                } else if (currentEventType === 'complete') {
                  // 求解完成
                  clearTimeout(timeout);
                  console.log(`[SchedulingV2] SSE 完成事件: status=${parsed.status}`);
                  resolve(parsed as SolverResponse);
                  return;
                } else if (currentEventType === 'error') {
                  // 错误事件
                  clearTimeout(timeout);
                  console.error(`[SchedulingV2] SSE 错误事件:`, parsed);
                  reject(new Error(parsed.error || '求解器错误'));
                  return;
                } else if (currentEventType === 'heartbeat') {
                  // 心跳，忽略
                }

                // 重置事件类型
                currentEventType = '';
              } catch (e) {
                console.error('[SchedulingV2] SSE 数据解析失败:', e, data);
              }
            }
          }
        }

        // 流结束但没有收到完成事件
        clearTimeout(timeout);
        reject(new Error('求解器流意外结束'));
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

/**
 * 安全解析 JSON 字段（MySQL JSON 类型可能已经被自动解析）
 */
function parseJsonField<T>(value: any, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T; // 已经是对象
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * 创建排班任务
 * POST /api/v2/scheduling/solve
 */
export const createSolveTask = async (req: Request, res: Response) => {
  try {
    const { batchIds, window, config, mode } = req.body;

    // 参数验证
    // 如果是 TIME_RANGE 模式，batchIds 可以为空
    // 如果是 BATCH 模式（默认），batchIds 必须非空
    if ((!mode || mode === 'BATCH') && (!batchIds || !Array.isArray(batchIds) || batchIds.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'batchIds 必须是非空数组',
      });
    }

    if (!window || !window.start_date || !window.end_date) {
      return res.status(400).json({
        success: false,
        error: 'window 必须包含 start_date 和 end_date',
      });
    }

    // 创建运行记录
    const { runId, runCode } = await PersistenceService.createRun(
      batchIds,
      { startDate: window.start_date, endDate: window.end_date }
    );

    // 异步执行求解（传入 runCode 用于中断请求匹配）
    executeSolve(runId, runCode, batchIds || [], window, config, mode).catch(err => {
      console.error(`[SchedulingV2] 求解任务 ${runId} 失败:`, err);
      PersistenceService.updateStatus(runId, 'FAILED', 'ERROR', err.message);
    });

    res.json({
      success: true,
      data: {
        runId,
        runCode,
        status: 'QUEUED',
        message: '排班任务已创建，正在准备数据...',
      },
    });
  } catch (error: any) {
    console.error('[SchedulingV2] 创建任务失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '创建排班任务失败',
    });
  }
};

/**
 * 执行求解（异步）
 */
async function executeSolve(
  runId: number,
  runCode: string,
  batchIds: number[],
  window: { start_date: string; end_date: string },
  config?: Partial<SolverConfig>,
  mode?: SchedulingMode
): Promise<void> {
  try {
    // 0. 数据验证
    if ((!mode || mode === 'BATCH') && (!batchIds || batchIds.length === 0)) {
      throw new Error('批次列表不能为空');
    }

    if (!window.start_date || !window.end_date) {
      throw new Error('时间窗口配置无效');
    }

    // 1. 组装数据
    await PersistenceService.updateStatus(runId, 'RUNNING', 'ASSEMBLING');

    const solverRequest = await DataAssembler.assemble({
      batchIds,
      window,
      config,
      mode,
      requestId: runCode,  // 使用 runCode 作为 request_id，用于中断请求匹配
    });

    // 验证组装的数据
    if (solverRequest.operation_demands.length === 0) {
      throw new Error('没有找到需要排班的操作，请检查批次是否已激活');
    }

    if (solverRequest.employee_profiles.length === 0) {
      throw new Error('没有可用的员工，请检查员工状态');
    }

    if (solverRequest.shift_definitions.length === 0) {
      throw new Error('没有定义班次，请先配置班次定义');
    }

    console.log(`[SchedulingV2] 数据组装完成: ${solverRequest.operation_demands.length} 操作, ${solverRequest.employee_profiles.length} 员工, ${solverRequest.shift_definitions.length} 班次`);

    // 2. 调用求解器（使用 SSE 流式接口）
    const timeLimit = config?.solver_time_limit_seconds || 60;
    await PersistenceService.updateStatus(runId, 'RUNNING', 'SOLVING');
    await PersistenceService.setSolveStartTime(runId, timeLimit);

    let solverResponse: SolverResponse;
    try {
      solverResponse = await callSolverWithProgress(solverRequest, runId, timeLimit);
    } catch (solverError: any) {
      if (solverError.code === 'ECONNREFUSED') {
        throw new Error('无法连接到求解器服务，请确保求解器已启动');
      }
      if (solverError.code === 'ETIMEDOUT' || solverError.code === 'ECONNABORTED') {
        throw new Error('求解器响应超时，请尝试增加求解时间限制或减少排班范围');
      }
      throw new Error(`求解器调用失败: ${solverError.message}`);
    }

    console.log(`[SchedulingV2] 求解完成: 状态=${solverResponse.status}`);

    // 检查求解结果
    if (solverResponse.status === 'INFEASIBLE') {
      throw new Error(`无可行解: ${solverResponse.summary || '约束条件过于严格，请放宽部分约束'}`);
    }

    if (solverResponse.status === 'ERROR') {
      throw new Error(`求解器错误: ${solverResponse.error_message || '未知错误'}`);
    }

    // 3. 解析结果
    await PersistenceService.updateStatus(runId, 'RUNNING', 'PARSING');

    const parsedResult = ResultParser.parse(solverResponse);
    const validation = ResultParser.validate(parsedResult);

    if (!validation.valid) {
      console.warn('[SchedulingV2] 结果验证错误:', validation.errors);
      throw new Error(`结果验证失败: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      console.warn('[SchedulingV2] 结果验证警告:', validation.warnings);
    }

    // 4. 保存结果
    await PersistenceService.updateStatus(runId, 'RUNNING', 'PERSISTING');

    // 从班次计划中提取所有参与员工的 ID
    const employeeIds = [...new Set(parsedResult.shiftPlans.map(sp => sp.employeeId))];
    console.log(`[SchedulingV2] 参与员工数: ${employeeIds.length}`);

    const persistResult = await PersistenceService.save(parsedResult, {
      runId,
      batchIds,
      clearExisting: true,
      window: {
        startDate: window.start_date,
        endDate: window.end_date,
      },
      employeeIds,
    });

    if (!persistResult.success) {
      throw new Error(`保存失败: ${persistResult.errors.join(', ')}`);
    }

    console.log(`[SchedulingV2] 保存完成: ${persistResult.assignmentsInserted} 分配, ${persistResult.shiftPlansInserted} 班次`);

    // 记录警告
    if (persistResult.warnings.length > 0) {
      console.warn('[SchedulingV2] 保存警告:', persistResult.warnings);
    }

    // 广播成功完成
    solverProgressService.completeRun(runId, true, '求解完成');

  } catch (error: any) {
    console.error(`[SchedulingV2] 求解失败:`, error);

    // 提取更友好的错误信息
    let errorMessage = error.message || String(error);

    // 处理 axios 错误
    if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    }

    await PersistenceService.updateStatus(
      runId,
      'FAILED',
      'ERROR',
      errorMessage
    );

    // 广播失败
    solverProgressService.completeRun(runId, false, errorMessage);

    throw error;
  }
}

/**
 * 查询排班任务状态
 * GET /api/v2/scheduling/runs/:runId
 */
export const getRunStatus = async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const run = await PersistenceService.getRun(Number(runId));

    if (!run) {
      return res.status(404).json({
        success: false,
        error: '运行记录不存在',
      });
    }

    // 计算求解进度（如果正在求解）
    interface SolverProgressInfo {
      solutions_found: number;
      best_objective: number | null;
      elapsed_seconds: number;
      time_limit_seconds: number;
      estimated_remaining: number;
      progress_percent: number;
    }
    const existingProgress = parseJsonField<SolverProgressInfo | null>(run.solver_progress, null);
    let solverProgress: SolverProgressInfo | null = existingProgress;
    if (run.stage === 'SOLVING' && run.solve_started_at && run.time_limit_seconds) {
      const startTime = new Date(run.solve_started_at).getTime();
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const timeLimit = run.time_limit_seconds;
      const progressPercent = Math.min(100, Math.round((elapsedSeconds / timeLimit) * 100));
      const estimatedRemaining = Math.max(0, timeLimit - elapsedSeconds);

      solverProgress = {
        solutions_found: existingProgress?.solutions_found || 0,
        best_objective: existingProgress?.best_objective ?? null,
        elapsed_seconds: elapsedSeconds,
        time_limit_seconds: timeLimit,
        estimated_remaining: estimatedRemaining,
        progress_percent: progressPercent,
      };
    }

    res.json({
      success: true,
      data: {
        id: run.id,
        run_code: run.run_code,
        status: run.status,
        stage: run.stage,
        window_start: run.window_start,
        window_end: run.window_end,
        target_batch_ids: parseJsonField(run.target_batch_ids, []),
        solver_progress: solverProgress,
        result_summary: parseJsonField(run.result_summary, null),
        error_message: run.error_message,
        created_at: run.created_at,
        completed_at: run.completed_at,
        solve_started_at: run.solve_started_at,
        time_limit_seconds: run.time_limit_seconds,
      },
    });
  } catch (error: any) {
    console.error('[SchedulingV2] 查询状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '查询失败',
    });
  }
};

/**
 * 获取排班结果详情
 * GET /api/v2/scheduling/runs/:runId/result
 */
export const getRunResult = async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const run = await PersistenceService.getRun(Number(runId));

    if (!run) {
      return res.status(404).json({
        success: false,
        error: '运行记录不存在',
      });
    }

    if (run.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: `任务尚未完成，当前状态: ${run.status}`,
      });
    }

    // 获取目标批次IDs
    const batchIds = parseJsonField<number[]>(run.target_batch_ids, []);

    // 从数据库获取详细结果
    const assignments = await getRunAssignments(Number(runId));
    const shiftPlans = await getRunShiftPlans(Number(runId));
    const hoursSummaries = await getRunHoursSummaries(Number(runId), run.window_start, run.window_end);
    const resultSummary = parseJsonField<{ status?: string; message?: string }>(run.result_summary, {});

    // 获取原始操作需求（含 required_people）
    let operationDemands;
    if (batchIds.length > 0) {
      operationDemands = await getOperationDemands(batchIds);
    } else {
      operationDemands = await getOperationDemandsByWindow(run.window_start, run.window_end);
    }

    // 获取激活的班次定义
    const shiftDefinitions = await getActiveShiftDefinitions();

    // 计算统计数据
    const totalOperations = operationDemands.length;
    const totalPositions = operationDemands.reduce((sum, op) => sum + op.required_people, 0);
    const assignedPositions = assignments.length;

    // 计算已分配的操作数（至少有1个岗位分配的操作）
    const operationsWithAssignment = new Set((assignments as any[]).map(a => a.operation_plan_id));
    const assignedOperations = operationsWithAssignment.size;

    // 计算员工数
    const employeesWithShifts = new Set((shiftPlans as any[])
      .filter(p => p.plan_type === 'WORK')
      .map(p => p.employee_id));

    // 从 solver_progress 获取求解统计
    const solverProgress = parseJsonField<{
      solutions_found?: number;
      best_objective?: number | null;
      elapsed_seconds?: number;
    }>(run.solver_progress, {});

    res.json({
      success: true,
      data: {
        request_id: `run-${runId}`,
        status: resultSummary.status || 'COMPLETED',
        summary: resultSummary.message || `已分配 ${assignedPositions} 个岗位`,
        assignments,
        shift_plans: shiftPlans,
        hours_summaries: hoursSummaries,
        operation_demands: operationDemands,
        shift_definitions: shiftDefinitions,
        warnings: [],
        diagnostics: {
          total_operations: totalOperations,
          total_positions: totalPositions,
          assigned_operations: assignedOperations,
          assigned_positions: assignedPositions,
          total_employees: new Set((assignments as any[]).map(a => a.employee_id)).size,
          employees_with_shifts: employeesWithShifts.size,
          total_days: Math.ceil(
            (new Date(run.window_end).getTime() - new Date(run.window_start).getTime()) / (1000 * 60 * 60 * 24)
          ),
          skipped_operations: totalOperations - assignedOperations,
          skipped_positions: totalPositions - assignedPositions,
          shift_plans_created: shiftPlans.length,
          solve_time_seconds: solverProgress.elapsed_seconds || 0,
          solutions_found: solverProgress.solutions_found || 1,
          objective_value: solverProgress.best_objective ?? null,
          monthly_hours_violations: 0,
          consecutive_work_violations: 0,
          night_rest_violations: 0,
          employee_utilization_rate: (shiftPlans as any[]).filter(p => p.plan_type === 'WORK').length / Math.max(shiftPlans.length, 1),
          operation_fulfillment_rate: totalPositions > 0 ? assignedPositions / totalPositions : 1,
        },
      },
    });
  } catch (error: any) {
    console.error('[SchedulingV2] 获取结果失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取结果失败',
    });
  }
};

/**
 * 获取运行的人员分配结果
 */
async function getRunAssignments(runId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       bpa.batch_operation_plan_id as operation_plan_id,
       bpa.position_number,
       bpa.employee_id,
       e.employee_name,
       e.employee_code,
       o.operation_name,
       pbp.batch_code,
       bop.planned_start_datetime as planned_start,
       bop.planned_end_datetime as planned_end
     FROM batch_personnel_assignments bpa
     JOIN employees e ON bpa.employee_id = e.id
     JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
     JOIN operations o ON bop.operation_id = o.id
     JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
     WHERE bpa.scheduling_run_id = ?
     ORDER BY bpa.batch_operation_plan_id, bpa.position_number`,
    [runId]
  );
  return rows;
}

/**
 * 获取运行的班次计划
 */
async function getRunShiftPlans(runId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       esp.employee_id,
       e.employee_name,
       e.employee_code,
       esp.plan_date as date,
       esp.plan_category as plan_type,
       esp.plan_hours,
       esp.shift_id,
       sd.shift_code,
       sd.shift_name,
       sd.nominal_hours as shift_nominal_hours,
       sd.is_night_shift
     FROM employee_shift_plans esp
     JOIN employees e ON esp.employee_id = e.id
     LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
     WHERE esp.scheduling_run_id = ?
     ORDER BY esp.plan_date, esp.employee_id`,
    [runId]
  );

  return rows.map((row: RowDataPacket) => ({
    ...row,
    is_night_shift: !!row.is_night_shift,
    operations: [],
    workshop_minutes: (row.plan_hours || 0) * 60,
    is_overtime: false,
    is_buffer: row.plan_type === 'WORK' && !row.batch_operation_plan_id,
  }));
}

/**
 * 获取操作需求列表（含 required_people）
 */
async function getOperationDemands(batchIds: number[]) {
  if (batchIds.length === 0) return [];

  const placeholders = batchIds.map(() => '?').join(',');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       bop.id AS operation_plan_id,
       pbp.id AS batch_id,
       pbp.batch_code,
       pbp.batch_name,
       o.operation_name,
       bop.planned_start_datetime,
       bop.planned_end_datetime,
       bop.required_people
     FROM batch_operation_plans bop
     JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
     JOIN operations o ON bop.operation_id = o.id
     WHERE pbp.id IN (${placeholders})
       AND pbp.plan_status = 'ACTIVATED'
     ORDER BY bop.planned_start_datetime ASC`,
    batchIds
  );

  return rows.map(row => ({
    operation_plan_id: row.operation_plan_id,
    batch_id: row.batch_id,
    batch_code: row.batch_code,
    batch_name: row.batch_name,
    operation_name: row.operation_name,
    planned_start_datetime: row.planned_start_datetime,
    planned_end_datetime: row.planned_end_datetime,
    required_people: row.required_people || 1,
  }));
}

/**
 * 获取时间窗口内的操作需求
 */
async function getOperationDemandsByWindow(startDate: string, endDate: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       bop.id AS operation_plan_id,
       pbp.id AS batch_id,
       pbp.batch_code,
       pbp.batch_name,
       o.operation_name,
       bop.planned_start_datetime,
       bop.planned_end_datetime,
       bop.required_people
     FROM batch_operation_plans bop
     JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
     JOIN operations o ON bop.operation_id = o.id
     WHERE bop.planned_start_datetime BETWEEN ? AND ?
       AND pbp.plan_status = 'ACTIVATED'
     ORDER BY bop.planned_start_datetime ASC`,
    [startDate, endDate]
  );

  return rows.map(row => ({
    operation_plan_id: row.operation_plan_id,
    batch_id: row.batch_id,
    batch_code: row.batch_code,
    batch_name: row.batch_name,
    operation_name: row.operation_name,
    planned_start_datetime: row.planned_start_datetime,
    planned_end_datetime: row.planned_end_datetime,
    required_people: row.required_people || 1,
  }));
}

/**
 * 获取激活的班次定义列表
 */
async function getActiveShiftDefinitions() {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       id AS shift_id,
       shift_code,
       shift_name,
       start_time,
       end_time,
       is_cross_day,
       nominal_hours,
       is_night_shift
     FROM shift_definitions
     WHERE is_active = 1
     ORDER BY shift_name`
  );

  return rows.map(row => ({
    shift_id: row.shift_id,
    shift_code: row.shift_code,
    shift_name: row.shift_name,
    start_time: row.start_time,
    end_time: row.end_time,
    is_cross_day: !!row.is_cross_day,
    nominal_hours: row.nominal_hours,
    is_night_shift: !!row.is_night_shift,
  }));
}

/**
 * 获取运行的工时统计
 * 
 * 工时计算规则：
 * 1. 标准工时 = 求解区间内该月的工作日数 × 8h
 * 2. 三倍工资日的班次工时不计入统计
 * 3. 使用班次的折算工时（plan_hours，来自 shift_definition.nominal_hours）
 * 4. 统计 BASE、PRODUCTION、OVERTIME 类型的工时（排除 REST）
 */
async function getRunHoursSummaries(runId: number, windowStart: string, windowEnd: string) {
  // 从求解任务中读取实际使用的配置参数（从 options_json 列）
  const [runRows] = await pool.execute<RowDataPacket[]>(
    `SELECT options_json FROM scheduling_runs WHERE id = ?`,
    [runId]
  );

  let lowerOffset = 4;  // 默认值
  let upperOffset = 32; // 默认值

  if (runRows.length > 0 && runRows[0].options_json) {
    try {
      const options = typeof runRows[0].options_json === 'string'
        ? JSON.parse(runRows[0].options_json)
        : runRows[0].options_json;
      // 尝试从 options_json 中读取配置
      lowerOffset = options.monthly_hours_lower_offset ?? options.monthlyHoursLowerOffset ?? 4;
      upperOffset = options.monthly_hours_upper_offset ?? options.monthlyHoursUpperOffset ?? 32;
    } catch (e) {
      console.error('[getRunHoursSummaries] 解析配置失败:', e);
    }
  }

  // 计算求解区间内每月的标准工时（排除三倍工资日）
  const [calendarRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       DATE_FORMAT(calendar_date, '%Y-%m') as month,
       SUM(CASE WHEN is_workday = 1 THEN 1 ELSE 0 END) * 8 as standard_hours,
       SUM(CASE WHEN is_workday = 1 THEN 1 ELSE 0 END) as workday_count
     FROM calendar_workdays
     WHERE calendar_date >= ? AND calendar_date <= ?
     GROUP BY DATE_FORMAT(calendar_date, '%Y-%m')`,
    [windowStart, windowEnd]
  );

  // 构建月份 -> 标准工时的映射
  const standardHoursMap: Record<string, number> = {};
  const workdayCountMap: Record<string, number> = {};
  for (const row of calendarRows) {
    standardHoursMap[row.month] = parseFloat(row.standard_hours) || 0;
    workdayCountMap[row.month] = parseInt(row.workday_count) || 0;
  }

  // 查询三倍工资日列表（从 holiday_salary_config 表获取）
  const [tripleDays] = await pool.execute<RowDataPacket[]>(
    `SELECT calendar_date
     FROM holiday_salary_config
     WHERE calendar_date >= ? AND calendar_date <= ? 
       AND salary_multiplier >= 3 AND is_active = 1`,
    [windowStart, windowEnd]
  );
  const tripleDatesSet = new Set(
    tripleDays.map(r => new Date(r.calendar_date).toISOString().split('T')[0])
  );

  // 查询排班数据（排除三倍工资日的工时）
  // BASE、PRODUCTION、OVERTIME 都计入工时统计（REST 不计入）
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       esp.employee_id,
       e.employee_name,
       e.employee_code,
       esp.plan_date,
       DATE_FORMAT(esp.plan_date, '%Y-%m') as month,
       esp.plan_category,
       esp.plan_hours
     FROM employee_shift_plans esp
     JOIN employees e ON esp.employee_id = e.id
     WHERE esp.scheduling_run_id = ?
       AND esp.plan_date >= ? AND esp.plan_date <= ?`,
    [runId, windowStart, windowEnd]
  );

  // 按员工+月份分组统计
  const summaryMap: Record<string, {
    employee_id: number;
    employee_name: string;
    employee_code: string;
    month: string;
    scheduled_hours: number;
    work_days: number;
    rest_days: number;
    triple_salary_days: number;
  }> = {};

  for (const row of rows) {
    const key = `${row.employee_id}-${row.month}`;
    const planDate = new Date(row.plan_date).toISOString().split('T')[0];
    const isTripleSalary = tripleDatesSet.has(planDate);
    const planHours = parseFloat(row.plan_hours) || 0;
    const isWork = ['BASE', 'PRODUCTION', 'OVERTIME'].includes(row.plan_category);
    const isRest = row.plan_category === 'REST';

    if (!summaryMap[key]) {
      summaryMap[key] = {
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        employee_code: row.employee_code,
        month: row.month,
        scheduled_hours: 0,
        work_days: 0,
        rest_days: 0,
        triple_salary_days: 0,
      };
    }

    const summary = summaryMap[key];

    if (isTripleSalary) {
      summary.triple_salary_days += 1;
      // 三倍工资日的工时不计入统计
    } else if (isWork) {
      summary.scheduled_hours += planHours;
      summary.work_days += 1;
    } else if (isRest) {
      summary.rest_days += 1;
    }
  }

  // 转换为数组并计算偏差
  return Object.values(summaryMap).map(summary => {
    const standardHours = standardHoursMap[summary.month] || 0;
    const hoursDeviation = summary.scheduled_hours - standardHours;
    const minHours = Math.max(0, standardHours - lowerOffset);
    const maxHours = standardHours + upperOffset;
    const isWithinBounds = summary.scheduled_hours >= minHours && summary.scheduled_hours <= maxHours;

    return {
      employee_id: summary.employee_id,
      employee_name: summary.employee_name,
      employee_code: summary.employee_code,
      month: summary.month,
      scheduled_hours: summary.scheduled_hours,
      standard_hours: standardHours,
      hours_deviation: hoursDeviation,
      workshop_hours: summary.scheduled_hours, // 与排班工时相同
      overtime_hours: 0, // 暂不单独统计加班
      work_days: summary.work_days,
      rest_days: summary.rest_days,
      triple_salary_days: summary.triple_salary_days,
      buffer_days: 0, // 暂不单独统计缓冲日
      is_within_bounds: isWithinBounds,
      // 额外信息：工时约束范围
      min_hours: minHours,
      max_hours: maxHours,
    };
  });
}

/**
 * 重新执行排班
 * POST /api/v2/scheduling/runs/:runId/retry
 */
export const retryRun = async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const run = await PersistenceService.getRun(Number(runId));

    if (!run) {
      return res.status(404).json({
        success: false,
        error: '运行记录不存在',
      });
    }

    if (run.status !== 'FAILED') {
      return res.status(400).json({
        success: false,
        error: `只有失败的任务可以重试，当前状态: ${run.status}`,
      });
    }

    const batchIds = parseJsonField<number[]>(run.target_batch_ids, []);
    const window = {
      start_date: run.window_start,
      end_date: run.window_end,
    };

    // 重置状态
    await PersistenceService.updateStatus(Number(runId), 'QUEUED', 'PREPARING');

    // 重新执行（使用 run_code 用于中断请求匹配）
    executeSolve(Number(runId), run.run_code, batchIds, window).catch(err => {
      console.error(`[SchedulingV2] 重试任务 ${runId} 失败:`, err);
    });

    res.json({
      success: true,
      data: {
        runId: Number(runId),
        status: 'QUEUED',
        message: '任务已重新开始',
      },
    });
  } catch (error: any) {
    console.error('[SchedulingV2] 重试失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '重试失败',
    });
  }
};

/**
 * 取消排班任务
 * POST /api/v2/scheduling/runs/:runId/cancel
 */
export const cancelRun = async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const run = await PersistenceService.getRun(Number(runId));

    if (!run) {
      return res.status(404).json({
        success: false,
        error: '运行记录不存在',
      });
    }

    if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        error: `任务无法取消，当前状态: ${run.status}`,
      });
    }

    await PersistenceService.updateStatus(Number(runId), 'CANCELLED', 'CANCELLED');

    res.json({
      success: true,
      data: {
        runId: Number(runId),
        status: 'CANCELLED',
        message: '任务已取消',
      },
    });
  } catch (error: any) {
    console.error('[SchedulingV2] 取消失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '取消失败',
    });
  }
};

/**
 * 中断求解并使用当前结果
 * POST /api/v2/scheduling/runs/:runId/abort
 * 
 * 请求求解器停止计算，并返回当前找到的最优解。
 * 注意：中断会在下次找到解时生效，可能需要等待片刻。
 */
export const abortRun = async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const { request_id } = req.body;

    const run = await PersistenceService.getRun(Number(runId));

    if (!run) {
      return res.status(404).json({
        success: false,
        error: '运行记录不存在',
      });
    }

    if (run.status !== 'RUNNING') {
      return res.status(400).json({
        success: false,
        error: `任务无法中断，当前状态: ${run.status}`,
      });
    }

    // 获取 request_id（从数据库或请求参数）
    const requestId = request_id || run.run_code;

    // 调用求解器的中断接口
    try {
      const abortResponse = await fetch(`${SOLVER_URL}/api/v2/abort/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const abortResult = await abortResponse.json() as { success?: boolean; error?: string; message?: string };

      if (!abortResult.success) {
        console.warn('[SchedulingV2] 求解器中断请求失败:', abortResult.error);
        // 即使求解器中断失败，也继续（可能求解已经完成）
      } else {
        console.log('[SchedulingV2] 求解器中断请求已发送:', abortResult.message);
      }
    } catch (solverError: any) {
      console.warn('[SchedulingV2] 调用求解器中断接口失败:', solverError.message);
      // 继续执行，可能求解器已经完成
    }

    res.json({
      success: true,
      data: {
        runId: Number(runId),
        message: '已请求中断，求解器将在下次找到解时停止并返回当前最优解',
      },
    });
  } catch (error: any) {
    console.error('[SchedulingV2] 中断失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '中断失败',
    });
  }
};

/**
 * 列出排班任务
 * GET /api/v2/scheduling/runs
 */
export const listRuns = async (req: Request, res: Response) => {
  try {
    const { limit = 20, offset = 0, status } = req.query;

    let query = 'SELECT * FROM scheduling_runs';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const pool = (await import('../config/database')).default;
    const [rows] = await pool.execute(query, params);

    res.json({
      success: true,
      data: (rows as any[]).map(run => ({
        id: run.id,
        run_code: run.run_code,
        status: run.status,
        stage: run.stage,
        window_start: run.window_start,
        window_end: run.window_end,
        target_batch_ids: parseJsonField(run.target_batch_ids, []),
        created_at: run.created_at,
        completed_at: run.completed_at,
      })),
    });
  } catch (error: any) {
    console.error('[SchedulingV2] 列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '查询失败',
    });
  }
};

/**
 * 健康检查求解器
 * GET /api/v2/scheduling/solver/health
 */
export const checkSolverHealth = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`${SOLVER_URL}/api/health`, {
      timeout: 5000,
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      error: '求解器服务不可用',
      details: error.message,
    });
  }
};

