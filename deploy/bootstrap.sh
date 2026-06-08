#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# MFG8APS 引导部署(bootstrap):从 git clone 之后,一条命令到服务起来。
# 适合「目标机能访问 GitHub + 能联网」。幂等可反复跑。
# 能自动的全自动;必须人工/管理员的几步(brew、Xcode CLT、.env 密钥、
# MySQL 密码、业务数据)会停下来清楚提示,不假装成功。
#
# 用法:
#   git clone -b <分支> https://github.com/zfy951184449-stack/ccaps22.git
#   cd ccaps22
#   ./deploy/bootstrap.sh            # 装依赖 → 构建 → 建库 → launchd 起服务
#   ./deploy/bootstrap.sh --no-pull  # 跳过 git pull,用当前工作区代码
# ──────────────────────────────────────────────────────────────
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

DO_PULL=1
for a in "$@"; do
  case "$a" in
    --no-pull) DO_PULL=0 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "未知参数: $a(用 -h 看用法)"; exit 2 ;;
  esac
done

echo "════════ MFG8APS 引导部署(从源码到服务)════════"

# 0) 基础工具(可能需人工/管理员)────────────────────────────────
log_step "0/6 基础工具"
if ! xcode-select -p >/dev/null 2>&1; then
  log_block "未装 Xcode Command Line Tools(git/编译依赖它)。运行(会弹窗,装完重跑本脚本):
    xcode-select --install"
  exit 1
fi
log_pass "Xcode CLT 就绪"
if ! command -v brew >/dev/null 2>&1; then
  log_block "未装 Homebrew。先装(可能需管理员密码),装完重跑本脚本:
    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"
  装好后按提示执行: eval \"\$(${BREW_PREFIX}/bin/brew shellenv)\""
  exit 1
fi
log_pass "Homebrew 就绪"

# 1) 运行时依赖(brew,幂等;python3 用系统自带)─────────────────────
log_step "1/6 运行时(brew install,幂等)"
for pkg in git node mysql; do
  if brew list --versions "$pkg" >/dev/null 2>&1; then
    log_pass "$pkg 已装"
  else
    log_info "安装 $pkg ..."; brew install "$pkg"
  fi
done
if command -v python3 >/dev/null 2>&1; then
  log_pass "python3 就绪($(python3 --version 2>&1))"
else
  log_block "缺 python3(应随 Xcode CLT 提供)。"; exit 1
fi

# 2) 更新代码 ────────────────────────────────────────────────────
if [ "$DO_PULL" -eq 1 ] && [ -d "${PROJECT_ROOT}/.git" ]; then
  log_step "2/6 更新代码(git pull,当前分支)"
  if ( cd "${PROJECT_ROOT}" && git pull --ff-only ); then
    log_pass "已更新($(cd "${PROJECT_ROOT}" && git branch --show-current 2>/dev/null))"
  else
    log_warn "git pull 跳过(有本地改动或非快进),用当前工作区代码继续。"
  fi
fi

# 3) 依赖 + 构建 ─────────────────────────────────────────────────
log_step "3/6 安装依赖 + 构建(首次几分钟)"
( cd "${PROJECT_ROOT}/backend"  && npm install && npm run build )
( cd "${PROJECT_ROOT}/frontend" && npm install && CI=false npm run build )
( cd "${PROJECT_ROOT}/solver_v4" \
    && { [ -d .venv ] || python3 -m venv .venv; } \
    && ./.venv/bin/pip install -q --upgrade pip \
    && ./.venv/bin/pip install -q -r requirements.txt )
log_pass "依赖与构建完成"

# 4) backend/.env ────────────────────────────────────────────────
log_step "4/6 backend/.env"
if [ ! -f "${PROJECT_ROOT}/backend/.env" ]; then
  if [ -f "${PROJECT_ROOT}/backend/.env.sample" ]; then
    cp "${PROJECT_ROOT}/backend/.env.sample" "${PROJECT_ROOT}/backend/.env"
    log_block "已从 .env.sample 生成 backend/.env。请填好 DB_PASSWORD / JWT_SECRET / SOLVER_CALLBACK_SECRET 等,再重跑本脚本。"
  else
    log_block "缺 backend/.env 且无 .env.sample,无法继续。"
  fi
  exit 1
fi
log_pass "backend/.env 已就位"

# 5) MySQL:起服务 + 库不存在才初始化(绝不动已有库的数据)──────────
log_step "5/6 MySQL"
if ! brew services list 2>/dev/null | awk 'NR>1 && $1=="mysql"{print $2}' | grep -q started; then
  log_info "启动 MySQL ..."; brew services start mysql || true; sleep 3
fi
DB_NAME="$(env_get DB_NAME)"; : "${DB_NAME:=aps_system}"
DB_USER="$(env_get DB_USER)"; : "${DB_USER:=root}"
DB_PASS="$(env_get DB_PASSWORD)"
MYSQL_BIN="${BREW_PREFIX}/bin/mysql"; [ -x "$MYSQL_BIN" ] || MYSQL_BIN="mysql"
if ! MYSQL_PWD="${DB_PASS}" "$MYSQL_BIN" --protocol=TCP -h127.0.0.1 -P3306 -u"${DB_USER}" -e "SELECT 1" >/dev/null 2>&1; then
  log_block "用 backend/.env 的账号连不上 MySQL。请把 MySQL root 密码与 .env 的 DB_PASSWORD 对齐:
    设密码: ${BREW_PREFIX}/bin/mysqladmin -u root password '你的密码'
  再把同样的值写进 backend/.env 的 DB_PASSWORD,重跑本脚本。"
  exit 1
fi
HAS_DB="$(MYSQL_PWD="${DB_PASS}" "$MYSQL_BIN" --protocol=TCP -h127.0.0.1 -P3306 -u"${DB_USER}" -N -e "SHOW DATABASES LIKE '${DB_NAME}'" 2>/dev/null)"
if [ -z "${HAS_DB}" ]; then
  log_info "库 ${DB_NAME} 不存在,建库 + 导入基础 schema ..."
  MYSQL_PWD="${DB_PASS}" "$MYSQL_BIN" --protocol=TCP -h127.0.0.1 -P3306 -u"${DB_USER}" \
    -e "CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  for f in create_aps_database create_batch_planning_tables update_personnel_scheduling_schema; do
    SQL="${PROJECT_ROOT}/database/${f}.sql"
    if [ -f "$SQL" ]; then
      MYSQL_PWD="${DB_PASS}" "$MYSQL_BIN" --protocol=TCP -h127.0.0.1 -P3306 -u"${DB_USER}" "${DB_NAME}" < "$SQL"
      log_pass "导入 ${f}.sql"
    fi
  done
  log_warn "已建【空 schema 库】。要把现有业务数据迁过来:源机跑 ./deploy/backup-db.sh,把 .sql 拷到本机后 ./deploy/restore-db.sh <file>。"
else
  log_pass "库 ${DB_NAME} 已存在,跳过初始化(不动已有数据)。"
fi

# 6) 部署服务(launchd)───────────────────────────────────────────
log_step "6/6 部署服务"
bash "${DEPLOY_DIR}/uninstall.sh" >/dev/null 2>&1 || true   # 幂等:先停旧实例,免端口占用
bash "${DEPLOY_DIR}/install.sh"
