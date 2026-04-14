---
name: biopharma-roster
description: Use when the task involves biopharma workforce scheduling, shift planning, handover coverage, qualification validity, gowning transitions, and labor rest constraints.
---

# Biopharma Roster

Use this skill only for workforce and shift logic in biopharma CMO scheduling.

## Trigger

- shift assignment or roster generation
- handover overlap or continuous coverage
- qualification validity or qualification expiry
- gowning / de-gowning / cross-zone transition time
- rest constraints such as `min_rest_between_shifts` or `max_consecutive_days`

## Read Order

1. `references/roster-constraints.md`
2. `references/repo-mapping.md` only if you need contract mapping details

Read only these files by default. Do not expand the whole skill tree.

## Use With `biopharma-cmo`

- Add `biopharma-cmo` when the same task also changes process feasibility, quality gates, equipment states, or utility constraints.

## Non-Negotiables

- Do not assign unqualified personnel to critical operations.
- Do not permit handover gaps for continuous processes.
- Do not ignore gowning or travel/setup time across zones.
- Do not resolve infeasibility by silent overtime extension.
