/**
 * V4 结果接口·岗位资质数据 集成测试
 *
 * 验证 getSolveResultV4 为每个岗位附加的人工分配筛选数据:
 *   - qualification_requirements:岗位资质要求(名称/等级/是否强制)
 *   - eligible_employee_ids:本次排班人员中满足全部 mandatory 要求者;无要求时为 null
 *   - 独立任务:standalone_task_qualifications + allowed_employee_ids 白名单同时生效
 *
 * 口径须与 DataAssemblerV4 一致:仅 mandatory 是硬性,level >= required_level。
 *
 * 连真实本地 MySQL(aps_system),所有测试数据用 QRTEST 前缀 + 未来日期(2026-07-20),
 * afterEach/afterAll 严格清理。范式对齐 applyScopeIsolationV4.test.ts。
 */
import { beforeAll, afterAll, afterEach, describe, expect, test } from 'vitest'
import request from 'supertest'
import pool from '../config/database'
import app from '../server'

const PREFIX = 'QRTEST'
const SHIFT_BASE = 8 // shift_definitions: BASE (STANDARD, 8h)
const D = '2026-07-20' // 未来日期,避开真实排班数据(applyScope 测试用 07-15,错开)

async function insertRow(sql: string, params: any[]): Promise<number> {
  const [r] = await pool.execute<any>(sql, params)
  return Number(r.insertId)
}

async function createEmployee(code: string): Promise<number> {
  return insertRow(
    `INSERT INTO employees (employee_code, employee_name, unit_id, employment_status)
     VALUES (?, ?, 2, 'ACTIVE')`,
    [`${PREFIX}-${code}`, `${PREFIX}-${code}`],
  )
}

async function cleanup() {
  await pool.execute(
    `DELETE eq FROM employee_qualifications eq JOIN employees e ON eq.employee_id = e.id WHERE e.employee_code LIKE '${PREFIX}%'`,
  )
  await pool.execute(
    `DELETE oqr FROM operation_qualification_requirements oqr JOIN operations o ON oqr.operation_id = o.id WHERE o.operation_code LIKE '${PREFIX}%'`,
  )
  await pool.execute(
    `DELETE stq FROM standalone_task_qualifications stq JOIN standalone_tasks st ON stq.task_id = st.id WHERE st.task_code LIKE '${PREFIX}%'`,
  )
  await pool.execute(`DELETE FROM standalone_tasks WHERE task_code LIKE '${PREFIX}%'`)
  await pool.execute(
    `DELETE bop FROM batch_operation_plans bop
       JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
     WHERE pbp.batch_code LIKE '${PREFIX}%'`,
  )
  await pool.execute(`DELETE FROM production_batch_plans WHERE batch_code LIKE '${PREFIX}%'`)
  await pool.execute(`DELETE FROM operations WHERE operation_code LIKE '${PREFIX}%'`)
  await pool.execute(`DELETE FROM qualifications WHERE qualification_name LIKE '${PREFIX}%'`)
  await pool.execute(`DELETE FROM scheduling_runs WHERE run_code LIKE '${PREFIX}%'`)
  await pool.execute(`DELETE FROM employees WHERE employee_code LIKE '${PREFIX}%'`)
}

describe('V4 结果接口岗位资质数据 (qualification_requirements + eligible_employee_ids)', () => {
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

  test('批次操作按岗位返回资质要求与合格名单;独立任务叠加白名单', async () => {
    // ── 资质与员工:E1(2级) / E2(无资质) / E3(1级) ──
    const qualId = await insertRow(
      `INSERT INTO qualifications (qualification_name) VALUES (?)`,
      [`${PREFIX}-资质A`],
    )
    const e1 = await createEmployee('E1')
    const e2 = await createEmployee('E2')
    const e3 = await createEmployee('E3')
    await pool.execute(
      `INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level) VALUES (?, ?, 2), (?, ?, 1)`,
      [e1, qualId, e3, qualId],
    )

    // ── 工序定义 + 批次操作(2 个岗位):岗位1 要求资质A≥2 强制;岗位2 无要求 ──
    const opDefId = await insertRow(
      `INSERT INTO operations (operation_code, operation_name, standard_time, required_people)
       VALUES (?, ?, 8, 2)`,
      [`${PREFIX}-OP1`, `${PREFIX}-细胞复苏`],
    )
    await pool.execute(
      `INSERT INTO operation_qualification_requirements
         (operation_id, position_number, qualification_id, min_level, required_level, is_mandatory)
       VALUES (?, 1, ?, 2, 2, 1)`,
      [opDefId, qualId],
    )
    const batchId = await insertRow(
      `INSERT INTO production_batch_plans (batch_code, batch_name, template_id, planned_start_date, plan_status)
       VALUES (?, ?, 1, ?, 'DRAFT')`,
      [`${PREFIX}-B1`, `${PREFIX}-B1`, D],
    )
    const bopId = await insertRow(
      `INSERT INTO batch_operation_plans
         (batch_plan_id, template_schedule_id, operation_id, planned_start_datetime, planned_end_datetime, planned_duration, required_people)
       VALUES (?, 1, ?, ?, ?, 8, 2)`,
      [batchId, opDefId, `${D} 08:00:00`, `${D} 16:00:00`],
    )

    // ── 独立任务:要求资质A≥1 强制,白名单 [E1, E2] → 交集只剩 E1 ──
    const taskId = await insertRow(
      `INSERT INTO standalone_tasks
         (task_code, task_name, task_type, required_people, duration_minutes, deadline, allowed_employee_ids, status)
       VALUES (?, ?, 'AD_HOC', 1, 60, ?, ?, 'PENDING')`,
      [`${PREFIX}-T1`, `${PREFIX}-巡检`, `${D} 23:00:00`, JSON.stringify([e1, e2])],
    )
    await pool.execute(
      `INSERT INTO standalone_task_qualifications (task_id, position_number, qualification_id, min_level, is_mandatory)
       VALUES (?, 1, ?, 1, 1)`,
      [taskId, qualId],
    )

    // ── run:统一 schedules 格式,E1 做批次操作岗位1,E2/E3 当天有班次无任务 ──
    const runCode = `${PREFIX}-RUN-${Date.now()}`
    const resultSummary = {
      status: 'OPTIMAL',
      metrics: { solve_time: 1 },
      schedules: [
        {
          employee_id: e1, date: D, shift: { shift_id: SHIFT_BASE },
          tasks: [{
            operation_id: bopId, position_number: 1,
            start: `${D} 08:00:00`, end: `${D} 16:00:00`,
            operation_name: `${PREFIX}-细胞复苏`, batch_code: `${PREFIX}-B1`,
          }],
        },
        { employee_id: e2, date: D, shift: { shift_id: SHIFT_BASE }, tasks: [] },
        {
          employee_id: e3, date: D, shift: { shift_id: SHIFT_BASE },
          tasks: [{
            operation_id: -taskId, position_number: 1,
            start: `${D} 09:00:00`, end: `${D} 10:00:00`,
            operation_name: `${PREFIX}-巡检`, batch_code: 'STANDALONE',
          }],
        },
      ],
    }
    const runId = await insertRow(
      `INSERT INTO scheduling_runs
         (run_key, run_code, status, window_start, window_end, period_start, period_end, target_batch_ids, result_summary)
       VALUES (?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
      [runCode, runCode, D, D, D, D, JSON.stringify([batchId]), JSON.stringify(resultSummary)],
    )

    const res = await request(app).get(`/api/v4/scheduling/runs/${runId}/result`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const ops: any[] = res.body.data.operations
    const batchOp = ops.find(o => o.operation_plan_id === bopId)
    expect(batchOp).toBeTruthy()

    // 岗位1:要求资质A≥2 强制;三人中仅 E1 合格(E2 无资质,E3 仅 1 级)
    const pos1 = batchOp.positions.find((p: any) => p.position_number === 1)
    expect(pos1.qualification_requirements).toEqual([
      expect.objectContaining({
        qualification_id: qualId,
        qualification_name: `${PREFIX}-资质A`,
        required_level: 2,
        is_mandatory: true,
      }),
    ])
    expect(pos1.eligible_employee_ids).toEqual([e1])
    expect(pos1.status).toBe('ASSIGNED')
    expect(pos1.employee?.id).toBe(e1)

    // 岗位2:未配置要求 → 不限制
    const pos2 = batchOp.positions.find((p: any) => p.position_number === 2)
    expect(pos2.qualification_requirements).toEqual([])
    expect(pos2.eligible_employee_ids).toBeNull()
    expect(pos2.status).toBe('UNASSIGNED')

    // 独立任务岗位1:资质达标 {E1, E3} ∩ 白名单 {E1, E2} = {E1}
    const standaloneOp = ops.find(o => o.operation_plan_id === -taskId)
    expect(standaloneOp).toBeTruthy()
    const sPos1 = standaloneOp.positions.find((p: any) => p.position_number === 1)
    expect(sPos1.qualification_requirements).toEqual([
      expect.objectContaining({ qualification_id: qualId, required_level: 1, is_mandatory: true }),
    ])
    expect(sPos1.eligible_employee_ids).toEqual([e1])
  })
})
