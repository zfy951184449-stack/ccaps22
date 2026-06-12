#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# solver V5 启动包装 —— 由 launchd 调用。
# 注入 SOLVER_CALLBACK_SECRET 与 BACKEND_API_URL,否则 V5 solver 回 backend
# 的进度回调缺鉴权头,会被 requireServiceAuth 以 401 拦死。
# ──────────────────────────────────────────────────────────────
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

cd "${PROJECT_ROOT}/solver_v5"
export PATH="${BREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SOLVER_CALLBACK_SECRET="$(env_get SOLVER_CALLBACK_SECRET)"
export SOLVER_CALLBACK_SECRET
if [ -z "${SOLVER_CALLBACK_SECRET}" ]; then
  echo "[run-solver-v5] 警告: backend/.env 未找到 SOLVER_CALLBACK_SECRET;求解回调将被 401 拒绝。" >&2
fi

export BACKEND_API_URL="http://127.0.0.1:${BACKEND_PORT}/api/v5/scheduling/callback/progress"

exec "${GUNICORN_V5_BIN}" app:app \
  --bind "${SOLVER_HOST}:${SOLVER_V5_PORT}" \
  --workers 1 \
  --threads 4 \
  --timeout "${SOLVER_TIMEOUT}" \
  --access-logfile - --error-logfile -
