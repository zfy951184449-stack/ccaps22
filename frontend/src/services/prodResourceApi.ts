/**
 * 排产资源主数据 API —— CIP 拓扑 4 表的真 CRUD(用户自录,无 mock)。
 * 走 axios 实例(baseURL /api,带 auth token);后端 /api/prod/cip/:entity。
 */
import api from './api';

export type ProdEntity = 'stations' | 'rooms' | 'pipelines' | 'equipment' | 'shelf-life' | 'equipment-types' | 'sm-templates';

export interface SmTemplateRow {
  id: number;
  code: string;
  name: string;
  note: string | null;
  is_active: number; // tinyint 0/1
  sort_order: number;
}

export interface SmTransitionRow {
  id: number;
  template_id: number;
  attribute: string; // cleanliness / sterility / bag
  from_state: string;
  action: string; // CIP/RIP/SIP/INSTALL/USE
  to_state: string;
  duration_minutes: number | null;
  duration_col: string | null;
  start_within_hours: number | null;
  start_within_col: string | null;
  produces_validity_hours: number | null;
  produces_validity_col: string | null;
  requires_json: Record<string, string[]> | null;
  sort_order: number;
  note: string | null;
}

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

export interface EquipmentTypeRow {
  id: number;
  name: string;
  sort_order: number;
  is_active: number; // tinyint 0/1
  note: string | null;
  sm_template_id: number | null; // 默认状态机模板
}

export interface CipEquipmentRow {
  id: number;
  facility_code: string;
  code: string;
  name: string;
  type_name: string | null; // 类型(取自设备类型字典);旧 ENUM 列 type 已弃用
  cleaning_mode: string;
  cip_station_id: number | null;
  sm_template_id: number | null; // 状态机模板(覆盖类型默认)
  cip_duration_minutes: number | null;
  rip_duration_minutes: number | null; // RIP 淋洗在位(分钟)
  sip_duration_minutes: number | null;
  dht_hours: number | null;
  rht_hours: number | null; // RHT 淋洗有效期(小时)
  cht_hours: number | null;
  sht_hours: number | null; // SHT 无菌有效期(小时)
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
  sm_template_id: number | null; // 状态机模板(覆盖)
  cip_duration_minutes: number | null;
  rip_duration_minutes: number | null; // RIP 淋洗在位(分钟)
  sip_duration_minutes: number | null; // SIP 灭菌(分钟);转移线在线灭菌
  dht_hours: number | null;
  rht_hours: number | null; // RHT 淋洗有效期(小时)
  cht_hours: number | null;
  sht_hours: number | null; // SHT 无菌有效期(小时)
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
  // 某模板的转移规则(列表)
  async listTransitions(templateId: number): Promise<SmTransitionRow[]> {
    const res = await api.get(`/prod/cip/sm-templates/${templateId}/transitions`);
    return (res.data?.data ?? []) as SmTransitionRow[];
  },
  // 自由建模:转移完整 CRUD(结构/时序/前提全可改)
  async createTransition(templateId: number, data: Partial<SmTransitionRow>): Promise<SmTransitionRow> {
    const res = await api.post(`/prod/cip/sm-templates/${templateId}/transitions`, data);
    return res.data?.data as SmTransitionRow;
  },
  async updateTransition(id: number, data: Partial<SmTransitionRow>): Promise<SmTransitionRow> {
    const res = await api.put(`/prod/cip/sm-transitions/${id}`, data);
    return res.data?.data as SmTransitionRow;
  },
  async deleteTransition(id: number): Promise<void> {
    await api.delete(`/prod/cip/sm-transitions/${id}`);
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
