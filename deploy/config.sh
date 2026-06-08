# ──────────────────────────────────────────────────────────────
# MFG8APS 局域网服务器部署 · 集中配置
# 需要改端口 / 路径就改这里;其余脚本都 source 本文件。
# 用 bash 3.2 兼容写法(macOS 自带 /bin/bash 即 3.2,launchd 也用它)。
# ──────────────────────────────────────────────────────────────

# 本目录(deploy/)与项目根
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${DEPLOY_DIR}/.." && pwd)"

# 对外端口(绑 0.0.0.0,局域网可达);高位端口,无需 root
BACKEND_PORT="${BACKEND_PORT:-8080}"
BIND_HOST="${BIND_HOST:-0.0.0.0}"

# 求解器:只绑环回,仅 backend 内部 HTTP 调用,浏览器不直连
SOLVER_HOST="${SOLVER_HOST:-127.0.0.1}"
SOLVER_PORT="${SOLVER_PORT:-5005}"
SOLVER_WORKERS="${SOLVER_WORKERS:-2}"
SOLVER_TIMEOUT="${SOLVER_TIMEOUT:-600}"

# Homebrew 前缀(Apple Silicon 固定 /opt/homebrew)
BREW_PREFIX="${BREW_PREFIX:-/opt/homebrew}"

# launchd 标签与目录(用户级,无需 sudo)
LABEL_PREFIX="local.mfg8aps"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
LOG_DIR="${HOME}/Library/Logs/MFG8APS"

# 关键可执行(必须绝对路径 —— launchd 最小环境没有登录 shell 的 PATH)
NODE_BIN="${NODE_BIN:-${BREW_PREFIX}/bin/node}"
GUNICORN_BIN="${GUNICORN_BIN:-${PROJECT_ROOT}/solver_v4/.venv/bin/gunicorn}"
CAFFEINATE_BIN="/usr/bin/caffeinate"

# 三个服务的 launchd Label
BACKEND_LABEL="${LABEL_PREFIX}.backend"
SOLVER_LABEL="${LABEL_PREFIX}.solver"
CAFFEINATE_LABEL="${LABEL_PREFIX}.caffeinate"
