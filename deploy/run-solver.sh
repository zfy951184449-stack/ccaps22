#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# solver 启动包装 —— 由 launchd 调用。
# 关键:注入 SOLVER_CALLBACK_SECRET(与 backend/.env 同值),否则 solver 回 backend 的
# 进度/结果回调缺鉴权头,会被 requireServiceAuth 以 401 拦死,求解界面卡在 0%。
# ──────────────────────────────────────────────────────────────
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

cd "${PROJECT_ROOT}/solver_v4"
export PATH="${BREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SOLVER_CALLBACK_SECRET="$(env_get SOLVER_CALLBACK_SECRET)"
export SOLVER_CALLBACK_SECRET
if [ -z "${SOLVER_CALLBACK_SECRET}" ]; then
  echo "[run-solver] 警告: backend/.env 未找到 SOLVER_CALLBACK_SECRET;求解回调将被 401 拒绝。" >&2
fi
export PORT="${SOLVER_PORT}"

# gunicorn 用 venv 内的解释器,无需 activate。绑环回:只允许同机 backend 调用。
exec "${GUNICORN_BIN}" app:app \
  --bind "${SOLVER_HOST}:${SOLVER_PORT}" \
  --workers "${SOLVER_WORKERS}" \
  --timeout "${SOLVER_TIMEOUT}" \
  --access-logfile - --error-logfile -
