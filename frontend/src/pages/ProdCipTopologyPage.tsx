/**
 * 排产资源主数据 · CIP 拓扑(真平台,用户自录,无 mock)。
 * 五类:CIP 站 / 房间 / 设备 / 管线 / 物料效期 —— 增删改查直连后端 /api/prod/cip/:entity。
 * 录入的真实拓扑供排产引擎做 CIP 容量落点(对标 Day5 尖峰)。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WxbButton,
  WxbDrawer,
  WxbDataTable,
  WxbInput,
  WxbInputNumber,
  WxbModal,
  WxbPageHeader,
  WxbPageShell,
  WxbPopconfirm,
  WxbSegmented,
  WxbSelect,
  WxbSwitch,
  WxbTabs,
  WxbTag,
  WxbTextarea,
  wxbToast,
} from '../components/wxb-ui';
import ProdCipTopologyGraph from '../components/ProdCipTopology/ProdCipTopologyGraph';
import ProdStateMachineView from '../components/ProdCipTopology/ProdStateMachineView';
import {
  prodResourceApi,
  type CipEquipmentRow,
  type CipStationRow,
  type EquipmentTypeRow,
  type ImportRowError,
  type PipelineRow,
  type ProdEntity,
  type RoomRow,
  type OrgUnitRow,
  type ShelfLifeRow,
  type SmTemplateRow,
} from '../services/prodResourceApi';

type FieldType = 'text' | 'number' | 'switch' | 'select' | 'textarea';
interface Opt { label: string; value: string | number }
interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  min?: number;
  defaultValue?: unknown;
  options?: () => Opt[];
  showIf?: (form: Record<string, any>) => boolean;
}

const CLEANING_MODES: Opt[] = [
  { label: 'CIP 在线清洗', value: 'cip' },
  { label: '一次性(免洗)', value: 'single-use' },
  { label: '离线 COP', value: 'cop' },
  { label: '其他', value: 'other' },
];
const CLEANROOM_CLASSES: Opt[] = [
  { label: 'A', value: 'A' },
  { label: 'B', value: 'B' },
  { label: 'C', value: 'C' },
  { label: 'D', value: 'D' },
  { label: 'CNC(非控)', value: 'CNC' },
];
const SHELF_CATEGORIES: Opt[] = [
  { label: '培养基', value: 'media' },
  { label: '缓冲液', value: 'buffer' },
  { label: '清洗剂', value: 'cleaning-agent' },
  { label: '中间产物', value: 'intermediate' },
  { label: '试剂', value: 'reagent' },
  { label: '设备洁净', value: 'equipment-clean' },
];
const SHELF_BASIS: Opt[] = [
  { label: '产出后起算', value: 'after_produced' },
  { label: '配制后起算', value: 'after_prepared' },
  { label: '清洗后起算', value: 'after_clean' },
];

const ProdCipTopologyPage: React.FC = () => {
  const [facility, setFacility] = useState('F1');
  const [view, setView] = useState<'table' | 'graph'>('table');
  const [activeTab, setActiveTab] = useState<ProdEntity>('stations');
  const [stations, setStations] = useState<CipStationRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRow[]>([]);
  const [equipment, setEquipment] = useState<CipEquipmentRow[]>([]);
  const [shelfLives, setShelfLives] = useState<ShelfLifeRow[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRow[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentTypeRow[]>([]);
  const [smTemplates, setSmTemplates] = useState<SmTemplateRow[]>([]);
  const [smView, setSmView] = useState<'templates' | 'binding' | 'graph'>('templates');
  const [smSel, setSmSel] = useState<number | null>(null); // 转移图当前选中的模板(受控)
  const [loading, setLoading] = useState(false);

  const [drawer, setDrawer] = useState<{ entity: ProdEntity; id: number | null } | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<ImportRowError[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const editingIdRef = useRef<number | null>(null); // 正在编辑的设备 id —— 上级设备下拉据此排除自己

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, rm, p, e, sl, org, et, sm] = await Promise.all([
        prodResourceApi.list<CipStationRow>('stations', facility),
        prodResourceApi.list<RoomRow>('rooms', facility),
        prodResourceApi.list<PipelineRow>('pipelines', facility),
        prodResourceApi.list<CipEquipmentRow>('equipment', facility),
        prodResourceApi.list<ShelfLifeRow>('shelf-life', facility),
        prodResourceApi.listOrgUnits(),
        prodResourceApi.list<EquipmentTypeRow>('equipment-types'), // 全局字典,不带 facility
        prodResourceApi.list<SmTemplateRow>('sm-templates'), // 全局状态机模板库
      ]);
      setStations(s);
      setRooms(rm);
      setPipelines(p);
      setEquipment(e);
      setShelfLives(sl);
      setOrgUnits(org);
      setEquipmentTypes(et);
      setSmTemplates(sm);
    } catch (err) {
      wxbToast.error(`加载失败:${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [facility]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const stationOpts = useMemo<Opt[]>(() => stations.map((s) => ({ label: `${s.code} ${s.name}`, value: s.id })), [stations]);
  const equipmentOpts = useMemo<Opt[]>(() => equipment.map((e) => ({ label: `${e.code} ${e.name}`, value: e.id })), [equipment]);
  const roomOpts = useMemo<Opt[]>(() => rooms.map((r) => ({ label: `${r.code} ${r.name}`, value: r.id })), [rooms]);
  const orgOpts = useMemo<Opt[]>(() => orgUnits.filter((o) => o.type === 'TEAM').map((o) => ({ label: o.name, value: o.id })), [orgUnits]);
  const equipTypeOpts = useMemo<Opt[]>(() =>
    [...equipmentTypes]
      .filter((t) => !!t.is_active)
      .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))
      .map((t) => ({ label: t.name, value: t.name })),
  [equipmentTypes]);
  const smTemplateOpts = useMemo<Opt[]>(() =>
    [...smTemplates]
      .filter((t) => !!t.is_active)
      .sort((a, b) => (a.sort_order - b.sort_order) || a.code.localeCompare(b.code))
      .map((t) => ({ label: `${t.name}(${t.code})`, value: t.id })),
  [smTemplates]);
  const templateName = useCallback((id: number | null) => {
    if (id == null) return null;
    const t = smTemplates.find((x) => x.id === id);
    return t ? `${t.name}` : `#${id}`;
  }, [smTemplates]);
  const typeTemplateId = useCallback((typeName: string | null) => {
    if (!typeName) return null;
    return equipmentTypes.find((t) => t.name === typeName)?.sm_template_id ?? null;
  }, [equipmentTypes]);
  // 绑定总览:每台设备/管线的有效状态机模板(设备 ?? 类型默认)
  const bindingRows = useMemo(() => {
    const rows: Array<{ key: string; source: string; code: string; name: string; effId: number | null; inherited: boolean; entity: ProdEntity; id: number }> = [];
    for (const e of equipment) {
      const eff = e.sm_template_id ?? typeTemplateId(e.type_name);
      rows.push({ key: `e${e.id}`, source: '设备', code: e.code, name: e.name, effId: eff, inherited: e.sm_template_id == null && eff != null, entity: 'equipment', id: e.id });
    }
    for (const p of pipelines) {
      rows.push({ key: `p${p.id}`, source: '管线', code: p.code, name: p.name, effId: p.sm_template_id, inherited: false, entity: 'pipelines', id: p.id });
    }
    return rows;
  }, [equipment, pipelines, typeTemplateId]);
  const stationCode = useCallback((id: number | null) => stations.find((s) => s.id === id)?.code ?? '—', [stations]);
  const equipmentCode = useCallback((id: number | null) => equipment.find((e) => e.id === id)?.code ?? '—', [equipment]);
  const roomCode = useCallback((id: number | null) => rooms.find((r) => r.id === id)?.code ?? '—', [rooms]);
  const roomOrg = useCallback((id: number | null) => rooms.find((r) => r.id === id)?.org_unit_id ?? null, [rooms]);
  const orgName = useCallback((id: number | null) => orgUnits.find((u) => u.id === id)?.name ?? null, [orgUnits]);
  const equipById = useCallback((id: number | null) => equipment.find((e) => e.id === id) ?? null, [equipment]);
  // 子设备留空时沿父链继承房间/组织(读侧派生,深度保护防环)
  const effRoomId = useCallback((row: CipEquipmentRow | null, depth = 0): number | null => {
    if (!row || depth > 8) return null;
    return row.room_id ?? effRoomId(equipById(row.parent_equipment_id), depth + 1);
  }, [equipById]);
  const effOrgId = useCallback((row: CipEquipmentRow | null, depth = 0): number | null => {
    if (!row || depth > 8) return null;
    return row.org_unit_id ?? roomOrg(row.room_id) ?? effOrgId(equipById(row.parent_equipment_id), depth + 1);
  }, [equipById, roomOrg]);
  // 清洗时序常数的紧凑展示(3 动作时长·分 + 4 状态窗·时,单位随值)
  const cleanParams = (r: {
    cip_duration_minutes: number | null; rip_duration_minutes?: number | null; sip_duration_minutes?: number | null;
    dht_hours: number | null; rht_hours?: number | null; cht_hours: number | null; sht_hours?: number | null;
  }): string => {
    const p: string[] = [];
    if (r.cip_duration_minutes != null) p.push(`CIP ${r.cip_duration_minutes}分`);
    if (r.rip_duration_minutes != null) p.push(`RIP ${r.rip_duration_minutes}分`);
    if (r.sip_duration_minutes != null) p.push(`SIP ${r.sip_duration_minutes}分`);
    if (r.dht_hours != null) p.push(`DHT ${r.dht_hours}时`);
    if (r.rht_hours != null) p.push(`RHT ${r.rht_hours}时`);
    if (r.cht_hours != null) p.push(`CHT ${r.cht_hours}时`);
    if (r.sht_hours != null) p.push(`SHT ${r.sht_hours}时`);
    return p.length ? p.join(' · ') : '—';
  };

  // ── 每类的字段定义 ──
  const FIELDS: Record<ProdEntity, FieldDef[]> = useMemo(() => ({
    stations: [
      { key: 'code', label: '站编码', type: 'text', required: true, placeholder: '如 CIP-S1' },
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'org_unit_id', label: '归属 team', type: 'select', options: () => orgOpts, help: '这个 CIP 站归哪个 team' },
      { key: 'capacity', label: '容量', type: 'number', required: true, min: 1, defaultValue: 1, help: '可并行清洗的对象数,通常为 1' },
      { key: 'note', label: '备注', type: 'textarea' },
    ],
    rooms: [
      { key: 'code', label: '房间编码', type: 'text', required: true, placeholder: '如 R-1501' },
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'org_unit_id', label: '归属 team', type: 'select', options: () => orgOpts, help: '排班同一套 team;里面设备默认随它' },
      { key: 'cleanroom_class', label: '洁净级别', type: 'select', options: () => CLEANROOM_CLASSES },
      { key: 'note', label: '备注', type: 'textarea' },
    ],
    equipment: [
      { key: 'code', label: '设备编码', type: 'text', required: true, placeholder: '如 PT1810 / pouA' },
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'type_name', label: '类型', type: 'select', required: true, options: () => equipTypeOpts, help: '取自「设备类型」字典;不够用就切到「设备类型」页签增改' },
      { key: 'cleaning_mode', label: '清洗方式', type: 'select', required: true, defaultValue: 'cip', options: () => CLEANING_MODES, help: '仅「CIP 在线清洗」才归 CIP 站;一次性/COP/其他走各自策略' },
      { key: 'cip_station_id', label: 'CIP 站', type: 'select', options: () => stationOpts, help: '这台设备由哪个站清洗', showIf: (f) => (f.cleaning_mode ?? 'cip') === 'cip' },
      { key: 'cip_duration_minutes', label: 'CIP 时长(分钟)', type: 'number', min: 0, help: '全清洗一次要多久,单位分钟', showIf: (f) => (f.cleaning_mode ?? 'cip') === 'cip' },
      { key: 'rip_duration_minutes', label: 'RIP 时长(分钟)', type: 'number', min: 0, help: '淋洗在位(层析/UFDF 常以 RIP+SIP 替代罐式 CIP),单位分钟;不做留空', showIf: (f) => (f.cleaning_mode ?? 'cip') === 'cip' },
      { key: 'sip_duration_minutes', label: 'SIP 时长(分钟)', type: 'number', min: 0, help: '需要 SIP 灭菌才填,单位分钟;不做留空', showIf: (f) => (f.cleaning_mode ?? 'cip') === 'cip' },
      { key: 'dht_hours', label: 'DHT 脏停放(小时)', type: 'number', min: 0, help: '变脏后必须几小时内开始清洗,单位小时', showIf: (f) => (f.cleaning_mode ?? 'cip') === 'cip' },
      { key: 'rht_hours', label: 'RHT 淋洗有效期(小时)', type: 'number', min: 0, help: 'RIP 完几小时内必须 SIP/被用,否则重洗,单位小时', showIf: (f) => (f.cleaning_mode ?? 'cip') === 'cip' },
      { key: 'cht_hours', label: 'CHT 洁净有效期(小时)', type: 'number', min: 0, help: 'CIP 完几小时内必须被用,否则重洗,单位小时', showIf: (f) => (f.cleaning_mode ?? 'cip') === 'cip' },
      { key: 'sht_hours', label: 'SHT 无菌有效期(小时)', type: 'number', min: 0, help: 'SIP 完几小时内必须被用,否则重灭菌,单位小时', showIf: (f) => (f.cleaning_mode ?? 'cip') === 'cip' },
      { key: 'sm_template_id', label: '状态机模板', type: 'select', options: () => smTemplateOpts, help: '这台设备走哪台清洗状态机;留空=随设备类型的默认模板。上面 7 个时长留空则用模板默认' },
      { key: 'parent_equipment_id', label: '上级设备', type: 'select', options: () => equipmentOpts.filter((o) => o.value !== editingIdRef.current), help: 'pou 等使用点可挂到母设备/skid 下;留空=顶层设备(房间/组织留空则随上级)' },
      { key: 'room_id', label: '房间', type: 'select', options: () => roomOpts, help: '这台设备在哪个房间(留空随上级设备)' },
      { key: 'org_unit_id', label: '归属 team', type: 'select', options: () => orgOpts, help: '留空随房间/上级设备的 team' },
      { key: 'note', label: '备注', type: 'textarea' },
    ],
    pipelines: [
      { key: 'code', label: '管线编码', type: 'text', required: true, placeholder: '如 pouA-PT' },
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'from_equipment_id', label: '起点设备', type: 'select', required: true, options: () => equipmentOpts, help: '管线连接的两台设备之一' },
      { key: 'to_equipment_id', label: '终点设备', type: 'select', required: true, options: () => equipmentOpts },
      { key: 'cip_station_id', label: 'CIP 站', type: 'select', required: true, options: () => stationOpts, help: '这条管线由哪个站清洗' },
      { key: 'cip_duration_minutes', label: 'CIP 时长(分钟)', type: 'number', min: 0, help: '这条管线全清洗一次要多久,单位分钟' },
      { key: 'rip_duration_minutes', label: 'RIP 时长(分钟)', type: 'number', min: 0, help: '淋洗在位(转移线常 RIP+SIP),单位分钟;不做留空' },
      { key: 'sip_duration_minutes', label: 'SIP 时长(分钟)', type: 'number', min: 0, help: '转移线在线灭菌才填,单位分钟;不做留空' },
      { key: 'dht_hours', label: 'DHT 脏停放(小时)', type: 'number', min: 0, help: '变脏后必须几小时内开始清洗,单位小时' },
      { key: 'rht_hours', label: 'RHT 淋洗有效期(小时)', type: 'number', min: 0, help: 'RIP 完几小时内必须 SIP/被用,单位小时' },
      { key: 'cht_hours', label: 'CHT 洁净有效期(小时)', type: 'number', min: 0, help: 'CIP 完几小时内必须被用,单位小时' },
      { key: 'sht_hours', label: 'SHT 无菌有效期(小时)', type: 'number', min: 0, help: 'SIP 完几小时内必须被用,单位小时' },
      { key: 'sm_template_id', label: '状态机模板', type: 'select', options: () => smTemplateOpts, help: '这条管线走哪台清洗状态机;留空=未绑(管线无类型默认)' },
      { key: 'note', label: '备注', type: 'textarea' },
    ],
    'shelf-life': [
      { key: 'material', label: '物料/对象', type: 'text', required: true, placeholder: '如 培养基 / AC buffer / 碱液' },
      { key: 'category', label: '类别', type: 'select', required: true, options: () => SHELF_CATEGORIES },
      { key: 'shelf_life_hours', label: '效期(小时)', type: 'number', required: true, min: 0, help: '如 24 / 72 / 168' },
      { key: 'basis', label: '起算基准', type: 'select', required: true, defaultValue: 'after_produced', options: () => SHELF_BASIS },
      { key: 'note', label: '备注', type: 'textarea' },
    ],
    'equipment-types': [
      { key: 'name', label: '类型名称', type: 'text', required: true, placeholder: '如 生物反应器 / 层析 skid' },
      { key: 'sm_template_id', label: '默认状态机模板', type: 'select', options: () => smTemplateOpts, help: '该类型设备默认走哪台清洗状态机;单台设备可在自己那里改绑' },
      { key: 'sort_order', label: '排序', type: 'number', min: 0, defaultValue: 0, help: '数字小的排在下拉更前面' },
      { key: 'is_active', label: '启用', type: 'switch', defaultValue: true, help: '停用后:已用此类型的设备不受影响,但新建设备的下拉里不再出现' },
      { key: 'note', label: '备注', type: 'textarea' },
    ],
    'sm-templates': [
      { key: 'code', label: '模板编码', type: 'text', required: true, placeholder: '如 cip-sip / rip-sip' },
      { key: 'name', label: '名称', type: 'text', required: true, placeholder: '如 罐式 CIP+SIP' },
      { key: 'sort_order', label: '排序', type: 'number', min: 0, defaultValue: 0, help: '数字小的排在下拉更前面' },
      { key: 'is_active', label: '启用', type: 'switch', defaultValue: true, help: '停用后:已绑设备不受影响,新建绑定下拉里不再出现' },
      { key: 'note', label: '备注', type: 'textarea' },
    ],
  }), [stationOpts, equipmentOpts, roomOpts, orgOpts, equipTypeOpts, smTemplateOpts]);

  const actionsCol = (entity: ProdEntity) => ({
    title: '操作', key: 'actions', width: 130,
    render: (_: unknown, row: { id: number }) => (
      <div style={{ display: 'flex', gap: 8 }}>
        <WxbButton variant="ghost" size="sm" onClick={() => openEdit(entity, row)}>编辑</WxbButton>
        <WxbPopconfirm title="确认删除?" onConfirm={() => handleDelete(entity, row.id)}>
          <WxbButton variant="ghost" size="sm">删除</WxbButton>
        </WxbPopconfirm>
      </div>
    ),
  });

  const COLUMNS: Record<ProdEntity, any[]> = {
    stations: [
      { title: '站编码', dataIndex: 'code', width: 120, render: (v: string) => <code>{v}</code> },
      { title: '名称', dataIndex: 'name' },
      { title: '归属 team', dataIndex: 'org_unit_id', render: (v: number | null) => orgName(v) || '—' },
      { title: '容量', dataIndex: 'capacity', width: 70 },
      actionsCol('stations'),
    ],
    rooms: [
      { title: '房间', dataIndex: 'code', width: 120, render: (v: string) => <code>{v}</code> },
      { title: '名称', dataIndex: 'name' },
      { title: '归属 team', dataIndex: 'org_unit_id', render: (v: number | null) => orgName(v) || '—' },
      { title: '洁净级别', dataIndex: 'cleanroom_class', width: 100, render: (v: string | null) => v ? <WxbTag color="blue">{v}</WxbTag> : '—' },
      actionsCol('rooms'),
    ],
    equipment: [
      { title: '设备', dataIndex: 'code', width: 130, render: (v: string) => <code>{v}</code> },
      { title: '名称', dataIndex: 'name' },
      { title: '类型', dataIndex: 'type_name', width: 110, render: (v: string | null) => v || '—' },
      { title: '清洗方式', dataIndex: 'cleaning_mode', width: 120, render: (v: string) => <WxbTag color={v === 'cip' ? 'green' : 'neutral'}>{CLEANING_MODES.find((m) => m.value === v)?.label ?? v}</WxbTag> },
      { title: 'CIP 站', dataIndex: 'cip_station_id', width: 110, render: (v: number | null) => v ? <WxbTag color="green">{stationCode(v)}</WxbTag> : '—' },
      { title: '清洗参数', key: 'cleanp', width: 210, render: (_: unknown, r: CipEquipmentRow) => <span style={{ fontSize: 12, color: 'var(--wx-text-secondary, #64748b)' }}>{cleanParams(r)}</span> },
      { title: '上级设备', dataIndex: 'parent_equipment_id', width: 110, render: (v: number | null) => v ? <code>{equipmentCode(v)}</code> : '—' },
      { title: '房间', key: 'room', width: 130, render: (_: unknown, r: CipEquipmentRow) => {
        const rid = effRoomId(r);
        if (!rid) return '—';
        return r.room_id == null
          ? <span style={{ color: 'var(--wx-text-secondary, #94a3b8)' }} title="随上级设备">{roomCode(rid)} ·随上级</span>
          : roomCode(rid);
      } },
      { title: '归属 team', key: 'org', width: 140, render: (_: unknown, r: CipEquipmentRow) => {
        const oid = effOrgId(r);
        if (!oid) return '—';
        return (r.org_unit_id == null && roomOrg(r.room_id) == null)
          ? <span style={{ color: 'var(--wx-text-secondary, #94a3b8)' }} title="随上级设备">{orgName(oid)} ·随上级</span>
          : (orgName(oid) || '—');
      } },
      actionsCol('equipment'),
    ],
    pipelines: [
      { title: '管线', dataIndex: 'code', width: 130, render: (v: string) => <code>{v}</code> },
      { title: '名称', dataIndex: 'name' },
      { title: '起点', dataIndex: 'from_equipment_id', render: (v: number) => equipmentCode(v) },
      { title: '终点', dataIndex: 'to_equipment_id', render: (v: number) => equipmentCode(v) },
      { title: 'CIP 站', dataIndex: 'cip_station_id', render: (v: number) => <WxbTag color="green">{stationCode(v)}</WxbTag> },
      { title: '清洗参数', key: 'cleanp', width: 190, render: (_: unknown, r: PipelineRow) => <span style={{ fontSize: 12, color: 'var(--wx-text-secondary, #64748b)' }}>{cleanParams(r)}</span> },
      actionsCol('pipelines'),
    ],
    'shelf-life': [
      { title: '物料/对象', dataIndex: 'material' },
      { title: '类别', dataIndex: 'category', width: 120, render: (v: string) => SHELF_CATEGORIES.find((c) => c.value === v)?.label ?? v },
      { title: '效期(h)', dataIndex: 'shelf_life_hours', width: 90 },
      { title: '起算', dataIndex: 'basis', width: 120, render: (v: string) => SHELF_BASIS.find((b) => b.value === v)?.label ?? v },
      actionsCol('shelf-life'),
    ],
    'equipment-types': [
      { title: '类型名称', dataIndex: 'name' },
      { title: '默认状态机', dataIndex: 'sm_template_id', width: 160, render: (v: number | null) => v ? <WxbTag color="blue">{templateName(v)}</WxbTag> : <span style={{ color: 'var(--wx-text-secondary, #94a3b8)' }}>未设</span> },
      { title: '排序', dataIndex: 'sort_order', width: 80 },
      { title: '状态', dataIndex: 'is_active', width: 90, render: (v: number) => v ? <WxbTag color="green">启用</WxbTag> : <WxbTag color="neutral">停用</WxbTag> },
      { title: '备注', dataIndex: 'note', render: (v: string | null) => v || '—' },
      actionsCol('equipment-types'),
    ],
    'sm-templates': [
      { title: '编码', dataIndex: 'code', width: 140, render: (v: string) => <code>{v}</code> },
      { title: '名称', dataIndex: 'name' },
      { title: '排序', dataIndex: 'sort_order', width: 80 },
      { title: '状态', dataIndex: 'is_active', width: 90, render: (v: number) => v ? <WxbTag color="green">启用</WxbTag> : <WxbTag color="neutral">停用</WxbTag> },
      { title: '备注', dataIndex: 'note', render: (v: string | null) => v || '—' },
      actionsCol('sm-templates'),
    ],
  };

  const dataFor = (entity: ProdEntity): any[] =>
    entity === 'stations' ? stations
      : entity === 'rooms' ? rooms
      : entity === 'pipelines' ? pipelines
      : entity === 'equipment' ? equipment
      : entity === 'equipment-types' ? equipmentTypes
      : entity === 'sm-templates' ? smTemplates
      : shelfLives;

  const openCreate = (entity: ProdEntity) => {
    editingIdRef.current = null;
    const init: Record<string, any> = {};
    FIELDS[entity].forEach((f) => { if (f.defaultValue !== undefined) init[f.key] = f.defaultValue; });
    setForm(init);
    setDrawer({ entity, id: null });
  };
  const openEdit = (entity: ProdEntity, row: any) => {
    editingIdRef.current = row.id ?? null;
    const init: Record<string, any> = {};
    FIELDS[entity].forEach((f) => { init[f.key] = row[f.key]; });
    setForm(init);
    setDrawer({ entity, id: row.id });
  };
  // 拓扑图点节点 → 打开该对象编辑(并切到对应表格 tab)
  const openById = (entity: ProdEntity, id: number) => {
    const row = (dataFor(entity) as Array<{ id: number }>).find((r) => r.id === id);
    if (!row) return;
    setActiveTab(entity);
    openEdit(entity, row);
  };

  const handleDelete = async (entity: ProdEntity, id: number) => {
    try {
      await prodResourceApi.remove(entity, id);
      wxbToast.success('已删除');
      loadAll();
    } catch (err: any) {
      wxbToast.error(err?.response?.data?.error || `删除失败:${err?.message}`);
    }
  };

  const downloadTemplate = () => {
    const a = document.createElement('a');
    a.href = prodResourceApi.templateUrl;
    a.download = 'CIP拓扑导入模板.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImporting(true);
    setImportErrors(null);
    try {
      const { summary } = await prodResourceApi.importWorkbook(facility, f);
      wxbToast.success(`导入完成:站 ${summary.stations} · 房间 ${summary.rooms} · 设备 ${summary.equipment} · 管线 ${summary.pipelines} · 效期 ${summary.shelfLives}`);
      loadAll();
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.errors?.length) setImportErrors(data.errors);
      else wxbToast.error(data?.error || `导入失败:${err?.message}`);
    } finally {
      setImporting(false);
    }
  };

  const submit = async () => {
    if (!drawer) return;
    const fields = FIELDS[drawer.entity];
    const visible = fields.filter((f) => !f.showIf || f.showIf(form));
    const missing = visible.filter((f) => f.required && (form[f.key] === undefined || form[f.key] === '' || form[f.key] === null));
    if (missing.length) {
      wxbToast.error(`请填写:${missing.map((f) => f.label).join('、')}`);
      return;
    }
    const payload: Record<string, unknown> = { facility_code: facility };
    fields.forEach((f) => {
      const shown = !f.showIf || f.showIf(form);
      payload[f.key] = shown ? (form[f.key] ?? null) : null;
    });
    setSaving(true);
    try {
      if (drawer.id == null) {
        await prodResourceApi.create(drawer.entity, payload);
        wxbToast.success('已新增');
      } else {
        await prodResourceApi.update(drawer.entity, drawer.id, payload);
        wxbToast.success('已保存');
      }
      setDrawer(null);
      loadAll();
    } catch (err: any) {
      wxbToast.error(err?.response?.data?.error || `保存失败:${err?.message}`);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: FieldDef) => {
    const val = form[f.key];
    const set = (v: any) => setForm((s) => ({ ...s, [f.key]: v }));
    switch (f.type) {
      case 'number':
        return <WxbInputNumber label={f.label} value={val} min={f.min} onChange={(v) => set(v)} style={{ width: '100%' }} />;
      case 'switch':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <WxbSwitch checked={!!val} onChange={(c) => set(c)} />
            <span style={{ fontSize: 13 }}>{f.label}{f.help ? <span style={{ color: 'var(--wx-text-secondary, #64748b)', marginLeft: 8, fontSize: 12 }}>{f.help}</span> : null}</span>
          </div>
        );
      case 'select':
        return <WxbSelect label={f.label} value={val ?? undefined} options={f.options?.() ?? []} allowClear={!f.required} placeholder="请选择" onChange={(v: any) => set(v)} style={{ width: '100%' }} />;
      case 'textarea':
        return <WxbTextarea label={f.label} value={val ?? ''} rows={2} onChange={(e) => set(e.target.value)} />;
      default:
        return <WxbInput label={f.label} value={val ?? ''} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />;
    }
  };

  const tabLabel = (label: string, n: number) => (
    <span>{label}<span style={{ marginLeft: 6, color: 'var(--wx-text-secondary, #94a3b8)', fontSize: 12 }}>{n}</span></span>
  );

  const drawerTitle = drawer ? `${drawer.id == null ? '新增' : '编辑'} · ${({ stations: 'CIP 站', rooms: '房间', pipelines: '管线', equipment: '设备', 'shelf-life': '物料效期', 'equipment-types': '设备类型', 'sm-templates': '状态机模板' } as Record<ProdEntity, string>)[drawer.entity]}` : '';

  return (
    <WxbPageShell size="full" gap="lg">
      <WxbPageHeader
        eyebrow="排产 · 资源主数据(平台 · 自录入)"
        title="CIP 拓扑维护"
        description="录入真实的 CIP 站 / 房间 / 设备 / 管线 / 物料效期。设备与管线是清洗对象,各自归属一个 CIP 站(管线 = 设备-设备的连接);房间/设备归属 team(与排班同一套 team,留空随房间)。可下载模板批量导入。"
        meta={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            设施
            <WxbInput value={facility} onChange={(e) => setFacility(e.target.value)} style={{ width: 90, height: 28 }} />
          </span>
        }
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <WxbSegmented
            value={view}
            onChange={(v) => setView(v as 'table' | 'graph')}
            options={[{ label: '表格维护', value: 'table' }, { label: '拓扑总览', value: 'graph' }]}
          />
          {view === 'table' && (
            <WxbTabs
              activeKey={activeTab}
              onChange={(k) => setActiveTab(k as ProdEntity)}
              items={[
                { key: 'stations', label: tabLabel('CIP 站', stations.length) },
                { key: 'rooms', label: tabLabel('房间', rooms.length) },
                { key: 'equipment', label: tabLabel('设备', equipment.length) },
                { key: 'pipelines', label: tabLabel('管线', pipelines.length) },
                { key: 'shelf-life', label: tabLabel('物料效期', shelfLives.length) },
                { key: 'equipment-types', label: tabLabel('设备类型', equipmentTypes.length) },
                { key: 'sm-templates', label: tabLabel('状态机', smTemplates.length) },
              ]}
            />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <WxbButton variant="ghost" size="sm" onClick={downloadTemplate}>下载模板</WxbButton>
          <WxbButton variant="ghost" size="sm" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? '导入中…' : '导入 Excel'}</WxbButton>
          <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={onPickFile} />
          {view === 'table' && !(activeTab === 'sm-templates' && smView !== 'templates') && (
            <WxbButton variant="primary" size="sm" onClick={() => openCreate(activeTab)}>
              新增{({ stations: 'CIP 站', rooms: '房间', pipelines: '管线', equipment: '设备', 'shelf-life': '效期', 'equipment-types': '设备类型', 'sm-templates': '状态机模板' } as Record<ProdEntity, string>)[activeTab]}
            </WxbButton>
          )}
        </div>
      </div>

      {view === 'graph' ? (
        <ProdCipTopologyGraph
          stations={stations}
          rooms={rooms}
          equipment={equipment}
          pipelines={pipelines}
          orgUnits={orgUnits}
          onPick={openById}
        />
      ) : activeTab === 'sm-templates' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <WxbSegmented
            value={smView}
            onChange={(v) => setSmView(v as 'templates' | 'binding' | 'graph')}
            options={[{ label: '模板库', value: 'templates' }, { label: '绑定管理', value: 'binding' }, { label: '转移图', value: 'graph' }]}
          />
          {smView === 'templates' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--wx-text-secondary, #64748b)' }}>
                模板库管的是「有哪些状态机、叫什么」。状态机的逻辑(状态/转移/动作/前置/时长)在每行的「转移规则」里搭。
              </div>
              <WxbDataTable
                rowKey="id"
                loading={loading}
                pagination={false}
                dataSource={smTemplates}
                columns={[
                  ...COLUMNS['sm-templates'].slice(0, -1),
                  {
                    title: '操作', key: 'actions', width: 230,
                    render: (_: unknown, row: SmTemplateRow) => (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <WxbButton variant="primary" size="sm" onClick={() => { setSmSel(row.id); setSmView('graph'); }}>转移规则</WxbButton>
                        <WxbButton variant="ghost" size="sm" onClick={() => openEdit('sm-templates', row)}>编辑</WxbButton>
                        <WxbPopconfirm title="确认删除?" onConfirm={() => handleDelete('sm-templates', row.id)}>
                          <WxbButton variant="ghost" size="sm">删除</WxbButton>
                        </WxbPopconfirm>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          )}
          {smView === 'graph' && <ProdStateMachineView templates={smTemplates} selectedId={smSel} onSelectedIdChange={setSmSel} />}
          {smView === 'binding' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--wx-text-secondary, #64748b)' }}>
                每台设备/管线的有效状态机模板(设备自身绑定 ?? 设备类型默认)。绑定在「设备 / 管线」页签改;类型默认在「设备类型」页签改。
              </div>
              <WxbDataTable
                rowKey="key"
                loading={loading}
                pagination={false}
                columns={[
                  { title: '来源', dataIndex: 'source', width: 80, render: (v: string) => <WxbTag color={v === '设备' ? 'blue' : 'neutral'}>{v}</WxbTag> },
                  { title: '编码', dataIndex: 'code', width: 150, render: (v: string) => <code>{v}</code> },
                  { title: '名称', dataIndex: 'name' },
                  {
                    title: '有效状态机', key: 'eff',
                    render: (_: unknown, r: { effId: number | null; inherited: boolean }) =>
                      r.effId != null
                        ? (r.inherited
                          ? <span style={{ color: 'var(--wx-text-secondary, #94a3b8)' }} title="随设备类型默认">{templateName(r.effId)} ·随类型</span>
                          : <WxbTag color="blue">{templateName(r.effId)}</WxbTag>)
                        : <WxbTag color="amber">未绑</WxbTag>,
                  },
                  {
                    title: '操作', key: 'act', width: 90,
                    render: (_: unknown, r: { entity: ProdEntity; id: number }) => <WxbButton variant="ghost" size="sm" onClick={() => openById(r.entity, r.id)}>去编辑</WxbButton>,
                  },
                ]}
                dataSource={bindingRows}
              />
            </div>
          )}
        </div>
      ) : (
        <WxbDataTable
          rowKey="id"
          loading={loading}
          columns={COLUMNS[activeTab]}
          dataSource={dataFor(activeTab)}
          pagination={false}
        />
      )}

      <WxbDrawer
        open={!!drawer}
        width={460}
        placement="right"
        title={drawerTitle}
        onClose={() => setDrawer(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <WxbButton variant="ghost" onClick={() => setDrawer(null)}>取消</WxbButton>
            <WxbButton variant="primary" disabled={saving} onClick={submit}>{saving ? '保存中…' : '保存'}</WxbButton>
          </div>
        }
      >
        {drawer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {FIELDS[drawer.entity].filter((f) => !f.showIf || f.showIf(form)).map((f) => (
              <div key={f.key}>
                {renderField(f)}
                {f.type !== 'switch' && f.help ? (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--wx-text-secondary, #94a3b8)' }}>{f.help}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </WxbDrawer>

      <WxbModal
        open={!!importErrors}
        title="导入校验未通过"
        width={560}
        onCancel={() => setImportErrors(null)}
        footer={<WxbButton variant="primary" onClick={() => setImportErrors(null)}>知道了</WxbButton>}
      >
        <div style={{ fontSize: 13, color: 'var(--wx-text-secondary, #64748b)', marginBottom: 10 }}>
          以下问题需修正后重新导入(整批未入库):
        </div>
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          {(importErrors || []).map((er, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--wx-border, #eef1f4)', fontSize: 13 }}>
              <WxbTag color="amber">{er.sheet}</WxbTag>
              <span style={{ width: 64, flex: 'none', color: 'var(--wx-text-secondary, #64748b)' }}>第 {er.row} 行</span>
              <span>{er.reason}</span>
            </div>
          ))}
        </div>
      </WxbModal>
    </WxbPageShell>
  );
};

export default ProdCipTopologyPage;
