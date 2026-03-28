import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const { mockConnection } = vi.hoisted(() => ({
  mockConnection: {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    execute: vi.fn(),
    release: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: {
    execute: vi.fn(),
    getConnection: vi.fn().mockResolvedValue(mockConnection),
  },
}));

import app from '../server';
import pool from '../config/database';

const mockPool = pool as unknown as {
  execute: ReturnType<typeof vi.fn>;
  getConnection: ReturnType<typeof vi.fn>;
};

describe('V3 Bioprocess Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.getConnection.mockResolvedValue(mockConnection);
  });

  it('lists V3 templates for the new sandbox route', async () => {
    mockPool.execute.mockImplementation(async (query: string) => {
      if (query.includes('FROM `aps_system_v3`.`v3_templates` t')) {
        return [[{
          id: 1,
          template_code: 'USP_UPSTREAM_CULTURE_V3',
          template_name: 'USP 上游细胞培养 V3 试点',
          domain_code: 'USP',
          equipment_mode_scope: 'MIXED',
          description: 'demo',
          node_count: 5,
          trigger_rule_count: 5,
          package_count: 3,
          main_equipment_codes: 'SUS-SEED-01,SUS-BR-01,SS-HARV-01',
        }], []];
      }

      return [[], []];
    });

    const response = await request(app).get('/api/v3/bioprocess/templates');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].template_code).toBe('USP_UPSTREAM_CULTURE_V3');
    expect(response.body.data[0].main_equipment_codes).toEqual([
      'SUS-SEED-01',
      'SUS-BR-01',
      'SS-HARV-01',
    ]);
  });

  it('syncs trimmed legacy master data into V3 mirror tables', async () => {
    mockConnection.execute.mockImplementation(async (query: string) => {
      if (query.includes('INSERT INTO `aps_system_v3`.`v3_master_sync_runs`')) {
        return [{ insertId: 7, affectedRows: 1 }, []];
      }
      if (query.startsWith('DELETE FROM `aps_system_v3`.`v3_master_')) {
        return [{ affectedRows: 0 }, []];
      }
      if (query.includes('INSERT INTO `aps_system_v3`.`v3_master_organization_units`')) {
        return [{ affectedRows: 3 }, []];
      }
      if (query.includes('INSERT INTO `aps_system_v3`.`v3_master_resources`')) {
        return [{ affectedRows: 4 }, []];
      }
      if (query.includes('INSERT INTO `aps_system_v3`.`v3_master_resource_nodes`')) {
        return [{ affectedRows: 4 }, []];
      }
      if (query.includes('INSERT INTO `aps_system_v3`.`v3_master_maintenance_windows`')) {
        return [{ affectedRows: 2 }, []];
      }
      if (query.includes('INSERT INTO `aps_system_v3`.`v3_master_resource_assignments`')) {
        return [{ affectedRows: 5 }, []];
      }
      if (query.includes('INSERT INTO `aps_system_v3`.`v3_master_template_binding_summaries`')) {
        return [{ affectedRows: 4 }, []];
      }
      if (query.includes('INSERT INTO `aps_system_v3`.`v3_master_resource_rule_summaries`')) {
        return [{ affectedRows: 6 }, []];
      }
      if (query.includes('UPDATE `aps_system_v3`.`v3_master_sync_runs`')) {
        return [{ affectedRows: 1 }, []];
      }

      return [{ affectedRows: 0 }, []];
    });

    mockPool.execute.mockImplementation(async (query: string) => {
      if (query.includes('FROM `aps_system_v3`.`v3_master_sync_runs`')) {
        return [[{
          id: 7,
          status: 'SUCCESS',
          started_at: '2026-03-27 09:00:00',
          finished_at: '2026-03-27 09:01:00',
          summary: JSON.stringify({
            organization_units: 3,
            resources: 4,
            resource_nodes: 4,
            maintenance_windows: 2,
            resource_assignments: 5,
            template_bindings: 4,
            resource_rules: 6,
          }),
          error_message: null,
        }], []];
      }

      return [[], []];
    });

    const response = await request(app).post('/api/v3/bioprocess/master-data/sync');

    expect(response.status).toBe(201);
    expect(response.body.last_sync_id).toBe(7);
    expect(response.body.status).toBe('SUCCESS');
    expect(response.body.synced_counts.resources).toBe(4);
    expect(mockConnection.beginTransaction).toHaveBeenCalled();
    expect(mockConnection.commit).toHaveBeenCalled();
  });

  it('previews an upstream culture template with package-driven setup and trigger-driven sampling/feed', async () => {
    mockPool.execute.mockImplementation(async (query: string) => {
      if (query.includes('WHERE t.id = ?')) {
        return [[{
          id: 1,
          template_code: 'USP_UPSTREAM_CULTURE_V3',
          template_name: 'USP 上游细胞培养 V3 试点',
          domain_code: 'USP',
          equipment_mode_scope: 'MIXED',
          description: 'demo',
          node_count: 5,
          trigger_rule_count: 5,
          package_count: 3,
          main_equipment_codes: 'SUS-SEED-01,SUS-BR-01,SS-HARV-01',
        }], []];
      }

      if (query.includes('FROM `aps_system_v3`.`v3_main_flow_nodes`')) {
        return [[
          {
            id: 11,
            template_id: 1,
            node_key: 'CELL_THAW',
            semantic_key: 'CELL_THAW',
            display_name: '细胞复苏',
            phase_code: 'USP',
            equipment_mode: 'SUS',
            default_duration_minutes: 60,
            sequence_order: 1,
            default_equipment_code: 'SUS-SEED-01',
            default_material_code: null,
            metadata: JSON.stringify({}),
          },
          {
            id: 12,
            template_id: 1,
            node_key: 'INOCULATION',
            semantic_key: 'INOCULATION',
            display_name: '接种',
            phase_code: 'USP',
            equipment_mode: 'SUS',
            default_duration_minutes: 120,
            sequence_order: 2,
            default_equipment_code: 'SUS-BR-01',
            default_material_code: null,
            metadata: JSON.stringify({}),
          },
          {
            id: 13,
            template_id: 1,
            node_key: 'CELL_CULTURE',
            semantic_key: 'CELL_CULTURE',
            display_name: '细胞培养',
            phase_code: 'USP',
            equipment_mode: 'SUS',
            default_duration_minutes: 2880,
            sequence_order: 3,
            default_equipment_code: 'SUS-BR-01',
            default_material_code: 'MEDIA-A',
            metadata: JSON.stringify({}),
          },
          {
            id: 14,
            template_id: 1,
            node_key: 'PASSAGE',
            semantic_key: 'PASSAGE',
            display_name: '转种',
            phase_code: 'USP',
            equipment_mode: 'SUS',
            default_duration_minutes: 120,
            sequence_order: 4,
            default_equipment_code: 'SUS-BR-01',
            default_material_code: null,
            metadata: JSON.stringify({}),
          },
        ], []];
      }

      if (query.includes('FROM `aps_system_v3`.`v3_main_flow_edges`')) {
        return [[
          {
            predecessor_node_id: 11,
            successor_node_id: 12,
            relationship_type: 'FINISH_START',
            min_offset_minutes: 60,
          },
          {
            predecessor_node_id: 12,
            successor_node_id: 13,
            relationship_type: 'FINISH_START',
            min_offset_minutes: 0,
          },
          {
            predecessor_node_id: 13,
            successor_node_id: 14,
            relationship_type: 'FINISH_START',
            min_offset_minutes: 0,
          },
        ], []];
      }

      if (query.includes('FROM `aps_system_v3`.`v3_trigger_rules`')) {
        return [[
          {
            id: 101,
            template_id: 1,
            rule_code: 'USP_SETUP_BEFORE_CULTURE',
            target_node_id: 13,
            anchor_mode: 'NODE_START',
            anchor_ref_code: null,
            trigger_mode: 'PACKAGE_BEFORE_START',
            operation_code: null,
            operation_name: null,
            operation_role: 'AUXILIARY',
            default_duration_minutes: 0,
            earliest_offset_minutes: null,
            recommended_offset_minutes: null,
            latest_offset_minutes: null,
            repeat_every_minutes: null,
            repeat_until_node_id: null,
            dependency_rule_code: null,
            generator_package_id: 201,
            target_equipment_state: 'setup',
            target_material_state: null,
            is_blocking: 1,
            sort_order: 10,
            metadata: JSON.stringify({}),
          },
          {
            id: 102,
            template_id: 1,
            rule_code: 'USP_MEDIA_FILL_BEFORE_CULTURE',
            target_node_id: 13,
            anchor_mode: 'NODE_START',
            anchor_ref_code: null,
            trigger_mode: 'PACKAGE_BEFORE_START',
            operation_code: null,
            operation_name: null,
            operation_role: 'AUXILIARY',
            default_duration_minutes: 0,
            earliest_offset_minutes: null,
            recommended_offset_minutes: null,
            latest_offset_minutes: null,
            repeat_every_minutes: null,
            repeat_until_node_id: null,
            dependency_rule_code: null,
            generator_package_id: 202,
            target_equipment_state: 'media_holding',
            target_material_state: 'in_hold',
            is_blocking: 1,
            sort_order: 20,
            metadata: JSON.stringify({ hold_window_hours: 24 }),
          },
          {
            id: 103,
            template_id: 1,
            rule_code: 'USP_FIRST_SAMPLE',
            target_node_id: 11,
            anchor_mode: 'NODE_START',
            anchor_ref_code: null,
            trigger_mode: 'WINDOW',
            operation_code: 'USP-SAMPLE-FIRST',
            operation_name: '首次取样',
            operation_role: 'AUXILIARY',
            default_duration_minutes: 20,
            earliest_offset_minutes: 0,
            recommended_offset_minutes: 60,
            latest_offset_minutes: 120,
            repeat_every_minutes: null,
            repeat_until_node_id: null,
            dependency_rule_code: null,
            generator_package_id: null,
            target_equipment_state: null,
            target_material_state: null,
            is_blocking: 0,
            sort_order: 30,
            metadata: JSON.stringify({}),
          },
          {
            id: 104,
            template_id: 1,
            rule_code: 'USP_DAILY_SAMPLE',
            target_node_id: 12,
            anchor_mode: 'NODE_END',
            anchor_ref_code: null,
            trigger_mode: 'RECURRING_WINDOW',
            operation_code: 'USP-SAMPLE-DAILY',
            operation_name: '日常取样',
            operation_role: 'AUXILIARY',
            default_duration_minutes: 20,
            earliest_offset_minutes: 960,
            recommended_offset_minutes: 1440,
            latest_offset_minutes: 1920,
            repeat_every_minutes: 1440,
            repeat_until_node_id: 14,
            dependency_rule_code: null,
            generator_package_id: null,
            target_equipment_state: null,
            target_material_state: null,
            is_blocking: 0,
            sort_order: 40,
            metadata: JSON.stringify({}),
          },
          {
            id: 105,
            template_id: 1,
            rule_code: 'USP_FEED_AFTER_SAMPLE',
            target_node_id: 13,
            anchor_mode: 'RULE_END',
            anchor_ref_code: 'USP_DAILY_SAMPLE',
            trigger_mode: 'FOLLOW_DEPENDENCY',
            operation_code: 'USP-FEED',
            operation_name: '补料',
            operation_role: 'AUXILIARY',
            default_duration_minutes: 45,
            earliest_offset_minutes: 30,
            recommended_offset_minutes: 60,
            latest_offset_minutes: 180,
            repeat_every_minutes: null,
            repeat_until_node_id: null,
            dependency_rule_code: 'USP_DAILY_SAMPLE',
            generator_package_id: null,
            target_equipment_state: null,
            target_material_state: null,
            is_blocking: 0,
            sort_order: 50,
            metadata: JSON.stringify({}),
          },
        ], []];
      }

      if (query.includes('FROM `aps_system_v3`.`v3_operation_packages`')) {
        return [[
          {
            id: 201,
            template_id: null,
            package_code: 'SUS_BIOREACTOR_SETUP',
            package_name: 'setup',
            package_type: 'SETUP',
            target_entity_type: 'EQUIPMENT',
            equipment_mode: 'SUS',
            description: null,
            is_reusable: 1,
            metadata: JSON.stringify({}),
          },
          {
            id: 202,
            template_id: null,
            package_code: 'MEDIA_FILL_PACKAGE',
            package_name: 'media fill',
            package_type: 'MEDIA_FILL',
            target_entity_type: 'MATERIAL',
            equipment_mode: 'SUS',
            description: null,
            is_reusable: 1,
            metadata: JSON.stringify({}),
          },
        ], []];
      }

      if (query.includes('FROM `aps_system_v3`.`v3_operation_package_members`')) {
        return [[
          {
            id: 301,
            package_id: 201,
            member_code: 'BAG_INSTALL',
            operation_code: 'SUS-BAG-INSTALL',
            operation_name: '反应袋安装',
            member_order: 1,
            relative_day_offset: -2,
            relative_minute_offset: 540,
            duration_minutes: 120,
            predecessor_member_id: null,
            target_equipment_state: 'setup',
            target_material_state: null,
            metadata: JSON.stringify({}),
          },
          {
            id: 302,
            package_id: 201,
            member_code: 'PRESSURE_TEST',
            operation_code: 'SUS-PRESSURE-TEST',
            operation_name: '保压测试',
            member_order: 2,
            relative_day_offset: -1,
            relative_minute_offset: 480,
            duration_minutes: 90,
            predecessor_member_id: 301,
            target_equipment_state: 'setup',
            target_material_state: null,
            metadata: JSON.stringify({}),
          },
          {
            id: 303,
            package_id: 202,
            member_code: 'MEDIA_CHARGE',
            operation_code: 'MEDIA-CHARGE',
            operation_name: '培养基灌注',
            member_order: 1,
            relative_day_offset: -1,
            relative_minute_offset: 900,
            duration_minutes: 180,
            predecessor_member_id: null,
            target_equipment_state: 'media_holding',
            target_material_state: 'prepared',
            metadata: JSON.stringify({}),
          },
          {
            id: 304,
            package_id: 202,
            member_code: 'MEDIA_HOLD_RELEASE',
            operation_code: 'MEDIA-HOLD-RELEASE',
            operation_name: '培养基保温确认',
            member_order: 2,
            relative_day_offset: -1,
            relative_minute_offset: 1140,
            duration_minutes: 30,
            predecessor_member_id: 303,
            target_equipment_state: 'media_holding',
            target_material_state: 'in_hold',
            metadata: JSON.stringify({}),
          },
        ], []];
      }

      if (query.includes('FROM `aps_system_v3`.`v3_master_resources`')) {
        return [[
          {
            resource_code: 'SUS-SEED-01',
            resource_name: 'Seed Train 01',
            department_code: 'USP',
            metadata: JSON.stringify({}),
          },
          {
            resource_code: 'SUS-BR-01',
            resource_name: 'Bioreactor 01',
            department_code: 'USP',
            metadata: JSON.stringify({}),
          },
        ], []];
      }

      if (query.includes('FROM `aps_system_v3`.`v3_master_maintenance_windows`')) {
        return [[], []];
      }

      if (query.includes('FROM `aps_system_v3`.`v3_master_resource_assignments`')) {
        return [[], []];
      }

      if (query.includes('FROM `aps_system_v3`.`v3_master_sync_runs`')) {
        return [[{
          id: 12,
          status: 'SUCCESS',
          started_at: '2026-03-27 08:00:00',
          finished_at: '2026-03-27 08:01:00',
          summary: JSON.stringify({ resources: 2 }),
          error_message: null,
        }], []];
      }

      return [[], []];
    });

    const response = await request(app)
      .post('/api/v3/bioprocess/projections/preview')
      .send({
        template_id: 1,
        planned_start_datetime: '2026-03-27 08:00:00',
        horizon_days: 6,
        persist_run: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.template.template_code).toBe('USP_UPSTREAM_CULTURE_V3');
    expect(response.body.zoom_presets.minimum_snap_minutes).toBe(5);
    expect(response.body.rows.some((row: { equipment_code: string }) => row.equipment_code === 'SUS-BR-01')).toBe(true);
    expect(
      response.body.rows.flatMap(
        (row: { aux_operations: Array<{ operation_name: string }> }) =>
          row.aux_operations.map((operation) => operation.operation_name),
      ),
    ).toEqual(
      expect.arrayContaining(['反应袋安装', '培养基灌注', '首次取样', '日常取样', '补料']),
    );
    expect(
      response.body.rows.flatMap(
        (row: { state_segments: Array<{ state_code: string }> }) =>
          row.state_segments.map((segment) => segment.state_code),
      ),
    ).toEqual(expect.arrayContaining(['processing', 'setup', 'media_holding']));
    expect(response.body.sync_snapshot.last_sync_status).toBe('SUCCESS');
  });

  it('falls back to embedded templates and fallback sync status when V3 schema is unavailable', async () => {
    mockPool.execute.mockImplementation(async (query: string) => {
      if (
        query.includes('`aps_system_v3`.`v3_templates`')
        || query.includes('`aps_system_v3`.`v3_master_sync_runs`')
      ) {
        const error = new Error('Missing V3 schema') as Error & { code?: string };
        error.code = 'ER_BAD_DB_ERROR';
        throw error;
      }

      return [[], []];
    });

    const [templatesResponse, syncStatusResponse] = await Promise.all([
      request(app).get('/api/v3/bioprocess/templates'),
      request(app).get('/api/v3/bioprocess/master-data/sync-status'),
    ]);

    expect(templatesResponse.status).toBe(200);
    expect(templatesResponse.body.data).toHaveLength(3);
    expect(templatesResponse.body.data[0].template_code).toBe('USP_UPSTREAM_CULTURE_V3');

    expect(syncStatusResponse.status).toBe(200);
    expect(syncStatusResponse.body.storage_mode).toBe('fallback');
    expect(syncStatusResponse.body.status).toBeNull();
  });

  it('loads template detail from embedded fallback data when V3 schema is unavailable', async () => {
    mockPool.execute.mockImplementation(async (query: string) => {
      if (query.includes('`aps_system_v3`.`v3_templates`')) {
        const error = new Error('Missing V3 schema') as Error & { code?: string };
        error.code = 'ER_BAD_DB_ERROR';
        throw error;
      }

      return [[], []];
    });

    const response = await request(app).get('/api/v3/bioprocess/templates/1');

    expect(response.status).toBe(200);
    expect(response.body.storage_mode).toBe('fallback');
    expect(response.body.nodes.some((node: { node_key: string }) => node.node_key === 'CELL_CULTURE')).toBe(true);
    expect(response.body.rules.some((rule: { rule_code: string }) => rule.rule_code === 'USP_DAILY_SAMPLE')).toBe(true);
  });

  it('previews fallback template data with draft states, pinned equipment rows and maintenance conflicts', async () => {
    mockPool.execute.mockImplementation(async (query: string) => {
      if (
        query.includes('`aps_system_v3`.`v3_templates`')
        || query.includes('`aps_system_v3`.`v3_master_sync_runs`')
        || query.includes('`aps_system_v3`.`v3_master_resources`')
        || query.includes('`aps_system_v3`.`v3_master_maintenance_windows`')
        || query.includes('`aps_system_v3`.`v3_master_resource_assignments`')
      ) {
        const error = new Error('Missing V3 schema') as Error & { code?: string };
        error.code = 'ER_BAD_DB_ERROR';
        throw error;
      }

      if (
        query.includes('FROM `aps_system`.`resources`')
        && !query.includes('JOIN')
      ) {
        return [[
          {
            resource_code: 'SUS-SEED-01',
            resource_name: 'Seed Reactor 01',
            department_code: 'USP',
            metadata: JSON.stringify({}),
          },
          {
            resource_code: 'SUS-BR-01',
            resource_name: 'Bioreactor 01',
            department_code: 'USP',
            metadata: JSON.stringify({}),
          },
          {
            resource_code: 'SS-HARV-01',
            resource_name: 'Harvest Skid 01',
            department_code: 'USP',
            metadata: JSON.stringify({}),
          },
          {
            resource_code: 'SS-EXTRA-01',
            resource_name: 'Pinned Equipment',
            department_code: 'USP',
            metadata: JSON.stringify({}),
          },
        ], []];
      }

      if (query.includes('FROM `aps_system`.`maintenance_windows`')) {
        return [[
          {
            resource_code: 'SS-EXTRA-01',
            window_type: 'PM',
            start_datetime: '2026-03-27 09:00:00',
            end_datetime: '2026-03-27 12:00:00',
          },
        ], []];
      }

      if (query.includes('FROM `aps_system`.`resource_assignments`')) {
        return [[], []];
      }

      return [[], []];
    });

    const response = await request(app)
      .post('/api/v3/bioprocess/projections/preview')
      .send({
        template_id: 1,
        planned_start_datetime: '2026-03-27 08:00:00',
        horizon_days: 3,
        visible_equipment_codes: ['SS-EXTRA-01'],
        draft_state_segments: [
          {
            equipment_code: 'SUS-BR-01',
            state_code: 'media_holding',
            start_datetime: '2026-03-27 09:00:00',
            end_datetime: '2026-03-30 09:00:00',
            locked: true,
          },
          {
            equipment_code: 'SS-EXTRA-01',
            state_code: 'maintenance',
            start_datetime: '2026-03-27 10:00:00',
            end_datetime: '2026-03-27 11:00:00',
            locked: true,
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.rows.some((row: { equipment_code: string }) => row.equipment_code === 'SS-EXTRA-01')).toBe(true);
    expect(
      response.body.rows
        .find((row: { equipment_code: string }) => row.equipment_code === 'SUS-BR-01')
        .state_segments.some((segment: { state_code: string; source_mode: string }) => (
          segment.state_code === 'media_holding' && segment.source_mode === 'CONFIRMED'
        )),
    ).toBe(true);
    expect(
      response.body.risks.map((risk: { risk_type: string }) => risk.risk_type),
    ).toEqual(expect.arrayContaining(['STATE_GAP', 'MAINTENANCE_CONFLICT']));
  });
});
