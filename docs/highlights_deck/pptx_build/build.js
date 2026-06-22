// 生成「生产排产·排班系统 — 项目亮点」PPTX（16:9，嵌真实系统截图）
// pptxgenjs 复用 training_ppt_build 的安装；中文走原生文本框。
const path = require('path');
const PPTX = require('/Users/zhengfengyi/MFG8APS/training_ppt_build/node_modules/pptxgenjs');

const DECK_DIR = '/Users/zhengfengyi/MFG8APS/docs/highlights_deck';
const ASSET = (f) => path.join(DECK_DIR, 'assets', f);
const OUT = path.join(DECK_DIR, 'highlights.pptx');

// ---- 调色板（无 # 前缀）----
const C = {
  navy900:'0B2E4F', navy800:'0E3B63', blue600:'1F6FB2', blue500:'2B86D9',
  teal600:'12A8A0', teal500:'16B5AE', green:'2E9E6B',
  foilText:'8A6D3B', foilDeep:'6E5C3E', foilBg:'FBF7EF', foilBorder:'E8DCC4',
  mist:'F4F8FC', paper:'FFFFFF', ink:'14242E', ink2:'5C6B76', ink3:'8A98A2',
  line:'E3ECF4', selfBg:'F2FAFD', selfBorder:'BFE0F1',
};
const CN = 'Microsoft YaHei';
const NUMF = 'Arial';
const shadow = () => ({ type:'outer', color:'0B2E4F', blur:9, offset:3, angle:135, opacity:0.16 });
const softShadow = () => ({ type:'outer', color:'0B2E4F', blur:6, offset:2, angle:135, opacity:0.10 });

// ---- 内容数据（8 个亮点）----
const HL = [
  { n:1, title:'一线自研的敏捷开发',
    subtitle:'开发的人就是一线，借助 AI 辅助自己实现，需求不用外传，改起来也快。',
    foilName:'交给公司开发团队', selfName:'一线自研（AI 辅助）',
    dims:[ {label:'需求准确度', foil:'隔着开发团队转一手，常常理解有偏差', self:'提需求的人就是写代码的人，不会传歪'},
           {label:'迭代速度', foil:'要排期、反复确认，等得久', self:'想到一个改一个，当天就能改'} ],
    conclusion:'最懂业务的人自己开发，需求不失真、改得快，做出来正是一线要的东西。',
    kpis:[ {num:'0', suffix:'次', label:'需求转手（开发即用户）'}, {text:'AI + 一线', label:'独立完成开发'} ],
    tech:['前端基于 React + wxb-ui 设计系统', '一线自迭代，AI 辅助开发'],
    shot:'02_operations_overview.png', route:'运营总览 · /operations-overview', caption:'系统截图：运营总览看板' },

  { n:2, title:'排产模板化，绕开自动排产',
    subtitle:'商业化工艺常年不变，把人员需求和任务分布写进模板、按批次套用，不自研排产算法。',
    foilName:'自动排产', selfName:'模板化排产',
    dims:[ {label:'适用场景', foil:'项目多、工艺老变才需要，比如中试、临床', self:'商业化工艺常年不变，模板配一次能用很久'},
           {label:'开发难度', foil:'要自研一套排程算法，难', self:'配好模板套用就行，不用写算法'} ],
    conclusion:'商业化场景下排产用模板就够，工程投入集中到排班；开发难度降下来，效果不受影响。',
    kpis:[ {num:'0', suffix:'套', label:'自研排产求解器（模板替代）'}, {text:'模板复用', label:'配一次，长期套用'} ],
    tech:['人员需求 / 任务分布写进工艺模板', '按批次套用，工程投入集中到排班'],
    shot:'23_template_editor.png', route:'工艺模板编辑 · /process-templates', caption:'系统截图：工艺模板编辑器' },

  { n:3, title:'排班覆盖全工艺流',
    subtitle:'一套系统把 media、buffer、上游、下游的人和任务排在一起，不用各部门各排一套。',
    foilName:'现有做法', selfName:'本项目',
    dims:[ {label:'覆盖范围', foil:'已有系统只排上游，其余靠 Excel', self:'media、buffer、上游、下游都能排'},
           {label:'跨部门衔接', foil:'一个环节拖了，后面常常才发现', self:'各环节的先后时间，排班时一起算'} ],
    conclusion:'整条工艺流的人和任务排在一套系统里，上下游、配液之间怎么衔接，排班时一起算。',
    kpis:[ {num:'4', suffix:'段', label:'覆盖工艺环节'}, {text:'仅 1 段', label:'已有系统只覆盖上游'} ],
    tech:['DataAssembler 合并 media/buffer/上游/下游', '对照：公司已有系统只覆盖上游'],
    shot:'24_batch_gantt.png', route:'生产计划甘特 · /batch-gantt', caption:'系统截图：生产计划甘特（覆盖全工艺流）' },

  { n:4, title:'工艺和独立任务一起排',
    subtitle:'排班不只排工艺操作，值班、取样、培训这类独立任务也一起排进去。',
    foilName:'现有做法', selfName:'本项目',
    dims:[ {label:'排哪些活', foil:'只排工艺操作，独立任务另行处理', self:'工艺操作和独立任务排进同一张班表'},
           {label:'人手怎么算', foil:'独立任务另排，可能和工艺抢同一个人', self:'一起排，同一个人不会被排两份'} ],
    conclusion:'工艺操作和独立任务已经在同一次排班里一起排；下一步把计划性维护也纳进来。',
    kpis:[ {num:'1', suffix:'张', label:'统一排班 · 工艺＋独立任务'}, {text:'下一步', label:'纳入计划性维护'} ],
    tech:['standalone_tasks 并入同一次 solve', 'source_type=STANDALONE，独立标签区分'],
    shot:'35_solver_v5.png', route:'排班结果 · /solver-v5', caption:'系统截图：排班结果（含独立任务）' },

  { n:5, title:'排班按资质等级',
    subtitle:'不只看有没有资质，还看等级够不够；每个位置单独定等级，不达标的直接排除。',
    foilName:'现有做法', selfName:'本项目',
    dims:[ {label:'怎么判定资质', foil:'只看有没有这个资质，不分等级高低', self:'看等级够不够，每个位置单独定'},
           {label:'关键位置与新人', foil:'不分等级，不熟练的人可能上关键操作', self:'关键位置要够等级，非关键位置可带新人'} ],
    conclusion:'关键操作交给够等级的人，不熟练的排不进去；非关键位置可以安排新人参与、跟着上手。',
    kpis:[ {num:'0', suffix:'人', label:'不达标员工上岗（硬卡）'}, {text:'1–5 级', label:'按资质等级匹配，而非有无'} ],
    tech:['按位置定 required_level（1–5 级）', '不达标进求解器前即被过滤'],
    shot:'12_qualification_matrix.png', route:'资质矩阵 · /qualification-matrix', caption:'系统截图：资质矩阵' },

  { n:6, title:'请假一键换人',
    subtitle:'有人请假，系统先列出受影响的班，再按条件挑出合适的人，一键换上。',
    foilName:'现有做法', selfName:'本项目',
    dims:[ {label:'影响范围', foil:'手工改，连带受影响的班容易漏看', self:'先列出受影响的班，改之前就看到'},
           {label:'换谁顶班', foil:'凭经验找，可能换上资质不够的人', self:'系统按条件筛，确保合适，一键换上'} ],
    conclusion:'手工改容易引起连锁问题；系统先让你看清受影响的范围，再按条件用合适的人一键替换。',
    kpis:[ {text:'一键', label:'请假替换 · 先看影响范围'}, {text:'只动受影响', label:'其余班次保持不变'} ],
    tech:['预览先算受影响的班和空缺（影响范围）', '候选按 同组·资质·可用·不冲突 筛选'],
    shot:'33_roster_exceptions.png', route:'异常排班快速修复 · /roster-exceptions', caption:'系统截图：异常排班快速修复' },

  { n:7, title:'求解速度快',
    subtitle:'一个月的排班，复杂的 5 分钟内得到接近最优的解，简单的 1 秒出结果。',
    foilName:'手工排班', selfName:'本项目',
    dims:[ {label:'出解速度', foil:'一个月的班要排好几天，耗时费力', self:'复杂排班 5 分钟，简单 1 秒'},
           {label:'离最优多近', foil:'凭经验，不知道离最优差多少', self:'算出 1% 差距，知道有多接近最优'} ],
    conclusion:'系统不仅快，还能算出离最优差多少；复杂排班 5 分钟压到 1% 以内，简单的 1 秒出解。',
    kpis:[ {num:'5', suffix:'分钟', label:'一个月排班，接近最优'}, {num:'1', suffix:'秒', label:'简单情况出结果'}, {text:'≤1%', label:'离理论最优的差距'} ],
    tech:['OR-Tools CP-SAT，多线程求解', 'gap = 与理论下限的差距'],
    shot:'34_solver_v4.png', route:'求解器 · /solver-v4', caption:'系统截图：求解器运行' },

  { n:8, title:'省排班员的工时',
    subtitle:'排班交给求解器算，排班员不用再花几天手工排，结果还比人工更优。',
    foilName:'手工排班', selfName:'本项目',
    dims:[ {label:'排班员投入', foil:'一格格手工排，几天才排完', self:'求解器自动算，只需微调确认'},
           {label:'排班质量', foil:'受人脑限制，难顾全所有约束', self:'求解器统筹所有约束，比人工更优'} ],
    conclusion:'排班从手工排几天变成求解器自动算、人只微调；省了排班员的工时，结果也比人工更优。',
    kpis:[ {text:'数天 → 分钟', label:'排班员排班耗时（精确值待补）'}, {text:'优于人工', label:'统筹全部约束求最优'} ],
    tech:['求解器自动产出整月排班', '排班员从手工排几天 → 只需微调确认'],
    shot:'24_batch_gantt.png', route:'批次甘特 · /batch-gantt', caption:'系统截图：求解器产出的整月排班甘特' },
];

const pres = new PPTX();
pres.defineLayout({ name:'W', width:13.333, height:7.5 });
pres.layout = 'W';
pres.author = 'MFG8 APS';
pres.title = '生产排产·排班系统 — 项目亮点';
const W = 13.333, H = 7.5;

// ============ 封面 ============
(function cover(){
  const s = pres.addSlide();
  s.background = { color: C.navy900 };
  // 细分子链点缀（极简）
  s.addShape(pres.shapes.LINE, { x:0, y:1.2, w:W, h:0, line:{ color:C.blue500, width:0.75, transparency:80 } });
  s.addShape(pres.shapes.LINE, { x:0, y:6.4, w:W, h:0, line:{ color:C.teal500, width:0.75, transparency:80 } });
  // logo 白底 chip
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:0.9, y:0.75, w:2.5, h:0.78, rectRadius:0.08, fill:{ color:'FFFFFF' }, line:{ type:'none' }, shadow:softShadow() });
  s.addImage({ path: ASSET('wuxibio-logo.png'), x:1.06, y:0.92, w:2.18, h:0.44, sizing:{ type:'contain', w:2.18, h:0.44 } });
  // 标题
  s.addText([
    { text:'生产排产', options:{ color:'FFFFFF', bold:true } },
    { text:' · ', options:{ color:C.teal500, bold:true } },
    { text:'排班系统', options:{ color:C.teal500, bold:true } },
  ], { x:0.9, y:2.45, w:11.5, h:1.4, fontFace:CN, fontSize:54, align:'left', valign:'middle', margin:0 });
  s.addText('项目亮点 · 八项', { x:0.92, y:3.95, w:11, h:0.7, fontFace:CN, fontSize:24, color:'CADCFC', align:'left', margin:0 });
  // tagline 徽标
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:0.92, y:4.85, w:3.5, h:0.5, rectRadius:0.25, fill:{ color:C.teal600, transparency:82 }, line:{ color:C.teal500, width:1 } });
  s.addText('生产一线自研 · AI 辅助', { x:0.92, y:4.85, w:3.5, h:0.5, fontFace:CN, fontSize:13, color:'EAF7F6', align:'center', valign:'middle', margin:0 });
  // 三个统计
  const stats = [['8','项核心亮点'],['全工艺流','media·buffer·上游·下游'],['一线 + AI','自研敏捷迭代']];
  let sx = 0.92;
  stats.forEach((st,i)=>{
    s.addText(st[0], { x:sx, y:5.75, w:3.4, h:0.55, fontFace:CN, fontSize:22, bold:true, color:'FFFFFF', align:'left', margin:0 });
    s.addText(st[1], { x:sx, y:6.32, w:3.6, h:0.4, fontFace:CN, fontSize:12, color:'AEC0D8', align:'left', margin:0 });
    sx += (i===0 ? 2.3 : 4.4);
  });
  s.addText('← →  翻页放映 · 共 8 项亮点', { x:0.92, y:6.95, w:11.5, h:0.35, fontFace:CN, fontSize:11, color:'7E92B0', align:'left', margin:0 });
})();

// ============ 内容页 ============
function contentSlide(hl){
  const s = pres.addSlide();
  s.background = { color: (hl.n % 2 === 0) ? C.mist : C.paper };

  // 顶部：kicker + 标题
  s.addText('亮点 0'+hl.n, { x:0.62, y:0.42, w:4, h:0.32, fontFace:NUMF, fontSize:13, bold:true, color:C.blue600, charSpacing:2, align:'left', margin:0 });
  s.addText(hl.title, { x:0.6, y:0.78, w:9.5, h:0.7, fontFace:CN, fontSize:30, bold:true, color:C.navy900, align:'left', margin:0 });
  s.addText(hl.subtitle, { x:0.62, y:1.52, w:11.2, h:0.5, fontFace:CN, fontSize:12.5, color:C.ink2, align:'left', margin:0 });
  // 页码
  s.addText([{ text:'0'+hl.n, options:{ color:C.navy800, bold:true } }, { text:' / 08', options:{ color:C.ink3 } }],
    { x:11.4, y:0.45, w:1.4, h:0.4, fontFace:NUMF, fontSize:14, align:'right', margin:0 });

  // ---- 左栏 KPI ----
  const kpis = hl.kpis;
  const kn = kpis.length;
  const kpiY = 2.45, kpiH = 1.15, gap = 0.16, totalW = 5.9;
  const cw = (totalW - gap*(kn-1)) / kn;
  kpis.forEach((k,i)=>{
    const kx = 0.62 + i*(cw+gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:kx, y:kpiY, w:cw, h:kpiH, rectRadius:0.07, fill:{ color:'FFFFFF' }, line:{ color:C.line, width:1 }, shadow:softShadow() });
    if(k.num !== undefined){
      s.addText([
        { text:k.num, options:{ fontFace:NUMF, fontSize:(kn===3?30:36), bold:true, color:C.navy800 } },
        { text:' '+k.suffix, options:{ fontFace:CN, fontSize:13, color:C.teal600 } },
      ], { x:kx+0.05, y:kpiY+0.1, w:cw-0.1, h:0.62, align:'left', valign:'middle', margin:4 });
    } else {
      s.addText(k.text, { x:kx+0.05, y:kpiY+0.1, w:cw-0.1, h:0.62, fontFace:CN, fontSize:(kn===3?17:20), bold:true, color:C.navy800, align:'left', valign:'middle', margin:4 });
    }
    s.addText(k.label, { x:kx+0.06, y:kpiY+0.72, w:cw-0.12, h:0.38, fontFace:CN, fontSize:9, color:C.ink2, align:'left', valign:'top', margin:2 });
  });

  // ---- 左栏 现状 vs 本项目 ----
  const compY = 3.95, compH = 2.05, colW = 2.87, colGap = 0.16;
  function compCol(x, name, badge, isSelf){
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y:compY, w:colW, h:compH, rectRadius:0.07,
      fill:{ color: isSelf?C.selfBg:C.foilBg }, line:{ color: isSelf?C.selfBorder:C.foilBorder, width: isSelf?1.5:1 }, shadow:softShadow() });
    s.addShape(pres.shapes.OVAL, { x:x+0.18, y:compY+0.22, w:0.12, h:0.12, fill:{ color: isSelf?C.teal500:'C8A86A' }, line:{ type:'none' } });
    s.addText(name, { x:x+0.38, y:compY+0.12, w:colW-0.5, h:0.32, fontFace:CN, fontSize:11.5, bold:true, color: isSelf?C.blue600:C.foilText, align:'left', valign:'middle', margin:0 });
    s.addText(badge, { x:x+colW-0.92, y:compY+0.14, w:0.8, h:0.26, fontFace:CN, fontSize:8.5, color: isSelf?C.teal600:C.foilText, align:'right', valign:'middle', margin:0 });
    let dy = compY + 0.54;
    hl.dims.forEach((d)=>{
      s.addText(d.label, { x:x+0.2, y:dy, w:colW-0.36, h:0.22, fontFace:CN, fontSize:8.5, bold:true, color:C.ink3, align:'left', margin:0 });
      s.addText(isSelf?d.self:d.foil, { x:x+0.2, y:dy+0.21, w:colW-0.36, h:0.48, fontFace:CN, fontSize:9.5, color: isSelf?C.ink:C.foilDeep, align:'left', valign:'top', margin:0, lineSpacingMultiple:1.0 });
      dy += 0.73;
    });
  }
  compCol(0.62, hl.foilName, '现状', false);
  compCol(0.62+colW+colGap, hl.selfName, '本项目', true);

  // ---- 左栏 结论条 ----
  const conY = 6.18, conH = 0.78;
  s.addShape(pres.shapes.RECTANGLE, { x:0.62, y:conY, w:5.9, h:conH, fill:{ color:'EAF6F5' }, line:{ type:'none' } });
  s.addShape(pres.shapes.RECTANGLE, { x:0.62, y:conY, w:0.07, h:conH, fill:{ color:C.teal600 }, line:{ type:'none' } });
  s.addText([
    { text:'结论  ', options:{ fontFace:CN, fontSize:9, bold:true, color:C.teal600 } },
    { text:hl.conclusion, options:{ fontFace:CN, fontSize:9.5, color:C.ink } },
  ], { x:0.82, y:conY+0.06, w:5.6, h:conH-0.12, align:'left', valign:'middle', margin:2, lineSpacingMultiple:1.0 });

  // ---- 右栏 浏览器外框 + 截图 ----
  const fx=6.78, fy=2.4, fw=5.95, fh=3.2, bar=0.34;
  s.addShape(pres.shapes.RECTANGLE, { x:fx, y:fy, w:fw, h:fh, fill:{ color:'FFFFFF' }, line:{ color:C.line, width:1 }, shadow:shadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:fx, y:fy, w:fw, h:bar, fill:{ color:'EEF3F8' }, line:{ type:'none' } });
  ['F86C6B','F6BE4F','4FC08D'].forEach((c,i)=> s.addShape(pres.shapes.OVAL, { x:fx+0.18+i*0.2, y:fy+0.12, w:0.12, h:0.12, fill:{ color:c }, line:{ type:'none' } }));
  s.addText(hl.route, { x:fx+0.95, y:fy, w:fw-1.1, h:bar, fontFace:CN, fontSize:9.5, color:C.ink2, align:'left', valign:'middle', margin:0 });
  s.addImage({ path: ASSET(hl.shot), x:fx+0.06, y:fy+bar+0.04, w:fw-0.12, h:fh-bar-0.1, sizing:{ type:'cover', w:fw-0.12, h:fh-bar-0.1 } });
  s.addText(hl.caption, { x:fx, y:fy+fh+0.08, w:fw, h:0.3, fontFace:CN, fontSize:10, italic:true, color:C.ink3, align:'left', margin:0 });

  // ---- 右栏 技术实现 ----
  const tY = fy+fh+0.45;
  s.addText('技术实现', { x:fx, y:tY, w:2, h:0.26, fontFace:CN, fontSize:9, bold:true, color:C.blue600, charSpacing:1, align:'left', margin:0 });
  s.addText(hl.tech.map((t,i)=>({ text:t, options:{ bullet:{ code:'2022' }, color:C.ink2, breakLine:true } })),
    { x:fx+0.02, y:tY+0.26, w:fw-0.1, h:0.6, fontFace:CN, fontSize:9.5, align:'left', valign:'top', margin:0, paraSpaceAfter:2 });
}
HL.forEach(contentSlide);

// ============ 收尾 ============
(function closing(){
  const s = pres.addSlide();
  s.background = { color: C.navy900 };
  s.addShape(pres.shapes.LINE, { x:0, y:1.05, w:W, h:0, line:{ color:C.teal500, width:0.75, transparency:80 } });
  s.addText('八项亮点 · 回顾', { x:0.9, y:0.6, w:8, h:0.4, fontFace:NUMF, fontSize:13, bold:true, color:C.teal500, charSpacing:2, align:'left', margin:0 });
  s.addText('一套系统，覆盖排产到排班的完整链路', { x:0.9, y:1.15, w:11.5, h:0.7, fontFace:CN, fontSize:28, bold:true, color:'FFFFFF', align:'left', margin:0 });
  // 八项网格 4×2
  const cols=4, cw=2.92, ch=1.15, gx=0.18, gy=0.2, x0=0.9, y0=2.15;
  HL.forEach((h,i)=>{
    const cx = x0 + (i%cols)*(cw+gx), cy = y0 + Math.floor(i/cols)*(ch+gy);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:cx, y:cy, w:cw, h:ch, rectRadius:0.07, fill:{ color:'12305A' }, line:{ color:'24507F', width:1 } });
    s.addText('亮点 0'+h.n, { x:cx+0.18, y:cy+0.16, w:cw-0.3, h:0.28, fontFace:NUMF, fontSize:10, bold:true, color:C.teal500, align:'left', margin:0 });
    s.addText(h.title, { x:cx+0.18, y:cy+0.46, w:cw-0.34, h:0.6, fontFace:CN, fontSize:12.5, color:'EAF2F8', align:'left', valign:'top', margin:0, lineSpacingMultiple:1.0 });
  });
  s.addText([
    { text:'从排产到排班，一条线打通', options:{ color:'FFFFFF', bold:true } },
    { text:' —— 少返工、快响应、省人力。', options:{ color:C.teal500 } },
  ], { x:0.9, y:5.85, w:11.5, h:0.6, fontFace:CN, fontSize:18, align:'left', margin:0 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:0.9, y:6.6, w:2.2, h:0.62, rectRadius:0.07, fill:{ color:'FFFFFF' }, line:{ type:'none' } });
  s.addImage({ path: ASSET('wuxibio-logo.png'), x:1.04, y:6.74, w:1.92, h:0.34, sizing:{ type:'contain', w:1.92, h:0.34 } });
  s.addText('生产排产 · 排班系统 · 项目亮点演示', { x:3.4, y:6.6, w:9, h:0.62, fontFace:CN, fontSize:11, color:'7E92B0', align:'left', valign:'middle', margin:0 });
})();

pres.writeFile({ fileName: OUT }).then((f)=> console.log('WROTE', f)).catch((e)=>{ console.error('ERR', e); process.exit(1); });
