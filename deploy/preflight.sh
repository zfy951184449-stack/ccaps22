#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# 纯只读环境自检(preflight)—— 全部免 sudo,不改系统任何状态。
# 目的:在真正部署前把失败前置,现场难调试时一眼看出卡点。
# 务必在「目标机」上跑,不要拿开发机现状外推。
# 退出码:有 BLOCK 则非 0。
# ──────────────────────────────────────────────────────────────
set -uo pipefail   # 故意不加 -e:单项探测失败不应中断整轮自检
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

SUM_MDM=?; SUM_FV=?; SUM_AL=?; SUM_FW=?; SUM_PROXY=?; SUM_PORTS=ok; SUM_ART=?

echo "════════ MFG8APS 部署环境自检 (preflight) ════════"
echo "项目: ${PROJECT_ROOT}"
echo "对外: http://${BIND_HOST}:${BACKEND_PORT}   求解器: ${SOLVER_HOST}:${SOLVER_PORT}"

# 1) MDM 托管状态 ───────────────────────────────────────────────
log_step "1/12 MDM 托管状态"
if profiles status -type enrollment 2>/dev/null | grep -q 'MDM enrollment: Yes'; then
  SUM_MDM=Yes
  log_info "本机已被 MDM 纳管:下面的防火墙/节能/代理探测结果以 MDM 策略为准,本地不可覆盖。"
else
  SUM_MDM=No
  log_info "未检测到 MDM 纳管 (enrollment = No)。"
fi

# 2) FileVault + 自动登录(头号阻塞)────────────────────────────────
log_step "2/12 FileVault + 自动登录(决定重启后能否自动起服务)"
FV="$(fdesetup status 2>/dev/null | head -n1)"
AL="$(defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null || echo '')"
SUM_FV="$(echo "$FV" | grep -qi 'On' && echo On || echo Off)"
[ -n "$AL" ] && SUM_AL=yes || SUM_AL=no
log_info "FileVault: ${FV:-未知}    自动登录用户: ${AL:-未设置}"
if [ "$SUM_FV" = "On" ] && [ "$SUM_AL" = "no" ]; then
  log_block "FileVault 开 + 无自动登录:重启后磁盘未解锁、用户级服务不会自启。每次开机需有人输密码登录到桌面服务才拉起;若要断电无人值守自启,须找 IT(见 README 第 6 节)。"
else
  log_pass "重启后自启前提满足(或 FileVault 关 / 已配自动登录)。"
fi

# 3) 应用防火墙模式(第二阻塞)─────────────────────────────────────
log_step "3/12 应用防火墙(决定局域网能否连进来)"
FW="/usr/libexec/ApplicationFirewall/socketfilterfw"
if [ -x "$FW" ]; then
  GS="$("$FW" --getglobalstate 2>/dev/null)"
  BA="$("$FW" --getblockall 2>/dev/null)"
  log_info "${GS}    ${BA}"
  if echo "$GS" | grep -qi 'disabled'; then
    SUM_FW=OFF; log_pass "防火墙已关,局域网入站不受限。"
  elif echo "$BA" | grep -qi 'enabled'; then
    SUM_FW=BLOCKALL
    log_block "防火墙=阻止所有传入连接:服务端口对局域网必不可达,本地无法自助放行(需 root 且常被 MDM 锁)。走 IT 放行,或改用 SSH -L / Tailscale 隧道(见 README)。"
  else
    SUM_FW=ON
    log_warn "防火墙开启(非 block-all)。node/python 是 ad-hoc 签名,不享受『自动放行签名软件』;首次入站会弹窗,无人值守时连接被拒 —— 部署当天需有人在本机点一次「允许」。"
  fi
else
  SUM_FW=未知; log_warn "未找到 socketfilterfw,跳过防火墙探测。"
fi

# 4) MySQL 在 3306 监听 ─────────────────────────────────────────
log_step "4/12 MySQL"
if lsof -nP -iTCP:3306 -sTCP:LISTEN >/dev/null 2>&1; then
  log_pass "MySQL 已在 3306 监听。"
else
  log_warn "未检测到 MySQL 监听 3306。请先 'brew services start mysql'(数据目录 ${BREW_PREFIX}/var/mysql,非 TCP 目录无需授权)。"
fi

# 5) 目标端口可绑 ───────────────────────────────────────────────
log_step "5/12 端口可绑定"
for P in "${BACKEND_PORT}" "${SOLVER_PORT}"; do
  R="$("${NODE_BIN}" -e 'const n=require("net").createServer();n.once("error",e=>{console.log("FAIL:"+e.code);process.exit(0)});n.listen(+process.argv[1],"0.0.0.0",()=>{console.log("OK");n.close();process.exit(0)})' "$P" 2>/dev/null || echo "FAIL:NO_NODE")"
  if [ "$R" = "OK" ]; then
    log_pass "端口 ${P} 可绑定。"
  else
    SUM_PORTS=fail
    log_block "端口 ${P} 不可绑定(${R};通常 EADDRINUSE 被占用)。关掉占用进程或在 config.sh 换端口。"
  fi
done

# 6) Homebrew 前缀可写(仅在线安装时相关)──────────────────────────
log_step "6/12 Homebrew 前缀属主"
OWN="$(stat -f '%Su' "${BREW_PREFIX}" 2>/dev/null || echo '?')"
if [ "$OWN" = "$(whoami)" ]; then
  log_pass "${BREW_PREFIX} 属当前账号。"
else
  log_warn "${BREW_PREFIX} 属主=${OWN}(非当前账号)。本部署走离线产物、不需 brew 装新包,可忽略;但 MySQL 须由该账号事先装好。"
fi

# 7) 代理 / 企业 CA 注入 ────────────────────────────────────────
log_step "7/12 代理 / TLS 拦截"
if scutil --proxy 2>/dev/null | grep -qE 'HTTP(S)?Enable : 1' || [ -n "${https_proxy:-}${HTTPS_PROXY:-}" ]; then
  SUM_PROXY=yes
  log_warn "检测到系统代理/可能的 TLS 拦截。本脚本走离线产物不联网下载,不受影响;若你改用在线安装,需向 IT 要公司根 CA。"
else
  SUM_PROXY=no
  log_pass "未检测到强制代理。"
fi

# 8) 关键二进制 quarantine ──────────────────────────────────────
log_step "8/12 关键二进制 quarantine"
QN=0
for b in "${NODE_BIN}" "${GUNICORN_BIN}"; do
  [ -e "$b" ] || continue
  if xattr "$b" 2>/dev/null | grep -q quarantine; then
    QN=1; log_warn "$b 带 quarantine,可能被 Gatekeeper 拦。可无 sudo 执行:xattr -d com.apple.quarantine \"$b\""
  fi
done
[ "$QN" -eq 0 ] && log_pass "node / gunicorn 无 quarantine。"

# 9) MDM 节能策略 ───────────────────────────────────────────────
log_step "9/12 MDM 节能策略"
if defaults read "/Library/Managed Preferences/com.apple.EnergySaver" >/dev/null 2>&1; then
  log_warn "检测到 MDM 节能策略,可能压过 caffeinate,夜间仍可能休眠掉线。如出现夜间掉线,需 IT 在 MDM 侧放宽 Sleep Timer。"
else
  log_pass "无 MDM 强制节能策略(caffeinate 应可生效)。"
fi

# 10) 图形会话 / 盖子形态 ───────────────────────────────────────
log_step "10/12 图形会话 / 物理形态"
SESS="$(launchctl managername 2>/dev/null || echo '?')"
log_info "当前会话: ${SESS}(Aqua=已图形登录,用户级 Agent 才存活)。"
log_info "提示:合盖且无外接显示器=固件级必睡,caffeinate 压不住。请保持盖子常开,或外接电源+显示器+键鼠做 clamshell,并保持插电。"

# 11) 构建产物就绪 ──────────────────────────────────────────────
log_step "11/12 构建产物"
SUM_ART=ok
[ -f "${PROJECT_ROOT}/backend/dist/server.js" ]    && log_pass "backend/dist 就绪。"          || { SUM_ART=miss; log_block "缺 backend/dist —— cd backend && npm run build(或 install.sh --build)。"; }
[ -f "${PROJECT_ROOT}/frontend/build/index.html" ] && log_pass "frontend/build 就绪。"         || { SUM_ART=miss; log_block "缺 frontend/build —— cd frontend && CI=false npm run build(或 install.sh --build)。"; }
[ -x "${GUNICORN_BIN}" ]                           && log_pass "solver .venv/gunicorn 就绪。"  || { SUM_ART=miss; log_block "缺 solver venv —— cd solver_v4 && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt。"; }

# 12) .env 数据库指向本地 + 回调密钥 ────────────────────────────
log_step "12/12 .env 关键项"
DBH="$(env_get DB_HOST)"; DBURL="$(env_get DATABASE_URL)"
if echo "${DBH}${DBURL}" | grep -qE 'localhost|127\.0\.0\.1' || [ -z "${DBH}${DBURL}" ]; then
  log_pass "数据库指向本地(DB_HOST=${DBH:-默认})。"
else
  log_warn "DB_HOST/DATABASE_URL 似乎指向非本地地址(${DBH})。确认不是遗留的 Zeabur 远程库,否则会连错库。"
fi
[ -n "$(env_get SOLVER_CALLBACK_SECRET)" ] && log_pass "SOLVER_CALLBACK_SECRET 已配置。" \
  || log_warn "backend/.env 无 SOLVER_CALLBACK_SECRET —— 求解回调会被 401(见 README)。"

# 总览 ──────────────────────────────────────────────────────────
echo
echo "──────────────────────────────────────────────"
echo "SUMMARY: MDM=${SUM_MDM} FileVault=${SUM_FV} AutoLogin=${SUM_AL} Firewall=${SUM_FW} Proxy=${SUM_PROXY} Ports=${SUM_PORTS} 产物=${SUM_ART}"
echo "结果: ${PASS_N} PASS / ${WARN_N} WARN / ${BLOCK_N} BLOCK"
echo "──────────────────────────────────────────────"
[ "${BLOCK_N}" -eq 0 ]
