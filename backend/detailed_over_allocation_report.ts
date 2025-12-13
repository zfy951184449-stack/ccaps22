/**
 * 生成详细的超额分配报告（简化版）
 */

import pool from './src/config/database';
import { RowDataPacket } from 'mysql2';

async function generateDetailedReport() {
    try {
        // 获取批次200和198的详细超额分配信息
        const batchIds = [200, 198];

        for (const batchId of batchIds) {
            const [batchInfo] = await pool.execute<RowDataPacket[]>(
                `SELECT id, batch_code FROM production_batch_plans WHERE id = ?`,
                [batchId]
            );

            if (batchInfo.length === 0) continue;

            const batch = batchInfo[0];

            console.log('\n' + '='.repeat(100));
            console.log(`批次 ${batch.id} - ${batch.batch_code} 超额分配详细报告`);
            console.log('='.repeat(100) + '\n');

            // 获取所有超额分配的操作
            const [overAllocatedOps] = await pool.execute<RowDataPacket[]>(`
                SELECT 
                    bop.id AS operation_plan_id,
                    bop.required_people,
                    bop.planned_start_datetime,
                    bop.planned_end_datetime,
                    COUNT(DISTINCT bpa.employee_id) AS assigned_count
                FROM batch_operation_plans bop
                LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id
                WHERE bop.batch_plan_id = ? 
                    AND (bpa.assignment_status IS NULL OR bpa.assignment_status != 'CANCELLED')
                GROUP BY bop.id, bop.required_people, bop.planned_start_datetime, bop.planned_end_datetime
                HAVING COUNT(DISTINCT bpa.employee_id) > bop.required_people
                ORDER BY (COUNT(DISTINCT bpa.employee_id) - bop.required_people) DESC
            `, [batchId]);

            console.log(`总超额分配操作数: ${overAllocatedOps.length}\n`);

            let opCount = 0;
            for (const op of overAllocatedOps as any[]) {
                opCount++;
                const overAllocation = op.assigned_count - op.required_people;
                const startTime = new Date(op.planned_start_datetime).toLocaleString('zh-CN');
                const endTime = new Date(op.planned_end_datetime).toLocaleString('zh-CN');

                console.log('─'.repeat(100));
                console.log(`\n第 ${opCount} 个超额分配操作`);
                console.log(`操作 ID: ${op.operation_plan_id}`);
                console.log(`计划时间: ${startTime} → ${endTime}`);
                console.log(`\n人员配置:`);
                console.log(`  需要人数: ${op.required_people} 人`);
                console.log(`  实际分配: ${op.assigned_count} 人`);
                console.log(`  ⚠️  超额: ${overAllocation} 人 (超出需求的 ${((overAllocation / op.required_people) * 100).toFixed(0)}%)`);

                // 获取分配的员工详细信息
                const [employees] = await pool.execute<RowDataPacket[]>(`
                    SELECT 
                        e.id,
                        e.employee_name,
                        e.employee_code
                    FROM batch_personnel_assignments bpa
                    LEFT JOIN employees e ON bpa.employee_id = e.id
                    WHERE bpa.batch_operation_plan_id = ? 
                        AND (bpa.assignment_status IS NULL OR bpa.assignment_status != 'CANCELLED')
                    ORDER BY e.id
                `, [op.operation_plan_id]);

                console.log(`\n分配的员工列表 (共 ${employees.length} 人):`);
                for (let i = 0; i < employees.length; i++) {
                    const emp = employees[i] as any;
                    const empName = emp.employee_name || '未知';
                    const empCode = emp.employee_code || '无';
                    console.log(`  ${i + 1}. 员工 ID ${emp.id} - ${empName} (工号: ${empCode})`);
                }

                console.log('');

                // 只显示前10个最严重的
                if (opCount >= 10) {
                    console.log(`\n... 还有 ${overAllocatedOps.length - 10} 个超额分配的操作未显示\n`);
                    break;
                }
            }

            console.log('='.repeat(100) + '\n');
        }

        // 汇总统计
        console.log('\n' + '='.repeat(100));
        console.log('汇总统计');
        console.log('='.repeat(100) + '\n');

        for (const batchId of batchIds) {
            const [stats] = await pool.execute<RowDataPacket[]>(`
                SELECT 
                    COUNT(DISTINCT bop.id) AS total_operations,
                    COUNT(DISTINCT CASE 
                        WHEN bpa.id IS NOT NULL AND (bpa.assignment_status IS NULL OR bpa.assignment_status != 'CANCELLED') 
                        THEN bop.id 
                    END) AS assigned_operations,
                    COUNT(DISTINCT CASE 
                        WHEN bpa.assignment_status IS NULL OR bpa.assignment_status != 'CANCELLED' 
                        THEN bpa.id 
                    END) AS total_assignments,
                    SUM(bop.required_people) AS total_required_people
                FROM batch_operation_plans bop
                LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id
                WHERE bop.batch_plan_id = ?
            `, [batchId]);

            const stat = stats[0] as any;

            const [overAllocCount] = await pool.execute<RowDataPacket[]>(`
                SELECT COUNT(*) as count
                FROM (
                    SELECT 
                        bop.id
                    FROM batch_operation_plans bop
                    LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id
                    WHERE bop.batch_plan_id = ? 
                        AND (bpa.assignment_status IS NULL OR bpa.assignment_status != 'CANCELLED')
                    GROUP BY bop.id, bop.required_people
                    HAVING COUNT(DISTINCT bpa.employee_id) > bop.required_people
                ) AS over_allocated
            `, [batchId]);

            const overCount = (overAllocCount[0] as any).count;

            const [batchInfo] = await pool.execute<RowDataPacket[]>(
                `SELECT batch_code FROM production_batch_plans WHERE id = ?`,
                [batchId]
            );

            console.log(`批次 ${batchId} - ${batchInfo[0].batch_code}:`);
            console.log(`  总操作数: ${stat.total_operations}`);
            console.log(`  已分配操作数: ${stat.assigned_operations}`);
            console.log(`  超额分配操作数: ${overCount}`);
            console.log(`  超额分配比例: ${((overCount / stat.assigned_operations) * 100).toFixed(1)}%`);
            console.log(`  总需求人次: ${stat.total_required_people || 0}`);
            console.log(`  总分配人次: ${stat.total_assignments}`);
            console.log(`  总超额人次: ${stat.total_assignments - (stat.total_required_people || 0)}`);
            console.log('');
        }

        console.log('='.repeat(100) + '\n');

    } catch (error: any) {
        console.error('❌ 生成报告失败:', error.message);
        console.error(error.stack);
    } finally {
        await pool.end();
    }
}

generateDetailedReport().catch(console.error);
