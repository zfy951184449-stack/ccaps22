// build.js — 组装《上游反应器工艺放大》培训 PPT(药明青绿 / 讲义版 / 全原生图文)
const pptxgen = require("pptxgenjs");
const L = require("./lib");
const content = require("./content");
const extras = require("./extras");
const { C, M, PAGE, FONT_H, FONT_B } = L;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.author = "无锡药明生物 · 上游工艺培训";
pres.title = content.meta.title;
const RR = pres.shapes.ROUNDED_RECTANGLE, RECT = pres.shapes.RECTANGLE, OVAL = pres.shapes.OVAL,
  LINE = pres.shapes.LINE, CHEV = pres.shapes.CHEVRON, TRI = pres.shapes.ISOSCELES_TRIANGLE;
const sh = () => ({ type: "outer", color: "0A453B", blur: 7, offset: 3, angle: 135, opacity: 0.16 });
const shSoft = () => ({ type: "outer", color: "1A3D36", blur: 9, offset: 2, angle: 90, opacity: 0.10 });

// ============ 通用绘图小工具 ============
// 标签框(形状+文字一体)
function lbox(slide, text, o) {
  slide.addText(text, Object.assign({ shape: o.round ? RR : RECT, fontFace: FONT_B, align: "center", valign: "middle", margin: 2 }, o));
}
// 右向箭头(细)
function arrowR(slide, x, y, w, color) {
  slide.addShape(CHEV, { x, y: y - 0.13, w: w, h: 0.26, fill: { color }, line: { type: "none" } });
}
// 圆形图标占位(数字/字母)
function badge(slide, x, y, d, txt, fill, color) {
  slide.addText(txt, { shape: OVAL, x, y, w: d, h: d, fill: { color: fill }, color: color || C.white, bold: true, align: "center", valign: "middle", fontFace: FONT_H, fontSize: d > 0.55 ? 16 : 12, margin: 0, line: { type: "none" } });
}
// 搅拌罐剖面示意
function reactor(slide, x, y, w, h, opt = {}) {
  const liq = opt.liq != null ? opt.liq : 0.6; // 液位占比
  const body = h * 0.88;
  // 罐体
  slide.addShape(RR, { x, y, w, h: body, fill: { color: opt.bodyFill || C.mintTint2 }, line: { color: C.teal, width: 1.5 }, rectRadius: 0.08 });
  // 底部圆弧
  slide.addShape(OVAL, { x, y: y + body - 0.12, w, h: 0.24, fill: { color: opt.bodyFill || C.mintTint2 }, line: { color: C.teal, width: 1.5 } });
  // 液面
  const ly = y + body * (1 - liq);
  slide.addShape(RECT, { x: x + 0.05, y: ly, w: w - 0.1, h: body * liq - 0.06, fill: { color: opt.liqFill || "CDEBE2" }, line: { type: "none" } });
  // 搅拌轴
  slide.addShape(RECT, { x: x + w / 2 - 0.025, y: y - 0.18, w: 0.05, h: body * 0.74, fill: { color: C.muted }, line: { type: "none" } });
  // 桨叶(两层)
  if (opt.impeller !== false) {
    [0.42, 0.66].forEach((f) => {
      const by = y + body * f;
      slide.addShape(RECT, { x: x + w / 2 - 0.32, y: by, w: 0.64, h: 0.07, fill: { color: C.seafoam }, line: { type: "none" } });
    });
  }
  // sparger + 气泡
  if (opt.sparger !== false) {
    slide.addShape(OVAL, { x: x + w / 2 - 0.22, y: y + body * 0.8, w: 0.44, h: 0.08, fill: { color: C.teal }, line: { type: "none" } });
    [[-0.12, 0.12], [0, 0.2], [0.12, 0.14], [-0.04, 0.05], [0.06, 0.05]].forEach(([dx, up], i) => {
      slide.addShape(OVAL, { x: x + w / 2 + dx - 0.03, y: y + body * 0.8 - up - 0.06, w: 0.06, h: 0.06, fill: { color: C.mint }, line: { type: "none" } });
    });
  }
}

// ============ 内容页布局 ============
const LAYOUT = {
  pathAndGoals: "side", upstreamLine: "full", threeTierStairs: "side", r3r2: "side",
  threeReactors: "full", strSelect: "full", cppOverview: "full", balanceChain: "side",
  geomSimilar: "full", fourQuantities: "side", impossibleTriangle: "full",
  threeCriteria: "full", criteriaTable: "full", scaleCalc: "full",
  seedTrain: "full", nMinusX: "full", riskMap: "side", foamMassTransfer: "full",
  troubleshoot: "full", monitoring: "full", cascade: "full", qbd: "full",
  comparability: "full", failures: "full", singleUse: "full", intensified: "full",
  summaryChain: "full", nextSteps: "side",
};

let pageNo = 0;
const TOTAL = 44; // 估计,页脚显示;最后会以实际为准在 footer 调

function contentSlide(s, chap) {
  const slide = pres.addSlide();
  slide.background = { color: C.white };
  pageNo++;
  L.contentHeader(slide, pres, { chapNo: chap.no, chapName: chap.name, title: s.title, sub: s.sub });
  L.footer(slide, pres, pageNo);
  const layout = LAYOUT[s.diagram] || "side";
  if (layout === "side") {
    L.bulletBlock(slide, pres, s.bullets, { x: M, y: 1.62, w: 5.95, h: 4.95, fontSize: 11.5, gap: 6 });
    const R = { x: 6.72, y: 1.62, w: 6.04, h: 3.55 };
    panelBg(slide, R);
    (D[s.diagram] || D._placeholder)(slide, R, s);
    // keyData 2x2
    kd2x2(slide, s.keyData, { x: 6.72, y: 5.34, w: 6.04, h: 1.42 });
  } else {
    // full: 顶部两列要点 + 下方大图
    const half = Math.ceil(s.bullets.length / 2);
    L.bulletBlock(slide, pres, s.bullets.slice(0, half), { x: M, y: 1.6, w: 6.0, h: 1.5, fontSize: 10.3, gap: 4 });
    L.bulletBlock(slide, pres, s.bullets.slice(half), { x: 6.85, y: 1.6, w: 5.9, h: 1.5, fontSize: 10.3, gap: 4 });
    const R = { x: M, y: 3.2, w: 12.13, h: 3.5 };
    (D[s.diagram] || D._placeholder)(slide, R, s);
  }
  return slide;
}

function panelBg(slide, R) {
  slide.addShape(RR, { x: R.x - 0.12, y: R.y - 0.1, w: R.w + 0.24, h: R.h + 0.2, fill: { color: C.mintTint2 }, line: { color: C.border, width: 1 }, rectRadius: 0.06 });
}

function kd2x2(slide, items, R) {
  const data = (items || []).slice(0, 4);
  const cw = (R.w - 0.16) / 2, ch = (R.h - 0.12) / 2;
  data.forEach((d, i) => {
    const cx = R.x + (i % 2) * (cw + 0.16), cy = R.y + Math.floor(i / 2) * (ch + 0.12);
    slide.addShape(RECT, { x: cx, y: cy, w: cw, h: ch, fill: { color: C.mintTint }, line: { type: "none" } });
    slide.addShape(RECT, { x: cx, y: cy, w: 0.055, h: ch, fill: { color: C.seafoam }, line: { type: "none" } });
    slide.addText(d, { x: cx + 0.14, y: cy + 0.03, w: cw - 0.22, h: ch - 0.06, fontFace: FONT_B, fontSize: 8.6, color: C.body, align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 0.95 });
  });
}

// ============ 图形渲染器 D ============
const D = {};
D._placeholder = (slide, R, s) => {
  slide.addText("[" + s.diagram + "]", { x: R.x, y: R.y, w: R.w, h: R.h, align: "center", valign: "middle", color: C.faint, fontSize: 14 });
};

// 1.1 学习路径流程条 + 5 目标
D.pathAndGoals = (slide, R) => {
  L.flowChain(slide, pres, [
    { title: "概念" }, { title: "硬件" }, { title: "参数" }, { title: "原理·准则" }, { title: "风险·可比" },
  ], { x: R.x + 0.1, y: R.y + 0.1, w: R.w - 0.2, h: 0.62, highlightIdx: 0 });
  const goals = [
    ["①", "微环境一致"], ["②", "三类反应器"], ["③", "关键参数 CPP"], ["④", "原理与准则"], ["⑤", "风险与可比性"],
  ];
  const gw = (R.w - 0.2) / 5;
  goals.forEach((g, i) => {
    const gx = R.x + 0.1 + i * gw;
    badge(slide, gx + gw / 2 - 0.24, R.y + 1.05, 0.48, g[0], C.teal);
    slide.addText(g[1], { x: gx, y: R.y + 1.6, w: gw, h: 0.7, fontFace: FONT_B, fontSize: 9, color: C.body, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 0.95 });
  });
};

// 1.2 上游全流程流水线(容器渐增)
D.upstreamLine = (slide, R) => {
  const steps = [
    ["冻存管", "复苏", 0.5], ["摇瓶", "数百 mL", 0.62], ["种子罐 N-2", "200L", 0.78], ["种子罐 N-1", "500L", 0.95], ["生产罐 N", "2000L", 1.0], ["收获", "Harvest", 0.7],
  ];
  const n = steps.length, gap = 0.5;
  const cw = (R.w - gap * (n - 1)) / n;
  const baseY = R.y + R.h - 0.5;
  // 上游/下游分区色带
  slide.addShape(RECT, { x: R.x, y: R.y + 0.05, w: cw * 5 + gap * 4.5, h: 0.34, fill: { color: C.mintTint }, line: { type: "none" } });
  slide.addText("上游 Upstream(养细胞 · 表达产物)", { x: R.x + 0.1, y: R.y + 0.05, w: cw * 5, h: 0.34, fontFace: FONT_B, fontSize: 10, bold: true, color: C.teal, align: "left", valign: "middle", margin: 0 });
  slide.addShape(RECT, { x: R.x + cw * 5 + gap * 4.5, y: R.y + 0.05, w: cw + gap * 0.5, h: 0.34, fill: { color: "EFEFEF" }, line: { type: "none" } });
  slide.addText("下游(不展开)", { x: R.x + cw * 5 + gap * 4.5, y: R.y + 0.05, w: cw + gap * 0.5, h: 0.34, fontFace: FONT_B, fontSize: 9, color: C.muted, align: "center", valign: "middle", margin: 0 });
  steps.forEach((st, i) => {
    const cx = R.x + i * (cw + gap);
    const vh = 0.5 + st[2] * 1.5; // 容器高度随规模增大
    const vw = Math.min(cw, 0.5 + st[2] * 0.7);
    const vx = cx + (cw - vw) / 2;
    const isProd = i === 4;
    if (i === 0) {
      slide.addShape(RR, { x: vx, y: baseY - vh, w: vw, h: vh, fill: { color: C.mintTint2 }, line: { color: C.teal, width: 1.3 }, rectRadius: 0.05 });
    } else if (i === 5) {
      slide.addShape(OVAL, { x: vx, y: baseY - vh, w: vw, h: vh * 0.7, fill: { color: "EFEFEF" }, line: { color: C.muted, width: 1.3 } });
    } else {
      reactor(slide, vx, baseY - vh, vw, vh, { liq: 0.6, sparger: i >= 2, impeller: i >= 2 });
    }
    if (isProd) slide.addShape(RR, { x: vx - 0.06, y: baseY - vh - 0.06, w: vw + 0.12, h: vh + 0.12, fill: { type: "none" }, line: { color: C.amber, width: 2, dashType: "dash" }, rectRadius: 0.06 });
    slide.addText([{ text: st[0], options: { bold: true, fontSize: 9.5, color: C.ink, breakLine: true } }, { text: st[1], options: { fontSize: 8.5, color: C.muted } }], { x: cx, y: baseY + 0.04, w: cw, h: 0.42, fontFace: FONT_B, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 0.92 });
    if (i < n - 1) arrowR(slide, cx + cw + 0.06, baseY - 0.35, gap - 0.12, C.seafoam);
  });
  // 放大标注带
  slide.addText("放大 Scale-up ·  ×5~10 / 级  ·  保持的是细胞看到的微环境,不是罐子等比变大", { x: R.x, y: baseY + 0.5, w: R.w, h: 0.34, fontFace: FONT_B, fontSize: 10, bold: true, color: C.white, align: "center", valign: "middle", fill: { color: C.teal }, margin: 0 });
};

// 2.1 三级阶梯
D.threeTierStairs = (slide, R) => {
  const tiers = [
    ["实验室 / 小试", "mL ~ L", "克隆筛选 · 早期开发", 0.55],
    ["中试 Pilot", "10 ~ 200 L", "工艺确认 · 放大验证", 0.78],
    ["商业化", "1000 ~ 5000 L+", "GMP 量产供货", 1.0],
  ];
  const baseY = R.y + R.h - 0.2, bw = (R.w - 0.7) / 3;
  tiers.forEach((t, i) => {
    const bx = R.x + i * (bw + 0.35);
    const bh = 1.0 + t[3] * 1.4;
    slide.addShape(RR, { x: bx, y: baseY - bh, w: bw, h: bh, fill: { color: i === 2 ? C.teal : C.mintTint }, line: { color: i === 2 ? C.teal : C.border, width: 1.2 }, rectRadius: 0.06, shadow: i === 2 ? sh() : undefined });
    const tc = i === 2 ? C.white : C.ink, sc = i === 2 ? "D8F2EA" : C.muted, vc = i === 2 ? "EAFBF5" : C.teal;
    slide.addText([
      { text: t[0], options: { bold: true, fontSize: 12, color: tc, breakLine: true } },
      { text: t[1], options: { bold: true, fontSize: 14, color: vc, breakLine: true } },
      { text: t[2], options: { fontSize: 9, color: sc } },
    ], { x: bx + 0.1, y: baseY - bh + 0.12, w: bw - 0.2, h: bh - 0.2, fontFace: FONT_B, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.05 });
    if (i < 2) arrowR(slide, bx + bw + 0.04, baseY - bh * 0.5, 0.28, C.seafoam);
    if (i < 2) slide.addText("×5~10", { x: bx + bw - 0.1, y: baseY - bh * 0.5 - 0.32, w: 0.55, h: 0.22, fontFace: FONT_B, fontSize: 7.5, color: C.seafoam, align: "center", margin: 0 });
  });
  slide.addText("目标不变:细胞看到的微环境一致 → 产品可比", { x: R.x, y: R.y - 0.02, w: R.w, h: 0.3, fontFace: FONT_B, fontSize: 9.5, bold: true, color: C.teal, align: "center", valign: "middle", margin: 0 });
};

// 2.2 r³ vs r² 曲线
D.r3r2 = (slide, R) => {
  slide.addText("体积 V∝r³ 涨得快,表面积 A∝r² 跟不上 → 比表面积 A/V∝1/r 下降", { x: R.x, y: R.y, w: R.w, h: 0.32, fontFace: FONT_B, fontSize: 9.5, bold: true, color: C.teal, align: "center", valign: "middle", margin: 0 });
  const rs = [1, 2, 3, 4, 5];
  slide.addChart(pres.charts.LINE, [
    { name: "体积 V ∝ r³", labels: rs.map(String), values: rs.map((r) => r ** 3) },
    { name: "表面积 A ∝ r²", labels: rs.map(String), values: rs.map((r) => r ** 2) },
  ], {
    x: R.x + 0.1, y: R.y + 0.36, w: R.w - 0.2, h: R.h - 0.46,
    chartColors: ["0E7C6B", "D98A1E"], lineSize: 3, lineSmooth: true,
    showLegend: true, legendPos: "b", legendFontSize: 8, legendColor: C.muted,
    catAxisLabelColor: "8AA39C", valAxisLabelColor: "8AA39C", catAxisLabelFontSize: 8, valAxisLabelFontSize: 8,
    catAxisTitle: "半径 r(相对)", showCatAxisTitle: true, catAxisTitleColor: "8AA39C", catAxisTitleFontSize: 8,
    valGridLine: { color: "E2EFEB", size: 0.5 }, catGridLine: { style: "none" },
    chartArea: { fill: { color: "FFFFFF" } },
  });
};

// 3.1 三类反应器
D.threeReactors = (slide, R) => {
  const items = [
    ["WAVE 摇摆式", "1 ~ 25 L", "摇摆混合 · 无桨叶 · 温和\n种子扩增前段", "wave"],
    ["SUB 一次性", "50 ~ 2000 L", "一次性袋体 · 免清洗\n换型快 · CMO 主流", "sub"],
    ["STR 不锈钢", "1000 ~ 20000+ L", "可重复 · 需 CIP/SIP\n大规模生产", "str"],
  ];
  const bw = (R.w - 1.0) / 3;
  items.forEach((it, i) => {
    const bx = R.x + i * (bw + 0.5);
    slide.addShape(RR, { x: bx, y: R.y, w: bw, h: R.h - 0.5, fill: { color: C.white }, line: { color: C.border, width: 1 }, rectRadius: 0.07, shadow: shSoft() });
    slide.addShape(RECT, { x: bx, y: R.y, w: bw, h: 0.09, fill: { color: C.teal }, line: { type: "none" } });
    slide.addText([{ text: it[0], options: { bold: true, fontSize: 13, color: C.teal, breakLine: true } }, { text: it[1], options: { bold: true, fontSize: 11, color: C.seafoam } }], { x: bx, y: R.y + 0.16, w: bw, h: 0.6, fontFace: FONT_H, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 1.0 });
    // 简图
    const gx = bx + bw / 2 - 0.55, gy = R.y + 0.95, gw = 1.1, gh = 1.4;
    if (it[3] === "wave") {
      slide.addShape(RECT, { x: gx, y: gy + gh - 0.3, w: gw, h: 0.18, fill: { color: C.muted }, line: { type: "none" } });
      slide.addShape(RR, { x: gx + 0.1, y: gy + 0.4, w: gw - 0.2, h: gh - 0.85, fill: { color: "CDEBE2" }, line: { color: C.teal, width: 1.3 }, rectRadius: 0.06 });
      slide.addShape(LINE, { x: gx, y: gy + gh - 0.05, w: gw, h: 0, line: { color: C.seafoam, width: 2, dashType: "dash" } });
    } else if (it[3] === "sub") {
      slide.addShape(RECT, { x: gx + 0.1, y: gy, w: gw - 0.2, h: gh - 0.2, fill: { color: "EFEFEF" }, line: { color: C.muted, width: 1.3 } });
      slide.addShape(RR, { x: gx + 0.22, y: gy + 0.12, w: gw - 0.44, h: gh - 0.42, fill: { color: "CDEBE2" }, line: { color: C.teal, width: 1.2, dashType: "dash" }, rectRadius: 0.05 });
    } else {
      reactor(slide, gx, gy, gw, gh, { liq: 0.62 });
    }
    slide.addText(it[2], { x: bx + 0.12, y: R.y + R.h - 1.05, w: bw - 0.24, h: 0.5, fontFace: FONT_B, fontSize: 9, color: C.body, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 0.98 });
  });
  // 底部标尺
  slide.addText("种子链方向:小 ──────────────→ 大", { x: R.x, y: R.y + R.h - 0.4, w: R.w, h: 0.32, fontFace: FONT_B, fontSize: 10, bold: true, color: C.seafoam, align: "center", valign: "middle", margin: 0 });
};

// 3.2 STR 剖面 + 选型表
D.strSelect = (slide, R) => {
  // 左:剖面
  reactor(slide, R.x + 0.5, R.y + 0.2, 1.7, R.h - 0.5, { liq: 0.62 });
  const annot = [
    ["① 搅拌系统(桨叶)", R.y + 0.65],
    ["② 通气 sparger", R.y + R.h - 1.05],
    ["③ 换热夹套", R.y + 1.3],
    ["④ 检测探头 T/pH/DO", R.y + 0.95],
  ];
  // 公式
  slide.addText("tip speed = π·N·D", { x: R.x, y: R.y + R.h - 0.4, w: 2.7, h: 0.3, fontFace: FONT_B, fontSize: 10, bold: true, color: C.teal, align: "center", margin: 0 });
  slide.addText("四件套:①搅拌 ②通气 ③换热 ④探头", { x: R.x, y: R.y - 0.05, w: 2.7, h: 0.3, fontFace: FONT_B, fontSize: 9.5, bold: true, color: C.ink, align: "center", margin: 0 });
  // 右:对比表
  L.compareTable(slide, pres, ["对比项", "STR 不锈钢", "SUB 一次性"], [
    ["规模上限", "高(可做很大)", "约 2000 L / 单袋"],
    ["换型速度", "慢(需清洗验证)", { text: "快(换袋即可)", bold: true, color: C.teal }],
    ["清洗灭菌", "每批 CIP / SIP", "免清洗免灭菌"],
    ["交叉污染", "共线需严格验证", { text: "批间几乎为零", bold: true, color: C.teal }],
    ["适用场景", "单产品 · 大体量", "多产品 · 勤换型"],
  ], { x: R.x + 3.0, y: R.y, w: R.w - 3.0, colW: [1.9, (R.w - 3.0 - 1.9) / 2, (R.w - 3.0 - 1.9) / 2], fontSize: 9.5, headSize: 10 });
};

// 4.1 六大参数表 + 罐
D.cppOverview = (slide, R) => {
  L.compareTable(slide, pres, ["参数", "典型范围", "控什么", "怎么调"], [
    ["温度", "36~37℃(产期降 30~33)", "代谢速率 / 产期", "夹套循环水"],
    ["pH", "6.8~7.2", "酶活 / 代谢环境", "CO₂↓ 与碱液↑ 双向"],
    ["溶氧 DO", "30~50% 空气饱和", "细胞呼吸供氧", "搅拌 rpm + 通气 vvm"],
    ["搅拌+通气", "过程参数", "供氧 vs 剪切平衡", "调 rpm 与 vvm"],
    ["补料", "fed-batch / perfusion", "营养供给节奏", "按曲线补浓缩料"],
    ["CO₂", "< 100~150 mmHg", "代谢副产物排出", "通气吹脱 stripping"],
  ], { x: R.x, y: R.y, w: 9.2, colW: [1.5, 2.7, 2.6, 2.4], fontSize: 9.3, headSize: 10, rowH: 0.46 });
  // 右:罐示意 + 旁注
  reactor(slide, R.x + 9.9, R.y + 0.2, 1.6, R.h - 0.4, { liq: 0.6 });
  slide.addText("所有参数都发生在同一个罐里、彼此联动", { x: R.x + 9.5, y: R.y + R.h - 0.32, w: 2.5, h: 0.3, fontFace: FONT_B, fontSize: 8.5, color: C.muted, align: "center", margin: 0 });
};

// 4.2 供氧-剪切跷跷板 + 传导链
D.balanceChain = (slide, R) => {
  // 跷跷板:两个盘
  slide.addText("供氧充足 (DO 达标)", { shape: RR, x: R.x + 0.1, y: R.y + 0.15, w: 2.6, h: 0.6, fill: { color: C.mintTint }, line: { color: C.teal, width: 1 }, rectRadius: 0.06, fontFace: FONT_B, fontSize: 10, bold: true, color: C.teal, align: "center", valign: "middle", margin: 0 });
  slide.addText("剪切过大 (细胞受损)", { shape: RR, x: R.x + R.w - 2.7, y: R.y + 0.15, w: 2.6, h: 0.6, fill: { color: C.redTint }, line: { color: C.red, width: 1 }, rectRadius: 0.06, fontFace: FONT_B, fontSize: 10, bold: true, color: C.red, align: "center", valign: "middle", margin: 0 });
  // 横梁(连接两盘)+ 支点
  slide.addShape(RECT, { x: R.x + 1.1, y: R.y + 0.8, w: R.w - 2.2, h: 0.07, fill: { color: C.seafoam }, line: { type: "none" } });
  slide.addShape(TRI, { x: R.x + R.w / 2 - 0.22, y: R.y + 0.86, w: 0.44, h: 0.34, fill: { color: C.teal }, line: { type: "none" } });
  slide.addText("放大时要重新平衡:tip speed = π·N·D   |   OTR = kLa·(C*−C_L)", { x: R.x, y: R.y + 1.28, w: R.w, h: 0.3, fontFace: FONT_B, fontSize: 9.5, bold: true, color: C.ink, align: "center", valign: "middle", margin: 0 });
  // 传导链
  L.flowChain(slide, pres, [
    { title: "CPP 波动", sub: "温度/pH/DO/CO₂" }, { title: "代谢改变", sub: "微环境漂移" }, { title: "CQA 变化", sub: "糖基化/聚体" }, { title: "产品质量", sub: "→ 第9章 QbD" },
  ], { x: R.x + 0.05, y: R.y + 1.7, w: R.w - 0.1, h: 0.95 });
};

// 5.1 几何相似:两罐
D.geomSimilar = (slide, R) => {
  reactor(slide, R.x + 0.6, R.y + 1.4, 1.2, 1.7, { liq: 0.62 });
  reactor(slide, R.x + 2.9, R.y + 0.3, 2.0, 2.8, { liq: 0.62 });
  slide.addText("200 L", { x: R.x + 0.4, y: R.y + 3.15, w: 1.6, h: 0.3, fontFace: FONT_B, fontSize: 10, bold: true, color: C.teal, align: "center", margin: 0 });
  slide.addText("2000 L", { x: R.x + 2.9, y: R.y + 3.15, w: 2.0, h: 0.3, fontFace: FONT_B, fontSize: 10, bold: true, color: C.teal, align: "center", margin: 0 });
  arrowR(slide, R.x + 1.95, R.y + 1.7, 0.7, C.seafoam);
  slide.addText([
    { text: "保持几何相似:", options: { bold: true, color: C.ink, breakLine: true, fontSize: 10 } },
    { text: "H/D ≈ 1.5~2,Di/T ≈ 0.3~0.5", options: { color: C.body, breakLine: true, fontSize: 9.5 } },
    { text: "体积 V ∝ D³,表面积 A ∝ D²", options: { color: C.body, breakLine: true, fontSize: 9.5 } },
    { text: "线性×2 → 体积×8、面积×4", options: { color: C.body, breakLine: true, fontSize: 9.5 } },
    { text: "→ 比表面积 A/V ÷2(换热/传质天然变差)", options: { bold: true, color: C.red, fontSize: 9.5 } },
  ], { x: R.x + 5.1, y: R.y + 0.5, w: R.w - 5.2, h: R.h - 0.8, fontFace: FONT_B, align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 1.25 });
};

// 5.2 四个工程量卡片
D.fourQuantities = (slide, R) => {
  L.cardGrid(slide, pres, [
    { badge: "P/V", title: "单位体积功率", lines: [{ text: "P/V = Np·ρ·N³·Di⁵ / V", color: C.teal }, "控:混合/剪切/气泡破碎", "CHO 10~50 W/m³"] },
    { badge: "kLa", title: "氧传质系数", lines: [{ text: "OTR = kLa·(C*−C_L)", color: C.teal }, "控:供氧能力(1/h)", "大罐 kLa 难做高"] },
    { badge: "Vt", title: "桨叶端速 tip speed", lines: [{ text: "tip speed = π·N·Di", color: C.teal }, "控:局部最大剪切", "CHO < 2 m/s"] },
    { badge: "tm", title: "混合时间", lines: ["把整罐拌匀所需时间", "罐越大混合越慢", "几秒 → 几十秒"] },
  ], { x: R.x + 0.05, y: R.y, w: R.w - 0.1, h: R.h, cols: 2, rowGap: 0.18, colGap: 0.22 });
};

// 5.3 不可能三角 + 表
D.impossibleTriangle = (slide, R) => {
  const cx = R.x + 1.4, cy = R.y + 0.45;
  slide.addShape(TRI, { x: cx, y: cy, w: 2.7, h: 2.1, fill: { color: C.mintTint }, line: { color: C.seafoam, width: 1.5 } });
  slide.addText("无法\n同时守恒", { x: cx + 0.6, y: cy + 1.05, w: 1.5, h: 0.7, fontFace: FONT_H, fontSize: 12, bold: true, color: C.teal, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 0.9 });
  slide.addText("P/V", { x: cx + 0.75, y: cy - 0.3, w: 1.2, h: 0.25, fontFace: FONT_B, fontSize: 11, bold: true, color: C.ink, align: "center", margin: 0 });
  slide.addText("tip speed", { x: cx - 0.65, y: cy + 2.12, w: 1.5, h: 0.25, fontFace: FONT_B, fontSize: 11, bold: true, color: C.ink, align: "center", margin: 0 });
  slide.addText("混合 / kLa", { x: cx + 1.85, y: cy + 2.12, w: 1.6, h: 0.25, fontFace: FONT_B, fontSize: 11, bold: true, color: C.ink, align: "center", margin: 0 });
  // 表
  L.compareTable(slide, pres, ["放大准则", "转速 N", "被牺牲的量"], [
    ["保 P/V 恒定", "↓ 下降", { text: "混合时间变长", color: C.red }],
    ["保 tip speed 恒定", "↓ 更多", { text: "P/V 与 kLa 下降", color: C.red }],
    ["保混合时间", "↑ 上升", { text: "剪切过高伤细胞", color: C.red }],
  ], { x: R.x + 5.3, y: R.y + 0.55, w: R.w - 5.3, colW: [2.2, 1.4, R.w - 5.3 - 3.6], fontSize: 11, headSize: 11, rowH: 0.62 });
};

// 6.1 三准则
D.threeCriteria = (slide, R) => {
  L.cardGrid(slide, pres, [
    { title: "恒定 kLa", accent: C.seafoam, lines: [{ text: "保供氧", bold: true, color: C.teal }, "适合高密度 / 氧受限培养", { text: "↑ 剪切 / 泡沫风险", color: C.red }] },
    { title: "恒定 P/V(工业最常用)", accent: C.teal, lines: [{ text: "保单位体积搅拌能量", bold: true, color: C.teal }, "稳妥折中,通用首选", { text: "~ kLa 略降、剪切略升", color: C.amber }] },
    { title: "恒定 tip speed", accent: C.mint, lines: [{ text: "保剪切上限", bold: true, color: C.teal }, "适合剪切敏感细胞", { text: "↓ 混合 / 供氧变弱", color: C.red }] },
  ], { x: R.x, y: R.y, w: R.w, h: R.h - 0.45, cols: 3, colGap: 0.3 });
  slide.addText("放大方向 →(体积变大,以上趋势随之发生);没有『全都保住』的准则,按限制性因素选要保的那一个", { x: R.x, y: R.y + R.h - 0.38, w: R.w, h: 0.32, fontFace: FONT_B, fontSize: 9.5, bold: true, color: C.seafoam, align: "center", valign: "middle", margin: 0 });
};

// 6.2 准则对比表
D.criteriaTable = (slide, R) => {
  L.compareTable(slide, pres, ["准则", "保持的量", "随放大的趋势(其它量怎么变)", "适用场景 / 主要风险"], [
    ["恒定 kLa", "氧传质 kLa", "P/V 上升、剪切上升", "高密度 / 氧受限培养;风险=搅拌过强、泡沫多"],
    [{ text: "恒定 P/V", bold: true, color: C.teal, fill: "DCF0EA" }, { text: "单位体积功率", fill: "DCF0EA" }, { text: "kLa 略降、剪切略升", fill: "DCF0EA" }, { text: "大多数通用场景,稳妥折中(工业最常用)", fill: "DCF0EA", bold: true }],
    ["恒定 tip speed", "桨叶端速(剪切)", "相对搅拌变弱、混合/kLa 下降", "剪切敏感细胞 / 载体;风险=DO 分层、营养死区"],
  ], { x: R.x, y: R.y, w: R.w, colW: [2.0, 2.0, 3.6, R.w - 7.6], fontSize: 10.5, headSize: 11, rowH: 0.74 });
  slide.addText("先做限制性因素分析(卡供氧?卡混合?卡剪切?),再选准则;准则只给第一版参数,仍需 scale-down 验证 + PAT 微调", { x: R.x, y: R.y + 3.12, w: R.w, h: 0.34, fontFace: FONT_B, fontSize: 10, bold: true, color: C.teal, align: "center", valign: "middle", fill: { color: C.mintTint }, margin: 0 });
};

// 6.3 放大算例
D.scaleCalc = (slide, R) => {
  const t = extras.scaleCalc.table;
  slide.addText("前提:V₂/V₁ = 2000/50 = 40,Di₂/Di₁ = 40^(1/3) ≈ 3.42  →  体积放大 40 倍,直径只放大约 3.42 倍", { x: R.x, y: R.y, w: 7.3, h: 0.32, fontFace: FONT_B, fontSize: 9.5, bold: true, color: C.teal, align: "left", valign: "middle", fill: { color: C.mintTint }, margin: 2 });
  L.compareTable(slide, pres, t.header, t.rows.map((r, i) => i === 0 ? r.map((c) => ({ text: c, fill: "DCF0EA", bold: false })) : r), { x: R.x, y: R.y + 0.44, w: 7.3, colW: [2.1, 3.0, 1.0, 1.2], fontSize: 9, headSize: 9.5, rowH: 0.6 });
  // 条形图
  const c = extras.scaleCalc.chart;
  slide.addChart(pres.charts.BAR, c.series.map((s) => ({ name: s.name, labels: c.labels, values: s.values })), {
    x: R.x + 7.6, y: R.y, w: R.w - 7.6, h: R.h, barDir: "col",
    chartColors: ["0E7C6B", "D98A1E"], showLegend: true, legendPos: "b", legendFontSize: 8, legendColor: C.muted,
    showValue: true, dataLabelFontSize: 8, dataLabelColor: "1E293B", dataLabelPosition: "outEnd", dataLabelFormatCode: "0.00",
    catAxisLabelColor: "5E716C", valAxisLabelColor: "8AA39C", catAxisLabelFontSize: 8, valAxisLabelFontSize: 7,
    valGridLine: { color: "E2EFEB", size: 0.5 }, catGridLine: { style: "none" }, chartArea: { fill: { color: "FFFFFF" } },
    title: "两方案相对量对比", showTitle: true, titleFontSize: 9, titleColor: C.muted,
  });
};

// 7.1 种子链
D.seedTrain = (slide, R) => {
  // 液氮罐
  slide.addText("WCB\n解冻", { shape: RR, x: R.x, y: R.y + R.h / 2 - 0.5, w: 0.95, h: 1.0, fill: { color: C.tealDk }, line: { type: "none" }, rectRadius: 0.08, fontFace: FONT_B, fontSize: 10, bold: true, color: C.white, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 0.92 });
  const steps = [["摇瓶", "mL", 0.5], ["WAVE 摇袋", "几~几十 L", 0.7], ["小 STR/SUB", "几百 L", 0.85], ["大 SUB", "~1000 L", 0.95], ["生产罐 N", "≥2000 L", 1.0]];
  const x0 = R.x + 1.2, n = steps.length, gap = 0.45;
  const cw = (R.w - 1.2 - gap * n) / n;
  const baseY = R.y + R.h - 0.7;
  arrowR(slide, R.x + 0.98, baseY - 0.4, 0.2, C.seafoam);
  steps.forEach((st, i) => {
    const cx = x0 + i * (cw + gap);
    const vh = 0.7 + st[2] * 1.5, vw = Math.min(cw, 0.55 + st[2] * 0.6), vx = cx + (cw - vw) / 2;
    reactor(slide, vx, baseY - vh, vw, vh, { liq: 0.6, sparger: i >= 1, impeller: i >= 2 });
    if (i === 4) slide.addShape(RR, { x: vx - 0.05, y: baseY - vh - 0.05, w: vw + 0.1, h: vh + 0.1, fill: { type: "none" }, line: { color: C.teal, width: 2 }, rectRadius: 0.05 });
    slide.addText([{ text: st[0], options: { bold: true, fontSize: 9, color: C.ink, breakLine: true } }, { text: st[1], options: { fontSize: 8, color: C.muted } }], { x: cx - 0.1, y: baseY + 0.04, w: cw + 0.2, h: 0.4, fontFace: FONT_B, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 0.9 });
    if (i < n - 1) arrowR(slide, cx + cw + 0.08, baseY - 0.4, gap - 0.16, C.seafoam);
  });
  slide.addText("接种 / 传代方向 →   每级体积放大 4~10 倍   ·   总历时约 2~4 周(常 4~6 级)", { x: R.x, y: R.y + R.h - 0.32, w: R.w, h: 0.3, fontFace: FONT_B, fontSize: 9.5, bold: true, color: C.seafoam, align: "center", valign: "middle", margin: 0 });
};

// 7.2 N-x 命名 + 策略对比
D.nMinusX = (slide, R) => {
  // 倒推命名
  const tanks = [["N-3", 0.45], ["N-2", 0.6], ["N-1", 0.8], ["N", 1.0]];
  const x0 = R.x + 0.2; let cx = x0;
  const baseY = R.y + 1.5;
  tanks.forEach((t, i) => {
    const vw = 0.55 + t[1] * 0.55, vh = 0.7 + t[1] * 0.7;
    reactor(slide, cx, baseY - vh, vw, vh, { liq: 0.6, impeller: false, sparger: false });
    slide.addText(t[0], { x: cx - 0.1, y: baseY + 0.05, w: vw + 0.2, h: 0.28, fontFace: FONT_H, fontSize: 11, bold: true, color: i === 3 ? C.teal : C.ink, align: "center", margin: 0 });
    if (i < 3) { slide.addText("←", { x: cx + vw, y: baseY - 0.7, w: 0.5, h: 0.3, fontFace: FONT_B, fontSize: 13, color: C.seafoam, align: "center", margin: 0 }); }
    cx += vw + 0.55;
  });
  slide.addText("以终为始:先定生产罐 N,再倒推每一级(数字越大越上游、罐越小)", { x: R.x, y: R.y + 1.85, w: 5.6, h: 0.4, fontFace: FONT_B, fontSize: 9, color: C.muted, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 0.95 });
  // 策略对比表
  L.compareTable(slide, pres, ["维度", "常规种子链", "高接种密度(N-1 灌流)"], [
    ["N-1 模式", "分批补料", "灌流 perfusion"],
    ["接种 VCD(×10⁶)", "0.3 ~ 0.6", { text: "5 ~ 20", bold: true, color: C.teal }],
    ["生产罐爬坡", "长", { text: "短(省 2~4 天)", bold: true, color: C.teal }],
    ["操作复杂度", "低", "高"],
  ], { x: R.x + 6.0, y: R.y, w: R.w - 6.0, colW: [1.8, 2.0, (R.w - 6.0 - 3.8)], fontSize: 9.5, headSize: 9.5, rowH: 0.55 });
};

// 8.1 风险地图(反应器剖面)
D.riskMap = (slide, R) => {
  reactor(slide, R.x + 0.3, R.y + 0.15, 2.0, R.h - 0.3, { liq: 0.7 });
  const risks = [
    ["气泡破裂 → 剪切损伤", R.y + 0.25, C.red],
    ["高叶尖速度 → 剪切", R.y + 1.35, C.red],
    ["pH / DO / 营养梯度", R.y + 2.05, C.amber],
    ["罐底 CO₂ 累积 · 静压大", R.y + 2.9, C.red],
  ];
  risks.forEach((rk, i) => {
    slide.addText("● " + rk[0], { x: R.x + 2.5, y: rk[1], w: R.w - 2.6, h: 0.34, fontFace: FONT_B, fontSize: 10, color: rk[2], bold: true, align: "left", valign: "middle", margin: 0 });
  });
  slide.addText("罐体放大 → 单位体积换气/混合能力下降 → 梯度、剪切、CO₂ 同时找上门", { x: R.x + 2.5, y: R.y + R.h - 0.46, w: R.w - 2.6, h: 0.4, fontFace: FONT_B, fontSize: 9.5, bold: true, color: C.teal, align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 0.98 });
};

// 8.2 泡沫/传质 表 + 曲线
D.foamMassTransfer = (slide, R) => {
  L.compareTable(slide, pres, ["问题", "现象 / 原因", "现场应对"], [
    ["泡沫", "高通气+蛋白起泡,顶到排气过滤器", "按需分次加消泡剂,监控液位与排气压差"],
    ["传质受限", "高密度耗氧大、kLa 不足,DO 掉下限", "提高搅拌/通气、纯氧补气、控密度峰值"],
    ["scale 依赖", "小罐表现无法直接外推到大罐", "用 scale-down 模型预测,分级验证"],
  ], { x: R.x, y: R.y, w: 7.0, colW: [1.4, 3.0, 2.6], fontSize: 9.3, headSize: 10, rowH: 0.62 });
  // 曲线:kLa↓ vs OUR
  slide.addChart(pres.charts.LINE, [
    { name: "供氧能力 kLa", labels: ["2L", "20L", "200L", "2000L"], values: [100, 80, 60, 42] },
    { name: "细胞耗氧 OUR", labels: ["2L", "20L", "200L", "2000L"], values: [40, 45, 50, 58] },
  ], {
    x: R.x + 7.4, y: R.y, w: R.w - 7.4, h: R.h, chartColors: ["0E7C6B", "C0392B"], lineSize: 3, lineSmooth: true,
    showLegend: true, legendPos: "b", legendFontSize: 8, legendColor: C.muted,
    catAxisLabelColor: "5E716C", valAxisLabelColor: "8AA39C", catAxisLabelFontSize: 8, valAxisLabelFontSize: 7,
    valGridLine: { color: "E2EFEB", size: 0.5 }, catGridLine: { style: "none" }, chartArea: { fill: { color: "FFFFFF" } },
    title: "随体积放大:供氧↓ 而需求↑ → 供氧风险区", showTitle: true, titleFontSize: 8.5, titleColor: C.muted,
  });
};

// 8.3 排障速查表
D.troubleshoot = (slide, R) => {
  const t = extras.troubleshoot.table;
  slide.addText("铁律:先查受控文件 · 先按串级与 SOP · 不凭记忆乱调", { x: R.x, y: R.y - 0.02, w: R.w, h: 0.32, fontFace: FONT_B, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", fill: { color: C.red }, margin: 0 });
  const rows = t.rows.map((r, i) => r.map((c, j) => {
    const warn = t.warnRows.includes(i);
    return { text: c, color: warn ? C.red : (j === 0 ? C.ink : C.body), bold: j === 0, fill: warn ? "F8E4E1" : (i % 2 ? C.mintTint2 : C.white) };
  }));
  L.compareTable(slide, pres, t.header, rows, { x: R.x, y: R.y + 0.42, w: R.w, colW: [2.7, 4.4, R.w - 7.1], fontSize: 8.7, headSize: 10, rowH: 0.5 });
};

// 9.1 在线/离线 监测
D.monitoring = (slide, R) => {
  const colW = (R.w - 0.4) / 2;
  // 左:在线
  slide.addText("在线监测(in-line)实时", { shape: RECT, x: R.x, y: R.y, w: colW, h: 0.4, fill: { color: C.teal }, color: C.white, bold: true, fontFace: FONT_H, fontSize: 11, align: "center", valign: "middle", margin: 0 });
  reactor(slide, R.x + 0.4, R.y + 0.6, 1.4, 1.9, { liq: 0.6 });
  slide.addText([{ text: "探头:", options: { bold: true, color: C.ink, breakLine: true, fontSize: 10 } }, { text: "DO 溶氧 · pH · 温度 · 压力", options: { color: C.body, breakLine: true, fontSize: 10 } }, { text: "→ 实时数据 / 趋势曲线", options: { color: C.seafoam, fontSize: 10 } }], { x: R.x + 2.0, y: R.y + 0.9, w: colW - 2.1, h: 1.4, fontFace: FONT_B, align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 1.2 });
  // 右:离线
  slide.addText("离线监测(off-line)取样化验", { shape: RECT, x: R.x + colW + 0.4, y: R.y, w: colW, h: 0.4, fill: { color: C.seafoam }, color: C.white, bold: true, fontFace: FONT_H, fontSize: 11, align: "center", valign: "middle", margin: 0 });
  L.flowChain(slide, pres, [{ title: "取样口" }, { title: "试管" }, { title: "化验室" }], { x: R.x + colW + 0.5, y: R.y + 0.6, w: colW - 0.2, h: 0.55, accent: C.seafoam });
  slide.addText("检测项:细胞密度 VCD · 活率 · 葡萄糖/乳酸/铵 · 渗透压 · 效价 titer", { x: R.x + colW + 0.5, y: R.y + 1.35, w: colW - 0.2, h: 0.8, fontFace: FONT_B, fontSize: 9.5, color: C.body, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.05 });
  // 底部控制带
  const by = R.y + 2.7, bw = R.w;
  slide.addShape(RECT, { x: R.x, y: by, w: bw * 0.5, h: 0.5, fill: { color: "CDEBE2" }, line: { type: "none" } });
  slide.addShape(RECT, { x: R.x + bw * 0.5, y: by, w: bw * 0.28, h: 0.5, fill: { color: C.amberTint }, line: { type: "none" } });
  slide.addShape(RECT, { x: R.x + bw * 0.78, y: by, w: bw * 0.22, h: 0.5, fill: { color: C.redTint }, line: { type: "none" } });
  slide.addText("控制带(setpoint 居中)", { x: R.x, y: by, w: bw * 0.5, h: 0.5, fontFace: FONT_B, fontSize: 9, bold: true, color: C.teal, align: "center", valign: "middle", margin: 0 });
  slide.addText("提醒限 warning", { x: R.x + bw * 0.5, y: by, w: bw * 0.28, h: 0.5, fontFace: FONT_B, fontSize: 9, color: C.amber, align: "center", valign: "middle", margin: 0 });
  slide.addText("动作限 action", { x: R.x + bw * 0.78, y: by, w: bw * 0.22, h: 0.5, fontFace: FONT_B, fontSize: 9, color: C.red, align: "center", valign: "middle", margin: 0 });
  slide.addText("PID 闭环:测量 → 比较 setpoint → 执行器(加热/补碱/调转速通气)", { x: R.x, y: by + 0.55, w: bw, h: 0.3, fontFace: FONT_B, fontSize: 9, italic: true, color: C.muted, align: "center", margin: 0 });
};

// 9.2 DO 串级
D.cascade = (slide, R) => {
  slide.addText("OTR = kLa·(C*−C_L)   |   目标:DO 稳在 40%", { x: R.x, y: R.y, w: R.w, h: 0.32, fontFace: FONT_B, fontSize: 10.5, bold: true, color: C.teal, align: "center", valign: "middle", margin: 0 });
  const stages = [
    ["① 搅拌转速 ↑", "剪切风险", C.mintTint],
    ["② 空气通气 ↑", "泡沫风险", C.mint],
    ["③ 纯氧掺入", "成本 & 安全", C.seafoam],
    ["④ 罐压 ↑", "设备上限", C.teal],
  ];
  const bw = (R.w - 0.6 - 0.34 * 3) / 4, y = R.y + 0.6;
  stages.forEach((st, i) => {
    const bx = R.x + 0.3 + i * (bw + 0.34);
    slide.addText([{ text: st[0], options: { bold: true, fontSize: 12, color: i >= 2 ? C.white : C.ink, breakLine: true } }, { text: "代价:" + st[1], options: { fontSize: 9, color: i >= 2 ? "D8F2EA" : C.muted } }], { shape: RR, x: bx, y, w: bw, h: 1.0, fill: { color: st[2] }, line: { color: C.border, width: 1 }, rectRadius: 0.07, fontFace: FONT_B, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.0 });
    if (i < 3) arrowR(slide, bx + bw + 0.03, y + 0.5, 0.28, C.tealDk);
  });
  slide.addText("先省后狠:转速不够 → 加通气 → 掺纯氧 → 加罐压;每级都有副作用,逼到极限才上猛药", { x: R.x, y: y + 1.15, w: R.w, h: 0.32, fontFace: FONT_B, fontSize: 10, color: C.body, align: "center", valign: "middle", margin: 0 });
  slide.addText("反馈闭环:DO 测量 → 比较设定点 → 分级执行 → 再测量 ⟳    |    同样 DO=40%,小罐到②即可,大罐常需到③", { x: R.x, y: y + 1.6, w: R.w, h: 0.5, fontFace: FONT_B, fontSize: 9.5, italic: true, bold: true, color: C.seafoam, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.0 });
};

// 9.3 QbD 漏斗 + 设计空间
D.qbd = (slide, R) => {
  const layers = [["QTPP 质量目标", 0], ["CQA 关键质量属性", 0.6], ["CPP 关键工艺参数", 1.2], ["控制策略", 1.8]];
  const fullW = 5.6;
  layers.forEach((ly, i) => {
    const inset = ly[1];
    slide.addText(ly[0], { shape: RECT, x: R.x + inset, y: R.y + i * 0.72, w: fullW - inset * 2, h: 0.62, fill: { color: [C.tealDk, C.teal, C.seafoam, C.mint][i] }, color: i === 3 ? C.ink : C.white, bold: true, fontFace: FONT_B, fontSize: 11, align: "center", valign: "middle", margin: 0, line: { type: "none" } });
  });
  slide.addText("ALCOA+ · 没记录=没发生 · 不许补改", { x: R.x, y: R.y + 3.05, w: fullW, h: 0.34, fontFace: FONT_B, fontSize: 9.5, bold: true, color: C.red, align: "center", valign: "middle", fill: { color: C.redTint }, margin: 0 });
  // 设计空间 散点
  slide.addText("设计空间(design space)", { x: R.x + 6.2, y: R.y - 0.05, w: R.w - 6.2, h: 0.3, fontFace: FONT_B, fontSize: 10, bold: true, color: C.teal, align: "center", margin: 0 });
  slide.addChart(pres.charts.SCATTER, [
    { name: "X", values: [6.7, 7.2, 6.9, 7.0, 7.1, 6.8, 7.05, 7.5] },
    { name: "安全区", values: [36, 37, 36.5, 37, 36.8, 37.2, 36.6, 33] },
  ], {
    x: R.x + 6.2, y: R.y + 0.35, w: R.w - 6.4, h: R.h - 0.5,
    chartColors: ["17A98C"], lineSize: 0, lineDataSymbol: "circle", lineDataSymbolSize: 9,
    showLegend: false, catAxisTitle: "pH", showCatAxisTitle: true, valAxisTitle: "温度 ℃", showValAxisTitle: true,
    catAxisLabelColor: "8AA39C", valAxisLabelColor: "8AA39C", catAxisTitleColor: "8AA39C", valAxisTitleColor: "8AA39C",
    catAxisLabelFontSize: 7, valAxisLabelFontSize: 7, catAxisTitleFontSize: 8, valAxisTitleFontSize: 8,
    valGridLine: { color: "E2EFEB", size: 0.5 }, catGridLine: { color: "E2EFEB", size: 0.5 }, chartArea: { fill: { color: "FFFFFF" } },
    valAxisMinVal: 32, valAxisMaxVal: 38, catAxisMinVal: 6.5, catAxisMaxVal: 7.6,
  });
  slide.addText("★设定点居中,虚线=控制带,出区→需重新评估", { x: R.x + 6.2, y: R.y + R.h - 0.05, w: R.w - 6.2, h: 0.3, fontFace: FONT_B, fontSize: 8, color: C.muted, align: "center", margin: 0 });
};

// 10.1 可比性三维
D.comparability = (slide, R) => {
  slide.addText("『长得一样 + 产得一样 + 分子一样 = 可比 Comparable』(依据 ICH Q5E)", { x: R.x, y: R.y - 0.05, w: R.w, h: 0.34, fontFace: FONT_B, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", fill: { color: C.teal }, margin: 0 });
  L.compareTable(slide, pres, ["评估维度", "看什么指标", "对什么敏感"], [
    [{ text: "① 工艺性能", bold: true, color: C.teal }, "活细胞密度 VCD / 活率 / titer 产量", "温度、补料"],
    [{ text: "② 产品质量属性 CQA", bold: true, color: C.teal }, "糖基化 / 电荷变体 / 聚体% / 片段化", { text: "DO、pH、CO₂(最易悄悄漂移)", color: C.red }],
    [{ text: "③ 杂质谱", bold: true, color: C.teal }, "HCP 宿主蛋白残留 / DNA 残留", "细胞活率、收获时机"],
  ], { x: R.x, y: R.y + 0.5, w: R.w, colW: [3.0, 5.0, R.w - 8.0], fontSize: 11, headSize: 11, rowH: 0.85 });
};

// 10.2 三失败 + 预防
D.failures = (slide, R) => {
  L.cardGrid(slide, pres, [
    { title: "失败① 照搬参数", accent: C.red, lines: [{ text: "大罐 DO / CO₂ 失控", color: C.red, bold: true }, "小罐 kLa 高,大罐照抄通气与转速,结果 DO 掉底、CO₂ 累积、pH 被顶偏。", { text: "教训:大罐 kLa 必须重算", color: C.muted }] },
    { title: "失败② 忽视混合", accent: C.red, lines: [{ text: "局部 pH 偏移", color: C.red, bold: true }, "混合时间拉长,加碱/补料口出现局部高 pH『热区』,生长与糖基化受损。", { text: "教训:分散加料口 + 提升混合", color: C.muted }] },
    { title: "失败③ 种子波动", accent: C.red, lines: [{ text: "传导到生产批", color: C.red, bold: true }, "某级活率低/结团/污染,亚健康细胞进大罐,生产批表现飘忽难查。", { text: "教训:每级放行标准不能松", color: C.muted }] },
  ], { x: R.x, y: R.y, w: R.w, h: 2.2, cols: 3, colGap: 0.3 });
  slide.addText("预防三件套", { x: R.x, y: R.y + 2.42, w: 1.55, h: 0.5, fontFace: FONT_H, fontSize: 11, bold: true, color: C.teal, align: "left", valign: "middle", margin: 0 });
  L.flowChain(slide, pres, [{ title: "scale-down 模型预演" }, { title: "FMEA 风险评估前置" }, { title: "关键参数定 NOR / PAR 范围" }], { x: R.x + 1.65, y: R.y + 2.42, w: R.w - 1.65, h: 0.55 });
};

// 11.1 一次性 + 平台化
D.singleUse = (slide, R) => {
  L.compareTable(slide, pres, ["对比项", "传统不锈钢 STR", "一次性 SUB", "对 CMO 的意义"], [
    ["换型清洗", "CIP/SIP + 清洁验证", "换袋免清洗", "停机短、上手快"],
    ["换型耗时", "长", { text: "短", bold: true, color: C.teal }, "快速换产品"],
    ["交叉污染", "需验证控制", { text: "物理隔离,极低", bold: true, color: C.teal }, "多产品更安全"],
    ["体积上限", "可做很大(5000L+)", "约 2000 L / 单袋", "超大走多罐/强化"],
    ["柔性", "固定", { text: "高", bold: true, color: C.teal }, "柔性产能底座"],
  ], { x: R.x, y: R.y, w: 8.1, colW: [1.5, 2.5, 2.2, 1.9], fontSize: 9.3, headSize: 9.5, rowH: 0.5 });
  // 右:平台化竖向流程(避免横向窄框文字碎裂)
  const fx = R.x + 8.5, fw = R.w - 8.5;
  slide.addText("平台化:把放大变成走熟路", { x: fx, y: R.y - 0.05, w: fw, h: 0.3, fontFace: FONT_B, fontSize: 9.5, bold: true, color: C.teal, align: "center", margin: 0 });
  const fsteps = [["多项目 A / B / C", C.mintTint], ["标准平台罐型(50~2000L)", C.mint], ["快速换袋 · 免清洗验证", C.seafoam], ["多产品柔性产能", C.teal]];
  fsteps.forEach((s, i) => {
    const yy = R.y + 0.38 + i * 0.74;
    const dark = i >= 2;
    slide.addText(s[0], { shape: RR, x: fx, y: yy, w: fw, h: 0.52, fill: { color: s[1] }, line: { color: C.border, width: 1 }, rectRadius: 0.06, fontFace: FONT_B, fontSize: 10, bold: true, color: dark ? C.white : C.ink, align: "center", valign: "middle", margin: 2 });
    if (i < 3) slide.addShape(pres.shapes.DOWN_ARROW, { x: fx + fw / 2 - 0.1, y: yy + 0.54, w: 0.2, h: 0.18, fill: { color: C.seafoam }, line: { type: "none" } });
  });
};

// 11.2 强化工艺 + 转移 + 成长
D.intensified = (slide, R) => {
  // 左:灌流反应器
  reactor(slide, R.x + 0.3, R.y + 0.3, 1.5, 2.0, { liq: 0.72, liqFill: "AEDFD2" });
  slide.addText("持续补料 →", { x: R.x - 0.1, y: R.y + 0.6, w: 0.55, h: 0.3, fontFace: FONT_B, fontSize: 7.5, color: C.seafoam, align: "center", margin: 0 });
  slide.addText("→ 移除废物", { x: R.x + 1.85, y: R.y + 1.6, w: 0.7, h: 0.3, fontFace: FONT_B, fontSize: 7.5, color: C.seafoam, align: "center", margin: 0 });
  slide.addText("灌流:高 VCD\n体积产量↑", { x: R.x, y: R.y + 2.4, w: 2.0, h: 0.5, fontFace: FONT_B, fontSize: 9, bold: true, color: C.teal, align: "center", valign: "top", margin: 0, lineSpacingMultiple: 0.95 });
  // 中:生长曲线
  slide.addChart(pres.charts.LINE, [
    { name: "强化灌流", labels: ["0", "3", "6", "9", "12"], values: [1, 8, 22, 45, 60] },
    { name: "常规流加", labels: ["0", "3", "6", "9", "12"], values: [1, 5, 12, 18, 20] },
  ], {
    x: R.x + 2.7, y: R.y, w: 4.2, h: R.h - 0.2, chartColors: ["0E7C6B", "D98A1E"], lineSize: 3, lineSmooth: true,
    showLegend: true, legendPos: "b", legendFontSize: 8, legendColor: C.muted,
    catAxisTitle: "天", showCatAxisTitle: true, catAxisTitleFontSize: 7, catAxisTitleColor: "8AA39C",
    catAxisLabelColor: "8AA39C", valAxisLabelColor: "8AA39C", catAxisLabelFontSize: 7, valAxisLabelFontSize: 7,
    valGridLine: { color: "E2EFEB", size: 0.5 }, catGridLine: { style: "none" }, chartArea: { fill: { color: "FFFFFF" } },
    title: "活细胞密度 VCD(×10⁶)", showTitle: true, titleFontSize: 8.5, titleColor: C.muted,
  });
  // 右:转移链 + 成长台阶
  slide.addText("技术转移 tech transfer", { x: R.x + 7.1, y: R.y, w: R.w - 7.1, h: 0.3, fontFace: FONT_B, fontSize: 10, bold: true, color: C.teal, align: "left", margin: 0 });
  const tt = ["CPP 对齐平台罐型", "scale-down 验证", "N-x 逐级放大", "可比性确认"];
  tt.forEach((s, i) => {
    slide.addText((i + 1) + ". " + s, { x: R.x + 7.1, y: R.y + 0.35 + i * 0.42, w: R.w - 7.1, h: 0.38, fontFace: FONT_B, fontSize: 9.5, color: C.body, align: "left", valign: "middle", fill: { color: i % 2 ? C.mintTint2 : C.mintTint }, margin: 2 });
  });
  slide.addText("成长路径:基础操作 → 单元独立运行 → 趋势判读 → 放大/技术转移项目", { x: R.x + 7.1, y: R.y + 2.2, w: R.w - 7.1, h: 0.8, fontFace: FONT_B, fontSize: 9, italic: true, color: C.muted, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.05 });
};

// 12.1 总结逻辑链 + 三准则条
D.summaryChain = (slide, R) => {
  L.flowChain(slide, pres, [
    { title: "放大本质", sub: "微环境一致" }, { title: "几何不相似", sub: "面积/混合不成比例" }, { title: "工程量分化", sub: "P/V·kLa·tip" }, { title: "种子链交接", sub: "N-x → N" }, { title: "可比性判定", sub: "质量对得上" },
  ], { x: R.x, y: R.y, w: R.w, h: 1.0 });
  slide.addText("三准则:保什么 / 丢什么", { x: R.x, y: R.y + 1.3, w: R.w, h: 0.3, fontFace: FONT_H, fontSize: 11, bold: true, color: C.ink, align: "center", margin: 0 });
  L.compareTable(slide, pres, ["", "恒定 P/V", "恒定 kLa(CHO 常用)", "恒定 tip speed"], [
    ["保什么", "混合 / 传质", { text: "供氧", bold: true, color: C.teal }, "剪切上限"],
    ["丢什么", { text: "剪切偏高", color: C.red }, { text: "搅拌/泡沫风险", color: C.red, fill: "DCF0EA" }, { text: "混合可能不足", color: C.red }],
  ], { x: R.x + 1.5, y: R.y + 1.65, w: R.w - 3.0, colW: [1.4, (R.w - 3.0 - 1.4) / 3, (R.w - 3.0 - 1.4) / 3, (R.w - 3.0 - 1.4) / 3], fontSize: 10.5, headSize: 11, rowH: 0.55 });
};

// 12.2 下一步 + Q&A
D.nextSteps = (slide, R) => {
  L.cardGrid(slide, pres, [
    { badge: "1", title: "懂原理", lines: ["CPP + 工程量", "控什么/为什么/范围"] },
    { badge: "2", title: "熟设备", lines: ["STR / SUB 部件", "SOP 与操作"] },
    { badge: "3", title: "参与放大", lines: ["读懂批记录", "可比性报告"] },
  ], { x: R.x, y: R.y, w: R.w, h: 1.7, cols: 3, colGap: 0.2 });
  slide.addText("Q&A(预留 5~10 分钟)", { shape: RR, x: R.x, y: R.y + 1.9, w: R.w, h: 0.45, fill: { color: C.teal }, color: C.white, bold: true, fontFace: FONT_H, fontSize: 12, align: "center", valign: "middle", rectRadius: 0.08, margin: 0 });
  slide.addText("· 参数为什么不能照搬?   · 大罐哪里最容易出事?   · 可比性怎么判定?   (先查受控文件再提问)", { x: R.x, y: R.y + 2.45, w: R.w, h: 0.7, fontFace: FONT_B, fontSize: 9.5, color: C.body, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.1 });
};

// ============ 封面 / 目录 / 分隔 / 总结 / 术语 / 结尾 ============
function coverSlide() {
  const slide = pres.addSlide();
  slide.background = { color: C.tealDk };
  pageNo++; // 计入全局页序,使后续页脚页码与真实页号一致
  // 装饰:右侧大圆 + 罐影
  slide.addShape(OVAL, { x: 9.6, y: -1.6, w: 5.5, h: 5.5, fill: { color: C.tealDk2 }, line: { type: "none" } });
  slide.addShape(OVAL, { x: 11.2, y: 3.6, w: 4.0, h: 4.0, fill: { color: "0C5246" }, line: { type: "none" } });
  reactor(slide, 10.4, 1.7, 1.9, 3.0, { bodyFill: "0C5246", liqFill: "12806C", liq: 0.6 });
  // 顶部品牌条
  slide.addText("无锡药明生物 · 上游工艺培训", { x: M, y: 0.55, w: 8, h: 0.4, fontFace: FONT_B, fontSize: 13, color: C.mint, bold: true, align: "left", valign: "middle", margin: 0, charSpacing: 1 });
  slide.addShape(RECT, { x: M, y: 1.05, w: 0.9, h: 0.07, fill: { color: C.mint }, line: { type: "none" } });
  // 主标题
  slide.addText(content.meta.title, { x: M, y: 2.3, w: 9.3, h: 1.3, fontFace: FONT_H, fontSize: 52, bold: true, color: C.white, align: "left", valign: "middle", margin: 0 });
  slide.addText(content.meta.titleEn, { x: M, y: 3.65, w: 9.3, h: 0.5, fontFace: FONT_B, fontSize: 17, color: C.mint, align: "left", valign: "middle", margin: 0, charSpacing: 1 });
  slide.addText(content.meta.subtitle, { x: M, y: 4.35, w: 8.8, h: 0.6, fontFace: FONT_B, fontSize: 15, color: "BFE6DA", align: "left", valign: "middle", margin: 0 });
  // 底部信息条
  slide.addShape(RECT, { x: M, y: 5.85, w: 8.8, h: 0.022, fill: { color: "2A6B5E" }, line: { type: "none" } });
  slide.addText([
    { text: "受众  ", options: { color: C.mint, bold: true, fontSize: 12 } }, { text: content.meta.audience + "      ", options: { color: "D7EFE8", fontSize: 12 } },
    { text: "时长  ", options: { color: C.mint, bold: true, fontSize: 12 } }, { text: content.meta.duration, options: { color: "D7EFE8", fontSize: 12 } },
  ], { x: M, y: 6.1, w: 9, h: 0.4, fontFace: FONT_B, align: "left", valign: "middle", margin: 0 });
  slide.addText("新员工入门系列", { x: M, y: 6.7, w: 6, h: 0.4, fontFace: FONT_B, fontSize: 11, color: "9FCFC2", align: "left", valign: "middle", margin: 0 });
}

function agendaSlide() {
  const slide = pres.addSlide();
  slide.background = { color: C.white };
  pageNo++;
  slide.addText("课程目录", { x: M, y: 0.55, w: 8, h: 0.8, fontFace: FONT_H, fontSize: 30, bold: true, color: C.ink, align: "left", valign: "middle", margin: 0 });
  slide.addText("AGENDA", { x: M, y: 1.3, w: 8, h: 0.3, fontFace: FONT_B, fontSize: 12, color: C.mint, bold: true, charSpacing: 3, align: "left", margin: 0 });
  L.footer(slide, pres, pageNo);
  const items = content.agenda.items;
  const cols = 2, rows = Math.ceil(items.length / cols);
  const cw = (PAGE.w - M * 2 - 0.4) / cols, ch = 0.82;
  const y0 = 1.85;
  items.forEach((it, i) => {
    const r = i % rows, c = Math.floor(i / rows);
    const x = M + c * (cw + 0.4), y = y0 + r * ch;
    slide.addText(it[0], { x, y, w: 0.7, h: 0.62, fontFace: FONT_H, fontSize: 22, bold: true, color: C.mint, align: "left", valign: "middle", margin: 0 });
    slide.addText([{ text: it[1], options: { bold: true, fontSize: 13, color: C.ink, breakLine: true } }, { text: it[2], options: { fontSize: 9.5, color: C.muted } }], { x: x + 0.75, y, w: cw - 0.8, h: 0.62, fontFace: FONT_B, align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 0.95 });
    slide.addShape(LINE, { x, y: y + 0.7, w: cw - 0.1, h: 0, line: { color: C.border, width: 0.75 } });
  });
}

function dividerSlide(chap) {
  const slide = pres.addSlide();
  slide.background = { color: C.tealDk };
  pageNo++;
  slide.addShape(OVAL, { x: 10.2, y: -1.3, w: 5.0, h: 5.0, fill: { color: C.tealDk2 }, line: { type: "none" } });
  slide.addText("第 " + String(chap.no).padStart(2, "0") + " 章", { x: M, y: 2.2, w: 6, h: 0.5, fontFace: FONT_B, fontSize: 16, color: C.mint, bold: true, align: "left", valign: "middle", margin: 0, charSpacing: 2 });
  slide.addShape(RECT, { x: M, y: 2.78, w: 1.0, h: 0.08, fill: { color: C.mint }, line: { type: "none" } });
  slide.addText(chap.name, { x: M, y: 3.0, w: 10.5, h: 1.2, fontFace: FONT_H, fontSize: 40, bold: true, color: C.white, align: "left", valign: "middle", margin: 0 });
  slide.addText(chap.oneLiner, { x: M, y: 4.4, w: 9.8, h: 0.9, fontFace: FONT_B, fontSize: 16, color: "BFE6DA", align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.15 });
  slide.addText(String(chap.no) + " / 12", { x: PAGE.w - 2.0, y: 6.6, w: 1.4, h: 0.4, fontFace: FONT_B, fontSize: 12, color: "7FBAAC", align: "right", valign: "middle", margin: 0 });
}

function summarySlide() {
  const slide = pres.addSlide();
  slide.background = { color: C.white };
  pageNo++;
  slide.addText(content.summary.title, { x: M, y: 0.55, w: 12, h: 0.8, fontFace: FONT_H, fontSize: 26, bold: true, color: C.ink, align: "left", valign: "middle", margin: 0 });
  L.footer(slide, pres, pageNo);
  const items = content.summary.bullets;
  const cols = 2, rows = Math.ceil(items.length / cols);
  const cw = (PAGE.w - M * 2 - 0.4) / cols, ch = 1.5;
  const y0 = 1.7;
  items.forEach((it, i) => {
    const r = i % rows, c = Math.floor(i / rows);
    const x = M + c * (cw + 0.4), y = y0 + r * ch;
    slide.addShape(RR, { x, y, w: cw, h: ch - 0.18, fill: { color: C.mintTint2 }, line: { color: C.border, width: 1 }, rectRadius: 0.07, shadow: shSoft() });
    slide.addShape(RECT, { x, y, w: 0.09, h: ch - 0.18, fill: { color: C.teal }, line: { type: "none" } });
    badge(slide, x + 0.2, y + 0.18, 0.42, String(i + 1), C.teal);
    slide.addText(it[0], { x: x + 0.75, y: y + 0.16, w: cw - 0.95, h: 0.4, fontFace: FONT_H, fontSize: 13, bold: true, color: C.teal, align: "left", valign: "middle", margin: 0 });
    slide.addText(it[1], { x: x + 0.28, y: y + 0.62, w: cw - 0.5, h: ch - 0.85, fontFace: FONT_B, fontSize: 10, color: C.body, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.05 });
  });
}

function glossarySlide() {
  const slide = pres.addSlide();
  slide.background = { color: C.white };
  pageNo++;
  slide.addText("术语速查表", { x: M, y: 0.5, w: 10, h: 0.7, fontFace: FONT_H, fontSize: 26, bold: true, color: C.ink, align: "left", valign: "middle", margin: 0 });
  slide.addText("GLOSSARY · 16 个关键术语", { x: M, y: 1.18, w: 8, h: 0.3, fontFace: FONT_B, fontSize: 11, color: C.mint, bold: true, charSpacing: 2, align: "left", margin: 0 });
  L.footer(slide, pres, pageNo);
  const g = content.glossary;
  const cols = 2, rows = Math.ceil(g.length / cols);
  const cw = (PAGE.w - M * 2 - 0.4) / cols, ch = (6.7 - 1.6) / rows;
  const y0 = 1.6;
  g.forEach((row, i) => {
    const r = i % rows, c = Math.floor(i / rows);
    const x = M + c * (cw + 0.4), y = y0 + r * ch;
    slide.addText([
      { text: row[0], options: { bold: true, fontSize: 10.5, color: C.teal } },
      { text: "  " + row[1] + "  ", options: { fontSize: 8.5, color: C.seafoam, italic: true, breakLine: true } },
      { text: row[2], options: { fontSize: 8.8, color: C.body } },
    ], { x: x + 0.1, y: y + 0.04, w: cw - 0.2, h: ch - 0.08, fontFace: FONT_B, align: "left", valign: "middle", margin: 1, lineSpacingMultiple: 0.96 });
    slide.addShape(LINE, { x, y: y + ch - 0.04, w: cw, h: 0, line: { color: C.border, width: 0.5 } });
  });
}

function closingSlide() {
  const slide = pres.addSlide();
  slide.background = { color: C.tealDk };
  slide.addShape(OVAL, { x: -1.5, y: 3.5, w: 5.0, h: 5.0, fill: { color: C.tealDk2 }, line: { type: "none" } });
  slide.addText("谢谢", { x: 0, y: 2.4, w: PAGE.w, h: 1.2, fontFace: FONT_H, fontSize: 52, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
  slide.addText("放大不是把罐子变大,而是让细胞『感觉不到』变大", { x: 0, y: 3.7, w: PAGE.w, h: 0.5, fontFace: FONT_B, fontSize: 17, bold: true, color: "E4F7F0", align: "center", valign: "middle", margin: 0 });
  slide.addText("无锡药明生物 · 上游工艺培训", { x: 0, y: 4.6, w: PAGE.w, h: 0.4, fontFace: FONT_B, fontSize: 12, color: "A9D6C9", align: "center", valign: "middle", margin: 0 });
}

// ============ 组装 ============
function injectExtras() {
  content.sections.forEach((sec) => {
    sec.slides = sec.slides.map((s) => (s.__extra ? extras[s.__extra] : s));
  });
}

function main() {
  injectExtras();
  coverSlide();
  agendaSlide();
  content.sections.forEach((sec) => {
    dividerSlide(sec);
    sec.slides.forEach((s) => contentSlide(s, sec));
  });
  summarySlide();
  glossarySlide();
  closingSlide();
  return pres.writeFile({ fileName: "上游反应器工艺放大_培训.pptx" });
}

main().then((f) => console.log("WROTE", f, "pages~", pageNo)).catch((e) => { console.error(e); process.exit(1); });
