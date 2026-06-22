/* eslint-disable */
// 重拍加载较慢的页面（加长 settle）。
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'playwright'));
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://127.0.0.1:3001';
const OUT = path.join(__dirname, 'screenshots');

const SLOW = [
  ['/roster/leadership-cockpit', '32_roster_cockpit', 11000],
];

(async () => {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
  });
  const token = (await res.json()).data.token;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => { try { localStorage.setItem('auth_token', t); } catch (e) {} }, token);
  const page = await ctx.newPage();
  for (const [route, name, settle] of SLOW) {
    try { await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch (e) {}
    await page.waitForTimeout(settle);
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false });
    console.log('✓ recaptured', name);
  }
  await ctx.close(); await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
