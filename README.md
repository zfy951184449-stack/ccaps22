# MFG8APS / CCAPS22

生物制药 APS（Advanced Process Scheduling）项目，当前仓库是一个前后端加 Python 求解器的单体仓库，目标是把工艺模板、批次计划、人员排班、资源约束和运行监控放到同一套系统里。

这份 README 以当前代码为准重写，不再沿用旧版文档里的完成度百分比和历史架构描述。

## 当前代码快照

- 主前端在 `frontend/`，技术栈是 React 18 + Ant Design + CRA。
- 主后端在 `backend/`，技术栈是 Express + TypeScript + MySQL。
- 当前有效求解器是 `solver_v4/`，技术栈是 Flask + OR-Tools CP-SAT，默认端口 `5005`。
- 仓库里仍保留 V2 / V3 / V4 多套排班接口与页面，属于并行演进状态，不是完全清理后的单版本代码库。
- 最近新增和正在集成的是平台资源建模链路，包括平台总览、资源中心、项目排产中心、维护窗口、模板资源规则、批次资源快照。

## 真实模块范围

### 前端页面

当前主应用在 `frontend/src/App.tsx` 中注册了这些页面：

- 调度中心 / Dashboard
- 组织与人员
- 资质管理 / 资质矩阵
- 操作管理 / 操作类型
- 工艺模板
- 批次管理 / 批次管理 V4
- 任务池
- 排班总览 / 人员排班
- 自动排班 / 模块化排班 / Scheduling V3 / Solver V4
- 班次定义 / 操作约束
- 系统监控 / 系统设置 / 排班调试
- 平台总览 / 资源中心 / 项目排产中心 / 维护窗口 / 业务规则中心 / 运行监控

### 后端 API 分组

当前 `backend/src/server.ts` 实际挂载了这些主路由：

- 主数据：`/api/employees`、`/api/qualifications`、`/api/operations`、`/api/operation-types`
- 工艺建模：`/api/process-templates`、`/api/process-stages`、`/api/stage-operations`
- 批次与日历：`/api/batch-plans`、`/api/calendar`、`/api/share-groups`
- 排班：`/api/v2/scheduling`、`/api/v3/scheduling`、`/api/v4/scheduling`
- 甘特：`/api/v4/gantt`、`/api/v5/gantt`
- 资源平台：`/api/resources`、`/api/maintenance-windows`、`/api/operation-resource-requirements`
- 平台聚合：`/api/platform`
- 模板/批次资源规则：`/api/template-stage-operations/:scheduleId/resources`、`/api/batch-operations/:operationPlanId/resources`
- 辅助模块：`/api/dashboard`、`/api/system`、`/api/database`、`/api/standalone-tasks`

### Solver V4

`solver_v4/` 当前提供：

- `GET /api/v4/health`
- `POST /api/v4/solve`
- `POST /api/v4/abort/:request_id`

求解器里已经存在的约束和目标包括：

- 锁定操作 / 锁定班次
- 班次覆盖
- 可用性
- 夜班休息 / 夜班间隔
- 共享组
- 标准工时
- 连续工作日限制
- 单人唯一分配
- 多种最小化目标

## 目录结构

```text
MFG8APS/
├── frontend/                  # 主 Web 前端（React 18 + CRA）
├── backend/                   # 主 API 服务（Express + TypeScript）
├── solver_v4/                 # 当前有效求解器（Flask + OR-Tools）
├── database/
│   ├── migrations/            # 版本化 SQL 迁移
│   └── backups/               # 数据库备份输出
├── docs/                      # 设计和历史文档
├── scripts/                   # 校验和辅助脚本
└── archive/                   # 历史实现与归档代码
```

## 环境要求

- Node.js 与 npm
- Python 3
- MySQL
- macOS 下如果使用仓库自带启动脚本，默认会检查 Homebrew 的 `mysql` 服务

## 环境变量

仓库里目前没有维护好的 `.env.sample`，下面是代码里实际读取到的主要变量。

### 后端运行

- `DB_HOST`，默认 `localhost`
- `DB_PORT`，默认 `3306`
- `DB_USER`，默认 `root`
- `DB_PASSWORD`，默认空
- `DB_NAME`，默认 `aps_system`
- `DB_CHARSET`，默认 `utf8mb4_general_ci`
- `HOST`，默认 `0.0.0.0`
- `PORT`，默认 `3001`
- `SOLVER_BASE_URL`，默认 `http://localhost:5005`
- `SOLVER_V4_URL`，默认 `http://localhost:5005`
- `SOLVER_V3_URL`，默认 `http://localhost:5002`
- `SOLVER_URL`，默认 `http://localhost:5001`
- `CORS_ALLOWED_ORIGINS`，逗号分隔白名单；未设置时允许所有来源
- `TIANAPI_KEY` / `TIAN_API_KEY`，节假日能力相关

### 资源规则功能开关

- `ENABLE_TEMPLATE_RESOURCE_RULES`
- `ENABLE_BATCH_RESOURCE_SNAPSHOTS`
- `ENABLE_RUNTIME_RESOURCE_SNAPSHOT_READ`

### 前端

- `REACT_APP_MONTH_TOLERANCE_HOURS`，默认 `8`

### 旧迁移脚本使用的变量

`backend/package.json` 里的 `migrate:metrics` / `migrate:personnel` 仍然读取 `MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`，和后端运行时使用的 `DB_*` 变量不是同一套命名。

## 安装

### 1. 安装后端依赖

```bash
cd backend
npm install
```

### 2. 安装前端依赖

```bash
cd frontend
npm install
```

### 3. 安装 Solver V4 依赖

```bash
cd solver_v4
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 启动方式

### 推荐：一键启动当前主链路

```bash
./start_v4.sh
```

脚本会启动：

- 后端：`3001`
- Solver V4：`5005`
- 前端：`3000`

### 手动启动

后端：

```bash
cd backend
npm run dev
```

前端：

```bash
cd frontend
npm start
```

Solver V4：

```bash
cd solver_v4
source .venv/bin/activate
python app.py
```

## 前端代理与端口

`frontend/src/setupProxy.js` 当前配置：

- `/api` 转发到 `http://localhost:3001`
- `/solver-api` 转发到 `http://localhost:5005/api`

默认端口：

- 前端：`3000`
- 后端：`3001`
- Solver V4：`5005`

## 数据库迁移

当前仓库使用 `database/migrations/` 中的 SQL 文件做版本化迁移，但没有统一迁移执行器。也就是说，新增 schema 变更需要按实际环境手工执行对应 SQL。

最近与平台资源建模相关的迁移包括：

- `20260227_create_standalone_tasks.sql`
- `20260301_create_platform_resource_tables.sql`
- `20260302_add_platform_indexes.sql`
- `20260302_create_template_batch_resource_rule_tables.sql`

旧的 `npm run migrate:metrics` 和 `npm run migrate:personnel` 只覆盖较早的人力排班表，不代表当前全量 schema。

## 当前验证命令

仓库里实际可执行的主要校验命令：

```bash
cd backend && npm run build
cd backend && npm test -- --run
cd frontend && npm run build
cd frontend && npm test -- --watchAll=false
./scripts/verify_v4_archive.sh
```

## 当前本地校验快照

以下结论来自 2026-03-02 这次按当前代码实际执行的结果，不是沿用旧 README：

- `cd backend && npm run build`：通过
- `cd frontend && npm run build`：通过，但有较多 ESLint warnings
- `cd frontend && npm test -- --watchAll=false`：通过
- `./scripts/verify_v4_archive.sh`：通过
- `cd backend && npm test -- --run`：未通过

当前后端失败主要集中在三类：

- `schedulingV2.test.ts` 中的默认求解配置断言与源码不一致
- `schedulingV2Integration.test.ts` 中对 `../config/database` 的 mock/require 路径有问题
- `batchLifecycleService.test.ts` 的接口期望与当前生命周期行为不一致

## 资源平台相关现状

最近一轮真实开发重点在平台资源建模链路，代码里已经有：

- 平台总览：项目数、激活批次、资源数、规则覆盖率、冲突和维护阻断聚合
- 资源中心：资源、日历、维护窗口
- 项目排产中心：项目时间线、资源绑定、依赖图
- 业务规则中心：资源规则覆盖情况
- 运行监控：排班运行明细
- 模板资源规则和批次资源快照

但这条链路目前仍带 feature flag，不是默认全量启用的稳定生产模块。

## 已知限制

- 后端目前没有看到完整的认证、授权、RBAC 中间件。
- `backend/src/server.ts` 里仍保留测试/临时接口与临时数据返回逻辑，尤其是 `personnel-schedules/metrics` 和 `personnel-schedules/overview` 附近，正式上线前应清理。
- 仓库没有现成的 Docker、CI workflow 或标准化部署编排文件。
- 主仓库同时保留 V2 / V3 / V4 多套排班实现，阅读和排障时需要先确认当前链路。
- README 现在只反映代码现状，不再假设所有模块都已达到生产级稳定性。

## 相关文件

- 主前端入口：`frontend/src/App.tsx`
- 后端入口：`backend/src/server.ts`
- Solver V4 入口：`solver_v4/app.py`
- 推荐启动脚本：`start_v4.sh`
- V4 校验脚本：`scripts/verify_v4_archive.sh`
