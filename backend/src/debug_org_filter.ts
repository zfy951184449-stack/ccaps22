
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function debug() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'aps_system',
    });

    console.log('--- Connected to DB ---');

    // 1. Check USP Unit
    const [units] = await connection.execute('SELECT * FROM organization_units WHERE unit_name LIKE ?', ['%USP%']);
    console.log('\n--- USP Units ---');
    console.table(units);

    // 2. Check Employees with this unit
    if ((units as any[]).length > 0) {
        const usp = (units as any[])[0];
        console.log(`\nChecking employees for USP ID: ${usp.id} (Type: ${usp.unit_type})`);

        // Check department_id match
        const [deptEmps] = await connection.execute(
            'SELECT id, employee_name, department_id, primary_team_id, unit_id FROM employees WHERE department_id = ? LIMIT 5',
            [usp.id]
        );
        console.log(`\nFound ${(deptEmps as any[]).length} employees with department_id = ${usp.id}:`);
        console.table(deptEmps);

        // Check primary_team_id match
        const [teamEmps] = await connection.execute(
            'SELECT id, employee_name, department_id, primary_team_id, unit_id FROM employees WHERE primary_team_id = ? LIMIT 5',
            [usp.id]
        );
        console.log(`\nFound ${(teamEmps as any[]).length} employees with primary_team_id = ${usp.id}:`);
        console.table(teamEmps);

        // Check unit_id match
        const [unitEmps] = await connection.execute(
            'SELECT id, employee_name, department_id, primary_team_id, unit_id FROM employees WHERE unit_id = ? LIMIT 5',
            [usp.id]
        );
        console.log(`\nFound ${(unitEmps as any[]).length} employees with unit_id = ${usp.id}:`);
        console.table(unitEmps);

        // 3. Check Sub-units (if USP has children)
        const [children] = await connection.execute('SELECT * FROM organization_units WHERE parent_id = ?', [usp.id]);
        console.log(`\n--- Children of USP (${(children as any[]).length}) ---`);
        console.table(children);

        if ((children as any[]).length > 0) {
            const childIds = (children as any[]).map((c: any) => c.id);
            console.log(`Checking employees in child units: ${childIds.join(', ')}`);
            // Check if employees are assigned to children
            const [childEmps] = await connection.query(
                `SELECT id, employee_name, department_id, primary_team_id, unit_id FROM employees WHERE primary_team_id IN (?) LIMIT 5`,
                [childIds]
            );
            console.log(`\nFound ${(childEmps as any[]).length} employees in sub-teams:`);
            console.table(childEmps);
        }
    }

    await connection.end();
}

debug().catch(console.error);
