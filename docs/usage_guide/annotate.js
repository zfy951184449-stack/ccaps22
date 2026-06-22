/* eslint-disable */
// 在真实页面上注入"编号圆标 + 高亮框"，截出带标记的图。
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'playwright'));
const BASE = 'http://localhost:3000';
const API = 'http://127.0.0.1:3001';
const OUT = path.join(__dirname, 'screenshots_annotated');
const fs = require('fs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const S = (sel) => ({ css: true, sel });
const PAGES = [
  { route: '/operations-overview', name: '02_operations_overview', settle: 4000, anns: [
    { n: 1, find: '2024', alt: '2026', box: true }, { n: 2, find: '全部部门', box: true },
    { n: 3, find: '批次执行' }, { n: 4, find: '即将开始', alt: '当前正在进行' },
    { n: 5, find: '缺人', box: true, at: 'tr' }, { n: 6, find: '操作人员分配' } ] },

  { route: '/equipment-management', name: '10_equipment_management', settle: 3500, anns: [
    { n: 1, find: '新建根节点', box: true }, { n: 2, ...S('input[placeholder*="搜索"]'), box: true },
    { n: 3, find: '导出' }, { n: 4, find: '刷新' }, { n: 5, find: '清空' } ] },

  { route: '/qualifications', name: '11_qualifications', settle: 3000, anns: [
    { n: 1, find: '新增资质', box: true }, { n: 2, ...S('input[placeholder*="搜索"]'), box: true },
    { n: 3, find: '编辑', box: true, at: 'tr' }, { n: 4, find: '删除', at: 'tr' } ] },

  { route: '/qualification-matrix', name: '12_qualification_matrix', settle: 3500, anns: [
    { n: 1, ...S('input[placeholder*="搜索"]'), box: true }, { n: 2, find: '全部部门', box: true },
    { n: 3, find: '显示空行', box: true }, { n: 4, find: '紧凑视图', box: true },
    { n: 5, find: '更多员工' }, { n: 6, find: '导出' } ] },

  { route: '/operations', name: '13_operations', settle: 3500, anns: [
    { n: 1, find: '新增操作', box: true }, { n: 2, ...S('input[placeholder*="搜索"]'), box: true },
    { n: 3, find: 'Media', box: true }, { n: 4, find: '编辑', box: true, at: 'tr' } ] },

  { route: '/operation-types', name: '14_operation_types', settle: 3000, anns: [
    { n: 1, find: '新增类型', box: true }, { n: 2, find: 'Media', box: true },
    { n: 3, find: '编辑', box: true, at: 'tr' } ] },

  { route: '/process-templates', name: '20_process_templates', settle: 3500, anns: [
    { n: 1, find: '新建模板', box: true }, { n: 2, find: '导入' }, { n: 3, find: '导出' },
    { n: 4, find: '复制', box: true, at: 'tr' }, { n: 5, find: '编辑', box: true, at: 'tr' } ] },

  { route: '/process-templates/7', name: '23_template_editor', settle: 9000, anns: [
    { n: 1, find: '返回', box: true }, { n: 2, find: '新增阶段', box: true },
    { n: 3, find: '时间窗口', box: true }, { n: 4, find: '自动排程', box: true } ] },

  { route: '/batch-management-v4', name: '21_batch_management_v4', settle: 4000, anns: [
    { n: 1, find: '新建批次', box: true }, { n: 2, find: '批量创建' }, { n: 3, find: '甘特', box: true },
    { n: 4, find: '激活', box: true, at: 'tr' }, { n: 5, find: '编辑', at: 'tr' } ] },

  { route: '/batch-management-v4', name: '24_batch_gantt', settle: 4000, preClick: '甘特', postWait: 3500, anns: [
    { n: 1, find: '列表视图', box: true }, { n: 2, find: '适应数据', box: true }, { n: 3, find: '天', box: true } ] },

  { route: '/solver-v4', name: '34_solver_v4', settle: 4000, anns: [
    { n: 1, find: '区间求解', box: true }, { n: 2, find: '高级配置', box: true },
    { n: 3, find: '排班选中批次', box: true }, { n: 4, find: '历史记录', box: true } ] },

  { route: '/shift-definitions', name: '36_shift_definitions', settle: 3500, anns: [
    { n: 1, find: '新增班次', box: true }, { n: 2, find: '仅启用', box: true }, { n: 3, find: '编辑', box: true, at: 'tr' } ] },

  { route: '/organization-workbench', name: '30_organization_workbench', settle: 3500, anns: [
    { n: 1, find: 'Add Employee', alt: '新增员工', box: true }, { n: 2, find: 'Import', alt: '导入' },
    { n: 3, find: 'Export', alt: '导出' } ] },
];

const STYLE = `
  .anno-badge{position:fixed;width:30px;height:30px;border-radius:50%;background:#E5392E;color:#fff;
    font:700 17px/30px 'PingFang SC','Microsoft YaHei',sans-serif;text-align:center;z-index:99999;
    box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff;}
  .anno-box{position:fixed;border:2.5px solid #E5392E;border-radius:8px;z-index:99998;
    box-shadow:0 0 0 2px rgba(229,57,46,.18);pointer-events:none;}
`;

async function locate(page, a) {
  if (a.css && a.sel) { const el = await page.$(a.sel); if (el) { try { return await el.boundingBox(); } catch (e) {} } }
  for (const t of [a.find, a.alt].filter(Boolean)) {
    const loc = page.getByText(t, { exact: false }).first();
    if (await loc.count()) { try { const bb = await loc.boundingBox(); if (bb) return bb; } catch (e) {} }
  }
  return null;
}

(async () => {
  const token = (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }) })).json()).data.token;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => { try { localStorage.setItem('auth_token', t); } catch (e) {} }, token);
  const page = await ctx.newPage();
  const only = process.argv[2]; // 可选：只跑某个 name
  for (const pg of PAGES) {
    if (only && pg.name !== only) continue;
    await page.goto(BASE + pg.route, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(pg.settle);
    if (pg.preClick) { try { await page.getByText(pg.preClick, { exact: false }).first().click({ timeout: 4000 }); } catch (e) { console.log('  preClick 失败', pg.name, e.message); } await page.waitForTimeout(pg.postWait || 2000); }
    const marks = [];
    for (const a of pg.anns) {
      const bb = await locate(page, a);
      if (!bb) { console.log(`  ! 未定位 [${pg.name}] #${a.n} ${a.find}`); continue; }
      marks.push({ n: a.n, box: a.box, at: a.at || 'tl', x: bb.x, y: bb.y, w: bb.width, h: bb.height });
    }
    await page.addStyleTag({ content: STYLE });
    await page.evaluate((list) => {
      list.forEach((m) => {
        if (m.box) { const b = document.createElement('div'); b.className = 'anno-box';
          b.style.left = (m.x - 4) + 'px'; b.style.top = (m.y - 4) + 'px'; b.style.width = (m.w + 8) + 'px'; b.style.height = (m.h + 8) + 'px'; document.body.appendChild(b); }
        const badge = document.createElement('div'); badge.className = 'anno-badge'; badge.textContent = m.n;
        let bx = m.x - 16, by = m.y - 16; if (m.at === 'tr') { bx = m.x + m.w - 14; by = m.y - 16; }
        badge.style.left = Math.max(2, bx) + 'px'; badge.style.top = Math.max(2, by) + 'px'; document.body.appendChild(badge);
      });
    }, marks);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, pg.name + '.png') });
    console.log('✓', pg.name, `(${marks.length}/${pg.anns.length} 标记)`);
  }
  await ctx.close(); await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
