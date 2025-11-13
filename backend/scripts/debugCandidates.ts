import 'dotenv/config';
import dayjs from 'dayjs';
import SchedulingService, { AutoPlanRequest } from '../src/services/schedulingService';

async function main() {
  const batchIds = [5];
  const request: AutoPlanRequest = {
    batchIds,
    options: {
      includeBaseRoster: true,
      dryRun: true,
    },
  };

  const service: any = SchedulingService;
  const context = await service.prepareContext(request);
  await service.loadQuarterStandardHours(context);
  await service.loadShiftDefinitions(context);
  await service.loadEmployeeProfiles(context);
  await service.loadEmployeeQualifications(context);
  await service.loadShiftPreferences(context);
  await service.loadLockedShiftPlans(context);
  await service.loadHistoricalWorkload(context);
  await service.loadPreviousAssignments(context);
  await service.loadOperationQualificationRequirements(context);
  await service.loadLockedOperations(context);
  service.buildCandidateProfiles(context);
  await service.generateBaseRoster(context, request.options);

  const qualifiedMap = await service.fetchQualifiedCandidatesForOperations(context);
  context.qualifiedCandidates = qualifiedMap;

  const targetOperationId = 66;
  const operation = context.operations.find(
    (op: any) => op.operationPlanId === targetOperationId,
  );
  if (!operation) {
    console.error(`Operation plan ${targetOperationId} not found in context.`);
    return;
  }

  const planDate = dayjs(operation.plannedStart).format('YYYY-MM-DD');
  const assignmentCount = context.baseRosterIndex.get(planDate)?.length ?? 0;
  const availableHeadcount = service.calculateAvailableHeadcount(context, planDate);
  const { shift, productionHours, overtimeHours } = service.determineShiftForOperation(
    context,
    operation,
  );
  const qualifiedSet = qualifiedMap.get(operation.operationPlanId);
  const candidates = service.findCandidateEmployees(
    context,
    operation,
    shift,
    productionHours,
    overtimeHours,
    qualifiedSet,
  );

  console.log({
    planDate,
    baseAssignments: assignmentCount,
    availableHeadcount,
    productionHours,
    overtimeHours,
    qualifiedSize: qualifiedSet ? qualifiedSet.size : null,
    candidateCount: candidates.length,
    candidateSample: candidates.slice(0, 10),
  });
}

main().catch((error) => {
  console.error('Failed to debug candidates', error);
  process.exit(1);
});
