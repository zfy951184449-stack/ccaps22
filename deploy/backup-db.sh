#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# 备份 aps_system 数据库到 database/backups/(读 backend/.env 的 DB_*)。
# 手动跑,或挂成每日 launchd 定时(见 README 第 5 节)。保留最近 14 份。
# ──────────────────────────────────────────────────────────────
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/config.sh"
# shellcheck source=/dev/null
. "${DEPLOY_DIR}/lib.sh"

DB_NAME="$(env_get DB_NAME)"; : "${DB_NAME:=aps_system}"
DB_USER="$(env_get DB_USER)"; : "${DB_USER:=root}"
DB_PASS="$(env_get DB_PASSWORD)"
DB_HOST="$(env_get DB_HOST)"; : "${DB_HOST:=127.0.0.1}"
DB_PORT="$(env_get DB_PORT)"; : "${DB_PORT:=3306}"

OUT_DIR="${PROJECT_ROOT}/database/backups"
mkdir -p "${OUT_DIR}"
TS="$(date '+%Y%m%d_%H%M%S')"
OUT="${OUT_DIR}/${DB_NAME}_${TS}.sql"
MYSQLDUMP="${BREW_PREFIX}/bin/mysqldump"
[ -x "${MYSQLDUMP}" ] || MYSQLDUMP="mysqldump"

echo "备份 ${DB_NAME}@${DB_HOST}:${DB_PORT} -> ${OUT}"
# 用 MYSQL_PWD 传密码,避免命令行明文(仍建议改用 ~/.my.cnf)
MYSQL_PWD="${DB_PASS}" "${MYSQLDUMP}" \
  --no-tablespaces --single-transaction --routines --triggers \
  -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "${DB_NAME}" > "${OUT}"

# 轮转:仅保留最近 14 份
ls -1t "${OUT_DIR}/${DB_NAME}_"*.sql 2>/dev/null | tail -n +15 | while IFS= read -r f; do rm -f "$f"; done

echo "完成: ${OUT} ($(du -h "${OUT}" | cut -f1))"
