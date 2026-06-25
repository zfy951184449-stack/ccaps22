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
    columns: ['facility_code', 'code', 'name', 'department', 'capacity', 'resource_id', 'note'],
    required: ['facility_code', 'code', 'name'],
    nullable: ['department', 'resource_id', 'note'],
  },
  equipment: {
    table: 'ps_cip_equipment',
    columns: ['facility_code', 'code', 'name', 'type', 'cip_station_id', 'resource_id', 'note'],
    required: ['facility_code', 'code', 'name'],
    nullable: ['cip_station_id', 'resource_id', 'note'],
  },
  pipelines: {
    table: 'ps_pipeline',
    columns: ['facility_code', 'code', 'name', 'from_equipment_id', 'to_equipment_id', 'cip_station_id', 'note'],
    required: ['facility_code', 'code', 'name', 'from_equipment_id', 'to_equipment_id', 'cip_station_id'],
    nullable: ['note'],
  },
  'shelf-life': {
    table: 'ps_shelf_life',
    columns: ['facility_code', 'material', 'category', 'shelf_life_hours', 'basis', 'note'],
    required: ['facility_code', 'material', 'category', 'shelf_life_hours'],
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
