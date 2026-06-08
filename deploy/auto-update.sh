#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# 无人值守自动更新(由 local.mfg8aps.autoupdate LaunchAgent 每 5 分钟调用)。
# 护栏:① 含数据库 migration → 暂停等人工;② 更新或自检失败 → 自动回滚上个版本;
#       ③ mkdir 原子锁防并发;④ 全程写日志 + macOS 通知。
# 走 px(git/构建经本地代理)。运行时服务本地通信,不受影响。
# ──────────────────────────────────────────────────────────────
set -uo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

mkdir -p "${LOG_DIR}"
LOG="${LOG_DIR}/auto-update.log"
LOCK="/tmp/mfg8aps-autoupdate.lock"
UID_="$(id -u)"

notify() { /usr/bin/osascript -e "display notification \"$1\" with title \"MFG8APS 自动更新\"" >/dev/null 2>&1 || true; }
logts()  { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "${LOG}"; }

# 加锁(mkdir 是原子操作);上次还没跑完就跳过
if ! mkdir "${LOCK}" 2>/dev/null; then logts "上一次更新还在跑,本次跳过"; exit 0; fi
trap 'rmdir "${LOCK}" 2>/dev/null || true' EXIT

cd "${PROJECT_ROOT}"
export http_proxy="http://127.0.0.1:${PX_PORT}" https_proxy="http://127.0.0.1:${PX_PORT}"
export PATH="${BREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

# 1. 拉取远端,看有没有新版本
if ! git fetch origin main >>"${LOG}" 2>&1; then
  logts "git fetch 失败(px 没起/网络?),稍后再试"; exit 0
fi
OLD="$(git rev-parse --short HEAD)"
NEW="$(git rev-parse --short origin/main)"
[ "${OLD}" = "${NEW}" ] && exit 0   # 无更新,静默退出

logts "发现新版本 ${OLD} → ${NEW}"

# 2. 护栏:数据库结构变更 → 暂停,不自动改库
if git diff --name-only "${OLD}" "origin/main" | grep -q "^database/migrations/"; then
  logts "新版本含 database/migrations/,已暂停自动更新,等人工执行 SQL 后手动 ./deploy/update.sh"
  notify "发现新版本但含数据库变更,已暂停。请手动处理 migration。"
  exit 0
fi

# 3. 执行更新(update.sh 内部 pull→按需构建→重启→自检),并确认后端健康
if bash "${DEPLOY_DIR}/update.sh" >>"${LOG}" 2>&1 \
   && curl -fsS --max-time 6 "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
  logts "✅ 更新成功 ${OLD} → ${NEW}"
  notify "已自动更新 ${OLD} → ${NEW},服务正常 ✓"
  exit 0
fi

# 4. 失败 → 回滚到旧版本并重建
logts "⚠️ 更新或自检失败,回滚到 ${OLD}"
git reset --hard "${OLD}" >>"${LOG}" 2>&1 || true
( cd backend  && npm run build )          >>"${LOG}" 2>&1 || true
( cd frontend && CI=false npm run build )  >>"${LOG}" 2>&1 || true
launchctl kickstart -k "gui/${UID_}/${BACKEND_LABEL}" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/${UID_}/${SOLVER_LABEL}"  >/dev/null 2>&1 || true
logts "已回滚到 ${OLD}"
notify "自动更新失败,已回滚到 ${OLD}。详见 ${LOG}"
