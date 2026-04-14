---
name: biopharma-cmo
description: Use when the task involves biopharma CMO production planning, APS scheduling, or process semantics such as USP/DSP, campaign, hold time, CIP/SIP, QC release, suite segregation, and utility bottlenecks.
---

# Biopharma CMO

Use this skill only when the task depends on real biopharma process, equipment, quality, or utility semantics.

## Trigger

- USP / DSP / campaign / batch / ancillary flow semantics
- hold time / zero-wait / QC release / sterility blind period
- CIP / SIP / DHT / CHT / changeover / turnover
- WFI / PW / CIP skid / suite segregation / pre-post viral boundaries
- APS behavior that depends on the above terms

## Read Order

1. `references/process-constraints.md`
2. `references/repo-mapping.md` only if you need contract or UI mapping details

Read only these files by default. Do not open all references unless the task needs them.

## Use With `biopharma-roster`

- Add `biopharma-roster` only when workforce coverage, qualification, handover, gowning, or rest rules are part of the same task.

## Non-Negotiables

- Do not model biopharma CMO as a generic job shop.
- Do not hide infeasibility by silent rescheduling.
- Preserve `completed` vs `released`.
- Preserve equipment states such as `cleaning_cip`, `sterilizing_sip`, `dirty_hold`, and `clean_hold`.
