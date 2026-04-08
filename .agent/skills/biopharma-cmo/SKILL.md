---
name: biopharma-cmo
description: Use when the task involves biopharma CMO production planning, APS scheduling, or process semantics such as USP/DSP, campaign, hold time, CIP/SIP, QC release, suite segregation, and utility bottlenecks.
---

# Biopharma CMO

Use this skill when the task depends on real biopharmaceutical CMO process semantics rather than generic manufacturing assumptions.

## When to use

Trigger this skill for tasks involving any of:

- USP / DSP / campaign / batch / ancillary flow semantics
- hold time / zero-wait / shelf life / QC release / sterility blind period
- CIP / SIP / DHT / CHT / changeover / turnover
- WFI / PW / CIP skid / utility leveling / suite mutex / pre-post viral segregation
- APS scheduling behavior in API, database, solver, or UI

## Trigger governance with `biopharma-roster`

- Use only `biopharma-cmo` for pure process/equipment/quality/utility constraints.
- Use only `biopharma-roster` for pure shift/qualification/handover/gowning/rest work.
- Use both skills when process scheduling and workforce coverage are coupled.

Priority order:

1. `FLOW_WINDOW` + `QUALITY_GATE` + `SPACE_SEGREGATION`
2. `EQUIPMENT_STATE` + `UTILITY_CAPACITY`
3. `WORKFORCE_COVERAGE`

## Required workflow

1. Read `references/process-constraints.md` first (global semantic source).
2. Read `references/repo-mapping.md` for contract mapping.
3. If workforce logic appears, load `biopharma-roster` before finalizing.
4. Treat product-specific values as data; do not invent constants.

## Mandatory interfaces

Every rule/check must be mappable to:

- `constraint_code`
- `severity`
- `hard_or_soft`
- `violation_message_template`

And status semantics must preserve:

- task: `completed` vs `released`
- equipment: `cleaning_cip`, `sterilizing_sip`, `dirty_hold`, `clean_hold`
- QC and material states as explicit enums

## Non-negotiables

- Do not model biopharma CMO as generic job shop.
- Do not silently reschedule to hide infeasibility.
- Do not flatten quality gates into generic completion.
- Do not collapse equipment to idle/busy when cleaning/hold states matter.
- Do not redefine terms already fixed by global references.

## References

- `references/process-constraints.md`
- `references/repo-mapping.md`
