import { describe, expect, it } from 'vitest';
import {
  assembleCipPeakRequest,
  buildTopologyIndex,
  resolveStation,
  type CipOperationInput,
  type PsCipEquipmentRow,
  type PsCipStationRow,
  type PsPipelineRow,
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
