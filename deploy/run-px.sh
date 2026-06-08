#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# px 启动包装(开机自启用)。从 600 权限的 px.env 读域账号/密码,
# 启动 px 智能分流(读公司 PAC:外网走公司代理+NTLM,本地/内网直连)。
# 由 local.mfg8aps.px LaunchAgent 调用,KeepAlive 常驻。
# ──────────────────────────────────────────────────────────────
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"

PX_ENV="${HOME}/.config/mfg8aps/px.env"
if [ ! -f "${PX_ENV}" ]; then
  echo "[run-px] 缺 ${PX_ENV} —— 先跑 ./deploy/setup-automation.sh" >&2
  exit 1
fi
# 用 grep/cut 读取(不 source),这样密码含 @ $ 空格等特殊字符也安全
PX_USERNAME="$(grep '^PX_USERNAME=' "${PX_ENV}" | head -1 | cut -d= -f2-)"
PX_PASSWORD="$(grep '^PX_PASSWORD=' "${PX_ENV}" | head -1 | cut -d= -f2-)"
PX_PAC="$(grep '^PX_PAC=' "${PX_ENV}" | head -1 | cut -d= -f2-)"
export PX_USERNAME PX_PASSWORD

export PATH="${HOME}/Library/Python/3.9/bin:${BREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
PX_BIN="${HOME}/Library/Python/3.9/bin/px"
[ -x "${PX_BIN}" ] || PX_BIN="px"

# PAC 来自 px.env(setup 时从目标机系统现读,不硬编码)
if [ -z "${PX_PAC}" ]; then
  echo "[run-px] px.env 缺 PX_PAC —— 重跑 ./deploy/setup-automation.sh" >&2
  exit 1
fi
# --pac 智能分流;--username + PX_PASSWORD(环境变量)做 NTLM;只监听本机
exec "${PX_BIN}" \
  --pac="${PX_PAC}" \
  --username="${PX_USERNAME}" \
  --listen=127.0.0.1 \
  --port="${PX_PORT}"
