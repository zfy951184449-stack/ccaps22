# 排班系统 V2 实现文档

## 项目概述

排班系统 V2 是一个模块化的自动排班解决方案，采用约束编程（CP-SAT）求解器实现智能人员排班。

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
│  ModularScheduling  │  SolveProgress  │  schedulingV2Api        │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP API
┌──────────────────────────────▼──────────────────────────────────┐
│                     Backend (Express.js)                         │
│  schedulingV2Controller  │  DataAssembler  │  PersistenceService │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP API
┌──────────────────────────────▼──────────────────────────────────┐
│                      Solver (Python/Flask)                       │
│     Constraints     │    Objectives    │    ResultBuilder        │
└─────────────────────────────────────────────────────────────────┘
```

## 模块说明

### 1. 前端模块

#### 文件结构
```
frontend/src/
├── components/ModularScheduling/
│   ├── index.tsx           # 主组件
│   ├── BatchSelector.tsx   # 批次选择器
│   ├── SchedulingWindow.tsx # 求解区间显示
│   ├── SchedulingSummary.tsx # 求解摘要
│   ├── SolveProgress.tsx   # 进度显示
│   ├── SolveResultSummary.tsx # 结果展示
│   ├── types.ts            # 类型定义
│   └── styles.css          # 样式
└── services/
    └── schedulingV2Api.ts  # API 服务
```

#### 功能特性
- 批次多选与搜索过滤
- 自动计算求解区间（扩展到完整月份）
- 高级配置抽屉（工时约束、连续工作限制等）
- 实时进度轮询
- 结果展示与统计

### 2. 后端模块

#### 文件结构
```
backend/src/
├── controllers/
│   └── schedulingV2Controller.ts  # API 控制器
├── routes/
│   └── schedulingV2Routes.ts      # 路由定义
├── services/schedulingV2/
│   ├── index.ts                   # 入口
│   ├── dataAssembler.ts           # 数据组装
│   ├── resultParser.ts            # 结果解析
│   └── persistenceService.ts      # 持久化服务
├── types/
│   └── schedulingV2.ts            # 类型定义
└── tests/
    ├── schedulingV2.test.ts       # 单元测试
    └── schedulingV2Integration.test.ts # 集成测试
```

#### API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/v2/scheduling/solve | 创建排班任务 |
| GET | /api/v2/scheduling/runs | 列出排班任务 |
| GET | /api/v2/scheduling/runs/:runId | 查询任务状态 |
| GET | /api/v2/scheduling/runs/:runId/result | 获取任务结果 |
| POST | /api/v2/scheduling/runs/:runId/retry | 重试失败任务 |
| POST | /api/v2/scheduling/runs/:runId/cancel | 取消任务 |
| GET | /api/v2/scheduling/solver/health | 求解器健康检查 |

### 3. 求解器模块

#### 文件结构
```
solver/
├── contracts/
│   ├── request.py         # 请求数据结构
│   └── response.py        # 响应数据结构
├── models/
│   ├── context.py         # 求解上下文
│   └── variables.py       # 变量管理
├── constraints/
│   ├── base.py            # 基类
│   ├── operation_assignment.py  # 操作分配约束
│   ├── shift_consistency.py     # 班次一致性约束
│   ├── monthly_hours.py         # 月度工时约束
│   ├── consecutive_work.py      # 连续工作约束
│   ├── night_rest.py            # 夜班休息约束
│   ├── qualification.py         # 资质匹配约束
│   └── sharing.py               # 共享组约束
├── objectives/
│   └── builder.py         # 目标函数构建
├── core/
│   ├── solver.py          # 主求解逻辑
│   └── result_builder.py  # 结果构建
└── app.py                 # Flask 应用
```

## 约束系统

### 硬约束（必须满足）

| 约束 | 说明 | 配置参数 |
|------|------|----------|
| 月度工时范围 | 排班工时在 [标准工时-下限偏移, 标准工时+上限偏移] 范围内 | `monthly_hours_lower_offset`, `monthly_hours_upper_offset` |
| 最大连续工作 | 不得连续工作超过 N 天 | `max_consecutive_workdays` |
| 资质匹配 | 员工资质等级 >= 操作要求等级 | - |
| 共享组约束 | 共享组成员操作的人员必须为锚点操作人员的子集 | - |
| 不超额分配 | 操作分配人数 <= 所需人数 | - |
| 锁定执行 | 锁定的分配必须保留 | - |

### 软约束（尽量满足）

| 约束 | 说明 | 优化目标 |
|------|------|----------|
| 夜班休息 | 夜班后休息 N 天 | 最小化违规 |
| 三倍工资日人数 | 三倍工资节假日最小化人数 | 最小化人员 |
| 班次选择 | 选择覆盖所有操作的最短班次 | 最小化工时 |

## 数据流

### 创建任务流程

```
1. 前端提交请求
   ↓
2. 后端创建运行记录 (status: QUEUED)
   ↓
3. 异步执行求解
   ├── 3.1 组装数据 (stage: ASSEMBLING)
   ├── 3.2 调用求解器 (stage: SOLVING)
   ├── 3.3 解析结果 (stage: PARSING)
   └── 3.4 保存结果 (stage: PERSISTING)
   ↓
4. 更新状态 (status: COMPLETED/FAILED)
```

### 轮询机制

前端每 2 秒轮询一次任务状态，直到任务完成或失败。

## 配置说明

### 默认配置

```typescript
{
  // 月度工时约束
  monthly_hours_lower_offset: 16,  // 允许低于标准工时 16 小时
  monthly_hours_upper_offset: 16,  // 允许高于标准工时 16 小时
  
  // 连续工作约束
  max_consecutive_workdays: 6,     // 最多连续工作 6 天
  
  // 夜班约束
  night_shift_rest_days: 2,        // 夜班后休息 2 天
  
  // 求解器参数
  solver_time_limit_seconds: 60,   // 求解时间限制 60 秒
}
```

## 数据库迁移

运行以下迁移脚本以添加 V2 所需的表结构：

```bash
mysql -u$MYSQL_USER -p$MYSQL_PASSWORD $MYSQL_DATABASE < database/migrations/20241203_create_scheduling_v2_tables.sql
```

## 测试

### 运行单元测试

```bash
cd backend && npm test
```

### 测试覆盖的场景

1. 数据组装服务
   - 空批次列表处理
   - 操作资质获取
   - 日历数据生成

2. 结果解析服务
   - 响应解析
   - 重复检测
   - 验证警告

3. API 集成测试
   - 参数验证
   - 状态查询
   - 取消/重试操作

## 部署

### 环境变量

```bash
# 后端
SOLVER_URL=http://localhost:5001

# 求解器
FLASK_ENV=production
FLASK_PORT=5001
```

### 启动服务

```bash
# 启动后端
cd backend && npm start

# 启动求解器
cd solver && python app.py
```

## 注意事项

1. **求解器可用性**：确保求解器服务在后端调用前已启动
2. **数据完整性**：批次必须处于 `ACTIVATED` 状态才能被排班
3. **员工状态**：只有 `is_active=1` 的员工会被考虑
4. **班次配置**：至少需要配置一个有效的班次定义
5. **日历数据**：建议提前导入节假日和工作日数据

## 后续优化

- [ ] WebSocket 实时进度推送
- [ ] 批量任务管理
- [ ] 历史结果对比
- [ ] 约束冲突可视化
- [ ] 求解参数自动调优

