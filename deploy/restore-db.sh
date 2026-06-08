#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# 把一个 mysqldump 的 .sql 导入目标库(配合源机的 backup-db.sh 迁移业务数据)。
# git 里只有 schema、没有业务数据;真实数据靠这对脚本搬。
# 用法: ./deploy/restore-db.sh <dump.sql>
# ──────────────────────────────────────────────────────────────
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

F="${1:-}"
[ -f "$F" ] || { echo "用法: $0 <dump.sql>"; exit 1; }

DB_NAME="$(env_get DB_NAME)"; : "${DB_NAME:=aps_system}"
DB_USER="$(env_get DB_USER)"; : "${DB_USER:=root}"
DB_PASS="$(env_get DB_PASSWORD)"
MYSQL_BIN="${BREW_PREFIX}/bin/mysql"; [ -x "$MYSQL_BIN" ] || MYSQL_BIN="mysql"
MYSQL_RUN() { MYSQL_PWD="${DB_PASS}" "$MYSQL_BIN" --protocol=TCP -h127.0.0.1 -P3306 -u"${DB_USER}" "$@"; }

echo "导入 ${F} -> ${DB_NAME}(会覆盖同名表,请确认这是要导入的备份)"
MYSQL_RUN -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
MYSQL_RUN "${DB_NAME}" < "${F}"
echo "完成:已导入 ${DB_NAME}"
