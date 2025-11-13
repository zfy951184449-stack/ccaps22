import { beforeAll, afterAll, afterEach, describe, expect, test } from 'vitest'
import request from 'supertest'
import pool from '../config/database'
import app from '../server'

describe('Scheduling autoPlan integration', () => {
  const created = {
    employeeIds: [] as number[],
    qualificationIds: [] as number[],
    operationIds: [] as number[],
    operationPlanIds: [] as number[],
    batchPlanId: 0,
    runIds: [] as number[]
  }

  const execute = (sql: string, params?: any[]) =>
    pool.execute(sql, params) as Promise<[any, any]>

  const createQualification = async () => {
    const name = `资质-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
    const [res] = await execute(
      `INSERT INTO qualifications (qualification_name)
       VALUES (?)`,
      [name]
    )
    const id = Number((res as any).insertId)
    created.qualificationIds.push(id)
    return id
  }

  const createEmployee = async (name: string) => {
    const code = `E${Date.now().toString().slice(-8)}${Math.random().toString(16).slice(2, 4)}`
    const [res] = await execute(
      `INSERT INTO employees (employee_code, employee_name, employment_status)
       VALUES (?, ?, 'ACTIVE')`,
      [code, name]
    )
    const id = Number((res as any).insertId)
    created.employeeIds.push(id)
    return id
  }

  const createOperation = async (name: string) => {
    const code = `OP${Date.now().toString().slice(-6)}${Math.random().toString(16).slice(2, 4)}`
    const [res] = await execute(
      `INSERT INTO operations (operation_code, operation_name, standard_time)
       VALUES (?, ?, 120)`,
      [code, name]
    )
    const id = Number((res as any).insertId)
    created.operationIds.push(id)
    return id
  }

  const ensureTemplate = async () => {
    const [rows] = await execute('SELECT id FROM process_templates LIMIT 1')
    if ((rows as any[]).length) {
      return Number((rows as any[])[0].id)
    }
    const [res] = await execute(
      `INSERT INTO process_templates (template_code, template_name, total_days)
       VALUES ('TMP-C5', 'C5集成模板', 1)`
    )
    return Number((res as any).insertId)
  }

  const createBatchPlan = async (templateId: number) => {
    const [res] = await execute(
      `INSERT INTO production_batch_plans
        (batch_code, batch_name, template_id, project_code, planned_start_date, planned_end_date, template_duration_days, plan_status)
       VALUES (?, '自动排程集成测试', ?, 'C5TEST', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY), 3, 'APPROVED')`,
      [`BP-${Date.now()}`, templateId]
    )
    const id = Number((res as any).insertId)
    created.batchPlanId = id
    return id
  }

  let scheduleSequence = 1

  const createOperationPlan = async (batchId: number, operationId: number, required: number) => {
    const scheduleId = scheduleSequence++
    const [res] = await execute(
      `INSERT INTO batch_operation_plans
        (batch_plan_id, operation_id, template_schedule_id, planned_start_datetime, planned_end_datetime, planned_duration, required_people)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 1 DAY), INTERVAL 4 HOUR), 240, ?)`,
      [batchId, operationId, scheduleId, required]
    )
    const id = Number((res as any).insertId)
    created.operationPlanIds.push(id)
    return id
  }

  const cleanup = async () => {
    if (created.operationPlanIds.length) {
      const placeholders = created.operationPlanIds.map(() => '?').join(',')
      await execute('DELETE FROM employee_shift_plans WHERE batch_operation_plan_id IN (' + placeholders + ')', created.operationPlanIds)
      await execute('DELETE FROM batch_personnel_assignments WHERE batch_operation_plan_id IN (' + placeholders + ')', created.operationPlanIds)
      await execute('DELETE FROM batch_operation_plans WHERE id IN (' + placeholders + ')', created.operationPlanIds)
      created.operationPlanIds = []
    }

    if (created.batchPlanId) {
      await execute('DELETE FROM production_batch_plans WHERE id = ?', [created.batchPlanId])
      created.batchPlanId = 0
    }

    if (created.operationIds.length) {
      const placeholders = created.operationIds.map(() => '?').join(',')
      await execute('DELETE FROM operation_qualification_requirements WHERE operation_id IN (' + placeholders + ')', created.operationIds)
      await execute('DELETE FROM operations WHERE id IN (' + placeholders + ')', created.operationIds)
      created.operationIds = []
    }

    if (created.employeeIds.length) {
      const placeholders = created.employeeIds.map(() => '?').join(',')
      await execute('DELETE FROM employee_qualifications WHERE employee_id IN (' + placeholders + ')', created.employeeIds)
      await execute('DELETE FROM employees WHERE id IN (' + placeholders + ')', created.employeeIds)
      created.employeeIds = []
    }

    if (created.qualificationIds.length) {
      const placeholders = created.qualificationIds.map(() => '?').join(',')
      await execute('DELETE FROM qualifications WHERE id IN (' + placeholders + ')', created.qualificationIds)
      created.qualificationIds = []
    }

    if (created.runIds.length) {
      const placeholders = created.runIds.map(() => '?').join(',')
      await execute('DELETE FROM scheduling_runs WHERE id IN (' + placeholders + ')', created.runIds)
      created.runIds = []
    }
  }

  beforeAll(async () => {
    await execute('SET FOREIGN_KEY_CHECKS = 0')
  })

  afterAll(async () => {
    await cleanup()
    await execute('SET FOREIGN_KEY_CHECKS = 1')
    await pool.end()
  })

  afterEach(async () => {
    await cleanup()
  })

  test('autoPlan 返回热点与覆盖缺口', async () => {
    const qualificationId = await createQualification()

    const qualifiedEmployee = await createEmployee('具备资质员工')
    await execute(
      `INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level)
       VALUES (?, ?, 3)`,
      [qualifiedEmployee, qualificationId]
    )

    const generalEmployee = await createEmployee('普通员工')

    const templateId = await ensureTemplate()
    const batchPlanId = await createBatchPlan(templateId)

    const opEnough = await createOperation('常规操作')
    await execute(
      `INSERT INTO operation_qualification_requirements (operation_id, qualification_id, min_level)
       VALUES (?, ?, 1)`,
      [opEnough, qualificationId]
    )
    await createOperationPlan(batchPlanId, opEnough, 1)

    const opShortage = await createOperation('紧缺操作')
    await execute(
      `INSERT INTO operation_qualification_requirements (operation_id, qualification_id, min_level)
       VALUES (?, ?, 2)`,
      [opShortage, qualificationId]
    )
    await createOperationPlan(batchPlanId, opShortage, 2)

    // 让普通员工也记录低级资质，帮助触发热点原因说明
    await execute(
      `INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level)
       VALUES (?, ?, 0)`,
      [generalEmployee, qualificationId]
    )

    const response = await request(app)
      .post('/api/scheduling/auto-plan')
      .send({ batchIds: [batchPlanId], options: { dryRun: true } })
      .expect(202)

    const result = response.body
    expect(result.run).toBeDefined()
    expect(result.run.status).toBe('DRAFT')
    created.runIds.push(result.run.id)

    expect(Array.isArray(result.heuristicHotspots)).toBe(true)
    const hotspotCount = result.heuristicHotspots.length
    expect(hotspotCount).toBeGreaterThanOrEqual(0)

    if (hotspotCount > 0) {
      const hotspot = result.heuristicHotspots[0]
      expect(hotspot.deficit).toBeGreaterThan(0)
      expect(typeof hotspot.operationName).toBe('string')
    }

    expect(result.coverage).toBeDefined()
    expect(Array.isArray(result.coverage.gaps)).toBe(true)
    const gapCount = result.coverage.gaps.length
    expect(gapCount).toBeGreaterThanOrEqual(0)
    if (gapCount > 0) {
      expect(['HEADCOUNT', 'QUALIFICATION', 'OTHER']).toContain(result.coverage.gaps[0].category)
    }

    expect(result.summary.operationsCovered).toBeGreaterThanOrEqual(0)
    expect(result.metricsSummary).toBeDefined()
    expect(result.metricsSummary.coverageRate).toBeGreaterThanOrEqual(0)
    expect(result.heuristicSummary).toBeDefined()
    expect(result.heuristicSummary.hotspotCount).toBeGreaterThanOrEqual(0)

    const [rows] = await execute(
      'SELECT COUNT(*) AS total FROM employee_shift_plans WHERE scheduling_run_id = ?',
      [result.run.id]
    )
    expect(Number((rows as any[])[0].total || 0)).toBe(0)
  })

  test('自动排班草案可发布与回滚', async () => {
    const qualificationId = await createQualification()

    const employeeA = await createEmployee('发布员工A')
    const employeeB = await createEmployee('发布员工B')

    await execute(
      `INSERT INTO employee_qualifications (employee_id, qualification_id, qualification_level)
       VALUES (?, ?, 3), (?, ?, 3)`,
      [employeeA, qualificationId, employeeB, qualificationId]
    )

    const templateId = await ensureTemplate()
    const batchPlanId = await createBatchPlan(templateId)

    const operationId = await createOperation('发布操作')
    await execute(
      `INSERT INTO operation_qualification_requirements (operation_id, qualification_id, min_level)
       VALUES (?, ?, 2)`,
      [operationId, qualificationId]
    )
    await createOperationPlan(batchPlanId, operationId, 2)

    const response = await request(app)
      .post('/api/scheduling/auto-plan')
      .send({ batchIds: [batchPlanId], options: { dryRun: false, publishNow: true } })
      .expect(202)

    const { run } = response.body
    expect(response.body.metricsSummary).toBeDefined()
    expect(response.body.metricsSummary.coverageRate).toBeGreaterThanOrEqual(0)
    expect(response.body.heuristicSummary).toBeDefined()
    created.runIds.push(run.id)
    expect(run.status).toBe('PUBLISHED')

    const [persisted] = await execute(
      'SELECT COUNT(*) AS total FROM employee_shift_plans WHERE scheduling_run_id = ?',
      [run.id]
    )
    expect(Number((persisted as any[])[0].total || 0)).toBeGreaterThan(0)

    await request(app)
      .post(`/api/scheduling/runs/${run.id}/rollback`)
      .expect(200)

    const [afterRollback] = await execute(
      'SELECT COUNT(*) AS total FROM employee_shift_plans WHERE scheduling_run_id = ?',
      [run.id]
    )
    expect(Number((afterRollback as any[])[0].total || 0)).toBe(0)
  })
})
