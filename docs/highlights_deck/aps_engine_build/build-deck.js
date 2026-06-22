// 排产—排班引擎 · 汇报 PPT (Apple dark style)
const pptxgen = require("pptxgenjs");
const A = __dirname + "/assets";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.author = "MFG8APS";
pres.title = "排产—排班引擎";

const W = 13.33, H = 7.5;
const FONT = "PingFang SC";
const INK = "F5F5F7", DIM = "9A9AA3", FAINT = "70707E";
const BLUE = "0A84FF", CYAN = "5AC8FA", GREEN = "30D158", MINT = "66D4CF", RED = "FF453A", PURPLE = "BF5AF2";
const PANEL = "13131D", BORDER = "2D2D3C";

const RECT = pres.shapes.RECTANGLE, ROUND = pres.shapes.ROUNDED_RECTANGLE, OVAL = pres.shapes.OVAL, LINE = pres.shapes.LINE;

function bg(s) { s.background = { path: A + "/bg.png" }; }
function glow(s, name, x, y, sz, transparency) {
  s.addImage({ path: A + "/glow_" + name + ".png", x, y, w: sz, h: sz, transparency: transparency || 0 });
}
function txt(s, text, o) { s.addText(text, Object.assign({ fontFace: FONT, color: INK }, o)); }
function kicker(s, text, color) {
  txt(s, text, { x: 0.92, y: 0.66, w: 9, h: 0.4, fontSize: 13, color: color, charSpacing: 4, bold: true, margin: 0 });
}
function title(s, text) {
  txt(s, text, { x: 0.9, y: 1.06, w: 11.6, h: 1.0, fontSize: 38, color: INK, bold: false, margin: 0 });
}
function para(s, text, y, w) {
  txt(s, text, { x: 0.92, y: y, w: w || 8.6, h: 1.2, fontSize: 16, color: DIM, lineSpacingMultiple: 1.3, margin: 0 });
}
function foot(s, n) {
  txt(s, "排产—排班引擎", { x: 0.9, y: 7.02, w: 5, h: 0.3, fontSize: 9.5, color: FAINT, margin: 0 });
  txt(s, String(n).padStart(2, "0"), { x: 12.0, y: 7.02, w: 0.9, h: 0.3, fontSize: 9.5, color: FAINT, align: "right", margin: 0 });
}
function card(s, x, y, w, h, opt) {
  opt = opt || {};
  s.addShape(ROUND, {
    x, y, w, h, rectRadius: 0.1,
    fill: { color: opt.fill || PANEL, transparency: opt.fillT == null ? 22 : opt.fillT },
    line: { color: opt.border || BORDER, width: opt.lw || 1 },
  });
}
function pill(s, x, y, w, h, color, t) {
  s.addShape(ROUND, { x, y, w, h, rectRadius: h / 2, fill: { color: color, transparency: t == null ? 65 : t }, line: { color: color, width: 1, transparency: 35 } });
}
function dot(s, x, y, d, color, t) {
  s.addShape(OVAL, { x, y, w: d, h: d, fill: { color: color, transparency: t || 0 }, line: { type: "none" } });
}
function ring(s, x, y, d, color, lw, t) {
  s.addShape(OVAL, { x, y, w: d, h: d, fill: { color: "050507", transparency: 100 }, line: { color: color, width: lw || 1.25, transparency: t || 0 } });
}
function arrow(s, x, y, w, color) {
  s.addShape(LINE, { x, y, w, h: 0, line: { color: color || DIM, width: 1.75, endArrowType: "triangle" } });
}
function bar(s, x, y, w, h, color, t) {
  s.addShape(ROUND, { x, y, w, h, rectRadius: Math.min(h / 2, 0.08), fill: { color: color, transparency: t == null ? 50 : t }, line: { type: "none" } });
}

// ---------- P1 Cover ----------
(function () {
  const s = pres.addSlide(); bg(s);
  glow(s, "blue", 2.0, -1.4, 8.2, 8);
  glow(s, "green", 4.6, -0.6, 6.6, 24);
  const cx = 6.665, cy = 2.55;
  ring(s, cx - 1.25, cy - 1.25, 2.5, CYAN, 1.1, 55);
  ring(s, cx - 0.72, cy - 0.72, 1.44, BLUE, 1.4, 30);
  dot(s, cx - 0.16, cy - 0.16, 0.32, "FFFFFF", 0);
  dot(s, cx - 0.05, cy - 0.05, 0.1, CYAN, 0);
  txt(s, "排产—排班引擎", { x: 0, y: 3.55, w: W, h: 1.0, fontSize: 50, align: "center", charSpacing: 2, bold: false });
  txt(s, "面向生物制药商业化生产的排程平台", { x: 0, y: 4.7, w: W, h: 0.5, fontSize: 18, color: DIM, align: "center" });
  txt(s, "内部汇报", { x: 0, y: 6.55, w: W, h: 0.3, fontSize: 11, color: FAINT, align: "center", charSpacing: 2 });
})();

// ---------- P2 商业化生产的特点 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "背景", DIM);
  title(s, "商业化生产的特点");
  para(s, "工艺流程稳定，多批次常年连续运转。", 2.05);
  glow(s, "blue", 1.0, 3.2, 7.5, 35);
  // staggered gantt: multiple batches running continuously across time
  const lanes = [3.95, 4.55, 5.15], gx = 1.3;
  const bars = [
    [0, 0.0, 3.0], [1, 0.7, 3.2], [2, 1.6, 3.0],
    [0, 3.2, 3.4], [1, 4.1, 3.6], [2, 4.9, 3.2], [0, 6.8, 3.0],
  ];
  s.addShape(LINE, { x: gx, y: 5.85, w: 10.8, h: 0, line: { color: BORDER, width: 1 } });
  bars.forEach((b, i) => {
    bar(s, gx + b[1], lanes[b[0]], b[2], 0.46, i % 2 ? CYAN : BLUE, i % 2 ? 50 : 38);
    txt(s, "批次 " + (i + 1), { x: gx + b[1] + 0.15, y: lanes[b[0]], w: b[2] - 0.2, h: 0.46, fontSize: 11.5, color: INK, valign: "middle", margin: 0 });
  });
  txt(s, "时间 →", { x: 11.0, y: 5.95, w: 1.6, h: 0.3, fontSize: 11, color: FAINT, margin: 0 });
  foot(s, 2);
})();

// ---------- P3 人工排班的难点 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "背景", DIM);
  title(s, "人工排班的难点");
  para(s, "员工数量多、资质分级、班次约束复杂，且请假频繁；任一变动都会牵动整张班表。", 2.05, 9.2);
  glow(s, "red", 6.8, 3.0, 6.4, 35);
  // tangle of lines converging
  const cx = 9.7, cy = 5.0;
  const ends = [[7.0, 3.7], [12.2, 3.6], [6.7, 5.2], [12.4, 5.4], [7.4, 6.4], [11.9, 6.5], [9.6, 3.3]];
  ends.forEach((p, i) => {
    s.addShape(LINE, { x: Math.min(p[0], cx), y: Math.min(p[1], cy), w: Math.abs(cx - p[0]), h: Math.abs(cy - p[1]), line: { color: i % 2 ? CYAN : "6B6B7A", width: 1, transparency: 35, beginArrowType: "none" }, flipV: (p[1] > cy) !== (p[0] > cx) ? true : false });
  });
  ends.forEach((p) => dot(s, p[0] - 0.06, p[1] - 0.06, 0.12, "8A8A99", 30));
  dot(s, cx - 0.16, cy - 0.16, 0.32, RED, 0);
  dot(s, cx - 0.05, cy - 0.05, 0.1, "FFFFFF", 0);
  txt(s, "牵一发而动全身", { x: cx - 1.6, y: cy + 0.4, w: 3.2, h: 0.4, fontSize: 13, color: RED, align: "center", margin: 0 });
  foot(s, 3);
})();

// ---------- P4 总体思路 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "思路", DIM);
  title(s, "总体思路：两层衔接");
  para(s, "先确定生产需要哪些操作（排产），再决定由谁完成（排班），两层单向衔接。", 2.05, 10.5);
  const cy = 3.55, ch = 2.5;
  glow(s, "blue", 0.6, 3.0, 5.6, 45);
  glow(s, "green", 7.1, 3.0, 5.6, 45);
  card(s, 1.3, cy, 4.5, ch, { border: BLUE });
  card(s, 7.5, cy, 4.5, ch, { border: GREEN });
  bar(s, 1.3, cy, 1.1, 0.08, BLUE, 0);
  bar(s, 7.5, cy, 1.1, 0.08, GREEN, 0);
  txt(s, "排产", { x: 1.3, y: cy + 0.55, w: 4.5, h: 0.7, fontSize: 30, color: INK, align: "center", margin: 0 });
  txt(s, "决定要什么", { x: 1.3, y: cy + 1.45, w: 4.5, h: 0.5, fontSize: 15, color: BLUE, align: "center", margin: 0 });
  txt(s, "排班", { x: 7.5, y: cy + 0.55, w: 4.5, h: 0.7, fontSize: 30, color: INK, align: "center", margin: 0 });
  txt(s, "决定谁来做", { x: 7.5, y: cy + 1.45, w: 4.5, h: 0.5, fontSize: 15, color: GREEN, align: "center", margin: 0 });
  arrow(s, 5.95, cy + ch / 2, 1.4, DIM);
  txt(s, "操作需求", { x: 5.7, y: cy + ch / 2 - 0.5, w: 1.9, h: 0.3, fontSize: 11, color: FAINT, align: "center", margin: 0 });
  foot(s, 4);
})();

// ---------- Section helper ----------
function section(n, step, name, sub, gcolor, kcolor) {
  const s = pres.addSlide(); bg(s);
  glow(s, gcolor, 3.4, -0.6, 6.6, 30);
  txt(s, step, { x: 0, y: 2.5, w: W, h: 0.5, fontSize: 16, color: kcolor, align: "center", charSpacing: 6, bold: true });
  txt(s, name, { x: 0, y: 3.05, w: W, h: 1.1, fontSize: 52, color: INK, align: "center", bold: false });
  s.addShape(LINE, { x: W / 2 - 0.4, y: 4.45, w: 0.8, h: 0, line: { color: kcolor, width: 1.5 } });
  txt(s, sub, { x: 0, y: 4.65, w: W, h: 0.5, fontSize: 18, color: DIM, align: "center" });
  foot(s, n);
}

// ---------- P5 Section 排产 ----------
section(5, "第一步", "排产建模", "决定要什么", "blue", BLUE);

// ---------- P6 工艺标准化与模板 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "排产建模", BLUE);
  title(s, "工艺标准化与模板");
  para(s, "全部工艺操作标准化建库；操作 = 需求（人 / 资质 / 设备 / 时间窗）+ 产出，组合成标准模板。", 2.05, 11.0);
  glow(s, "blue", 6.0, 3.2, 6.5, 40);
  // left: library grid
  txt(s, "操作库", { x: 1.3, y: 3.35, w: 3.0, h: 0.35, fontSize: 12, color: DIM, margin: 0 });
  const gx = 1.3, gy = 3.8, cs = 0.62, cg = 0.16;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    s.addShape(ROUND, { x: gx + c * (cs + cg), y: gy + r * (cs + cg), w: cs, h: cs, rectRadius: 0.06, fill: { color: BLUE, transparency: 72 }, line: { color: BLUE, width: 0.75, transparency: 45 } });
  }
  arrow(s, 4.95, 4.75, 1.2, DIM);
  // right: template stack
  txt(s, "工艺模板", { x: 6.6, y: 3.35, w: 3.0, h: 0.35, fontSize: 12, color: DIM, margin: 0 });
  const tx = 6.6, ty = 3.8, tw = 4.6, th = 0.6, tg = 0.22;
  const labels = ["上游操作", "配液操作", "下游操作"];
  for (let i = 0; i < 3; i++) {
    const y = ty + i * (th + tg);
    card(s, tx, y, tw, th, { fill: PANEL, border: BLUE, fillT: 30 });
    bar(s, tx, y, 0.09, th, BLUE, 0);
    txt(s, labels[i], { x: tx + 0.3, y: y, w: 2.4, h: th, fontSize: 13.5, color: INK, valign: "middle", margin: 0 });
    txt(s, "需求 + 产出", { x: tx + tw - 2.0, y: y, w: 1.75, h: th, fontSize: 11, color: FAINT, valign: "middle", align: "right", margin: 0 });
  }
  foot(s, 6);
})();

// ---------- P7 全工艺流覆盖 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "排产建模", BLUE);
  title(s, "全工艺流覆盖");
  para(s, "覆盖 media / buffer 全工艺流，上游、配液、下游一体，而非只排上游。", 2.05, 11.0);
  glow(s, "blue", 1.0, 3.2, 7.0, 35);
  const segs = ["上游", "配液", "下游"];
  const x0 = 1.4, y0 = 3.7, sw = 3.2, sh = 0.95, sg = 0.62;
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (sw + sg);
    card(s, x, y0, sw, sh, { fill: BLUE, border: CYAN, fillT: 55 });
    txt(s, segs[i], { x: x, y: y0, w: sw, h: sh, fontSize: 19, color: INK, align: "center", valign: "middle", margin: 0 });
    if (i < 2) arrow(s, x + sw + 0.12, y0 + sh / 2, sg - 0.24, CYAN);
  }
  txt(s, "本系统：全工艺流一体排产", { x: x0, y: y0 + sh + 0.28, w: 10, h: 0.35, fontSize: 13, color: CYAN, margin: 0 });
  // contrast row
  const cy = 5.65;
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (sw + sg);
    const lit = i === 0;
    card(s, x, cy, sw, 0.7, { fill: lit ? "5A5A66" : PANEL, border: lit ? "8A8A99" : BORDER, fillT: lit ? 55 : 35 });
    txt(s, segs[i], { x: x, y: cy, w: sw, h: 0.7, fontSize: 14, color: lit ? INK : FAINT, align: "center", valign: "middle", margin: 0 });
  }
  txt(s, "对照：常见系统仅覆盖上游", { x: x0, y: cy + 0.82, w: 10, h: 0.35, fontSize: 12, color: FAINT, margin: 0 });
  foot(s, 7);
})();

// ---------- P8 批次生成 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "排产建模", BLUE);
  title(s, "批次生成");
  para(s, "一键生成多批次排产计划，异常时支持手动调整。", 2.05);
  glow(s, "blue", 5.0, 3.0, 6.8, 40);
  // template
  card(s, 1.3, 4.05, 2.5, 1.5, { fill: BLUE, border: CYAN, fillT: 55 });
  txt(s, "工艺模板", { x: 1.3, y: 4.05, w: 2.5, h: 1.5, fontSize: 15, color: INK, align: "center", valign: "middle", margin: 0 });
  arrow(s, 3.95, 4.8, 1.15, DIM);
  txt(s, "一键生成", { x: 3.75, y: 4.35, w: 1.6, h: 0.3, fontSize: 11, color: FAINT, align: "center", margin: 0 });
  // gantt
  const gx = 5.5, gy = 3.55, rh = 0.46, rg = 0.16;
  const rows = [[0, 4.2], [0.8, 3.4], [0.3, 4.6], [1.4, 3.0], [0.6, 3.8]];
  s.addShape(LINE, { x: gx, y: gy - 0.15, w: 0, h: rows.length * (rh + rg) + 0.1, line: { color: BORDER, width: 1 } });
  for (let i = 0; i < rows.length; i++) {
    const y = gy + i * (rh + rg);
    const isErr = i === 3;
    bar(s, gx + 0.2 + rows[i][0], y, rows[i][1], rh, isErr ? RED : CYAN, isErr ? 30 : 50);
    if (isErr) txt(s, "异常 · 可手动调整", { x: gx + 0.2 + rows[i][0] + rows[i][1] + 0.15, y: y - 0.04, w: 3.2, h: rh, fontSize: 11, color: RED, valign: "middle", margin: 0 });
  }
  txt(s, "多批次排产计划", { x: gx, y: gy + rows.length * (rh + rg) + 0.08, w: 4, h: 0.3, fontSize: 12, color: DIM, margin: 0 });
  foot(s, 8);
})();

// ---------- P9 Section 排班 ----------
section(9, "第二步", "排班求解", "决定谁来做", "green", GREEN);

// ---------- P10 操作拆解与岗位分级 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "排班求解", GREEN);
  title(s, "操作拆解与岗位分级");
  para(s, "批次拆成单元操作，每个操作的岗位（A / B / C）设不同资质等级要求。", 2.05, 11.0);
  glow(s, "green", 5.5, 3.2, 6.6, 40);
  // batch
  bar(s, 1.3, 4.4, 3.0, 0.7, GREEN, 45);
  txt(s, "批次", { x: 1.3, y: 4.4, w: 3.0, h: 0.7, fontSize: 15, color: INK, align: "center", valign: "middle", margin: 0 });
  arrow(s, 4.5, 4.75, 1.1, DIM);
  txt(s, "打散", { x: 4.35, y: 4.32, w: 1.4, h: 0.3, fontSize: 11, color: FAINT, align: "center", margin: 0 });
  // operation cards
  const ox = 5.85, oy = 3.5, ow = 2.1, oh = 2.6, og = 0.3;
  const lv = [["A", "L3"], ["B", "L2"], ["C", "L1"]];
  for (let k = 0; k < 3; k++) {
    const x = ox + k * (ow + og);
    card(s, x, oy, ow, oh, { fill: PANEL, border: k === 0 ? GREEN : BORDER });
    txt(s, "单元操作", { x: x, y: oy + 0.18, w: ow, h: 0.35, fontSize: 12, color: DIM, align: "center", margin: 0 });
    for (let j = 0; j < 3; j++) {
      const py = oy + 0.7 + j * 0.6;
      pill(s, x + 0.3, py, ow - 0.6, 0.46, GREEN, 70);
      txt(s, "岗位 " + lv[j][0], { x: x + 0.42, y: py, w: 1.0, h: 0.46, fontSize: 12.5, color: INK, valign: "middle", margin: 0 });
      txt(s, lv[j][1], { x: x + ow - 0.95, y: py, w: 0.6, h: 0.46, fontSize: 11, color: MINT, valign: "middle", align: "right", margin: 0 });
    }
  }
  txt(s, "每岗位独立资质等级", { x: ox, y: oy + oh + 0.2, w: 3 * ow + 2 * og, h: 0.3, fontSize: 12, color: DIM, align: "center", margin: 0 });
  foot(s, 10);
})();

// ---------- P11 约束求解与目标优化 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "排班求解", GREEN);
  title(s, "约束求解与目标优化");
  para(s, "求解器在夜班间隔、连续天数、标准工时等约束下，把“岗位 × 班次”分配给满足资质的员工。", 2.0, 11.2);
  glow(s, "green", 4.6, 3.0, 6.4, 35);
  const midY = 4.35;
  // employees
  txt(s, "员工", { x: 1.2, y: 3.25, w: 1.6, h: 0.3, fontSize: 12, color: DIM, align: "center", margin: 0 });
  for (let i = 0; i < 5; i++) dot(s, 1.55 + (i % 2) * 0.5, 3.7 + i * 0.42, 0.3, i % 2 ? CYAN : "8A8A99", 20);
  // lens
  s.addShape(ROUND, { x: 4.7, y: 3.55, w: 1.5, h: 2.0, rectRadius: 0.2, fill: { color: GREEN, transparency: 60 }, line: { color: MINT, width: 1.5, transparency: 20 } });
  txt(s, "约束\n求解", { x: 4.7, y: 3.55, w: 1.5, h: 2.0, fontSize: 14, color: INK, align: "center", valign: "middle", margin: 0 });
  arrow(s, 3.0, midY, 1.55, DIM);
  arrow(s, 6.35, midY, 1.4, MINT);
  // slots grid
  txt(s, "岗位 × 班次", { x: 7.9, y: 3.25, w: 3.0, h: 0.3, fontSize: 12, color: DIM, margin: 0 });
  const sx = 7.9, sy = 3.65, ss = 0.66, sgp = 0.2;
  let f = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const filled = (r + c) % 3 !== 0;
    s.addShape(ROUND, { x: sx + c * (ss + sgp), y: sy + r * (ss + sgp), w: ss, h: ss, rectRadius: 0.07, fill: { color: filled ? GREEN : PANEL, transparency: filled ? 45 : 30 }, line: { color: filled ? MINT : BORDER, width: 1, transparency: filled ? 25 : 0 } });
  }
  // objective chips
  const obj = ["最小化总工时", "均衡夜班", "最小化空缺"];
  const cw = 3.4, cgap = 0.35, cx0 = 1.3, oyc = 6.15;
  for (let i = 0; i < 3; i++) {
    const x = cx0 + i * (cw + cgap);
    card(s, x, oyc, cw, 0.55, { fill: PANEL, border: GREEN, fillT: 35 });
    dot(s, x + 0.28, oyc + 0.205, 0.14, MINT, 0);
    txt(s, obj[i], { x: x + 0.55, y: oyc, w: cw - 0.7, h: 0.55, fontSize: 13, color: INK, valign: "middle", margin: 0 });
  }
  txt(s, "优化目标", { x: cx0, y: oyc - 0.35, w: 4, h: 0.3, fontSize: 11, color: DIM, margin: 0 });
  foot(s, 11);
})();

// ---------- P12 老带新与缺口示警 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "排班求解", GREEN);
  title(s, "老带新与缺口示警");
  para(s, "同一操作可排出资深与新人的搭配；排不满时输出空缺岗位（报增援），不影响整体推进。", 2.05, 11.2);
  glow(s, "green", 1.0, 3.2, 6.4, 40);
  glow(s, "red", 8.0, 3.2, 6.0, 40);
  // operation card with pairing
  card(s, 1.6, 3.7, 4.6, 2.5, { border: GREEN });
  txt(s, "同一操作", { x: 1.6, y: 3.85, w: 4.6, h: 0.35, fontSize: 12, color: DIM, align: "center", margin: 0 });
  pill(s, 2.0, 4.45, 3.8, 0.6, GREEN, 60);
  txt(s, "资深员工 · L3", { x: 2.2, y: 4.45, w: 3.4, h: 0.6, fontSize: 13.5, color: INK, valign: "middle", margin: 0 });
  pill(s, 2.0, 5.4, 3.8, 0.6, GREEN, 78);
  txt(s, "新人 · L1", { x: 2.2, y: 5.4, w: 3.4, h: 0.6, fontSize: 13.5, color: INK, valign: "middle", margin: 0 });
  s.addShape(LINE, { x: 1.85, y: 4.75, w: 0, h: 0.95, line: { color: MINT, width: 1.5 } });
  txt(s, "带教", { x: 0.95, y: 5.0, w: 0.8, h: 0.3, fontSize: 11, color: MINT, align: "center", margin: 0 });
  // vacancy
  s.addShape(ROUND, { x: 8.0, y: 4.05, w: 3.6, h: 1.8, rectRadius: 0.12, fill: { color: RED, transparency: 80 }, line: { color: RED, width: 1.5, dashType: "dash", transparency: 15 } });
  txt(s, "空缺岗位", { x: 8.0, y: 4.5, w: 3.6, h: 0.45, fontSize: 17, color: INK, align: "center", margin: 0 });
  txt(s, "报增援", { x: 8.0, y: 5.1, w: 3.6, h: 0.4, fontSize: 14, color: RED, align: "center", margin: 0 });
  foot(s, 12);
})();

// ---------- P13 弹性与变更响应 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "运维", MINT);
  title(s, "弹性与变更响应");
  para(s, "排班随请假与工艺变化持续滚动，无需每次全局重排。", 2.05);
  const items = [
    ["独立任务穿插", "维护、巡查等非工艺任务，统一参与求解。", BLUE],
    ["请假双轨", "预知请假事前规避，临时请假一键替换。", GREEN],
    ["局部重排", "工艺调整后只重排受影响区域。", MINT],
  ];
  const cw = 3.62, cgap = 0.34, x0 = 0.9, cy = 3.45, ch = 2.95;
  items.forEach((it, i) => {
    const x = x0 + i * (cw + cgap);
    glow(s, i === 0 ? "blue" : i === 1 ? "green" : "cyan", x + cw / 2 - 2.2, cy - 0.6, 4.4, 55);
    card(s, x, cy, cw, ch, { border: it[2] });
    ring(s, x + 0.45, cy + 0.5, 0.62, it[2], 1.6, 10);
    dot(s, x + 0.45 + 0.21, cy + 0.5 + 0.21, 0.2, it[2], 10);
    txt(s, it[0], { x: x + 0.45, y: cy + 1.4, w: cw - 0.8, h: 0.5, fontSize: 19, color: INK, margin: 0 });
    txt(s, it[1], { x: x + 0.45, y: cy + 2.0, w: cw - 0.85, h: 0.8, fontSize: 13.5, color: DIM, lineSpacingMultiple: 1.25, margin: 0 });
  });
  foot(s, 13);
})();

// ---------- P14 模块化架构 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "平台架构", PURPLE);
  title(s, "模块化架构");
  para(s, "约束与优化目标都是可注册的独立模块，新增规则或目标只需挂载新模块，不改求解核心。", 2.05, 11.2);
  glow(s, "purple", 4.6, 3.0, 6.4, 30);
  // core
  const ccx = 5.4, ccy = 3.65, cwid = 2.55, chei = 2.05;
  card(s, ccx, ccy, cwid, chei, { fill: PURPLE, border: PURPLE, fillT: 55 });
  txt(s, "求解核心", { x: ccx, y: ccy, w: cwid, h: chei, fontSize: 17, color: INK, align: "center", valign: "middle", margin: 0 });
  // modules on each side, connected by clean horizontal lines
  const mh = 0.78, rowY = [4.05, 5.2];
  const mods = [
    [1.6, rowY[0], "夜班间隔", BLUE, false], [1.6, rowY[1], "连续天数", BLUE, false],
    [9.17, rowY[0], "最小化工时", GREEN, true], [9.17, rowY[1], "均衡夜班", GREEN, true],
  ];
  mods.forEach((m) => {
    card(s, m[0], m[1], 2.4, mh, { border: m[3] });
    txt(s, m[2], { x: m[0], y: m[1], w: 2.4, h: mh, fontSize: 14, color: INK, align: "center", valign: "middle", margin: 0 });
    const cy = m[1] + mh / 2;
    if (m[4]) s.addShape(LINE, { x: ccx + cwid, y: cy, w: m[0] - (ccx + cwid), h: 0, line: { color: m[3], width: 1.25, transparency: 25 } });
    else s.addShape(LINE, { x: m[0] + 2.4, y: cy, w: ccx - (m[0] + 2.4), h: 0, line: { color: m[3], width: 1.25, transparency: 25 } });
  });
  txt(s, "约束模块", { x: 1.6, y: 6.15, w: 2.4, h: 0.3, fontSize: 11.5, color: BLUE, align: "center", margin: 0 });
  txt(s, "目标模块", { x: 9.17, y: 6.15, w: 2.4, h: 0.3, fontSize: 11.5, color: GREEN, align: "center", margin: 0 });
  txt(s, "挂载即生效 · 不改核心", { x: ccx - 0.55, y: ccy + chei + 0.18, w: 3.65, h: 0.3, fontSize: 11.5, color: DIM, align: "center", margin: 0 });
  foot(s, 14);
})();

// ---------- P15 跨厂跨项目复用 ----------
(function () {
  const s = pres.addSlide(); bg(s);
  kicker(s, "平台架构", PURPLE);
  title(s, "跨厂跨项目复用");
  para(s, "接新厂换主数据，加规则挂约束模块，加目标挂目标模块；三类扩展互相解耦。", 2.05, 11.2);
  glow(s, "purple", 4.6, 3.1, 6.4, 35);
  // data packs -> engine -> outputs
  const ey = 3.9;
  ["厂 A", "厂 B", "厂 C"].forEach((t, i) => {
    const y = 3.55 + i * 0.78;
    card(s, 1.3, y, 2.0, 0.62, { border: PURPLE, fillT: 30 });
    txt(s, t + " 主数据", { x: 1.3, y: y, w: 2.0, h: 0.62, fontSize: 12.5, color: INK, align: "center", valign: "middle", margin: 0 });
  });
  arrow(s, 3.5, ey + 0.4, 1.2, DIM);
  card(s, 4.95, ey, 2.6, 1.5, { fill: PURPLE, border: PURPLE, fillT: 55 });
  txt(s, "同一引擎", { x: 4.95, y: ey, w: 2.6, h: 1.5, fontSize: 16, color: INK, align: "center", valign: "middle", margin: 0 });
  arrow(s, 7.75, ey + 0.4, 1.2, MINT);
  ["排班 A", "排班 B", "排班 C"].forEach((t, i) => {
    const y = 3.55 + i * 0.78;
    card(s, 9.2, y, 2.0, 0.62, { border: GREEN, fillT: 30 });
    txt(s, t, { x: 9.2, y: y, w: 2.0, h: 0.62, fontSize: 12.5, color: INK, align: "center", valign: "middle", margin: 0 });
  });
  // three decoupled extensions
  const ext = ["换主数据 → 接新厂", "挂约束模块 → 加规则", "挂目标模块 → 加目标"];
  const ew = 3.6, eg = 0.3, ex0 = 1.1, ey2 = 6.15;
  ext.forEach((t, i) => {
    const x = ex0 + i * (ew + eg);
    card(s, x, ey2, ew, 0.55, { fill: PANEL, border: BORDER, fillT: 30 });
    txt(s, t, { x: x, y: ey2, w: ew, h: 0.55, fontSize: 12.5, color: DIM, align: "center", valign: "middle", margin: 0 });
  });
  foot(s, 15);
})();

// ---------- P16 系统定位 (closing) ----------
(function () {
  const s = pres.addSlide(); bg(s);
  glow(s, "blue", 1.6, -0.4, 5.2, 35);
  glow(s, "green", 6.6, -0.6, 5.2, 35);
  glow(s, "purple", 4.4, -0.2, 4.6, 40);
  // constellation
  const nodes = [[5.2, 1.5], [7.4, 1.3], [8.5, 2.6], [6.665, 2.7], [5.0, 2.9], [6.2, 3.6], [8.0, 3.5]];
  const edges = [[3, 0], [3, 1], [3, 2], [3, 4], [3, 5], [5, 6], [2, 1], [4, 0]];
  edges.forEach((e) => {
    const a = nodes[e[0]], b = nodes[e[1]];
    s.addShape(LINE, { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]), line: { color: CYAN, width: 1, transparency: 55 }, flipV: (a[0] > b[0]) !== (a[1] > b[1]) });
  });
  nodes.forEach((n, i) => dot(s, n[0] - 0.09, n[1] - 0.09, 0.18, i === 3 ? "FFFFFF" : CYAN, i === 3 ? 0 : 25));
  txt(s, "系统定位", { x: 0, y: 4.0, w: W, h: 0.45, fontSize: 15, color: PURPLE, align: "center", charSpacing: 5, bold: true });
  txt(s, "一个可复用、可配置的排产—排班平台", { x: 0, y: 4.5, w: W, h: 0.8, fontSize: 32, color: INK, align: "center", bold: false });
  txt(s, "建模一次，配置即用", { x: 0, y: 5.55, w: W, h: 0.5, fontSize: 18, color: DIM, align: "center" });
  foot(s, 16);
})();

pres.writeFile({ fileName: __dirname + "/排产排班引擎.pptx" }).then((f) => console.log("WROTE", f));
