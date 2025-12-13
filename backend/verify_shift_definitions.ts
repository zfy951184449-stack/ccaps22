/**
 * 检查数据库中的班次定义
 */
import { pool } from './src/config/database';

async function checkShiftDefinitions() {
    try {
        const [shifts] = await pool.query(`
      SELECT 
        id,
        shift_code,
        shift_name,
        start_time,
        end_time,
        is_cross_day,
        nominal_hours,
        is_night_shift,
        is_active
      FROM shift_definitions
      WHERE is_active = 1
      ORDER BY start_time
    `);

        console.log('=== 数据库班次定义检查 ===\n');
        console.log(`总数: ${(shifts as any[]).length} 个有效班次\n`);

        let has_night_shift = false;
        let time_coverage = new Map<string, boolean>();

        (shifts as any[]).forEach((shift, index) => {
            console.log(`班次 ${index + 1}:`);
            console.log(`  ID: ${shift.id}`);
            console.log(`  代码: ${shift.shift_code}`);
            console.log(`  名称: ${shift.shift_name}`);
            console.log(`  时间: ${shift.start_time} - ${shift.end_time}`);
            console.log(`  跨天: ${shift.is_cross_day ? '是' : '否'}`);
            console.log(`  夜班: ${shift.is_night_shift ? '是' : '否'}`);
            console.log(`  折算工时: ${shift.nominal_hours}h\n`);

            if (shift.is_night_shift) {
                has_night_shift = true;
            }

            // 记录时间覆盖
            const startHour = parseInt(shift.start_time.split(':')[0]);
            time_coverage.set(`${startHour}`, true);
        });

        console.log('=== 覆盖率分析 ===');
        console.log(`是否有夜班定义: ${has_night_shift ? '✅ 是' : '❌ 否'}`);
        console.log(`时间点覆盖: ${time_coverage.size} 个不同的开始小时`);

        // 检查是否覆盖24小时
        const has_morning = Array.from((shifts as any[])).some(s => {
            const hour = parseInt(s.start_time.split(':')[0]);
            return hour >= 6 && hour <= 9;
        });
        const has_afternoon = Array.from((shifts as any[])).some(s => {
            const hour = parseInt(s.start_time.split(':')[0]);
            return hour >= 12 && hour <= 15;
        });
        const has_night = Array.from((shifts as any[])).some(s => {
            const hour = parseInt(s.start_time.split(':')[0]);
            return hour >= 20 || hour <= 6;
        });

        console.log(`\n时段覆盖:`);
        console.log(`  早班 (06:00-09:00): ${has_morning ? '✅' : '❌'}`);
        console.log(`  日班 (12:00-15:00): ${has_afternoon ? '✅' : '❌'}`);
        console.log(`  夜班 (20:00-06:00): ${has_night ? '✅' : '❌'}`);

        await pool.end();
    } catch (error) {
        console.error('检查失败:', error);
        process.exit(1);
    }
}

checkShiftDefinitions();
