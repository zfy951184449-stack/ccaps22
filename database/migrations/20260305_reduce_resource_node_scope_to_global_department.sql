-- Narrow resource_nodes.node_scope from GLOBAL/DEPARTMENT/TEAM to GLOBAL/DEPARTMENT.
-- TEAM rows are merged into DEPARTMENT scope.

UPDATE resource_nodes rn
LEFT JOIN resources r ON r.id = rn.bound_resource_id
SET rn.node_scope = 'DEPARTMENT',
    rn.department_code = COALESCE(rn.department_code, r.department_code, 'USP'),
    rn.owner_org_unit_id = NULL
WHERE rn.node_scope = 'TEAM';

UPDATE resource_nodes
SET department_code = 'USP'
WHERE node_scope = 'DEPARTMENT' AND department_code IS NULL;

UPDATE resource_nodes
SET department_code = NULL,
    owner_org_unit_id = NULL
WHERE node_scope = 'GLOBAL';

ALTER TABLE resource_nodes
  MODIFY COLUMN node_scope ENUM('GLOBAL', 'DEPARTMENT') NOT NULL DEFAULT 'DEPARTMENT';
