---
trigger: always_on
description: Base Codex rules for the APS monorepo. Apply after AGENTS.md and before any task-specific rule files.
---

# Codex Base Rules

This file carries only repo-wide workflow and rule-hygiene guidance.

Hard invariants, verification matrix, and final handoff requirements live in `AGENTS.md` and are not duplicated here.

Load order:

1. `AGENTS.md`
2. this file
3. the smallest relevant specialized rule files from `.agent/rules/README.md`
4. linked docs and workflows

## 1. Working Model

1. Treat repository work as end-to-end implementation, not isolated file editing.
2. Read the affected chain before changing code:
   - backend: `routes -> controllers -> services -> models/database`
   - frontend: `pages/components -> services -> types`
   - solver V4: `assembler -> contracts -> constraints/core -> apply/result consumer`
3. Make the smallest coherent change that closes the request.
4. When code semantics change, update the relevant repo docs in the same change.
5. For cross-layer tasks, anchor on `docs/ARCHITECTURE.md` before chasing leaf files.

## 2. Use Repo Artifacts Deliberately

1. Prefer versioned repo artifacts over chat-only guidance.
2. Durable domain knowledge belongs in `docs/`; manual procedures belong in `.agent/workflows/`.
3. If repeated review feedback keeps appearing, promote it into a rule, workflow, script, test, or lint check.
4. If a doc or rule stops matching code, update or delete it quickly instead of keeping drift alive.

## 3. Keep The Rules Healthy

1. Keep this file short. Push detail into specialized rules, workflows, or docs.
2. The active executable ruleset is the manifest in `.agent/rules/README.md`; do not leave shadow rules beside it.
3. If a prose rule can be enforced mechanically, prefer code over documentation.
