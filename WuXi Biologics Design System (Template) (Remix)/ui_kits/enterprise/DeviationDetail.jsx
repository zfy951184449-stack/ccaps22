function DeviationDetail({ goBatch }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumb">Quality · Deviations · DEV-2026-0418</div>
          <h1>Yield Below Specification — BX-2417-D11</h1>
        </div>
        <div className="actions">
          <button className="btn btn-secondary"><Icon.download/>Export PDF</button>
          <button className="btn btn-secondary">Reject Lot</button>
          <button className="btn btn-primary"><Icon.shield/>Approve CAPA</button>
        </div>
      </div>

      <div className="two-col-3-2">
        <div>
          <div className="card" style={{marginBottom:16}}>
            <div className="card-head">
              <h3>Summary</h3>
              <Chip tone="err">Open · Major</Chip>
            </div>
            <div className="card-body">
              <div className="metric-row" style={{borderBottom:"1px solid var(--wx-divider)"}}>
                <div><div className="lab">Lot</div><div className="val" style={{fontFamily:"JetBrains Mono", color:"var(--wx-blue-700)"}}>BX-2417-D11</div></div>
                <div><div className="lab">Bioreactor</div><div className="val">BR-307 · 500 L</div></div>
                <div><div className="lab">Detected</div><div className="val">2026-04-18 09:42 CST</div></div>
                <div><div className="lab">Reporter</div><div className="val">QA-002 · Lin Z.</div></div>
              </div>
              <div className="metric-row">
                <div><div className="lab">Yield (Actual)</div><div className="val" style={{color:"var(--wx-red-700)"}}>4.10 g/L</div></div>
                <div><div className="lab">Yield (Spec)</div><div className="val">≥ 5.20 g/L</div></div>
                <div><div className="lab">Δ vs Spec</div><div className="val" style={{color:"var(--wx-red-700)"}}>-1.10 g/L</div></div>
                <div><div className="lab">Risk</div><div className="val"><Chip tone="warn">Major</Chip></div></div>
              </div>
              <hr className="div"/>
              <div className="lab">Description</div>
              <p style={{margin:"4px 0 0", color:"var(--wx-fg-2)", fontSize:13.5, lineHeight:1.6}}>
                On harvest day, BR-307 produced final yield 4.10 g/L against a specification floor of 5.20 g/L.
                Process trends indicate dO₂ excursion between D7–D9 (low for 14 hr) coinciding with sparger
                control loop oscillation. Investigation in progress; lot held pending disposition.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Investigation Timeline</h3><span className="meta">5 events</span></div>
            <div className="card-body">
              <div className="tl">
                <div className="tl-item done">
                  <div className="when">2026-04-18 09:42</div>
                  <div className="ttl">OOS detected · Lot held</div>
                  <div className="body">Automatic hold posted by LIMS at harvest sample release.</div>
                </div>
                <div className="tl-item done">
                  <div className="when">2026-04-18 11:15</div>
                  <div className="ttl">Initial assessment · QA-002</div>
                  <div className="body">Trends pulled, sparger oscillation identified D7–D9.</div>
                </div>
                <div className="tl-item done">
                  <div className="when">2026-04-19 08:00</div>
                  <div className="ttl">Cross-functional review</div>
                  <div className="body">Process Eng, QA, Manufacturing lead agreed Major classification.</div>
                </div>
                <div className="tl-item">
                  <div className="when">2026-04-22 14:30</div>
                  <div className="ttl">Root cause hypothesis</div>
                  <div className="body">Sparger control loop tuning drift — pending re-qualification report.</div>
                </div>
                <div className="tl-item">
                  <div className="when">Pending</div>
                  <div className="ttl">CAPA approval &amp; lot disposition</div>
                  <div className="body">Awaiting QA Director sign-off.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{marginBottom:16}}>
            <div className="card-head"><h3>Linked Records</h3></div>
            <div className="card-body" style={{padding:0}}>
              <div onClick={goBatch} style={{padding:"12px 18px", borderBottom:"1px solid var(--wx-divider)", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:"JetBrains Mono", fontSize:12.5, color:"var(--wx-blue-700)", fontWeight:500}}>BX-2417-D11</div>
                  <div style={{fontSize:12, color:"var(--wx-fg-3)"}}>Batch record · BR-307</div>
                </div>
                <Icon.arrow/>
              </div>
              <div style={{padding:"12px 18px", borderBottom:"1px solid var(--wx-divider)", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:"JetBrains Mono", fontSize:12.5, color:"var(--wx-blue-700)", fontWeight:500}}>EQ-307-CTRL</div>
                  <div style={{fontSize:12, color:"var(--wx-fg-3)"}}>Equipment qualification</div>
                </div>
                <Icon.arrow/>
              </div>
              <div style={{padding:"12px 18px", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:"JetBrains Mono", fontSize:12.5, color:"var(--wx-blue-700)", fontWeight:500}}>CAPA-2026-019</div>
                  <div style={{fontSize:12, color:"var(--wx-fg-3)"}}>Open · Draft</div>
                </div>
                <Icon.arrow/>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>dO₂ Trend · D6 → D10</h3></div>
            <div className="card-body">
              <svg width="100%" height="160" viewBox="0 0 360 160">
                {[0,40,80,120,158].map((y,i)=> <line key={i} x1="34" y1={y+1} x2="360" y2={y+1} stroke="#EEF2F7"/>)}
                {["100","75","50","25","0"].map((v,i)=> <text key={v} x="6" y={i*40+6} fill="#8898A8" fontSize="9" fontFamily="JetBrains Mono">{v}</text>)}
                {/* threshold band */}
                <rect x="34" y="100" width="326" height="20" fill="#FBF1D9" opacity="0.6"/>
                <line x1="34" y1="100" x2="360" y2="100" stroke="#E8B53C" strokeDasharray="3 3" strokeWidth="1"/>
                {/* trace */}
                <polyline fill="none" stroke="#0B3D7F" strokeWidth="1.6"
                  points="34,40 70,46 110,52 150,98 190,118 230,124 270,108 310,82 360,72"/>
                {/* OOS markers */}
                <circle cx="190" cy="118" r="3.2" fill="#D6493A"/>
                <circle cx="230" cy="124" r="3.2" fill="#D6493A"/>
              </svg>
              <div style={{display:"flex", gap:14, fontSize:11.5, color:"var(--wx-fg-3)", marginTop:6}}>
                <span><span style={{display:"inline-block", width:8, height:8, background:"#0B3D7F", marginRight:6, borderRadius:2}}/>dO₂ %</span>
                <span><span style={{display:"inline-block", width:8, height:8, background:"#E8B53C", marginRight:6, borderRadius:2}}/>Threshold 35%</span>
                <span><span style={{display:"inline-block", width:8, height:8, background:"#D6493A", borderRadius:999, marginRight:6}}/>Excursion</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.DeviationDetail = DeviationDetail;
