/* 第二轮：缩放、多选累加、批量绑定失效证据、时间窗口、约束、自动排程 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:3000';
const TEMPLATE_ID = 7;
const OUT = path.join(__dirname, 'audit-artifacts');
const log = (...a) => console.log(...a);
const net = [];
const out = {};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('request', r => { const u=r.url(); if (u.includes('/api/') && ['PUT','POST','DELETE'].includes(r.method())) net.push(r.method()+' '+u.replace(BASE,'')); });

  await page.goto(`${BASE}/process-templates/${TEMPLATE_ID}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas.wxb-gantt-canvas', { timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(1500);
  // 切操作模式
  await page.evaluate(() => { const el=[...document.querySelectorAll('button,[class*="segmented"] *')].find(e=>e.textContent.trim()==='操作'); el&&el.click(); });
  await page.waitForTimeout(1200);

  const cr = await page.evaluate(() => { const r=document.querySelector('canvas.wxb-gantt-canvas').getBoundingClientRect(); return {left:r.left,top:r.top,width:r.width,height:r.height}; });
  const readCursor = () => page.evaluate(() => document.querySelector('canvas.wxb-gantt-canvas')?.style.cursor||'');
  const rowYs = await page.evaluate(() => [...document.querySelectorAll('.wxb-gantt-sidebar-row')].map(r=>{const b=r.getBoundingClientRect();return {y:b.top+b.height/2,label:r.innerText.trim().slice(0,24)};}));
  async function findBar(y){const sx=cr.left+12,ex=cr.left+cr.width-12;for(let x=sx;x<ex;x+=12){await page.mouse.move(x,y);const c=await readCursor();if(c==='move')return {midX:x+8,cursor:c};}return null;}

  // ---- 1. 缩放（带等待）----
  log('\n== 缩放 ==');
  const z0 = await page.evaluate(()=>document.querySelector('.wxb-gantt-toolbar-label')?.innerText);
  await page.evaluate(()=>{const b=[...document.querySelectorAll('.wxb-gantt-toolbar-btn')].find(x=>x.title==='放大');b&&b.click();});
  await page.waitForTimeout(400);
  await page.evaluate(()=>{const b=[...document.querySelectorAll('.wxb-gantt-toolbar-btn')].find(x=>x.title==='放大');b&&b.click();});
  await page.waitForTimeout(600);
  const z1 = await page.evaluate(()=>document.querySelector('.wxb-gantt-toolbar-label')?.innerText);
  out.zoom = { before:z0, afterPlus:z1, works: z0!==z1 };
  log('缩放:', z0, '→', z1, '| 生效:', z0!==z1);

  // ---- 2. 多选累加 ----
  log('\n== 多选累加 ==');
  let sel = 0; const labels=[];
  for (const row of rowYs) {
    if (sel>=2) break;
    const bar = await findBar(row.y);
    if (bar) {
      await page.keyboard.down('Control');
      await page.mouse.click(bar.midX, row.y);
      await page.keyboard.up('Control');
      await page.waitForTimeout(300);
      const cnt = await page.evaluate(()=>{const t=document.querySelector('.wxb-gantt-sel-title');return t?t.innerText:'';});
      if (/已选中/.test(cnt)) { labels.push(row.label); sel = parseInt(cnt.replace(/\D/g,''))||sel; }
    }
  }
  const panel2 = await page.evaluate(()=>{const p=document.querySelector('.wxb-gantt-sel');if(!p)return{visible:false};return{visible:true,title:p.querySelector('.wxb-gantt-sel-title')?.innerText,shareBtn:!![...p.querySelectorAll('button')].find(b=>/创建共享组/.test(b.innerText))};});
  out.multiSelect = { reached: sel, labels, panel: panel2 };
  log('多选数量:', sel, '| 共享组按钮:', panel2.shareBtn);
  await page.screenshot({path:path.join(OUT,'09-multiselect.png')});

  // ---- 3. data-selected-task-id 是否存在（批量绑定依赖）----
  const dsti = await page.evaluate(()=>document.querySelectorAll('[data-selected-task-id]').length);
  out.dataSelectedTaskIdCount = dsti;
  log('\n== 批量绑定依赖 [data-selected-task-id] 元素数:', dsti, '(0 => 批量绑定下拉必然失效)');

  // ---- 4. 时间窗口开关 ----
  log('\n== 时间窗口开关 ==');
  await page.evaluate(()=>{const s=[...document.querySelectorAll('button,[role="switch"],[class*="switch"]')];const sw=s.find(e=>e.getAttribute('role')==='switch'||/switch/i.test(e.className));sw&&sw.click();});
  await page.waitForTimeout(1000);
  await page.screenshot({path:path.join(OUT,'10-timewindow-on.png')});
  log('已截图时间窗口开启态');

  // ---- 5. 自动排程 ----
  log('\n== 自动排程 ==');
  const beforeNet = net.length;
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/自动排程/.test(x.innerText));b&&b.click();});
  await page.waitForTimeout(2500);
  out.autoSchedule = net.slice(beforeNet);
  log('自动排程触发请求:', JSON.stringify(out.autoSchedule));
  await page.screenshot({path:path.join(OUT,'11-autoschedule.png')});

  out.allNet = net;
  fs.writeFileSync(path.join(OUT,'findings2.json'), JSON.stringify(out,null,2));
  log('\n✅ 完成');
  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
