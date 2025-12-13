/**
 * 快速查询脚本：检查最近一次求解中的操作分配情况
 */

import pool from './src/config/database';
import { RowDataPacket } from 'mysql2';

interface OperationAssignment {
    operation_plan_id: number;
    required_people: number;
    assigned_count: number;
    employee_ids: string;
}

async function checkAssignments() {
    try {
        // Step 1: 获取最新的批次ID
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
        console.log(`操作分配分析报告 - 批次 ${batch_code} (ID: ${batch_id})`);
        console.log('================================================================================\n');

        // Step 2: 分析每个操作的人员需求 vs 实际分配
        const [results] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        bop.id AS operation_plan_id,
        bop.required_people,
        COUNT(DISTINCT bpa.employee_id) AS assigned_count,
        GROUP_CONCAT(DISTINCT bpa.employee_id ORDER BY bpa.employee_id) AS employee_ids
      FROM batch_operation_plans bop
      LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id
      WHERE bop.batch_plan_id = ? AND (bpa.assignment_status IS NULL OR bpa.assignment_status != 'CANCELLED')
      GROUP BY bop.id, bop.required_people
      HAVING COUNT(DISTINCT bpa.employee_id) > bop.required_people
      ORDER BY bop.id
    `, [batch_id]);

        const overAllocated = results as OperationAssignment[];

        // Step 3: 获取所有操作的统计
        const [totalStats] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        COUNT(DISTINCT bop.id) AS total_operations,
        COUNT(DISTINCT CASE WHEN bpa.id IS NOT NULL AND bpa.assignment_status != 'CANCELLED' THEN bop.id END) AS assigned_operations
      FROM batch_operation_plans bop
      LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id
      WHERE bop.batch_plan_id = ?
    `, [batch_id]);

        const stats = totalStats[0];

        console.log(`总操作数: ${stats.total_operations}`);
        console.log(`已分配操作数: ${stats.assigned_operations}`);
        console.log(`超额分配操作数: ${overAllocated.length}\n`);

        if (overAllocated.length > 0) {
            console.log('❌ 发现以下操作存在超额分配:\n');
            console.log('─'.repeat(80));

            for (const op of overAllocated) {
                console.log(`\n操作ID: ${op.operation_plan_id}`);
                console.log(`  需要人数: ${op.required_people}`);
                console.log(`  实际分配: ${op.assigned_count} 人`);
                console.log(`  超额: ${op.assigned_count - op.required_people} 人`);
                console.log(`  分配的员工ID: ${op.employee_ids}`);

                // 获取详细的分配信息
                const [details] = await pool.execute<RowDataPacket[]>(`
          SELECT 
            bpa.employee_id,
            e.employee_name,
            bop.planned_start_datetime,
            bop.planned_end_datetime
          FROM batch_personnel_assignments bpa
          INNER JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
          LEFT JOIN employees e ON bpa.employee_id = e.id
          WHERE bpa.batch_operation_plan_id = ? AND bpa.assignment_status != 'CANCELLED'
          ORDER BY bop.planned_start_datetime, bpa.employee_id
        `, [op.operation_plan_id]);

                console.log(`  详细分配:`);
                for (const detail of details) {
                    const empName = detail.employee_name || '未知';
                    const startTime = detail.planned_start_datetime ? new Date(detail.planned_start_datetime).toLocaleString('zh-CN') : '未知';
                    console.log(`    - 员工 ${detail.employee_id} (${empName}) - ${startTime}`);
                }
            }

            console.log('\n' + '─'.repeat(80));
        } else {
            console.log('✅ 未发现超额分配的操作');
        }

        console.log('\n' + '='.repeat(80));

    } catch (error: any) {
        console.error('❌ 查询失败:', error.message);
        if (error.code === 'ER_NO_SUCH_TABLE') {
            console.error('数据库表不存在，请检查数据库结构');
        }
    } finally {
        await pool.end();
    }
}

checkAssignments().catch(console.error);
