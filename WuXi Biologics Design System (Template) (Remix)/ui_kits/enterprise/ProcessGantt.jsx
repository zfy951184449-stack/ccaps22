// ============================================================
// Process Template Gantt · Enterprise UI Kit
// Mock data + interactive timeline. No external deps.
// ============================================================

const STAGE_COLORS = {
  "Cell Culture":  { primary: "#0B3D7F", css: "var(--wx-blue-700)", light: "#E6F2FB", border: "#C7DCF7" },
  "Purification":  { primary: "#3AA8C1", css: "var(--wx-cyan-500)", light: "#E0F1F5", border: "#B3DDE6" },
};

const MOCK_TEMPLATE = {
  name: "CHO-K1 Upstream 14d",
  id: "TPL-0042",
  stages: [
    {
      id: "s1", name: "Cell Culture", color: "Cell Culture",
      operations: [
        { id: "op1", name: "Inoculation",     personnel: 2, hours: 4,  startDay: 0, startHour: 8,  windowStart: 6, windowHours: 8 },
        { id: "op2", name: "Seed Expansion",  personnel: 3, hours: 8,  startDay: 0, startHour: 14, windowStart: 12, windowHours: 12 },
        { id: "op3", name: "Production Run",  personnel: 4, hours: 24, startDay: 1, startHour: 6,  windowStart: 4, windowHours: 28 },
        { id: "op4", name: "Fed Batch",       personnel: 2, hours: 6,  startDay: 2, startHour: 12, windowStart: 10, windowHours: 10 },
      ],
    },
    {
      id: "s2", name: "Purification", color: "Purification",
      operations: [
        { id: "op5", name: "Harvest",         personnel: 2, hours: 6,  startDay: 3, startHour: 8,  windowStart: 6, windowHours: 10 },
        { id: "op6", name: "Chromatography",  personnel: 3, hours: 12, startDay: 3, startHour: 16, windowStart: 14, windowHours: 16 },
        { id: "op7", name: "Filtration",      personnel: 2, hours: 4,  startDay: 4, startHour: 10, windowStart: 8, windowHours: 8 },
      ],
    },
  ],
  constraints: [
    { from: "op1", to: "op2", type: "FS", lag: 2 },
    { from: "op2", to: "op3", type: "FS", lag: 0 },
    { from: "op3", to: "op4", type: "SS", lag: 6 },
    { from: "op4", to: "op5", type: "FS", lag: 2 },
    { from: "op5", to: "op6", type: "FS", lag: 0 },
    { from: "op6", to: "op7", type: "SS", lag: 4 },
  ],
};

const TOTAL_DAYS = 6;
const ROW_H = 36;
const HOURS_PER_DAY = 24;

function ProcessGantt() {
  const [hourWidth, setHourWidth] = React.useState(20);
  const [expanded, setExpanded] = React.useState({ s1: true, s2: true });
  const [activeRow, setActiveRow] = React.useState(null);
  const [tooltip, setTooltip] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const timelineRef = React.useRef(null);

  const dayWidth = hourWidth * HOURS_PER_DAY;
  const totalWidth = dayWidth * TOTAL_DAYS;

  // Build flat row list
  const rows = React.useMemo(() => {
    const list = [];
    list.push({ type: "template", id: "root", name: MOCK_TEMPLATE.name, depth: 0 });
    MOCK_TEMPLATE.stages.forEach(stage => {
      list.push({ type: "stage", id: stage.id, name: stage.name, depth: 1, color: stage.color, stage });
      if (expanded[stage.id]) {
        stage.operations.forEach(op => {
          list.push({ type: "operation", id: op.id, name: op.name, depth: 2, op, stage, color: stage.color });
        });
      }
    });
    return list;
  }, [expanded]);

  // Op lookup
  const opMap = React.useMemo(() => {
    const m = {};
    MOCK_TEMPLATE.stages.forEach(s => s.operations.forEach(op => { m[op.id] = { ...op, stageColor: s.color }; }));
    return m;
  }, []);

  // Row index lookup
  const rowIndexOf = React.useCallback((opId) => {
    return rows.findIndex(r => r.id === opId);
  }, [rows]);

  const toggleStage = (stageId) => setExpanded(prev => ({ ...prev, [stageId]: !prev[stageId] }));

  const zoom = (delta) => setHourWidth(prev => Math.max(8, Math.min(60, prev + delta)));

  // Compute peak personnel per day
  const peakData = React.useMemo(() => {
    const peaks = [];
    for (let d = 0; d < TOTAL_DAYS; d++) {
      let maxP = 0;
      MOCK_TEMPLATE.stages.forEach(s => {
        s.operations.forEach(op => {
          const opStartH = op.startDay * 24 + op.startHour;
          const opEndH = opStartH + op.hours;
          const dayStart = d * 24;
          const dayEnd = dayStart + 24;
          if (opStartH < dayEnd && opEndH > dayStart) maxP += op.personnel;
        });
      });
      peaks.push(maxP);
    }
    const maxPeak = Math.max(...peaks, 1);
    return peaks.map(p => ({ value: p, ratio: p / maxPeak }));
  }, []);

  const peakColor = (ratio) => {
    if (ratio < 0.4) return "var(--wx-green-100)";
    if (ratio < 0.7) return "var(--wx-amber-100)";
    return "var(--wx-red-100)";
  };

  // Hour → px
  const hourToPx = (day, hour) => (day * HOURS_PER_DAY + hour) * hourWidth;

  // Tooltip handler
  const showTip = (e, op, stageColor) => {
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const endHour = op.startHour + op.hours;
    const endDay = op.startDay + Math.floor(endHour / 24);
    const endH = endHour % 24;
    setTooltip({
      x: x + 14, y: y - 40,
      name: op.name,
      startDay: op.startDay, startHour: op.startHour,
      endDay, endHour: endH,
      hours: op.hours,
      personnel: op.personnel,
      color: stageColor,
    });
  };
  const hideTip = () => setTooltip(null);

  // Constraint path builder
  const buildConstraintPath = (c) => {
    const fromOp = opMap[c.from];
    const toOp = opMap[c.to];
    if (!fromOp || !toOp) return null;
    const fromRow = rowIndexOf(c.from);
    const toRow = rowIndexOf(c.to);
    if (fromRow < 0 || toRow < 0) return null;

    const fromEndX = hourToPx(fromOp.startDay, fromOp.startHour + fromOp.hours);
    const fromStartX = hourToPx(fromOp.startDay, fromOp.startHour);
    const toStartX = hourToPx(toOp.startDay, toOp.startHour);
    // +1 offset for template/root row
    const fromY = (fromRow) * ROW_H + ROW_H / 2;
    const toY = (toRow) * ROW_H + ROW_H / 2;

    let x1, y1, x2, y2;
    if (c.type === "FS" || c.type === "FF") {
      x1 = fromEndX; y1 = fromY;
    } else {
      x1 = fromStartX; y1 = fromY;
    }
    if (c.type === "FS" || c.type === "SS") {
      x2 = toStartX; y2 = toY;
    } else {
      x2 = hourToPx(toOp.startDay, toOp.startHour + toOp.hours); y2 = toY;
    }

    // Orthogonal path
    const midX = (x1 + x2) / 2;
    const path = `M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2},${y2}`;
    const labelX = midX;
    const labelY = (y1 + y2) / 2;

    const color = c.type === "FS" ? "var(--wx-blue-500)" :
                  c.type === "SS" ? "var(--wx-green-500)" :
                  c.type === "FF" ? "var(--wx-amber-500)" : "var(--wx-cyan-500)";
    const dash = c.type === "FS" ? "" : "6 4";

    return { path, x2, y2, labelX, labelY, color, dash, type: c.type };
  };

  const totalHeight = rows.length * ROW_H;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumb">Operations · Process Template</div>
          <h1>Process Template · {MOCK_TEMPLATE.name}</h1>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => alert("Validation complete — 0 conflicts detected.")}><Icon.check/>Validate</button>
          <button className="btn btn-primary" onClick={() => alert("Auto Schedule completed. 7 operations optimally placed.")}><Icon.cal/>Auto Schedule</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Gantt Chart · {MOCK_TEMPLATE.stages.reduce((a, s) => a + s.operations.length, 0)} Operations across {MOCK_TEMPLATE.stages.length} Stages</h3>
          <div style={{display:"flex", gap:4, alignItems:"center"}}>
            <span style={{fontSize:11, color:"var(--wx-fg-3)", marginRight:4}}>Zoom</span>
            <button className="btn btn-ghost" style={{height:28, padding:"0 6px"}} onClick={() => zoom(-4)}><Icon.zoomOut/></button>
            <span style={{fontSize:11, color:"var(--wx-fg-3)", fontFamily:"var(--wx-font-mono)", minWidth:32, textAlign:"center"}}>{hourWidth}px</span>
            <button className="btn btn-ghost" style={{height:28, padding:"0 6px"}} onClick={() => zoom(4)}><Icon.zoomIn/></button>
          </div>
        </div>
        <div className="card-body flush">
          <div className="gantt-wrap">
            {/* === SIDEBAR === */}
            <div className="gantt-sidebar">
              {/* Sidebar header */}
              <div className="row depth-0" style={{height:46, borderBottom:"1px solid var(--wx-border)", background:"var(--wx-surface-2)", fontWeight:500, fontSize:11.5, letterSpacing:"0.04em", textTransform:"uppercase", color:"var(--wx-fg-3)"}}>
                Template
              </div>
              {/* Peak placeholder row */}
              <div className="row" style={{height:8, padding:0, cursor:"default", borderBottom:"1px solid var(--wx-divider)"}}/>
              {/* Data rows */}
              {rows.map((row) => (
                <div
                  key={row.id}
                  className={"row depth-" + row.depth + (activeRow === row.id ? " active" : "")}
                  onClick={() => { setActiveRow(row.id); if (row.type === "operation") setDetail(row.op); }}
                  onMouseEnter={() => setActiveRow(row.id)}
                >
                  <span className="indent" style={{width: row.depth * 16}}/>
                  {row.type === "stage" && (
                    <span className="toggle" onClick={(e) => { e.stopPropagation(); toggleStage(row.id); }}>
                      {expanded[row.id] ? <Icon.collapse/> : <Icon.expand/>}
                    </span>
                  )}
                  {row.type === "template" && <span className="toggle"><Icon.collapse/></span>}
                  {row.type === "stage" && (
                    <span className="stage-bar" style={{background: STAGE_COLORS[row.color]?.primary}}/>
                  )}
                  {row.type === "operation" && <span style={{width:3, marginRight:8, flexShrink:0}}/>}
                  <span style={{overflow:"hidden", textOverflow:"ellipsis"}}>{row.name}</span>
                  {row.type === "operation" && (
                    <span className="meta">{row.op.personnel}p · {row.op.hours}h</span>
                  )}
                  {row.type === "stage" && (
                    <span className="meta">{row.stage.operations.length} ops</span>
                  )}
                </div>
              ))}
            </div>

            {/* === TIMELINE === */}
            <div className="gantt-timeline-wrap" ref={timelineRef}>
              <div className="gantt-timeline" style={{width: totalWidth}}>
                {/* Axis header */}
                <div className="gantt-axis">
                  {Array.from({length: TOTAL_DAYS}, (_, d) => (
                    <div key={d} className="day-col" style={{width: dayWidth}}>
                      <div className="day-label">Day {d}</div>
                      <div className="hours">
                        {[0,3,6,9,12,15,18,21].map(h => (
                          <span key={h} className="hr-label" style={{width: hourWidth * 3}}>{h}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Peak heat row */}
                <div className="gantt-peak-row">
                  {peakData.map((p, i) => (
                    <div key={i} className="gantt-peak-bar" style={{width: dayWidth, background: peakColor(p.ratio)}} title={`Peak: ${p.value} personnel`}/>
                  ))}
                </div>

                {/* Grid area */}
                <div className="gantt-grid" style={{height: totalHeight, position:"relative"}}>
                  {/* Work hour backgrounds */}
                  {Array.from({length: TOTAL_DAYS}, (_, d) => (
                    <div key={"wk"+d} className="gantt-work-bg" style={{left: hourToPx(d, 9), width: hourWidth * 8}}/>
                  ))}

                  {/* Day lines */}
                  {Array.from({length: TOTAL_DAYS + 1}, (_, d) => (
                    <div key={"dl"+d} className={"gantt-day-line" + (d === 0 ? " origin" : "")} style={{left: d * dayWidth}}/>
                  ))}

                  {/* Hour lines */}
                  {Array.from({length: TOTAL_DAYS}, (_, d) => (
                    [3,6,9,12,15,18,21].map(h => (
                      <div key={"hl"+d+"-"+h} className="gantt-hour-line" style={{left: hourToPx(d, h)}}/>
                    ))
                  ))}

                  {/* Grid rows (background) */}
                  {rows.map((row, i) => (
                    <div
                      key={"gr"+row.id}
                      className={"gantt-grid-row" + (activeRow === row.id ? " active" : "")}
                      onMouseEnter={() => setActiveRow(row.id)}
                    />
                  ))}

                  {/* Stage bars */}
                  {rows.filter(r => r.type === "stage" && expanded[r.id]).map((row) => {
                    const ops = row.stage.operations;
                    if (ops.length === 0) return null;
                    const minH = Math.min(...ops.map(o => o.startDay * 24 + o.startHour));
                    const maxH = Math.max(...ops.map(o => o.startDay * 24 + o.startHour + o.hours));
                    const rowIdx = rows.indexOf(row);
                    const firstOpIdx = rows.findIndex(r => r.type === "operation" && r.stage === row.stage);
                    const lastOpIdx = rows.length - 1 - [...rows].reverse().findIndex(r => r.type === "operation" && r.stage === row.stage);
                    const topOffset = firstOpIdx * ROW_H + (ROW_H - 20) / 2;
                    const height = (lastOpIdx - firstOpIdx + 1) * ROW_H - (ROW_H - 20);
                    const sc = STAGE_COLORS[row.color];
                    return (
                      <div key={"sb"+row.id} className="gantt-stage-bar" style={{
                        left: minH * hourWidth,
                        width: (maxH - minH) * hourWidth,
                        top: topOffset,
                        height: height,
                        borderColor: sc?.primary,
                        background: sc?.primary + "0F",
                      }}/>
                    );
                  })}

                  {/* Time window bars */}
                  {rows.filter(r => r.type === "operation").map((row) => {
                    const op = row.op;
                    const rowIdx = rows.indexOf(row);
                    const sc = STAGE_COLORS[row.color];
                    const wLeft = hourToPx(op.startDay, op.windowStart);
                    const wWidth = op.windowHours * hourWidth;
                    const rawColor = row.color === "Cell Culture" ? "#0B3D7F" : "#3AA8C1";
                    return (
                      <div key={"tw"+op.id} className="gantt-window-bar" style={{
                        left: wLeft,
                        width: wWidth,
                        top: rowIdx * ROW_H + (ROW_H - 20) / 2,
                        borderColor: rawColor + "60",
                        background: `repeating-linear-gradient(45deg, ${rawColor}0D 0px, ${rawColor}0D 4px, ${rawColor}1A 4px, ${rawColor}1A 8px)`,
                      }}/>
                    );
                  })}

                  {/* Operation bars */}
                  {rows.filter(r => r.type === "operation").map((row) => {
                    const op = row.op;
                    const rowIdx = rows.indexOf(row);
                    const sc = STAGE_COLORS[row.color];
                    const left = hourToPx(op.startDay, op.startHour);
                    const width = op.hours * hourWidth;
                    return (
                      <div
                        key={"ob"+op.id}
                        className="gantt-bar"
                        style={{
                          left, width,
                          top: rowIdx * ROW_H + (ROW_H - 24) / 2,
                          background: sc?.primary,
                        }}
                        onMouseMove={(e) => showTip(e, op, row.color)}
                        onMouseLeave={hideTip}
                        onDoubleClick={() => setDetail(op)}
                      >
                        <span className="resize-handle left"/>
                        {width > 50 && op.name}
                        <span className="resize-handle right"/>
                      </div>
                    );
                  })}

                  {/* Constraint arrows SVG */}
                  <svg className="gantt-constraints" width={totalWidth} height={totalHeight} style={{overflow:"visible"}}>
                    <defs>
                      <marker id="arrowBlue" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="var(--wx-blue-500)"/>
                      </marker>
                      <marker id="arrowGreen" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="var(--wx-green-500)"/>
                      </marker>
                      <marker id="arrowAmber" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="var(--wx-amber-500)"/>
                      </marker>
                      <marker id="arrowCyan" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="var(--wx-cyan-500)"/>
                      </marker>
                    </defs>
                    {MOCK_TEMPLATE.constraints.map((c, i) => {
                      const cp = buildConstraintPath(c);
                      if (!cp) return null;
                      const markerId = c.type === "FS" ? "arrowBlue" : c.type === "SS" ? "arrowGreen" : c.type === "FF" ? "arrowAmber" : "arrowCyan";
                      return (
                        <g key={i}>
                          <path d={cp.path} fill="none" stroke={cp.color} strokeWidth="1.5"
                            strokeDasharray={cp.dash} markerEnd={`url(#${markerId})`}/>
                          <rect className="gantt-constraint-pill" x={cp.labelX - 10} y={cp.labelY - 8} width="20" height="16" rx="6"/>
                          <text className="gantt-constraint-label" x={cp.labelX} y={cp.labelY + 3}>{cp.type}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Tooltip */}
                {tooltip && (
                  <div className="gantt-tip on" style={{left: tooltip.x, top: tooltip.y}}>
                    <div className="tip-title">{tooltip.name}</div>
                    <div className="tip-row"><span>Start</span><span className="val">Day {tooltip.startDay} {String(tooltip.startHour).padStart(2,"0")}:00</span></div>
                    <div className="tip-row"><span>End</span><span className="val">Day {tooltip.endDay} {String(tooltip.endHour).padStart(2,"0")}:00</span></div>
                    <div className="tip-row"><span>Duration</span><span className="val">{tooltip.hours}.0h</span></div>
                    <div className="tip-row"><span>Resource</span><span className="val">{tooltip.personnel} operators</span></div>
                  </div>
                )}

                {/* Detail panel */}
                <div className={"gantt-detail" + (detail ? " open" : "")}>
                  {detail && (
                    <>
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4}}>
                        <h4>{detail.name}</h4>
                        <button className="btn btn-ghost" style={{height:28, padding:"0 6px"}} onClick={() => setDetail(null)}>✕</button>
                      </div>
                      <div className="sub">Operation · {MOCK_TEMPLATE.name}</div>
                      <hr className="div"/>
                      <div className="field"><div className="lbl">Start</div><div className="val mono">Day {detail.startDay} · {String(detail.startHour).padStart(2,"0")}:00</div></div>
                      <div className="field"><div className="lbl">Duration</div><div className="val mono">{detail.hours}.0 hours</div></div>
                      <div className="field"><div className="lbl">Personnel</div><div className="val">{detail.personnel} operators</div></div>
                      <div className="field"><div className="lbl">Time Window</div><div className="val mono">{String(detail.windowStart).padStart(2,"0")}:00 – {String(detail.windowStart + detail.windowHours).padStart(2,"0")}:00 ({detail.windowHours}h)</div></div>
                      <div className="field">
                        <div className="lbl">Constraints</div>
                        <div style={{display:"flex", gap:6, flexWrap:"wrap", marginTop:4}}>
                          {MOCK_TEMPLATE.constraints.filter(c => c.from === detail.id || c.to === detail.id).map((c, i) => (
                            <span key={i} className={"chip chip-" + (c.type === "FS" ? "info" : c.type === "SS" ? "ok" : "warn")}>
                              <span className="dot"/>
                              {c.type} {c.from === detail.id ? "→" : "←"} {opMap[c.from === detail.id ? c.to : c.from]?.name}
                              {c.lag > 0 && ` +${c.lag}h`}
                            </span>
                          ))}
                        </div>
                      </div>
                      <hr className="div"/>
                      <div className="field"><div className="lbl">Status</div>
                        <span className="chip chip-info" style={{marginTop:4}}><span className="dot"/>Scheduled</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{marginTop:16, display:"flex", gap:24, flexWrap:"wrap", fontSize:12, color:"var(--wx-fg-3)"}}>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:10, height:10, borderRadius:2, background:"var(--wx-blue-700)"}}/>Cell Culture Ops
        </span>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:10, height:10, borderRadius:2, background:"var(--wx-cyan-500)"}}/>Purification Ops
        </span>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:20, height:10, borderRadius:2, border:"1.5px dashed var(--wx-blue-500)", background:"rgba(11,61,127,0.06)"}}/>Stage Span
        </span>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:20, height:10, borderRadius:2, background:"repeating-linear-gradient(45deg, #0B3D7F0D 0px, #0B3D7F0D 3px, #0B3D7F1A 3px, #0B3D7F1A 6px)"}}/>Time Window
        </span>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:10, height:2, background:"var(--wx-blue-500)"}}/>FS
        </span>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:10, height:2, background:"var(--wx-green-500)", backgroundImage:"repeating-linear-gradient(90deg, var(--wx-green-500) 0px, var(--wx-green-500) 4px, transparent 4px, transparent 7px)"}}/>SS
        </span>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:10, height:4, borderRadius:999, background:"var(--wx-green-100)"}}/>Low Peak
        </span>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:10, height:4, borderRadius:999, background:"var(--wx-amber-100)"}}/>Med Peak
        </span>
        <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
          <span style={{width:10, height:4, borderRadius:999, background:"var(--wx-red-100)"}}/>High Peak
        </span>
      </div>
    </div>
  );
}

window.ProcessGantt = ProcessGantt;
