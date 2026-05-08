import pool from '../../backend/src/config/database';
import { LegacyBackfillDryRunService } from '../../backend/src/services/aps/LegacyBackfillDryRunService';

async function main(): Promise<void> {
  const report = await LegacyBackfillDryRunService.runDryRun();
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main()
    .then(() => pool.end().then(() => process.exit(0)))
    .catch((error) => {
      console.error(JSON.stringify({
        status: 'FAIL',
        blockers: ['PHASE0A_DRY_RUN_FAILED'],
        warnings: [],
        suggestedActions: [error instanceof Error ? error.message : String(error)],
      }, null, 2));
      pool.end().finally(() => process.exit(1));
    });
}
