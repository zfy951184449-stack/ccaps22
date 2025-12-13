# 模块化排班求解器 v2.0

基于 OR-Tools CP-SAT 的模块化排班求解器。

## 目录结构

```
solver/
├── contracts/           # 数据契约（输入/输出格式定义）
│   ├── __init__.py
│   ├── request.py       # 请求数据结构
│   └── response.py      # 响应数据结构
│
├── models/              # 数据模型
│   ├── __init__.py
│   ├── context.py       # 求解器上下文
│   └── variables.py     # 模型变量容器
│
├── constraints/         # 约束模块
│   ├── __init__.py
│   ├── base.py                  # 约束基类
│   ├── operation_assignment.py  # 操作分配约束
│   ├── shift_consistency.py     # 班次一致性约束
│   ├── monthly_hours.py         # 月度/季度工时约束
│   ├── consecutive_work.py      # 连续工作约束
│   ├── night_rest.py            # 夜班休息约束
│   ├── qualification.py         # 资质匹配约束
│   └── sharing.py               # 共享组约束
│
├── objectives/          # 目标函数
│   ├── __init__.py
│   └── builder.py       # 目标函数构建器
│
├── core/                # 求解器核心
│   ├── __init__.py
│   ├── solver.py        # 主求解器
│   └── result_builder.py # 结果构建器
│
├── app.py               # Flask 应用入口
└── requirements.txt     # Python 依赖
```

## 安装

```bash
cd solver
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 运行

```bash
# 开发模式
FLASK_DEBUG=1 python app.py

# 生产模式
python app.py
```

默认端口: 5001

## API

### 健康检查

```
GET /api/health
```

### 执行求解

```
POST /api/v2/solve
Content-Type: application/json

{
  "request_id": "...",
  "window": { "start_date": "2025-01-01", "end_date": "2025-01-31" },
  "operation_demands": [...],
  "employee_profiles": [...],
  "calendar": [...],
  "shift_definitions": [...],
  "config": {...}
}
```

### 验证请求

```
POST /api/v2/validate
Content-Type: application/json

{ ... }
```

## 约束说明

### 硬约束

1. **资质匹配**: 员工必须具有操作所需资质
2. **人员唯一性**: 同一时间不能执行多个非共享操作
3. **连续工作**: 不得连续工作超过 N 天
4. **夜班休息**: 夜班后第1天必须休息
5. **月度工时**: 月度工时在标准工时 ±N 小时范围内
6. **季度工时**: 季度工时 ≥ 标准工时（仅完整季度）

### 软约束

1. 夜班后第2天尽可能休息
2. 共享组内尽可能使用相同人员
3. 优先选择较短班次
4. 最小化三倍工资日排班人数

## 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| monthly_hours_lower_bound | float | 16 | 月度工时下限偏移 |
| monthly_hours_upper_bound | float | 16 | 月度工时上限偏移 |
| max_consecutive_workdays | int | 6 | 最大连续工作天数 |
| night_shift_rest_days | int | 2 | 夜班后休息天数 |
| solver_time_limit_seconds | float | 60 | 求解时间限制 |
