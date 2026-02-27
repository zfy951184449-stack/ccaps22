
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const roles = [
        { id: 1, role_code: 'FRONTLINE', role_name: 'Frontline Operator', can_schedule: true },
        { id: 2, role_code: 'SHIFT_LEADER', role_name: 'Shift Leader', can_schedule: true },
        { id: 3, role_code: 'GROUP_LEADER', role_name: 'Group Leader', can_schedule: true },
        { id: 4, role_code: 'DEPT_MANAGER', role_name: 'Department Manager', can_schedule: false },
    ];

    for (const role of roles) {
        await prisma.employee_roles.upsert({
            where: { id: role.id },
            update: role,
            create: role,
        });
    }

    console.log('Seeded roles successfully.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
