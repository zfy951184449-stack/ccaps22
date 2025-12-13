import pool from './src/config/database';

async function checkShiftDefinitions() {
    const connection = await pool.getConnection();

    try {
        console.log('=== 查询所有班次定义 ===\n');

        // 查询所有班次定义
        const [shifts] = await connection.execute(`
      SELECT 
        id,
        shift_code,
        shift_name,
        category,
        start_time,
        end_time,
        is_cross_day,
        is_night_shift,
        nominal_hours,
        is_active,
        created_at
      FROM shift_definitions
      ORDER BY shift_code
    `);

        console.log(`共找到 ${(shifts as any[]).length} 个班次定义：\n`);
        (shifts as any[]).forEach((shift) => {
            console.log(`ID: ${shift.id}`);
            console.log(`  编码: ${shift.shift_code}`);
            console.log(`  名称: ${shift.shift_name}`);
            console.log(`  类别: ${shift.category}`);
            console.log(`  时间: ${shift.start_time} - ${shift.end_time}${shift.is_cross_day ? ' (跨日)' : ''}`);
            console.log(`  夜班: ${shift.is_night_shift ? '是' : '否'}`);
            console.log(`  折算工时: ${shift.nominal_hours}h`);
            console.log(`  状态: ${shift.is_active ? '启用' : '停用'}`);
            console.log(`  创建时间: ${shift.created_at}`);
            console.log('---');
        });

        // 检查重复的班次编码
        console.log('\n=== 检查重复的班次编码 ===\n');
        const [duplicateCodes] = await connection.execute(`
      SELECT 
        shift_code,
        COUNT(*) as count,
        GROUP_CONCAT(id) as ids,
        GROUP_CONCAT(shift_name) as names
      FROM shift_definitions
      GROUP BY shift_code
      HAVING count > 1
    `);

        if ((duplicateCodes as any[]).length > 0) {
            console.log(`⚠️  发现 ${(duplicateCodes as any[]).length} 个重复的班次编码：\n`);
            (duplicateCodes as any[]).forEach((dup) => {
                console.log(`编码: ${dup.shift_code}`);
                console.log(`  重复次数: ${dup.count}`);
                console.log(`  涉及ID: ${dup.ids}`);
                console.log(`  涉及名称: ${dup.names}`);
                console.log('---');
            });
        } else {
            console.log('✅ 没有发现重复的班次编码');
        }

        // 检查重复的班次名称
        console.log('\n=== 检查重复的班次名称 ===\n');
        const [duplicateNames] = await connection.execute(`
      SELECT 
        shift_name,
        COUNT(*) as count,
        GROUP_CONCAT(id) as ids,
        GROUP_CONCAT(shift_code) as codes
      FROM shift_definitions
      GROUP BY shift_name
      HAVING count > 1
    `);

        if ((duplicateNames as any[]).length > 0) {
            console.log(`⚠️  发现 ${(duplicateNames as any[]).length} 个重复的班次名称：\n`);
            (duplicateNames as any[]).forEach((dup) => {
                console.log(`名称: ${dup.shift_name}`);
                console.log(`  重复次数: ${dup.count}`);
                console.log(`  涉及ID: ${dup.ids}`);
                console.log(`  涉及编码: ${dup.codes}`);
                console.log('---');
            });
        } else {
            console.log('✅ 没有发现重复的班次名称');
        }

        // 检查相同时间段的班次
        console.log('\n=== 检查相同时间段的班次 ===\n');
        const [duplicateTime] = await connection.execute(`
      SELECT 
        start_time,
        end_time,
        is_cross_day,
        COUNT(*) as count,
        GROUP_CONCAT(id) as ids,
        GROUP_CONCAT(shift_code) as codes,
        GROUP_CONCAT(shift_name) as names
      FROM shift_definitions
      GROUP BY start_time, end_time, is_cross_day
      HAVING count > 1
    `);

        if ((duplicateTime as any[]).length > 0) {
            console.log(`⚠️  发现 ${(duplicateTime as any[]).length} 组相同时间段的班次：\n`);
            (duplicateTime as any[]).forEach((dup) => {
                console.log(`时间段: ${dup.start_time} - ${dup.end_time}${dup.is_cross_day ? ' (跨日)' : ''}`);
                console.log(`  重复次数: ${dup.count}`);
                console.log(`  涉及ID: ${dup.ids}`);
                console.log(`  涉及编码: ${dup.codes}`);
                console.log(`  涉及名称: ${dup.names}`);
                console.log('---');
            });
        } else {
            console.log('✅ 没有发现相同时间段的班次');
        }

    } finally {
        connection.release();
    }
}

checkShiftDefinitions().catch(console.error);
