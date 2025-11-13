import MLSchedulingService from "../src/services/mlSchedulingService";
import type { AutoPlanRequest } from "../src/services/schedulingService";

async function main() {
  const batchIdsArg = process.argv[2];
  if (!batchIdsArg) {
    console.error("Usage: ts-node scripts/runAutoPlanV4.ts <batchId[,batchId]...>");
    process.exit(1);
  }

  const batchIds = batchIdsArg
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (!batchIds.length) {
    console.error("No valid batch IDs provided.");
    process.exit(1);
  }

  const request: AutoPlanRequest = {
    batchIds,
    options: {
      dryRun: true,
    },
  };

  const service = new MLSchedulingService();

  try {
    const result = await service.autoPlanV4(request);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("autoPlanV4 execution failed:", error);
    process.exit(1);
  }
}

main();
