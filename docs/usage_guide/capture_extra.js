/* eslint-disable */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'playwright'));
const BASE = 'http://localhost:3000';
const API = 'http://127.0.0.1:3001';
const OUT = path.join(__dirname, 'screenshots');

(async () => {
  const res = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }) });
  const token = (await res.json()).data.token;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => { try { localStorage.setItem('auth_token', t); } catch (e) {} }, token);
  const page = await ctx.newPage();

  // 1) 工艺模版编辑器（甘特）
  try { await page.goto(BASE + '/process-templates/7', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) { console.log('goto editor warn', e.message); }
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(OUT, '23_template_editor.png'), fullPage: false });
  console.log('✓ 23_template_editor');

  // 2) 批次管理 V4 甘特视图
  try { await page.goto(BASE + '/batch-management-v4', { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) {}
  await page.waitForTimeout(4000);
  let clicked = false;
  for (const sel of ["text=甘特", "text=甘特图", "button:has-text('甘特')"]) {
    try { const el = await page.$(sel); if (el) { await el.click(); clicked = true; break; } } catch (e) {}
  }
  console.log('gantt toggle clicked:', clicked);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, '24_batch_gantt.png'), fullPage: false });
  console.log('✓ 24_batch_gantt');

  await ctx.close(); await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
