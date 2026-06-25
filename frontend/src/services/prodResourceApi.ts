/**
 * 排产资源主数据 API —— CIP 拓扑 4 表的真 CRUD(用户自录,无 mock)。
 * 走 axios 实例(baseURL /api,带 auth token);后端 /api/prod/cip/:entity。
 */
import api from './api';

export type ProdEntity = 'stations' | 'pipelines' | 'equipment' | 'shelf-life';

export interface CipStationRow {
  id: number;
  facility_code: string;
  code: string;
  name: string;
  department: string | null;
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
  cip_station_id: number | null;
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
  templateUrl: '/api/prod/cip/template',
  async importWorkbook(
    facilityCode: string,
    file: File,
  ): Promise<{ summary: { stations: number; pipelines: number; equipment: number; shelfLives: number } }> {
    const fd = new FormData();
    fd.append('facilityCode', facilityCode);
    fd.append('file', file);
    const res = await api.post('/prod/cip/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data?.data;
  },
};

export interface ImportRowError { sheet: string; row: number; reason: string }
