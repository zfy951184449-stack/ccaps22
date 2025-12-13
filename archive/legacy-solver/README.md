# Solver Service

一个最小可用的 OR-Tools 求解服务，提供与后端 `SolverBridge` 兼容的 `/api/solve` 接口。

## 启动
```bash
cd solver
python3 -m venv .venv
source .venv/bin/activate
pip install flask ortools
python server.py
```
默认监听 `http://0.0.0.0:5005`。

## 逻辑简介
- 接收 `AutoSchedulingService` 组装的 `operationDemands`/`employeeProfiles`。
- 使用 CP-SAT 模型给满足资质要求的员工布尔变量。
- 约束：每个操作分配人数 ≥ `requiredPeople`。
- 目标：最小化分配总人数。
- 输出 `assignments` 数组供后端写入。
