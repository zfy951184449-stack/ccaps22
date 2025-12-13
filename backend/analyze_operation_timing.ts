/**
 * 分析具体案例：检查两个操作的时间关系
 */

import pool from './src/config/database';
import { RowDataPacket } from 'mysql2';

async function analyzeOperationTiming() {
    try {
        // 查看操作918和919的详细信息（员工46和51都在1月19日有这两个操作）
        const [operations] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                id,
                planned_start_datetime,
                planned_end_datetime,
                required_people
            FROM batch_operation_plans
            WHERE id IN (918, 919, 663, 664)
            ORDER BY id
        `);

        console.log('================================================================================');
        console.log('问题操作的时间分析');
        console.log('================================================================================\n');

        for (const op of operations as any[]) {
            const start = new Date(op.planned_start_datetime);
            const end = new Date(op.planned_end_datetime);
            const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

            console.log(`操作 ID: ${op.id}`);
            console.log(`  开始: ${start.toLocaleString('zh-CN')}`);
            console.log(`  结束: ${end.toLocaleString('zh-CN')}`);
            console.log(`  时长: ${duration.toFixed(2)}小时`);
            console.log(`  需求人数: ${op.required_people}`);

            // 判断是否跨天
            const startDate = start.toLocaleDateString('zh-CN');
            const endDate = end.toLocaleDateString('zh-CN');
            console.log(`  跨天: ${startDate !== endDate ? 'YES' : 'NO'}`);

            // 判断是否夜班（22:00-06:00）
            const startHour = start.getHours();
            const endHour = end.getHours();
            const isNight = startHour >= 22 || startHour < 6 || endHour >= 22 || endHour < 6;
            console.log(`  疑似夜班: ${isNight ? 'YES' : 'NO'}`);
            console.log('');
        }

        // 检查员工46在1月19日的所有分配
        console.log('─'.repeat(100));
        console.log('\n员工46 (刘天畅) 在2026-01-19的分配情况:\n');

        const [emp46Assign] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                bop.id as op_id,
                bop.planned_start_datetime,
                bop.planned_end_datetime,
                esp.plan_category,
                esp.shift_nominal_hours,
                esp.plan_hours
            FROM batch_personnel_assignments bpa
            INNER JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
            LEFT JOIN employee_shift_plans esp ON bpa.shift_plan_id = esp.id
            WHERE bpa.employee_id = 46
                AND DATE(bop.planned_start_datetime) = '2026-01-19'
            ORDER BY bop.planned_start_datetime
        `);

        for (const assign of emp46Assign as any[]) {
            const start = new Date(assign.planned_start_datetime);
            const end = new Date(assign.planned_end_datetime);
            console.log(`  操作${assign.op_id}: ${start.toLocaleString('zh-CN')} - ${end.toLocaleString('zh-CN')}`);
            console.log(`    班次: ${assign.plan_category}, 标准${assign.shift_nominal_hours}h, 计划${assign.plan_hours}h`);
        }

        console.log('\n================================================================================\n');

    } catch (error: any) {
        console.error('❌ 查询失败:', error.message);
        console.error(error.stack);
    } finally {
        await pool.end();
    }
}

analyzeOperationTiming().catch(console.error);
