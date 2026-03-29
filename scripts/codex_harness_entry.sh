#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${REPO_ROOT}/AGENTS.md" || ! -d "${REPO_ROOT}/harness" ]]; then
  echo "[harness] error=Repository root is invalid: ${REPO_ROOT}" >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "[harness] error=Codex CLI is not available in PATH." >&2
  exit 1
fi

LOGIN_STATUS="$(codex login status 2>&1 || true)"
if [[ "${LOGIN_STATUS}" != *"Logged in"* ]]; then
  echo "[harness] error=Codex is not logged in. Run 'codex login' first." >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo "Usage: scripts/codex_harness_entry.sh \"task text\"" >&2
  echo "   or: scripts/codex_harness_entry.sh --resume <run-id>" >&2
  exit 1
fi

cd "${REPO_ROOT}"
export MFG8APS_HARNESS_ACTIVE="${MFG8APS_HARNESS_ACTIVE:-1}"

exec python3 "${REPO_ROOT}/harness/manager.py" "$@"
