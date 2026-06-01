-- Backfill operation type/team ownership so /operations team tabs and API ownership match.
-- Idempotent for the current aps_system schema.

START TRANSACTION;

SET @media_team_id := (SELECT id FROM organization_units WHERE unit_code = 'MEDIA' LIMIT 1);
SET @buffer_team_id := (SELECT id FROM organization_units WHERE unit_code = 'SPI' LIMIT 1);

-- MEDIA_PREP previously existed under Buffer/SPI but has no current operation usage.
-- Move it to the Media team so Media template operations are visible in the Media tab.
UPDATE operation_types
SET team_id = @media_team_id,
    type_name = '培养基配制',
    category = 'PREP'
WHERE type_code = 'MEDIA_PREP'
  AND @media_team_id IS NOT NULL;

INSERT INTO operation_types (type_code, type_name, team_id, color, category, display_order)
SELECT 'MEDIA_PREP', '培养基配制', @media_team_id, '#40a9ff', 'PREP', 1
WHERE @media_team_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM operation_types WHERE type_code = 'MEDIA_PREP');

INSERT INTO operation_types (type_code, type_name, team_id, color, category, display_order)
SELECT 'MEDIA_EQUIP_CLEAN', 'Media设备清洗/灭菌', @media_team_id, '#8c8c8c', 'PREP', 2
WHERE @media_team_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM operation_types WHERE type_code = 'MEDIA_EQUIP_CLEAN');

INSERT INTO operation_types (type_code, type_name, team_id, color, category, display_order)
SELECT 'SPI_CIP', 'CIP', @buffer_team_id, '#8c8c8c', 'PREP', 20
WHERE @buffer_team_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM operation_types WHERE type_code = 'SPI_CIP');

INSERT INTO operation_types (type_code, type_name, team_id, color, category, display_order)
SELECT 'SPI_SIP', 'SIP', @buffer_team_id, '#595959', 'PREP', 21
WHERE @buffer_team_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM operation_types WHERE type_code = 'SPI_SIP');

INSERT INTO operation_types (type_code, type_name, team_id, color, category, display_order)
SELECT 'SPI_RIP', 'RIP', @buffer_team_id, '#434343', 'PREP', 22
WHERE @buffer_team_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM operation_types WHERE type_code = 'SPI_RIP');

SET @media_prep_type_id := (SELECT id FROM operation_types WHERE type_code = 'MEDIA_PREP' LIMIT 1);
SET @media_clean_type_id := (SELECT id FROM operation_types WHERE type_code = 'MEDIA_EQUIP_CLEAN' LIMIT 1);
SET @buffer_prep_type_id := (SELECT id FROM operation_types WHERE type_code = 'BUFFER_PREP' LIMIT 1);
SET @spi_cip_type_id := (SELECT id FROM operation_types WHERE type_code = 'SPI_CIP' LIMIT 1);
SET @spi_sip_type_id := (SELECT id FROM operation_types WHERE type_code = 'SPI_SIP' LIMIT 1);
SET @spi_rip_type_id := (SELECT id FROM operation_types WHERE type_code = 'SPI_RIP' LIMIT 1);
SET @dsp_all_type_id := (SELECT id FROM operation_types WHERE type_code = 'DSP_ALL' LIMIT 1);
SET @dsp_ac_vin_type_id := (SELECT id FROM operation_types WHERE type_code = 'AC_VIN' LIMIT 1);
SET @dsp_cex_type_id := (SELECT id FROM operation_types WHERE type_code = 'CEX' LIMIT 1);
SET @dsp_ufdf_type_id := (SELECT id FROM operation_types WHERE type_code = 'UFDF' LIMIT 1);
SET @dsp_aex_type_id := (SELECT id FROM operation_types WHERE type_code = 'AEX' LIMIT 1);
SET @dsp_ha_type_id := (SELECT id FROM operation_types WHERE type_code = 'HA' LIMIT 1);

-- Make legacy code-backed records visible to the /operations team filters.
UPDATE operations o
JOIN operation_types ot
  ON o.operation_type COLLATE utf8mb4_unicode_ci = ot.type_code
SET o.operation_type_id = ot.id
WHERE o.operation_type_id IS NULL
  AND o.operation_type IS NOT NULL;

-- Media WBP2486 template-owned operations.
UPDATE operations o
JOIN (
  SELECT DISTINCT sos.operation_id
  FROM stage_operation_schedules sos
  JOIN process_stages ps ON ps.id = sos.stage_id
  WHERE ps.template_id = 15
) media_ops ON media_ops.operation_id = o.id
SET o.operation_type_id = CASE
  WHEN o.operation_name REGEXP 'CIP|SIP|RIP|WFI' OR o.operation_code REGEXP 'CIP|SIP|RIP|WFI'
    THEN @media_clean_type_id
  ELSE @media_prep_type_id
END
WHERE o.operation_type_id IS NULL;

-- Buffer/SPI template-owned operations.
UPDATE operations o
JOIN (
  SELECT DISTINCT sos.operation_id
  FROM stage_operation_schedules sos
  JOIN process_stages ps ON ps.id = sos.stage_id
  WHERE ps.template_id = 16
) buffer_ops ON buffer_ops.operation_id = o.id
SET o.operation_type_id = CASE
  WHEN o.operation_name REGEXP 'SIP' OR o.operation_code REGEXP 'SIP' THEN @spi_sip_type_id
  WHEN o.operation_name REGEXP 'RIP|WFI' OR o.operation_code REGEXP 'RIP|WFI' THEN @spi_rip_type_id
  WHEN o.operation_name REGEXP 'CIP' OR o.operation_code REGEXP 'CIP' THEN @spi_cip_type_id
  ELSE @buffer_prep_type_id
END
WHERE o.operation_type_id IS NULL;

-- DSP test-run template operations.
UPDATE operations o
JOIN (
  SELECT DISTINCT sos.operation_id
  FROM stage_operation_schedules sos
  JOIN process_stages ps ON ps.id = sos.stage_id
  WHERE ps.template_id = 26
) dsp_ops ON dsp_ops.operation_id = o.id
SET o.operation_type_id = CASE
  WHEN o.operation_name REGEXP 'CEX' THEN @dsp_cex_type_id
  WHEN o.operation_name REGEXP 'UFDF|UF/DF' THEN @dsp_ufdf_type_id
  WHEN o.operation_name REGEXP 'AEX' THEN @dsp_aex_type_id
  WHEN o.operation_name REGEXP 'HA' THEN @dsp_ha_type_id
  WHEN o.operation_name REGEXP 'AC|VIN' THEN @dsp_ac_vin_type_id
  ELSE @dsp_all_type_id
END
WHERE o.operation_type_id IS NULL;

-- Two standalone legacy records adjacent to the DSP AC/VIN import block.
UPDATE operations
SET operation_type_id = @dsp_ac_vin_type_id
WHERE operation_code = 'OP-00129'
  AND operation_type_id IS NULL;

UPDATE operations
SET operation_type_id = @dsp_all_type_id
WHERE operation_code = 'OP-00130'
  AND operation_type_id IS NULL;

COMMIT;
