#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# 项目一键更新:拉最新代码 → 只重建「这次改动到」的部分 → 重启服务 → 自检。
#
# 前提:px 在跑(git pull / 装依赖要走公司代理)。流程:
#   1) 确保 px 窗口开着;
#   2) export http_proxy=http://127.0.0.1:3128 https_proxy=http://127.0.0.1:3128
#   3) cd ~/ccaps22 && ./deploy/update.sh
#
# 数据库结构变更(migration)不会自动跑,只提示——避免误改生产数据。
# 出问题想回滚:脚本开头会打印旧版本号,可 `git reset --hard <旧版本> && ./deploy/update.sh`。
# ──────────────────────────────────────────────────────────────
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

cd "${PROJECT_ROOT}"
UID_="$(id -u)"

# 1) 网络(需 px)──────────────────────────────────────────────────
log_step "1/6 检查 GitHub 可达(需 px 在跑)"
if ! git ls-remote origin -h >/dev/null 2>&1; then
  log_block "连不上 GitHub。请确认:① px 窗口在跑;② 本窗口已设代理:
    export http_proxy=http://127.0.0.1:3128 https_proxy=http://127.0.0.1:3128"
  exit 1
fi
log_pass "GitHub 可达"

# 2) 拉取 ────────────────────────────────────────────────────────
log_step "2/6 拉取最新代码"
OLD="$(git rev-parse --short HEAD)"
git pull --ff-only
NEW="$(git rev-parse --short HEAD)"
if [ "${OLD}" = "${NEW}" ]; then
  log_info "已是最新(${NEW}),无需更新。"
  exit 0
fi
log_pass "更新 ${OLD} → ${NEW}"

# 3) 看改了哪些区域 ──────────────────────────────────────────────
CHANGED="$(git diff --name-only "${OLD}" "${NEW}")"
has() { printf '%s\n' "${CHANGED}" | grep -q "$1"; }

# 4) 按需构建(只建改动到的;package.json 变了才重新装依赖)──────────
log_step "3/6 按需构建"
if has "^backend/"; then
  log_info "后端有改动,编译中…"
  ( cd backend; has "^backend/package" && npm install; npm run build )
  log_pass "后端已编译"
else
  log_info "后端无改动,跳过"
fi

if has "^frontend/"; then
  log_info "前端有改动,构建中(稍慢)…"
  ( cd frontend; has "^frontend/package" && npm install; CI=false npm run build )
  log_pass "前端已构建"
else
  log_info "前端无改动,跳过(省时间)"
fi

if has "^solver_v4/"; then
  log_info "求解器有改动…"
  ( cd solver_v4; has "requirements" && ./.venv/bin/pip install -r requirements.txt )
  log_pass "求解器已更新"
else
  log_info "求解器无改动,跳过"
fi

# 5) 数据库 migration 只提示、不自动跑 ──────────────────────────
log_step "4/6 数据库 migration"
RISKY=""; SAFE=""
for m in $(printf '%s\n' "${CHANGED}" | grep '^database/migrations/.*\.sql$' || true); do
  if git show "${NEW}:${m}" 2>/dev/null | sql_is_risky; then
    RISKY="${RISKY}${m}\n"
  else
    SAFE="${SAFE} ${m}"
  fi
done
if [ -n "${RISKY}" ]; then
  log_warn "含结构变更或改/删数据,脚本不碰、需你手动执行:"
  printf '%b' "${RISKY}" | sed 's/^/    /'
fi
if [ -n "${SAFE}" ]; then
  for m in ${SAFE}; do
    log_info "执行纯新增配置种子: ${m}"
    run_sql_file "${PROJECT_ROOT}/${m}" && log_pass "已跑 ${m}" || log_warn "跑 ${m} 失败(看上面报错)"
  done
fi
[ -z "${RISKY}" ] && [ -z "${SAFE}" ] && log_pass "无 migration"

# 6) 重启服务(前端是 backend 静态托管,重启 backend 即加载新 build)──
log_step "5/6 重启服务"
launchctl kickstart -k "gui/${UID_}/${BACKEND_LABEL}" >/dev/null 2>&1 && log_pass "后端已重启(顺带加载新前端)"
if has "^solver_v4/"; then
  launchctl kickstart -k "gui/${UID_}/${SOLVER_LABEL}" >/dev/null 2>&1 && log_pass "求解器已重启"
fi

log_step "6/6 健康自检"
sleep 3
wait_for_url "http://127.0.0.1:${SOLVER_PORT}/api/v4/health" "求解器" 20 || true
wait_for_url "http://127.0.0.1:${BACKEND_PORT}/api/health"   "后端"   30 || true

echo
echo "════════ 更新完成: ${OLD} → ${NEW} ════════"
echo "  访问: http://$(lan_ip):${BACKEND_PORT}"
echo "  万一服务异常想回滚: git reset --hard ${OLD} && ./deploy/update.sh"
