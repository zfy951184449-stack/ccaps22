/**
 * 查询所有批次及其分配情况
 */

import pool from './src/config/database';
import { RowDataPacket } from 'mysql2';

interface BatchInfo {
    id: number;
    batch_code: string;
    total_operations: number;
    operations_with_assignments: number;
    total_assignments: number;
    over_allocated_operations: number;
}

async function checkAllBatches() {
    try {
        // 获取所有批次及其分配统计
        const [batches] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                pbp.id,
                pbp.batch_code,
                COUNT(DISTINCT bop.id) AS total_operations,
                COUNT(DISTINCT CASE 
                    WHEN bpa.id IS NOT NULL AND (bpa.assignment_status IS NULL OR bpa.assignment_status != 'CANCELLED') 
                    THEN bop.id 
                END) AS operations_with_assignments,
                COUNT(DISTINCT CASE 
                    WHEN bpa.assignment_status IS NULL OR bpa.assignment_status != 'CANCELLED' 
                    THEN bpa.id 
                END) AS total_assignments
            FROM production_batch_plans pbp
            LEFT JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
            LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id
            GROUP BY pbp.id, pbp.batch_code
            ORDER BY pbp.id DESC
            LIMIT 10
        `);

        console.log('================================================================================');
        console.log('所有批次的分配情况');
        console.log('================================================================================\n');

        for (const batch of batches as any[]) {
            console.log(`批次 ID: ${batch.id} - ${batch.batch_code}`);
            console.log(`  总操作数: ${batch.total_operations}`);
            console.log(`  已分配操作数: ${batch.operations_with_assignments}`);
            console.log(`  总分配数: ${batch.total_assignments}`);

            // 检查超额分配
            if (batch.total_assignments > 0) {
                const [overAllocated] = await pool.execute<RowDataPacket[]>(`
                    SELECT 
                        bop.id AS operation_plan_id,
                        bop.required_people,
                        COUNT(DISTINCT bpa.employee_id) AS assigned_count
                    FROM batch_operation_plans bop
                    LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id
                    WHERE bop.batch_plan_id = ? 
                        AND (bpa.assignment_status IS NULL OR bpa.assignment_status != 'CANCELLED')
                    GROUP BY bop.id, bop.required_people
                    HAVING COUNT(DISTINCT bpa.employee_id) > bop.required_people
                `, [batch.id]);

                console.log(`  超额分配操作数: ${overAllocated.length}`);

                if (overAllocated.length > 0) {
                    console.log(`  ⚠️  发现超额分配！`);

                    // 显示前5个超额分配的操作
                    const limit = Math.min(5, overAllocated.length);
                    for (let i = 0; i < limit; i++) {
                        const op = overAllocated[i] as any;
                        console.log(`    - 操作 ${op.operation_plan_id}: 需要 ${op.required_people} 人，分配了 ${op.assigned_count} 人 (超额 ${op.assigned_count - op.required_people} 人)`);
                    }

                    if (overAllocated.length > 5) {
                        console.log(`    ... 还有 ${overAllocated.length - 5} 个超额分配的操作`);
                    }
                }
            } else {
                console.log(`  超额分配操作数: 0`);
            }

            console.log('');
        }

        console.log('================================================================================\n');

    } catch (error: any) {
        console.error('❌ 查询失败:', error.message);
    } finally {
        await pool.end();
    }
}

checkAllBatches().catch(console.error);
