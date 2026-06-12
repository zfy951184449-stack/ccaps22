#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# MFG8APS 一键部署(企业锁定 Mac / 无 sudo / 局域网常驻服务器)
#   ./install.sh                 正常一键部署(先跑只读自检)
#   ./install.sh --build         部署前先本地构建 backend + frontend
#   ./install.sh --skip-preflight  跳过自检
#   ./install.sh --force         自检有 BLOCK 也强行继续(不推荐)
# 全程用户级 LaunchAgent,不需要 sudo。
# ──────────────────────────────────────────────────────────────
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

FORCE=0; SKIP_PRE=0; DO_BUILD=0
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --skip-preflight) SKIP_PRE=1 ;;
    --build) DO_BUILD=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数: $a(用 -h 看用法)"; exit 2 ;;
  esac
done

# ── plist 生成函数(heredoc,变量展开)──────────────────────────
write_backend_plist() {
  cat > "${LAUNCH_AGENTS_DIR}/${BACKEND_LABEL}.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${BACKEND_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${DEPLOY_DIR}/run-backend.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>WorkingDirectory</key><string>${PROJECT_ROOT}/backend</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${BREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StandardOutPath</key><string>${LOG_DIR}/backend.out.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/backend.err.log</string>
</dict>
</plist>
PLIST
}

write_solver_plist() {
  cat > "${LAUNCH_AGENTS_DIR}/${SOLVER_LABEL}.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SOLVER_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${DEPLOY_DIR}/run-solver.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>WorkingDirectory</key><string>${PROJECT_ROOT}/solver_v4</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${BREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StandardOutPath</key><string>${LOG_DIR}/solver.out.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/solver.err.log</string>
</dict>
</plist>
PLIST
}

# caffeinate:-d 防显示器睡 / -i 防系统空闲睡(核心)/ -m 防磁盘睡 / -s 防系统睡(仅接电源有效)
write_solver_v5_plist() {
  cat > "${LAUNCH_AGENTS_DIR}/${SOLVER_V5_LABEL}.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SOLVER_V5_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${DEPLOY_DIR}/run-solver-v5.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>WorkingDirectory</key><string>${PROJECT_ROOT}/solver_v5</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${BREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StandardOutPath</key><string>${LOG_DIR}/solver_v5.out.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/solver_v5.err.log</string>
</dict>
</plist>
PLIST
}

write_caffeinate_plist() {
  cat > "${LAUNCH_AGENTS_DIR}/${CAFFEINATE_LABEL}.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${CAFFEINATE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${CAFFEINATE_BIN}</string>
    <string>-d</string><string>-i</string><string>-m</string><string>-s</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardErrorPath</key><string>${LOG_DIR}/caffeinate.err.log</string>
</dict>
</plist>
PLIST
}

echo "════════ MFG8APS 一键部署 ════════"

# 1) 只读自检 ───────────────────────────────────────────────────
if [ "$SKIP_PRE" -eq 0 ]; then
  if ! bash "${DEPLOY_DIR}/preflight.sh"; then
    if [ "$FORCE" -eq 0 ]; then
      echo; log_block "自检发现硬阻塞(BLOCK)。请按上面提示修复后重试,或 --force 强行继续(不推荐)。"
      exit 1
    fi
    log_warn "已 --force 跳过 BLOCK,继续。"
  fi
fi

# 2) 可选本地构建 ───────────────────────────────────────────────
if [ "$DO_BUILD" -eq 1 ]; then
  log_step "本地构建 backend + frontend"
  ( cd "${PROJECT_ROOT}/backend"  && npm run build )
  ( cd "${PROJECT_ROOT}/frontend" && CI=false npm run build )
fi

# 3) 校验产物 ───────────────────────────────────────────────────
log_step "校验构建产物"
miss=0
[ -f "${PROJECT_ROOT}/backend/dist/server.js" ]    || { log_block "缺 backend/dist(npm run build 或 --build)"; miss=1; }
[ -f "${PROJECT_ROOT}/frontend/build/index.html" ] || { log_block "缺 frontend/build(CI=false npm run build 或 --build)"; miss=1; }
[ -x "${GUNICORN_BIN}" ]                           || { log_block "缺 solver V4 venv/gunicorn"; miss=1; }
[ -x "${GUNICORN_V5_BIN}" ]                        || { log_block "缺 solver V5 venv/gunicorn(先跑 cd solver_v5 && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)"; miss=1; }
[ "$miss" -eq 0 ] || { echo; log_block "产物不全,终止。"; exit 1; }
log_pass "产物齐全。"

# 4) 准备目录 + 可执行 ──────────────────────────────────────────
mkdir -p "${LOG_DIR}" "${LAUNCH_AGENTS_DIR}"
chmod +x "${DEPLOY_DIR}"/run-backend.sh "${DEPLOY_DIR}"/run-solver.sh "${DEPLOY_DIR}"/run-solver-v5.sh

# 5) 生成 LaunchAgent ───────────────────────────────────────────
log_step "生成 LaunchAgent(${LAUNCH_AGENTS_DIR})"
write_backend_plist;    log_pass "${BACKEND_LABEL}.plist"
write_solver_plist;     log_pass "${SOLVER_LABEL}.plist"
write_solver_v5_plist;  log_pass "${SOLVER_V5_LABEL}.plist"
write_caffeinate_plist; log_pass "${CAFFEINATE_LABEL}.plist"

# 6) 加载并启动(幂等四连)─────────────────────────────────────────
log_step "加载并启动服务"
load_agent "${LAUNCH_AGENTS_DIR}/${BACKEND_LABEL}.plist"    "${BACKEND_LABEL}"    && log_pass "backend 已加载"
load_agent "${LAUNCH_AGENTS_DIR}/${SOLVER_LABEL}.plist"     "${SOLVER_LABEL}"     && log_pass "solver V4 已加载"
load_agent "${LAUNCH_AGENTS_DIR}/${SOLVER_V5_LABEL}.plist"  "${SOLVER_V5_LABEL}"  && log_pass "solver V5 已加载"
load_agent "${LAUNCH_AGENTS_DIR}/${CAFFEINATE_LABEL}.plist" "${CAFFEINATE_LABEL}" && log_pass "caffeinate 已加载"

# 7) 健康自检 ───────────────────────────────────────────────────
log_step "健康自检"
wait_for_url "http://127.0.0.1:${SOLVER_PORT}/api/v4/health"    "求解器 V4" 30 || true
wait_for_url "http://127.0.0.1:${SOLVER_V5_PORT}/api/v5/health" "求解器 V5" 30 || true
wait_for_url "http://127.0.0.1:${BACKEND_PORT}/api/health"      "后端 API"  40 || true
if curl -fsS --max-time 3 "http://127.0.0.1:${BACKEND_PORT}/" 2>/dev/null | grep -qiE '<!doctype html|<html'; then
  log_pass "前端静态页可访问。"
else
  log_warn "前端首页未返回 HTML —— 确认 frontend/build 存在。"
fi

# 8) 完成提示 ───────────────────────────────────────────────────
IP="$(lan_ip)"; HN="$(scutil --get LocalHostName 2>/dev/null || echo mac)"
echo
echo "════════ 部署完成 ════════"
echo "  本机访问:   http://localhost:${BACKEND_PORT}"
echo "  局域网访问: http://${IP}:${BACKEND_PORT}   或   http://${HN}.local:${BACKEND_PORT}"
echo "  日志目录:   ${LOG_DIR}"
echo "  状态/停止:  ./deploy/status.sh   |   ./deploy/uninstall.sh"
echo
echo "下一步(详见 deploy/README.md):"
echo "  • 防火墙若开启:首次需在本机点一次「允许接受传入连接」弹窗。"
echo "  • 从【另一台】局域网设备验证:  curl http://${IP}:${BACKEND_PORT}/api/health"
echo "  • 保持盖子常开或外接电源+显示器;FileVault 开启时每次重启需登录一次桌面。"
