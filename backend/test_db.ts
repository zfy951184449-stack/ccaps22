import pool from './src/config/database';

async function test() {
    try {
        console.log("Testing query 1...");
        const [batchOpsRows] = await pool.execute(
            `SELECT 
         bop.id, bop.batch_plan_id as batch_id, pbp.batch_code, bop.operation_id, o.operation_name,
         bop.planned_start_datetime as planned_start_time, bop.planned_end_datetime as planned_end_time, bop.required_people, pbp.plan_status as status
       FROM batch_operation_plans bop
       JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
       JOIN operations o ON bop.operation_id = o.id
       WHERE (DATE(bop.planned_start_datetime) BETWEEN ? AND ?)
          OR (DATE(bop.planned_end_datetime) BETWEEN ? AND ?)
          OR pbp.planned_start_date BETWEEN ? AND ?`,
            ['2026-02-01', '2026-02-28', '2026-02-01', '2026-02-28', '2026-02-01', '2026-02-28']
        );
        console.log("Query 1 success");

        console.log("Testing query 2...");
        const [standaloneRows] = await pool.execute(
            `SELECT st.*, ou.unit_name as team_name
       FROM standalone_tasks st
       LEFT JOIN organization_units ou ON st.team_id = ou.id
       WHERE (st.earliest_start BETWEEN ? AND ?)
          OR (st.deadline BETWEEN ? AND ?)
          OR (st.earliest_start <= ? AND st.deadline >= ?)
          OR st.status IN ('PENDING', 'SCHEDULED')`,
            ['2026-02-01', '2026-02-28', '2026-02-01', '2026-02-28', '2026-02-01', '2026-02-28']
        );
        console.log("Query 2 success");

        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}
test();
