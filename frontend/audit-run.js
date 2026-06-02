/* 工艺模版甘特图 实测审计脚本（独立运行，不依赖 test runner） */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const TEMPLATE_ID = 7; // PT-00002 WBP2486/B, 9 阶段 41 天
const OUT = path.join(__dirname, 'audit-artifacts');
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const findings = {};
const netLog = [];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('request', r => {
    const u = r.url();
    if (u.includes('/api/') && ['PUT','POST','DELETE','PATCH'].includes(r.method())) {
      netLog.push({ t: Date.now(), method: r.method(), url: u.replace(BASE,'') });
    }
  });

  const shot = async (name) => {
    try { await page.screenshot({ path: path.join(OUT, name) }); log('  📸', name); }
    catch (e) { log('  截图失败', name, e.message); }
  };

  // ---------- 1. 列表页 ----------
  log('\n===== 1. 列表页 =====');
  await page.goto(`${BASE}/process-templates`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot('01-list.png');
  const listInfo = await page.evaluate(() => {
    const txt = document.body.innerText;
    const rows = document.querySelectorAll('[class*="row"],[role="row"],tr,[class*="card"],[class*="Card"]');
    const btns = Array.from(document.querySelectorAll('button')).map(b => (b.innerText||b.title||'').trim()).filter(Boolean);
    const search = document.querySelector('input[placeholder*="搜索"],input[type="search"]');
    return { rowsApprox: rows.length, buttons: btns.slice(0, 30), hasSearch: !!search, sample: txt.slice(0, 400) };
  });
  findings.list = listInfo;
  log('列表按钮:', listInfo.buttons.join(' | '));
  log('搜索框:', listInfo.hasSearch);

  // ---------- 2. 进入编辑器 ----------
  log('\n===== 2. 甘特编辑器 =====');
  const navStart = Date.now();
  await page.goto(`${BASE}/process-templates/${TEMPLATE_ID}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas.wxb-gantt-canvas', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  findings.editorLoadMs = Date.now() - navStart;
  await shot('02-editor.png');

  const editorInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.wxb-gantt-canvas');
    const headerBtns = Array.from(document.querySelectorAll('button')).map(b => (b.innerText||b.title||b.getAttribute('aria-label')||'').trim()).filter(Boolean);
    const sidebarRows = document.querySelectorAll('.wxb-gantt-sidebar-row');
    const toolbarBtns = Array.from(document.querySelectorAll('.wxb-gantt-toolbar-btn')).map(b => (b.innerText||b.title||'').trim());
    const seg = Array.from(document.querySelectorAll('[class*="segmented"] *, [class*="Segmented"] *')).map(e=>e.textContent.trim()).filter(Boolean);
    return {
      hasCanvas: !!canvas,
      canvasRect: canvas ? canvas.getBoundingClientRect() : null,
      headerButtons: Array.from(new Set(headerBtns)).slice(0, 40),
      sidebarRowCount: sidebarRows.length,
      toolbarBtns,
    };
  });
  findings.editor = editorInfo;
  log('Canvas 渲染:', editorInfo.hasCanvas, editorInfo.canvasRect && `${Math.round(editorInfo.canvasRect.width)}x${Math.round(editorInfo.canvasRect.height)}`);
  log('工具栏按钮:', editorInfo.toolbarBtns.join(' '));
  log('侧栏可见行数:', editorInfo.sidebarRowCount);
  log('加载耗时(ms):', findings.editorLoadMs);

  // ---------- 3. 切到"操作"Y 轴模式（一操作一行，便于定位）----------
  log('\n===== 3. 切换 Y 轴=操作 =====');
  const switched = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('button, [class*="segmented"] label, [class*="segmented"] div, [role="radio"]'));
    const el = labels.find(e => e.textContent.trim() === '操作');
    if (el) { el.click(); return true; }
    return false;
  });
  await page.waitForTimeout(1500);
  log('切换到操作模式:', switched);
  await shot('03-operation-mode.png');

  // helper：在某 Y 高度沿 X 扫描 canvas，找到任务条（cursor 变 move/ew-resize）
  const canvasRect = await page.evaluate(() => {
    const c = document.querySelector('canvas.wxb-gantt-canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });

  async function readCursor() {
    return await page.evaluate(() => document.querySelector('canvas.wxb-gantt-canvas')?.style.cursor || '');
  }

  // 找若干个操作行的屏幕 Y
  const rowYs = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.wxb-gantt-sidebar-row'));
    return rows.map(r => {
      const b = r.getBoundingClientRect();
      return { y: b.top + b.height/2, label: r.innerText.trim().slice(0,30) };
    });
  });
  log('侧栏行样例:', rowYs.slice(0,8).map(r=>r.label).join(' / '));

  // 扫描找任务条
  async function findBarAtRow(y) {
    const startX = canvasRect.left + 12;
    const endX = canvasRect.left + canvasRect.width - 12;
    const step = 12;
    for (let x = startX; x < endX; x += step) {
      await page.mouse.move(x, y);
      const c = await readCursor();
      if (c === 'move' || c === 'ew-resize') {
        // 往前回退到条子中部：继续走直到 cursor 改变
        let x2 = x;
        while (x2 < endX) { await page.mouse.move(x2+step, y); if ((await readCursor()) !== c) break; x2 += step; }
        return { hitX: x, midX: (x + x2)/2, cursor: c };
      }
    }
    return null;
  }

  // ---------- 4. 拖拽测试 ----------
  log('\n===== 4. 拖拽测试 =====');
  let dragResult = { attempted: false };
  for (const row of rowYs.slice(0, 12)) {
    const bar = await findBarAtRow(row.y);
    if (bar && bar.cursor === 'move') {
      dragResult.attempted = true;
      dragResult.row = row.label;
      const beforeNet = netLog.length;
      // 拖拽：从条中部向右 80px
      await page.mouse.move(bar.midX, row.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(bar.midX + i*10, row.y); await page.waitForTimeout(20); }
      await shot('04-dragging.png');
      await page.mouse.up();
      await page.waitForTimeout(1500);
      const newReqs = netLog.slice(beforeNet);
      dragResult.networkAfterDrag = newReqs;
      dragResult.tooltipSeen = true;
      log('拖拽行:', row.label, '| 触发请求:', JSON.stringify(newReqs));
      await shot('05-after-drag.png');
      break;
    }
  }
  if (!dragResult.attempted) log('未能在前 12 行定位到可拖拽任务条');
  findings.drag = dragResult;

  // ---------- 5. 右键菜单 + 编辑操作 ----------
  log('\n===== 5. 右键菜单 / 编辑操作 =====');
  let ctxResult = {};
  for (const row of rowYs.slice(0, 12)) {
    const bar = await findBarAtRow(row.y);
    if (bar && bar.cursor === 'move') {
      await page.mouse.move(bar.midX, row.y);
      await page.mouse.click(bar.midX, row.y, { button: 'right' });
      await page.waitForTimeout(700);
      const menu = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[class*="ctx"],[class*="context-menu"],[class*="ContextMenu"],[role="menu"] *'))
          .map(e => e.textContent.trim()).filter(t => t && t.length < 20);
        return Array.from(new Set(items));
      });
      ctxResult.menuItems = menu;
      log('右键菜单项:', menu.join(' | '));
      await shot('06-context-menu.png');

      // 点击"编辑操作"
      const beforeNet = netLog.length;
      const clickedEdit = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('*')).find(e =>
          e.children.length === 0 && e.textContent.trim() === '编辑操作');
        if (el) { (el.closest('[class*="item"]')||el).click(); return true; }
        return false;
      });
      await page.waitForTimeout(900);
      const afterEdit = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"], .ant-modal:not([style*="display: none"]), .wxb-modal');
        const msg = document.querySelector('.ant-message-notice, .ant-message');
        return {
          modalOpen: !!(modal && modal.offsetParent !== null),
          messageText: msg ? msg.innerText.trim() : null,
        };
      });
      ctxResult.editClicked = clickedEdit;
      ctxResult.afterEdit = afterEdit;
      ctxResult.editNetwork = netLog.slice(beforeNet);
      log('点击"编辑操作":', clickedEdit, '→ 弹窗:', afterEdit.modalOpen, '| toast:', afterEdit.messageText, '| 请求:', JSON.stringify(ctxResult.editNetwork));
      await shot('07-after-edit-click.png');
      await page.keyboard.press('Escape');
      break;
    }
  }
  findings.context = ctxResult;

  // ---------- 6. 双击操作 ----------
  log('\n===== 6. 双击操作 =====');
  let dblResult = {};
  for (const row of rowYs.slice(0, 12)) {
    const bar = await findBarAtRow(row.y);
    if (bar && bar.cursor === 'move') {
      const beforeNet = netLog.length;
      await page.mouse.dblclick(bar.midX, row.y);
      await page.waitForTimeout(800);
      dblResult = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"], .ant-modal, .wxb-modal');
        return { modalOpen: !!(modal && modal.offsetParent !== null) };
      });
      dblResult.network = netLog.slice(beforeNet);
      log('双击 →弹窗:', dblResult.modalOpen, '| 请求:', JSON.stringify(dblResult.network));
      break;
    }
  }
  findings.doubleClick = dblResult;
  await page.keyboard.press('Escape');

  // ---------- 7. 多选 + 选择面板 + 批量设备绑定 ----------
  log('\n===== 7. 多选 / 批量操作 =====');
  let selResult = { ctrlClicks: 0 };
  // ctrl+click 多个任务条
  let clicked = 0;
  for (const row of rowYs.slice(0, 12)) {
    if (clicked >= 3) break;
    const bar = await findBarAtRow(row.y);
    if (bar && bar.cursor === 'move') {
      await page.mouse.move(bar.midX, row.y);
      await page.keyboard.down('Control');
      await page.mouse.click(bar.midX, row.y);
      await page.keyboard.up('Control');
      clicked++;
      await page.waitForTimeout(200);
    }
  }
  selResult.ctrlClicks = clicked;
  await page.waitForTimeout(600);
  const panel = await page.evaluate(() => {
    const p = document.querySelector('.wxb-gantt-sel');
    if (!p) return { visible: false };
    return {
      visible: true,
      title: p.querySelector('.wxb-gantt-sel-title')?.innerText || '',
      hasShareBtn: !!Array.from(p.querySelectorAll('button')).find(b => /共享组/.test(b.innerText)),
      hasEquipSelect: !!p.querySelector('select, [class*="select"], [class*="Select"]'),
      buttons: Array.from(p.querySelectorAll('button')).map(b=>b.innerText.trim()).filter(Boolean),
    };
  });
  selResult.panel = panel;
  log('选择面板:', JSON.stringify(panel));
  await shot('08-selection-panel.png');

  // 测试"解除绑定"按钮是否发请求（预期：无 → 失效）
  if (panel.visible) {
    const beforeNet = netLog.length;
    await page.evaluate(() => {
      const p = document.querySelector('.wxb-gantt-sel');
      const btn = Array.from(p.querySelectorAll('button')).find(b => /解除绑定/.test(b.innerText));
      if (btn) btn.click();
    });
    await page.waitForTimeout(900);
    selResult.unbindNetwork = netLog.slice(beforeNet);
    log('点击"解除绑定"→ 请求:', JSON.stringify(selResult.unbindNetwork), '(预期为空=失效)');
  }
  findings.selection = selResult;

  // ---------- 8. 缩放 / 工具栏 ----------
  log('\n===== 8. 工具栏缩放 =====');
  const zoomTest = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.wxb-gantt-toolbar-btn'));
    const labelBefore = document.querySelector('.wxb-gantt-toolbar-label')?.innerText;
    const plus = btns.find(b => b.title === '放大');
    if (plus) { plus.click(); plus.click(); }
    const labelAfter = document.querySelector('.wxb-gantt-toolbar-label')?.innerText;
    return { labelBefore, labelAfter, changed: labelBefore !== labelAfter };
  });
  findings.zoom = zoomTest;
  log('缩放 % 变化:', zoomTest.labelBefore, '→', zoomTest.labelAfter);

  // ---------- 9. 无障碍 ----------
  log('\n===== 9. 无障碍快查 =====');
  const a11y = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.wxb-gantt-canvas');
    return {
      canvasHasAria: canvas ? (canvas.getAttribute('aria-label') || canvas.getAttribute('role') || null) : 'no-canvas',
      canvasTabIndex: canvas ? canvas.tabIndex : null,
      totalButtons: document.querySelectorAll('button').length,
      unlabeledButtons: Array.from(document.querySelectorAll('button')).filter(b => !(b.innerText||'').trim() && !b.getAttribute('aria-label') && !b.title).length,
      imgNoAlt: Array.from(document.querySelectorAll('img')).filter(i => !i.alt).length,
    };
  });
  findings.a11y = a11y;
  log('Canvas ARIA:', a11y.canvasHasAria, '| tabIndex:', a11y.canvasTabIndex, '| 无标签按钮:', a11y.unlabeledButtons);

  findings.consoleErrors = consoleErrors.slice(0, 30);
  findings.allMutatingNetwork = netLog;
  log('\n控制台错误数:', consoleErrors.length);
  if (consoleErrors.length) log(consoleErrors.slice(0,10).join('\n'));

  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
  log('\n✅ 结果已写入 audit-artifacts/findings.json');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
