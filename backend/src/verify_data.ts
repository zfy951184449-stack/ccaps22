import pool from './config/database';

async function verify() {
    try {
        console.log('Verifying table schemas...');

        // 1. Describe Employees
        try {
            const [empSchema] = await pool.execute('DESCRIBE employees');
            console.log('Employees Schema:', empSchema);
        } catch (e) {
            console.error('Error describing employees:', e);
        }

        // 2. Describe Shift Plans
        try {
            const [shiftSchema] = await pool.execute('DESCRIBE employee_shift_plans');
            console.log('Shift Plans Schema:', shiftSchema);
        } catch (e) {
            console.error('Error describing shifts:', e);
        }

    } catch (error) {
        console.error('Global Error:', error);
    } finally {
        process.exit();
    }
}

verify();
