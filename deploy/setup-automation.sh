#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# 一键装"目标机自动化"(企业网一台两用 + 免手动更新):
#   ① px 开机自启 + 智能分流(读公司 PAC:外网走代理+NTLM,本地/内网直连)
#   ② 终端默认走 px(你在目标机也能上 codex 等开发工具)
#   ③ 每 5 分钟自动更新(护栏:migration 暂停、失败回滚、加锁、日志、macOS 通知)
# 全用户级,无需 sudo。关闭/改密码见末尾提示。
# ──────────────────────────────────────────────────────────────
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

CONF_DIR="${HOME}/.config/mfg8aps"
PX_ENV="${CONF_DIR}/px.env"
PX_LABEL="${LABEL_PREFIX}.px"
AU_LABEL="${LABEL_PREFIX}.autoupdate"
ZRC="${HOME}/.zshrc"
ZMARK="# >>> MFG8APS px proxy >>>"

echo "════════ 安装目标机自动化 ════════"

# 1) 域账号密码 → px.env(600)──────────────────────────────────────
log_step "1/5 配置代理账号(写 ${PX_ENV},权限 600)"
mkdir -p "${CONF_DIR}"; chmod 700 "${CONF_DIR}"
DEF_USER="$(whoami)"
printf "  域账号(直接回车用默认 %s): " "${DEF_USER}"
read -r PXU; [ -z "${PXU}" ] && PXU="${DEF_USER}"
printf "  域密码(输入时不显示,回车确认): "
stty -echo 2>/dev/null || true; read -r PXP; stty echo 2>/dev/null || true; echo

# 从【本机】系统读取当前 PAC(不硬编码,自动适配目标机真实代理配置)
SYS_PAC="$(scutil --proxy 2>/dev/null | awk '/ProxyAutoConfigURLString/{print $NF}')"
if [ -z "${SYS_PAC}" ]; then
  log_warn "未从系统读到自动代理(PAC)地址。"
  printf "  请粘贴本机 PAC 地址(scutil --proxy 里 ProxyAutoConfigURLString 那行的网址): "
  read -r SYS_PAC
fi
log_info "本机 PAC: ${SYS_PAC}"
{
  printf 'PX_USERNAME=%s\n' "${PXU}"
  printf 'PX_PASSWORD=%s\n' "${PXP}"
  printf 'PX_PAC=%s\n' "${SYS_PAC}"
} > "${PX_ENV}"
chmod 600 "${PX_ENV}"
log_pass "账号已保存(${PXU})"

mkdir -p "${LOG_DIR}" "${LAUNCH_AGENTS_DIR}"
chmod +x "${DEPLOY_DIR}/run-px.sh" "${DEPLOY_DIR}/auto-update.sh"

# 2) px 开机自启 plist ────────────────────────────────────────────
log_step "2/5 生成 px 开机自启(智能分流)"
cat > "${LAUNCH_AGENTS_DIR}/${PX_LABEL}.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${PX_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>${DEPLOY_DIR}/run-px.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${HOME}/Library/Python/3.9/bin:${BREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>${LOG_DIR}/px.out.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/px.err.log</string>
</dict>
</plist>
PLIST
log_pass "${PX_LABEL}.plist"

# 3) 自动更新 plist(每 300 秒)──────────────────────────────────────
log_step "3/5 生成自动更新(每 5 分钟查一次)"
cat > "${LAUNCH_AGENTS_DIR}/${AU_LABEL}.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${AU_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>${DEPLOY_DIR}/auto-update.sh</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${BREW_PREFIX}/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>${LOG_DIR}/autoupdate.out.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/autoupdate.err.log</string>
</dict>
</plist>
PLIST
log_pass "${AU_LABEL}.plist"

# 4) ~/.zshrc 默认走 px(开发/codex;幂等)──────────────────────────
log_step "4/5 让终端默认走 px"
if grep -q "${ZMARK}" "${ZRC}" 2>/dev/null; then
  log_info "~/.zshrc 已配置过,跳过"
else
  {
    printf '%s\n' "${ZMARK}"
    printf 'export http_proxy=http://127.0.0.1:%s\n'  "${PX_PORT}"
    printf 'export https_proxy=http://127.0.0.1:%s\n' "${PX_PORT}"
    printf 'export no_proxy=localhost,127.0.0.1,::1,*.local,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16\n'
    printf '%s\n' "# <<< MFG8APS px proxy <<<"
  } >> "${ZRC}"
  log_pass "已写入 ~/.zshrc(新开终端生效)"
fi

# 5) 加载两个 agent ───────────────────────────────────────────────
log_step "5/5 启动 px + 自动更新"
load_agent "${LAUNCH_AGENTS_DIR}/${PX_LABEL}.plist" "${PX_LABEL}" && log_pass "px 已启动"
load_agent "${LAUNCH_AGENTS_DIR}/${AU_LABEL}.plist" "${AU_LABEL}" && log_pass "自动更新已挂上(每 5 分钟)"

sleep 4
if curl -fsS --max-time 10 -x "http://127.0.0.1:${PX_PORT}" https://github.com -o /dev/null 2>&1; then
  log_pass "px 智能分流就绪,外网可达 ✓"
else
  log_warn "px 还没就绪或密码不对 —— 看 ${LOG_DIR}/px.err.log;改密码见下方。"
fi

echo
echo "════════ 自动化已就位 ════════"
echo "  从此:开发机 push → 目标机 5 分钟内自动更新(含 DB 变更则暂停并弹通知)。"
echo "  你在目标机敲命令/上 codex 也会自动走代理(新开终端生效)。"
echo
echo "  改域密码:    编辑 ${PX_ENV} 的 PX_PASSWORD,再 launchctl kickstart -k gui/\$(id -u)/${PX_LABEL}"
echo "  看更新日志:  tail -f ${LOG_DIR}/auto-update.log"
echo "  暂停自动更新: launchctl bootout gui/\$(id -u)/${AU_LABEL}"
echo "  停 px:        launchctl bootout gui/\$(id -u)/${PX_LABEL}"
