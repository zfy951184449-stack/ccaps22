# V3 Bioprocess Sandbox Pilot

Status: active

## Goal

Deliver a parallel V3 pilot that proves process-first biopharma modeling without disturbing the existing APS database or legacy UI/runtime.

## Scope

- Add a dedicated `aps_system_v3` schema for V3 process semantics, reusable operation packages, dual state machines, projection runs, and projection risks.
- Mirror a trimmed subset of legacy master data into V3 for sandbox projection and risk analysis.
- Add backend APIs for V3 template listing, legacy-to-V3 sync status, sync execution, and projection preview.
- Add a standalone `frontend-next` route for the unified resource gantt sandbox.
- Keep legacy CRA pages, legacy process-template flows, and current batch planning contracts unchanged.

## Decisions

- V3 uses a separate schema instead of mutating legacy template tables.
- Legacy tables stay the operational source of truth; V3 only mirrors the subset required for preview and conflict detection.
- Preview is driven by V3 main-flow nodes, trigger rules, operation packages, and equipment/material state semantics.
- The first cut does not auto-pick the best equipment. It projects against template default bindings and emits explicit risks when bindings or mirrored resources are missing.
- The first UI cut uses one integrated gantt surface only: main band, auxiliary band, and equipment-state band per resource row.

## Pilot Coverage

- USP upstream culture with thaw, inoculation, culture, passage, harvest.
- Triggered sampling, recurring daily sampling windows, and feed-after-sample logic.
- SUS bioreactor setup package and media-fill package as preconditions for culture.
- SS chromatography / UFDF style setup via CIP/SIP package for a representative downstream flow.
- Media/buffer preparation as an additional material-state example.

## Verification Target

- `database/migrations/20260327_create_v3_bioprocess_schema.sql` can be applied independently.
- `backend` builds and V3 route tests pass.
- `frontend-next` builds and the new route resolves inside the existing shell.
- Legacy backend/frontend entrypoints remain untouched from a runtime-contract perspective.

## Current Phase

- Phase 2 is now focused on a no-migration draft sandbox instead of schema persistence first.
- `resource-planning-v3` is being expanded into one route with three tabs:
  - `沙盘`
  - `设备管理`
  - `工艺逻辑`
- Formal equipment still comes from legacy `resources` and `resource_nodes`.
- Manual state segments, node equipment overrides, and main-operation time overrides are kept in browser-local draft storage and only affect backend results after explicit recompute.

## Progress Log

### 2026-03-28: No-migration draft sandbox implemented

- Backend V3 preview now accepts draft state segments, node binding overrides, visible pinned equipment, and main-operation overrides without requiring any V3 persistence tables to exist.
- Embedded fallback templates were added so template list/detail and preview remain usable even when `aps_system_v3` has not been migrated yet.
- Resource context for preview now falls back to legacy `resources`, `maintenance_windows`, and `resource_assignments` when V3 mirror tables are unavailable.
- `frontend-next` `resource-planning-v3` was refactored into a three-tab workbench with:
  - explicit recompute
  - local draft caching
  - manual state-band authoring
  - legacy equipment pinning / binding
  - process-logic summaries and local node overrides
