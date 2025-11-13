import pool from './src/config/database';

async function queryEmployeeOctoberSchedule() {
  const employeeName = '贾晓菲';
  const startDate = '2025-10-01';
  const endDate = '2025-10-31';

  try {
    // 查询详细排班记录
    const [detailRows]: any = await pool.execute(`
      SELECT 
        e.id AS employee_id,
        e.employee_code,
        e.employee_name,
        esp.plan_date,
        esp.plan_category,
        esp.plan_state,
        esp.plan_hours,
        esp.overtime_hours,
        (COALESCE(esp.plan_hours, 0) + COALESCE(esp.overtime_hours, 0)) AS total_hours,
        sd.shift_code,
        sd.shift_name,
        sd.start_time AS shift_start_time,
        sd.end_time AS shift_end_time,
        o.operation_name,
        pbp.batch_code
      FROM employees e
      LEFT JOIN employee_shift_plans esp ON e.id = esp.employee_id
      LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
      LEFT JOIN batch_operation_plans bop ON esp.batch_operation_plan_id = bop.id
      LEFT JOIN operations o ON bop.operation_id = o.id
      LEFT JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
      WHERE e.employee_name = ?
        AND esp.plan_date >= ?
        AND esp.plan_date <= ?
        AND COALESCE(UPPER(esp.plan_state), '') <> 'VOID'
      ORDER BY esp.plan_date, esp.plan_category
    `, [employeeName, startDate, endDate]);

    // 查询汇总统计
    const [summaryRows]: any = await pool.execute(`
      SELECT 
        e.employee_name,
        COUNT(DISTINCT esp.plan_date) AS work_days,
        SUM(COALESCE(esp.plan_hours, 0)) AS total_plan_hours,
        SUM(COALESCE(esp.overtime_hours, 0)) AS total_overtime_hours,
        SUM(COALESCE(esp.plan_hours, 0) + COALESCE(esp.overtime_hours, 0)) AS total_hours
      FROM employees e
      LEFT JOIN employee_shift_plans esp ON e.id = esp.employee_id
      WHERE e.employee_name = ?
        AND esp.plan_date >= ?
        AND esp.plan_date <= ?
        AND COALESCE(UPPER(esp.plan_state), '') <> 'VOID'
      GROUP BY e.id, e.employee_name
    `, [employeeName, startDate, endDate]);

    console.log('\n========== 员工排班汇总 ==========');
    if (Array.isArray(summaryRows) && summaryRows.length > 0) {
      const summary = summaryRows[0];
      console.log(`员工姓名: ${summary.employee_name}`);
      console.log(`工作天数: ${summary.work_days} 天`);
      console.log(`计划工时: ${Number(summary.total_plan_hours).toFixed(2)} 小时`);
      console.log(`加班工时: ${Number(summary.total_overtime_hours).toFixed(2)} 小时`);
      console.log(`总工时: ${Number(summary.total_hours).toFixed(2)} 小时`);
    } else {
      console.log('未找到该员工的排班记录');
    }

    console.log('\n========== 每日排班详情 ==========');
    if (Array.isArray(detailRows) && detailRows.length > 0) {
      detailRows.forEach((row: any) => {
        console.log(`\n日期: ${row.plan_date}`);
        console.log(`  类别: ${row.plan_category}`);
        console.log(`  状态: ${row.plan_state}`);
        console.log(`  班次: ${row.shift_name || row.shift_code || '无'}`);
        if (row.shift_start_time && row.shift_end_time) {
          console.log(`  时间: ${row.shift_start_time} - ${row.shift_end_time}`);
        }
        console.log(`  计划工时: ${Number(row.plan_hours || 0).toFixed(2)}h`);
        console.log(`  加班工时: ${Number(row.overtime_hours || 0).toFixed(2)}h`);
        console.log(`  总工时: ${Number(row.total_hours).toFixed(2)}h`);
        if (row.operation_name) {
          console.log(`  操作: ${row.operation_name}`);
        }
        if (row.batch_code) {
          console.log(`  批次: ${row.batch_code}`);
        }
      });
    } else {
      console.log('未找到该员工的排班记录');
    }

  } catch (error) {
    console.error('查询错误:', error);
  } finally {
    await pool.end();
  }
}

queryEmployeeOctoberSchedule();
