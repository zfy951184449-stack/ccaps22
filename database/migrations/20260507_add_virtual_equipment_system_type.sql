-- Add VIRTUAL as the third equipment_system_type for resource nodes.
-- VIRTUAL equipment units represent non-physical work stations (manual ops, QA, document review, etc.)
-- that need to appear on the Gantt chart Y-axis but have no physical device.

ALTER TABLE resource_nodes
  MODIFY COLUMN equipment_system_type ENUM('SUS','SS','VIRTUAL') NULL;
