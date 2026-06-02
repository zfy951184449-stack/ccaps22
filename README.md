# MFG8APS / CCAPS22

生物制药 APS（Advanced Process Scheduling）项目，当前仓库是一个前后端加 Python 求解器的单体仓库，目标是把工艺模板、批次计划、人员排班、资源约束和运行监控放到同一套系统里。

这份 README 以当前代码为准，不沿用旧版文档里的完成度百分比和历史架构描述。最近一次按代码核对：2026-06-03。

## 当前代码快照

- 主前端在 `frontend/`，技术栈是 React 18 + Ant Design + CRA + TypeScript 4.x。
- 主后端在 `backend/`，技术栈是 Express + TypeScript 5 + MySQL（`mysql2`）。
- 当前有效求解器是 `solver_v4/`，技术栈是 Flask + OR-Tools CP-SAT，默认端口 `5005`。
- 求解链路已收敛到 V4：前端调度面通过后端把求解请求转发到 Solver V4。
- 工艺模板主入口已是 **V3**（路由 `/process-templates`）；`/process-templates-v2`、`/process-templates-v3` 等旧入口已统一重定向退役（`ProcessTemplateLegacyRedirect`）。
- 资源建模保留模板/批次资源规则、资源节点管理与甘特支撑接口，平台中心类聚合页面已退役。

## 整体结构与端口

| 服务 | 技术栈 | 目录 | 端口 |
|---|---|---|---|
| 前端 | React 18 + AntD + CRA | `frontend/` | 3000 |
| 后端 API | Express + TypeScript + MySQL | `backend/` | 3001 |
| Solver V4 | Flask + OR-Tools CP-SAT | `solver_v4/` | 5005 |

连接方式：前端开发服务器把 `/api` 代理到 `backend:3001`（见 `frontend/src/setupProxy.js`）；后端通过 `SOLVER_V4_URL`（默认 `http://localhost:5005`）以 HTTP 调用求解器。浏览器不直接访问求解器。

## 真实模块范围

### 前端页面

当前主应用在 `frontend/src/App.tsx` 中注册路由，导航见 `frontend/src/components/Navigation/TopNavigation.tsx`：

- 调度中心：`/dashboard`（根路径 `/` 同样指向它）
- 基础数据
  - 资源节点管理：`/equipment-management`
  - 资质管理：`/qualifications`
  - 资质矩阵：`/qualification-matrix`
  - 操作管理：`/operations`
  - 操作类型：`/operation-types`
- 生产计划
  - 工艺模版（V3）：`/process-templates`、`/process-templates/:templateId`
  - 批次管理 V4：`/batch-management-v4`
  - 批次管理工作台 V2：`/batch-management-workbench-v2`
- 人员与排班
  - 组织与人员：`/organization-workbench`
  - 人员排班：`/personnel-scheduling`
  - 工厂人力韧性驾驶舱：`/roster/leadership-cockpit`
  - 异常排班快速修复：`/roster/exceptions`
  - V4 自动排班（Solver V4）：`/solver-v4`
  - 班次定义：`/shift-definitions`
- UI 组件库（设计系统展示）：`/ui-kit`
- 旧入口重定向：`/process-templates-v2`、`/process-templates-v3` → `ProcessTemplateLegacyRedirect`

### 后端 API 分组

`backend/src/server.ts` 全部路由挂载在 `/api/*`，健康检查为 `GET /api/health`。主要分组：

- 系统与看板：`/api/system`、`/api/dashboard`、`/api/calendar`
- 主数据：`/api/employees`、`/api/qualifications`、`/api/employee-qualifications`、`/api/qualification-matrix`、`/api/operations`、`/api/operation-types`、`/api/operation-qualifications`、`/api/operation-qualification-requirements`
- 资源：`/api/resource-nodes`、`/api/resources`、`/api/maintenance-windows`
- 工艺与批次：`/api/process-templates`、`/api/process-stages`、`/api/stage-operations`、`/api/mfg-template-packages`、`/api/v3/bioprocess`、`/api/batch-plans`、`/api/batch-workbench-v2`、`/api/standalone-tasks`
- 约束与资源规则：`/api/constraints`、`/api/batch-constraints`（挂在 `/api`）、`/api/template-stage-operations/:scheduleId/resources`、`/api/batch-operations/:operationPlanId/resources`
- 排班：`/api/v4/scheduling`、`/api/scheduling`、`/api/personnel-schedules`、`/api/personnel-schedules/v2`、`/api/shift-definitions`、`/api/unavailability`、`/api/share-groups`、`/api/roster-exceptions`、`/api/roster-leadership-cockpit`
- 组织：`/api/organization`、`/api/org-structure`
- 甘特：`/api/v4/gantt`、`/api/v5/gantt`

### Solver V4

`solver_v4/`（入口 `app.py`）当前提供：

- `GET /api/v4/health`
- `POST /api/v4/solve`
- `POST /api/v4/abort/:request_id`

约束按"可插拔模块 + 注册表"组织，位于 `solver_v4/constraints/`（`registry.py` 注册，每个约束一个文件）。目前已实现的约束包括：锁定操作 / 锁定班次、班次指派与覆盖、特殊班次联合覆盖、员工可用性、夜班 / 夜班休息 / 夜班间隔 / 禁止孤立夜班、共享组、标准工时、连续工作日上限 / 连续休息上限 / 工休模式、单岗位、单人唯一分配、带班覆盖、优先标准班、柔性排班、冻结区间。

目标函数位于 `solver_v4/objectives/`，包括：最小化工时、最小化偏差、最小化空缺、特殊班次相关（数量 / 缺口 / 影响）、最小化节假日三倍薪成本、夜班均衡、周末工作均衡。

完整清单以 `solver_v4/constraints/` 与 `solver_v4/objectives/` 目录为准。

## 关键链路与导航文档

V4 排班是贯穿三个服务的主链路，改动前建议端到端读一遍：

```
backend/src/services/schedulingV4/DataAssemblerV4.ts   # 从 DB 组装求解请求
  → backend/src/controllers/schedulingV4/              # 编排、生命周期、SSE 进度、apply/precheck
  → solver_v4/contracts/request.py                     # 请求契约
  → solver_v4/core/                                    # solver.py / context.py / callback.py / precheck.py
  → frontend/src/components/SolverV4/                  # 展示进度与结果
```

更系统的跨层阅读顺序见 `docs/ARCHITECTURE.md`；仓库级硬约束与前端设计系统规则见 `AGENTS.md`；面向 Claude Code 的工作指引见 `CLAUDE.md`。数据库与排班语义见 `docs/LLM_DB_GUIDELINES.md`、`docs/db-consistency-rules.md`、`docs/scheduling_principles.md`。

## 目录结构

```text
MFG8APS/
├── frontend/                  # 主 Web 前端（React 18 + CRA）
├── backend/                   # 主 API 服务（Express + TypeScript）
│   └── src/                   # routes → controllers → services → models / domain
├── solver_v4/                 # 当前有效求解器（Flask + OR-Tools）
│   ├── constraints/           # 可插拔约束模块 + registry
│   ├── objectives/            # 目标函数
│   ├── contracts/             # 请求契约
│   └── core/                  # 求解器核心
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
- macOS 下使用仓库自带启动脚本时，默认会检查 Homebrew 的 `mysql` 服务

## 环境变量

仓库里目前没有维护好的 `.env.sample`，下面是代码里实际读取的主要变量。

### 后端运行

- `DB_HOST`，默认 `localhost`
- `DB_PORT`，默认 `3306`
- `DB_USER`，默认 `root`
- `DB_PASSWORD`，默认空
- `DB_NAME`，默认 `aps_system`
- `DB_CHARSET`，默认 `utf8mb4_general_ci`
- `HOST`，默认 `0.0.0.0`
- `PORT`，默认 `3001`
- `SOLVER_V4_URL`，默认 `http://localhost:5005`
- `CORS_ALLOWED_ORIGINS`，逗号分隔白名单；未设置时允许所有来源
- `TIANAPI_KEY` / `TIAN_API_KEY`，节假日能力相关

### 资源规则功能开关

- `ENABLE_TEMPLATE_RESOURCE_RULES`
- `ENABLE_BATCH_RESOURCE_SNAPSHOTS`
- `ENABLE_RUNTIME_RESOURCE_SNAPSHOT_READ`

### 前端

- `REACT_APP_MONTH_TOLERANCE_HOURS`，默认 `8`

### 旧迁移脚本使用的变量

`backend/package.json` 里的 `migrate:metrics` / `migrate:personnel` / `migrate:special-shifts` 仍然读取 `MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`，和后端运行时使用的 `DB_*` 变量不是同一套命名（脚本里对二者做了 fallback 兼容）。

## 安装

```bash
# 1. 后端依赖
cd backend && npm install

# 2. 前端依赖
cd frontend && npm install

# 3. Solver V4 依赖
cd solver_v4
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 启动方式

### 推荐：一键启动当前主链路

```bash
./start_all.sh
```

脚本会自动清理被占用端口、检查并启动 Homebrew 的 MySQL 服务，然后依次拉起：

- 后端：`3001`
- Solver V4：`5005`（优先用 Gunicorn，2 workers / timeout 600s；无 Gunicorn 时回退 Flask 开发服务器）
- 前端：`3000`

> 注意：旧文档里提到的 `start_v4.sh` 已不存在，请使用 `start_all.sh`。

### 手动启动

后端：

```bash
cd backend
npm run dev          # ts-node-dev 热重载
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

默认端口：前端 `3000`、后端 `3001`、Solver V4 `5005`。

## 数据库迁移

当前仓库使用 `database/migrations/` 中的 SQL 文件做版本化迁移，但**没有统一迁移执行器**：新增 schema 变更需要按实际环境手工执行对应 SQL。

最近的迁移（节选，时间倒序）：

- `20260602_backfill_operation_type_team_assignments.sql`
- `20260524_expand_standalone_task_windows_to_datetime.sql`
- `20260524_add_standalone_task_allowed_employees.sql`
- `20260522_create_mfg_template_packages.sql`、`20260522_reset_ambiguous_standalone_recurrence_rules.sql`
- `20260508_phase0a_001_rbac_base.sql` ~ `20260508_phase0a_006_legacy_mapping_columns.sql`（RBAC 基础表、APS 场景、约束目录/冲突、配方与 campaign 快照、状态流转事件、legacy 映射列）
- `20260507_add_virtual_equipment_system_type.sql`

`backend/package.json` 里的 `migrate:metrics` / `migrate:personnel` / `migrate:special-shifts` 只覆盖较早的人力排班与特殊班次表，不代表当前全量 schema。

## 验证命令

仓库里实际可执行的主要校验命令：

```bash
# 后端（vitest）
cd backend && npm run build            # tsc 编译
cd backend && npm run test:ci          # CI-safe 子集，无需 DB
cd backend && npm test                 # 全量（watch；单次运行用 npx vitest run）
cd backend && npx vitest run src/tests/<file>.test.ts   # 跑单个测试文件
cd backend && npm run test:db          # DB 集成测试，需要可用的本地 MySQL

# 前端（CRA / jest）
cd frontend && CI=false npm run build  # 生产构建（CI=false 忽略 ESLint 告警）
cd frontend && npm run test:ci         # jest 单次运行

# 求解器（unittest，注意不是 pytest）
cd solver_v4 && python3 -m unittest tests.test_shift_assignment tests.test_share_group

# 全链路校验（后端构建 + 前端构建 + 求解器编译 + 求解器单测）
./scripts/verify_v4_archive.sh
```

## 当前本地校验快照

以下结论来自 2026-06-03 按当前代码实际执行的结果：

- `cd backend && npm run build`：通过
- `cd backend && npm run test:ci`：通过（3 个测试文件，17 个用例，约 2.1s）
- `cd frontend && CI=false npm run build`：通过（构建成功；bundle 体积偏大，默认 `CI=true` 下历史 ESLint 告警会使构建失败，故构建脚本使用 `CI=false`）
- `cd backend && npm run test:db`：本轮未执行，需按本地 MySQL 环境单独验证
- `cd frontend && npm run test:ci`、`./scripts/verify_v4_archive.sh`、求解器单测：本轮未单独执行

`batchLifecycleService.test.ts` 仍是独立的 DB 集成测试（`npm run test:db`），不在默认 CI-safe 集合中。

## 已知限制

- RBAC 目前处于"基础表 + 领域类型准备中"阶段（迁移 `20260508_phase0a_001_rbac_base.sql`、`backend/src/domain/governance/rbacTypes.ts`），后端运行面尚未接入完整的认证 / 授权 / RBAC 中间件。
- 前端默认构建（`CI=true`）仍会因历史 ESLint 告警失败，需用 `CI=false` 或继续收敛告警。
- 仓库根目录有 `backend/Dockerfile`、`frontend/Dockerfile`，但没有统一的部署编排文件（如 docker-compose）。
- 代码里仍保留多代实现并存（工艺模板 V1/V2/V3、排班 V2/V3/V4、甘特 V4/V5）；当前主链路是 V4，改动前请确认所改的是哪一代。
- README 只反映代码现状，不假设所有模块都已达到生产级稳定性。

## 相关文件

- 主前端入口：`frontend/src/App.tsx`，导航：`frontend/src/components/Navigation/TopNavigation.tsx`
- 后端入口：`backend/src/server.ts`
- Solver V4 入口：`solver_v4/app.py`
- 推荐启动脚本：`start_all.sh`
- 全链路校验脚本：`scripts/verify_v4_archive.sh`
- 架构导航：`docs/ARCHITECTURE.md`；硬约束与前端规则：`AGENTS.md`；Claude Code 指引：`CLAUDE.md`
