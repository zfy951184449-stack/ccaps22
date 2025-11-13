import pool from './src/config/database';

async function queryZhengfengyiOctoberSchedule() {
  const employeeName = '郑峰屹';
  const startDate = '2025-10-01';
  const endDate = '2025-10-31';

  try {
    // 1. 查询员工基本信息
    const [employeeRows]: any = await pool.execute(`
      SELECT id, employee_code, employee_name, org_role
      FROM employees 
      WHERE employee_name = ?
    `, [employeeName]);

    if (employeeRows.length === 0) {
      console.log('未找到员工:', employeeName);
      return;
    }

    const employee = employeeRows[0];
    console.log('=== 员工信息 ===');
    console.log(`员工ID: ${employee.id}`);
    console.log(`员工工号: ${employee.employee_code}`);
    console.log(`员工姓名: ${employee.employee_name}`);
    console.log(`组织角色: ${employee.org_role}`);
    console.log('');

    // 2. 查询最近一次排班运行记录
    const [runRows]: any = await pool.execute(`
      SELECT 
        sr.id AS run_id,
        sr.run_key,
        sr.status,
        sr.created_at,
        sr.period_start,
        sr.period_end
      FROM scheduling_runs sr
      ORDER BY sr.created_at DESC
      LIMIT 1
    `);

    if (runRows.length > 0) {
      const latestRun = runRows[0];
      console.log('=== 最近一次排班运行 ===');
      console.log(`运行ID: ${latestRun.run_id}`);
      console.log(`运行Key: ${latestRun.run_key}`);
      console.log(`状态: ${latestRun.status}`);
      console.log(`创建时间: ${latestRun.created_at}`);
      console.log(`排班周期: ${latestRun.period_start} ~ ${latestRun.period_end}`);
      console.log('');
    }

    // 3. 查询10月份的详细排班记录（从employee_shift_plans表）
    const [detailRows]: any = await pool.execute(`
      SELECT 
        esp.id,
        esp.plan_date,
        esp.plan_category,
        esp.plan_state,
        esp.plan_hours,
        esp.overtime_hours,
        (COALESCE(esp.plan_hours, 0) + COALESCE(esp.overtime_hours, 0)) AS total_hours,
        sd.shift_code,
        sd.shift_name,
        sd.nominal_hours,
        o.operation_name,
        pbp.batch_code,
        bop.planned_start_datetime,
        bop.planned_end_datetime
      FROM employee_shift_plans esp
      LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
      LEFT JOIN batch_operation_plans bop ON esp.batch_operation_plan_id = bop.id
      LEFT JOIN operations o ON bop.operation_id = o.id
      LEFT JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
      WHERE esp.employee_id = ?
        AND esp.plan_date >= ?
        AND esp.plan_date <= ?
        AND COALESCE(UPPER(esp.plan_state), '') <> 'VOID'
      ORDER BY esp.plan_date, esp.plan_category
    `, [employee.id, startDate, endDate]);

    console.log('=== 10月份详细排班记录 ===');
    console.log(`共 ${detailRows.length} 条记录\n`);

    let totalPlanHours = 0;
    let totalOvertimeHours = 0;
    let totalHours = 0;
    const dailyHours = new Map<string, number>();

    detailRows.forEach((row: any, index: number) => {
      const planHours = Number(row.plan_hours || 0);
      const overtimeHours = Number(row.overtime_hours || 0);
      const rowTotalHours = planHours + overtimeHours;
      
      totalPlanHours += planHours;
      totalOvertimeHours += overtimeHours;
      totalHours += rowTotalHours;

      const date = row.plan_date;
      const currentDailyHours = dailyHours.get(date) || 0;
      dailyHours.set(date, currentDailyHours + rowTotalHours);

      console.log(`记录 ${index + 1}:`);
      console.log(`  日期: ${date}`);
      console.log(`  类别: ${row.plan_category || 'N/A'}`);
      console.log(`  状态: ${row.plan_state || 'N/A'}`);
      console.log(`  班次: ${row.shift_code || 'N/A'} (${row.shift_name || 'N/A'})`);
      console.log(`  班次标准工时: ${row.nominal_hours || 'N/A'}h`);
      console.log(`  计划工时(planHours): ${planHours}h`);
      console.log(`  加班工时(overtimeHours): ${overtimeHours}h`);
      console.log(`  当日总工时(planHours+overtimeHours): ${rowTotalHours.toFixed(1)}h`);
      if (row.operation_name) {
        console.log(`  操作: ${row.operation_name}`);
        console.log(`  批次: ${row.batch_code || 'N/A'}`);
        console.log(`  操作时间: ${row.planned_start_datetime} ~ ${row.planned_end_datetime}`);
      }
      console.log('');
    });

    // 4. 按日期汇总
    console.log('=== 按日期汇总 ===');
    const sortedDates = Array.from(dailyHours.keys()).sort();
    sortedDates.forEach(date => {
      console.log(`${date}: ${dailyHours.get(date)!.toFixed(1)}h`);
    });
    console.log('');

    // 5. 汇总统计
    console.log('=== 10月份工时汇总 ===');
    console.log(`计划工时(planHours)总和: ${totalPlanHours.toFixed(1)}h`);
    console.log(`加班工时(overtimeHours)总和: ${totalOvertimeHours.toFixed(1)}h`);
    console.log(`总工时(planHours+overtimeHours): ${totalHours.toFixed(1)}h`);
    console.log(`工作日数: ${sortedDates.length}天`);
    console.log(`平均每日工时: ${(totalHours / Math.max(sortedDates.length, 1)).toFixed(1)}h`);


    await pool.end();
  } catch (error) {
    console.error('查询失败:', error);
    await pool.end();
  }
}

queryZhengfengyiOctoberSchedule();

