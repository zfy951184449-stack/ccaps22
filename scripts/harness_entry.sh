#!/usr/bin/env bash
# Harness entry point — backend-agnostic.
# Validates repo root, then delegates to harness/manager.py.
#
# Usage:
#   scripts/harness_entry.sh "task text"
#   scripts/harness_entry.sh --resume <run-id>
#   scripts/harness_entry.sh --backend claude "task text"
#   scripts/harness_entry.sh --backend codex "task text"
#   scripts/harness_entry.sh --dry-run "task text"
#
# The backend can also be set in harness/config/settings.json ("backend" key).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Validate repo root
if [[ ! -f "${REPO_ROOT}/AGENTS.md" || ! -d "${REPO_ROOT}/harness" ]]; then
  echo "[harness] error=Repository root is invalid: ${REPO_ROOT}" >&2
  exit 1
fi

# Check Python available
if ! command -v python3 >/dev/null 2>&1; then
  echo "[harness] error=python3 is not available in PATH." >&2
  exit 1
fi

# Require at least one argument
if [[ $# -eq 0 ]]; then
  echo "Usage: scripts/harness_entry.sh \"task text\"" >&2
  echo "   or: scripts/harness_entry.sh --resume <run-id>" >&2
  echo "   or: scripts/harness_entry.sh --backend claude|codex|dryrun \"task text\"" >&2
  echo "   or: scripts/harness_entry.sh --dry-run \"task text\"" >&2
  exit 1
fi

cd "${REPO_ROOT}"
export MFG8APS_HARNESS_ACTIVE="${MFG8APS_HARNESS_ACTIVE:-1}"

exec python3 "${REPO_ROOT}/harness/manager.py" "$@"
