import pool from './src/config/database';

async function queryRandomEmployees() {
  try {
    // 1. 查询最近一次排班运行的ID
    const [runRows]: any = await pool.execute(`
      SELECT id, run_key, created_at 
      FROM scheduling_runs 
      WHERE status = 'DRAFT'
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (runRows.length === 0) {
      console.log('未找到排班运行记录');
      return;
    }
    
    const runId = runRows[0].id;
    console.log('=== 最近一次排班运行 ===');
    console.log(`运行ID: ${runId}`);
    console.log(`运行Key: ${runRows[0].run_key}`);
    console.log(`创建时间: ${runRows[0].created_at}`);
    console.log('');
    
    // 2. 随机选择3名有排班记录的员工
    const [employeeRows]: any = await pool.execute(`
      SELECT DISTINCT e.id, e.employee_code, e.employee_name, e.org_role
      FROM employees e
      INNER JOIN employee_shift_plans esp ON e.id = esp.employee_id
      WHERE esp.scheduling_run_id = ?
        AND esp.plan_date >= '2025-10-01'
        AND esp.plan_date <= '2025-10-31'
      ORDER BY RAND()
      LIMIT 3
    `, [runId]);
    
    if (employeeRows.length === 0) {
      console.log('未找到有排班记录的员工');
      return;
    }
    
    console.log('=== 随机抽取的3名员工 ===');
    employeeRows.forEach((emp: any, idx: number) => {
      console.log(`${idx + 1}. ${emp.employee_name} (${emp.employee_code}) - ${emp.org_role || 'N/A'}`);
    });
    console.log('');
    
    // 3. 查询这3位员工的10月工时情况
    for (const emp of employeeRows) {
      const [scheduleRows]: any = await pool.execute(`
        SELECT 
          esp.plan_date,
          esp.plan_hours,
          esp.overtime_hours,
          esp.plan_category,
          sd.shift_code,
          sd.shift_name,
          bop.id AS operation_plan_id,
          o.operation_name,
          bop.planned_start_datetime,
          bop.planned_end_datetime,
          TIMESTAMPDIFF(MINUTE, bop.planned_start_datetime, bop.planned_end_datetime) / 60.0 AS operation_duration
        FROM employee_shift_plans esp
        LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
        LEFT JOIN batch_operation_plans bop ON esp.batch_operation_plan_id = bop.id
        LEFT JOIN operations o ON bop.operation_id = o.id
        WHERE esp.employee_id = ?
          AND esp.plan_date >= '2025-10-01'
          AND esp.plan_date <= '2025-10-31'
          AND esp.scheduling_run_id = ?
        ORDER BY esp.plan_date
      `, [emp.id, runId]);
      
      const totalPlanHours = Number(scheduleRows.reduce((sum: number, s: any) => sum + Number(s.plan_hours || 0), 0));
      const totalOvertimeHours = Number(scheduleRows.reduce((sum: number, s: any) => sum + Number(s.overtime_hours || 0), 0));
      const operationSchedules = scheduleRows.filter((s: any) => s.operation_plan_id);
      const totalOperationDuration = Number(operationSchedules.reduce((sum: number, s: any) => sum + Number(s.operation_duration || 0), 0));
      
      console.log(`\n=== ${emp.employee_name} (${emp.employee_code}) - 10月工时详情 ===`);
      console.log(`组织角色: ${emp.org_role || 'N/A'}`);
      console.log(`总计划工时(planHours): ${totalPlanHours.toFixed(2)}h`);
      console.log(`总加班工时(overtimeHours): ${totalOvertimeHours.toFixed(2)}h`);
      console.log(`总操作时长(operationDuration): ${totalOperationDuration.toFixed(2)}h`);
      console.log(`排班天数: ${scheduleRows.length}天`);
      console.log(`操作任务天数: ${operationSchedules.length}天`);
      console.log(`补充班次天数: ${scheduleRows.length - operationSchedules.length}天`);
      console.log(`平均每日计划工时: ${(totalPlanHours / Math.max(scheduleRows.length, 1)).toFixed(2)}h`);
      if (operationSchedules.length > 0) {
        console.log(`平均每日操作时长: ${(totalOperationDuration / operationSchedules.length).toFixed(2)}h`);
      }
      console.log('');
      console.log('详细排班记录:');
      scheduleRows.forEach((s: any) => {
        const operationInfo = s.operation_plan_id 
          ? `操作: ${s.operation_name || 'N/A'} (操作时长: ${Number(s.operation_duration || 0).toFixed(2)}h)`
          : '补充班次（无操作任务）';
        const shiftInfo = s.shift_code ? `${s.shift_code}班次` : '未指定班次';
        console.log(`  ${s.plan_date}: ${shiftInfo}, 计划工时${Number(s.plan_hours || 0).toFixed(2)}h, 加班${Number(s.overtime_hours || 0).toFixed(2)}h, ${operationInfo}`);
      });
      console.log('');
    }
    
    await pool.end();
  } catch (error) {
    console.error('查询错误:', error);
    await pool.end();
  }
}

queryRandomEmployees();

