/**
 * 检查最近一次求解结果，查找操作超额分配的情况
 */

import { AppDataSource } from './src/data-source';
import { OperationPlan } from './src/entities/OperationPlan';
import { ShiftPlan } from './src/entities/ShiftPlan';
import { SharedPreference } from './src/entities/SharedPreference';

interface AssignmentInfo {
    operationPlanId: number;
    requiredPeople: number;
    assignedPeople: number;
    assignments: Array<{ employeeId: number; date: string }>;
}

async function checkOperationAssignments() {
    await AppDataSource.initialize();

    try {
        const operationRepo = AppDataSource.getRepository(OperationPlan);
        const shiftPlanRepo = AppDataSource.getRepository(ShiftPlan);
        const sharedPrefRepo = AppDataSource.getRepository(SharedPreference);

        // 获取所有操作需求（最近的批次）
        const operations = await operationRepo.find({
            order: { createdAt: 'DESC' },
            take: 1000 // 获取最近的操作
        });

        if (operations.length === 0) {
            console.log('未找到操作记录');
            return;
        }

        // 找到最新的批次ID
        const latestBatchId = operations[0].batchId;
        console.log(`\n分析批次 ${latestBatchId} 的求解结果\n`);

        // 获取该批次的所有操作
        const batchOperations = operations.filter(op => op.batchId === latestBatchId);

        // 建立操作ID -> 需求人数的映射
        const operationRequirements = new Map<number, number>();
        batchOperations.forEach(op => {
            operationRequirements.set(op.id, op.requiredPeople || 1);
        });

        // 获取该批次的班次计划（包含操作分配）
        const shiftPlans = await shiftPlanRepo.find({
            where: { batchId: latestBatchId },
            relations: ['operations']
        });

        // 统计每个操作实际分配的人数
        const operationAssignments = new Map<number, Array<{ employeeId: number; date: string }>>();

        for (const plan of shiftPlans) {
            if (plan.operations && plan.operations.length > 0) {
                for (const op of plan.operations) {
                    if (!operationAssignments.has(op.id)) {
                        operationAssignments.set(op.id, []);
                    }
                    operationAssignments.get(op.id)!.push({
                        employeeId: plan.employeeId,
                        date: plan.date
                    });
                }
            }
        }

        // 检查超额分配
        const overAllocated: AssignmentInfo[] = [];

        for (const [opId, assignments] of operationAssignments.entries()) {
            const required = operationRequirements.get(opId) || 1;
            const assigned = assignments.length;

            if (assigned > required) {
                overAllocated.push({
                    operationPlanId: opId,
                    requiredPeople: required,
                    assignedPeople: assigned,
                    assignments
                });
            }
        }

        // 输出结果
        console.log('='.repeat(80));
        console.log('操作分配分析报告');
        console.log('='.repeat(80));

        console.log(`\n总操作数: ${batchOperations.length}`);
        console.log(`已分配操作数: ${operationAssignments.size}`);
        console.log(`超额分配操作数: ${overAllocated.length}`);

        if (overAllocated.length > 0) {
            console.log('\n❌ 发现超额分配的操作:');
            console.log('-'.repeat(80));

            for (const item of overAllocated) {
                console.log(`\n操作ID: ${item.operationPlanId}`);
                console.log(`  需要人数: ${item.requiredPeople}`);
                console.log(`  实际分配: ${item.assignedPeople} 人`);
                console.log(`  详细分配:`);

                for (const assignment of item.assignments) {
                    console.log(`    - 员工 ${assignment.employeeId} 在 ${assignment.date}`);
                }
            }
        } else {
            console.log('\n✅ 未发现超额分配的操作');
        }

        // 检查共享组
        const sharedGroups = await sharedPrefRepo.find({
            where: { batchId: latestBatchId },
            relations: ['members']
        });

        if (sharedGroups.length > 0) {
            console.log('\n' + '='.repeat(80));
            console.log('共享组分析 (同一共享组内的操作可以由不同员工执行)');
            console.log('='.repeat(80));

            for (const group of sharedGroups) {
                console.log(`\n共享组 ${group.shareGroupId}:`);

                let totalRequired = 0;
                let totalAssigned = 0;

                if (group.members) {
                    for (const member of group.members) {
                        const opId = member.operationPlanId;
                        const required = member.requiredPeople || 1;
                        const assignments = operationAssignments.get(opId) || [];
                        const assigned = assignments.length;

                        totalRequired += required;
                        totalAssigned += assigned;

                        console.log(`  操作 ${opId}: 需要 ${required} 人, 分配 ${assigned} 人`);
                    }
                }

                console.log(`  共享组总计: 需要 ${totalRequired} 人, 分配 ${totalAssigned} 人`);

                if (totalAssigned > totalRequired) {
                    console.log(`  ⚠️  共享组超额分配 ${totalAssigned - totalRequired} 人`);
                }
            }
        }

        console.log('\n' + '='.repeat(80));

    } finally {
        await AppDataSource.destroy();
    }
}

checkOperationAssignments().catch(console.error);
