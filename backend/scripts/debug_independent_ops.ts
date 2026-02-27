
import pool from '../src/config/database';

async function inspectIndependentBatch() {
    try {
        console.log('--- Inspecting INDEPENDENT Batch ---');
        const [batchRows] = await pool.execute(
            `SELECT * FROM production_batch_plans WHERE batch_code = 'INDEPENDENT'`
        );
        console.log('Batch Info:', batchRows);

        console.log('\n--- Inspecting Independent Operations ---');
        // Query independent operations based on is_independent flag
        const [opRowsPoints] = await pool.execute(`
      SELECT 
        bop.id,
        bop.batch_plan_id,
        o.operation_name,
        bop.planned_start_datetime,
        bop.planned_end_datetime,
        bop.required_people,
        bop.is_independent,
        bop.generation_group_id
      FROM batch_operation_plans bop
      JOIN operations o ON bop.operation_id = o.id
      WHERE bop.is_independent = 1
      ORDER BY bop.planned_start_datetime
    `);
        console.log(`Found ${Array.isArray(opRowsPoints) ? opRowsPoints.length : 0} operations:`);
        console.table(opRowsPoints);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

inspectIndependentBatch();
