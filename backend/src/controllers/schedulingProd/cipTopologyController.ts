/**
 * 排产资源主数据 · CIP 拓扑的真 CRUD(平台,用户自己录入,无 mock)。
 *
 * 配置驱动:4 张 ps_* 表共用一套增删改查,列名白名单防注入。
 *   stations  → ps_cip_station   pipelines → ps_pipeline
 *   equipment → ps_cip_equipment shelf-life → ps_shelf_life
 */
import type { Request, Response } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/database';

interface EntityConfig {
  table: string;
  columns: string[]; // 可写列(不含 id / 时间戳)
  required: string[];
  nullable: string[]; // 空串 → NULL
}

const ENTITIES: Record<string, EntityConfig> = {
  stations: {
    table: 'ps_cip_station',
    columns: ['facility_code', 'code', 'name', 'org_unit_id', 'capacity', 'resource_id', 'note'],
    required: ['facility_code', 'code', 'name'],
    nullable: ['org_unit_id', 'resource_id', 'note'],
  },
  rooms: {
    table: 'ps_room',
    columns: ['facility_code', 'code', 'name', 'org_unit_id', 'cleanroom_class', 'note'],
    required: ['facility_code', 'code', 'name'],
    nullable: ['org_unit_id', 'cleanroom_class', 'note'],
  },
  equipment: {
    table: 'ps_cip_equipment',
    columns: ['facility_code', 'code', 'name', 'type_name', 'cleaning_mode', 'cip_station_id', 'sm_template_id', 'cip_duration_minutes', 'rip_duration_minutes', 'sip_duration_minutes', 'dht_hours', 'rht_hours', 'cht_hours', 'sht_hours', 'room_id', 'org_unit_id', 'parent_equipment_id', 'resource_id', 'note'],
    required: ['facility_code', 'code', 'name'],
    nullable: ['type_name', 'cip_station_id', 'sm_template_id', 'cip_duration_minutes', 'rip_duration_minutes', 'sip_duration_minutes', 'dht_hours', 'rht_hours', 'cht_hours', 'sht_hours', 'room_id', 'org_unit_id', 'parent_equipment_id', 'resource_id', 'note'],
  },
  pipelines: {
    table: 'ps_pipeline',
    columns: ['facility_code', 'code', 'name', 'from_equipment_id', 'to_equipment_id', 'cip_station_id', 'sm_template_id', 'cip_duration_minutes', 'rip_duration_minutes', 'sip_duration_minutes', 'dht_hours', 'rht_hours', 'cht_hours', 'sht_hours', 'note'],
    required: ['facility_code', 'code', 'name', 'from_equipment_id', 'to_equipment_id', 'cip_station_id'],
    nullable: ['sm_template_id', 'cip_duration_minutes', 'rip_duration_minutes', 'sip_duration_minutes', 'dht_hours', 'rht_hours', 'cht_hours', 'sht_hours', 'note'],
  },
  'shelf-life': {
    table: 'ps_shelf_life',
    columns: ['facility_code', 'material', 'category', 'shelf_life_hours', 'basis', 'note'],
    required: ['facility_code', 'material', 'category', 'shelf_life_hours'],
    nullable: ['note'],
  },
  // 设备类型字典:全局(不带 facility_code),name 即类型值,供设备/Excel 取值
  'equipment-types': {
    table: 'ps_equipment_type',
    columns: ['name', 'sort_order', 'is_active', 'note', 'sm_template_id'],
    required: ['name'],
    nullable: ['note', 'sm_template_id'],
  },
  // 状态机模板库:全局,设备/类型绑它
  'sm-templates': {
    table: 'ps_sm_template',
    columns: ['code', 'name', 'note', 'is_active', 'sort_order'],
    required: ['code', 'name'],
    nullable: ['note'],
  },
};

function cfg(entity: string): EntityConfig | null {
  return ENTITIES[entity] ?? null;
}

function pickColumns(cfgEntity: EntityConfig, body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of cfgEntity.columns) {
    if (Object.prototype.hasOwnProperty.call(body, col)) {
      let v = body[col];
      if (cfgEntity.nullable.includes(col) && (v === '' || v === undefined)) v = null;
      out[col] = v;
    }
  }
  return out;
}

async function readRow(table: string, id: number): Promise<RowDataPacket | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

/** 组织单元(部门/team/组)扁平清单,供前端「归属组织」下拉。排班的 team 即在该表。 */
export async function listOrgUnits(_req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id, unit_code AS code, unit_name AS name, unit_type AS type, parent_id FROM organization_units WHERE is_active = 1 ORDER BY unit_type, sort_order, id",
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function listEntity(req: Request, res: Response): Promise<void> {
  const c = cfg(req.params.entity);
  if (!c) {
    res.status(404).json({ success: false, error: `未知资源类型: ${req.params.entity}` });
    return;
  }
  try {
    const facility = req.query.facilityCode ? String(req.query.facilityCode) : null;
    const where = facility ? ' WHERE facility_code = ?' : '';
    const params = facility ? [facility] : [];
    const [rows] = await pool.execute<RowDataPacket[]>(`SELECT * FROM ${c.table}${where} ORDER BY id`, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

/** 某状态机模板的转移规则(只读列表)。GET /cip/sm-templates/:id/transitions */
export async function listTemplateTransitions(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: 'id 非法' });
      return;
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ps_sm_transition WHERE template_id = ? ORDER BY attribute, sort_order, id',
      [id],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

// 转移可写列白名单(自由建模:结构 + 时序 + 前提全可改;template_id 由路由/不可改)
const TXN_WRITE_COLS = [
  'attribute', 'from_state', 'action', 'to_state',
  'duration_minutes', 'duration_col',
  'start_within_hours', 'start_within_col',
  'produces_validity_hours', 'produces_validity_col',
  'requires_json', 'sort_order', 'note',
];
const TXN_REQUIRED = ['attribute', 'from_state', 'action', 'to_state'];
// 空串 → NULL 的列(数值/可空映射/前提/备注);结构必填列不在此列(空会被必填校验拦)
const TXN_NULLABLE = new Set([
  'duration_minutes', 'duration_col', 'start_within_hours', 'start_within_col',
  'produces_validity_hours', 'produces_validity_col', 'requires_json', 'note',
]);

/** 把一个转移列的传入值规整为可写值(requires_json 对象 → JSON 串;空 → NULL)。 */
function coerceTxnValue(col: string, v: unknown): unknown {
  if (col === 'requires_json') {
    if (v == null || v === '') return null;
    if (typeof v === 'object') {
      // 空对象 {} 视为无前提
      if (!Array.isArray(v) && Object.keys(v as object).length === 0) return null;
      return JSON.stringify(v);
    }
    return String(v); // 已是 JSON 串
  }
  if (TXN_NULLABLE.has(col) && (v === '' || v === undefined)) return null;
  return v;
}

function isDupErr(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

/** 新增一条转移规则(归属 URL 上的模板)。POST /cip/sm-templates/:id/transitions */
export async function createTransition(req: Request, res: Response): Promise<void> {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isFinite(templateId)) {
      res.status(400).json({ success: false, error: '模板 id 非法' });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const missing = TXN_REQUIRED.filter((f) => body[f] === undefined || body[f] === '' || body[f] === null);
    if (missing.length) {
      res.status(400).json({ success: false, error: `缺少必填字段: ${missing.join(', ')}` });
      return;
    }
    const cols = ['template_id'];
    const values: unknown[] = [templateId];
    for (const col of TXN_WRITE_COLS) {
      if (Object.prototype.hasOwnProperty.call(body, col)) {
        cols.push(col);
        values.push(coerceTxnValue(col, body[col]));
      }
    }
    const placeholders = cols.map(() => '?').join(', ');
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ps_sm_transition (${cols.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    const row = await readRow('ps_sm_transition', result.insertId);
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (isDupErr(err)) {
      res.status(409).json({ success: false, error: '该转移已存在(同模板 + 属性 + 起始态 + 动作)' });
      return;
    }
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

/**
 * 改一条转移(自由建模:结构/时序/前提全可改)。PUT /cip/sm-transitions/:id
 * 仅更新明确传入的列;改时长抽屉只传 3 个数值,整张表单则传全部。
 */
export async function updateTransition(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: 'id 非法' });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    // 若传了结构必填列,不许置空
    for (const f of TXN_REQUIRED) {
      if (Object.prototype.hasOwnProperty.call(body, f) && (body[f] === '' || body[f] === null)) {
        res.status(400).json({ success: false, error: `${f} 不能为空` });
        return;
      }
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const col of TXN_WRITE_COLS) {
      if (Object.prototype.hasOwnProperty.call(body, col)) {
        sets.push(`${col} = ?`);
        values.push(coerceTxnValue(col, body[col]));
      }
    }
    if (!sets.length) {
      res.status(400).json({ success: false, error: '无可更新字段' });
      return;
    }
    values.push(id);
    const [result] = await pool.execute<ResultSetHeader>(`UPDATE ps_sm_transition SET ${sets.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, error: '转移规则不存在' });
      return;
    }
    const row = await readRow('ps_sm_transition', id);
    res.json({ success: true, data: row });
  } catch (err) {
    if (isDupErr(err)) {
      res.status(409).json({ success: false, error: '改后与已有转移重复(同模板 + 属性 + 起始态 + 动作)' });
      return;
    }
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

/** 删一条转移。DELETE /cip/sm-transitions/:id */
export async function deleteTransition(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: 'id 非法' });
      return;
    }
    const [result] = await pool.execute<ResultSetHeader>('DELETE FROM ps_sm_transition WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, error: '转移规则不存在' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function createEntity(req: Request, res: Response): Promise<void> {
  const c = cfg(req.params.entity);
  if (!c) {
    res.status(404).json({ success: false, error: `未知资源类型: ${req.params.entity}` });
    return;
  }
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const missing = c.required.filter((f) => body[f] === undefined || body[f] === '' || body[f] === null);
    if (missing.length) {
      res.status(400).json({ success: false, error: `缺少必填字段: ${missing.join(', ')}` });
      return;
    }
    const data = pickColumns(c, body);
    const cols = Object.keys(data);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map((k) => data[k]);
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ${c.table} (${cols.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    const row = await readRow(c.table, result.insertId);
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function updateEntity(req: Request, res: Response): Promise<void> {
  const c = cfg(req.params.entity);
  if (!c) {
    res.status(404).json({ success: false, error: `未知资源类型: ${req.params.entity}` });
    return;
  }
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: 'id 非法' });
      return;
    }
    const data = pickColumns(c, (req.body || {}) as Record<string, unknown>);
    if (req.params.entity === 'equipment' && data.parent_equipment_id != null && Number(data.parent_equipment_id) === id) {
      res.status(400).json({ success: false, error: '上级设备不能是自己' });
      return;
    }
    // 设备类型字典改名:先记旧名,改完级联回写引用它的设备 type_name
    let oldTypeName: string | null = null;
    if (req.params.entity === 'equipment-types' && data.name !== undefined) {
      const cur = await readRow(c.table, id);
      oldTypeName = cur ? String(cur.name) : null;
    }
    const cols = Object.keys(data);
    if (!cols.length) {
      res.status(400).json({ success: false, error: '无可更新字段' });
      return;
    }
    const setClause = cols.map((k) => `${k} = ?`).join(', ');
    const values = cols.map((k) => data[k]);
    values.push(id);
    const [result] = await pool.execute<ResultSetHeader>(`UPDATE ${c.table} SET ${setClause} WHERE id = ?`, values);
    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, error: '记录不存在' });
      return;
    }
    if (oldTypeName != null && data.name != null && String(data.name) !== oldTypeName) {
      await pool.execute('UPDATE ps_cip_equipment SET type_name = ? WHERE type_name = ?', [data.name, oldTypeName]);
    }
    const row = await readRow(c.table, id);
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function deleteEntity(req: Request, res: Response): Promise<void> {
  const c = cfg(req.params.entity);
  if (!c) {
    res.status(404).json({ success: false, error: `未知资源类型: ${req.params.entity}` });
    return;
  }
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ success: false, error: 'id 非法' });
      return;
    }
    // 设备类型字典:被设备引用时不许删(避免孤立 type_name),提示改用「停用」
    if (req.params.entity === 'equipment-types') {
      const row = await readRow(c.table, id);
      if (row) {
        const [used] = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) AS n FROM ps_cip_equipment WHERE type_name = ?', [row.name]);
        const n = Number(used[0]?.n ?? 0);
        if (n > 0) {
          res.status(409).json({ success: false, error: `该类型已被 ${n} 台设备使用,不能删除;可改为「停用」` });
          return;
        }
      }
    }
    const [result] = await pool.execute<ResultSetHeader>(`DELETE FROM ${c.table} WHERE id = ?`, [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ success: false, error: '记录不存在' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    // 外键约束(如管线被设备引用)→ 友好提示
    res.status(409).json({ success: false, error: `删除失败(可能被引用): ${(err as Error).message}` });
  }
}
