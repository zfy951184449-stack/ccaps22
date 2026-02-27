
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const PORT = 3001; // Assuming default backend port

async function verify() {
    try {
        console.log(`Checking API at http://localhost:${PORT}/api/employees...`);
        const response = await axios.get(`http://localhost:${PORT}/api/employees`);
        const employees = response.data;

        if (!Array.isArray(employees) || employees.length === 0) {
            console.log('No employees returned.');
            return;
        }

        const sample = employees.find(e => e.unit_id !== null && e.unit_id !== undefined);

        if (sample) {
            console.log('SUCCESS: Found employee with unit_id!');
            console.log('Sample:', {
                id: sample.id,
                employee_name: sample.employee_name,
                unit_id: sample.unit_id,
                unit_name: sample.unit_name
            });
        } else {
            console.log('WARNING: Employees returned but all have unit_id = null. (This might be valid if DB is empty of new units, but check previous diagnosis)');
            // Check one regardless
            console.log('First employee:', employees[0]);
        }

    } catch (e: any) {
        console.error('API Call Failed:', e.message);
        if (e.response) {
            console.error('Response Data:', JSON.stringify(e.response.data, null, 2));
        }
    }
}

verify();
