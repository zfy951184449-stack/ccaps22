/**
 * 资源节点 Excel 导入(平台批量入口,创建-only,仅结构,无 mock)。
 *
 * 模型:单 Sheet「节点」平铺一行一节点;父子用「上级节点编码」(父节点 node_code)表达。
 * 流程:解析 → 引用按编码解析(父节点)→ 全表逐行校验(每行独立打标,不阻断其它行) →
 *   已存在编码标「跳过」(创建-only/幂等) → 父在子前拓扑排序 → 单事务复用 createResourceNode 插入。
 *   任一行有阻断错误则整批拒绝(预检 200 / 正式导入 400),零写入。
 *
 * 复用 resourceNodeService 的 createResourceNode 与三个校验器(assertNodeSubtype /
 * assertEquipmentAttributes / assertParentChildRule),保证与单节点新建口径完全一致。
 */
import type { Request, Response } from 'express';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import XLSX from 'xlsx';
import pool from '../config/database';
import { isMissingTableError } from '../utils/missingTableGuard';
import {
  assertEquipmentAttributes,
  assertNodeSubtype,
  assertParentChildRule,
  createResourceNode,
} from '../services/resourceNodeService';
import type { ResourceNodeClass } from '../services/resourceNodeService';
import {
  IMPORT_FIELD_BY_HEADER,
  NODE_CLASS_BY_LABEL,
  NODE_SCOPE_BY_LABEL,
  NODE_SUBTYPE_BY_LABEL,
  SYSTEM_TYPE_BY_LABEL,
  parseActiveLabel,
} from '../services/resourceNodeImportMaps';

const SHEET_NAME = '节点';

const norm = (h: unknown): string =>
  String(h ?? '').replace(/\*/g, '').replace(/[（(][^)）]*[)）]/g, '').trim();

function readSheet(
  wb: XLSX.WorkBook,
  preferredName: string,
  fieldByHeader: Record<string, string>,
): Array<{ row: number; data: Record<string, string> }> {
  // 优先用约定 Sheet 名;用户自建文件可能只有默认表,退化到第一个 Sheet。
  const name = wb.SheetNames.includes(preferredName) ? preferredName : wb.SheetNames[0];
  const sheet = name ? wb.Sheets[name] : undefined;
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  if (!rows.length) return [];
  const headers = (rows[0] as unknown[]).map(norm);
  const colOf: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (fieldByHeader[h] !== undefined) colOf[fieldByHeader[h]] = i;
  });
  const out: Array<{ row: number; data: Record<string, string> }> = [];
  for (let r = 1; r < rows.length; r += 1) {
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

type RowStatus = 'create' | 'skip' | 'error';

interface ParsedRow {
  row: number;
  nodeCode: string;
  nodeName: string;
  nodeClass: string; // 解析后的枚举值(无法识别则为 '')
  nodeClassRaw: string;
  nodeSubtype: string | null; // 解析后的枚举值(COMPONENT 透传原值)
  parentCode: string | null;
  nodeScope: string | null;
  departmentCode: string | null;
  equipmentSystemType: string | null;
  equipmentClass: string | null;
  equipmentModel: string | null;
  sortOrder: string;
  isActive: boolean;
  status: RowStatus;
  skipReason: string | null;
  errors: string[];
}

interface CodeMeta {
  node_class: ResourceNodeClass;
  node_subtype: string | null;
}

class ParseError extends Error {}

interface ParseResult {
  rows: ParsedRow[];
  canImport: boolean;
  summary: { total: number; toCreate: number; toSkip: number; errors: number };
}

const blank = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/**
 * 解析 + 全表校验(无写入)。供预检与正式导入共用。
 * 抛 ParseError → 文件级 400;抛缺表错误 → 由调用方转 409。
 */
async function parseAndValidate(buffer: Buffer): Promise<ParseResult> {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new ParseError('无法解析 Excel 文件');
  }

  const raw = readSheet(wb, SHEET_NAME, IMPORT_FIELD_BY_HEADER);
  if (!raw.length) {
    throw new ParseError(`「${SHEET_NAME}」表为空或缺失,且未找到可识别的列`);
  }

  // 已有节点编码 → 元信息(用于跳过已存在 + 父节点层级校验)
  const [exRows] = await pool.execute<RowDataPacket[]>(
    'SELECT node_code, node_class, node_subtype FROM resource_nodes',
  );
  const existingCodes = new Set<string>(exRows.map((r) => String(r.node_code)));
  const codeMeta = new Map<string, CodeMeta>();
  exRows.forEach((r) => {
    codeMeta.set(String(r.node_code), {
      node_class: String(r.node_class) as ResourceNodeClass,
      node_subtype: r.node_subtype ? String(r.node_subtype) : null,
    });
  });

  // 第一趟:逐行解析字段 + 解析枚举,登记本工作簿内编码元信息(供父子校验)
  const rows: ParsedRow[] = raw.map(({ row, data }) => {
    const nodeClassRaw = blank(data.nodeClass) ?? '';
    const nodeClass = NODE_CLASS_BY_LABEL[nodeClassRaw] ?? '';
    const subtypeRaw = blank(data.nodeSubtype);
    // ROOM/UTILITY_STATION 走标签表;COMPONENT 等透传原值交给 assertNodeSubtype 归一
    const nodeSubtype = subtypeRaw ? NODE_SUBTYPE_BY_LABEL[subtypeRaw] ?? subtypeRaw : null;
    const scopeRaw = blank(data.nodeScope);
    const nodeScope = scopeRaw ? NODE_SCOPE_BY_LABEL[scopeRaw] ?? scopeRaw : null;
    const sysRaw = blank(data.equipmentSystemType);
    const equipmentSystemType = sysRaw ? SYSTEM_TYPE_BY_LABEL[sysRaw] ?? sysRaw : null;
    return {
      row,
      nodeCode: blank(data.nodeCode) ?? '',
      nodeName: blank(data.nodeName) ?? '',
      nodeClass,
      nodeClassRaw,
      nodeSubtype,
      parentCode: blank(data.parentCode),
      nodeScope,
      departmentCode: blank(data.departmentCode),
      equipmentSystemType,
      equipmentClass: blank(data.equipmentClass),
      equipmentModel: blank(data.equipmentModel),
      sortOrder: blank(data.sortOrder) ?? '',
      isActive: data.isActive ? parseActiveLabel(data.isActive) : true,
      status: 'create',
      skipReason: null,
      errors: [],
    };
  });

  // 本工作簿内编码 → 出现行(查重)与元信息(供父子层级解析)
  const workbookRowsByCode = new Map<string, ParsedRow[]>();
  rows.forEach((r) => {
    if (!r.nodeCode) return;
    const list = workbookRowsByCode.get(r.nodeCode) ?? [];
    list.push(r);
    workbookRowsByCode.set(r.nodeCode, list);
    if (r.nodeClass) {
      // 本工作簿声明覆盖(若与已有库冲突会在跳过判定里处理)
      codeMeta.set(r.nodeCode, {
        node_class: r.nodeClass as ResourceNodeClass,
        node_subtype: r.nodeSubtype,
      });
    }
  });

  // 第二趟:逐行校验
  rows.forEach((r) => {
    // 必填
    if (!r.nodeCode) r.errors.push('缺必填:节点编码');
    if (!r.nodeName) r.errors.push('缺必填:节点名称');
    if (!r.nodeClassRaw) {
      r.errors.push('缺必填:节点类型');
    } else if (!r.nodeClass) {
      r.errors.push(`节点类型无法识别:${r.nodeClassRaw}`);
    }

    // 工作簿内编码查重(第二次及以后出现的行报错)
    if (r.nodeCode) {
      const dupRows = workbookRowsByCode.get(r.nodeCode) ?? [];
      if (dupRows.length > 1 && dupRows[0] !== r) {
        r.errors.push(`节点编码在本文件内重复:${r.nodeCode}`);
      }
    }

    if (!r.nodeClass) return; // 类型未知,后续结构校验无意义

    const childClass = r.nodeClass as ResourceNodeClass;

    // 子类型(复用服务校验器,口径与单节点新建一致)
    let normalizedSubtype: string | null = null;
    try {
      normalizedSubtype = assertNodeSubtype(childClass, r.nodeSubtype);
      r.nodeSubtype = normalizedSubtype;
    } catch (e) {
      r.errors.push((e as Error).message);
    }

    // 设备属性
    try {
      assertEquipmentAttributes(childClass, {
        equipmentSystemType: r.equipmentSystemType,
        equipmentClass: r.equipmentClass,
        equipmentModel: r.equipmentModel,
      });
    } catch (e) {
      r.errors.push((e as Error).message);
    }

    // 归属范围 / 部门(仅校验非法取值,空值留给服务推断)
    if (r.nodeScope && r.nodeScope !== 'GLOBAL' && r.nodeScope !== 'DEPARTMENT') {
      r.errors.push(`归属范围无法识别:${r.nodeScope}`);
    }

    // 父节点解析 + 层级校验
    if (r.parentCode) {
      if (r.parentCode === r.nodeCode) {
        r.errors.push('上级节点不能是自己');
      } else if (!existingCodes.has(r.parentCode) && !workbookRowsByCode.has(r.parentCode)) {
        r.errors.push(`上级节点编码不存在:${r.parentCode}`);
      } else {
        const parentMeta = codeMeta.get(r.parentCode) ?? null;
        try {
          assertParentChildRule(parentMeta, childClass, normalizedSubtype);
        } catch (e) {
          r.errors.push((e as Error).message);
        }
      }
    } else {
      // 无父 = 根,仅 SITE 合法
      try {
        assertParentChildRule(null, childClass, normalizedSubtype);
      } catch (e) {
        r.errors.push((e as Error).message);
      }
    }
  });

  // 跳过已存在编码(创建-only / 幂等);仅对当前无错误的行
  rows.forEach((r) => {
    if (r.errors.length) {
      r.status = 'error';
      return;
    }
    if (r.nodeCode && existingCodes.has(r.nodeCode)) {
      r.status = 'skip';
      r.skipReason = '节点编码已存在(跳过)';
    }
  });

  // 循环引用检测:父在子前(仅在「待创建」行之间连边;父若已在库则无需排序)
  detectCycles(rows);

  const canImport = rows.every((r) => r.status !== 'error');
  const summary = {
    total: rows.length,
    toCreate: rows.filter((r) => r.status === 'create').length,
    toSkip: rows.filter((r) => r.status === 'skip').length,
    errors: rows.filter((r) => r.status === 'error').length,
  };
  return { rows, canImport, summary };
}

/** 检测「待创建」行之间的上级循环引用,命中则把环上各行标为 error。 */
function detectCycles(rows: ParsedRow[]): void {
  const creatable = new Map<string, ParsedRow>();
  rows.forEach((r) => {
    if (r.status !== 'error' && r.nodeCode) creatable.set(r.nodeCode, r);
  });

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  creatable.forEach((_, code) => color.set(code, WHITE));

  const visit = (code: string, stack: string[]): void => {
    color.set(code, GREY);
    stack.push(code);
    const node = creatable.get(code);
    const parent = node?.parentCode;
    // 只在「本工作簿且待创建」的父上递归(已在库的父不会成环)
    if (parent && creatable.has(parent)) {
      const c = color.get(parent);
      if (c === GREY) {
        // 找到环:从 stack 中 parent 之后到当前都属于环
        const idx = stack.indexOf(parent);
        const cycle = stack.slice(idx);
        cycle.forEach((cc) => {
          const rr = creatable.get(cc);
          if (rr && !rr.errors.includes('检测到上级节点循环引用')) {
            rr.errors.push('检测到上级节点循环引用');
            rr.status = 'error';
          }
        });
      } else if (c === WHITE) {
        visit(parent, stack);
      }
    }
    stack.pop();
    color.set(code, BLACK);
  };

  creatable.forEach((_, code) => {
    if (color.get(code) === WHITE) visit(code, []);
  });
}

/** 把「待创建」行按父在子前排序(同名父优先)。已确保无环。 */
function topoSortCreatable(rows: ParsedRow[]): ParsedRow[] {
  const creatable = rows.filter((r) => r.status === 'create');
  const byCode = new Map<string, ParsedRow>();
  creatable.forEach((r) => byCode.set(r.nodeCode, r));

  const ordered: ParsedRow[] = [];
  const done = new Set<ParsedRow>();
  const visit = (r: ParsedRow): void => {
    if (done.has(r)) return;
    if (r.parentCode && byCode.has(r.parentCode)) {
      visit(byCode.get(r.parentCode)!);
    }
    done.add(r);
    ordered.push(r);
  };
  creatable.forEach(visit);
  return ordered;
}

const respondParse = (result: ParseResult, dryRun: boolean) => {
  const shaped = {
    dry_run: dryRun,
    can_import: result.canImport,
    summary: result.summary,
    rows: result.rows.map((r) => ({
      row: r.row,
      nodeCode: r.nodeCode,
      nodeName: r.nodeName,
      nodeClass: r.nodeClass || r.nodeClassRaw,
      parentCode: r.parentCode,
      status: r.status,
      skipReason: r.skipReason,
      errors: r.errors,
    })),
  };
  return shaped;
};

export async function previewResourceNodeImport(req: Request, res: Response): Promise<void> {
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (!file) {
    res.status(400).json({ success: false, error: '未收到文件' });
    return;
  }
  try {
    const result = await parseAndValidate(file.buffer);
    res.json({ success: true, data: respondParse(result, true) });
  } catch (error) {
    if (error instanceof ParseError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    if (isMissingTableError(error)) {
      res.status(409).json({ success: false, error: '资源节点模型不可用(缺表)' });
      return;
    }
    console.error('Failed to preview resource node import:', error);
    res.status(500).json({ success: false, error: '预检失败' });
  }
}

export async function importResourceNodes(req: Request, res: Response): Promise<void> {
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (!file) {
    res.status(400).json({ success: false, error: '未收到文件' });
    return;
  }

  let result: ParseResult;
  try {
    result = await parseAndValidate(file.buffer);
  } catch (error) {
    if (error instanceof ParseError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    if (isMissingTableError(error)) {
      res.status(409).json({ success: false, error: '资源节点模型不可用(缺表)' });
      return;
    }
    console.error('Failed to parse resource node import:', error);
    res.status(500).json({ success: false, error: '导入解析失败' });
    return;
  }

  if (!result.canImport) {
    res.status(400).json({
      success: false,
      error: `校验未通过,共 ${result.summary.errors} 行有阻断错误`,
      data: respondParse(result, false),
    });
    return;
  }

  const ordered = topoSortCreatable(result.rows);
  const conn: PoolConnection = await pool.getConnection();
  let failedRow: ParsedRow | null = null;
  try {
    await conn.beginTransaction();

    // 编码 → id:已在库的预载,新建后回填,供子节点解析父 id
    const idByCode = new Map<string, number>();
    const [exRows] = await conn.execute<RowDataPacket[]>('SELECT id, node_code FROM resource_nodes');
    exRows.forEach((r) => idByCode.set(String(r.node_code), Number(r.id)));

    for (const r of ordered) {
      failedRow = r;
      const parentId = r.parentCode ? idByCode.get(r.parentCode) ?? null : null;
      const newId = await createResourceNode(
        {
          node_code: r.nodeCode,
          node_name: r.nodeName,
          node_class: r.nodeClass as ResourceNodeClass,
          node_subtype: r.nodeSubtype,
          parent_id: parentId,
          node_scope: (r.nodeScope as 'GLOBAL' | 'DEPARTMENT' | undefined) ?? undefined,
          department_code: r.departmentCode,
          equipment_system_type: (r.equipmentSystemType as never) ?? null,
          equipment_class: r.equipmentClass,
          equipment_model: r.equipmentModel,
          sort_order: r.sortOrder ? Number(r.sortOrder) : undefined,
          is_active: r.isActive,
        },
        conn,
      );
      idByCode.set(r.nodeCode, newId);
      r.status = 'create';
    }
    failedRow = null;

    await conn.commit();
    const created = ordered.length;
    const skipped = result.rows.filter((r) => r.status === 'skip').length;
    res.json({
      success: true,
      data: {
        dry_run: false,
        can_import: true,
        summary: { total: result.rows.length, created, skipped, failed: 0 },
        rows: respondParse(result, false).rows,
      },
    });
  } catch (error) {
    await conn.rollback();
    if (isMissingTableError(error)) {
      res.status(409).json({ success: false, error: '资源节点模型不可用(缺表)' });
      return;
    }
    const where = failedRow ? `第 ${failedRow.row} 行(${failedRow.nodeCode})` : '';
    res.status(500).json({
      success: false,
      error: `导入失败(已回滚):${where} ${(error as Error).message}`.trim(),
    });
  } finally {
    conn.release();
  }
}
