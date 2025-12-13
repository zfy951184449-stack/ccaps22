import { pool } from './src/config/database';
import { RowDataPacket } from 'mysql2';

async function findLongShifts() {
    try {
        const query = `
      SELECT * FROM shift_definitions WHERE nominal_hours >= 24;
    `;

        const [rows] = await pool.query<RowDataPacket[]>(query);

        console.log(`Found ${rows.length} suspicious shifts:`);
        console.log(JSON.stringify(rows, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

findLongShifts();
