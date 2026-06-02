/* 第三轮：阶段组右键"选择子项"批量选择工作流 + 干净的两条多选 */
const { chromium } = require('@playwright/test');
const path = require('path');
const BASE='http://localhost:3000', TEMPLATE_ID=7, OUT=path.join(__dirname,'audit-artifacts');
const log=(...a)=>console.log(...a);

(async()=>{
  const b=await chromium.launch({headless:true});
  const page=await(await b.newContext({viewport:{width:1440,height:900}})).newPage();
  await page.goto(`${BASE}/process-templates/${TEMPLATE_ID}`,{waitUntil:'networkidle'});
  await page.waitForSelector('canvas.wxb-gantt-canvas',{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{const el=[...document.querySelectorAll('button,[class*="segmented"] *')].find(e=>e.textContent.trim()==='操作');el&&el.click();});
  await page.waitForTimeout(1200);

  const cr=await page.evaluate(()=>{const r=document.querySelector('canvas.wxb-gantt-canvas').getBoundingClientRect();return{left:r.left,width:r.width};});
  // 找一个阶段组行（含 ▶ 切换符）的 Y
  const groupRow=await page.evaluate(()=>{
    const rows=[...document.querySelectorAll('.wxb-gantt-sidebar-row')];
    for(const r of rows){ if(r.innerText.includes('▶')){const bx=r.getBoundingClientRect();const label=r.innerText.replace(/[▶⠿]/g,'').trim().slice(0,24);
      // 跳过第一个(模板根)，取第二个组
      } }
    const groups=rows.filter(r=>r.innerText.includes('▶'));
    if(groups.length<2)return null;
    const g=groups[1]; const bx=g.getBoundingClientRect();
    return {y:bx.top+bx.height/2,label:g.innerText.replace(/[▶⠿]/g,'').trim().slice(0,24)};
  });
  log('阶段组行:',groupRow);
  if(groupRow){
    // 右键阶段组（canvas 区域内同 Y）
    await page.mouse.click(cr.left+cr.width/2, groupRow.y, {button:'right'});
    await page.waitForTimeout(700);
    const menu=await page.evaluate(()=>[...document.querySelectorAll('[class*="ctx"] *,[class*="ontext"] *,[role="menu"] *')].map(e=>e.textContent.trim()).filter(t=>t&&t.length<16));
    log('阶段组右键菜单:',[...new Set(menu)].join(' | '));
    await page.screenshot({path:path.join(OUT,'12-group-menu.png')});
    // 点"选择子项"/含"选择"的项
    const clicked=await page.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/选择子项|选择全部|全选/.test(e.textContent.trim())&&e.textContent.trim().length<10);if(el){(el.closest('[class*="item"]')||el).click();return el.textContent.trim();}return null;});
    log('点击批量选择项:',clicked);
    await page.waitForTimeout(800);
    const panel=await page.evaluate(()=>{const p=document.querySelector('.wxb-gantt-sel');if(!p)return{visible:false};return{visible:true,title:p.querySelector('.wxb-gantt-sel-title')?.innerText,shareBtn:!![...p.querySelectorAll('button')].find(x=>/创建共享组/.test(x.innerText)),btns:[...p.querySelectorAll('button')].map(x=>x.innerText.trim())};});
    log('批量选择后面板:',JSON.stringify(panel));
    await page.screenshot({path:path.join(OUT,'13-batch-selected.png')});
  }
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
