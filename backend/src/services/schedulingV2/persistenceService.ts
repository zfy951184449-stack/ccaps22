/**
 * 持久化服务
 * 
 * 将求解结果写入数据库
 */

import pool from '../../config/database';
import { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import {
  ParsedResult,
  AssignmentRecord,
  ShiftPlanRecord,
} from './resultParser';

/**
 * 班次定义缓存
 */
interface ShiftDefinition {
  id: number;
  shiftCode: string;
  nominalHours: number;
}

/**
 * 持久化选项
 */
export interface PersistenceOptions {
  runId: number;
  batchIds: number[];
  clearExisting: boolean;
  /** 求解区间 - 用于清除该区间内的班次计划 */
  window?: {
    startDate: string;
    endDate: string;
  };
  /** 参与求解的员工ID列表 - 用于清除这些员工的班次计划 */
  employeeIds?: number[];
}

/**
 * 持久化结果
 */
export interface PersistenceResult {
  success: boolean;
  assignmentsInserted: number;
  shiftPlansInserted: number;
  warnings: string[];
  errors: string[];
}

/**
 * 持久化服务
 */
export class PersistenceService {
  // 班次定义缓存
  private static shiftDefinitionsCache: Map<number, ShiftDefinition> | null = null;
  private static restShiftId: number | null = null;

  /**
   * 加载班次定义缓存
   */
  private static async loadShiftDefinitions(connection: PoolConnection): Promise<void> {
    if (this.shiftDefinitionsCache !== null) return;

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, shift_code, nominal_hours FROM shift_definitions WHERE is_active = 1`
    );

    this.shiftDefinitionsCache = new Map();
    for (const row of rows) {
      this.shiftDefinitionsCache.set(row.id, {
        id: row.id,
        shiftCode: row.shift_code,
        nominalHours: row.nominal_hours,
      });

      // 找到 REST 班次
      if (row.shift_code === 'REST' || row.shift_code === 'rest') {
        this.restShiftId = row.id;
      }
    }

    console.log(`[PersistenceService] 加载了 ${this.shiftDefinitionsCache.size} 个班次定义, REST班次ID=${this.restShiftId}`);
  }

  /**
   * 验证操作ID是否存在
   */
  private static async validateOperationIds(
    connection: PoolConnection,
    assignments: AssignmentRecord[],
    batchIds: number[]
  ): Promise<{ valid: Set<number>; invalid: number[] }> {
    if (assignments.length === 0) {
      return { valid: new Set(), invalid: [] };
    }

    const opIds = [...new Set(assignments.map(a => a.batchOperationPlanId))];
    const batchPlaceholders = batchIds.map(() => '?').join(',');

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM batch_operation_plans 
       WHERE id IN (${opIds.map(() => '?').join(',')})
         AND batch_plan_id IN (${batchPlaceholders})`,
      [...opIds, ...batchIds]
    );

    const validIds = new Set(rows.map(r => r.id as number));
    const invalidIds = opIds.filter(id => !validIds.has(id));

    return { valid: validIds, invalid: invalidIds };
  }

  /**
   * 保存求解结果
   */
  static async save(
    result: ParsedResult,
    options: PersistenceOptions
  ): Promise<PersistenceResult> {
    const connection = await pool.getConnection();
    const warnings: string[] = [];
    const errors: string[] = [];
    let assignmentsInserted = 0;
    let shiftPlansInserted = 0;

    console.log(`[PersistenceService] 开始保存结果: runId=${options.runId}, batchIds=[${options.batchIds}]`);
    console.log(`[PersistenceService] 待保存: ${result.assignments.length} 分配, ${result.shiftPlans.length} 班次`);

    try {
      await connection.beginTransaction();

      // 0. 加载班次定义缓存
      await this.loadShiftDefinitions(connection);

      // 1. 预检查：验证操作ID是否有效
      const { valid: validOpIds, invalid: invalidOpIds } = await this.validateOperationIds(
        connection,
        result.assignments,
        options.batchIds
      );
      
      if (invalidOpIds.length > 0) {
        warnings.push(`发现 ${invalidOpIds.length} 个无效的操作ID: ${invalidOpIds.slice(0, 5).join(', ')}${invalidOpIds.length > 5 ? '...' : ''}`);
        console.warn(`[PersistenceService] 无效操作ID: ${invalidOpIds}`);
      }

      // 过滤掉无效的分配
      const validAssignments = result.assignments.filter(a => validOpIds.has(a.batchOperationPlanId));
      console.log(`[PersistenceService] 有效分配: ${validAssignments.length}/${result.assignments.length}`);

      // 2. 清除旧数据（如果需要）
      if (options.clearExisting) {
        console.log(`[PersistenceService] 清除批次 [${options.batchIds}] 的旧数据...`);
        await this.clearExistingData(connection, options);
        console.log(`[PersistenceService] 旧数据清除完成`);
      }

      // 3. 写入人员分配
      console.log(`[PersistenceService] 开始写入 ${validAssignments.length} 个分配...`);
      assignmentsInserted = await this.insertAssignments(
        connection,
        validAssignments,
        options.runId,
        warnings
      );
      console.log(`[PersistenceService] 分配写入完成: ${assignmentsInserted}/${validAssignments.length}`);

      // 4. 写入班次计划
      console.log(`[PersistenceService] 开始写入 ${result.shiftPlans.length} 个班次计划...`);
      shiftPlansInserted = await this.insertShiftPlans(
        connection,
        result.shiftPlans,
        options.runId,
        warnings
      );
      console.log(`[PersistenceService] 班次写入完成: ${shiftPlansInserted}/${result.shiftPlans.length}`);

      // 5. 更新调度运行记录状态
      await this.updateRunStatus(connection, options.runId, result);

      await connection.commit();
      console.log(`[PersistenceService] 事务已提交`);

      return {
        success: true,
        assignmentsInserted,
        shiftPlansInserted,
        warnings,
        errors,
      };
    } catch (error: any) {
      console.error(`[PersistenceService] 保存失败，回滚事务:`, error);
      await connection.rollback();
      errors.push(error.message || String(error));
      
      return {
        success: false,
        assignmentsInserted: 0,
        shiftPlansInserted: 0,
        warnings,
        errors,
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 清除现有数据
   * 
   * 清除范围（根据用户要求）：
   * 1. 人员分配：求解周期内**所有批次**的非锁定分配
   * 2. 班次计划：求解周期内**所有员工**的非锁定班次
   * 
   * 注意：
   * - 由于外键约束，需要先清除引用再删除
   * - 锁定的数据（is_locked = 1）会被保留
   */
  private static async clearExistingData(
    connection: PoolConnection,
    options: PersistenceOptions
  ): Promise<void> {
    const { window } = options;
    
    if (!window) {
      console.log(`[clearExistingData] 未提供求解区间，跳过清除`);
      return;
    }

    console.log(`[clearExistingData] 清除求解区间 ${window.startDate} ~ ${window.endDate} 内的所有非锁定数据`);

    // 1. 获取求解区间内所有班次计划（非锁定的）
    const [shiftPlansToDelete] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM employee_shift_plans
       WHERE plan_date BETWEEN ? AND ?
         AND is_locked = 0`,
      [window.startDate, window.endDate]
    );
    console.log(`[clearExistingData] 找到 ${shiftPlansToDelete.length} 条非锁定班次计划待删除`);

    if (shiftPlansToDelete.length > 0) {
      const shiftPlanIds = shiftPlansToDelete.map(sp => sp.id);
      const spPlaceholders = shiftPlanIds.map(() => '?').join(',');
      
      // 2. 清除所有引用这些班次计划的非锁定分配的引用
      const [updateResult] = await connection.execute<ResultSetHeader>(
        `UPDATE batch_personnel_assignments
         SET shift_plan_id = NULL
         WHERE shift_plan_id IN (${spPlaceholders})
           AND is_locked = 0`,
        shiftPlanIds
      );
      console.log(`[clearExistingData] 清除了 ${updateResult.affectedRows} 条人员分配的班次引用`);
    }

    // 3. 删除求解区间内所有批次的非锁定人员分配
    // 通过操作的计划时间来判断是否在求解区间内
    const [deleteAssignResult] = await connection.execute<ResultSetHeader>(
      `DELETE bpa FROM batch_personnel_assignments bpa
       JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
       WHERE DATE(bop.planned_start_datetime) BETWEEN ? AND ?
         AND bpa.is_locked = 0`,
      [window.startDate, window.endDate]
    );
    console.log(`[clearExistingData] 删除了 ${deleteAssignResult.affectedRows} 条人员分配记录（所有批次）`);

    // 4. 删除求解区间内的非锁定班次计划
    if (shiftPlansToDelete.length > 0) {
      const deleteIds = shiftPlansToDelete.map(sp => sp.id);
      
      // 检查是否有锁定分配仍然引用这些班次
      const spPlaceholders = deleteIds.map(() => '?').join(',');
      const [lockedRefs] = await connection.execute<RowDataPacket[]>(
        `SELECT DISTINCT shift_plan_id 
         FROM batch_personnel_assignments 
         WHERE shift_plan_id IN (${spPlaceholders}) 
           AND is_locked = 1`,
        deleteIds
      );
      
      const lockedShiftPlanIds = new Set(lockedRefs.map(r => r.shift_plan_id));
      const safeToDeleteIds = deleteIds.filter(id => !lockedShiftPlanIds.has(id));
      
      if (lockedShiftPlanIds.size > 0) {
        console.warn(`[clearExistingData] 警告: ${lockedShiftPlanIds.size} 个班次计划被锁定分配引用，将保留`);
      }
      
      if (safeToDeleteIds.length > 0) {
        const safeSpPlaceholders = safeToDeleteIds.map(() => '?').join(',');
        
        // 删除班次计划
        const [shiftResult] = await connection.execute<ResultSetHeader>(
          `DELETE FROM employee_shift_plans WHERE id IN (${safeSpPlaceholders})`,
          safeToDeleteIds
        );
        console.log(`[clearExistingData] 删除了 ${shiftResult.affectedRows} 条班次计划记录`);
      }
    }
    
    console.log(`[clearExistingData] 清除完成`);
  }

  /**
   * 写入人员分配
   */
  private static async insertAssignments(
    connection: PoolConnection,
    assignments: AssignmentRecord[],
    runId: number,
    warnings: string[]
  ): Promise<number> {
    let inserted = 0;
    let failed = 0;

    console.log(`[insertAssignments] 开始写入 ${assignments.length} 个分配记录`);
    
    if (assignments.length > 0) {
      console.log(`[insertAssignments] 示例: op=${assignments[0].batchOperationPlanId}, pos=${assignments[0].positionNumber}, emp=${assignments[0].employeeId}`);
    }

    for (const assignment of assignments) {
      try {
        await connection.execute(
          `INSERT INTO batch_personnel_assignments
            (batch_operation_plan_id, position_number, employee_id, assignment_status, is_locked, scheduling_run_id)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             employee_id = VALUES(employee_id),
             assignment_status = VALUES(assignment_status),
             scheduling_run_id = VALUES(scheduling_run_id)`,
          [
            assignment.batchOperationPlanId,
            assignment.positionNumber,
            assignment.employeeId,
            assignment.assignmentStatus,
            assignment.isLocked ? 1 : 0,
            runId,
          ]
        );
        inserted++;
      } catch (error: any) {
        failed++;
        if (failed <= 5) {
          console.error(`[insertAssignments] 插入失败: op=${assignment.batchOperationPlanId}, pos=${assignment.positionNumber}, emp=${assignment.employeeId}, error=${error.message}`);
        }
        warnings.push(
          `分配写入失败: 操作 ${assignment.batchOperationPlanId}, 岗位 ${assignment.positionNumber}, 员工 ${assignment.employeeId}: ${error.message}`
        );
      }
    }

    console.log(`[insertAssignments] 完成: 成功=${inserted}, 失败=${failed}`);
    return inserted;
  }

  /**
   * 写入班次计划
   */
  private static async insertShiftPlans(
    connection: PoolConnection,
    shiftPlans: ShiftPlanRecord[],
    runId: number,
    warnings: string[]
  ): Promise<number> {
    let inserted = 0;

    for (const plan of shiftPlans) {
      try {
        // 获取关联的操作计划ID（如果有操作）
        // 注意：由于数据库字段限制，只能存储第一个操作ID
        // 完整的操作-班次关联通过 batch_personnel_assignments.shift_plan_id 维护
        let batchOperationPlanId: number | null = null;
        if (plan.operations.length > 0) {
          batchOperationPlanId = plan.operations[0].operationPlanId;
        }

        // 映射 plan_category:
        // - WORK + 有操作 -> PRODUCTION
        // - WORK + 无操作 -> BASE (补工时/正常上班但无生产任务)
        // - REST -> REST
        // - UNAVAILABLE -> REST
        let dbPlanCategory = 'BASE';
        if (plan.planCategory === 'REST' || plan.planCategory === 'UNAVAILABLE') {
          dbPlanCategory = 'REST';
        } else if (plan.planCategory === 'WORK') {
          // 有操作才是 PRODUCTION，否则是 BASE
          dbPlanCategory = plan.operations.length > 0 ? 'PRODUCTION' : 'BASE';
        }

        // 处理 shift_id 为空的情况
        let shiftId = plan.shiftId;
        let planHours = plan.planHours;

        if (shiftId === null || shiftId === undefined) {
          if (dbPlanCategory === 'REST') {
            // REST 类型使用 REST 班次
            shiftId = this.restShiftId;
            planHours = 0;
          } else {
            // 非 REST 类型但没有 shift_id，记录警告
            warnings.push(`班次ID为空: 员工 ${plan.employeeId}, 日期 ${plan.planDate}`);
            // 尝试从班次定义缓存获取工时
            if (shiftId && this.shiftDefinitionsCache?.has(shiftId)) {
              const shiftDef = this.shiftDefinitionsCache.get(shiftId)!;
              planHours = shiftDef.nominalHours;
            }
          }
        } else {
          // 如果有 shift_id，确保 planHours 来自班次定义
          if (this.shiftDefinitionsCache?.has(shiftId)) {
            const shiftDef = this.shiftDefinitionsCache.get(shiftId)!;
            // 只在求解器返回的 planHours 异常时才覆盖
            if (planHours <= 0 && shiftDef.nominalHours > 0) {
              planHours = shiftDef.nominalHours;
            }
          }
        }

        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO employee_shift_plans
            (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours,
             batch_operation_plan_id, scheduling_run_id, is_generated)
           VALUES (?, ?, ?, ?, 'PLANNED', ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             shift_id = VALUES(shift_id),
             plan_category = VALUES(plan_category),
             plan_hours = VALUES(plan_hours),
             batch_operation_plan_id = COALESCE(VALUES(batch_operation_plan_id), batch_operation_plan_id),
             scheduling_run_id = VALUES(scheduling_run_id),
             updated_at = NOW()`,
          [
            plan.employeeId,
            plan.planDate,
            shiftId,
            dbPlanCategory,
            planHours,
            batchOperationPlanId,
            runId,
          ]
        );

        if (result.affectedRows > 0) {
          inserted++;
        }

        // 更新人员分配中的 shift_plan_id
        if (plan.operations.length > 0) {
          const [shiftPlanRow] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM employee_shift_plans
             WHERE employee_id = ? AND plan_date = ?`,
            [plan.employeeId, plan.planDate]
          );

          if (shiftPlanRow.length > 0) {
            const shiftPlanId = shiftPlanRow[0].id;
            
            // 批量更新所有相关操作的 shift_plan_id
            const opIds = plan.operations.map(op => op.operationPlanId);
            if (opIds.length > 0) {
              const opPlaceholders = opIds.map(() => '?').join(',');
              await connection.execute(
                `UPDATE batch_personnel_assignments
                 SET shift_plan_id = ?
                 WHERE batch_operation_plan_id IN (${opPlaceholders}) AND employee_id = ?`,
                [shiftPlanId, ...opIds, plan.employeeId]
              );
            }
          }
        }
      } catch (error: any) {
        warnings.push(
          `班次计划写入失败: 员工 ${plan.employeeId}, 日期 ${plan.planDate}: ${error.message}`
        );
      }
    }

    return inserted;
  }

  /**
   * 更新调度运行记录状态
   */
  private static async updateRunStatus(
    connection: PoolConnection,
    runId: number,
    result: ParsedResult
  ): Promise<void> {
    await connection.execute(
      `UPDATE scheduling_runs
       SET status = 'COMPLETED',
           stage = 'COMPLETED',
           result_summary = ?,
           completed_at = NOW()
       WHERE id = ?`,
      [
        JSON.stringify({
          totalAssignments: result.summary.totalAssignments,
          totalShiftPlans: result.summary.totalShiftPlans,
          status: result.summary.status,
          message: result.summary.message,
        }),
        runId,
      ]
    );
  }

  /**
   * 创建调度运行记录
   */
  static async createRun(
    batchIds: number[],
    window: { startDate: string; endDate: string },
    createdBy?: number
  ): Promise<{ runId: number; runCode: string }> {
    const runCode = `SCH-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    // 生成 UUID 格式的 run_key (兼容旧版表结构，36字符)
    // 格式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const hex = () => Math.random().toString(16).slice(2);
    const runKey = `${hex().slice(0,8)}-${hex().slice(0,4)}-${hex().slice(0,4)}-${hex().slice(0,4)}-${hex().slice(0,12).padEnd(12,'0')}`;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO scheduling_runs
        (run_key, run_code, status, stage, window_start, window_end, target_batch_ids, period_start, period_end, created_by)
       VALUES (?, ?, 'QUEUED', 'PREPARING', ?, ?, ?, ?, ?, ?)`,
      [
        runKey,
        runCode,
        window.startDate,
        window.endDate,
        JSON.stringify(batchIds),
        window.startDate,  // period_start (兼容旧版)
        window.endDate,    // period_end (兼容旧版)
        createdBy || null,
      ]
    );

    return {
      runId: result.insertId,
      runCode,
    };
  }

  /**
   * 更新运行状态
   */
  static async updateStatus(
    runId: number,
    status: string,
    stage: string,
    message?: string
  ): Promise<void> {
    await pool.execute(
      `UPDATE scheduling_runs
       SET status = ?, stage = ?, error_message = ?, updated_at = NOW()
       WHERE id = ?`,
      [status, stage, message || null, runId]
    );
  }

  /**
   * 更新求解进度
   */
  static async updateSolverProgress(
    runId: number,
    progress: {
      solutions_found: number;
      best_objective: number | null;
      elapsed_seconds: number;
      time_limit_seconds: number;
      estimated_remaining: number;
      progress_percent: number;
    }
  ): Promise<void> {
    await pool.execute(
      `UPDATE scheduling_runs
       SET solver_progress = ?, updated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(progress), runId]
    );
  }

  /**
   * 设置求解开始时间和时间限制
   */
  static async setSolveStartTime(runId: number, timeLimitSeconds: number): Promise<void> {
    await pool.execute(
      `UPDATE scheduling_runs
       SET solve_started_at = NOW(), time_limit_seconds = ?, updated_at = NOW()
       WHERE id = ?`,
      [timeLimitSeconds, runId]
    );
  }

  /**
   * 获取运行记录
   */
  static async getRun(runId: number): Promise<any | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM scheduling_runs WHERE id = ?`,
      [runId]
    );

    return rows.length > 0 ? rows[0] : null;
  }
}

