/**
 * CIP 拓扑 Excel 导入/模板下载(平台,用户自录的批量入口,无 mock)。
 *
 * 模型:清洗对象 = 设备 / 管线,各自直接归属一个 CIP 站;管线 = 起点设备-终点设备 的连接。
 * 导入:解析 → 引用按「编码」解析(站/起终点设备)→ 全表校验(错就整批拒,列行号)→
 *   事务 upsert(顺序 站→设备→管线,按 设施+编码 不建重复)。
 */
import path from 'path';
import type { Request, Response } from 'express';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import XLSX from 'xlsx';
import { pool } from '../../config/database';

const TEMPLATE_PATH = path.resolve(process.cwd(), '..', 'docs/production_scheduling/CIP拓扑导入模板.xlsx');

export function downloadTemplate(_req: Request, res: Response): void {
  res.download(TEMPLATE_PATH, 'CIP拓扑导入模板.xlsx', (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, error: '模板文件不存在' });
  });
}

const CATEGORY_MAP: Record<string, string> = {
  培养基: 'media', 缓冲液: 'buffer', 清洗剂: 'cleaning-agent', 中间产物: 'intermediate', 试剂: 'reagent', 设备洁净: 'equipment-clean',
};
const BASIS_MAP: Record<string, string> = {
  产出后: 'after_produced', 配制后: 'after_prepared', 清洗后: 'after_clean',
};
const CLEAN_MODE_MAP: Record<string, string> = {
  CIP: 'cip', cip: 'cip', 一次性: 'single-use', COP: 'cop', cop: 'cop', 其他: 'other',
};

interface ImportError { sheet: string; row: number; reason: string }

const norm = (h: unknown): string =>
  String(h ?? '').replace(/\*/g, '').replace(/[（(][^)）]*[)）]/g, '').replace('→所属CIP站', '').trim();

function readSheet(wb: XLSX.WorkBook, name: string, fieldByHeader: Record<string, string>): Array<{ row: number; data: Record<string, string> }> {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  if (!rows.length) return [];
  const headers = (rows[0] as unknown[]).map(norm);
  const colOf: Record<string, number> = {};
  headers.forEach((h, i) => { if (fieldByHeader[h] !== undefined) colOf[fieldByHeader[h]] = i; });
  const out: Array<{ row: number; data: Record<string, string> }> = [];
  for (let r = 1; r < rows.length; r++) {
    const arr = rows[r] as unknown[];
    const data: Record<string, string> = {};
    let anyVal = false;
    for (const header of Object.keys(fieldByHeader)) {
      const f = fieldByHeader[header];
      const idx = colOf[f];
      const v = idx === undefined ? '' : String(arr[idx] ?? '').trim();
      data[f] = v;
      if (v) anyVal = true;
    }
    if (anyVal) out.push({ row: r + 1, data });
  }
  return out;
}

export async function importWorkbook(req: Request, res: Response): Promise<void> {
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  const facility = String((req.body?.facilityCode ?? '') || '').trim();
  if (!file) { res.status(400).json({ success: false, error: '未收到文件' }); return; }
  if (!facility) { res.status(400).json({ success: false, error: '缺少设施(facilityCode)' }); return; }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(file.buffer, { type: 'buffer' });
  } catch {
    res.status(400).json({ success: false, error: '无法解析 Excel 文件' });
    return;
  }

  const stations = readSheet(wb, '站', { 站编码: 'code', 站名称: 'name', 组织编码: 'org_code', 容量: 'capacity', 备注: 'note' });
  const rooms = readSheet(wb, '房间', { 房间编码: 'code', 房间名称: 'name', 组织编码: 'org_code', 洁净级别: 'cleanroom_class', 备注: 'note' });
  const equipment = readSheet(wb, '设备', { 设备编码: 'code', 设备名称: 'name', 类型: 'type', 清洗方式: 'cleaning_mode', 上级设备编码: 'parent_code', CIP时长: 'cip_minutes', RIP时长: 'rip_minutes', SIP时长: 'sip_minutes', DHT: 'dht_hours', RHT: 'rht_hours', CHT: 'cht_hours', SHT: 'sht_hours', 房间编码: 'room_code', 组织编码: 'org_code', CIP站编码: 'station_code', 备注: 'note' });
  const pipelines = readSheet(wb, '管线', { 管线编码: 'code', 管线名称: 'name', 起点设备编码: 'from_code', 终点设备编码: 'to_code', CIP站编码: 'station_code', CIP时长: 'cip_minutes', RIP时长: 'rip_minutes', SIP时长: 'sip_minutes', DHT: 'dht_hours', RHT: 'rht_hours', CHT: 'cht_hours', SHT: 'sht_hours', 备注: 'note' });
  const shelfLives = readSheet(wb, '物料效期', { 物料: 'material', 类别: 'category', 效期: 'shelf_life_hours', 起算基准: 'basis', 备注: 'note' });

  const errors: ImportError[] = [];

  // 已有 + 本次工作簿的编码集合,供引用校验
  const [exStations] = await pool.execute<RowDataPacket[]>('SELECT code FROM ps_cip_station WHERE facility_code = ?', [facility]);
  const [exEquip] = await pool.execute<RowDataPacket[]>('SELECT code FROM ps_cip_equipment WHERE facility_code = ?', [facility]);
  const [exRooms] = await pool.execute<RowDataPacket[]>('SELECT code FROM ps_room WHERE facility_code = ?', [facility]);
  const stationCodes = new Set<string>([...exStations.map((r) => r.code), ...stations.map((s) => s.data.code).filter(Boolean)]);
  const equipmentCodes = new Set<string>([...exEquip.map((r) => r.code), ...equipment.map((e) => e.data.code).filter(Boolean)]);
  const roomCodes = new Set<string>([...exRooms.map((r) => r.code), ...rooms.map((r) => r.data.code).filter(Boolean)]);
  const CLEANROOM = new Set(['A', 'B', 'C', 'D', 'CNC']);
  // 归属 team:只认 TEAM 层级(组织树的 organization_units),按 unit_code 解析(全局)
  const [orgRows] = await pool.execute<RowDataPacket[]>("SELECT id, unit_code FROM organization_units WHERE unit_type = 'TEAM' AND unit_code IS NOT NULL AND unit_code <> ''");
  const orgIdByCode = new Map<string, number>(orgRows.map((r) => [String(r.unit_code), r.id]));
  // 设备类型字典(启用项):类型 = 中文名直接取自字典(全局)
  const [typeRows] = await pool.execute<RowDataPacket[]>('SELECT name FROM ps_equipment_type WHERE is_active = 1');
  const typeNames = new Set<string>(typeRows.map((r) => String(r.name)));

  const reqd = (sheet: string, item: { row: number; data: Record<string, string> }, fields: Array<[string, string]>) => {
    for (const [f, label] of fields) if (!item.data[f]) errors.push({ sheet, row: item.row, reason: `缺必填:${label}` });
  };

  stations.forEach((s) => {
    reqd('站', s, [['code', '站编码'], ['name', '站名称']]);
    if (s.data.capacity && !/^\d+$/.test(s.data.capacity)) errors.push({ sheet: '站', row: s.row, reason: `容量须为整数:${s.data.capacity}` });
    if (s.data.org_code && !orgIdByCode.has(s.data.org_code)) errors.push({ sheet: '站', row: s.row, reason: `team 编码不存在(只认 team 层级):${s.data.org_code}` });
  });
  rooms.forEach((r) => {
    reqd('房间', r, [['code', '房间编码'], ['name', '房间名称']]);
    if (r.data.cleanroom_class && !CLEANROOM.has(r.data.cleanroom_class)) errors.push({ sheet: '房间', row: r.row, reason: `洁净级别不在可选项(A/B/C/D/CNC):${r.data.cleanroom_class}` });
    if (r.data.org_code && !orgIdByCode.has(r.data.org_code)) errors.push({ sheet: '房间', row: r.row, reason: `team 编码不存在(只认 team 层级):${r.data.org_code}` });
  });
  equipment.forEach((e) => {
    reqd('设备', e, [['code', '设备编码'], ['name', '设备名称'], ['type', '类型']]);
    if (e.data.type && !typeNames.has(e.data.type)) errors.push({ sheet: '设备', row: e.row, reason: `类型不在「设备类型」字典(或已停用):${e.data.type}` });
    if (e.data.cleaning_mode && !CLEAN_MODE_MAP[e.data.cleaning_mode]) errors.push({ sheet: '设备', row: e.row, reason: `清洗方式不在可选项:${e.data.cleaning_mode}` });
    if (e.data.room_code && !roomCodes.has(e.data.room_code)) errors.push({ sheet: '设备', row: e.row, reason: `房间编码不存在:${e.data.room_code}` });
    if (e.data.org_code && !orgIdByCode.has(e.data.org_code)) errors.push({ sheet: '设备', row: e.row, reason: `team 编码不存在(只认 team 层级):${e.data.org_code}` });
    if (e.data.station_code && !stationCodes.has(e.data.station_code)) errors.push({ sheet: '设备', row: e.row, reason: `CIP站编码不存在:${e.data.station_code}` });
    if (e.data.parent_code && !equipmentCodes.has(e.data.parent_code)) errors.push({ sheet: '设备', row: e.row, reason: `上级设备编码不存在:${e.data.parent_code}` });
    if (e.data.parent_code && e.data.parent_code === e.data.code) errors.push({ sheet: '设备', row: e.row, reason: `上级设备不能是自己:${e.data.code}` });
    ([['cip_minutes', 'CIP时长(分钟)'], ['rip_minutes', 'RIP时长(分钟)'], ['sip_minutes', 'SIP时长(分钟)'], ['dht_hours', 'DHT(小时)'], ['rht_hours', 'RHT(小时)'], ['cht_hours', 'CHT(小时)'], ['sht_hours', 'SHT(小时)']] as Array<[string, string]>)
      .forEach(([f, label]) => { if (e.data[f] && !/^\d+$/.test(e.data[f])) errors.push({ sheet: '设备', row: e.row, reason: `${label}须为非负整数:${e.data[f]}` }); });
  });
  pipelines.forEach((p) => {
    reqd('管线', p, [['code', '管线编码'], ['name', '管线名称'], ['from_code', '起点设备编码'], ['to_code', '终点设备编码'], ['station_code', 'CIP站编码']]);
    if (p.data.from_code && !equipmentCodes.has(p.data.from_code)) errors.push({ sheet: '管线', row: p.row, reason: `起点设备不存在:${p.data.from_code}` });
    if (p.data.to_code && !equipmentCodes.has(p.data.to_code)) errors.push({ sheet: '管线', row: p.row, reason: `终点设备不存在:${p.data.to_code}` });
    if (p.data.station_code && !stationCodes.has(p.data.station_code)) errors.push({ sheet: '管线', row: p.row, reason: `CIP站编码不存在:${p.data.station_code}` });
    ([['cip_minutes', 'CIP时长(分钟)'], ['rip_minutes', 'RIP时长(分钟)'], ['sip_minutes', 'SIP时长(分钟)'], ['dht_hours', 'DHT(小时)'], ['rht_hours', 'RHT(小时)'], ['cht_hours', 'CHT(小时)'], ['sht_hours', 'SHT(小时)']] as Array<[string, string]>)
      .forEach(([f, label]) => { if (p.data[f] && !/^\d+$/.test(p.data[f])) errors.push({ sheet: '管线', row: p.row, reason: `${label}须为非负整数:${p.data[f]}` }); });
  });
  shelfLives.forEach((s) => {
    reqd('物料效期', s, [['material', '物料'], ['category', '类别'], ['shelf_life_hours', '效期(小时)']]);
    if (s.data.category && !CATEGORY_MAP[s.data.category]) errors.push({ sheet: '物料效期', row: s.row, reason: `类别不在可选项:${s.data.category}` });
    if (s.data.basis && !BASIS_MAP[s.data.basis]) errors.push({ sheet: '物料效期', row: s.row, reason: `起算基准不在可选项:${s.data.basis}` });
    if (s.data.shelf_life_hours && !/^\d+$/.test(s.data.shelf_life_hours)) errors.push({ sheet: '物料效期', row: s.row, reason: `效期须为整数:${s.data.shelf_life_hours}` });
  });

  if (errors.length) {
    res.status(400).json({ success: false, error: `校验未通过,共 ${errors.length} 处`, errors });
    return;
  }

  const conn: PoolConnection = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const s of stations) {
      const orgId = s.data.org_code ? orgIdByCode.get(s.data.org_code) ?? null : null;
      await conn.execute(
        `INSERT INTO ps_cip_station (facility_code, code, name, org_unit_id, capacity, note) VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), org_unit_id=VALUES(org_unit_id), capacity=VALUES(capacity), note=VALUES(note)`,
        [facility, s.data.code, s.data.name, orgId, s.data.capacity ? Number(s.data.capacity) : 1, s.data.note || null],
      );
    }

    const [stRows] = await conn.execute<RowDataPacket[]>('SELECT id, code FROM ps_cip_station WHERE facility_code = ?', [facility]);
    const stIdByCode = new Map<string, number>(stRows.map((r) => [r.code, r.id]));

    for (const r of rooms) {
      const orgId = r.data.org_code ? orgIdByCode.get(r.data.org_code) ?? null : null;
      await conn.execute(
        `INSERT INTO ps_room (facility_code, code, name, org_unit_id, cleanroom_class, note) VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), org_unit_id=VALUES(org_unit_id), cleanroom_class=VALUES(cleanroom_class), note=VALUES(note)`,
        [facility, r.data.code, r.data.name, orgId, r.data.cleanroom_class || null, r.data.note || null],
      );
    }

    const [rmRows] = await conn.execute<RowDataPacket[]>('SELECT id, code FROM ps_room WHERE facility_code = ?', [facility]);
    const rmIdByCode = new Map<string, number>(rmRows.map((r) => [r.code, r.id]));

    for (const e of equipment) {
      const stationId = e.data.station_code ? stIdByCode.get(e.data.station_code) ?? null : null;
      const roomId = e.data.room_code ? rmIdByCode.get(e.data.room_code) ?? null : null;
      const orgId = e.data.org_code ? orgIdByCode.get(e.data.org_code) ?? null : null;
      const cleaningMode = e.data.cleaning_mode ? CLEAN_MODE_MAP[e.data.cleaning_mode] : 'cip';
      const eCipMin = e.data.cip_minutes ? Number(e.data.cip_minutes) : null;
      const eRipMin = e.data.rip_minutes ? Number(e.data.rip_minutes) : null;
      const eSipMin = e.data.sip_minutes ? Number(e.data.sip_minutes) : null;
      const eDht = e.data.dht_hours ? Number(e.data.dht_hours) : null;
      const eRht = e.data.rht_hours ? Number(e.data.rht_hours) : null;
      const eCht = e.data.cht_hours ? Number(e.data.cht_hours) : null;
      const eSht = e.data.sht_hours ? Number(e.data.sht_hours) : null;
      await conn.execute(
        `INSERT INTO ps_cip_equipment (facility_code, code, name, type_name, cleaning_mode, cip_station_id, cip_duration_minutes, rip_duration_minutes, sip_duration_minutes, dht_hours, rht_hours, cht_hours, sht_hours, room_id, org_unit_id, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), type_name=VALUES(type_name), cleaning_mode=VALUES(cleaning_mode), cip_station_id=VALUES(cip_station_id), cip_duration_minutes=VALUES(cip_duration_minutes), rip_duration_minutes=VALUES(rip_duration_minutes), sip_duration_minutes=VALUES(sip_duration_minutes), dht_hours=VALUES(dht_hours), rht_hours=VALUES(rht_hours), cht_hours=VALUES(cht_hours), sht_hours=VALUES(sht_hours), room_id=VALUES(room_id), org_unit_id=VALUES(org_unit_id), note=VALUES(note)`,
        [facility, e.data.code, e.data.name, e.data.type || null, cleaningMode, stationId, eCipMin, eRipMin, eSipMin, eDht, eRht, eCht, eSht, roomId, orgId, e.data.note || null],
      );
    }

    const [eqRows] = await conn.execute<RowDataPacket[]>('SELECT id, code FROM ps_cip_equipment WHERE facility_code = ?', [facility]);
    const eqIdByCode = new Map<string, number>(eqRows.map((r) => [r.code, r.id]));

    // 上级设备(自引用)第二趟:此刻所有设备已有 id,按编码回填 parent(表为准:有则连,空则断)。
    for (const e of equipment) {
      const parentId = e.data.parent_code ? eqIdByCode.get(e.data.parent_code) ?? null : null;
      await conn.execute('UPDATE ps_cip_equipment SET parent_equipment_id = ? WHERE facility_code = ? AND code = ?', [parentId, facility, e.data.code]);
    }

    for (const p of pipelines) {
      const fromId = eqIdByCode.get(p.data.from_code);
      const toId = eqIdByCode.get(p.data.to_code);
      const stationId = stIdByCode.get(p.data.station_code);
      if (fromId === undefined || toId === undefined || stationId === undefined) {
        throw new Error(`管线 ${p.data.code} 引用未解析(起点/终点/站)`);
      }
      const pCipMin = p.data.cip_minutes ? Number(p.data.cip_minutes) : null;
      const pRipMin = p.data.rip_minutes ? Number(p.data.rip_minutes) : null;
      const pSipMin = p.data.sip_minutes ? Number(p.data.sip_minutes) : null;
      const pDht = p.data.dht_hours ? Number(p.data.dht_hours) : null;
      const pRht = p.data.rht_hours ? Number(p.data.rht_hours) : null;
      const pCht = p.data.cht_hours ? Number(p.data.cht_hours) : null;
      const pSht = p.data.sht_hours ? Number(p.data.sht_hours) : null;
      await conn.execute(
        `INSERT INTO ps_pipeline (facility_code, code, name, from_equipment_id, to_equipment_id, cip_station_id, cip_duration_minutes, rip_duration_minutes, sip_duration_minutes, dht_hours, rht_hours, cht_hours, sht_hours, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), from_equipment_id=VALUES(from_equipment_id), to_equipment_id=VALUES(to_equipment_id), cip_station_id=VALUES(cip_station_id), cip_duration_minutes=VALUES(cip_duration_minutes), rip_duration_minutes=VALUES(rip_duration_minutes), sip_duration_minutes=VALUES(sip_duration_minutes), dht_hours=VALUES(dht_hours), rht_hours=VALUES(rht_hours), cht_hours=VALUES(cht_hours), sht_hours=VALUES(sht_hours), note=VALUES(note)`,
        [facility, p.data.code, p.data.name, fromId, toId, stationId, pCipMin, pRipMin, pSipMin, pDht, pRht, pCht, pSht, p.data.note || null],
      );
    }

    for (const s of shelfLives) {
      await conn.execute(
        `INSERT INTO ps_shelf_life (facility_code, material, category, shelf_life_hours, basis, note) VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE shelf_life_hours=VALUES(shelf_life_hours), basis=VALUES(basis), note=VALUES(note)`,
        [facility, s.data.material, CATEGORY_MAP[s.data.category], Number(s.data.shelf_life_hours),
          s.data.basis ? BASIS_MAP[s.data.basis] : 'after_produced', s.data.note || null],
      );
    }

    await conn.commit();
    res.json({
      success: true,
      data: { summary: { stations: stations.length, rooms: rooms.length, equipment: equipment.length, pipelines: pipelines.length, shelfLives: shelfLives.length } },
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: `导入失败(已回滚):${(err as Error).message}` });
  } finally {
    conn.release();
  }
}
