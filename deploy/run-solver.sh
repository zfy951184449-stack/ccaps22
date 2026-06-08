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

# solver 回调 backend 的地址(进度/结果/状态轮询),必须指向 backend 的实际端口。
# 缺它时 solver 用代码默认 localhost:3001 → Connection refused,求解卡在"等待求解器日志"。
export BACKEND_API_URL="http://127.0.0.1:${BACKEND_PORT}/api/v4/scheduling/callback/progress"

# gunicorn 用 venv 内的解释器,无需 activate。绑环回:只允许同机 backend 调用。
exec "${GUNICORN_BIN}" app:app \
  --bind "${SOLVER_HOST}:${SOLVER_PORT}" \
  --workers "${GUNICORN_WORKERS}" \
  --timeout "${SOLVER_TIMEOUT}" \
  --access-logfile - --error-logfile -
