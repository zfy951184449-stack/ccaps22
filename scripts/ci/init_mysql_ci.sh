#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-root}"
DB_NAME="${DB_NAME:-aps_system}"

if [[ "${DB_NAME}" != "aps_system" ]]; then
  echo "This initializer currently supports only DB_NAME=aps_system because the imported SQL files hardcode USE aps_system." >&2
  exit 1
fi

MYSQL=(mysql --protocol=TCP -h"${DB_HOST}" -P"${DB_PORT}" -u"${DB_USER}" "-p${DB_PASSWORD}" --default-character-set=utf8mb4)

echo "Preparing MySQL schema for CI on ${DB_HOST}:${DB_PORT}/${DB_NAME}"

"${MYSQL[@]}" -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`; CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

"${MYSQL[@]}" < "${ROOT_DIR}/database/create_aps_database.sql"
"${MYSQL[@]}" < "${ROOT_DIR}/database/create_batch_planning_tables.sql"
"${MYSQL[@]}" < "${ROOT_DIR}/database/update_personnel_scheduling_schema.sql"
"${MYSQL[@]}" < "${ROOT_DIR}/database/ci/patch_batch_lifecycle_ci.sql"
"${MYSQL[@]}" < "${ROOT_DIR}/database/ci/seed_minimal_ci_data.sql"

echo "MySQL CI schema ready"
