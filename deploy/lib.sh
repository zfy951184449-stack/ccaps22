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

# 判断一段 SQL(从 stdin 读)是否【需人工】。返回 0=危险(自动更新暂停,等人工),
# 1=安全(可无人值守自动应用)。安全白名单 = 严格新增(见 OPERATIONS.md §6):
#   · 纯 INSERT 配置种子;
#   · 幂等建新表 CREATE TABLE IF NOT EXISTS —— 只新增、不碰既有数据,且幂等(回滚重跑也不报错);
#   · 纯新增的 ALTER … ADD(加列/加索引/加约束)—— 加列对既有数据无损;务必配幂等写法
#     (information_schema 守卫:列已存在则空操作),回滚重跑也不报错。
# 危险(暂停)= DROP/TRUNCATE/RENAME/UPDATE/DELETE(动到既有结构或数据);
#   改写既有列/字符集的 ALTER(MODIFY/CHANGE/CONVERT)、非 ADD 的 ALTER;
#   以及非「CREATE TABLE IF NOT EXISTS」的 CREATE(裸建表无幂等保护 / 建索引·视图·触发器…)。
# 判定偏保守:拿不准一律按危险暂停(误暂停=人工跑一下,误放行=无人值守改坏生产库)。
sql_is_risky() {
  local sql
  # 去整行 -- 注释 → 压平成单行(兼容跨行 DDL)→ 统一大写(简化匹配,不影响真正执行的原文)
  sql="$(grep -v '^[[:space:]]*--' | tr '\n' ' ' | tr '[:lower:]' '[:upper:]')"
  # 先抹掉外键引用动作 / 时间戳列里的 ON DELETE、ON UPDATE —— 它们是建表里的良性词,不算改删
  sql="$(printf '%s' "${sql}" | sed -E 's/[[:<:]]ON[[:space:]]+(DELETE|UPDATE)[[:>:]]/ /g')"
  # 1) 改/删既有结构或数据的动词 → 危险(ALTER 不在此列,见 3))
  printf '%s' "${sql}" | grep -qE '\b(DROP|TRUNCATE|RENAME|UPDATE|DELETE)[[:space:]]' && return 0
  # 2) 改写既有列/字符集的 ALTER 子句 → 危险
  printf '%s' "${sql}" | grep -qE '\b(MODIFY|CHANGE|CONVERT)[[:space:]]' && return 0
  # 3) ALTER 只放行「纯新增」(ALTER … ADD …);出现 ALTER 却无 ADD → 危险
  if printf '%s' "${sql}" | grep -qE '\bALTER[[:space:]]'; then
    printf '%s' "${sql}" | grep -qE '\bADD[[:space:]]' || return 0
  fi
  # 4) 存在非「CREATE TABLE IF NOT EXISTS」的 CREATE(裸建表/建索引/视图/触发器…)→ 危险
  local n_create n_safe
  n_create="$(printf '%s' "${sql}" | grep -oE '\bCREATE\b' | wc -l | tr -d ' ' || true)"
  n_safe="$(printf '%s' "${sql}"   | grep -oE '\bCREATE[[:space:]]+TABLE[[:space:]]+IF[[:space:]]+NOT[[:space:]]+EXISTS\b' | wc -l | tr -d ' ' || true)"
  [ "${n_create:-0}" != "${n_safe:-0}" ] && return 0
  return 1
}

# 用 backend/.env 的 DB 账号跑一个 SQL 文件(只给纯 INSERT 配置种子用)
run_sql_file() {
  local f="$1" dbn dbu dbp mysqlbin
  dbn="$(env_get DB_NAME)"; : "${dbn:=aps_system}"
  dbu="$(env_get DB_USER)"; : "${dbu:=root}"
  dbp="$(env_get DB_PASSWORD)"
  mysqlbin="${BREW_PREFIX}/bin/mysql"; [ -x "${mysqlbin}" ] || mysqlbin="mysql"
  MYSQL_PWD="${dbp}" "${mysqlbin}" --protocol=TCP -h127.0.0.1 -P3306 -u"${dbu}" "${dbn}" < "${f}"
}
