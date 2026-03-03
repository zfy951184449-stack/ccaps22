import dotenv from 'dotenv';
import pool from '../config/database';
import ShiftPlanLinkService from '../services/shiftPlanLinkService';

dotenv.config();

const parseArgs = () => {
  const args = process.argv.slice(2);
  let runId: number | undefined;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--run-id') {
      const nextValue = args[index + 1];
      if (!nextValue) {
        throw new Error('--run-id requires a value');
      }
      runId = Number(nextValue);
      if (!Number.isFinite(runId) || runId <= 0) {
        throw new Error(`Invalid --run-id value: ${nextValue}`);
      }
      index += 1;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { runId, dryRun };
};

async function main() {
  const { runId, dryRun } = parseArgs();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const result = await ShiftPlanLinkService.backfillMissingShiftPlanLinks(connection, {
      runId,
      dryRun,
    });

    if (dryRun) {
      await connection.rollback();
    } else {
      await connection.commit();
    }

    console.log(
      JSON.stringify(
        {
          runId: runId ?? null,
          dryRun,
          ...result,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await connection.rollback();
    console.error('Failed to backfill shift_plan_id links:', error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Unexpected backfill failure:', error);
  process.exitCode = 1;
});
