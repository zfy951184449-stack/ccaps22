function App() {
  const [route, setRoute] = React.useState("overview");

  return (
    <div className="app" data-screen-label={"01 " + route}>
      <TopNav route={route} setRoute={setRoute}/>
      <SideNav route={route} setRoute={setRoute}/>
      <main className="main">
        {route === "overview"  && <Dashboard
          goBatch={() => setRoute("batches")}
          goFloor={() => setRoute("floor")}
          goDev={() => setRoute("deviation")}/>}
        {route === "batches"   && <BatchList goDev={() => setRoute("deviation")}/>}
        {route === "floor"     && <FloorView/>}
        {route === "deviation" && <DeviationDetail goBatch={() => setRoute("batches")}/>}
        {route === "gantt"     && <ProcessGantt/>}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
