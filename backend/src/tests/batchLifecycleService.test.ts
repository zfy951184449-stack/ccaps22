import { beforeAll, afterAll, afterEach, describe, expect, test } from 'vitest'
import request from 'supertest'
import pool from '../config/database'
import app from '../server'

async function createApprovedBatch() {
  const batchCode = `TEST-${Date.now()}`
  const [planResult] = await pool.execute<any>(
    `INSERT INTO production_batch_plans
      (batch_code, batch_name, template_id, project_code, planned_start_date, plan_status)
     VALUES (?, '自动化测试批次', 1, 'TEST', CURDATE(), 'APPROVED')`,
    [batchCode]
  )

  const batchId = Number(planResult.insertId)

  await pool.execute(
    `INSERT INTO batch_operation_plans
      (batch_plan_id, template_schedule_id, operation_id, planned_start_datetime, planned_end_datetime, planned_duration, required_people)
     VALUES (?, 1, 1, NOW(), DATE_ADD(NOW(), INTERVAL 2 HOUR), 2, 2)`,
    [batchId]
  )

  const [operationRows] = await pool.execute<any>('SELECT id FROM batch_operation_plans WHERE batch_plan_id = ?', [batchId])
  const operationId = Number(operationRows[0].id)

  // 插入自动生成的人员排班数据以模拟残留
  await pool.execute(
    `INSERT INTO batch_personnel_assignments
      (batch_operation_plan_id, employee_id, assignment_status)
     VALUES (?, 1, 'PLANNED')`,
    [operationId]
  )

  await pool.execute(
    `INSERT INTO employee_shift_plans
      (employee_id, plan_date, shift_id, plan_category, plan_state, plan_hours, overtime_hours, is_generated, batch_operation_plan_id)
     VALUES (1, DATE_ADD(CURDATE(), INTERVAL ? DAY), NULL, 'PRODUCTION', 'PLANNED', 8, 0, 1, ?)`,
    [operationId, operationId]
  )

  return batchId
}

async function cleanupBatch(batchId: number) {
  const [operationRows] = await pool.execute<any>('SELECT id FROM batch_operation_plans WHERE batch_plan_id = ?', [batchId])
  const operationIds = operationRows.map((row: any) => Number(row.id))

  if (operationIds.length) {
    const placeholders = operationIds.map(() => '?').join(',')
    const [shiftRows] = await pool.execute<any>(`SELECT id FROM employee_shift_plans WHERE batch_operation_plan_id IN (${placeholders})`, operationIds)
    const shiftIds = shiftRows.map((row: any) => Number(row.id))

    if (shiftIds.length) {
      const shiftPlaceholders = shiftIds.map(() => '?').join(',')
      await pool.execute(`DELETE FROM shift_change_logs WHERE shift_plan_id IN (${shiftPlaceholders})`, shiftIds)
      await pool.execute(`DELETE FROM overtime_records WHERE related_shift_plan_id IN (${shiftPlaceholders})`, shiftIds)
      await pool.execute(
        `DELETE ps FROM personnel_schedules ps
              JOIN employee_shift_plans esp ON ps.employee_id = esp.employee_id
                                         AND ps.schedule_date = esp.plan_date
             WHERE ps.notes = 'AUTO_GENERATED'
               AND esp.id IN (${shiftPlaceholders})`,
        shiftIds
      )
      await pool.execute(`DELETE FROM employee_shift_plans WHERE id IN (${shiftPlaceholders})`, shiftIds)
    }

    await pool.execute(`DELETE FROM batch_personnel_assignments WHERE batch_operation_plan_id IN (${placeholders})`, operationIds)
    await pool.execute(`DELETE FROM overtime_records WHERE related_operation_plan_id IN (${placeholders})`, operationIds)
  }

  await pool.execute('DELETE FROM batch_operation_plans WHERE batch_plan_id = ?', [batchId])
  await pool.execute('DELETE FROM production_batch_plans WHERE id = ?', [batchId])
}

describe('Batch Lifecycle Integration', () => {
  beforeAll(async () => {
    await pool.execute('SET FOREIGN_KEY_CHECKS = 0')
  })

  afterAll(async () => {
    await pool.execute('SET FOREIGN_KEY_CHECKS = 1')
    await pool.end()
  })

  afterEach(async () => {
    const [batchRows] = await pool.execute<any>("SELECT id FROM production_batch_plans WHERE batch_code LIKE 'TEST-%'")
    for (const row of batchRows) {
      await cleanupBatch(Number(row.id))
    }
  })

  test('activate -> deactivate -> delete flow', async () => {
    const batchId = await createApprovedBatch()

    const activateRes = await request(app)
      .post(`/api/calendar/batch/${batchId}/activate`)
      .send({ color: '#123456' })

    expect(activateRes.status).toBe(200)
    expect(activateRes.body.status).toBe('SUCCESS')

    const deactivateRes = await request(app)
      .post(`/api/calendar/batch/${batchId}/deactivate`)

    expect([200, 204]).toContain(deactivateRes.status)

    const deleteRes = await request(app)
      .delete(`/api/batch-plans/${batchId}`)

    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.status).toBe('SUCCESS')

    const [rows] = await pool.execute<any>('SELECT id FROM production_batch_plans WHERE id = ?', [batchId])
    expect(rows.length).toBe(0)
  })

  test('prevent delete when residual exists without force', async () => {
    const batchId = await createApprovedBatch()

    await request(app).post(`/api/calendar/batch/${batchId}/activate`).send()

    const deleteRes = await request(app)
      .delete(`/api/batch-plans/${batchId}`)

    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.status).toBe('SUCCESS')
    expect(deleteRes.body.warnings).toBeDefined()
  })

  test('force delete clears residuals', async () => {
    const batchId = await createApprovedBatch()

    await request(app).post(`/api/calendar/batch/${batchId}/activate`).send()

    const deleteRes = await request(app)
      .delete(`/api/batch-plans/${batchId}?force=true`)

    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.status).toBe('SUCCESS')
  })
})
