// lib.js — 药明青绿主题 + 通用渲染器 + SVG→PNG 管线
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ASSETS = path.join(__dirname, "assets");
if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });

// 画布 LAYOUT_WIDE = 13.333 x 7.5 (inch)
const PAGE = { w: 13.333, h: 7.5 };
const M = 0.6; // 页边距

// ——— 药明青绿配色 ———
const C = {
  ink: "13211E",
  body: "273833",
  muted: "5E716C",
  faint: "8AA39C",
  teal: "0E7C6B", // 主色
  tealDk: "0A453B", // 深底(封面/分隔/结尾)
  tealDk2: "06302A",
  seafoam: "17A98C",
  mint: "5FD0B6",
  mintTint: "E6F5F0", // 卡片浅底
  mintTint2: "F2FAF7",
  border: "CFE5DE",
  white: "FFFFFF",
  amber: "D98A1E", // 提醒/折中
  amberTint: "FBEFD7",
  red: "C0392B", // 风险
  redTint: "F8E4E1",
  posGreen: "2E9E5B", // 正向(被保住的量)
};

const FONT_H = "Microsoft YaHei"; // 标题
const FONT_B = "Microsoft YaHei"; // 正文(中文统一,稳)

// ——— SVG → PNG ———
async function svgToPng(name, svg, density = 200) {
  const out = path.join(ASSETS, name + ".png");
  await sharp(Buffer.from(svg), { density }).png().toBuffer().then((buf) => fs.writeFileSync(out, buf));
  return out;
}

// 取得 SVG 尺寸比(用于在 ppt 中保持比例)
function svgDims(wPx, hPx) {
  return { ratio: wPx / hPx };
}

// ——— 通用:页脚 ———
function footer(slide, pres, pageNo, total) {
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: PAGE.h - 0.32, w: PAGE.w, h: 0.32, fill: { color: C.mintTint2 }, line: { type: "none" } });
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: PAGE.h - 0.32, w: PAGE.w, h: 0.022, fill: { color: C.border }, line: { type: "none" } });
  slide.addText("无锡药明生物 · 上游工艺培训", { x: M, y: PAGE.h - 0.32, w: 6, h: 0.32, fontFace: FONT_B, fontSize: 8.5, color: C.faint, align: "left", valign: "middle", margin: 0 });
  slide.addText(`上游反应器工艺放大`, { x: PAGE.w - 6.6, y: PAGE.h - 0.32, w: 4.5, h: 0.32, fontFace: FONT_B, fontSize: 8.5, color: C.faint, align: "right", valign: "middle", margin: 0 });
  if (pageNo) slide.addText(`${pageNo}${total ? " / " + total : ""}`, { x: PAGE.w - 1.5, y: PAGE.h - 0.32, w: 0.9, h: 0.32, fontFace: FONT_B, fontSize: 8.5, color: C.teal, bold: true, align: "right", valign: "middle", margin: 0 });
}

// ——— 通用:内容页标题区(章节号 chip + 标题 + 右上章名)———
// 母题:左上青绿圆角块写章节号,标题在右,无下划线
function contentHeader(slide, pres, { chapNo, chapName, title, sub }) {
  const chipW = 0.95;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: M, w: chipW, h: 0.95, fill: { color: C.teal }, line: { type: "none" }, rectRadius: 0.12, shadow: mkShadow() });
  slide.addText([
    { text: "第", options: { fontSize: 9, color: "CDEDE4", breakLine: true } },
    { text: String(chapNo), options: { fontSize: 30, color: C.white, bold: true, breakLine: true } },
    { text: "章", options: { fontSize: 9, color: "CDEDE4" } },
  ], { x: M, y: M, w: chipW, h: 0.95, align: "center", valign: "middle", fontFace: FONT_H, lineSpacingMultiple: 0.92, margin: 0 });

  const tx = M + chipW + 0.28;
  slide.addText(title, { x: tx, y: M - 0.02, w: PAGE.w - tx - M, h: sub ? 0.6 : 0.95, fontFace: FONT_H, fontSize: 23, bold: true, color: C.ink, align: "left", valign: sub ? "bottom" : "middle", margin: 0 });
  if (sub) slide.addText(sub, { x: tx, y: M + 0.58, w: PAGE.w - tx - M, h: 0.36, fontFace: FONT_B, fontSize: 12, color: C.teal, align: "left", valign: "middle", margin: 0 });
  // 右上角章名小标签
  slide.addText(chapName, { x: PAGE.w - 4.2 - M, y: M + 0.02, w: 4.2, h: 0.3, fontFace: FONT_B, fontSize: 9.5, color: C.faint, align: "right", valign: "top", margin: 0 });
}

function mkShadow() {
  return { type: "outer", color: "0A453B", blur: 7, offset: 3, angle: 135, opacity: 0.18 };
}
function mkShadowSoft() {
  return { type: "outer", color: "1A3D36", blur: 9, offset: 2, angle: 90, opacity: 0.10 };
}

// ——— 通用:左侧要点列表(讲义版,文字较多)———
function bulletBlock(slide, pres, bullets, { x, y, w, h, fontSize = 12.5, color = C.body, gap = 7 }) {
  const runs = bullets.map((b, i) => ({
    text: typeof b === "string" ? b : b.text,
    options: {
      bullet: { code: "2022", indent: 14 },
      color: (typeof b === "object" && b.color) || color,
      bold: (typeof b === "object" && b.bold) || false,
      fontSize,
      breakLine: true,
      paraSpaceAfter: gap,
    },
  }));
  slide.addText(runs, { x, y, w, h, fontFace: FONT_B, align: "left", valign: "top", lineSpacingMultiple: 1.04 });
}

// ——— 通用:关键数据条(底部一排小callout)———
function keyDataStrip(slide, pres, items, { x, y, w, h = 1.0, max = 4 }) {
  const data = items.slice(0, max);
  const n = data.length;
  const gap = 0.18;
  const cw = (w - gap * (n - 1)) / n;
  data.forEach((d, i) => {
    const cx = x + i * (cw + gap);
    slide.addShape(pres.shapes.RECTANGLE, { x: cx, y, w: cw, h, fill: { color: C.mintTint }, line: { type: "none" } });
    slide.addShape(pres.shapes.RECTANGLE, { x: cx, y, w: 0.06, h, fill: { color: C.seafoam }, line: { type: "none" } });
    slide.addText(d, { x: cx + 0.16, y: y + 0.06, w: cw - 0.26, h: h - 0.12, fontFace: FONT_B, fontSize: 9.3, color: C.body, align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 0.98 });
  });
}

// ——— 通用:卡片网格 ———
// cards: [{icon?, title, lines:[], accent?}]
function cardGrid(slide, pres, cards, { x, y, w, h, cols, rowGap = 0.22, colGap = 0.22, titleColor = C.teal }) {
  const rows = Math.ceil(cards.length / cols);
  const cw = (w - colGap * (cols - 1)) / cols;
  const ch = (h - rowGap * (rows - 1)) / rows;
  cards.forEach((c, i) => {
    const r = Math.floor(i / cols), cc = i % cols;
    const cx = x + cc * (cw + colGap), cy = y + r * (ch + rowGap);
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx, y: cy, w: cw, h: ch, fill: { color: C.white }, line: { color: C.border, width: 1 }, rectRadius: 0.08, shadow: mkShadowSoft() });
    slide.addShape(pres.shapes.RECTANGLE, { x: cx, y: cy, w: cw, h: 0.09, fill: { color: c.accent || C.teal }, line: { type: "none" } });
    let ty = cy + 0.22;
    if (c.badge) {
      slide.addShape(pres.shapes.OVAL, { x: cx + 0.2, y: ty, w: 0.42, h: 0.42, fill: { color: C.mintTint }, line: { type: "none" } });
      slide.addText(c.badge, { x: cx + 0.2, y: ty, w: 0.42, h: 0.42, fontFace: FONT_H, fontSize: 15, bold: true, color: c.accent || C.teal, align: "center", valign: "middle", margin: 0 });
      slide.addText(c.title, { x: cx + 0.72, y: ty - 0.04, w: cw - 0.9, h: 0.5, fontFace: FONT_H, fontSize: 13, bold: true, color: titleColor, align: "left", valign: "middle", margin: 0 });
      ty += 0.56;
    } else {
      slide.addText(c.title, { x: cx + 0.22, y: ty, w: cw - 0.44, h: 0.4, fontFace: FONT_H, fontSize: 13.5, bold: true, color: titleColor, align: "left", valign: "middle", margin: 0 });
      ty += 0.46;
    }
    const runs = (c.lines || []).map((l, j) => ({ text: typeof l === "string" ? l : l.text, options: { fontSize: 10.5, color: (typeof l === "object" && l.color) || C.body, bullet: c.bullets ? { code: "2022", indent: 10 } : false, breakLine: true, paraSpaceAfter: 4 } }));
    if (runs.length) slide.addText(runs, { x: cx + 0.22, y: ty, w: cw - 0.44, h: cy + ch - ty - 0.12, fontFace: FONT_B, align: "left", valign: "top", lineSpacingMultiple: 1.0 });
  });
}

// ——— 通用:横向流程链(圆角方块 + 箭头)———
// steps: [{title, sub?}], opts.accent
function flowChain(slide, pres, steps, { x, y, w, h = 1.1, accent = C.teal, numbered = false, highlightIdx = -1 }) {
  const n = steps.length;
  const arrowW = 0.34;
  const bw = (w - arrowW * (n - 1)) / n;
  steps.forEach((s, i) => {
    const bx = x + i * (bw + arrowW);
    const hot = i === highlightIdx;
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: bx, y, w: bw, h, fill: { color: hot ? accent : C.mintTint }, line: { color: hot ? accent : C.border, width: 1 }, rectRadius: 0.07, shadow: hot ? mkShadow() : undefined });
    const tcol = hot ? C.white : C.ink;
    const scol = hot ? "D8F2EA" : C.muted;
    let parts = [];
    if (numbered) parts.push({ text: String(i + 1) + "  ", options: { fontSize: 12, bold: true, color: hot ? "CDEDE4" : accent } });
    parts.push({ text: s.title, options: { fontSize: 11.5, bold: true, color: tcol, breakLine: !!s.sub } });
    if (s.sub) parts.push({ text: s.sub, options: { fontSize: 9, color: scol } });
    slide.addText(parts, { x: bx + 0.1, y, w: bw - 0.2, h, fontFace: FONT_B, align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.0 });
    if (i < n - 1) {
      slide.addShape(pres.shapes.CHEVRON, { x: bx + bw + 0.02, y: y + h / 2 - 0.16, w: arrowW - 0.04, h: 0.32, fill: { color: accent }, line: { type: "none" } });
    }
  });
}

// ——— 通用:对比表 ———
// header:[{text}], rows:[[cell,...]] cell可为string或{text,fill,color,bold,align}
function compareTable(slide, pres, header, rows, { x, y, w, colW, headFill = C.teal, fontSize = 10.5, headSize = 11, rowH }) {
  const headerRow = header.map((hraw) => {
    const hcell = typeof hraw === "string" ? { text: hraw } : hraw;
    return { text: hcell.text, options: { fill: { color: hcell.fill || headFill }, color: hcell.color || C.white, bold: true, align: hcell.align || "center", valign: "middle", fontSize: headSize, fontFace: FONT_H } };
  });
  const body = rows.map((r, ri) =>
    r.map((craw) => {
      const c = typeof craw === "string" ? { text: craw } : craw;
      return {
        text: c.text,
        options: {
          fill: { color: c.fill || (ri % 2 ? C.mintTint2 : C.white) },
          color: c.color || C.body,
          bold: c.bold || false,
          align: c.align || "left",
          valign: "middle",
          fontSize: c.fontSize || fontSize,
          fontFace: FONT_B,
          colspan: c.colspan,
        },
      };
    })
  );
  const opts = { x, y, w, colW, border: { type: "solid", pt: 0.75, color: C.border }, fontFace: FONT_B, valign: "middle", autoPage: false };
  if (rowH) opts.rowH = rowH;
  slide.addTable([headerRow, ...body], opts);
}

module.exports = {
  fs, path, sharp, ASSETS, PAGE, M, C, FONT_H, FONT_B,
  svgToPng, svgDims, footer, contentHeader, mkShadow, mkShadowSoft,
  bulletBlock, keyDataStrip, cardGrid, flowChain, compareTable,
};
