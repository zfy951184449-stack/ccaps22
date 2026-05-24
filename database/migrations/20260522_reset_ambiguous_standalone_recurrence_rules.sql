-- Drop obsolete standalone duty templates encoded with the retired recurrence_rule.days field.
-- Scope is intentionally limited to standalone_tasks. Batch plans, shift plans, and solver runs are untouched.
--
-- The old `days` field was ambiguous:
--   WEEKLY interpreted it as weekday 1..7.
--   MONTHLY interpreted it as month day 1..31.
-- New templates must use:
--   WEEKLY:  recurrence_rule.weekdays
--   MONTHLY: recurrence_rule.monthly_mode + month_days / nth_weekday / LAST_DAY

START TRANSACTION;

CREATE TEMPORARY TABLE old_standalone_recurring_templates AS
SELECT id, task_name
FROM standalone_tasks
WHERE task_type = 'RECURRING'
  AND recurrence_rule IS NOT NULL
  AND JSON_CONTAINS_PATH(recurrence_rule, 'one', '$.days');

DELETE generated_instance
FROM standalone_tasks generated_instance
JOIN old_standalone_recurring_templates template
  ON generated_instance.task_type = 'FLEXIBLE'
 AND generated_instance.task_name LIKE CONCAT(template.task_name, ' (%)');

DELETE recurring_template
FROM standalone_tasks recurring_template
JOIN old_standalone_recurring_templates template
  ON recurring_template.id = template.id;

DROP TEMPORARY TABLE old_standalone_recurring_templates;

COMMIT;
