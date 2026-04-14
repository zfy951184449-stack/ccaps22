#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

required_paths=(
  "AGENTS.md"
  ".agent/index.md"
  ".agent/rules/README.md"
  ".agent/workflows/multi-persona-task.md"
  ".agent/personas/README.md"
  ".agent/personas/host.md"
  ".agent/personas/reviewer.md"
  ".agent/personas/qa.md"
  ".agent/skills/biopharma-cmo/SKILL.md"
  ".agent/skills/biopharma-cmo/agents/openai.yaml"
  ".agent/skills/biopharma-roster/SKILL.md"
  ".agent/skills/biopharma-roster/agents/openai.yaml"
  "docs/README.md"
  "docs/ARCHITECTURE.md"
  "docs/agent-rule-coverage-matrix.md"
  "docs/harness.md"
  "docs/codex-harness.md"
  "docs/frontend-visual-language.md"
  "docs/frontend-next-visual-language.md"
  "docs/LLM_DB_GUIDELINES.md"
  "docs/db-consistency-rules.md"
  "docs/scheduling_principles.md"
)

for path in "${required_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "Missing required agent-doc path: $path" >&2
    exit 1
  fi
done

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

check_line_cap "AGENTS.md" 40
check_line_cap ".agent/index.md" 40
check_line_cap ".agent/rules/README.md" 20
check_line_cap ".agent/workflows/multi-persona-task.md" 40
check_line_cap ".agent/personas/README.md" 20
check_line_cap ".agent/personas/host.md" 20
check_line_cap ".agent/personas/reviewer.md" 20
check_line_cap ".agent/personas/qa.md" 20
check_line_cap ".agent/skills/biopharma-cmo/SKILL.md" 40
check_line_cap ".agent/skills/biopharma-roster/SKILL.md" 40

agent_rule_files="$(find .agent/rules -maxdepth 1 -type f -name '*.md' | sort)"
if [[ "$agent_rule_files" != ".agent/rules/README.md" ]]; then
  echo ".agent/rules must contain only README.md in the cleaned layout." >&2
  exit 1
fi

if [[ -e ".agents" ]]; then
  echo ".agents must not exist in the cleaned layout." >&2
  exit 1
fi

for yaml_path in .agent/skills/*/agents/openai.yaml; do
  for key in name version summary default_prompt; do
    if ! rg -q "^${key}:" "$yaml_path"; then
      echo "$yaml_path is missing required key: $key" >&2
      exit 1
    fi
  done
done

forbidden_workflow_patterns=(
  "必须打回"
  "循环直到"
  "完整直播"
  "任何任务都必须"
  "先扮演"
  "再扮演"
  "3-5 次"
  "必须 commit"
)

for pattern in "${forbidden_workflow_patterns[@]}"; do
  if rg -Fq "$pattern" .agent/workflows/multi-persona-task.md; then
    echo "Workflow contains forbidden recursive/polluting pattern: $pattern" >&2
    exit 1
  fi
done

python3 - <<'PY'
from pathlib import Path
import re
import sys

ROOT = Path('.').resolve()
DOCS = [ROOT / 'AGENTS.md']
DOCS += sorted((ROOT / '.agent').rglob('*.md'))
DOCS += sorted((ROOT / 'docs').glob('*.md'))
DOCS += [ROOT / 'docs/exec-plans/README.md', ROOT / 'docs/exec-plans/tech-debt-tracker.md']
DOCS += sorted((ROOT / 'docs/exec-plans/active').glob('*.md'))
DOCS = [doc for doc in DOCS if doc.exists()]

def strip_fenced(text: str) -> str:
    return re.sub(r"```.*?```", "", text, flags=re.S)

def local_refs(text: str):
    refs = set()
    for ref in re.findall(r"`([^`\n]+)`", text):
      refs.add(ref.strip())
    for ref in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
      refs.add(ref.strip().strip("<>"))
    return refs

def should_check(ref: str) -> bool:
    if not ref:
        return False
    if any(ref.startswith(prefix) for prefix in ('http://', 'https://', 'app://', 'plugin://', 'mailto:', '#', '/', 'ws://', 'wss://')):
        return False
    if any(token in ref for token in (' && ', ' | ', ' -> ', '\n', '\r', '\t')):
        return False
    if ref.startswith('--'):
        return False
    if ' ' in ref:
        return False
    allowed_prefixes = (
        './', '../', '.agent/', 'docs/', 'backend/', 'frontend/',
        'frontend-next/', 'solver_v4/', 'scripts/', 'database/', 'archive/',
        'README.md', 'AGENTS.md'
    )
    if ref.startswith(allowed_prefixes):
        return True
    return ref.endswith(('.md', '.sh', '.yaml', '.yml', '.json', '.ts', '.tsx', '.js', '.py'))

missing = []
for doc in DOCS:
    text = strip_fenced(doc.read_text(errors='ignore'))
    refs = [ref for ref in local_refs(text) if should_check(ref)]
    for ref in sorted(set(refs)):
        rel_candidate = (doc.parent / ref).resolve()
        root_candidate = (ROOT / ref).resolve()
        if not rel_candidate.exists() and not root_candidate.exists():
            missing.append((str(doc.relative_to(ROOT)), ref))

if missing:
    for doc, ref in missing:
        print(f"Missing local reference in {doc}: {ref}", file=sys.stderr)
    sys.exit(1)

caps = {
    'AGENTS.md': 6,
    '.agent/index.md': 8,
    '.agent/rules/README.md': 3,
}
for rel_path, limit in caps.items():
    doc = ROOT / rel_path
    text = strip_fenced(doc.read_text(errors='ignore'))
    refs = [ref for ref in local_refs(text) if should_check(ref)]
    doc_refs = []
    for ref in refs:
        if ref.endswith('.md') or ref in ('.agent/personas/', '.agent/skills/', '.agent/workflows/'):
            doc_refs.append(ref)
    count = len(set(doc_refs))
    if count > limit:
        print(f"{rel_path} references too many downstream docs: {count} (limit: {limit})", file=sys.stderr)
        sys.exit(1)
PY

echo "Agent-doc layout OK"
