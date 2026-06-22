/* eslint-disable */
// 生成两张配套详图：fig1_er.svg(数据模型 ER) + fig2_pipeline.svg(求解流水线)。
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const FONT = "'PingFang SC','Microsoft YaHei',sans-serif";

// ---------- 通用 ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function T(x, y, s, { size = 12, fill = '#1f2933', w = 400, anchor = 'start', weight = 400 } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" font-family="${FONT}">${esc(s)}</text>`;
}
function box(x, y, w, h, { fill, stroke, rx = 9, sw = 1.4 } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

// 颜色（白主题）
const C = {
  base: { fill: '#E8F1FB', stroke: '#2E6FB0', title: '#0C447C', sub: '#3A6EA5' },
  plan: { fill: '#E3F4F0', stroke: '#2E9C8E', title: '#0B4A43', sub: '#2E7D72' },
  rost: { fill: '#F3ECFB', stroke: '#8A5CC0', title: '#46297A', sub: '#6A4A98' },
  solver: { fill: '#FBF0E5', stroke: '#C98A3A', title: '#7A4A12', sub: '#9A6A2A' },
  gray: { fill: '#EEF1F5', stroke: '#8A94A6', title: '#2B3340', sub: '#5A6472' },
};

// ============================================================
// 图① 数据模型 ER 关系图
// ============================================================
function buildER() {
  const W = 1300, H = 1010;
  // 表定义：id, group, x, y, w, label, fields[]
  const G = (g) => C[g];
  const tables = [
    // 基础数据
    ['organization_units', 'base', 30, 110, 188, '组织单元树', ['unit_type 部门/班组/小组', 'parent_id 自引用', 'default_shift_code']],
    ['operation_types', 'base', 30, 250, 188, '操作类型', ['type_code', 'team_id→组织', 'category']],
    ['operations', 'base', 30, 380, 188, '操作/工序字典', ['operation_code', 'standard_time 标准耗时', 'required_people']],
    ['operation_qual_req', 'base', 30, 510, 188, '操作资质要求', ['operation_id', 'qualification_id', 'required_level/count']],
    ['qualifications', 'base', 30, 640, 188, '资质字典', ['id', 'qualification_name']],
    ['employee_roles', 'base', 245, 110, 188, '排班员工角色', ['role_code', 'can_schedule', 'allowed_shift_codes']],
    ['employees', 'base', 245, 235, 188, '员工', ['employee_code', 'unit_id→组织', 'primary_role_id→角色']],
    ['employee_qual', 'base', 245, 375, 188, '资质矩阵(员工×资质)', ['employee_id', 'qualification_id', 'level 1-5']],
    ['resources', 'base', 245, 510, 188, '可调度资源', ['resource_code', 'resource_type', 'owner_org_unit_id']],
    ['resource_nodes', 'base', 245, 640, 188, '资源节点树', ['node_class 厂区/产线/房间/设备', 'parent_id 自引用', 'bound_resource_id→资源']],
    ['emp_secondary', 'base', 30, 770, 403, '员工组织/汇报关系', ['employee_org_membership 多对多归属', 'employee_reporting_relations 汇报链']],
    // 生产计划
    ['process_templates', 'plan', 470, 110, 188, '工艺模版', ['template_code', 'total_days', 'team_id→组织']],
    ['process_stages', 'plan', 470, 240, 188, '工艺阶段', ['template_id→模版', 'stage_order', 'start_day(Day0起)']],
    ['stage_op_sched', 'plan', 470, 370, 188, '阶段操作安排', ['stage_id→阶段', 'operation_id→工序', '钉子+时间窗']],
    ['operation_constraints', 'plan', 470, 545, 188, '工序时序约束', ['schedule_id/前置', 'FS/SS/FF/SF', '强制/优选/建议']],
    ['production_batch', 'plan', 685, 110, 188, '生产批次计划', ['batch_code', 'template_id(软引用)', 'plan_status=ACTIVATED']],
    ['batch_op_plans', 'plan', 685, 240, 188, '批次操作计划', ['batch_plan_id→批次', 'template_schedule_id→安排', 'planned_start/end']],
    ['batch_op_res_req', 'plan', 685, 400, 188, '批次工序资源需求', ['batch_operation_plan_id', 'source_scope 三层继承', 'required_count']],
    ['tmpl_res_req', 'plan', 685, 540, 188, '模版工序资源需求', ['template_schedule_id', '+candidates→资源', 'is_mandatory']],
    ['tmpl_node_bind', 'plan', 685, 680, 188, '模版工序设备绑定', ['template_schedule_id', 'resource_node_id→节点树', 'PRIMARY/AUXILIARY']],
    ['v3_recipe', 'plan', 470, 700, 188, 'V3 配方依赖(并行)', ['recipe_versions/unit_ops', 'operation_dependencies', 'migrated_*/source_* 映射']],
    // 排班
    ['shift_definitions', 'rost', 1085, 110, 188, '班次定义', ['shift_code', 'nominal_hours 折算工时', 'is_night_shift']],
    ['scheduling_runs', 'rost', 1085, 270, 188, '求解运行记录', ['run_key', 'status/stage', 'solver_progress(JSON)']],
    ['employee_shift_plans', 'rost', 1085, 470, 188, '员工班次排班', ['employee_id+plan_date', 'shift_id→班次', 'plan_state']],
    ['batch_personnel', 'rost', 1085, 660, 188, '批次人员安排', ['batch_operation_plan_id', 'employee_id+position', 'scheduling_run_id']],
  ];
  const TM = {};
  tables.forEach((t) => { TM[t[0]] = { id: t[0], g: t[1], x: t[2], y: t[3], w: t[4], label: t[5], fields: t[6] }; });
  const boxH = (t) => 30 + t.fields.length * 16 + 8;

  // 关系：from,to,kind(fk|logic)
  const rels = [
    ['operations', 'operation_types', 'fk'], ['operation_types', 'organization_units', 'fk'],
    ['operation_qual_req', 'operations', 'fk'], ['operation_qual_req', 'qualifications', 'fk'],
    ['employees', 'organization_units', 'fk'], ['employees', 'employee_roles', 'fk'],
    ['employee_qual', 'employees', 'fk'], ['employee_qual', 'qualifications', 'fk'],
    ['resources', 'organization_units', 'fk'], ['resource_nodes', 'resources', 'fk'],
    ['process_stages', 'process_templates', 'fk'], ['stage_op_sched', 'process_stages', 'fk'],
    ['stage_op_sched', 'operations', 'fk'], ['operation_constraints', 'stage_op_sched', 'fk'],
    ['production_batch', 'process_templates', 'fk'], ['batch_op_plans', 'production_batch', 'fk'],
    ['batch_op_plans', 'stage_op_sched', 'fk'], ['batch_op_plans', 'operations', 'fk'],
    ['batch_op_res_req', 'batch_op_plans', 'fk'], ['tmpl_res_req', 'stage_op_sched', 'fk'],
    ['tmpl_res_req', 'resources', 'logic'], ['tmpl_node_bind', 'stage_op_sched', 'fk'],
    ['tmpl_node_bind', 'resource_nodes', 'fk'], ['v3_recipe', 'operation_constraints', 'logic'],
    ['batch_personnel', 'batch_op_plans', 'fk'], ['batch_personnel', 'employees', 'fk'],
    ['batch_personnel', 'scheduling_runs', 'fk'], ['batch_personnel', 'shift_definitions', 'fk'],
    ['batch_personnel', 'employee_shift_plans', 'fk'], ['employee_shift_plans', 'shift_definitions', 'fk'],
    ['employee_shift_plans', 'scheduling_runs', 'fk'], ['employee_shift_plans', 'batch_op_plans', 'fk'],
  ];

  // 边缘锚点（取最近边中点）
  function anchor(a, b) {
    const ha = boxH(a), hb = boxH(b);
    const acx = a.x + a.w / 2, acy = a.y + ha / 2, bcx = b.x + b.w / 2, bcy = b.y + hb / 2;
    let ax, ay, bx, by;
    if (Math.abs(bcx - acx) >= Math.abs(bcy - acy)) {
      ax = bcx > acx ? a.x + a.w : a.x; ay = acy;
      bx = bcx > acx ? b.x : b.x + b.w; by = bcy;
    } else {
      ay = bcy > acy ? a.y + ha : a.y; ax = acx;
      by = bcy > acy ? b.y : b.y + hb; bx = bcx;
    }
    return [ax, ay, bx, by];
  }

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<title>MFG8 APS 数据模型关系图</title><desc>基础数据、生产计划、排班三域核心表及外键关系。</desc>`;
  svg += `<defs><marker id="fk" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,3 L0,6 Z" fill="#7A8696"/></marker></defs>`;
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`;
  // 分区背景带
  svg += box(16, 80, 432, 880, { fill: '#F7FAFE', stroke: '#CFE0F2', rx: 14, sw: 1 });
  svg += box(456, 80, 432, 880, { fill: '#F4FBF9', stroke: '#CFEAE4', rx: 14, sw: 1 });
  svg += box(1070, 80, 218, 880, { fill: '#FAF6FE', stroke: '#E2D3F2', rx: 14, sw: 1 });
  svg += T(28, 104, '基础数据', { size: 15, weight: 700, fill: C.base.title });
  svg += T(468, 104, '生产计划', { size: 15, weight: 700, fill: C.plan.title });
  svg += T(1082, 104, '排班', { size: 15, weight: 700, fill: C.rost.title });
  // 关系线（先画，压在框下）
  rels.forEach(([f, t, kind]) => {
    const a = TM[f], b = TM[t]; if (!a || !b) return;
    const [ax, ay, bx, by] = anchor(a, b);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const dash = kind === 'logic' ? ' stroke-dasharray="4 4"' : '';
    const col = kind === 'logic' ? '#B0A0C8' : '#9AA8BA';
    svg += `<path d="M${ax},${ay} Q${mx},${my} ${bx},${by}" fill="none" stroke="${col}" stroke-width="1.1"${dash} marker-end="url(#fk)" opacity="0.85"/>`;
  });
  // 表框
  tables.forEach((tt) => {
    const t = TM[tt[0]]; const col = G(t.g); const h = boxH(t);
    svg += box(t.x, t.y, t.w, h, { fill: col.fill, stroke: col.stroke });
    svg += T(t.x + 12, t.y + 21, t.label, { size: 12.5, weight: 700, fill: col.title });
    svg += `<line x1="${t.x + 10}" y1="${t.y + 28}" x2="${t.x + t.w - 10}" y2="${t.y + 28}" stroke="${col.stroke}" stroke-width="0.6" opacity="0.5"/>`;
    t.fields.forEach((fd, i) => { svg += T(t.x + 12, t.y + 44 + i * 16, fd, { size: 10, fill: col.sub }); });
  });
  // 图例
  svg += T(28, 985, '实线箭头＝外键引用（子表→父表）；虚线＝逻辑/跨模型映射（如模版↔V3 配方）。框内为关键字段，并非全部列。', { size: 11, fill: '#5A6472' });
  svg += `</svg>`;
  return { svg, name: 'fig1_er.svg' };
}

// ============================================================
// 图② 求解流水线（DB→装配→SolverRequest→CP-SAT 约束/目标→结果）
// ============================================================
function buildPipeline() {
  const W = 920, H = 1300;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" xmlns="http://www.w3.org/2000/svg">`;
  s += `<title>V4 自动排班求解流水线</title><desc>数据库取数、装配为 SolverRequest、CP-SAT 按约束与目标求解、结果落库并经 SSE 回传。</desc>`;
  s += `<defs><marker id="dn" markerWidth="11" markerHeight="11" refX="4" refY="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,0 L4,8 Z" fill="#5A6472"/></marker></defs>`;
  s += `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
  const cx = W / 2;
  const arrow = (y1, y2) => `<line x1="${cx}" y1="${y1}" x2="${cx}" y2="${y2}" stroke="#5A6472" stroke-width="2" marker-end="url(#dn)"/>`;

  // 1 DB
  s += box(40, 30, 840, 102, C.gray);
  s += T(60, 56, '① 数据库取数（只读，DataAssemblerV4 两批并行）', { size: 14, weight: 700, fill: C.gray.title });
  s += box(60, 70, 250, 40, C.base); s += T(72, 95, '基础数据 13 表', { size: 11.5, weight: 600, fill: C.base.title });
  s += box(330, 70, 250, 40, C.plan); s += T(342, 95, '生产计划 9 表', { size: 11.5, weight: 600, fill: C.plan.title });
  s += box(600, 70, 260, 40, C.rost); s += T(612, 95, '排班 4 表（班次/历史/锁定）', { size: 11.5, weight: 600, fill: C.rost.title });
  s += T(72, 122, '过滤：批次 plan_status=ACTIVATED · 工序在窗口内 · 团队按组织树递归取子树', { size: 9.5, fill: C.gray.sub });
  s += arrow(132, 150);

  // 2 装配/预筛
  s += box(40, 150, 840, 78, C.solver);
  s += T(60, 176, '② Node 层预筛与装配', { size: 14, weight: 700, fill: C.solver.title });
  s += T(60, 198, '候选员工预筛：资质硬过滤（is_mandatory 需求须有对应资质且 level≥要求）＋ 不可用期重叠淘汰，压缩求解空间', { size: 10.5, fill: C.solver.sub });
  s += T(60, 216, '再装配为 SolverRequest（request_id 现造，window/solve_range/config 为入参）', { size: 10.5, fill: C.solver.sub });
  s += arrow(228, 258);

  // 3 SolverRequest 19 字段
  s += box(40, 258, 840, 150, C.base);
  s += T(60, 284, '③ SolverRequest 契约（19 个顶层字段）', { size: 14, weight: 700, fill: C.base.title });
  const fields = ['operation_demands 工序用工需求', 'employee_profiles 员工+资质', 'calendar 工作日/三倍薪', 'shift_definitions 班次',
    'shared_preferences 共享组', 'special_shift_requirements 专项班', 'locked_operations 锁定工序', 'locked_shifts 锁定班次',
    'historical_shifts 历史班', 'resources 资源', 'resource_calendars 资源日历', 'operation_resource_requirements 资源需求',
    'maintenance_windows 维保窗', 'frozen_shifts 冻结班次', 'frozen_assignments 冻结分配', 'window / solve_range 区间', 'config 配置/权重/开关', 'request_id 运行号'];
  const colW = 280;
  fields.forEach((f, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 60 + col * colW, y = 308 + row * 17;
    s += T(x, y, '· ' + f, { size: 10, fill: C.base.sub });
  });
  s += arrow(408, 448);
  s += T(478, 432, 'POST /api/v4/solve → Flask 求解器（浏览器不直连求解器）', { size: 10.5, weight: 600, fill: '#0C447C' });

  // 4 求解器：约束 + 目标
  const solveTop = 448, solveH = 560;
  s += box(40, solveTop, 840, solveH, C.solver);
  s += T(60, solveTop + 26, '④ CP-SAT 求解（按 registry 顺序加约束 → 加权和单目标最小化）', { size: 14, weight: 700, fill: C.solver.title });
  // 左列约束
  const cons = [
    'FrozenRange 区间外钉死历史值（硬·必首位）', 'ShiftAssignment 每人每天一班，班覆盖工序（硬）',
    'ShareGroup 共享组同一批人（硬）', 'UniqueEmployee 同人不排重叠工序（硬）',
    'LockedOperations 保留锁定的人-工序（硬）', 'LockedShifts 保留锁定的班次（硬）',
    'OnePosition 一工序一员工占一岗（硬）', 'EmployeeAvailability 不可用期不排（硬）',
    'StandardHours 月工时落在 [标准-4,+32]（硬）', 'ConsecutiveDays 连上≤6 / 连休≤4（硬）',
    'NightShift 夜班休息/禁孤立/间隔（硬+软）', 'LeadershipCoverage 生产日≥1 leader 等（硬+软）',
    'FlexibleScheduling 柔性任务窗口内放一次（硬）', 'PreferStandardShift 标准班够用不开特殊班（硬）',
    'SpecialShiftJointCoverage 专项班覆盖（硬/软可配）', 'ConsecutiveWorkRestPattern 连上连休块（硬·默认关）',
  ];
  s += box(56, solveTop + 40, 470, 504, { fill: '#FFFFFF', stroke: C.solver.stroke, sw: 1 });
  s += T(70, solveTop + 62, '约束 16 条（CORE 6 + SHIFT 10）', { size: 12, weight: 700, fill: C.solver.title });
  cons.forEach((c, i) => { s += T(70, solveTop + 84 + i * 28, '· ' + c, { size: 10, fill: '#4A3A22' }); });
  // 右列目标
  const objs = [
    'O0 专项班欠配最小化（最高优先）', 'O1 岗位空缺最小化（高峰/非标时段加权）',
    'O2 专项班对常规排班影响最小化', 'O3 工时偏差最小化 |实际-标准|',
    'O4 特殊班使用数最小化', 'O5 夜班均衡（平方和）',
    'O6 周末/节假日工作均衡（平方和）', 'O7 三倍薪日成本最小化',
    'O8 管理岗覆盖软惩罚', '注：MinimizeTotalHours 已被 O3 取代，未装配',
  ];
  s += box(544, solveTop + 40, 320, 504, { fill: '#FFFFFF', stroke: C.solver.stroke, sw: 1 });
  s += T(558, solveTop + 62, '目标 10 项（加权求和，统一最小化）', { size: 12, weight: 700, fill: C.solver.title });
  objs.forEach((o, i) => {
    const last = i === objs.length - 1;
    s += T(558, solveTop + 90 + i * 30, (last ? '' : '· ') + o, { size: last ? 9.5 : 10.5, fill: last ? '#9A6A2A' : '#4A3A22' });
  });
  s += arrow(solveTop + solveH, solveTop + solveH + 40);

  // 5 结果落库
  const ry = solveTop + solveH + 40;
  s += box(40, ry, 840, 96, C.rost);
  s += T(60, ry + 26, '⑤ 结果落库 + 进度回传', { size: 14, weight: 700, fill: C.rost.title });
  s += box(60, ry + 40, 250, 42, { fill: '#FFFFFF', stroke: C.rost.stroke, sw: 1 }); s += T(72, ry + 60, 'employee_shift_plans', { size: 10.5, weight: 600, fill: C.rost.title }); s += T(72, ry + 75, '员工×日期班表', { size: 9.5, fill: C.rost.sub });
  s += box(330, ry + 40, 250, 42, { fill: '#FFFFFF', stroke: C.rost.stroke, sw: 1 }); s += T(342, ry + 60, 'batch_personnel_assignments', { size: 10, weight: 600, fill: C.rost.title }); s += T(342, ry + 75, '员工×批次工序岗位', { size: 9.5, fill: C.rost.sub });
  s += box(600, ry + 40, 260, 42, { fill: '#FFFFFF', stroke: C.rost.stroke, sw: 1 }); s += T(612, ry + 60, 'scheduling_runs', { size: 10.5, weight: 600, fill: C.rost.title }); s += T(612, ry + 75, '运行记录 · solver_progress', { size: 9.5, fill: C.rost.sub });
  s += T(60, ry + 94, '求解中：进度增量经回调写 scheduling_runs.solver_progress，再经 SSE 推前端；审核后 apply 才写入上面两张生产表。', { size: 9.5, fill: C.rost.sub });
  s += `</svg>`;
  return { svg: s, name: 'fig2_pipeline.svg' };
}

// ============================================================
// 图 1-1 技术架构（5 进程 + 调用关系，无端口）
// ============================================================
function buildTech() {
  const svg = `<svg viewBox="0 0 680 380" role="img" xmlns="http://www.w3.org/2000/svg"><title>技术架构</title><desc>前端经 /api 代理调后端，后端用 HTTP 调排班求解器并接收其回调，后端读写 MySQL；浏览器不直连求解器，求解器不直连数据库。</desc><defs><marker id="g" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,3 L0,6 Z" fill="#5A6472"/></marker></defs><rect width="680" height="380" fill="#FFFFFF"/><rect x="30" y="110" width="150" height="84" rx="10" fill="#E8F1FB" stroke="#2E6FB0" stroke-width="1.5"/><text x="105" y="147" text-anchor="middle" font-size="14.5" font-weight="700" fill="#0C447C" font-family="${FONT}">前端（浏览器）</text><text x="105" y="169" text-anchor="middle" font-size="11.5" fill="#3A6EA5" font-family="${FONT}">React（CRA）</text><rect x="265" y="110" width="150" height="84" rx="10" fill="#E8F1FB" stroke="#2E6FB0" stroke-width="1.5"/><text x="340" y="147" text-anchor="middle" font-size="14.5" font-weight="700" fill="#0C447C" font-family="${FONT}">后端 API</text><text x="340" y="169" text-anchor="middle" font-size="11.5" fill="#3A6EA5" font-family="${FONT}">Express + TypeScript</text><rect x="500" y="110" width="150" height="84" rx="10" fill="#E8F1FB" stroke="#2E6FB0" stroke-width="1.5"/><text x="575" y="147" text-anchor="middle" font-size="14.5" font-weight="700" fill="#0C447C" font-family="${FONT}">排班求解器 V4</text><text x="575" y="169" text-anchor="middle" font-size="11.5" fill="#3A6EA5" font-family="${FONT}">Flask + OR-Tools</text><rect x="265" y="265" width="150" height="70" rx="10" fill="#EEF1F5" stroke="#8A94A6" stroke-width="1.5"/><text x="340" y="297" text-anchor="middle" font-size="14.5" font-weight="700" fill="#2B3340" font-family="${FONT}">数据库</text><text x="340" y="317" text-anchor="middle" font-size="11.5" fill="#5A6472" font-family="${FONT}">MySQL · aps_system</text><rect x="500" y="265" width="150" height="70" rx="10" fill="#EEF1F5" stroke="#8A94A6" stroke-width="1.5"/><text x="575" y="297" text-anchor="middle" font-size="14.5" font-weight="700" fill="#2B3340" font-family="${FONT}">排班求解器 V5</text><text x="575" y="317" text-anchor="middle" font-size="11.5" fill="#5A6472" font-family="${FONT}">增强可视化版</text><line x1="182" y1="142" x2="261" y2="142" stroke="#5A6472" stroke-width="1.8" marker-end="url(#g)"/><text x="221" y="135" text-anchor="middle" font-size="10.5" fill="#5A6472" font-family="${FONT}">请求 /api</text><line x1="261" y1="166" x2="182" y2="166" stroke="#5A6472" stroke-width="1.8" marker-end="url(#g)"/><text x="221" y="182" text-anchor="middle" font-size="10.5" fill="#5A6472" font-family="${FONT}">进度 SSE</text><line x1="417" y1="142" x2="496" y2="142" stroke="#5A6472" stroke-width="1.8" marker-end="url(#g)"/><text x="456" y="135" text-anchor="middle" font-size="10.5" fill="#5A6472" font-family="${FONT}">求解请求</text><line x1="496" y1="166" x2="417" y2="166" stroke="#5A6472" stroke-width="1.8" marker-end="url(#g)"/><text x="456" y="182" text-anchor="middle" font-size="10.5" fill="#5A6472" font-family="${FONT}">进度回调</text><line x1="340" y1="196" x2="340" y2="263" stroke="#5A6472" stroke-width="1.8" marker-end="url(#g)"/><text x="349" y="234" text-anchor="start" font-size="10.5" fill="#5A6472" font-family="${FONT}">读写（连接池）</text><line x1="575" y1="196" x2="575" y2="263" stroke="#8A94A6" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#g)"/><text x="584" y="234" text-anchor="start" font-size="10.5" fill="#5A6472" font-family="${FONT}">链路同构</text><text x="340" y="360" text-anchor="middle" font-size="11" fill="#5A6472" font-family="${FONT}">浏览器不直连求解器；求解器经回调与后端通信，自身不连数据库。</text></svg>`;
  return { svg, name: 'fig_tech.svg' };
}

for (const f of [buildTech(), buildER(), buildPipeline()]) {
  fs.writeFileSync(path.join(OUT, f.name), f.svg);
  console.log('wrote', f.name, f.svg.length, 'bytes');
}
