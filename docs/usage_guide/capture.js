/* eslint-disable */
// 使用指南截图脚本：Playwright 注入 admin token 登录，逐页全屏截图落盘。
// 运行：cd frontend && node ../docs/usage_guide/capture.js
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'playwright'));

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://127.0.0.1:3001';
const OUT = path.join(__dirname, 'screenshots');

const ROUTES = [
  ['/dashboard', '01_dashboard', 3500],
  ['/operations-overview', '02_operations_overview', 3500],
  ['/my-schedule', '03_my_schedule', 3500],
  ['/equipment-management', '10_equipment_management', 3500],
  ['/qualifications', '11_qualifications', 3000],
  ['/qualification-matrix', '12_qualification_matrix', 3500],
  ['/operations', '13_operations', 3500],
  ['/operation-types', '14_operation_types', 3000],
  ['/process-templates', '20_process_templates', 3500],
  ['/batch-management-v4', '21_batch_management_v4', 4000],
  ['/batch-management-workbench-v2', '22_batch_workbench_v2', 4000],
  ['/organization-workbench', '30_organization_workbench', 3500],
  ['/personnel-scheduling', '31_personnel_scheduling', 4500],
  ['/roster/leadership-cockpit', '32_roster_cockpit', 4000],
  ['/roster/exceptions', '33_roster_exceptions', 4000],
  ['/solver-v4', '34_solver_v4', 4000],
  ['/solver-v5', '35_solver_v5', 4000],
  ['/shift-definitions', '36_shift_definitions', 3500],
  ['/governance/roles', '40_governance_roles', 3500],
  ['/governance/users', '41_governance_users', 3500],
  ['/governance/permissions', '42_governance_permissions', 3500],
];

async function getToken() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
  });
  const json = await res.json();
  if (!json?.data?.token) throw new Error('login failed: ' + JSON.stringify(json));
  return json.data.token;
}

async function shoot(page, route, name, settle) {
  const url = BASE + route;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log(`  goto warn ${route}: ${e.message}`);
  }
  await page.waitForTimeout(settle);
  // 关闭可能弹出的引导层（按 Esc）
  try { await page.keyboard.press('Escape'); } catch (e) {}
  await page.waitForTimeout(300);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${name}  (${route})`);
}

(async () => {
  const token = await getToken();
  console.log('token ok');
  const browser = await chromium.launch();

  // ① 登录页（无 token 的独立上下文）
  const ctxAnon = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const pAnon = await ctxAnon.newPage();
  await shoot(pAnon, '/login', '00_login', 2500);
  await ctxAnon.close();

  // ② 已登录上下文：注入 token 到 localStorage（应用启动前）
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => {
    try { localStorage.setItem('auth_token', t); } catch (e) {}
  }, token);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  pageerror:', e.message));

  for (const [route, name, settle] of ROUTES) {
    await shoot(page, route, name, settle);
  }

  await ctx.close();
  await browser.close();
  console.log('ALL DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
