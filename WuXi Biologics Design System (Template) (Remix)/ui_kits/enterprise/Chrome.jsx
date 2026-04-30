function TopNav({ route, setRoute }) {
  const links = [
    { id: "overview", label: "Overview" },
    { id: "batches", label: "Operations" },
    { id: "floor", label: "Floor" },
    { id: "deviation", label: "Quality" },
  ];
  return (
    <>
      <div className="topnav-logo">
        <img src="../../assets/logo-mark.svg" alt="" style={{width:28, height:28}}/>
        <div style={{display:"flex", flexDirection:"column", gap:2}}>
          <strong>WuXi Biologics</strong>
          <span>药明生物</span>
        </div>
      </div>
      <div className="topnav">
        <div className="links">
          {links.map(l => (
            <span key={l.id}
              className={"lk " + (route === l.id ? "on" : "")}
              onClick={() => setRoute(l.id)}>{l.label}</span>
          ))}
        </div>
        <div className="right">
          <div className="search">
            <Icon.search/>
            <input placeholder="Search lots, deviations, BR…"/>
          </div>
          <span className="env">GMP · Wuxi MFG18</span>
          <span style={{color:"var(--wx-fg-3)"}}><Icon.bell/></span>
          <span className="ava">LZ</span>
        </div>
      </div>
    </>
  );
}

function SideNav({ route, setRoute }) {
  const Item = ({id, ic, label, badge}) => (
    <div className={"item " + (route === id ? "active" : "")} onClick={() => setRoute(id)}>
      <span className="ic">{ic}</span>{label}
      {badge ? <span className="badge">{badge}</span> : null}
    </div>
  );
  return (
    <nav className="sidenav">
      <h6>Operations</h6>
      <Item id="overview" ic={<Icon.trend/>} label="Dashboard"/>
      <Item id="batches"  ic={<Icon.batch/>} label="Batch Execution"/>
      <Item id="floor"    ic={<Icon.bioreactor/>} label="Floor View"/>
      <div className="item"><span className="ic"><Icon.cal/></span>Schedule</div>
      <h6>Quality</h6>
      <Item id="deviation" ic={<Icon.alert/>} label="Deviations" badge="3"/>
      <div className="item"><span className="ic"><Icon.shield/></span>QA Releases</div>
      <div className="item"><span className="ic"><Icon.doc/></span>Audit Log</div>
      <h6>Resources</h6>
      <div className="item"><span className="ic"><Icon.fac/></span>Facilities</div>
      <div className="item"><span className="ic"><Icon.user/></span>Operators</div>
      <div className="item"><span className="ic"><Icon.globe/></span>Global Sites</div>
    </nav>
  );
}

window.TopNav = TopNav;
window.SideNav = SideNav;
