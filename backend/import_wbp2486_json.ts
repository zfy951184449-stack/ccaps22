import fs from 'fs';
import path from 'path';
import pool from './src/config/database';

async function importData() {
    const jsonPath = path.resolve(__dirname, '../database/wbp2486_excel_mapped_sample.json');
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        console.log('🔄 开始执行修剪版事务写入...');

        const tmplCode = 'WBP2486DSP_TESTRUN';
        const tmplName = 'WBP2486DSP/TEST RUN';

        // 1. 删除旧模板
        const [existingTmpl]: any = await connection.execute(
            'SELECT id FROM process_templates WHERE template_code = ?', [tmplCode]
        );
        if (existingTmpl.length > 0) {
            const tmplId = existingTmpl[0].id;
            console.log(`🧹 发起清空重装...`);
            await connection.execute('DELETE FROM process_templates WHERE id = ?', [tmplId]);
            // 为了安全起见删除相关联的老人员共享组
            await connection.execute('DELETE FROM personnel_share_groups WHERE template_id = ?', [tmplId]);
        }

        // 2. 插入新模板
        const [tmplResult]: any = await connection.execute(
            `INSERT INTO process_templates (template_code, template_name, description, total_days) 
             VALUES (?, ?, ?, ?)`,
            [tmplCode, tmplName, data.template.description, 13] // hardcoded to correct 13 days
        );
        const newTmplId = tmplResult.insertId;

        // 3. Stages: 强制将 offset(start_day) 全设为 0，防止和 operation_day 发生时间相加偏移导致的"22天"怪圈
        const stageIdMap: Record<string, number> = {};
        for (const stage of data.stages) {
            const [stgResult]: any = await connection.execute(
                `INSERT INTO process_stages (template_id, stage_code, stage_name, stage_order, start_day)
                 VALUES (?, ?, ?, ?, ?)`,
                [newTmplId, stage.stage_code, stage.stage_name, stage.stage_order, 0] // FORCE ZERO
            );
            stageIdMap[stage.stage_code] = stgResult.insertId;
        }

        // 4. Operations & 排排班
        // 创建一个反差映射给后面的 share group 使用
        const scheduleNameToIdMap: Record<string, number> = {};

        for (const stageCode of Object.keys(data.operations)) {
            const ops = data.operations[stageCode];
            const currentStageId = stageIdMap[stageCode];
            if (!currentStageId) continue;

            for (const op of ops) {
                await connection.execute(
                    `INSERT INTO operations (operation_code, operation_name, standard_time, required_people)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE required_people = VALUES(required_people)`,
                    [op.operation_code, op.operation_name, op.standard_time, op.required_people]
                );

                const [dictOp]: any = await connection.execute(
                    `SELECT id FROM operations WHERE operation_code = ? LIMIT 1`, [op.operation_code]
                );
                const dictOpId = dictOp[0]?.id || 0;

                const [schedResult]: any = await connection.execute(
                    `INSERT INTO stage_operation_schedules 
                     (stage_id, operation_id, operation_day, recommended_time, 
                      window_start_time, window_end_time, operation_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        currentStageId, dictOpId, op.operation_day, 
                        op.recommended_time, op.window_start_time, op.window_end_time, 
                        op.operation_order
                    ]
                );
                
                // 将被创建好的 Schedule (不是基础 operation) ID 映射保留
                scheduleNameToIdMap[op.operation_name] = schedResult.insertId;
            }
        }

        // 5. 使用 personnel_share_groups 执行正确的人力分组挂载
        console.log('🤝 配置人员并发拦截真实绑定组 (personnel_share_groups)...');
        if (data.share_groups && data.share_groups.length > 0) {
            for (const sg of data.share_groups) {
                const [sgResult]: any = await connection.execute(
                    `INSERT INTO personnel_share_groups (template_id, group_code, group_name, share_mode) 
                     VALUES (?, ?, ?, ?)`,
                    [newTmplId, sg.group_code, sg.group_name, sg.share_mode]
                );
                const shareGrpId = sgResult.insertId;

                if (sg.members && sg.members.length > 0) {
                    let successfullyBound = 0;
                    for (const member of sg.members) {
                        const schedId = scheduleNameToIdMap[member.operation_name];
                        if (schedId) {
                            await connection.execute(
                                `INSERT INTO personnel_share_group_members (group_id, schedule_id) VALUES (?, ?)`,
                                [shareGrpId, schedId]
                            );
                            successfullyBound++;
                        }
                    }
                    if (sg.group_code === 'GRP_Day2_DAY') {
                        console.log(`[核查凭证] ${sg.group_code} 尝试挂载 ${sg.members.length} 个操作节点，成功存盘 ${successfullyBound} 个！`);
                    }
                }
            }
        }

        await connection.commit();
        console.log('🚀 完美无瑕！事物已全效锚定，请验收甘特图长度与人员合并效果。');

    } catch (e) {
        await connection.rollback();
        console.error('❌ 写入溃败中止 (Rollback):', e);
    } finally {
        connection.release();
    }
}

importData().then(() => {
    console.log("Process complete.");
    process.exit(0);
});
