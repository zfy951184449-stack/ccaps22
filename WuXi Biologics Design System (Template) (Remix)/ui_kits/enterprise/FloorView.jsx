function FloorView() {
  const reactors = [
    { id:"BR-201", vol:"2,000 L",  state:"run",  stage:"Production · Day 6", lot:"BX-2418-A01", pct:42, status:["info","In Run"] },
    { id:"BR-204", vol:"12,400 L", state:"run",  stage:"Production · Day 9", lot:"BX-2418-A03", pct:64, status:["warn","Near Limit"] },
    { id:"BR-118", vol:"500 L",    state:"run",  stage:"Seed · Day 3",       lot:"BX-2418-B07", pct:21, status:["info","In Run"] },
    { id:"BR-105", vol:"2,000 L",  state:"idle", stage:"Cleaning",            lot:"—",          pct:0,  status:["neu","Cleaning"] },
    { id:"BR-307", vol:"500 L",    state:"run",  stage:"Investigation",       lot:"BX-2417-D11",pct:78, status:["err","OOS"] },
    { id:"BR-308", vol:"500 L",    state:"idle", stage:"Idle",                lot:"—",          pct:0,  status:["neu","Idle"] },
    { id:"BR-410", vol:"2,000 L",  state:"run",  stage:"Production · Day 11", lot:"BX-2418-C04",pct:78, status:["info","In Run"] },
    { id:"BR-411", vol:"2,000 L",  state:"run",  stage:"Harvest",             lot:"BX-2418-C03",pct:88, status:["ok","Ready"] },
    { id:"BR-512", vol:"12,400 L", state:"idle", stage:"Qualification",       lot:"—",          pct:0,  status:["neu","Q"] },
    { id:"BR-514", vol:"12,400 L", state:"run",  stage:"Production · Day 4",  lot:"BX-2418-D02",pct:28, status:["info","In Run"] },
    { id:"BR-602", vol:"2,000 L",  state:"run",  stage:"Production · Day 12", lot:"BX-2418-E11",pct:85, status:["info","In Run"] },
    { id:"BR-604", vol:"2,000 L",  state:"idle", stage:"Idle",                lot:"—",          pct:0,  status:["neu","Idle"] },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumb">Operations · Floor View</div>
          <h1>Bioreactor Floor · Wuxi MFG18</h1>
        </div>
        <div className="actions">
          <button className="btn btn-secondary"><Icon.filter/>500 L · 2,000 L · 12,400 L</button>
          <button className="btn btn-primary"><Icon.cal/>Open Schedule</button>
        </div>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
        <Kpi lbl="Total Bioreactors" value="12"/>
        <Kpi lbl="In Run" value="8" delta="●●●●●●●●○○○○" deltaTone="neu"/>
        <Kpi lbl="Idle / Cleaning" value="3"/>
        <Kpi lbl="Total Volume Online" value="40.2" unit="kL"/>
      </div>

      <div className="card">
        <div className="card-head"><h3>Suite map</h3><span className="meta">Live · auto-refresh 60s</span></div>
        <div className="card-body">
          <div className="floor-grid">
            {reactors.map(r => (
              <div key={r.id} className={"br-card " + r.state}>
                <div className="row">
                  <span className="nm">{r.id}</span>
                  <Chip tone={r.status[0]}>{r.status[1]}</Chip>
                </div>
                <div className="vol">{r.vol}</div>
                <div className="stage">{r.stage}</div>
                <div className="bar"><i style={{width: r.pct + "%"}}/></div>
                <div className="day">{r.lot !== "—" ? "Lot " + r.lot : ""}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ lbl, value, unit, delta, deltaTone="up" }) {
  return (
    <div className="kpi">
      <div className="lbl">{lbl}</div>
      <div className="v">{value}{unit && <span className="u">{unit}</span>}</div>
      {delta && <div className={"d " + deltaTone}>{delta}</div>}
    </div>
  );
}

window.FloorView = FloorView;
