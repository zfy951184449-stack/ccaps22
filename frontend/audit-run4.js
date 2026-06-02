/* 第四轮：级联菜单项是否死键 + 阶段组拖拽是否"假成功" */
const { chromium } = require('@playwright/test');
const path=require('path');
const BASE='http://localhost:3000',TID=7,OUT=path.join(__dirname,'audit-artifacts');
const log=(...a)=>console.log(...a);
const net=[];
(async()=>{
  const b=await chromium.launch({headless:true});
  const page=await(await b.newContext({viewport:{width:1440,height:900}})).newPage();
  page.on('request',r=>{const u=r.url();if(u.includes('/api/')&&['PUT','POST','DELETE'].includes(r.method()))net.push(r.method()+' '+u.replace(BASE,''));});
  await page.goto(`${BASE}/process-templates/${TID}`,{waitUntil:'networkidle'});
  await page.waitForSelector('canvas.wxb-gantt-canvas',{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{const el=[...document.querySelectorAll('button,[class*="segmented"] *')].find(e=>e.textContent.trim()==='操作');el&&el.click();});
  await page.waitForTimeout(1200);
  const cr=await page.evaluate(()=>{const r=document.querySelector('canvas.wxb-gantt-canvas').getBoundingClientRect();return{left:r.left,top:r.top,width:r.width};});
  const cursor=()=>page.evaluate(()=>document.querySelector('canvas.wxb-gantt-canvas')?.style.cursor||'');
  const groupRow=await page.evaluate(()=>{const rows=[...document.querySelectorAll('.wxb-gantt-sidebar-row')].filter(r=>r.innerText.includes('▶'));if(rows.length<2)return null;const g=rows[1],bx=g.getBoundingClientRect();return{y:bx.top+bx.height/2,label:g.innerText.replace(/[▶⠿]/g,'').trim().slice(0,24)};});
  log('阶段组:',groupRow);

  // A) 级联延后排程 菜单点击
  await page.mouse.click(cr.left+cr.width/2,groupRow.y,{button:'right'});
  await page.waitForTimeout(600);
  let n0=net.length;
  const clicked=await page.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.trim()==='级联延后排程');if(el){(el.closest('[class*="item"]')||el).click();return true;}return false;});
  await page.waitForTimeout(1200);
  log('点击"级联延后排程":',clicked,'→ 请求:',JSON.stringify(net.slice(n0)),'(空=死键)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // B) 拖拽阶段组条：沿组行 Y 找 cursor='grab'（组条命中）的位置
  let grabX=null;
  for(let x=cr.left+12;x<cr.left+cr.width-12;x+=10){await page.mouse.move(x,groupRow.y);const c=await cursor();if(c==='grab'){grabX=x;break;}}
  log('组条命中(cursor=grab) X:',grabX);
  if(grabX){
    n0=net.length;
    await page.mouse.move(grabX,groupRow.y);
    await page.mouse.down();
    for(let i=1;i<=10;i++){await page.mouse.move(grabX+i*12,groupRow.y);await page.waitForTimeout(25);}
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const toast=await page.evaluate(()=>{const t=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/已移动.*个任务/.test(e.textContent));return t?t.textContent.trim().slice(0,60):null;});
    log('阶段组拖拽 → 请求:',JSON.stringify(net.slice(n0)),'| 弹出"已移动"toast:',toast);
    await page.screenshot({path:path.join(OUT,'14-group-drag.png')});
  } else {
    log('未命中可拖拽组条（cursor 未出现 grab）');
  }
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
