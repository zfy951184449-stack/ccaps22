# MVP Scope Cleanup Plan

## Goal

将当前仓库从“并行演进中的 APS 平台”收敛成一个可交付、可维护、上下文更干净的 MVP。

## Recommended MVP Product Slice

保留一条端到端主链路：

1. 主数据
2. 工艺模板
3. 批次创建与激活
4. V4 求解
5. 排班结果查看与基础运营

建议保留的前端入口：

- `Dashboard`
- `OrganizationWorkbenchPage`
- `QualificationsPage`
- `QualificationMatrixPage`
- `OperationsPage`
- `OperationTypesPage`
- `ProcessTemplatesPage`
- `ProcessTemplatesV2Page`
- `BatchManagementV4Page`
- `PersonnelSchedulingPage`
- `ShiftDefinitionsPage`
- `SolverV4Page`

建议保留的后端主路由：

- `/api/employees`
- `/api/qualifications`
- `/api/employee-qualifications`
- `/api/qualification-matrix`
- `/api/operations`
- `/api/operation-types`
- `/api/process-templates`
- `/api/process-stages`
- `/api/stage-operations`
- `/api/share-groups`
- `/api/batch-plans`
- `/api/calendar`
- `/api/shift-definitions`
- `/api/personnel-schedules`
- `/api/dashboard`
- `/api/v4/scheduling`

## First-Wave Cleanup Candidates

建议先下线而不是立即深删的内容：

- V2 排班页面与接口
- V3 排班页面与接口
- `ModularScheduling`
- `AutoSchedulingPage`
- `AutoSchedulingDebugPage`
- 旧 `BatchManagementPage`
- `SystemMonitorPage`
- `BusinessRulesCenterPage`
- `PlatformRunMonitorPage`
- `ProjectPlanningCenterPage`
- `PlatformOverviewPage`
- `ResourceCenterPage`
- `MaintenanceWindowsPage`
- `SpecialShiftWindowsPage`
- `TaskPoolPage`
- `ScheduleOverviewPage`
- `standalone-tasks`
- `independent-operations`
- `resource-nodes`
- `template-stage-operations`
- `batch-operations`
- `resources`
- `maintenance-windows`
- `platform`

## Cleanup Strategy

### Phase 1: Freeze MVP Contract

- 写清楚保留页面、保留 API、保留数据流
- 明确 V4 是唯一求解主链
- 明确哪些旧模块进入 retirement 状态

### Phase 2: Hide And Disconnect

- 先从 `frontend/src/App.tsx` 和导航入口移除非 MVP 页面
- 后端对非 MVP 路由改为不挂载或显式返回退役状态
- 不做大规模立即删除，先降低运行面

### Phase 3: Delete Dead Code

- 对已不再被引用的页面、组件、路由、controller、service 做逐批删除
- 每一批删除都要跑对应 CI
- 删除后更新 README 与 AGENTS 路由文档

### Phase 4: Archive And Simplify

- 将确需保留的历史实现移到 `archive/` 或单独 legacy 目录
- 删除失效 feature flag、调试路由、临时测试 API
- 收紧 CI 到 MVP 工作集

## Rules For This Cleanup

- 不在同一批次里混合“删旧功能”和“加新能力”
- 先断入口，再删实现
- 每次只处理一个 bounded slice
- 删除前必须确认没有被 V4 主链复用
- 任何影响 `shift_plan_id`、状态语义、locked 行为、V4 apply/persistence 的内容都不视为“无用代码”

## Immediate Next Decision

需要确认是否采用“V4-only MVP”作为收敛方向：

- 保留 V4、V2 editor、V4 batch management、基础主数据
- 下线 V2/V3 调度链、平台资源扩展中心、调试页、旧管理页

## Progress Log

### 2026-03-25: First MVP Reduction Wave

已完成：

- 前端导航仅保留 MVP 主入口：Dashboard、主数据、工艺模板 V2、批次管理 V4、人员管理、Solver V4、班次定义
- 前端旧页面入口改为重定向，而不是继续作为正式产品路径暴露
- 后端 `server.ts` 中未被引用的测试/临时 API 已移除：
  - `/api/test-calendar`
  - `/api/test-system-key`
  - `/api/test-metrics`
  - `/api/personnel-schedules/test-metrics`
  - `/api/personnel-schedules/metrics`
  - `/api/personnel-schedules/overview`

本轮刻意未做：

- 未下线 `/api/v2/scheduling`、`/api/v3/scheduling`、`/api/personnel-schedules/v2`
- 未删除 `resources`、`platform`、`maintenance-windows` 等业务路由

原因：

- `PersonnelSchedulingPage` 仍依赖 `/api/personnel-schedules/v2`
- `ProcessTemplatesV2Page` 仍使用 `/api/resources`
- 这些链路虽然不再是 MVP 的显式入口，但仍可能被保留页面复用，先断入口比直接深删更安全

下一批建议：

1. 画出“保留页面 -> 实际 API”依赖图
2. 对没有被保留页面引用的后端业务路由做第二波摘除
3. 再删除真正失联的前端页面、组件、controller、service

### 2026-03-25: Semantic Context Cleanup

已完成：

- 恢复并保留 V1 工艺模板入口，当前主应用同时保留：
  - `ProcessTemplatesPage`
  - `ProcessTemplatesV2Page`
- 删除了已不在主运行面、且无代码引用的旧后端文件：
  - `backend/src/routes/platform.ts`
  - `backend/src/controllers/platformController.ts`
  - `backend/src/routes/scheduleOverviewRoutes.ts`
  - `backend/src/controllers/scheduleOverviewController.ts`
- 为 schema 报告增加“结构快照而非运行面真相”的提示，并归档到 `docs/archive/database_schema_report_cn.md`
- 更新 `README.md` 与 `docs/README.md`，把当前入口和文档可信度说明写清楚
- 将生成型历史文档归档到 `docs/archive/`，降低默认 docs 路径的噪音：
  - `docs/archive/all_documents.md`
  - `docs/archive/database_api_dictionary.html`
  - `docs/archive/database_schema_report_cn.md`

本轮刻意未做：

- 不删除数据库现有数据
- 不删除数据库表
- 不执行 destructive migration
- 不处理仍被模板/批次资源规则复用的资源建模代码

原因：

- 当前最大的 context 污染源已从临时文件转成“历史文档和未挂载旧代码”
- 这批清理可以降低后续 agent 和人工 review 被旧平台/V2/V3 语义误导的概率

### 2026-03-25: Remaining Legacy Inventory

盘点范围：

- `backend/src/services/schedulingV2`
- `backend/src/services/schedulingV3`
- 资源建模与资源节点相关链路

结论：

- `schedulingV2` / `schedulingV3`
  - 当前活代码里未发现运行时引用
  - 对应目录在 `backend/src/services/` 下已经没有有效文件
  - 相关命中仅剩归档文档和执行计划历史记录
  - 归类：`safe-to-retire`

- 资源建模主链
  - 当前仍被活代码使用，不能按“历史残留”处理
  - 活跃 backend 依赖包括：
    - `resources.ts` / `resourcesController.ts`
    - `templateStageOperationResources.ts` / `templateStageOperationResourceController.ts`
    - `batchOperationResources.ts` / `batchOperationResourceController.ts`
    - `templateResourceRuleService.ts`
    - `batchResourceSnapshotService.ts`
    - `processTemplateWorkbookService.ts`
    - `resourceNodeService.ts`
    - `platformFeatureGuard.ts`
  - 活跃 frontend 依赖包括：
    - `services/processTemplateV2Api.ts`
    - `types/platform.ts`
    - `components/Platform/PlatformEditors.tsx`
    - `components/ProcessTemplateV2/TemplateResourceEditorTab.tsx`
    - `components/ProcessTemplateV2/TemplateResourcePlannerTab.tsx`
    - `components/ProcessTemplateV2/TemplateResourceNodeManagementTab.tsx`
  - 归类：`active dependency`

发现的契约漂移：

- frontend V2 资源节点管理仍请求 `/resource-nodes`
- `backend/src/routes/resourceNodes.ts` 和 `backend/src/controllers/resourceNodeController.ts` 仍存在
- 当时 `backend/src/server.ts` 未挂载 `/api/resource-nodes`
- 这意味着资源节点管理链路不是“可删除遗留”，而是“仍被前端使用但后端入口缺失”的不一致状态

建议的下一步：

1. 修复 `/api/resource-nodes` 契约漂移：
   - 恢复后端挂载，保持 V2 资源节点管理可用
2. 在资源节点链路修复前，不继续删除资源建模相关文件
3. 若继续做删除清理，仅对 `schedulingV2/V3` 的残余空目录和历史引用做最后收口

### 2026-03-25: Resource Node Contract Repair

已完成：

- 在 `backend/src/server.ts` 恢复挂载 `/api/resource-nodes`
- 保持 `frontend` 的 V2 资源节点管理 workspace 可继续访问已有 backend 路由/控制器/服务链
- 为 `GET /api/resource-nodes` 增加 backend CI-safe 路由测试，避免后续再次被静默摘掉

影响：

- 这次是契约修复，不是新功能扩张
- 不涉及数据库数据删除、表结构修改或 migration
- 资源节点链路应继续被视为当前 MVP 的活跃依赖

### 2026-03-25: Second MVP Reduction Wave

已完成：

- 根据保留页面的静态依赖，补齐 MVP 实际 API 依赖矩阵
- 后端卸载了与当前 MVP runtime 脱钩的路由：
  - `/api/platform`
  - `/api/schedule-overview`
  - `/api/standalone-tasks`
  - `/api/independent-operations`
  - `/api/maintenance-windows`
  - `/api/special-shift-windows`
  - `/api/resource-nodes`（后续盘点确认仍被 V2 资源节点管理依赖，已在后续批次恢复挂载）
- 前端删除了已经没有运行入口的旧页面：
  - 旧 `ProcessTemplatesPage`
  - 旧 `BatchManagementPage`
  - `TaskPoolPage`
  - `ScheduleOverviewPage`
  - `SpecialShiftWindowsPage`
  - `AutoSchedulingPage`
  - `ModularSchedulingPage`
  - `SchedulingV3Page`
  - `OperationConstraintsPage`
  - `SystemMonitorPage`
  - `SystemSettingsPage`
  - `AutoSchedulingDebugPage`
  - `PlatformOverviewPage`
  - `ResourceCenterPage`
  - `ProjectPlanningCenterPage`
  - `MaintenanceWindowsPage`
  - `BusinessRulesCenterPage`
  - `PlatformRunMonitorPage`
- 删除了只服务于旧批次管理和任务池页面的专属组件目录内容：
  - `components/TaskPool/*`
  - `components/BatchGanttAdapter/*`
  - `components/BatchManagement.tsx`
- 删除了不再属于 MVP 的测试：
  - `frontend/src/pages/PlatformOverviewPage.test.tsx`
  - `frontend/src/pages/ProjectPlanningCenterPage.test.tsx`
  - `backend/src/tests/platformRoutes.test.ts`
- `backend/package.json` 的 `test:ci` 已收窄到仍属于 MVP 的测试集

本轮刻意未做：

- 未移除 `components/ModularScheduling/*`
- 未移除 `components/AutoSchedulingWorkbench` 及其链路
- 未下线 `/api/v2/scheduling`、`/api/v3/scheduling`、`/api/scheduling`

原因：

- 这几条链路已经失去前端运行入口，但仍属于“历史求解实现”，更适合单独一批归档或整体删除
- 先完成运行面收缩和死页面清理，再处理求解器历史实现，风险更低

下一批建议：

1. 清理已无页面入口的历史求解前端实现：
   - `components/ModularScheduling/*`
   - `services/schedulingV2Api.ts`
   - `components/AutoSchedulingWorkbench` 相关链路
2. 评估并下线 `/api/v2/scheduling`、`/api/v3/scheduling`、`/api/scheduling-runs`
3. 最后再处理孤立的 backend route/controller/service 文件归档或删除

### 2026-03-25: Third MVP Reduction Wave

已完成：

- 删除历史求解前端实现：
  - `components/ModularScheduling/*`
  - `components/AutoSchedulingWorkbench.tsx`
  - `services/schedulingV2Api.ts`
- 删除 frontend 里未被引用的历史求解 API 封装：
  - `solverApi`
  - `schedulingRunApi`
- 删除 backend 里未再被主 runtime 使用的历史求解链路：
  - `/api/scheduling-runs`
  - `/api/v2/scheduling`
  - `/api/v3/scheduling`
  - 对应 `routes / controllers / services / tests / types`
- 移除 backend `/solver-api` 代理，因为前端已无调用方
- 收窄 `backend/package.json` 的 `test:ci` 到仍属于 MVP 的测试集

本轮刻意未做：

- 未移除 `/api/scheduling`

原因：

- 该路由当前承载 `shift-plans/:shiftPlanId/lock`，仍被 `PersonnelCalendar` 使用，不属于历史求解链路

下一批建议：

1. 清理 README / docs 中残留的旧 V2/V3 页面与接口描述
2. 评估 `database`、`unavailability`、`operation-resource-requirements` 是否仍属于 MVP
3. 如果确认不再需要，进一步归档或删除历史迁移与生成文档中的旧引用

### 2026-03-25: Fourth MVP Reduction Wave

硬约束：

- 不删除数据库现有数据
- 不删除现有业务表
- 不执行破坏性 migration
- 仅退役代码运行面和死代码

已完成：

- 审计灰区路由后确认：
  - 继续保留：`/api/unavailability`、`/api/resources`、`/api/template-stage-operations`、`/api/batch-operations`
  - 退役但保留数据：`/api/database`、`/api/operation-resource-requirements`
- backend 已从 `server.ts` 卸载：
  - `/api/database`
  - `/api/operation-resource-requirements`
- frontend 已删除无调用方的管理/平台服务封装：
  - `databaseApi`
  - `services/platformApi.ts`
- frontend 已删除无运行入口的孤儿平台组件：
  - `components/Platform/PlatformPanels.tsx`
  - `components/Platform/PlatformTimelineBoard.tsx`
  - `components/Platform/PlatformTimelineBoard.css`
- `components/Platform/PlatformEditors.tsx` 已裁剪为仅保留 `ProcessTemplatesV2` 仍在使用的 `ResourceFormModal`

数据保留说明：

- `database/backups/` 未做删除
- 相关数据库表和现有业务数据未做任何删除或清空
- 本轮只是停止暴露无用接口，不影响已落库历史数据

修正记录：

- 按最新要求恢复了 V1 工艺模板入口：
  - 恢复 `frontend/src/pages/ProcessTemplatesPage.tsx`
  - 恢复 `/process-templates` 前端路由
  - 恢复导航中的“工艺模版”入口
- 此恢复仅影响前端入口，不涉及数据库数据或表结构变更

下一批建议：

1. 继续清 README 和生成型文档里残留的旧平台/旧接口描述
2. 评估 `SystemSettingsService`、`database` 相关控制器/脚本是否还需要保留为离线工具
3. 若未来确认资源平台也要进一步收口，再做“保留表、归档接口”的单独方案

## Context Hygiene Checkpoint

目的：

- 降低 agent/search/review 被临时文件和编辑器垃圾文件污染的概率
- 不改变业务语义，不触碰数据库现有数据

执行：

- 更新 `.gitignore`，补充忽略：
  - `*.swp`
  - `*.swo`
  - `*~`
- 删除已确认存在的临时文件：
  - `.agent/rules/.README.md.swp`
  - `docs/exec-plans/active/.mvp-scope-cleanup.md.swp`
  - `docs/.DS_Store`

结果：

- 仓库根范围内已知的 swap / Finder 垃圾文件不再出现在工作区可见面
- `node_modules/` 内的垃圾文件仍可能存在，但因目录整体已被 `.gitignore` 忽略，不作为当前 context hygiene 的阻塞项

## Dependency Matrix Snapshot

### MVP 保留页面 -> 实际 API 依赖

- `Dashboard`
  - 当前未发现新增专属遗留 API 依赖；继续以现有 dashboard 数据链为主
- `OrganizationWorkbenchPage`
  - `/api/org-structure/tree`
  - `/api/org-structure/units`
  - `/api/employees`
  - `/api/employees/roles`
  - `/api/employees/:id/assignments`
- `QualificationsPage`
  - `/api/qualifications`
- `QualificationMatrixPage`
  - `/api/qualification-matrix`
  - `/api/qualification-matrix/statistics`
  - `/api/employee-qualifications`
- `OperationsPage`
  - `/api/operations`
  - `/api/operations/statistics`
  - `/api/operations/next-code`
  - `/api/operations/qualified-personnel`
  - `/api/operation-types`
  - `/api/organization/teams`
- `OperationTypesPage`
  - `/api/operation-types`
  - `/api/organization/teams`
- `ProcessTemplatesV2Page`
  - `/api/process-templates`
  - `/api/process-templates/:id/stages`
  - `/api/process-templates/stages/:id/operations`
  - `/api/organization/teams`
  - `/api/resources`
  - `OperationConstraintsPanel` 仍被 V2 编辑器复用，因此相关组件暂不删
- `BatchManagementV4Page`
  - `/api/batch-plans`
  - `/api/v5/gantt/*`
  - `/api/share-groups/*`
  - `/api/batch-operations/*`
  - `/api/batch-constraints/*`
  - `/api/operations`
  - `/api/batches/:id/available-operations`
  - `/api/batch-operation-plans/:id/constraints`
- `PersonnelSchedulingPage`
  - `/api/personnel-schedules/v2/filters`
  - `/api/personnel-schedules/v2/shift-styles`
  - `/api/personnel-schedules/v2/grid`
- `ShiftDefinitionsPage`
  - `/api/shift-definitions`
- `SolverV4Page`
  - `/api/v4/scheduling/*`
  - `/api/calendar/batch-operations`
  - `/api/calendar/operations/:id/recommended-personnel`
  - `/api/organization/solver-teams`
  - `/api/batch-plans`

### Route Classification After Matrix Review

明确保留：

- `/api/employees`
- `/api/qualifications`
- `/api/employee-qualifications`
- `/api/qualification-matrix`
- `/api/operations`
- `/api/operation-types`
- `/api/organization`
- `/api/org-structure`
- `/api/process-templates`
- `/api/process-stages`
- `/api/stage-operations`
- `/api/resource-nodes`
- `/api/resources`
- `/api/batch-plans`
- `/api/calendar`
- `/api/shift-definitions`
- `/api/personnel-schedules`
- `/api/personnel-schedules/v2`
- `/api/dashboard`
- `/api/share-groups`
- `/api/batch-constraints`
- `/api/batch-operations`
- `/api/v4/scheduling`
- `/api/v5/gantt`

本轮可下线：

- `/api/platform`
- `/api/schedule-overview`
- `/api/standalone-tasks`
- `/api/independent-operations`
- `/api/maintenance-windows`
- `/api/special-shift-windows`

本轮暂不下线：

- `/api/unavailability`
  - 仍被 `UnavailabilityTab` / `UnavailabilityModal` 使用
- `/api/operation-resource-requirements`
  - 尚未完成对 V2 编辑器链路的排除
- `/api/database`
  - 先保留，等待下一批后台治理确认是否仅为管理调试用途
