/**
 * 排产资源主数据 API —— CIP 拓扑 4 表的真 CRUD(用户自录,无 mock)。
 * 走 axios 实例(baseURL /api,带 auth token);后端 /api/prod/cip/:entity。
 */
import api from './api';

export type ProdEntity = 'stations' | 'rooms' | 'pipelines' | 'equipment' | 'shelf-life';

export interface RoomRow {
  id: number;
  facility_code: string;
  code: string;
  name: string;
  org_unit_id: number | null;
  cleanroom_class: string | null;
  note: string | null;
}

export interface OrgUnitRow {
  id: number;
  code: string | null;
  name: string;
  type: string; // DEPARTMENT / TEAM / GROUP / SHIFT
  parent_id: number | null;
}

export interface CipStationRow {
  id: number;
  facility_code: string;
  code: string;
  name: string;
  org_unit_id: number | null;
  capacity: number;
  resource_id: number | null;
  note: string | null;
}

export interface CipEquipmentRow {
  id: number;
  facility_code: string;
  code: string;
  name: string;
  type: string;
  cleaning_mode: string;
  cip_station_id: number | null;
  cip_duration_minutes: number | null;
  sip_duration_minutes: number | null;
  dht_hours: number | null;
  cht_hours: number | null;
  room_id: number | null;
  org_unit_id: number | null;
  parent_equipment_id: number | null;
  resource_id: number | null;
  note: string | null;
}

export interface PipelineRow {
  id: number;
  facility_code: string;
  code: string;
  name: string;
  from_equipment_id: number;
  to_equipment_id: number;
  cip_station_id: number;
  cip_duration_minutes: number | null;
  dht_hours: number | null;
  cht_hours: number | null;
  note: string | null;
}

export interface ShelfLifeRow {
  id: number;
  facility_code: string;
  material: string;
  category: string;
  shelf_life_hours: number;
  basis: string;
  note: string | null;
}

export const prodResourceApi = {
  async list<T = any>(entity: ProdEntity, facilityCode?: string): Promise<T[]> {
    const res = await api.get(`/prod/cip/${entity}`, {
      params: facilityCode ? { facilityCode } : {},
    });
    return (res.data?.data ?? []) as T[];
  },
  async create<T = any>(entity: ProdEntity, data: Record<string, unknown>): Promise<T> {
    const res = await api.post(`/prod/cip/${entity}`, data);
    return res.data?.data as T;
  },
  async update<T = any>(entity: ProdEntity, id: number, data: Record<string, unknown>): Promise<T> {
    const res = await api.put(`/prod/cip/${entity}/${id}`, data);
    return res.data?.data as T;
  },
  async remove(entity: ProdEntity, id: number): Promise<void> {
    await api.delete(`/prod/cip/${entity}/${id}`);
  },
  async listOrgUnits(): Promise<OrgUnitRow[]> {
    const res = await api.get('/prod/org-units');
    return (res.data?.data ?? []) as OrgUnitRow[];
  },
  templateUrl: '/api/prod/cip/template',
  async importWorkbook(
    facilityCode: string,
    file: File,
  ): Promise<{ summary: { stations: number; rooms: number; pipelines: number; equipment: number; shelfLives: number } }> {
    const fd = new FormData();
    fd.append('facilityCode', facilityCode);
    fd.append('file', file);
    const res = await api.post('/prod/cip/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data?.data;
  },
};

export interface ImportRowError { sheet: string; row: number; reason: string }
