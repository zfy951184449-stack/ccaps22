# ──────────────────────────────────────────────────────────────
# 公共函数库 —— 被其余脚本 source。bash 3.2 兼容。
# ──────────────────────────────────────────────────────────────

# 颜色(终端支持时)
if [ -t 1 ]; then
  C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YEL=$'\033[0;33m'
  C_BLU=$'\033[0;34m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
else
  C_RED=; C_GRN=; C_YEL=; C_BLU=; C_DIM=; C_RST=
fi

# preflight 计数器
PASS_N=0; WARN_N=0; BLOCK_N=0

log_info()  { printf '%s %s\n' "${C_BLU}i ${C_RST}" "$*"; }
log_pass()  { printf '%s %s\n' "${C_GRN}PASS ${C_RST}" "$*"; PASS_N=$((PASS_N+1)); }
log_warn()  { printf '%s %s\n' "${C_YEL}WARN ${C_RST}" "$*"; WARN_N=$((WARN_N+1)); }
log_block() { printf '%s %s\n' "${C_RED}BLOCK${C_RST}" "$*"; BLOCK_N=$((BLOCK_N+1)); }
log_step()  { printf '\n%s\n' "${C_BLU}==> $*${C_RST}"; }

# 从 backend/.env 读一个 key 的值(无则空)。不打印,供管道取值。
env_get() {
  local key="$1" file="${PROJECT_ROOT}/backend/.env"
  [ -f "$file" ] || return 0
  grep -E "^${key}=" "$file" | head -n1 | cut -d= -f2- | tr -d '\r'
}

# 取局域网 IP(en0 优先,回退 en1)
lan_ip() {
  local ip
  ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
  [ -z "$ip" ] && ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
  printf '%s' "${ip:-<本机IP>}"
}

# 幂等加载一个 LaunchAgent:$1=plist 路径 $2=label
# 用现代 bootstrap/enable/kickstart 三连,避免 legacy load -w 行为不一致。
load_agent() {
  local plist="$1" label="$2" uid; uid="$(id -u)"
  if ! plutil -lint "$plist" >/dev/null 2>&1; then
    log_block "plist 格式错误: $plist"; return 1
  fi
  # 先幂等卸载(label 形式 + plist 形式都试),再加载
  launchctl bootout "gui/${uid}/${label}" >/dev/null 2>&1 || true
  launchctl bootout "gui/${uid}" "$plist"   >/dev/null 2>&1 || true
  launchctl bootstrap "gui/${uid}" "$plist"
  launchctl enable "gui/${uid}/${label}" >/dev/null 2>&1 || true
  launchctl kickstart -k -p "gui/${uid}/${label}" >/dev/null 2>&1 || true
}

# 卸载一个 LaunchAgent
unload_agent() {
  local plist="$1" label="$2" uid; uid="$(id -u)"
  launchctl bootout "gui/${uid}/${label}" >/dev/null 2>&1 || true
  launchctl bootout "gui/${uid}" "$plist"   >/dev/null 2>&1 || true
}

# 查 agent 运行状态(running 等);未加载则空
agent_state() {
  local label="$1" uid; uid="$(id -u)"
  launchctl print "gui/${uid}/${label}" 2>/dev/null \
    | awk -F'= ' '/^[[:space:]]*state =/{gsub(/[[:space:]]/,"",$2); print $2; exit}'
}

# 等待 URL 健康:$1=url $2=名称 $3=重试次数
wait_for_url() {
  local url="$1" name="$2" tries="${3:-30}" i
  i=1
  while [ "$i" -le "$tries" ]; do
    if curl -fsS --max-time 2 -o /dev/null "$url" 2>/dev/null; then
      log_pass "${name} 就绪 (${url})"; return 0
    fi
    sleep 1; i=$((i+1))
  done
  log_block "${name} 启动超时 (${url}) —— 看日志 ${LOG_DIR}"; return 1
}
