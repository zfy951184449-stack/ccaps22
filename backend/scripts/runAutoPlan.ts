import 'dotenv/config';
import SchedulingService, { AutoPlanRequest } from '../src/services/schedulingService';

async function main() {
  const batchIds = (process.argv[2] || '').split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (!batchIds.length) {
    console.error('Usage: ts-node scripts/runAutoPlan.ts <batchId[,batchId]...>');
    process.exit(1);
  }

  const request: AutoPlanRequest = {
    batchIds,
    options: {
      includeBaseRoster: true,
      dryRun: true,
    },
  };

  try {
    const result = await SchedulingService.autoPlan(request);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Auto-plan failed', error);
    process.exit(1);
  }
}

main();
