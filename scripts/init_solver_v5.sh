#!/bin/bash
# S0: solver_v5 骨架生成脚本
# 从 solver_v4 复制 → 删废弃文件 → 改类名/版本/端口/端点前缀

set -e

REPO_ROOT="/Users/zhengfengyi/MFG8APS"
SRC="$REPO_ROOT/solver_v4"
DST="$REPO_ROOT/solver_v5"

echo "[S0] 初始化 solver_v5 骨架..."

# 1. 复制整个 solver_v4 到 solver_v5（保留 .venv/logs 等大文件）
if [ -d "$DST" ]; then
  echo "[S0] 清理现有 solver_v5..."
  rm -rf "$DST"
fi

echo "[S0] 复制 solver_v4 → solver_v5..."
cp -r "$SRC" "$DST"

# 2. 删除 6 个废弃文件
DEPRECATED_FILES=(
  "constraints/night_rest.py"
  "constraints/night_shift_interval.py"
  "constraints/no_isolated_night_shift.py"
  "constraints/consecutive_rest_limit.py"
  "constraints/work_days_limit.py"
  "objectives/minimize_hours.py"
)

for file in "${DEPRECATED_FILES[@]}"; do
  path="$DST/$file"
  if [ -f "$path" ]; then
    echo "[S0] 删除 $file..."
    rm "$path"
  fi
done

# 3. 改类名 SolverV4 → SolverV5 (全局)
echo "[S0] 改类名 SolverV4 → SolverV5..."
find "$DST" -name "*.py" -type f | while read -r file; do
  sed -i '' 's/class SolverV4/class SolverV5/g' "$file"
  sed -i '' 's/from core\.solver import SolverV4/from core.solver import SolverV5/g' "$file"
  sed -i '' 's/solver = SolverV4(/solver = SolverV5(/g' "$file"
done

# 4. 改类名 APICallback → APICallbackV5
echo "[S0] 改类名 APICallback → APICallbackV5..."
find "$DST" -name "*.py" -type f | while read -r file; do
  sed -i '' 's/class APICallback/class APICallbackV5/g' "$file"
done

# 5. 改 VERSION 为 5.0.0-alpha
echo "[S0] 改 VERSION → 5.0.0-alpha..."
sed -i '' 's/VERSION = "4\.0\.0-alpha"/VERSION = "5.0.0-alpha"/g' "$DST/app.py"
sed -i '' 's/VERSION = "4\..*"/VERSION = "5.0.0-alpha"/g' "$DST/app.py"

# 6. 改端口 5005 → 5006（避免改掉 logger 中的 50055 等）
echo "[S0] 改端口 5005 → 5006..."
sed -i '' 's/:5005/:5006/g' "$DST/app.py"
sed -i '' 's/:5005/:5006/g' "$DST/.env.sample"

# 7. 改端点前缀 /api/v4/* → /api/v5/*
echo "[S0] 改端点前缀 /api/v4/* → /api/v5/*..."
sed -i '' 's|/api/v4/|/api/v5/|g' "$DST/app.py"

# 8. 改 service 值为 "Solver V5"
echo "[S0] 改 service 名称 → Solver V5..."
sed -i '' 's/"service": "Solver V4"/"service": "Solver V5"/g' "$DST/app.py"
sed -i '' "s/'service': 'Solver V4'/'service': 'Solver V5'/g" "$DST/app.py"

echo "[S0] ✓ solver_v5 骨架生成完成"
