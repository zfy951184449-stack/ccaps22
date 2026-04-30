function Stepper({ current = 2 }) {
  const stages = ["Inoculation", "Seed Train", "Production", "Harvest", "Clarification", "QA Release"];
  const days = ["D0", "D1–D4", "D5–D11", "D12", "D13", "D14"];
  return (
    <div className="stages">
      {stages.map((s, i) => {
        const cls = i < current ? "done" : i === current ? "curr" : "todo";
        return (
          <div key={s} className={"stage " + cls}>
            <span className="dot">{cls === "done" ? "✓" : cls === "curr" ? "●" : ""}</span>
            <span className="lbl">{s}</span>
            <span style={{fontSize:11, color:"var(--wx-fg-3)", fontFamily:"JetBrains Mono"}}>{days[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

function BatchList({ goDev }) {
  const [sel, setSel] = React.useState("BX-2418-A03");

  const rows = [
    { lot:"BX-2418-A03", br:"BR-204", stage:"Production",   day:"9 / 14",  yield:"5.84 g/L", status:["info","QA Review"], step:2 },
    { lot:"BX-2418-A02", br:"BR-201", stage:"Released",     day:"14 / 14", yield:"5.62 g/L", status:["ok","Released"], step:5 },
    { lot:"BX-2418-A01", br:"BR-201", stage:"Production",   day:"6 / 14",  yield:"—",        status:["info","In Run"], step:2 },
    { lot:"BX-2418-B07", br:"BR-118", stage:"Seed Train",   day:"3 / 14",  yield:"—",        status:["info","In Run"], step:1 },
    { lot:"BX-2417-D11", br:"BR-307", stage:"Investigation",day:"—",       yield:"4.10 g/L", status:["err","OOS"], step:2 },
    { lot:"BX-2417-D10", br:"BR-307", stage:"Released",     day:"14 / 14", yield:"5.71 g/L", status:["ok","Released"], step:5 },
    { lot:"BX-2417-D09", br:"BR-105", stage:"Released",     day:"14 / 14", yield:"5.69 g/L", status:["ok","Released"], step:5 },
  ];

  const selRow = rows.find(r => r.lot === sel) || rows[0];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumb">Operations · Batch Execution</div>
          <h1>Active &amp; Recent Batches</h1>
        </div>
        <div className="actions">
          <button className="btn btn-secondary"><Icon.filter/>Filter</button>
          <button className="btn btn-secondary"><Icon.download/>Export</button>
          <button className="btn btn-primary"><Icon.plus/>New Batch</button>
        </div>
      </div>

      <div className="card" style={{marginBottom:16}}>
        <div className="card-head">
          <h3>Stage progress · {selRow.lot}</h3>
          <span className="meta">Bioreactor {selRow.br} · {selRow.day}</span>
        </div>
        <div className="card-body"><Stepper current={selRow.step}/></div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Lots · 7 of 124</h3>
          <div className="search"><Icon.search/><input placeholder="Filter by lot, BR…"/></div>
        </div>
        <div className="card-body flush">
          <table className="tbl">
            <thead><tr><th>Lot</th><th>Bioreactor</th><th>Stage</th><th>Day</th><th className="num">Yield</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.lot}
                  className={sel === r.lot ? "sel" : ""}
                  onClick={() => r.status[1] === "OOS" ? goDev() : setSel(r.lot)}>
                  <td className="lot">{r.lot}</td>
                  <td>{r.br}</td>
                  <td>{r.stage}</td>
                  <td>{r.day}</td>
                  <td className="num">{r.yield}</td>
                  <td><Chip tone={r.status[0]}>{r.status[1]}</Chip></td>
                  <td style={{color:"var(--wx-fg-4)"}}><Icon.arrow/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

window.BatchList = BatchList;
