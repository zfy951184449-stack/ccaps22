/**
 * 检查最近一次排班结果中同一员工同一天被分配多个班次的情况
 */

import pool from './src/config/database';
import { RowDataPacket } from 'mysql2';

async function checkMultipleShiftsPerDay() {
    try {
        // 获取最新批次
        const [batches] = await pool.execute<RowDataPacket[]>(
            `SELECT id, batch_code FROM production_batch_plans ORDER BY id DESC LIMIT 1`
        );

        if (!batches || batches.length === 0) {
            console.log('❌ 未找到任何批次数据');
            return;
        }

        const latestBatch = batches[0];
        const batch_id = latestBatch.id;
        const batch_code = latestBatch.batch_code;

        console.log('================================================================================');
        console.log(`检查批次 ${batch_code} (ID: ${batch_id}) 的班次分配`);
        console.log('================================================================================\n');

        // 查找同一天有多个班次的情况
        const [multiShifts] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                employee_id,
                plan_date,
                GROUP_CONCAT(DISTINCT plan_category ORDER BY plan_category SEPARATOR ', ') as shift_types,
                COUNT(DISTINCT plan_category) as shift_count
            FROM employee_shift_plans
            WHERE batch_operation_plan_id IS NOT NULL
            GROUP BY employee_id, plan_date
            HAVING COUNT(DISTINCT plan_category) > 1
            ORDER BY employee_id, plan_date
            LIMIT 50
        `);

        if (multiShifts.length === 0) {
            console.log('✅ 未发现同一天有多个班次的情况');
        } else {
            console.log(`❌ 发现 ${multiShifts.length} 个员工-日期组合存在多班次问题\n`);
            console.log('─'.repeat(100));

            for (const record of multiShifts as any[]) {
                console.log(`\n员工 ID: ${record.employee_id}`);
                console.log(`日期: ${record.plan_date}`);
                console.log(`班次数量: ${record.shift_count}`);
                console.log(`班次类型: ${record.shift_types}`);

                // 获取员工姓名
                const [empInfo] = await pool.execute<RowDataPacket[]>(
                    `SELECT employee_name, employee_code FROM employees WHERE id = ?`,
                    [record.employee_id]
                );

                if (empInfo.length > 0) {
                    const emp = empInfo[0];
                    console.log(`员工姓名: ${emp.employee_name} (工号: ${emp.employee_code})`);
                }

                // 获取该员工该日期的详细班次信息
                const [shiftDetails] = await pool.execute<RowDataPacket[]>(`
                    SELECT 
                        plan_category,
                        shift_nominal_hours,
                        plan_hours
                    FROM employee_shift_plans
                    WHERE employee_id = ? 
                        AND plan_date = ?
                    ORDER BY plan_category
                `, [record.employee_id, record.plan_date]);

                console.log('详细班次信息:');
                for (const shift of shiftDetails as any[]) {
                    console.log(`  - ${shift.plan_category}: 计划${shift.plan_hours || 0}小时, 班次标准${shift.shift_nominal_hours || 0}小时`);
                }

                // 获取该员工该日期的操作分配
                const [operations] = await pool.execute<RowDataPacket[]>(`
                    SELECT 
                        bop.id as operation_id,
                        bop.planned_start_datetime,
                        bop.planned_end_datetime
                    FROM batch_personnel_assignments bpa
                    INNER JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
                    WHERE bpa.employee_id = ? 
                        AND DATE(bop.planned_start_datetime) = ?
                        AND (bpa.assignment_status IS NULL OR bpa.assignment_status != 'CANCELLED')
                    ORDER BY bop.planned_start_datetime
                `, [record.employee_id, record.plan_date]);

                if (operations.length > 0) {
                    console.log('当天的操作分配:');
                    for (const op of operations as any[]) {
                        const start = new Date(op.planned_start_datetime).toLocaleString('zh-CN');
                        const end = new Date(op.planned_end_datetime).toLocaleString('zh-CN');
                        console.log(`  - 操作 ${op.operation_id}: ${start} → ${end}`);
                    }
                } else {
                    console.log('当天无操作分配');
                }

                console.log('─'.repeat(100));
            }
        }

        // 统计信息
        const [stats] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                COUNT(DISTINCT CONCAT(employee_id, '-', plan_date)) as total_employee_days,
                COUNT(*) as total_shift_records
            FROM employee_shift_plans
            WHERE batch_operation_plan_id IS NOT NULL
        `);

        const stat = stats[0] as any;
        console.log(`\n统计信息:`);
        console.log(`  总员工-日期数: ${stat.total_employee_days}`);
        console.log(`  总班次记录数: ${stat.total_shift_records}`);
        console.log(`  重复率: ${((stat.total_shift_records - stat.total_employee_days) / stat.total_employee_days * 100).toFixed(2)}%`);

        console.log('\n' + '='.repeat(100));

    } catch (error: any) {
        console.error('❌ 查询失败:', error.message);
        console.error(error.stack);
    } finally {
        await pool.end();
    }
}

checkMultipleShiftsPerDay().catch(console.error);
