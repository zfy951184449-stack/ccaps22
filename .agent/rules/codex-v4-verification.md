---
trigger: manual
description: Codex-compatible verification and review rules for V4 scheduling hardening before V2 archival.
---

# Codex V4 Verification Rules

This rule converts the older agent-oriented rules into a Codex workflow that is directly executable inside this repo.

## Scope

Apply this rule whenever a change touches any of:

- `backend/src/controllers/schedulingV4Controller.ts`
- `backend/src/services/schedulingV4/`
- `solver_v4/`
- lock/assignment persistence related code

## Execution Rules

1. Do not rely on service restarts as proof of correctness.
2. Always verify through buildable artifacts and deterministic test commands.
3. When V4 persistence changes, preserve backward compatibility of `result_summary`.
4. When V4 apply logic changes, preserve locked rows instead of deleting or overwriting them.
5. Use `shift_plan_id` as the source of truth for shift linkage. Do not infer linkage from `shift_code`.
6. Do not hardcode shift `plan_category` to `'BASE'`. Derive it from shift definition plus task presence.
7. If the change touches `frontend/src/components/SolverV4/`, the verification pass must include a frontend production build.

## Minimum Verification Matrix

Run:

```bash
scripts/verify_v4_archive.sh
```

This script must complete successfully before closing the task.

## Review Checklist

- Are `locked_operations` assembled in backend and parsed in solver contracts?
- Are `locked_shifts` assembled in backend and enforced in solver constraints?
- Does `applySolveResultV4` preserve `is_locked = 1` assignments and shift plans?
- Does `applySolveResultV4` repopulate `batch_personnel_assignments.shift_plan_id` after writing shift plans?
- Is `result_summary` still readable by existing V4 result APIs?
- Were new solver rules covered by unit tests?

## Escalation

If any verification step fails:

1. Fix the code or the rule gap.
2. Re-run the script.
3. Report residual risk explicitly if a dependency prevents a check from running.
