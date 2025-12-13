#!/bin/bash
# 检查最近一次求解结果中操作的人员分配情况

# 假设数据库位置（请根据实际情况调整）
DB_PATH="./backend/db.sqlite"

if [ ! -f "$DB_PATH" ]; then
    echo "数据库文件不存在: $DB_PATH"
    echo "请指定正确的数据库路径"
    exit 1
fi

echo "========================================================================"
echo "操作分配分析报告"
echo "========================================================================"
echo ""

# 查找最新的批次ID
LATEST_BATCH=$(sqlite3 "$DB_PATH" "SELECT DISTINCT batch_code FROM scheduling_run_batch ORDER BY id DESC LIMIT 1;")

if [ -z "$LATEST_BATCH" ]; then
    echo "未找到任何批次数据"
    exit 1
fi

echo "分析批次: $LATEST_BATCH"
echo ""

# 创建临时SQL查询文件
SQL_FILE=$(mktemp)
