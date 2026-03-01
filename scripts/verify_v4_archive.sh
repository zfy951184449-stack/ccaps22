#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/6] Backend build"
(
  cd "$ROOT_DIR/backend"
  npm run build
)

echo "[2/6] Frontend build"
(
  cd "$ROOT_DIR/frontend"
  npm run build
)

echo "[3/6] Solver module compilation"
(
  cd "$ROOT_DIR/solver_v4"
  python3 -m compileall contracts core constraints >/dev/null
)

echo "[4/6] Solver unit tests"
(
  cd "$ROOT_DIR/solver_v4"
  python3 -m unittest \
    tests.test_shift_assignment \
    tests.test_share_group \
    tests.test_locked_constraints
)

echo "[5/6] Guardrail assertions"
rg -n "locked_operations" \
  "$ROOT_DIR/backend/src/services/schedulingV4/DataAssemblerV4.ts" \
  "$ROOT_DIR/solver_v4/contracts/request.py" >/dev/null

rg -n "locked_shifts" \
  "$ROOT_DIR/backend/src/services/schedulingV4/DataAssemblerV4.ts" \
  "$ROOT_DIR/solver_v4/contracts/request.py" >/dev/null

rg -n "shift_plan_id = \\?" \
  "$ROOT_DIR/backend/src/controllers/schedulingV4Controller.ts" >/dev/null

if rg -n "const planCategory = 'BASE'" \
  "$ROOT_DIR/backend/src/controllers/schedulingV4Controller.ts" >/dev/null; then
  echo "Guardrail failed: hardcoded BASE plan category is still present in schedulingV4Controller.ts" >&2
  exit 1
fi

rg -n "enable_locked_operations|enable_locked_shifts" \
  "$ROOT_DIR/frontend/src/components/SolverV4/SolverConfigurationModal.tsx" >/dev/null

echo "[6/6] Review reminders"
cat <<'EOF'
- locked rows must be preserved during cleanup and upsert
- shift_plan_id remains the source of truth for shift linkage
- result_summary changes must stay backward compatible
- frontend V4 should expose lock-preservation behavior in config or user feedback
EOF
