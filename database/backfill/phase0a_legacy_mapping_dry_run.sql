-- Phase 0A-1 read-only legacy mapping dry-run queries.
-- This file must not write to any table.

SELECT
  pt.id AS template_id,
  pt.template_code,
  pt.template_name,
  COUNT(DISTINCT ps.id) AS stage_count,
  COUNT(DISTINCT sos.id) AS operation_count,
  COUNT(DISTINCT oc.id) AS dependency_count
FROM process_templates pt
LEFT JOIN process_stages ps ON ps.template_id = pt.id
LEFT JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
LEFT JOIN operation_constraints oc ON oc.schedule_id = sos.id
GROUP BY pt.id, pt.template_code, pt.template_name;

SELECT
  pbp.id AS batch_plan_id,
  pbp.batch_code,
  pbp.template_id,
  pt.template_code,
  CASE
    WHEN pt.id IS NULL THEN 'BATCH_TEMPLATE_MISSING'
    WHEN pbp.project_code IS NULL OR pbp.project_code = '' THEN 'CAMPAIGN_GROUPING_AMBIGUOUS'
    ELSE 'OK'
  END AS mapping_status
FROM production_batch_plans pbp
LEFT JOIN process_templates pt ON pt.id = pbp.template_id;

SELECT
  oc.id AS operation_constraint_id,
  oc.schedule_id,
  oc.predecessor_schedule_id,
  CASE
    WHEN from_sos.id IS NULL OR to_sos.id IS NULL THEN 'DEPENDENCY_TARGET_MISSING'
    ELSE 'OK'
  END AS mapping_status
FROM operation_constraints oc
LEFT JOIN stage_operation_schedules from_sos ON from_sos.id = oc.predecessor_schedule_id
LEFT JOIN stage_operation_schedules to_sos ON to_sos.id = oc.schedule_id;

SELECT
  sos.id AS schedule_id,
  sos.operation_id,
  COUNT(oqr.id) AS skill_requirement_count,
  SUM(CASE WHEN oqr.qualification_id IS NULL THEN 1 ELSE 0 END) AS unmapped_requirement_count
FROM stage_operation_schedules sos
LEFT JOIN operation_qualification_requirements oqr ON oqr.operation_id = sos.operation_id
GROUP BY sos.id, sos.operation_id;
