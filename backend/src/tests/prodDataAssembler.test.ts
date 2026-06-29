import { describe, expect, it } from 'vitest';
import {
  assembleCipPeakRequest,
  assembleStateCheckRequest,
  buildEngineTransitions,
  buildStateObjects,
  buildTopologyIndex,
  resolveStation,
  type CipOperationInput,
  type PsCipEquipmentRow,
  type PsCipStationRow,
  type PsEquipmentStateRow,
  type PsEquipmentTypeRow,
  type PsPipelineRow,
  type PsTemplateRow,
  type PsTransitionRow,
} from '../services/schedulingProd/ProdDataAssembler';

const stations: PsCipStationRow[] = [
  { id: 1, code: 'CIP-S1', name: '清洗站1', capacity: 1 },
  { id: 2, code: 'CIP-S2', name: '清洗站2', capacity: 2 },
];
const equipment: PsCipEquipmentRow[] = [
  { id: 101, code: 'PT', name: '配液罐', type: 'tank', cip_station_id: 1 },
  { id: 102, code: 'BIO-4000', name: '反应器', type: 'reactor', cip_station_id: 2 },
  { id: 103, code: 'pouA', name: '使用点A', type: 'other', cip_station_id: null }, // 端点,不单独归站
];
const pipelines: PsPipelineRow[] = [
  { id: 201, code: 'pouA-PT', name: 'pouA到PT', from_equipment_id: 103, to_equipment_id: 101, cip_station_id: 1 },
];

describe('ProdDataAssembler · 清洗对象→站 一跳解析', () => {
  const index = buildTopologyIndex(stations, equipment, pipelines);

  it('设备直接解析到它归属的站', () => {
    const r = resolveStation('PT', index);
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.station.code).toBe('CIP-S1');
  });

  it('管线直接解析到它归属的站', () => {
    const r = resolveStation('pouA-PT', index);
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.station.code).toBe('CIP-S1');
  });

  it('未归属站的端点设备 → 报错', () => {
    const r = resolveStation('pouA', index);
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toContain('未归属');
  });

  it('未录对象 → 报错', () => {
    const r = resolveStation('GHOST', index);
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toContain('未录');
  });

  it('组装请求:设备+管线混合落点,容量按站带出,未解析的另列', () => {
    const ops: CipOperationInput[] = [
      { opId: 'o1', objectCode: 'PT', startHour: 120, durationHours: 5 },
      { opId: 'o2', objectCode: 'BIO-4000', startHour: 122, durationHours: 5 },
      { opId: 'o3', objectCode: 'pouA-PT', startHour: 121, durationHours: 5 },
      { opId: 'o4', objectCode: 'pouA', startHour: 121, durationHours: 5 },
      { opId: 'o5', objectCode: 'GHOST', startHour: 121, durationHours: 5 },
    ];
    const { request, unresolved } = assembleCipPeakRequest(ops, index, { dayHours: 24 });

    expect(request.operations).toHaveLength(3);
    expect(request.operations.find((o) => o.op_id === 'o1')?.station_code).toBe('CIP-S1');
    expect(request.operations.find((o) => o.op_id === 'o2')?.station_code).toBe('CIP-S2');
    expect(request.operations.find((o) => o.op_id === 'o3')?.station_code).toBe('CIP-S1');
    expect(request.capacity_by_station).toEqual({ 'CIP-S1': 1, 'CIP-S2': 2 });
    expect(unresolved.map((u) => u.opId).sort()).toEqual(['o4', 'o5']);
  });

  it('空操作 → 空请求', () => {
    const { request, unresolved } = assembleCipPeakRequest([], index);
    expect(request.operations).toHaveLength(0);
    expect(unresolved).toHaveLength(0);
  });
});

describe('ProdDataAssembler · 状态机模板解析 + state-check 组装', () => {
  // 模板:1=cip-sip,2=rip-sip
  const templates: PsTemplateRow[] = [
    { id: 1, code: 'cip-sip', name: '罐式CIP-SIP' },
    { id: 2, code: 'rip-sip', name: '层析RIP-SIP' },
  ];
  const transitions: PsTransitionRow[] = [
    { template_id: 1, attribute: 'cleanliness', from_state: 'dirty', action: 'CIP', to_state: 'clean', duration_minutes: 90, duration_col: 'cip_duration_minutes', start_within_hours: 24, start_within_col: 'dht_hours', produces_validity_hours: 72, produces_validity_col: 'cht_hours', requires_json: null },
    { template_id: 2, attribute: 'cleanliness', from_state: 'dirty', action: 'RIP', to_state: 'rinsed', duration_minutes: 40, duration_col: 'rip_duration_minutes', start_within_hours: 24, start_within_col: 'dht_hours', produces_validity_hours: 8, produces_validity_col: 'rht_hours', requires_json: null },
    { template_id: 2, attribute: 'sterility', from_state: 'non_sterile', action: 'SIP', to_state: 'sterile', duration_minutes: 30, duration_col: 'sip_duration_minutes', start_within_hours: null, start_within_col: null, produces_validity_hours: 12, produces_validity_col: 'sht_hours', requires_json: { cleanliness: ['rinsed'] } },
  ];
  const types: PsEquipmentTypeRow[] = [
    { id: 11, name: '配液罐', sm_template_id: 1 },
    { id: 12, name: '层析 skid', sm_template_id: 2 },
    { id: 13, name: '其他', sm_template_id: null },
  ];
  const eq = (over: Partial<PsEquipmentStateRow>): PsEquipmentStateRow => ({
    code: 'X', type_name: null, sm_template_id: null,
    cip_duration_minutes: null, rip_duration_minutes: null, sip_duration_minutes: null,
    dht_hours: null, rht_hours: null, cht_hours: null, sht_hours: null,
    ...over,
  });

  it('类型默认模板 + 模板默认窗', () => {
    const objs = buildStateObjects([eq({ code: 'PT', type_name: '配液罐' })], [], types, templates, transitions);
    const pt = objs.find((o) => o.object_code === 'PT');
    expect(pt?.template).toBe('cip-sip');
    expect(pt?.windows.dht_hours).toBe(24); // 模板默认
    expect(pt?.windows.cht_hours).toBe(72);
  });

  it('设备列覆盖模板默认窗', () => {
    const objs = buildStateObjects([eq({ code: 'BIG', type_name: '配液罐', dht_hours: 48 })], [], types, templates, transitions);
    expect(objs[0].windows.dht_hours).toBe(48); // 设备覆盖
    expect(objs[0].windows.cht_hours).toBe(72); // 仍用模板默认
  });

  it('设备 sm_template_id 直接绑,优先于类型默认', () => {
    const objs = buildStateObjects([eq({ code: 'DIRECT', type_name: '配液罐', sm_template_id: 2 })], [], types, templates, transitions);
    expect(objs[0].template).toBe('rip-sip'); // 用了设备覆盖的模板,非类型默认 cip-sip
    expect(objs[0].windows.rht_hours).toBe(8);
    expect(objs[0].windows.sht_hours).toBe(12);
  });

  it('类型无默认模板 + 设备没绑 → 跳过(未绑状态机)', () => {
    const objs = buildStateObjects([eq({ code: 'ORPHAN', type_name: '其他' }), eq({ code: 'GHOST', type_name: '没这类型' })], [], types, templates, transitions);
    expect(objs).toHaveLength(0);
  });

  it('管线靠 sm_template_id 绑(无 type_name)', () => {
    const objs = buildStateObjects([], [eq({ code: 'LINE', sm_template_id: 1, cht_hours: 48 })], types, templates, transitions);
    expect(objs[0].template).toBe('cip-sip');
    expect(objs[0].windows.cht_hours).toBe(48); // 管线列覆盖
  });

  it('buildEngineTransitions:template_id → 模板编码,带 *_col', () => {
    const et = buildEngineTransitions(templates, transitions);
    expect(et).toHaveLength(3);
    const cip = et.find((t) => t.action === 'CIP');
    expect(cip?.template).toBe('cip-sip');
    expect(cip?.start_within_col).toBe('dht_hours');
    expect(cip?.produces_validity_col).toBe('cht_hours');
  });

  it('assembleStateCheckRequest:action 大写归一、透传', () => {
    const objs = buildStateObjects([eq({ code: 'PT', type_name: '配液罐' })], [], types, templates, transitions);
    const body = assembleStateCheckRequest(
      objs,
      [{ opId: 'u1', objectCode: 'PT', action: 'use', startHour: 0, endHour: 10 }],
      buildEngineTransitions(templates, transitions),
      { dayHours: 24 },
    );
    expect(body.operations[0].action).toBe('USE');
    expect(body.objects[0].template).toBe('cip-sip');
    expect(body.transitions).toHaveLength(3);
    expect(body.day_hours).toBe(24);
  });
});
