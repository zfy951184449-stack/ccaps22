#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# 查看 MFG8APS 三个服务的运行状态与健康(只读,无需 sudo)。
# ──────────────────────────────────────────────────────────────
set -uo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

echo "════════ MFG8APS 服务状态 ════════"
printf '%-12s %-10s %s\n' "服务" "launchd" "Label"
for pair in "backend:${BACKEND_LABEL}" "solver:${SOLVER_LABEL}" "caffeinate:${CAFFEINATE_LABEL}"; do
  name="${pair%%:*}"; label="${pair#*:}"
  st="$(agent_state "$label")"
  printf '%-12s %-10s %s\n' "$name" "${st:-未加载}" "$label"
done

echo
echo "健康检查:"
if curl -fsS --max-time 2 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
  echo "  后端 API   OK   (http://127.0.0.1:${BACKEND_PORT}/api/health)"
else
  echo "  后端 API   不可达"
fi
if curl -fsS --max-time 2 "http://127.0.0.1:${SOLVER_PORT}/api/v4/health" >/dev/null 2>&1; then
  echo "  求解器 V4  OK   (127.0.0.1:${SOLVER_PORT})"
else
  echo "  求解器 V4  不可达"
fi

echo
echo "访问: http://$(lan_ip):${BACKEND_PORT}    日志: ${LOG_DIR}"
echo "看日志: tail -f ${LOG_DIR}/backend.err.log   ${LOG_DIR}/solver.err.log"
