#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

HOST="${HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-${PORT:-3001}}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BREW_MYSQL_SERVICE="${BREW_MYSQL_SERVICE:-mysql}"

declare -a PIDS=()
CLEANED_UP=0

cleanup() {
  if [[ ${CLEANED_UP} -eq 1 ]]; then
    return
  fi
  CLEANED_UP=1

  local alive=0
  if ((${#PIDS[@]})); then
    for pid in "${PIDS[@]}"; do
      if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
        alive=1
        break
      fi
    done
  fi

  if [[ ${alive} -eq 1 ]]; then
    echo ""
    echo "🛑 正在停止服务..."
    if ((${#PIDS[@]})); then
      for pid in "${PIDS[@]}"; do
        if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
          kill "${pid}" 2>/dev/null || true
        fi
      done
    fi
  fi
}

trap cleanup INT TERM EXIT

ensure_command_exists() {
  local cmd=$1
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "❌ 未检测到命令 ${cmd}，请先安装后再运行脚本。" >&2
    exit 1
  fi
}

ensure_port_available() {
  local port=$1
  local label=$2
  local output
  if output=$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null) && [[ -n "${output}" ]]; then
    echo "❌ ${label}端口 ${port} 已被占用，以下进程正在使用该端口：" >&2
    echo "${output}" >&2
    echo "❗ 请先释放端口后重新运行脚本。" >&2
    exit 1
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

echo "🚀 启动APS系统管理界面..."

ensure_command_exists npm
ensure_command_exists curl
ensure_command_exists lsof

if command -v brew >/dev/null 2>&1; then
  echo "📊 检查MySQL服务状态..."
  if ! brew services list | awk -v svc="${BREW_MYSQL_SERVICE}" 'NR>1 && $1 == svc {print $2}' | grep -q "^started$"; then
    echo "⚠️  ${BREW_MYSQL_SERVICE} 服务未启动，正在启动..."
    brew services start "${BREW_MYSQL_SERVICE}"
    sleep 3
  fi
else
  echo "ℹ️ 未检测到 Homebrew，跳过 MySQL 服务状态检查。"
fi

ensure_port_available "${BACKEND_PORT}" "后端"
ensure_port_available "${FRONTEND_PORT}" "前端"

if [[ ! -d "backend/node_modules" ]]; then
  echo "📦 安装后端依赖..."
  (cd backend && npm install)
else
  echo "📦 检测到后端依赖已存在，跳过安装"
fi

if [[ ! -d "frontend/node_modules" ]]; then
  echo "📦 安装前端依赖..."
  (cd frontend && npm install)
else
  echo "📦 检测到前端依赖已存在，跳过安装"
fi

echo "🔧 编译后端TypeScript..."
(cd backend && npm run build)

echo "🚀 启动后端服务 (端口${BACKEND_PORT})..."
cd backend
HOST="${HOST}" PORT="${BACKEND_PORT}" npm start &
BACKEND_PID=$!
cd "${SCRIPT_DIR}"
PIDS+=("${BACKEND_PID}")

wait_for_url "http://127.0.0.1:${BACKEND_PORT}/api/health" "后端 API"

echo "🎨 启动前端服务 (端口${FRONTEND_PORT}，监听所有网卡)..."
cd frontend
HOST="${HOST}" PORT="${FRONTEND_PORT}" npm start &
FRONTEND_PID=$!
cd "${SCRIPT_DIR}"
PIDS+=("${FRONTEND_PID}")

wait_for_url "http://127.0.0.1:${FRONTEND_PORT}" "前端开发服务器" 60 2

echo ""
echo "✅ 服务启动完成!"
echo "📱 前端界面: http://localhost:${FRONTEND_PORT}"
echo "🔗 后端API: http://localhost:${BACKEND_PORT}"
echo ""

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
if [[ -n "${LAN_IP}" ]]; then
  echo "🌐 局域网访问: http://${LAN_IP}:${FRONTEND_PORT}"
else
  echo "🌐 局域网访问: 请手动查询本机IP (例如运行 \"ipconfig getifaddr en0\")"
fi

echo ""
echo "按 Ctrl+C 停止所有服务"

wait
