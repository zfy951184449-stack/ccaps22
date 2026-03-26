#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

expected_rule_files=(
  "README.md"
  "codex-coding-rules.md"
  "codex-plan-collaboration-rules.md"
  "codex-runtime-restart-rules.md"
  "codex-backend-api-rules.md"
  "codex-frontend-ui-rules.md"
  "codex-solver-v4-rules.md"
)

legacy_rule_files=(
  "runtime-integrity.md"
  "or-tool-rules.md"
  "ortool-rule.md"
  "ortool-rules.md"
  "ortool-model.md"
)

required_paths=(
  "AGENTS.md"
  "docs/ARCHITECTURE.md"
  "docs/agent-rule-coverage-matrix.md"
  "docs/frontend-visual-language.md"
  "docs/README.md"
  "docs/db-consistency-rules.md"
  "docs/biopharma-cmo-domain.md"
  "docs/biopharma-cmo-rules.md"
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
  ".agent/workflows/codex-v4-verification.md"
  ".agent/workflows/maintain-rules.md"
  "docs/LLM_DB_GUIDELINES.md"
  "docs/scheduling_principles.md"
)

for path in "${required_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "Missing required agent-doc path: $path" >&2
    exit 1
  fi
done

actual_rule_files=()
while IFS= read -r path; do
  actual_rule_files+=("$(basename "$path")")
done < <(find .agent/rules -maxdepth 1 -type f -name '*.md' | sort)

expected_manifest="$(printf '%s\n' "${expected_rule_files[@]}" | sort)"
actual_manifest="$(printf '%s\n' "${actual_rule_files[@]}" | sort)"
if [[ "$expected_manifest" != "$actual_manifest" ]]; then
  echo "Unexpected .agent/rules manifest." >&2
  echo "Expected:" >&2
  printf '%s\n' "${expected_manifest}" | sed 's/^/  /' >&2
  echo "Actual:" >&2
  printf '%s\n' "${actual_manifest}" | sed 's/^/  /' >&2
  exit 1
fi

for legacy in "${legacy_rule_files[@]}"; do
  if [[ -e ".agent/rules/$legacy" ]]; then
    echo "Legacy rule file must not exist: .agent/rules/$legacy" >&2
    exit 1
  fi
done

for rule in "${expected_rule_files[@]}"; do
  rule_path=".agent/rules/$rule"
  if ! trigger_line="$(rg -m1 '^trigger:' "$rule_path" | sed 's/^trigger:[[:space:]]*//')"; then
    echo "Rule file is missing trigger metadata: $rule_path" >&2
    exit 1
  fi

  case "$rule" in
    README.md|codex-coding-rules.md|codex-plan-collaboration-rules.md|codex-runtime-restart-rules.md)
      expected_trigger="always_on"
      ;;
    codex-backend-api-rules.md|codex-frontend-ui-rules.md|codex-solver-v4-rules.md)
      expected_trigger="model_decision"
      ;;
    *)
      echo "No trigger policy registered for $rule_path" >&2
      exit 1
      ;;
  esac

  if [[ "$expected_trigger" != "$trigger_line" ]]; then
    echo "Unexpected trigger for $rule_path: got '$trigger_line', want '$expected_trigger'." >&2
    exit 1
  fi
done

agents_lines="$(wc -l < AGENTS.md | tr -d ' ')"
if (( agents_lines > 140 )); then
  echo "AGENTS.md should stay concise. Current line count: $agents_lines (limit: 140)." >&2
  exit 1
fi

check_line_cap() {
  local path="$1"
  local limit="$2"
  local count
  count="$(wc -l < "$path" | tr -d ' ')"
  if (( count > limit )); then
    echo "$path exceeded line cap: $count (limit: $limit)." >&2
    exit 1
  fi
}

check_line_cap ".agent/rules/README.md" 90
check_line_cap ".agent/rules/codex-coding-rules.md" 80
check_line_cap ".agent/rules/codex-plan-collaboration-rules.md" 90
check_line_cap ".agent/rules/codex-backend-api-rules.md" 120
check_line_cap ".agent/rules/codex-frontend-ui-rules.md" 120
check_line_cap ".agent/rules/codex-solver-v4-rules.md" 120
check_line_cap ".agent/rules/codex-runtime-restart-rules.md" 220
check_line_cap "docs/frontend-visual-language.md" 80

for ref in \
  ".agent/rules/README.md" \
  ".agent/workflows/" \
  "docs/ARCHITECTURE.md" \
  "docs/frontend-visual-language.md" \
  "docs/README.md" \
  "docs/exec-plans/" \
  "scripts/lint_agent_docs.sh"; do
  if ! rg -Fq "$ref" AGENTS.md; then
    echo "AGENTS.md is missing expected reference: $ref" >&2
    exit 1
  fi
done

check_required_patterns() {
  local path="$1"
  shift
  local pattern
  for pattern in "$@"; do
    if ! rg -Fq "$pattern" "$path"; then
      echo "$path is missing expected section or marker: $pattern" >&2
      exit 1
    fi
  done
}

for rule in "${expected_rule_files[@]}"; do
  if ! rg -Fq "$rule" .agent/rules/README.md; then
    echo ".agent/rules/README.md is missing rule index entry: $rule" >&2
    exit 1
  fi
done

check_required_patterns ".agent/rules/README.md" \
  "# Rule Index" \
  "## Active Manifest" \
  "## Linked Docs" \
  "## Linked Workflows" \
  "## Rule Authoring Policy"

check_required_patterns ".agent/rules/codex-coding-rules.md" \
  "# Codex Base Rules" \
  "## 1. Working Model" \
  "## 2. Use Repo Artifacts Deliberately" \
  "## 3. Keep The Rules Healthy"

check_required_patterns ".agent/rules/codex-plan-collaboration-rules.md" \
  "# Codex Plan Collaboration Rules" \
  "## 1. 何时优先提问" \
  "## 5. 输出要求"

check_required_patterns ".agent/rules/codex-runtime-restart-rules.md" \
  "# Codex Runtime Sync Rules" \
  "## 1. 核心原则" \
  "## 5. 交付要求"

check_required_patterns ".agent/rules/codex-backend-api-rules.md" \
  "# Codex Backend/API Rules" \
  "适用范围：" \
  "先读：" \
  "## 5. Backend 验证"

check_required_patterns ".agent/rules/codex-frontend-ui-rules.md" \
  "# Codex Frontend/UI Rules" \
  "适用范围：" \
  "先读：" \
  "## 5. Frontend 验证"

check_required_patterns "docs/frontend-visual-language.md" \
  "# Frontend Visual Language" \
  "## Default Direction" \
  "## Style Goals" \
  "## Page Principles" \
  "## Visual Principles" \
  "## Interaction Principles" \
  "## Technology Independence" \
  "## Convergence Rule"

check_required_patterns ".agent/rules/codex-solver-v4-rules.md" \
  "# Codex Solver V4 Rules" \
  "适用范围：" \
  "先读：" \
  "## 5. Solver 验证"

for ref in \
  "ARCHITECTURE.md" \
  "agent-rule-coverage-matrix.md" \
  "frontend-visual-language.md" \
  "../.agent/rules/README.md" \
  "../.agent/workflows/add-constraint.md" \
  "../.agent/workflows/codex-v4-verification.md" \
  "../.agent/workflows/maintain-rules.md"; do
  if ! rg -Fq "$ref" docs/README.md; then
    echo "docs/README.md is missing expected reference: $ref" >&2
    exit 1
  fi
done

for ref in \
  "../../docs/frontend-visual-language.md" \
  "../workflows/add-constraint.md" \
  "../workflows/codex-v4-verification.md" \
  "../workflows/maintain-rules.md"; do
  if ! rg -Fq "$ref" .agent/rules/README.md; then
    echo ".agent/rules/README.md is missing expected linked reference: $ref" >&2
    exit 1
  fi
done

if ! rg -Fq "docs/agent-rule-coverage-matrix.md" .agent/workflows/maintain-rules.md; then
  echo ".agent/workflows/maintain-rules.md must reference docs/agent-rule-coverage-matrix.md" >&2
  exit 1
fi

if ! rg -Fq "docs/frontend-visual-language.md" .agent/workflows/maintain-rules.md; then
  echo ".agent/workflows/maintain-rules.md must reference docs/frontend-visual-language.md" >&2
  exit 1
fi

for path in \
  ".agent/rules/codex-frontend-ui-rules.md" \
  "docs/frontend-visual-language.md"; do
  if rg -n "Ant Design \\+ CRA|Apple HIG|Apple-like|Fluent|Google|Microsoft" "$path" >/dev/null; then
    echo "$path contains forbidden external style-source wording." >&2
    exit 1
  fi
done

echo "Agent-doc layout OK"
