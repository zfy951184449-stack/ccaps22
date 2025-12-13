/**
 * 检查同一员工同一天是否有多个shift_plan记录（即使类别相同）
 */

import pool from './src/config/database';
import { RowDataPacket } from 'mysql2';

async function checkDuplicateShiftRecords() {
    try {
        console.log('================================================================================');
        console.log('检查同一员工同一天的多条班次记录');
        console.log('================================================================================\n');

        // 查找同一员工同一天有多条记录的情况
        const [duplicates] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                employee_id,
                plan_date,
                COUNT(*) as record_count,
                GROUP_CONCAT(CONCAT(plan_category, '(', COALESCE(shift_nominal_hours, 0), 'h)') ORDER BY id SEPARATOR ' + ') as shifts
            FROM employee_shift_plans
            WHERE batch_operation_plan_id IS NOT NULL
            GROUP BY employee_id, plan_date
            HAVING COUNT(*) > 1
            ORDER BY record_count DESC, employee_id, plan_date
            LIMIT 20
        `);

        if (duplicates.length === 0) {
            console.log('✅ 未发现同一员工同一天有多条班次记录的情况');
        } else {
            console.log(`❌ 发现 ${duplicates.length} 个员工-日期组合有多条记录\n`);
            console.log('─'.repeat(100));

            for (const record of duplicates as any[]) {
                console.log(`\n员工 ID: ${record.employee_id}`);
                console.log(`日期: ${record.plan_date}`);
                console.log(`记录数: ${record.record_count}`);
                console.log(`班次: ${record.shifts}`);

                // 获取员工信息
                const [empInfo] = await pool.execute<RowDataPacket[]>(
                    `SELECT employee_name, employee_code FROM employees WHERE id = ?`,
                    [record.employee_id]
                );

                if (empInfo.length > 0) {
                    const emp = empInfo[0];
                    console.log(`员工: ${emp.employee_name} (${emp.employee_code})`);
                }

                // 获取详细记录
                const [details] = await pool.execute<RowDataPacket[]>(`
                    SELECT 
                        id,
                        plan_category,
                        shift_nominal_hours,
                        plan_hours,
                        batch_operation_plan_id,
                        created_at
                    FROM employee_shift_plans
                    WHERE employee_id = ? AND plan_date = ?
                    ORDER BY id
                `, [record.employee_id, record.plan_date]);

                console.log('详细记录:');
                for (const detail of details as any[]) {
                    console.log(`  ID ${detail.id}: ${detail.plan_category}, 标准${detail.shift_nominal_hours || 0}h, 计划${detail.plan_hours || 0}h, 操作=${detail.batch_operation_plan_id || 'N/A'}, 创建于${detail.created_at}`);
                }

                console.log('─'.repeat(100));
            }
        }

        console.log('\n================================================================================\n');

    } catch (error: any) {
        console.error('❌ 查询失败:', error.message);
        console.error(error.stack);
    } finally {
        await pool.end();
    }
}

checkDuplicateShiftRecords().catch(console.error);
