import pool from './src/config/database';

async function cleanupDuplicateShifts() {
    const connection = await pool.getConnection();

    // 要删除的班次 ID
    const shiftsToDelete = [2, 8, 9, 10];

    try {
        console.log('=== 开始清理重复班次 ===\n');

        for (const shiftId of shiftsToDelete) {
            // 获取班次信息
            const [shifts] = await connection.execute(
                'SELECT id, shift_code, shift_name FROM shift_definitions WHERE id = ?',
                [shiftId]
            );

            if ((shifts as any[]).length === 0) {
                console.log(`❌ ID ${shiftId}: 不存在\n`);
                continue;
            }

            const shift = (shifts as any[])[0];
            console.log(`检查班次 ID ${shiftId}: ${shift.shift_code} (${shift.shift_name})`);

            // 检查引用
            const [shiftPlans] = await connection.execute(
                'SELECT COUNT(*) as count FROM employee_shift_plans WHERE shift_id = ?',
                [shiftId]
            );
            const shiftPlanCount = (shiftPlans as any[])[0].count;

            const [batchAssignments] = await connection.execute(
                'SELECT COUNT(*) as count FROM batch_personnel_assignments WHERE shift_code = ?',
                [shift.shift_code]
            );
            const batchAssignmentCount = (batchAssignments as any[])[0].count;

            const [teams] = await connection.execute(
                'SELECT COUNT(*) as count FROM teams WHERE default_shift_code = ?',
                [shift.shift_code]
            );
            const teamCount = (teams as any[])[0].count;

            // 如果有引用，显示警告但不删除
            if (shiftPlanCount > 0 || batchAssignmentCount > 0 || teamCount > 0) {
                console.log(`  ⚠️  无法删除，存在引用：`);
                if (shiftPlanCount > 0) {
                    console.log(`    - ${shiftPlanCount} 条员工排班记录`);
                }
                if (batchAssignmentCount > 0) {
                    console.log(`    - ${batchAssignmentCount} 条批次人员分配`);
                }
                if (teamCount > 0) {
                    console.log(`    - ${teamCount} 个班组默认班次`);
                }
                console.log(`  建议先解除引用或使用停用功能\n`);
                continue;
            }

            // 没有引用，可以安全删除
            console.log(`  ✅ 无引用，准备删除...`);
            const [result] = await connection.execute(
                'DELETE FROM shift_definitions WHERE id = ?',
                [shiftId]
            );

            if ((result as any).affectedRows > 0) {
                console.log(`  ✅ 已删除: ${shift.shift_code} (${shift.shift_name})\n`);
            } else {
                console.log(`  ❌ 删除失败\n`);
            }
        }

        // 显示清理后的结果
        console.log('=== 清理完成，当前剩余班次 ===\n');
        const [remainingShifts] = await connection.execute(`
      SELECT 
        id,
        shift_code,
        shift_name,
        category,
        is_active
      FROM shift_definitions
      WHERE is_active = 1
      ORDER BY shift_code
    `);

        console.log(`启用中的班次 (${(remainingShifts as any[]).length} 个):`);
        (remainingShifts as any[]).forEach((shift) => {
            console.log(`  - ${shift.shift_code}: ${shift.shift_name} (${shift.category})`);
        });

    } catch (error) {
        console.error('清理过程中发生错误:', error);
    } finally {
        connection.release();
    }
}

cleanupDuplicateShifts().catch(console.error);
