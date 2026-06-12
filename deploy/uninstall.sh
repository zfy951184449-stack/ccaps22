#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# 停止并卸载 MFG8APS 的四个 LaunchAgent(用户级,无需 sudo)。
# 只动这三个 Agent;不碰 MySQL(brew)、不删日志、不删构建产物。
# ──────────────────────────────────────────────────────────────
set -uo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

log_step "停止并卸载 MFG8APS 服务"
for L in "${BACKEND_LABEL}" "${SOLVER_LABEL}" "${SOLVER_V5_LABEL}" "${CAFFEINATE_LABEL}"; do
  unload_agent "${LAUNCH_AGENTS_DIR}/${L}.plist" "${L}"
  rm -f "${LAUNCH_AGENTS_DIR}/${L}.plist"
  log_pass "已卸载并删除 ${L}.plist"
done

echo
echo "服务已停止。MySQL(brew services)、日志(${LOG_DIR})、构建产物均未改动。"
echo "重新部署: ./deploy/install.sh"
