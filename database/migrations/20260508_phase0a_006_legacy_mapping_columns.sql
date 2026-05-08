-- Phase 0A-1 legacy mapping columns.
-- Do not run this file directly in shared environments.
-- Use scripts/phase0a/run_phase0a_migrations.ts, which preflights and skips existing objects.

ALTER TABLE production_batch_plans
  ADD COLUMN product_id BIGINT NULL,
  ADD COLUMN recipe_version_id BIGINT NULL,
  ADD COLUMN campaign_id BIGINT NULL,
  ADD COLUMN recipe_snapshot_id BIGINT NULL,
  ADD COLUMN planning_status ENUM('DRAFT','SCHEDULED','CHECKED','APPROVED','PUBLISHED','ARCHIVED','CANCELLED') NOT NULL DEFAULT 'DRAFT';

CREATE INDEX idx_pbp_product ON production_batch_plans (product_id);
CREATE INDEX idx_pbp_recipe_version ON production_batch_plans (recipe_version_id);
CREATE INDEX idx_pbp_campaign ON production_batch_plans (campaign_id);
CREATE INDEX idx_pbp_recipe_snapshot ON production_batch_plans (recipe_snapshot_id);

ALTER TABLE production_batch_plans
  ADD CONSTRAINT fk_pbp_product FOREIGN KEY (product_id) REFERENCES products(id),
  ADD CONSTRAINT fk_pbp_recipe_version FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id),
  ADD CONSTRAINT fk_pbp_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  ADD CONSTRAINT fk_pbp_recipe_snapshot FOREIGN KEY (recipe_snapshot_id) REFERENCES batch_recipe_snapshots(id);

ALTER TABLE batch_operation_plans
  ADD COLUMN recipe_unit_operation_id BIGINT NULL,
  ADD COLUMN operation_planning_status ENUM('draft','scheduled','running','completed','blocked','infeasible') NOT NULL DEFAULT 'draft';

CREATE INDEX idx_bop_recipe_unit_operation ON batch_operation_plans (recipe_unit_operation_id);
CREATE INDEX idx_bop_operation_planning_status ON batch_operation_plans (operation_planning_status);

ALTER TABLE batch_operation_plans
  ADD CONSTRAINT fk_bop_recipe_unit_operation
  FOREIGN KEY (recipe_unit_operation_id) REFERENCES recipe_unit_operations(id);

ALTER TABLE process_templates
  ADD COLUMN migrated_recipe_version_id BIGINT NULL;

CREATE INDEX idx_process_templates_migrated_recipe ON process_templates (migrated_recipe_version_id);

ALTER TABLE process_templates
  ADD CONSTRAINT fk_process_templates_migrated_recipe
  FOREIGN KEY (migrated_recipe_version_id) REFERENCES recipe_versions(id);

ALTER TABLE stage_operation_schedules
  ADD COLUMN migrated_recipe_unit_operation_id BIGINT NULL;

CREATE INDEX idx_sos_migrated_unit_operation ON stage_operation_schedules (migrated_recipe_unit_operation_id);

ALTER TABLE stage_operation_schedules
  ADD CONSTRAINT fk_sos_migrated_unit_operation
  FOREIGN KEY (migrated_recipe_unit_operation_id) REFERENCES recipe_unit_operations(id);

ALTER TABLE operation_constraints
  ADD COLUMN migrated_operation_dependency_id BIGINT NULL;

CREATE INDEX idx_operation_constraints_migrated_dependency ON operation_constraints (migrated_operation_dependency_id);

ALTER TABLE operation_constraints
  ADD CONSTRAINT fk_operation_constraints_migrated_dependency
  FOREIGN KEY (migrated_operation_dependency_id) REFERENCES operation_dependencies(id);

ALTER TABLE batch_operation_constraints
  ADD COLUMN source_operation_dependency_id BIGINT NULL;

CREATE INDEX idx_batch_constraints_source_dependency ON batch_operation_constraints (source_operation_dependency_id);

ALTER TABLE batch_operation_constraints
  ADD CONSTRAINT fk_batch_constraints_source_dependency
  FOREIGN KEY (source_operation_dependency_id) REFERENCES operation_dependencies(id);
