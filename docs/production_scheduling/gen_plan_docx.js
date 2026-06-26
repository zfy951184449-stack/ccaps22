'use strict';
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TableOfContents
} = require('docx');
const fs = require('fs');

// ── helpers ──────────────────────────────────────────────────────────────────
const OUT = '/Users/zhengfengyi/MFG8APS/docs/production_scheduling/paichan_build_plan.docx';

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

// 9360 DXA = content width (US Letter, 1" margins)
const TW = 9360;

// shading helpers
function shade(hex) { return { fill: hex, type: ShadingType.CLEAR }; }

// cell factory
function cell(text, opts = {}) {
  const {
    w = 4680, bold = false, color = '1E293B', size = 20, bg = null,
    align = AlignmentType.LEFT, vAlign = VerticalAlign.CENTER, colspan = 1
  } = opts;
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    borders: BORDERS,
    margins: { top: 80, bottom: 80, left: 160, right: 160 },
    shading: bg ? shade(bg) : undefined,
    verticalAlign: vAlign,
    columnSpan: colspan,
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text, bold, color, size, font: 'Arial' })]
    })]
  });
}

function hcell(text, opts = {}) {
  return cell(text, { bold: true, color: 'FFFFFF', bg: '2563EB', size: 20, ...opts });
}

function row(...cells) { return new TableRow({ children: cells }); }

// paragraph helpers
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [new TextRun({ text, bold: true, size: 36, font: 'Arial', color: '1E3A8A' })]
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28, font: 'Arial', color: '1D4ED8' })]
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, font: 'Arial', color: '2563EB' })]
  });
}
function p(text, opts = {}) {
  const { bold = false, color = '334155', size = 22, spacing = { before: 60, after: 60 } } = opts;
  return new Paragraph({
    spacing,
    children: [new TextRun({ text, bold, color, size, font: 'Arial' })]
  });
}
function pb() { return new Paragraph({ children: [new PageBreak()] }); }
function space(n = 1) {
  return new Paragraph({ spacing: { before: 0, after: n * 120 }, children: [new TextRun('')] });
}
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '334155' })]
  });
}
function warn(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text: '⚠ ' + text, size: 22, font: 'Arial', color: 'B45309', bold: true })]
  });
}

// ── Cover page ────────────────────────────────────────────────────────────────
function coverSection() {
  return [
    space(8),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
      children: [new TextRun({ text: '排产系统建设计划', bold: true, size: 72, font: 'Arial', color: '1E3A8A' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 480 },
      children: [new TextRun({ text: 'Production Scheduling Build Plan', size: 40, font: 'Arial', color: '2563EB' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: 'MFG8APS — CCAPS22 生物制药 APS 系统', size: 26, font: 'Arial', color: '64748B' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: '内部技术文档 · 不对外公开', size: 22, font: 'Arial', color: '94A3B8' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: '2026 年 6 月 26 日', size: 22, font: 'Arial', color: '64748B' })]
    }),
    pb()
  ];
}

// ── Section 0: 项目现状快照 ───────────────────────────────────────────────────
function section0() {
  const statusTable = new Table({
    width: { size: TW, type: WidthType.DXA },
    columnWidths: [2200, 3400, 1400, 2360],
    rows: [
      row(
        hcell('阶段', { w: 2200 }),
        hcell('里程碑', { w: 3400 }),
        hcell('状态', { w: 1400 }),
        hcell('备注', { w: 2360 })
      ),
      row(cell('模型层', { w: 2200, bg: 'EEF2FF' }), cell('声明式操作 schema / 模板双视图 / 四钉子生成规则', { w: 3400 }), cell('未动', { w: 1400, color: '6B7280' }), cell('零代码', { w: 2360, color: '6B7280' })),
      row(cell('模型层', { w: 2200, bg: 'EEF2FF' }), cell('设备状态机 + DHT/CHT 过期钟', { w: 3400 }), cell('部分', { w: 1400, color: 'D97706' }), cell('只存了常数字段，无状态机/过期逻辑', { w: 2360, color: '6B7280' })),
      row(cell('批次层', { w: 2200, bg: 'F0FDF4' }), cell('批次实例化 + Day0 锁点 / 世界状态快照', { w: 3400 }), cell('未动', { w: 1400, color: '6B7280' }), cell('零代码', { w: 2360, color: '6B7280' })),
      row(cell('装配层', { w: 2200, bg: 'F0FDF4' }), cell('push/pull/link 派生引擎 / 迭代收敛 / 主链是墙', { w: 3400 }), cell('未动', { w: 1400, color: '6B7280' }), cell('零代码', { w: 2360, color: '6B7280' })),
      row(cell('调度层', { w: 2200, bg: 'FFFBEB' }), cell('闸 1 物料需求单 + 戄批 campaign', { w: 3400 }), cell('未动', { w: 1400, color: '6B7280' }), cell('连戄批表都没有', { w: 2360, color: '6B7280' })),
      row(cell('调度层', { w: 2200, bg: 'FFFBEB' }), cell('STN 时序引擎（钉子+弹簧→时间窗）——核心硬骨头', { w: 3400 }), cell('未动', { w: 1400, color: 'DC2626', bold: true }), cell('地基，后续所有层依赖', { w: 2360, color: '6B7280' })),
      row(cell('调度层', { w: 2200, bg: 'FFFBEB' }), cell('资源 time-table 扫描', { w: 3400 }), cell('部分', { w: 1400, color: 'D97706' }), cell('只有尖峰统计，无传播/收窗/回写', { w: 2360, color: '6B7280' })),
      row(cell('调度层', { w: 2200, bg: 'FFFBEB' }), cell('CIP 路由 + 优先级裁决', { w: 3400 }), cell('部分', { w: 1400, color: 'D97706' }), cell('有拓扑，无路由/优先级/主备站', { w: 2360, color: '6B7280' })),
      row(cell('调度层', { w: 2200, bg: 'FFFBEB' }), cell('优先级落点 + bounded-swap 修复', { w: 3400 }), cell('未动', { w: 1400, color: '6B7280' }), cell('零代码', { w: 2360, color: '6B7280' })),
      row(cell('调度层', { w: 2200, bg: 'FFFBEB' }), cell('闸 2 任务派发', { w: 3400 }), cell('未动', { w: 1400, color: '6B7280' }), cell('零代码', { w: 2360, color: '6B7280' })),
      row(cell('下游', { w: 2200, bg: 'FAF5FF' }), cell('喂排班（写回 operation_demands） + plan/actual 回填', { w: 3400 }), cell('未动', { w: 1400, color: '6B7280' }), cell('零代码，排产存在的下游意义', { w: 2360, color: '6B7280' })),
    ]
  });

  return [
    h1('1  项目现状快照'),
    p('MFG8APS（CCAPS22）是一套生物制药 APS 系统。「排产」（生产排程， Production Scheduling）是当前在建的核心新模块，与现有「排班」（人员求解， solver_v4/v5）完全独立。排产是排班的上游：排产输出写入 batch_operation_plans，再由 DataAssemblerV4 喟给排班求解器。'),
    space(1),
    p('当前整套排产走到 「约 10%」。已建只有 CIP 资源主数据底座（5 张表 + 录入界面）和一个复现 WBP2486『Day5=16 尖峰』的峰値统计工具（timetable.py 140 行）。STN 时序传播、优先级落点、双闸派发、喂排班——核心引擎一行代码都没有。', { color: 'DC2626', bold: true }),
    space(1),
    h2('1.1  里程碑进度表（20 项：已建 0 / 部分 5 / 未动 14）'),
    statusTable,
    space(1),
    warn('待命名的细节①：20260626_reconcile_ps_cip_columns.sql 尚未 commit。它是幂等补列迁移，不进版本库其他环境会缺列。'),
    warn('待命名的细节②：prod_scheduler README 宣称“并发>容量当冲突/报增援”，但 analyze() 实际从不拿 capacity 比峰値、也不产 conflicts 字段。当前只会数峰値。'),
    pb()
  ];
}

// ── Section 1: 设计架构 ────────────────────────────────────────────────────────
function section1() {
  const principlesTable = new Table({
    width: { size: TW, type: WidthType.DXA },
    columnWidths: [400, 5200, 3760],
    rows: [
      row(hcell('#', { w: 400 }), hcell('不变量', { w: 5200 }), hcell('含义', { w: 3760 })),
      row(cell('1', { w: 400 }), cell('主链是墙', { w: 5200, bold: true }), cell('派生只填缝，永不反推主链钉子；塞不下 = 报增援', { w: 3760 })),
      row(cell('2', { w: 400, bg: 'F8FAFC' }), cell('Day0 不滑', { w: 5200, bold: true, bg: 'F8FAFC' }), cell('批次锁点绝对固定；消解只换资源/挪窗/报增援', { w: 3760, bg: 'F8FAFC' })),
      row(cell('3', { w: 400 }), cell('纯传播 v1，无求解器', { w: 5200, bold: true }), cell('STN 增量 Bellman-Ford + time-table 扫描线；传播比求解器更可解释（因果链 GMP 友好）', { w: 3760 })),
      row(cell('4', { w: 400, bg: 'F8FAFC' }), cell('双闸人审', { w: 5200, bold: true, bg: 'F8FAFC' }), cell('闸 1 = 物料需求单（人审确认冻结）；闸 2 = 任务派发（人审后喂排班）；与 GMP 物料放行同构', { w: 3760, bg: 'F8FAFC' })),
      row(cell('5', { w: 400 }), cell('独立新服务', { w: 5200, bold: true }), cell('prod_scheduler（Flask，:5007），独立 DataAssembler，不碰 solver_v4/v5', { w: 3760 })),
    ]
  });

  const serviceTable = new Table({
    width: { size: TW, type: WidthType.DXA },
    columnWidths: [2800, 800, 5760],
    rows: [
      row(hcell('服务', { w: 2800 }), hcell('端口', { w: 800 }), hcell('状态', { w: 5760 })),
      row(cell('Frontend（CRA + React 18 + wxb-ui）', { w: 2800 }), cell('3000', { w: 800 }), cell('排产 mock 界面已建（在「UI 组件库」分组）；真实接通的只有 CIP 拓扑页', { w: 5760 })),
      row(cell('Backend API（Express + TS）', { w: 2800, bg: 'F8FAFC' }), cell('3001', { w: 800, bg: 'F8FAFC' }), cell('/api/prod 已挂，4 表 CRUD + 批量导入；其余排产接口待建', { w: 5760, bg: 'F8FAFC' })),
      row(cell('prod_scheduler（Flask，纯传播引擎）', { w: 2800 }), cell('5007', { w: 800 }), cell('已建骨架 + timetable.py 峰値统计 140 行；核心引擎未建', { w: 5760 })),
      row(cell('solver_v4（排班，成熟）', { w: 2800, bg: 'F8FAFC' }), cell('5005', { w: 800, bg: 'F8FAFC' }), cell('现有，不动', { w: 5760, bg: 'F8FAFC' })),
      row(cell('solver_v5（排班，在建）', { w: 2800 }), cell('5006', { w: 800 }), cell('在建，不动', { w: 5760 })),
    ]
  });

  return [
    h1('2  设计架构'),
    h2('2.1  核心不变量（5 条）'),
    principlesTable,
    space(1),
    h2('2.2  三层架构'),
    h3('① 模板层（domain，声明式，无时间无实例）'),
    p('人只编主工艺链。运行时引擎自动派生辅助操作（CIP/SIP/配液/房间放行）。'),
    bullet('主工艺链 backbone：钉子序列（人工编排），USP → DSP 工艺步，本质是 STN 骨干网'),
    bullet('操作 Schema：每个操作声明 demands（前置需求）+ effects（后置产出），声明式对称，effects 本身即索引'),
    bullet('设备状态机：多属性向量（clean/dirty/sterile），带 DHT/CHT 过期钟，统一映射为 max-lag 数学'),
    bullet('生成规则 4 钉子：push_calendar（日历/计次重复）、pull（目标回归派生）、link（USP→DSP 接力）、push_count（计次循环）'),
    space(1),
    h3('② 批次/调度层（排程引擎，纯传播）'),
    p('流水线：装配/派生 → 闸 1 → STN 时序 ↔（双向迭代）↔ 资源落点 → 消解 → 闸 2。'),
    bullet('装配/派生（pre-solve）：目标回归自动派生辅助操作；固定点迭代收敛 + 成环检测（SCC）+ 预算 K；戄批 campaign 提案'),
    bullet('★ 闸 1：物料需求单（配什么/多少/怎么戄批 → 人审 → 确认冻结；乐观锁版本校验）', 0),
    bullet('STN 时序传播：钉子+弹簧 → [最早, 最晚] 可行窗口；冲突 = 负权回路；时序解耦（Hunsberger 2002）'),
    bullet('资源落点：time-table 扫描线；确定性窗内落点（LST 最紧优先）；CIP 主站/配液罐/房间'),
    bullet('消解：①配液 CIP 窗内调 → ②换台+有限回溯 → ③末招：主工艺 CIP 在 DHT/CHT 窗内微调 → ④报增援（Day0 永不滑；CIP 优先级：主工艺 > 配液）'),
    bullet('★ 闸 2：任务派发（排定工序 → 人审 → 派发喂排班；输出冲突/增援报告）', 0),
    space(1),
    h3('③ 下游（排班联动）'),
    bullet('写回 batch_operation_plans（含资质 + gowning 前置 planned_start）→ DataAssemblerV4 → solver_v4/v5'),
    bullet('执行回填（plan/actual）：人工回填实际时间，变更 → stale → 增量重传播'),
    space(1),
    h2('2.3  服务部署'),
    serviceTable,
    pb()
  ];
}

// ── Section 2: 数据架构 ────────────────────────────────────────────────────────
function section2() {
  function domainTable(cols, rows) {
    return new Table({
      width: { size: TW, type: WidthType.DXA },
      columnWidths: cols,
      rows: rows
    });
  }

  // 已建 5 张
  const builtTable = domainTable([1600, 4760, 3000], [
    row(hcell('表名', { w: 1600 }), hcell('主要列', { w: 4760 }), hcell('说明', { w: 3000 })),
    row(cell('ps_cip_station', { w: 1600, bold: true }), cell('id, facility_code, code, name, org_unit_id, capacity TINYINT DEFAULT 1, resource_id', { w: 4760 }), cell('CIP 站，容量 1，软链 organization_units', { w: 3000 })),
    row(cell('ps_room', { w: 1600, bold: true, bg: 'F8FAFC' }), cell('id, facility_code, code, name, org_unit_id, cleanroom_class ENUM(A/B/C/D/CNC)', { w: 4760, bg: 'F8FAFC' }), cell('物理房间，洁净级别', { w: 3000, bg: 'F8FAFC' })),
    row(cell('ps_cip_equipment', { w: 1600, bold: true }), cell('id, cleaning_mode ENUM(cip/single-use/cop), cip_station_id, cip_duration_minutes, sip_duration_minutes, dht_hours, cht_hours, room_id, org_unit_id, parent_equipment_id↑自引用, resource_id', { w: 4760 }), cell('设备/罐，自引用成树（pou 挂母 skid）', { w: 3000 })),
    row(cell('ps_pipeline', { w: 1600, bold: true, bg: 'F8FAFC' }), cell('id, from_equipment_id, to_equipment_id, cip_station_id, cip_duration_minutes, dht_hours, cht_hours', { w: 4760, bg: 'F8FAFC' }), cell('管线，连接两台设备并属 CIP 站', { w: 3000, bg: 'F8FAFC' })),
    row(cell('ps_shelf_life', { w: 1600, bold: true }), cell('id, material, category, shelf_life_hours, basis ENUM(after_produced/after_prepared/after_clean)', { w: 4760 }), cell('物料/设备效期常数，批次层建 STN max-lag 的数据来源', { w: 3000 })),
  ]);

  // 模板层 6 张
  const templateTable = domainTable([1700, 4760, 2900], [
    row(hcell('表名', { w: 1700 }), hcell('主要列', { w: 4760 }), hcell('说明', { w: 2900 })),
    row(cell('ps_process_template', { w: 1700, bold: true }), cell('id, code, name, product_code, version, status ENUM(draft/active)', { w: 4760 }), cell('模板本身，不含时间', { w: 2900 })),
    row(cell('ps_operation_def', { w: 1700, bold: true, bg: 'F8FAFC' }), cell('id, template_id, code, name, kind ENUM(PRIMARY/DERIVABLE), duration_planned_min, contingent_min, contingent_max, interruptible, cycles, is_nail', { w: 4760, bg: 'F8FAFC' }), cell('操作定义，冲刺/弹簧标记', { w: 2900, bg: 'F8FAFC' })),
    row(cell('ps_operation_demand', { w: 1700, bold: true }), cell('id, operation_def_id, demand_type, target_predicate JSON, qty_mode ENUM(fixed/batch), qty_value, suite_role, reuse_strategy', { w: 4760 }), cell('前置需求，消费方拥有', { w: 2900 })),
    row(cell('ps_operation_effect', { w: 1700, bold: true, bg: 'F8FAFC' }), cell('id, operation_def_id, effect_type, material_type_id, equip_attr, to_value, shelf_life_formula, clock_type ENUM(CHT/DHT)', { w: 4760, bg: 'F8FAFC' }), cell('后置产出，effects 即索引', { w: 2900, bg: 'F8FAFC' })),
    row(cell('ps_temporal_constraint', { w: 1700, bold: true }), cell('id, template_id, from_op_id, to_op_id, min_lag_min, max_lag_min, granularity, repeat_type, is_soft', { w: 4760 }), cell('STN 边（钉子+弹簧）', { w: 2900 })),
    row(cell('ps_generation_rule', { w: 1700, bold: true, bg: 'F8FAFC' }), cell('id, template_id, hook_type ENUM(push_calendar/push_count/pull/link), trigger_op_id, target_op_id, period_hours, cycles_n, scope', { w: 4760, bg: 'F8FAFC' }), cell('4 类钉子生成规则', { w: 2900, bg: 'F8FAFC' })),
  ]);

  // 设备状态机 4 张
  const smTable = domainTable([1700, 4760, 2900], [
    row(hcell('表名', { w: 1700 }), hcell('主要列', { w: 4760 }), hcell('说明', { w: 2900 })),
    row(cell('ps_equipment_class', { w: 1700, bold: true }), cell('id, code, name, class_type ENUM(SUS/SS/room/resin)', { w: 4760 }), cell('设备类型（反应器/配液罐 skid/房间/树脂柱）', { w: 2900 })),
    row(cell('ps_equip_attribute', { w: 1700, bold: true, bg: 'F8FAFC' }), cell('id, class_id, attr_name, attr_type ENUM(discrete/counter/calendar), value_set JSON', { w: 4760, bg: 'F8FAFC' }), cell('设备类型的属性维度（洁净/灵菌/袋…）', { w: 2900, bg: 'F8FAFC' })),
    row(cell('ps_state_transition', { w: 1700, bold: true }), cell('id, attribute_id, from_value, to_value, via_op_def_id, prerequisite JSON, dht_hours, cht_hours', { w: 4760 }), cell('状态转移边，带 DHT/CHT', { w: 2900 })),
    row(cell('ps_equipment_instance', { w: 1700, bold: true, bg: 'F8FAFC' }), cell('id, class_id, cip_equip_id, suite_id, facility_code, resource_id', { w: 4760, bg: 'F8FAFC' }), cell('真实设备实例，软链回 CIP 表', { w: 2900, bg: 'F8FAFC' })),
  ]);

  // 批次/调度层 5 张
  const batchTable = domainTable([1700, 5160, 2500], [
    row(hcell('表名', { w: 1700 }), hcell('主要列', { w: 5160 }), hcell('说明', { w: 2500 })),
    row(cell('ps_batch_schedule', { w: 1700, bold: true }), cell('id, batch_plan_id→production_batch_plans, version, day0 DATETIME, status ENUM(DRAFT/PROPAGATING/MATERIAL_REVIEW/TASK_REVIEW/DISPATCHED), stale', { w: 5160 }), cell('排程单次版本', { w: 2500 })),
    row(cell('ps_scheduled_operation', { w: 1700, bold: true, bg: 'F8FAFC' }), cell('id, schedule_id, operation_def_id, equipment_instance_id, earliest_start, latest_start, planned_start, planned_end, actual_start, actual_end, slack_minutes, is_nail, stale, is_derivable', { w: 5160, bg: 'F8FAFC' }), cell('每道操作的时间窗口 + 实际属性', { w: 2500, bg: 'F8FAFC' })),
    row(cell('ps_stn_edge', { w: 1700, bold: true }), cell('id, schedule_id, from_op_id, to_op_id, min_lag_min, max_lag_min, edge_type ENUM(temporal/shelf_life/dht/cht/gowning), is_contingent', { w: 5160 }), cell('STN 图边，冲突 = 负权回路', { w: 2500 })),
    row(cell('ps_resource_slot', { w: 1700, bold: true, bg: 'F8FAFC' }), cell('id, schedule_id, op_id, resource_type ENUM(cip_station/room/equip_instance), resource_id, start_at, end_at, priority', { w: 5160, bg: 'F8FAFC' }), cell('资源占用时隙表', { w: 2500, bg: 'F8FAFC' })),
    row(cell('ps_world_state_segment', { w: 1700, bold: true }), cell('id, equip_instance_id, attribute_id, value, segment_type ENUM(plan/override), valid_from, valid_until, source_op_id', { w: 5160 }), cell('世界状态时间线，覆盖优先', { w: 2500 })),
  ]);

  // 双闸 4 张
  const gateTable = domainTable([1700, 5160, 2500], [
    row(hcell('表名', { w: 1700 }), hcell('主要列', { w: 5160 }), hcell('说明', { w: 2500 })),
    row(cell('ps_material_requisition', { w: 1700, bold: true }), cell('id, schedule_id, status ENUM(DRAFT/PENDING/CONFIRMED/STALE), version, confirmed_at, confirmed_by', { w: 5160 }), cell('闸 1 物料需求单主表', { w: 2500 })),
    row(cell('ps_material_req_item', { w: 1700, bold: true, bg: 'F8FAFC' }), cell('id, requisition_id, material_type_id, qty, unit, shelf_window_start, shelf_window_end, campaign_id', { w: 5160, bg: 'F8FAFC' }), cell('需求单明细', { w: 2500, bg: 'F8FAFC' })),
    row(cell('ps_campaign', { w: 1700, bold: true }), cell('id, requisition_id, material_type_id, total_qty, batch_count, serves_schedule_ids JSON', { w: 5160 }), cell('戄批 campaign，大令牌分装服务多批', { w: 2500 })),
    row(cell('ps_dispatch_record', { w: 1700, bold: true, bg: 'F8FAFC' }), cell('id, schedule_id, status ENUM(PENDING/DISPATCHED/REVERTED), dispatched_at, dispatched_by, conflict_report JSON', { w: 5160, bg: 'F8FAFC' }), cell('闸 2 任务派发记录', { w: 2500, bg: 'F8FAFC' })),
  ]);

  // 物料 2 张
  const matTable = domainTable([1700, 5160, 2500], [
    row(hcell('表名', { w: 1700 }), hcell('主要列', { w: 5160 }), hcell('说明', { w: 2500 })),
    row(cell('ps_material_type', { w: 1700, bold: true }), cell('id, code, name, category, default_shelf_life_hours, basis', { w: 5160 }), cell('物料类型主表', { w: 2500 })),
    row(cell('ps_material_lot', { w: 1700, bold: true, bg: 'F8FAFC' }), cell('id, type_id, produced_by_op, parent_lot_id↑分装子令牌, qty, unit, plan_produced_at, plan_expires_at, actual_produced_at, actual_expires_at, state, occupied_by_instance_id', { w: 5160, bg: 'F8FAFC' }), cell('物料令牌，跞留在设备实例', { w: 2500, bg: 'F8FAFC' })),
  ]);

  return [
    h1('3  数据架构'),
    p('25 张表、6 个域。所有 ps_* 表族独立于通用 resources 表之外，通过可空 resource_id 软链不污染排班侧。'),
    space(1),
    h2('3.1  资源主数据（5 张，已建 ✓）'),
    builtTable,
    warn('20260626_reconcile_ps_cip_columns.sql 尚未 commit。这份迁移是幂等补列，不进版本库其他环境在事务层引用新列时会报 Unknown column。'),
    space(1),
    h2('3.2  待建 —— 模板层（6 张）'),
    templateTable,
    space(1),
    h2('3.3  待建 —— 设备状态机（4 张）'),
    smTable,
    space(1),
    h2('3.4  待建 —— 物料令牌（2 张）'),
    matTable,
    space(1),
    h2('3.5  待建 —— 批次/调度层（5 张）'),
    batchTable,
    space(1),
    h2('3.6  待建 —— 双闸（4 张）'),
    gateTable,
    space(1),
    h2('3.7  外部集成点（现有表）'),
    p('organization_units：现有，排产部门/房间共用排班 team 层级。'),
    p('resources：现有，通用设备主数据（排班 V4 用），ps_* 软链不污染。'),
    p('production_batch_plans：现有，批次主表，ps_batch_schedule 的锁点来源。'),
    p('batch_operation_plans：现有。「排产唯一输出目标」——排产引擎写回此表，DataAssemblerV4 读取后喟给排班求解器。', { bold: true }),
    pb()
  ];
}

// ── Section 3: 时间线计划 ─────────────────────────────────────────────────────
function section3() {
  const W = [420, 1000, 1200, 4240, 2500];
  function trow(phase, sprint, week, content, verify, bg) {
    const b = bg ? { bg } : {};
    return row(
      cell(phase, { w: W[0], bold: !!phase, ...b }),
      cell(sprint, { w: W[1], bold: !!sprint, ...b }),
      cell(week, { w: W[2], align: AlignmentType.CENTER, ...b }),
      cell(content, { w: W[3], ...b }),
      cell(verify, { w: W[4], color: '065F46', ...b })
    );
  }

  const tlTable = new Table({
    width: { size: TW, type: WidthType.DXA },
    columnWidths: W,
    rows: [
      row(
        hcell('阶段', { w: W[0] }),
        hcell('冲刺', { w: W[1] }),
        hcell('周次', { w: W[2] }),
        hcell('内容', { w: W[3] }),
        hcell('验收标准', { w: W[4] })
      ),
      // 阶段 0
      trow('0', 'S0-a', '第 1 周', 'git add + commit 20260626_reconcile_ps_cip_columns.sql；干运行验证已建环境补列', '内容 commit、reconcile 均干静', 'FFFBEB'),
      trow('0', 'S0-b', '第 1 周', '修复 prod_scheduler README：明确标注 analyze() 只做峰値统计，capacity 存储未用于决策', 'README 与代码描述一致', 'FFFBEB'),
      trow('0', 'S0-c', '第 1 周', '起草 prod_scheduler 完整请求/响应契约（JSON schema）：\noperations[{id, start, end, duration_min, equipment_id}]\nstn_edges[{from, to, min_lag, max_lag, edge_type}]\nnails[], world_state\n→ scheduled_ops[{earliest, latest, slack}], conflicts[], resource_slots[]', '契约 JSON schema 文件存入仓库；后续冲刺封冒此接口', 'FFFBEB'),
      // 阶段 1
      trow('1', 'S1-a', '第 2-3 周', 'DDL：ps_process_template + ps_operation_def + ps_operation_demand + ps_operation_effect + ps_temporal_constraint + ps_generation_rule（6 张）', 'WBP2486 模板 7/10 可录入，单测目标回归逻辑距就', 'EEF2FF'),
      trow('1', 'S1-b', '第 2-3 周', 'DDL：ps_equipment_class + ps_equip_attribute + ps_state_transition + ps_equipment_instance（4 张）；从 ps_shelf_life 派生 DHT/CHT max-lag', '设备状态机单测通过', 'EEF2FF'),
      trow('1', 'S1-c', '第 2-3 周', 'DDL：ps_material_type + ps_material_lot（2 张）', 'DDL 已应用，CRUD 可写入', 'EEF2FF'),
      trow('1', 'S1-d', '第 2-3 周', '后端 CRUD API + 前端录入界面（wxb-ui WxbDataTable/WxbDrawer），复用 CIP 录入模式', '4 张表可录入删改，WBP2486 schema 录入成功', 'EEF2FF'),
      // 阶段 2
      trow('2', 'S2-a', '第 4-5 周', 'DDL：ps_batch_schedule + ps_scheduled_operation（2 张）；批次实例化逻辑（从 production_batch_plans 拉 Day0）', '实例化单测通过；WBP2486 Day0 锁点正确', 'F0FDF4'),
      trow('2', 'S2-b', '第 4-5 周', '装配/派生引擎 v0.1：push 展开 + pull 派生 + 迭代收敛（固定点 + 成环检测 SCC + 预算 K），输出固定操作集', 'WBP2486 单批派生结果与 20_walkthrough 对照；主链 + CIP/SIP/配液/房间放行全自动冒出', 'F0FDF4'),
      trow('2', 'S2-c', '第 4-5 周', '世界状态：ps_world_state_segment（1 张），plan/override 分层，覆盖优先', '覆盖写入读取单测通过', 'F0FDF4'),
      // 阶段 3
      trow('3', 'S3-a', '第 6-7 周', 'DDL：ps_stn_edge（1 张）；实现增量 Bellman-Ford（SPFA）+ 差分距离表', 'SPFA 单测：无权图/负权图/负权回路 3 种场景全过', 'FEF3C7'),
      trow('3', 'S3-b', '第 6-7 周', 'STN 传播主循环：钉子锁定 + 弹簧传播 → [最早, 最晚] 窗口；负权回路 = 不可行（输出回路说明）', 'WBP2486 单批 STN 传播：所有操作输出可行窗口', 'FEF3C7'),
      trow('3', 'S3-c', '第 6-7 周', '时序解耦（Hunsberger 2002 多项式）：派生节点双侧缓冲最大化，涌现安全余量', '派生节点 slack_minutes 均 > 0；便笔波及範围 0', 'FEF3C7'),
      trow('3', 'S3-d', '第 6-7 周', '效期/DHT/CHT 统一为 max-lag 边，自动检测超期不可行；gowning 前置时间注入', '人工制造 DHT 超期得到负权回路；增量变更 <200ms', 'FEF3C7'),
      // 阶段 4
      trow('4', 'S4-a', '第 8-9 周', 'DDL：ps_resource_slot（1 张）；time-table 扫描线（资源\xD7时间轴）收窄 STN 窗口，与 STN 双向迭代', 'time-table 收窄单测：容量满则窗口变无', 'ECFDF5'),
      trow('4', 'S4-b', '第 8-9 周', '确定性窗内落点：LST 最紧优先；CIP 优先级（主工艺 > 配液）；按固定优先级增量插入（终止性保证）', '同一资源两个操作落点不重叠；CIP 优先级像列出', 'ECFDF5'),
      trow('4', 'S4-c', '第 8-9 周', 'CIP 路由：设备→管线→主站；主站容量 = 1；主站满 → 报增援（不动备站）', 'Day5=16 尖峰：引擎正确报增援', 'ECFDF5'),
      trow('4', 'S4-d', '第 8-9 周', 'bounded-swap 修复：有限回溯化解中密度误报增援', '中密度場景误报增援率下降', 'ECFDF5'),
      // 阶段 5
      trow('5', 'S5-a', '第 10-11 周', '消解逻辑：换台 → 窗内重排 → 末招窗内微调 → 报增援；冲突节点 + 可执行建议输出', '手工制造冲突得到正确增援建议；Day0 不滑', 'FEF9C3'),
      trow('5', 'S5-b', '第 10-11 周', 'DDL：ps_material_requisition + ps_material_req_item + ps_campaign（3 张）', 'DDL 已应用，单测写入成功', 'FEF9C3'),
      trow('5', 'S5-c', '第 10-11 周', '闸 1 后端：贪心戄批 campaign 提案；物料需求单生成；乐观锁版本校验（确认冻结）', '攻戄批提案正确；确认冻结后版本锁住', 'FEF9C3'),
      trow('5', 'S5-d', '第 10-11 周', '前端闸 1 界面：物料需求单列表 + 审阅/修改抽屉（wxb-ui WxbDrawer + WxbDataTable）', 'WBP2486 单批从 Day0 到输出物料需求单全流程跽通', 'FEF9C3'),
      // 阶段 6
      trow('6', 'S6-a', '第 12-13 周', 'DDL：ps_dispatch_record（1 张）；闸 2 后端逻辑：排定工序 → 写回 batch_operation_plans（含 gowning 前置 planned_start）', '写回结果可被 DataAssemblerV4 当正读取', 'EDE9FE'),
      trow('6', 'S6-b', '第 12-13 周', '喂排班接口：batch_operation_plans → DataAssemblerV4 → solver_v4/v5（端到端联调）；不改 V4 代码', 'solver_v4 排班求解通过，无人名谁知接口变动', 'EDE9FE'),
      trow('6', 'S6-c', '第 12-13 周', '前端闸 2 界面：任务派发列表 + 甘特预览（复用 WxbGanttChart D17）+ 冲突/增援报告', 'WBP2486 单批完整端到端：Day0 输入 → 排产 → 排班求解通过', 'EDE9FE'),
      // 阶段 7
      trow('7', 'S7-a', '第 14 周', '多批争用：跨批 CIP/配液罐争用场景；透明确定性规则（LST + 此批优先权重）', '两批并跑，Day5 尖峰跨批争用正确处理', 'F0F4FF'),
      trow('7', 'S7-b', '第 14 周', 'plan/actual 回填：操作后人工回填实际时间；stale 标记；增量重传播', '实际回填触发 stale 重传播 + 提示重审', 'F0F4FF'),
      trow('7', 'S7-c', '第 14 周', '滚动重排：近端冻结窗；stale 批次增量重传播 + 提示重审', '冻结窗内不重排；冻结窗外 stale 正确标记', 'F0F4FF'),
    ]
  });

  return [
    h1('4  Vibecoding 时间线计划（14 周，7 阶段，21 冲刺）'),
    p('每个阶段匹配一个可实测里程碑。将 STN 时序引擎放在第 3 阶段单独留两周，是因为它是所有后续层的地基，任何超期是整个排程路径的鉱魄。'),
    space(1),
    tlTable,
    pb()
  ];
}

// ── Section 4: 风险与对策 ─────────────────────────────────────────────────────
function section4() {
  const riskTable = new Table({
    width: { size: TW, type: WidthType.DXA },
    columnWidths: [3200, 2400, 3760],
    rows: [
      row(hcell('风险', { w: 3200 }), hcell('影响', { w: 2400 }), hcell('对策', { w: 3760 })),
      row(
        cell('STN 引擎复杂度超预期（核心硬骨头）', { w: 3200, bold: true }),
        cell('阶段 3 卡断，后续层全所依赖', { w: 2400, color: 'DC2626' }),
        cell('S3 留两周；不可行时先降级为固定偏移盘章（现有存储过程）过渡', { w: 3760 })
      ),
      row(
        cell('时序/资源双向迭代不收敛（placement thrashing）', { w: 3200, bold: true, bg: 'F8FAFC' }),
        cell('落点震荡无终止', { w: 2400, color: 'D97706', bg: 'F8FAFC' }),
        cell('固定 CIP 优先级增量插入（主工艺先）+ 迭代预算 K 兼底 + 震荡检测；超预算报增援不静默', { w: 3760, bg: 'F8FAFC' })
      ),
      row(
        cell('中密度场景误报增援', { w: 3200, bold: true }),
        cell('计划师不信任引擎结果', { w: 2400, color: 'D97706' }),
        cell('bounded-swap 有限回溯（S4-d）+ CIP 末招窗内微调（S5-a）两层余量', { w: 3760 })
      ),
      row(
        cell('喂排班接口破门禁（不能动 V4）', { w: 3200, bold: true, bg: 'F8FAFC' }),
        cell('solver_v4 回归悳巳，排珫全隔断', { w: 2400, color: 'DC2626', bg: 'F8FAFC' }),
        cell('只写 batch_operation_plans（现有表），DataAssemblerV4 已有读取逻辑，不改 V4 代码', { w: 3760, bg: 'F8FAFC' })
      ),
      row(
        cell('戄批 campaign 并发 write-skew', { w: 3200, bold: true }),
        cell('多人同时戄批超量', { w: 2400, color: 'D97706' }),
        cell('乐观锁版本校验粒度落到账本（物料最小数量账）；闸 1 确认冻结原子操作', { w: 3760 })
      ),
    ]
  });

  return [
    h1('5  关键风险与对策'),
    riskTable,
    pb()
  ];
}

// ── Section 5: 立即行动 ────────────────────────────────────────────────────────
function section5() {
  return [
    h1('6  立即行动项（当前周）'),
    h2('6.1  必须今天处理'),
    bullet('git add + commit 20260626_reconcile_ps_cip_columns.sql。这份迁移不进版本库，其他环境在事务层引用新列时会报 Unknown column。'),
    bullet('在 prod_scheduler/README.md 正显位置标注：当前 analyze() 只做峰値统计，capacity 字段目前仅存储未用于决策；对外口径统一为“峰値统计工具”。'),
    space(1),
    h2('6.2  契约起草（S0-c）'),
    p('prod_scheduler 请求/响应契约 JSON schema 草案：'),
    p('请求：', { bold: true }),
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({
        text: '{ operations: [{id, start, end, duration_min, equipment_id}], stn_edges: [{from, to, min_lag, max_lag, edge_type}], nails: [op_id], world_state: {...} }',
        font: 'Courier New', size: 18, color: '1E293B'
      })]
    }),
    p('响应：', { bold: true }),
    new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({
        text: '{ scheduled_ops: [{id, earliest, latest, slack_minutes}], conflicts: [{op_id, reason, circuit}], resource_slots: [{op_id, resource_type, resource_id, start_at, end_at}] }',
        font: 'Courier New', size: 18, color: '1E293B'
      })]
    }),
    p('此契约存入仓库后即为 S3–S6 所有冲刺的接口锁。后续任何对外口径修改需要就此文件起版本讨论。'),
    space(2),
    p('—— 文档内容仅供项目团队内部参考 ——', { color: '94A3B8' })
  ];
}

// ── Build document ─────────────────────────────────────────────────────────────
const TOC_SECTION = [
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: '目 录', bold: true, size: 36, font: 'Arial', color: '1E3A8A' })]
  }),
  new TableOfContents('', { hyperlink: true, headingStyleRange: '1-3' }),
  pb()
];

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: '334155' } } },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: '1E3A8A' },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 }
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: '1D4ED8' },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 }
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '2563EB' },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 }
      },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '2563EB', space: 4 } },
          children: [new TextRun({ text: '排产系统建设计划 · MFG8APS 内部文档', size: 18, font: 'Arial', color: '94A3B8' })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: '第 ', size: 18, font: 'Arial', color: '94A3B8' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Arial', color: '94A3B8' }),
            new TextRun({ text: ' 页', size: 18, font: 'Arial', color: '94A3B8' }),
          ]
        })]
      })
    },
    children: [
      ...coverSection(),
      ...TOC_SECTION,
      ...section0(),
      ...section1(),
      ...section2(),
      ...section3(),
      ...section4(),
      ...section5(),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT, buf);
  console.log('OK: ' + OUT + ' (' + (buf.length / 1024).toFixed(0) + ' KB)');
}).catch(e => { console.error(e); process.exit(1); });
