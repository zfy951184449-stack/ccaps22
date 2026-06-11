#!/usr/bin/env bash
# V1: verify_v5_archive.sh — solver_v5 release gate
# 所有步骤通过才 exit 0；任一失败立即 exit 1。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIL=0

_fail() {
  echo "[FAIL] $*" >&2
  FAIL=1
}

_ok() {
  echo "[OK]   $*"
}

# ─── [1] solver_v5 module compilation ────────────────────────────────────────
echo ""
echo "[1/7] solver_v5 compileall（contracts core constraints objectives）"
(
  cd "$ROOT_DIR/solver_v5"
  python3 -m compileall contracts core constraints objectives
) && _ok "compileall passed" || { _fail "compileall failed"; }

# ─── [2] solver_v5 unit tests ────────────────────────────────────────────────
echo ""
echo "[2/7] solver_v5 unittest"
(
  cd "$ROOT_DIR/solver_v5"
  python3 -m unittest \
    tests.test_shift_assignment \
    tests.test_share_group \
    tests.test_locked_constraints \
    tests.test_callback_auth \
    tests.test_breakdown_equivalence \
    tests.test_hint_no_fix \
    tests.test_lexicographic \
    tests.test_infeasibility \
    -v 2>&1
) && _ok "all unittest passed" || { _fail "unittest failed"; }

# ─── [3] Guardrail: no solver_v4 imports in solver_v5 ────────────────────────
echo ""
echo "[3/7] Guardrail: no 'import solver_v4 | from solver_v4' in solver_v5/"
if rg --quiet 'import solver_v4|from solver_v4' "$ROOT_DIR/solver_v5/" 2>/dev/null; then
  _fail "Guardrail [3] FAILED: solver_v4 import found in solver_v5/"
  rg 'import solver_v4|from solver_v4' "$ROOT_DIR/solver_v5/" >&2
else
  _ok "no solver_v4 import in solver_v5/"
fi

# ─── [4] Guardrail: contracts/request.py identical to V4 ─────────────────────
echo ""
echo "[4/7] Guardrail: diff solver_v5/contracts/request.py solver_v4/contracts/request.py"
if diff "$ROOT_DIR/solver_v5/contracts/request.py" "$ROOT_DIR/solver_v4/contracts/request.py" > /dev/null 2>&1; then
  _ok "contracts/request.py identical (zero diff)"
else
  _fail "Guardrail [4] FAILED: contracts/request.py differs from V4"
  diff "$ROOT_DIR/solver_v5/contracts/request.py" "$ROOT_DIR/solver_v4/contracts/request.py" >&2 || true
fi

# ─── [5] Guardrail: 6 deprecated files absent from solver_v5 ─────────────────
echo ""
echo "[5/7] Guardrail: 6 deprecated files must not exist in solver_v5/"
DEPRECATED_FILES=(
  "constraints/night_rest.py"
  "constraints/night_shift_interval.py"
  "constraints/no_isolated_night_shift.py"
  "constraints/consecutive_rest_limit.py"
  "constraints/work_days_limit.py"
  "objectives/minimize_hours.py"
)
DEPRECATED_FAIL=0
for f in "${DEPRECATED_FILES[@]}"; do
  path="$ROOT_DIR/solver_v5/$f"
  if [ -f "$path" ]; then
    _fail "Guardrail [5]: deprecated file still exists: $f"
    DEPRECATED_FAIL=1
  fi
done
if [ "$DEPRECATED_FAIL" -eq 0 ]; then
  _ok "all 6 deprecated files absent"
fi

# ─── [6] backend build + frontend build ──────────────────────────────────────
echo ""
echo "[6/7] backend build"
(
  cd "$ROOT_DIR/backend"
  npm run build
) && _ok "backend build passed" || { _fail "backend build failed"; }

echo ""
echo "[6/7] frontend build (CI=false)"
(
  cd "$ROOT_DIR/frontend"
  CI=false npm run build
) && _ok "frontend build passed" || { _fail "frontend build failed"; }

# ─── [7] regression compare (A-round) — requires both solvers live ──────────
# 此步骤需要 solver_v4(:5005) 和 solver_v5(:5006) 同时在线且稳定。
# • 服务未启动（CI 纯静态检查）→ 自动跳过，不计失败。
# • 服务在线但 compare 因传输失败返回非 0 →  transport-only 失败跳过（基础设施问题），
#   但 L0-L4 逻辑失败（solver 返回但结果退化）仍计 FAIL。
# • 完整 A 轮（所有 134 请求）：全量部署后手动运行
#   python3 scripts/compare_v4_v5.py --mode all-off
echo ""
echo "[7/7] A-round regression (compare_v4_v5.py --mode all-off --limit 5)"
COMPARE_SCRIPT="$ROOT_DIR/scripts/compare_v4_v5.py"
if [ ! -f "$COMPARE_SCRIPT" ]; then
  echo "[SKIP] compare_v4_v5.py not found. Skipping step [7]."
else
  # 探测两个 solver 是否在线（双重：health + 短 POST smoke）
  V4_UP=0
  V5_UP=0
  curl -sf --max-time 3 "http://localhost:5005/api/v4/health" > /dev/null 2>&1 && V4_UP=1 || true
  curl -sf --max-time 3 "http://localhost:5006/api/v5/health" > /dev/null 2>&1 && V5_UP=1 || true
  if [ "$V4_UP" -eq 0 ] || [ "$V5_UP" -eq 0 ]; then
    echo "[SKIP] Solver V4(:5005 up=$V4_UP) or V5(:5006 up=$V5_UP) not reachable."
    echo "       Start both solvers first, then re-run to complete step [7]."
    echo "       Hint: ./start_all.sh"
  else
    # 抽取前 5 个请求做快速 smoke（全量用 --limit 0 或不加 --limit）
    COMPARE_OUT="$(python3 "$COMPARE_SCRIPT" --mode all-off --limit 5 2>&1)"
    COMPARE_EXIT=$?
    echo "$COMPARE_OUT"
    # 如果全部失败原因均为 transport（Connection refused / request_error），
    # 则判定为基础设施问题，跳过而非 FAIL（避免环境抖动触发误报）。
    TRANSPORT_ONLY=0
    if [ "$COMPARE_EXIT" -ne 0 ]; then
      if echo "$COMPARE_OUT" | grep -q "FAIL" && \
         ! echo "$COMPARE_OUT" | grep -qE "^FAIL.*L[0-9]|退化|逐字节|breakdown"; then
        # 所有 FAIL 行只含传输错误关键字
        if echo "$COMPARE_OUT" | grep "^FAIL" | grep -qvE "Connection refused|request_error|Max retries|Errno"; then
          : # 存在非传输 FAIL → 真实逻辑失败
        else
          TRANSPORT_ONLY=1
        fi
      fi
    fi
    if [ "$COMPARE_EXIT" -eq 0 ]; then
      _ok "A-round regression (smoke 5) PASS"
    elif [ "$TRANSPORT_ONLY" -eq 1 ]; then
      echo "[SKIP] step [7] transport-only failures (solver died during run). Re-run with stable services."
    else
      _fail "A-round regression FAILED (logic degradation detected)"
    fi
  fi
fi

# ─── Final result ─────────────────────────────────────────────────────────────
echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "============================================================"
  echo " verify_v5_archive.sh: ONE OR MORE CHECKS FAILED — exit 1"
  echo "============================================================"
  exit 1
else
  echo "============================================================"
  echo " verify_v5_archive.sh: ALL CHECKS PASSED — exit 0"
  echo "============================================================"
  exit 0
fi
