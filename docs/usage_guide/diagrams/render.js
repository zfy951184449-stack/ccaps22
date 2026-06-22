/* eslint-disable */
// 把 SVG 渲染成 PNG（Playwright chromium，2x），供自检与嵌入 Word。
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', '..', '..', 'frontend', 'node_modules', 'playwright'));
const DIR = __dirname;
const files = ['fig_tech.svg','fig1_er.svg', 'fig2_pipeline.svg'];

(async () => {
  const browser = await chromium.launch();
  for (const f of files) {
    const svg = fs.readFileSync(path.join(DIR, f), 'utf8');
    const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    const w = +m[1], h = +m[2];
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${svg}</body></html>`);
    await page.waitForTimeout(400);
    const out = path.join(DIR, f.replace('.svg', '.png'));
    await page.locator('svg').screenshot({ path: out });
    console.log('rendered', out, `${w}x${h}`);
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
