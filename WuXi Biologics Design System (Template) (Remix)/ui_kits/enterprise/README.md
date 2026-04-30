# WuXi Biologics Enterprise UI Kit

A high-fidelity recreation of an enterprise GMP/CRDMO operations console. This kit demonstrates the WuXi Biologics design language applied to a typical biomanufacturing surface: dashboard with KPIs, an active batch list, a bioreactor floor view, and a deviation detail.

> ⚠️ This is an **interpretive recreation** — built from the brand brief, not from a production codebase. Layout patterns and copy are intended as a credible reference for what a WuXi Biologics-style frontend should feel like.

## Files

- `index.html` — interactive click-thru of the console
- `App.jsx` — top-level layout, routing
- `TopNav.jsx`, `SideNav.jsx` — chrome
- `Dashboard.jsx` — KPI overview + capacity trend
- `BatchList.jsx` — active batches table
- `FloorView.jsx` — bioreactor grid
- `DeviationDetail.jsx` — deviation drilldown

## Screens covered

1. **Overview Dashboard** — KPI tiles, capacity utilization chart, alerts queue.
2. **Batch Execution** — sortable lot listing with stage stepper.
3. **Floor View** — bioreactor grid, status overlay.
4. **Deviation Detail** — investigation timeline, evidence panel.
