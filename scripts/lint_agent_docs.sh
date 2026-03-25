#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required_paths=(
  "AGENTS.md"
  "docs/README.md"
  "docs/exec-plans/README.md"
  "docs/exec-plans/active"
  "docs/exec-plans/completed"
  "docs/exec-plans/tech-debt-tracker.md"
  ".agent/rules/README.md"
  ".agent/rules/codex-coding-rules.md"
  ".agent/rules/codex-plan-collaboration-rules.md"
  ".agent/rules/codex-backend-api-rules.md"
  ".agent/rules/codex-frontend-ui-rules.md"
  ".agent/rules/codex-solver-v4-rules.md"
  ".agent/rules/codex-runtime-restart-rules.md"
  ".agent/workflows/add-constraint.md"
  "docs/LLM_DB_GUIDELINES.md"
  "docs/scheduling_principles.md"
)

for path in "${required_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "Missing required agent-doc path: $path" >&2
    exit 1
  fi
done

agents_lines="$(wc -l < AGENTS.md | tr -d ' ')"
if (( agents_lines > 140 )); then
  echo "AGENTS.md should stay concise. Current line count: $agents_lines (limit: 140)." >&2
  exit 1
fi

for ref in \
  ".agent/rules/README.md" \
  "docs/README.md" \
  "docs/exec-plans/" \
  "scripts/lint_agent_docs.sh"; do
  if ! rg -Fq "$ref" AGENTS.md; then
    echo "AGENTS.md is missing expected reference: $ref" >&2
    exit 1
  fi
done

for rule in \
  "codex-coding-rules.md" \
  "codex-plan-collaboration-rules.md" \
  "codex-backend-api-rules.md" \
  "codex-frontend-ui-rules.md" \
  "codex-solver-v4-rules.md" \
  "codex-runtime-restart-rules.md"; do
  if ! rg -Fq "$rule" .agent/rules/README.md; then
    echo ".agent/rules/README.md is missing rule index entry: $rule" >&2
    exit 1
  fi
done

echo "Agent-doc layout OK"
