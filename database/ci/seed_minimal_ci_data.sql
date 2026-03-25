USE aps_system;

INSERT INTO employees (id, employee_code, employee_name, department, position, org_role)
VALUES (1, 'E001', 'CI Operator', 'CI', 'Operator', 'FRONTLINE');

INSERT INTO operations (id, operation_code, operation_name, standard_time, required_people, description)
VALUES (1, 'OP-001', 'CI Operation', 2.00, 2, 'Minimal operation for CI integration tests');

INSERT INTO process_templates (id, template_code, template_name, description, total_days)
VALUES (1, 'TPL-001', 'CI Template', 'Minimal process template for CI integration tests', 1);

INSERT INTO process_stages (id, template_id, stage_code, stage_name, stage_order, start_day, description)
VALUES (1, 1, 'STG-001', 'CI Stage', 1, 0, 'Minimal stage for CI integration tests');

INSERT INTO stage_operation_schedules (
    id,
    stage_id,
    operation_id,
    operation_day,
    recommended_time,
    recommended_day_offset,
    window_start_time,
    window_start_day_offset,
    window_end_time,
    window_end_day_offset,
    operation_order
)
VALUES (
    1,
    1,
    1,
    0,
    8.0,
    0,
    7.0,
    0,
    12.0,
    0,
    1
);
