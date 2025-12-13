USE aps_system;

ALTER TABLE shift_definitions
ADD COLUMN is_night_shift TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否夜班';
