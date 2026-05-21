function Kpi({ lbl, value, unit, delta, deltaTone="up", accent }) {
  return (
    <div className="kpi">
      <div className="lbl">{lbl}</div>
      <div className="v">{value}{unit && <span className="u">{unit}</span>}</div>
      {delta && <div className={"d " + deltaTone}>{delta}</div>}
      {accent}
    </div>
  );
}

function Chip({ tone="info", children }) {
  return <span className={"chip chip-" + tone}><span className="dot"/>{children}</span>;
}

function CapacityChart() {
  // Static SVG chart; values are illustrative.
  return (
    <svg width="100%" height="180" viewBox="0 0 720 180" preserveAspectRatio="none">
      {/* gridlines */}
      {[0, 45, 90, 135, 178].map((y,i)=> <line key={i} x1="40" y1={y+1} x2="720" y2={y+1} stroke="#EEF2F7"/>)}
      {/* y-labels */}
      {["100","75","50","25","0"].map((v,i)=> <text key={v} x="6" y={i*45+6} fill="#8898A8" fontSize="10" fontFamily="JetBrains Mono">{v}</text>)}
      {/* used area */}
      <polygon
        fill="#0B3D7F" fillOpacity="0.10"
        points="40,120 100,116 160,108 220,112 280,96 340,86 400,78 460,72 520,68 580,60 640,56 700,52 720,50 720,178 40,178"/>
      <polyline
        fill="none" stroke="#0B3D7F" strokeWidth="1.6"
        points="40,120 100,116 160,108 220,112 280,96 340,86 400,78 460,72 520,68 580,60 640,56 700,52 720,50"/>
      {/* available dashed */}
      <polyline
        fill="none" stroke="#A3CC4F" strokeWidth="1.6" strokeDasharray="4 4"
        points="40,60 100,68 160,80 220,76 280,92 340,102 400,114 460,124 520,128 580,138 640,144 700,148 720,150"/>
      {/* x labels */}
      {["W14","W17","W20","W23","W26"].map((v,i)=> <text key={v} x={40 + i*170} y="178" fill="#8898A8" fontSize="10" fontFamily="JetBrains Mono">{v}</text>)}
    </svg>
  );
}

function Dashboard({ goBatch, goFloor, goDev }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumb">Wuxi MFG8 · GMP</div>
          <h1>Operations Overview</h1>
        </div>
        <div className="actions">
          <button className="btn btn-secondary"><Icon.download/>Export</button>
          <button className="btn btn-primary"><Icon.plus/>New Schedule</button>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi lbl="Capacity Utilization" value="78" unit="%" delta="▲ 4.2 pts WoW" deltaTone="up"
          accent={<svg className="accent" viewBox="0 0 70 70"><polygon points="35,3 63,19 63,51 35,67 7,51 7,19" fill="#0B3D7F"/></svg>}/>
        <Kpi lbl="Active Batches" value="24" delta="▲ 2 vs last week" deltaTone="up"
          accent={<svg className="accent" viewBox="0 0 70 70"><circle cx="35" cy="35" r="28" fill="none" stroke="#0B3D7F" strokeWidth="6"/></svg>}/>
        <Kpi lbl="In-Spec Rate (30d)" value="99.4" unit="%" delta="▲ 0.3 pts" deltaTone="up"
          accent={<svg className="accent" viewBox="0 0 70 70"><path d="M9 44 L30 62 L62 16" fill="none" stroke="#2E9D6E" strokeWidth="7" strokeLinecap="round"/></svg>}/>
        <Kpi lbl="Open Deviations" value="3" delta="▲ 1 vs last week" deltaTone="down"
          accent={<svg className="accent" viewBox="0 0 70 70"><polygon points="35,7 65,63 5,63" fill="none" stroke="#D6493A" strokeWidth="5"/></svg>}/>
      </div>

      <div className="two-col-3-2">
        <div className="card">
          <div className="card-head">
            <h3>Capacity Utilization · 12 weeks</h3>
            <div style={{display:"flex", gap:14, fontSize:12, color:"var(--wx-fg-3)"}}>
              <span><span style={{display:"inline-block",width:8,height:8,background:"#0B3D7F",borderRadius:2,marginRight:6}}/>Used</span>
              <span><span style={{display:"inline-block",width:8,height:8,background:"#A3CC4F",borderRadius:2,marginRight:6}}/>Available</span>
            </div>
          </div>
          <div className="card-body"><CapacityChart/></div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Alerts &amp; Actions</h3><span className="meta">3 open</span></div>
          <div className="card-body" style={{padding:0}}>
            <div onClick={goDev} style={{padding:"14px 18px", borderBottom:"1px solid var(--wx-divider)", cursor:"pointer"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
                <strong style={{fontSize:13, color:"var(--wx-ink)"}}>DEV-2026-0418 · OOS</strong>
                <Chip tone="err">Deviation</Chip>
              </div>
              <div style={{fontSize:12, color:"var(--wx-fg-3)"}}>Yield 4.10 g/L on BX-2417-D11 below spec</div>
            </div>
            <div style={{padding:"14px 18px", borderBottom:"1px solid var(--wx-divider)", cursor:"pointer"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
                <strong style={{fontSize:13, color:"var(--wx-ink)"}}>BR-204 · dO₂ near limit</strong>
                <Chip tone="warn">Warning</Chip>
              </div>
              <div style={{fontSize:12, color:"var(--wx-fg-3)"}}>Current 38%, threshold 35%</div>
            </div>
            <div onClick={goBatch} style={{padding:"14px 18px", cursor:"pointer"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
                <strong style={{fontSize:13, color:"var(--wx-ink)"}}>BX-2418-A03 · QA review</strong>
                <Chip tone="info">Pending</Chip>
              </div>
              <div style={{fontSize:12, color:"var(--wx-fg-3)"}}>2 of 12 release tests outstanding</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{height:16}}/>
      <div className="card">
        <div className="card-head">
          <h3>Active Batches · Today</h3>
          <button className="btn btn-ghost" onClick={goBatch}>View all <Icon.arrow/></button>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead><tr><th>Lot</th><th>Bioreactor</th><th>Stage</th><th>Day</th><th className="num">Yield</th><th>Status</th></tr></thead>
            <tbody>
              <tr onClick={goBatch}><td className="lot">BX-2418-A03</td><td>BR-204</td><td>Production</td><td>9 / 14</td><td className="num">5.84 g/L</td><td><Chip tone="info">QA Review</Chip></td></tr>
              <tr><td className="lot">BX-2418-A02</td><td>BR-201</td><td>Released</td><td>14 / 14</td><td className="num">5.62 g/L</td><td><Chip tone="ok">Released</Chip></td></tr>
              <tr><td className="lot">BX-2418-A01</td><td>BR-201</td><td>Production</td><td>6 / 14</td><td className="num">—</td><td><Chip tone="info">In Run</Chip></td></tr>
              <tr><td className="lot">BX-2417-D11</td><td>BR-307</td><td>Investigation</td><td>—</td><td className="num">4.10 g/L</td><td><Chip tone="err">OOS</Chip></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
window.Chip = Chip;
