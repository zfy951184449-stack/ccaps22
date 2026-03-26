#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

HOST="${HOST:-0.0.0.0}"
FRONTEND_NEXT_PORT="${FRONTEND_NEXT_PORT:-3002}"

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
    exit 1
  fi
}

ensure_command_exists npm
ensure_command_exists curl
ensure_command_exists lsof

ensure_port_available "${FRONTEND_NEXT_PORT}" "frontend-next"

if [[ ! -d "frontend-next/node_modules" ]]; then
  echo "📦 安装 frontend-next 依赖..."
  (cd frontend-next && npm install)
fi

if curl --silent --fail --max-time 2 http://127.0.0.1:3001/api/health >/dev/null; then
  echo "✅ 检测到 backend 已在 3001 就绪"
else
  echo "⚠️  backend 3001 当前未就绪，frontend-next 的 API 探针会显示为离线"
fi

echo "🎨 启动 frontend-next (端口${FRONTEND_NEXT_PORT})..."
cd frontend-next
HOST="${HOST}" PORT="${FRONTEND_NEXT_PORT}" npm run dev
