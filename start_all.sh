#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

HOST="${HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
FRONTEND_NEXT_PORT="${FRONTEND_NEXT_PORT:-3002}"
SOLVER_V4_PORT="${SOLVER_V4_PORT:-5005}"
BREW_MYSQL_SERVICE="${BREW_MYSQL_SERVICE:-mysql}"

declare -a PIDS=()
CLEANED_UP=0

cleanup() {
  if [[ ${CLEANED_UP} -eq 1 ]]; then return; fi
  CLEANED_UP=1
  echo ""
  echo "🛑 正在停止所有服务..."
  for pid in "${PIDS[@]}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then 
      kill "${pid}" 2>/dev/null || true
    fi
  done
}
trap cleanup INT TERM EXIT

ensure_port_available() {
  local port=$1
  local label=$2
  local output
  if output=$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null) && [[ -n "${output}" ]]; then
    # Try to clean it up automatically for seamless startup
    echo "⚠️ ${label}端口 ${port} 已被占用，尝试关闭占用进程..."
    local pid_to_kill=$(echo "${output}" | awk 'NR>1 {print $2}' | head -n 1)
    if [[ -n "${pid_to_kill}" ]]; then
      kill -9 "${pid_to_kill}" 2>/dev/null || true
      sleep 1
    fi
  fi
}

wait_for_url() {
  local url=$1
  local name=$2
  local retries=${3:-30}
  local delay=${4:-1}
  for ((attempt = 1; attempt <= retries; attempt++)); do
    if curl --silent --fail --max-time 2 --output /dev/null "${url}"; then
      echo "✅ ${name} 已就绪 (${url})"
      return 0
    fi
    sleep "${delay}"
  done
  echo "❌ 等待 ${name} 启动超时 (${url})" >&2
  return 1
}

# 1. 确保端口没被占用
ensure_port_available "${BACKEND_PORT}" "后端"
ensure_port_available "${FRONTEND_PORT}" "老前端"
ensure_port_available "${FRONTEND_NEXT_PORT}" "新前端"
ensure_port_available "${SOLVER_V4_PORT}" "V4求解器"

# 2. 检查 MySQL (macOS brew)
if command -v brew >/dev/null 2>&1; then
  echo "📊 检查MySQL服务状态..."
  if ! brew services list | awk -v svc="${BREW_MYSQL_SERVICE}" 'NR>1 && $1 == svc {print $2}' | grep -q "^started$"; then
    echo "⚠️  ${BREW_MYSQL_SERVICE} 服务未启动，正在启动..."
    brew services start "${BREW_MYSQL_SERVICE}" || true
    sleep 3
  fi
fi

# 3. 后端启动
echo "🚀 启动后端服务 (端口${BACKEND_PORT})..."
cd backend
if [[ ! -d "node_modules" ]]; then npm install; fi
npm run build
HOST="${HOST}" PORT="${BACKEND_PORT}" npm start &
PIDS+=($!)
cd "${SCRIPT_DIR}"
wait_for_url "http://127.0.0.1:${BACKEND_PORT}/api/health" "后端 API"

# 4. 求解器V4启动 (Gunicorn for production-grade serving)
echo "🧠 启动V4求解器服务 (端口${SOLVER_V4_PORT})..."
if [[ -d "solver_v4/.venv" ]]; then
  cd solver_v4
  source .venv/bin/activate
  if command -v gunicorn >/dev/null 2>&1; then
    # Gunicorn: 2 workers, 10-minute timeout for long solves
    gunicorn app:app \
      --bind "0.0.0.0:${SOLVER_V4_PORT}" \
      --workers 2 \
      --timeout 600 \
      --access-logfile - \
      --error-logfile - &
    PIDS+=($!)
    echo "  → 使用 Gunicorn (2 workers, timeout=600s)"
  else
    echo "  ⚠️ Gunicorn 未安装，使用 Flask 开发服务器"
    python app.py &
    PIDS+=($!)
  fi
  deactivate 2>/dev/null || true
  cd "${SCRIPT_DIR}"
  wait_for_url "http://127.0.0.1:${SOLVER_V4_PORT}/api/v4/health" "V4求解器 API" 60 1
else
  echo "⚠️ 未检测到 V4 求解器虚拟环境(solver_v4/.venv)，跳过启动"
fi

# 5. 老版本前端
echo "🎨 启动老前端服务 (端口${FRONTEND_PORT})..."
cd frontend
if [[ ! -d "node_modules" ]]; then npm install; fi
HOST="${HOST}" PORT="${FRONTEND_PORT}" npm start &
PIDS+=($!)
cd "${SCRIPT_DIR}"
wait_for_url "http://127.0.0.1:${FRONTEND_PORT}" "老前端项目" 60 2

# 6. 新版本前端 (Next.js)
echo "✨ 启动新前端服务 (端口${FRONTEND_NEXT_PORT})..."
cd frontend-next
if [[ ! -d "node_modules" ]]; then npm install; fi
HOST="${HOST}" PORT="${FRONTEND_NEXT_PORT}" npm run dev &
PIDS+=($!)
cd "${SCRIPT_DIR}"
wait_for_url "http://127.0.0.1:${FRONTEND_NEXT_PORT}" "新前端项目(Next.js)" 60 2

echo ""
echo "==========================================="
echo "✅ 所有服务均已启动/就绪!"
echo "📱 老版本前端:   http://localhost:${FRONTEND_PORT}"
echo "📱 新版本前端:   http://localhost:${FRONTEND_NEXT_PORT}"
echo "🔗 后端 API:     http://localhost:${BACKEND_PORT}"
echo "🧠 求解器 V4:    http://localhost:${SOLVER_V4_PORT}"
echo "==========================================="
echo "按 Ctrl+C 停止所有服务"

wait
