/* eslint-disable */
// 精确判定字体溢出：对每个 <text>，找包含它的最小 <rect>，比较文本右端与框右内边距。
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', '..', '..', 'frontend', 'node_modules', 'playwright'));
const DIR = __dirname;
const PAD = 8; // 框右内边距

(async () => {
  const browser = await chromium.launch();
  for (const f of ['fig1_er.svg', 'fig2_pipeline.svg']) {
    const svg = fs.readFileSync(path.join(DIR, f), 'utf8');
    const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    const page = await browser.newPage({ viewport: { width: +m[1], height: +m[2] } });
    await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
    await page.waitForTimeout(300);
    const data = await page.evaluate(() => {
      const rects = Array.from(document.querySelectorAll('rect')).map((r) => ({
        x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'),
      }));
      const texts = Array.from(document.querySelectorAll('text')).map((t) => ({
        s: t.textContent, x: +t.getAttribute('x'), y: +t.getAttribute('y'), len: t.getComputedTextLength(),
        anchor: t.getAttribute('text-anchor') || 'start',
      }));
      return { rects, texts };
    });
    const over = [];
    data.texts.forEach((t) => {
      const left = t.anchor === 'middle' ? t.x - t.len / 2 : t.x;
      const rightEdge = left + t.len;
      // 最小包含框（按面积）
      const containing = data.rects.filter((r) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y - 4 && t.y <= r.y + r.h + 2)
        .sort((a, b) => a.w * a.h - b.w * b.h);
      const box = containing[0];
      if (!box) return; // 不在任何框内（如说明文字），跳过
      const limit = box.x + box.w - PAD;
      if (rightEdge > limit + 0.5) over.push({ s: t.s, right: Math.round(rightEdge), limit: Math.round(limit), over: Math.round(rightEdge - limit), box: `${box.x},${box.w}` });
    });
    console.log(`\n===== ${f}：框内溢出 ${over.length} 处 =====`);
    over.forEach((o) => console.log(`  +${o.over}px  right=${o.right}>${o.limit}  [box ${o.box}]  「${o.s}」`));
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
