---
name: biopharma-roster
description: Use when the task involves biopharma workforce scheduling, shift planning, handover coverage, qualification validity, gowning transitions, and labor rest constraints.
---

# Biopharma Roster

Use this skill for workforce and shift logic in biopharma CMO scheduling.

## When to use

Trigger for tasks involving:

- shift template / shift assignment / roster generation
- handover overlap / continuous coverage / no-unattended-run windows
- operator qualification and qualification expiry
- gowning / de-gowning and cross-zone transition time
- rest constraints (`min_rest_between_shifts`, `max_consecutive_days`, night-shift caps)

## Coordination with `biopharma-cmo`

- If task is purely workforce, use this skill only.
- If task contains both process feasibility and workforce coverage, use both skills.
- Process hard boundaries from `biopharma-cmo` take precedence over staffing convenience.

## Required workflow

1. Read `references/roster-constraints.md`.
2. Read `references/repo-mapping.md`.
3. If process coupling exists, load `biopharma-cmo` and validate `FLOW_WINDOW`/`QUALITY_GATE` first.
4. Output workforce rules with explicit constraint contract fields.

## Mandatory workforce rule interface

Each workforce rule must map to:

- `constraint_code`
- `severity`
- `hard_or_soft`
- `violation_message_template`

And explicitly declare these semantics:

- `qualification_constraint`
- `handover_overlap`
- `cross_zone_gowning_time`
- `min_rest_between_shifts`

## Non-negotiables

- Do not assign unqualified personnel to critical operations.
- Do not permit shift handover gaps for continuous processes.
- Do not ignore gowning/de-gowning travel/setup time.
- Do not resolve infeasibility by silent overtime extension.

## References

- `references/roster-constraints.md`
- `references/repo-mapping.md`
