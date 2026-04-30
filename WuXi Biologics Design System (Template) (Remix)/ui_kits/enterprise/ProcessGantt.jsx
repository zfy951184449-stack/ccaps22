// ============================================================
// Process Template Gantt · Enterprise UI Kit
// Direct hex values for all colors (DS token equivalents)
// ============================================================

const C = {
  blue700:"#0B3D7F", blue500:"#1F6FEB", blue100:"#E6F2FB",
  cyan500:"#3AA8C1", cyan100:"#E0F1F5",
  green500:"#2E9D6E", green100:"#E6F4ED",
  amber500:"#E8B53C", amber100:"#FBF1D9",
  red100:"#FBE6E3",
  ink:"#0F1B2D", fg2:"#3A4A5C", fg3:"#5A6B7E", fg4:"#8898A8",
  border:"#E4EAF1", divider:"#EEF2F7", surface2:"#F5F8FB",
};
const ST = {"Cell Culture":{c:C.blue700},"Purification":{c:C.cyan500}};
const sc = k => ST[k] || ST["Cell Culture"];

const MOCK = {
  name:"CHO-K1 Upstream 14d",
  stages:[
    {id:"s1",name:"Cell Culture",ck:"Cell Culture",ops:[
      {id:"op1",name:"Inoculation",p:2,h:4,sd:0,sh:8,ws:6,wh:8},
      {id:"op2",name:"Seed Expansion",p:3,h:8,sd:0,sh:14,ws:12,wh:12},
      {id:"op3",name:"Production Run",p:4,h:24,sd:1,sh:6,ws:4,wh:28},
      {id:"op4",name:"Fed Batch",p:2,h:6,sd:2,sh:12,ws:10,wh:10},
    ]},
    {id:"s2",name:"Purification",ck:"Purification",ops:[
      {id:"op5",name:"Harvest",p:2,h:6,sd:3,sh:8,ws:6,wh:10},
      {id:"op6",name:"Chromatography",p:3,h:12,sd:3,sh:16,ws:14,wh:16},
      {id:"op7",name:"Filtration",p:2,h:4,sd:4,sh:10,ws:8,wh:8},
    ]},
  ],
  constraints:[
    {from:"op1",to:"op2",type:"FS",lag:2},{from:"op2",to:"op3",type:"FS",lag:0},
    {from:"op3",to:"op4",type:"SS",lag:6},{from:"op4",to:"op5",type:"FS",lag:2},
    {from:"op5",to:"op6",type:"FS",lag:0},{from:"op6",to:"op7",type:"SS",lag:4},
  ],
};
const DAYS=6, RH=36, HPD=24;

function ProcessGantt(){
  const [hw,setHw]=React.useState(20);
  const [ex,setEx]=React.useState({s1:true,s2:true});
  const [act,setAct]=React.useState(null);
  const [tip,setTip]=React.useState(null);
  const [det,setDet]=React.useState(null);
  const ref=React.useRef(null);
  const dw=hw*HPD, tw=dw*DAYS;

  const rows=React.useMemo(()=>{
    const r=[{t:"tpl",id:"root",n:MOCK.name,d:0}];
    MOCK.stages.forEach(s=>{
      r.push({t:"stg",id:s.id,n:s.name,d:1,ck:s.ck,stg:s});
      if(ex[s.id]) s.ops.forEach(o=>r.push({t:"op",id:o.id,n:o.name,d:2,op:o,stg:s,ck:s.ck}));
    });
    return r;
  },[ex]);

  const opM=React.useMemo(()=>{const m={};MOCK.stages.forEach(s=>s.ops.forEach(o=>{m[o.id]={...o,ck:s.ck}}));return m;},[]);
  const idx=id=>rows.findIndex(r=>r.id===id);
  const h2p=(d,h)=>(d*HPD+h)*hw;
  const cc=t=>t==="FS"?C.blue500:t==="SS"?C.green500:t==="FF"?C.amber500:C.cyan500;

  const peaks=React.useMemo(()=>{
    const p=[];
    for(let d=0;d<DAYS;d++){let n=0;MOCK.stages.forEach(s=>s.ops.forEach(o=>{
      const s0=o.sd*24+o.sh;if(s0<(d+1)*24&&s0+o.h>d*24)n+=o.p;
    }));p.push(n);}
    const mx=Math.max(...p,1);
    return p.map(v=>({v,r:v/mx}));
  },[]);

  const pkC=r=>r<0.4?C.green100:r<0.7?C.amber100:C.red100;

  const cPath=c=>{
    const fo=opM[c.from],to=opM[c.to];if(!fo||!to)return null;
    const fi=idx(c.from),ti=idx(c.to);if(fi<0||ti<0)return null;
    const x1=(c.type==="FS"||c.type==="FF")?h2p(fo.sd,fo.sh+fo.h):h2p(fo.sd,fo.sh);
    const x2=(c.type==="FS"||c.type==="SS")?h2p(to.sd,to.sh):h2p(to.sd,to.sh+to.h);
    const y1=fi*RH+RH/2,y2=ti*RH+RH/2,mx=(x1+x2)/2;
    return{d:"M"+x1+","+y1+" L"+mx+","+y1+" L"+mx+","+y2+" L"+x2+","+y2,lx:mx,ly:(y1+y2)/2,cl:cc(c.type),ds:c.type==="FS"?"":"6 4"};
  };

  const showT=(e,o)=>{
    if(!ref.current)return;
    const r=ref.current.getBoundingClientRect();
    const eH=o.sh+o.h;
    setTip({x:e.clientX-r.left+14,y:e.clientY-r.top-40,o:o,eD:o.sd+Math.floor(eH/24),eH:eH%24});
  };

  const th=rows.length*RH;
  const mids=["Blue","Green","Amber","Cyan"];
  const mfills=[C.blue500,C.green500,C.amber500,C.cyan500];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumb">Operations · Process Template</div>
          <h1>{"Process Template · "+MOCK.name}</h1>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={function(){alert("Validation: 0 conflicts")}}>Validate</button>
          <button className="btn btn-primary" onClick={function(){alert("Auto Schedule done")}}>Auto Schedule</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>{"Gantt Chart · "+MOCK.stages.reduce(function(a,s){return a+s.ops.length},0)+" Operations across "+MOCK.stages.length+" Stages"}</h3>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            <span style={{fontSize:11,color:C.fg3,marginRight:4}}>Zoom</span>
            <button className="btn btn-ghost" style={{height:28,padding:"0 6px"}} onClick={function(){setHw(function(p){return Math.max(8,p-4)})}}>−</button>
            <span style={{fontSize:11,color:C.fg3,minWidth:32,textAlign:"center"}}>{hw+"px"}</span>
            <button className="btn btn-ghost" style={{height:28,padding:"0 6px"}} onClick={function(){setHw(function(p){return Math.min(60,p+4)})}}>+</button>
          </div>
        </div>
        <div className="card-body flush">
          <div className="gantt-wrap">
            {/* SIDEBAR */}
            <div className="gantt-sidebar">
              <div className="row depth-0" style={{height:46,borderBottom:"1px solid "+C.border,background:C.surface2,fontWeight:500,fontSize:11.5,letterSpacing:"0.04em",textTransform:"uppercase",color:C.fg3}}>Template</div>
              <div className="row" style={{height:8,padding:0,cursor:"default",borderBottom:"1px solid "+C.divider}}></div>
              {rows.map(function(row){
                return (
                  <div key={row.id} className={"row depth-"+row.d+(act===row.id?" active":"")}
                    onClick={function(){setAct(row.id);if(row.t==="op")setDet(row.op)}}
                    onMouseEnter={function(){setAct(row.id)}}>
                    <span className="indent" style={{width:row.d*16}}></span>
                    {row.t==="stg"?<span className="toggle" onClick={function(e){e.stopPropagation();setEx(function(p){var n={};for(var k in p)n[k]=p[k];n[row.id]=!p[row.id];return n})}}>{ex[row.id]?"▾":"▸"}</span>:null}
                    {row.t==="tpl"?<span className="toggle">▾</span>:null}
                    {row.t==="stg"?<span className="stage-bar" style={{background:sc(row.ck).c}}></span>:null}
                    {row.t==="op"?<span style={{width:3,marginRight:8,flexShrink:0}}></span>:null}
                    <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{row.n}</span>
                    {row.t==="op"?<span className="meta">{row.op.p+"p · "+row.op.h+"h"}</span>:null}
                    {row.t==="stg"?<span className="meta">{row.stg.ops.length+" ops"}</span>:null}
                  </div>
                );
              })}
            </div>

            {/* TIMELINE */}
            <div className="gantt-timeline-wrap" ref={ref}>
              <div className="gantt-timeline" style={{width:tw}}>
                {/* Axis */}
                <div className="gantt-axis">
                  {Array.from({length:DAYS}).map(function(_,d){
                    return (
                      <div key={d} className="day-col" style={{width:dw}}>
                        <div className="day-label">{"Day "+d}</div>
                        <div className="hours">
                          {[0,3,6,9,12,15,18,21].map(function(h){return <span key={h} className="hr-label" style={{width:hw*3}}>{h}</span>})}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Peak heat */}
                <div className="gantt-peak-row">
                  {peaks.map(function(p,i){return <div key={i} className="gantt-peak-bar" style={{width:dw,background:pkC(p.r)}} title={"Peak: "+p.v}></div>})}
                </div>

                {/* Grid */}
                <div className="gantt-grid" style={{height:th,position:"relative"}}>
                  {/* Work bg */}
                  {Array.from({length:DAYS}).map(function(_,d){return <div key={"w"+d} className="gantt-work-bg" style={{left:h2p(d,9),width:hw*8}}></div>})}
                  {/* Day lines */}
                  {Array.from({length:DAYS+1}).map(function(_,d){return <div key={"dl"+d} className={"gantt-day-line"+(d===0?" origin":"")} style={{left:d*dw}}></div>})}
                  {/* Hour lines */}
                  {Array.from({length:DAYS}).map(function(_,d){return [3,6,9,12,15,18,21].map(function(h){return <div key={"hl"+d+"-"+h} className="gantt-hour-line" style={{left:h2p(d,h)}}></div>})})}
                  {/* Grid rows */}
                  {rows.map(function(row){return <div key={"gr"+row.id} className={"gantt-grid-row"+(act===row.id?" active":"")} onMouseEnter={function(){setAct(row.id)}}></div>})}

                  {/* Stage bars */}
                  {rows.filter(function(r){return r.t==="stg"&&ex[r.id]}).map(function(row){
                    var ops=row.stg.ops;if(!ops.length)return null;
                    var mn=Infinity,mx=-Infinity;
                    ops.forEach(function(o){var s=o.sd*24+o.sh;if(s<mn)mn=s;if(s+o.h>mx)mx=s+o.h});
                    var fi=rows.findIndex(function(r){return r.t==="op"&&r.stg===row.stg});
                    var li=-1;rows.forEach(function(r,i){if(r.t==="op"&&r.stg===row.stg)li=i});
                    var top=fi*RH+(RH-20)/2,ht=(li-fi+1)*RH-(RH-20);
                    var clr=sc(row.ck).c;
                    return <div key={"sb"+row.id} className="gantt-stage-bar" style={{left:mn*hw,width:(mx-mn)*hw,top:top,height:ht,borderColor:clr,background:clr+"0F"}}></div>;
                  })}

                  {/* Time windows */}
                  {rows.filter(function(r){return r.t==="op"}).map(function(row){
                    var o=row.op,ri=rows.indexOf(row),clr=sc(row.ck).c;
                    return <div key={"tw"+o.id} className="gantt-window-bar" style={{left:h2p(o.sd,o.ws),width:o.wh*hw,top:ri*RH+(RH-20)/2,borderColor:clr+"60",background:"repeating-linear-gradient(45deg,"+clr+"0D 0px,"+clr+"0D 4px,"+clr+"1A 4px,"+clr+"1A 8px)"}}></div>;
                  })}

                  {/* Operation bars */}
                  {rows.filter(function(r){return r.t==="op"}).map(function(row){
                    var o=row.op,ri=rows.indexOf(row),clr=sc(row.ck).c;
                    var left=h2p(o.sd,o.sh),w=o.h*hw;
                    return <div key={"ob"+o.id} className="gantt-bar" style={{left:left,width:w,top:ri*RH+(RH-24)/2,background:clr}} onMouseMove={function(e){showT(e,o)}} onMouseLeave={function(){setTip(null)}} onDoubleClick={function(){setDet(o)}}>{w>50?o.name:null}</div>;
                  })}

                  {/* Constraint SVG */}
                  <svg className="gantt-constraints" width={tw} height={th} style={{overflow:"visible"}}>
                    <defs>
                      {mids.map(function(n,i){return <marker key={n} id={"arr"+n} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill={mfills[i]}></polygon></marker>})}
                    </defs>
                    {MOCK.constraints.map(function(c,i){
                      var p=cPath(c);if(!p)return null;
                      var mid=c.type==="FS"?"Blue":c.type==="SS"?"Green":c.type==="FF"?"Amber":"Cyan";
                      return (
                        <g key={i}>
                          <path d={p.d} fill="none" stroke={p.cl} strokeWidth="1.5" strokeDasharray={p.ds} markerEnd={"url(#arr"+mid+")"}></path>
                          <rect x={p.lx-12} y={p.ly-9} width="24" height="18" rx="9" fill="rgba(15,27,45,0.7)"></rect>
                          <text x={p.lx} y={p.ly+4} fill="#fff" textAnchor="middle" style={{fontSize:9,fontWeight:600}}>{c.type}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Tooltip */}
                {tip?<div className="gantt-tip on" style={{left:tip.x,top:tip.y}}>
                  <div className="tip-title">{tip.o.name}</div>
                  <div className="tip-row"><span>Start</span><span className="val">{"Day "+tip.o.sd+" "+String(tip.o.sh).padStart(2,"0")+":00"}</span></div>
                  <div className="tip-row"><span>End</span><span className="val">{"Day "+tip.eD+" "+String(tip.eH).padStart(2,"0")+":00"}</span></div>
                  <div className="tip-row"><span>Duration</span><span className="val">{tip.o.h+".0h"}</span></div>
                  <div className="tip-row"><span>Resource</span><span className="val">{tip.o.p+" operators"}</span></div>
                </div>:null}

                {/* Detail panel */}
                <div className={"gantt-detail"+(det?" open":"")}>
                  {det?<div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                      <h4>{det.name}</h4>
                      <button className="btn btn-ghost" style={{height:28,padding:"0 6px"}} onClick={function(){setDet(null)}}>✕</button>
                    </div>
                    <div className="sub">{"Operation · "+MOCK.name}</div>
                    <hr style={{border:"none",borderTop:"1px solid "+C.divider,margin:"12px 0"}} />
                    <div className="field"><div className="lbl">Start</div><div className="val mono">{"Day "+det.sd+" · "+String(det.sh).padStart(2,"0")+":00"}</div></div>
                    <div className="field"><div className="lbl">Duration</div><div className="val mono">{det.h+".0 hours"}</div></div>
                    <div className="field"><div className="lbl">Personnel</div><div className="val">{det.p+" operators"}</div></div>
                    <div className="field"><div className="lbl">Time Window</div><div className="val mono">{String(det.ws).padStart(2,"0")+":00 – "+String(det.ws+det.wh).padStart(2,"0")+":00 ("+det.wh+"h)"}</div></div>
                    <hr style={{border:"none",borderTop:"1px solid "+C.divider,margin:"12px 0"}} />
                    <div className="field"><div className="lbl">Status</div><span className="chip chip-info" style={{marginTop:4}}><span className="dot"></span>Scheduled</span></div>
                  </div>:null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{marginTop:16,display:"flex",gap:24,flexWrap:"wrap",fontSize:12,color:C.fg3}}>
        <span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,borderRadius:2,background:C.blue700}}></span>Cell Culture</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,borderRadius:2,background:C.cyan500}}></span>Purification</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:20,height:10,borderRadius:2,border:"1.5px dashed "+C.blue500,background:C.blue700+"0F"}}></span>Stage</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:14,height:2,background:C.blue500}}></span>FS</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:14,height:2,borderTop:"2px dashed "+C.green500}}></span>SS</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:10,height:4,borderRadius:999,background:C.green100}}></span>Low</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:10,height:4,borderRadius:999,background:C.amber100}}></span>Med</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:10,height:4,borderRadius:999,background:C.red100}}></span>High</span>
      </div>
    </div>
  );
}

window.ProcessGantt = ProcessGantt;
