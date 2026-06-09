/**
 * L1 责任域隔离 集成测试(I1/I2/I3 + 向后兼容)
 *
 * 验证 applySolveResultV4 的核心修复:apply 的删除边界 = 本次求解责任域。
 *   I2 责任域外零影响:跑 USP(局部)apply,不得删掉 DSP 已应用的 bpa/esp/standalone。
 *   I1 责任域内替换:USP 自己的分配被本次结果写入。
 *   向后兼容:无 scope 的旧 run → 退回按时间窗全删(原行为)。
 *
 * 连真实本地 MySQL(aps_system),所有测试数据用 I2TEST 前缀 + 未来日期(2026-07-15),
 * afterEach/afterAll 严格清理,避免污染开发库。范式对齐 batchLifecycleService.test.ts。
 */
import { beforeAll, afterAll, afterEach, describe, expect, test } from 'vitest'
import request from 'supertest'
import pool from '../config/database'
import app from '../server'

const PREFIX = 'I2TEST'
const USP_UNIT = 2   // organization_units: USP (TEAM)
const DSP_UNIT = 4   // organization_units: DSP (TEAM)
const SHIFT_BASE = 8 // shift_definitions: BASE (STANDARD, 8h)
const D = '2026-07-15' // 未来日期,避开真实排班数据

async function insertRow(sql: string, params: any[]): Promise<number> {
  const [r] = await pool.execute<any>(sql, params)
  return Number(r.insertId)
}

async function createEmployee(code: string, unitId: number): Promise<number> {
  return insertRow(
    `INSERT INTO employees (employee_code, employee_name, unit_id, employment_status)
     VALUES (?, ?, ?, 'ACTIVE')`,
    [`${PREFIX}-${code}`, `${PREFIX}-${code}`, unitId],
  )
}

async function createBatchWithOp(code: string): Promise<{ batchId: number; opId: number }> {
  const batchId = await insertRow(
    `INSERT INTO production_batch_plans (batch_code, batch_name, template_id, planned_start_date, plan_status)
     VALUES (?, ?, 1, ?, 'DRAFT')`,
    [`${PREFIX}-${code}`, `${PREFIX}-${code}`, D],
  )
  const opId = await insertRow(
    `INSERT INTO batch_operation_plans
       (batch_plan_id, template_schedule_id, operation_id, planned_start_datetime, planned_end_datetime, planned_duration, required_people)
     VALUES (?, 1, 1, ?, ?, 8, 1)`,
    [batchId, `${D} 08:00:00`, `${D} 16:00:00`],
  )
  return { batchId, opId }
}

async function createEsp(employeeId: number): Promise<number> {
  return insertRow(
    `INSERT INTO employee_shift_plans (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours, is_generated)
     VALUES (?, ?, ?, 'PRODUCTION', 'PLANNED', 8, 1)`,
    [employeeId, D, SHIFT_BASE],
  )
}

async function createRun(summaryObj: object | null, resultSummary: object): Promise<number> {
  const runCode = `${PREFIX}-RUN-${Date.now()}`
  return insertRow(
    `INSERT INTO scheduling_runs
       (run_key, run_code, status, window_start, window_end, period_start, period_end, summary_json, result_summary)
     VALUES (?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
    [
      runCode, runCode, D, D, D, D,
      summaryObj === null ? null : JSON.stringify(summaryObj),
      JSON.stringify(resultSummary),
    ],
  )
}

async function cleanup() {
  // FK_CHECKS 已关,但仍按"子→父"顺序清理 I2TEST 数据
  await pool.execute(
    `DELETE esp FROM employee_shift_plans esp JOIN employees e ON esp.employee_id = e.id WHERE e.employee_code LIKE '${PREFIX}%'`,
  )
  await pool.execute(
    `DELETE sta FROM standalone_task_assignments sta JOIN employees e ON sta.employee_id = e.id WHERE e.employee_code LIKE '${PREFIX}%'`,
  )
  await pool.execute(
    `DELETE bpa FROM batch_personnel_assignments bpa
       JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
       JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
     WHERE pbp.batch_code LIKE '${PREFIX}%'`,
  )
  await pool.execute(
    `DELETE bop FROM batch_operation_plans bop
       JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
     WHERE pbp.batch_code LIKE '${PREFIX}%'`,
  )
  await pool.execute(`DELETE FROM production_batch_plans WHERE batch_code LIKE '${PREFIX}%'`)
  await pool.execute(`DELETE FROM scheduling_runs WHERE run_code LIKE '${PREFIX}%'`)
  await pool.execute(`DELETE FROM employees WHERE employee_code LIKE '${PREFIX}%'`)
}

describe('L1 apply 责任域隔离 (I1/I2/I3 + 向后兼容)', () => {
  beforeAll(async () => {
    await pool.execute('SET FOREIGN_KEY_CHECKS = 0')
  })

  afterAll(async () => {
    await cleanup()
    await pool.execute('SET FOREIGN_KEY_CHECKS = 1')
    await pool.end()
  })

  afterEach(async () => {
    await cleanup()
  })

  test('局部 USP 求解 apply:不动 DSP 的 bpa/esp/standalone,且替换 USP 自己的排班', async () => {
    const uspEmp = await createEmployee('USP-E1', USP_UNIT)
    const dspEmp = await createEmployee('DSP-E1', DSP_UNIT)
    const usp = await createBatchWithOp('USP-B1')
    const dsp = await createBatchWithOp('DSP-B1')

    // —— DSP 上一次已应用:bpa + esp + standalone 分配 ——
    await pool.execute(
      `INSERT INTO batch_personnel_assignments (batch_operation_plan_id, employee_id, position_number, assignment_status)
       VALUES (?, ?, 1, 'PLANNED')`,
      [dsp.opId, dspEmp],
    )
    const dspEspId = await createEsp(dspEmp)
    const dspStaId = await insertRow(
      `INSERT INTO standalone_task_assignments (task_id, employee_id, assigned_date, assigned_shift_id, scheduling_run_id)
       VALUES (?, ?, ?, ?, ?)`,
      [990001, dspEmp, D, SHIFT_BASE, 880001], // 假 task/run id(FK_CHECKS=0)
    )

    // —— USP 上一次残留 esp(本次应被替换) ——
    await createEsp(uspEmp)

    // —— 本次 USP 局部求解 run(只含 USP 员工/批次,无 standalone 结果) ——
    const scope = {
      scope: {
        is_global: false,
        team_ids: [USP_UNIT],
        batch_ids: [usp.batchId],
        employee_ids: [uspEmp],
        standalone_task_ids: [],
        scope_version: 1,
      },
      special_shift_requirements: [],
    }
    const resultSummary = {
      schedules: [
        {
          employee_id: uspEmp,
          date: D,
          shift: { shift_id: SHIFT_BASE },
          tasks: [{ operation_id: usp.opId, position_number: 1, batch_code: `${PREFIX}-USP-B1` }],
        },
      ],
      special_shift_assignments: [],
      special_shift_shortages: [],
    }
    const runId = await createRun(scope, resultSummary)

    const res = await request(app).post(`/api/v4/scheduling/runs/${runId}/apply`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // —— I2:DSP 的一切都还在 ——
    const [dspBpa] = await pool.execute<any>(
      `SELECT id FROM batch_personnel_assignments WHERE batch_operation_plan_id = ? AND employee_id = ?`,
      [dsp.opId, dspEmp],
    )
    expect(dspBpa.length).toBe(1) // DSP 批次人员分配未被删

    const [dspEsp] = await pool.execute<any>(`SELECT id FROM employee_shift_plans WHERE id = ?`, [dspEspId])
    expect(dspEsp.length).toBe(1) // DSP 员工班次未被删

    const [dspSta] = await pool.execute<any>(`SELECT id FROM standalone_task_assignments WHERE id = ?`, [dspStaId])
    expect(dspSta.length).toBe(1) // DSP 独立任务分配未被删(局部无 standalone 结果→跳过清理)

    // —— I1:USP 自己的被本次结果写入/替换 ——
    const [uspBpa] = await pool.execute<any>(
      `SELECT scheduling_run_id FROM batch_personnel_assignments WHERE batch_operation_plan_id = ? AND employee_id = ?`,
      [usp.opId, uspEmp],
    )
    expect(uspBpa.length).toBe(1)
    expect(Number(uspBpa[0].scheduling_run_id)).toBe(runId)

    const [uspEsp] = await pool.execute<any>(
      `SELECT scheduling_run_id FROM employee_shift_plans WHERE employee_id = ? AND plan_date = ?`,
      [uspEmp, D],
    )
    expect(uspEsp.length).toBe(1) // 替换非叠加:仍是 1 条
    expect(Number(uspEsp[0].scheduling_run_id)).toBe(runId) // 来自本次 run(旧的已被清、新的已写)
  })

  test('向后兼容:无 scope 的旧 run apply → 按时间窗全删(原行为)', async () => {
    const dspEmp = await createEmployee('OLD-DSP-E1', DSP_UNIT)
    const dspEspId = await createEsp(dspEmp)

    // 旧 run:summary_json 无 scope(模拟改动前的历史 run);结果为空
    const runId = await createRun(
      { special_shift_requirements: [] }, // 无 scope 键
      { schedules: [], special_shift_assignments: [], special_shift_shortages: [] },
    )

    const res = await request(app).post(`/api/v4/scheduling/runs/${runId}/apply`)
    expect(res.status).toBe(200)

    // 无 scope → is_global 视为 true → 按时间窗全删:DSP 的 esp 被删(复刻原行为)
    const [dspEsp] = await pool.execute<any>(`SELECT id FROM employee_shift_plans WHERE id = ?`, [dspEspId])
    expect(dspEsp.length).toBe(0)
  })

  test('「全部」视图下只勾 USP 批次(team_ids=[]、batch_ids 非空):bpa 仍按批次收窄,不删 DSP', async () => {
    const uspEmp = await createEmployee('B-USP-E1', USP_UNIT)
    const dspEmp = await createEmployee('B-DSP-E1', DSP_UNIT)
    const usp = await createBatchWithOp('B-USP-B1')
    const dsp = await createBatchWithOp('B-DSP-B1')

    // DSP 上一次已应用:bpa + esp
    await pool.execute(
      `INSERT INTO batch_personnel_assignments (batch_operation_plan_id, employee_id, position_number, assignment_status)
       VALUES (?, ?, 1, 'PLANNED')`,
      [dsp.opId, dspEmp],
    )
    const dspEspId = await createEsp(dspEmp)

    // 本次:team_ids=[](没单独选团队),只勾了 USP 批次 → employee_ids 快照为空(orchestrator 在 team 空时不快照)
    const scope = {
      scope: {
        is_global: false,
        team_ids: [],
        batch_ids: [usp.batchId],
        employee_ids: [],
        standalone_task_ids: [],
        scope_version: 1,
      },
      special_shift_requirements: [],
    }
    const resultSummary = {
      schedules: [
        {
          employee_id: uspEmp,
          date: D,
          shift: { shift_id: SHIFT_BASE },
          tasks: [{ operation_id: usp.opId, position_number: 1, batch_code: `${PREFIX}-B-USP-B1` }],
        },
      ],
      special_shift_assignments: [],
      special_shift_shortages: [],
    }
    const runId = await createRun(scope, resultSummary)

    const res = await request(app).post(`/api/v4/scheduling/runs/${runId}/apply`)
    expect(res.status).toBe(200)

    // 主 bug 修复点:bpa 按批次收窄 → DSP 的 bpa 不被删(即便 team_ids 为空)
    const [dspBpa] = await pool.execute<any>(
      `SELECT id FROM batch_personnel_assignments WHERE batch_operation_plan_id = ? AND employee_id = ?`,
      [dsp.opId, dspEmp],
    )
    expect(dspBpa.length).toBe(1)
    // esp 维度无员工键 → 跳过清理(保守) → DSP 的 esp 也不被误删
    const [dspEsp2] = await pool.execute<any>(`SELECT id FROM employee_shift_plans WHERE id = ?`, [dspEspId])
    expect(dspEsp2.length).toBe(1)
    // USP 自己的 bpa 被写入
    const [uspBpa] = await pool.execute<any>(
      `SELECT id FROM batch_personnel_assignments WHERE batch_operation_plan_id = ? AND employee_id = ?`,
      [usp.opId, uspEmp],
    )
    expect(uspBpa.length).toBe(1)
  })
})
