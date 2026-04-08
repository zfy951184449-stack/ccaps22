#!/usr/bin/env bash
# Codex-specific harness entry point.
# Kept for backward compatibility. Forces --backend codex and delegates to harness_entry.sh.
#
# For new usage, prefer scripts/harness_entry.sh which is backend-agnostic.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -eq 0 ]]; then
  echo "Usage: scripts/codex_harness_entry.sh \"task text\"" >&2
  echo "   or: scripts/codex_harness_entry.sh --resume <run-id>" >&2
  echo "" >&2
  echo "Note: This script forces --backend codex." >&2
  echo "      Use scripts/harness_entry.sh for backend-agnostic usage." >&2
  exit 1
fi

exec "${SCRIPT_DIR}/harness_entry.sh" --backend codex "$@"
