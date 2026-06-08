#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# backend 启动包装 —— 由 launchd 调用。集中处理 cd / PATH / 端口,然后 exec node。
# 用 wrapper 而非把一堆 env 摊进 plist:配置集中、便于手动复跑排错。
# ──────────────────────────────────────────────────────────────
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"

cd "${PROJECT_ROOT}/backend"
export PATH="${BREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

# 对外地址/端口。dotenv 不覆盖已存在的 env,所以这里的 export 优先于 backend/.env。
export HOST="${BIND_HOST}"
export PORT="${BACKEND_PORT}"

# backend 自身用 dotenv 读 backend/.env(DB_* / SOLVER_V4_URL / SOLVER_CALLBACK_SECRET / JWT_*)。
exec "${NODE_BIN}" dist/server.js
