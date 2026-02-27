
import pool from './config/database';

async function debugUnit() {
    try {
        const searchTerm = '周永鹏';
        console.log(`Searching for unit with name like '%${searchTerm}%'...`);

        const [units]: any[] = await pool.query(
            `SELECT * FROM organization_units WHERE unit_name LIKE ?`,
            [`%${searchTerm}%`]
        );

        if (units.length === 0) {
            console.log('No unit found.');
            return;
        }

        const unit = units[0];
        console.log('Unit Found:', unit);

        // Check for employees in this unit (using unit_id)
        const [employeesByUnitId]: any[] = await pool.query(
            `SELECT id, employee_name, unit_id, primary_team_id FROM employees WHERE unit_id = ?`,
            [unit.id]
        );

        console.log(`Employees with unit_id = ${unit.id}:`, employeesByUnitId.length);
        if (employeesByUnitId.length > 0) {
            console.log(employeesByUnitId);
        }

        // Check for employees using legacy team_id if applicable
        if (unit.unit_type === 'TEAM') {
            // Find legacy team id
            const [teams]: any[] = await pool.query(
                `SELECT * FROM teams WHERE team_code = ?`,
                [unit.unit_code]
            );
            if (teams.length > 0) {
                const team = teams[0];
                console.log('Legacy Team Found:', team);
                const [employeesByLegacy]: any[] = await pool.query(
                    `SELECT id, employee_name, unit_id, primary_team_id FROM employees WHERE primary_team_id = ?`,
                    [team.id]
                );
                console.log(`Employees with primary_team_id = ${team.id}:`, employeesByLegacy.length);
            }
        }


        // Check Leader Info
        const leaderId = 66; // From metadata
        const [leader]: any[] = await pool.query(`SELECT * FROM employees WHERE id = ?`, [leaderId]);
        console.log('Leader Info:', leader[0] ? { id: leader[0].id, name: leader[0].employee_name } : 'Not Found');

        // Check Subordinates
        const [subordinates]: any[] = await pool.query(
            `SELECT e.id, e.employee_name, e.unit_id 
             FROM employee_reporting_relations r
             JOIN employees e ON e.id = r.subordinate_id
             WHERE r.leader_id = ?`,
            [leaderId]
        );
        console.log(`Subordinates of Leader ${leaderId}:`, subordinates.length);
        if (subordinates.length > 0) {
            console.log(subordinates);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

debugUnit();
