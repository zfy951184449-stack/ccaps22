# RBAC 端点 → 权限码映射（权威依据）

> 本文档是「全路由细粒度授权」的权威映射表：列出 `backend/src/server.ts` 挂载的**每一个业务端点** → 对应权限码（`permissionCode`）与分类（`kind`）。下一阶段（Phase 3）逐路由挂 `requirePermission(...)` 时，**以本表为准**。
>
> **生成口径**：遍历 `server.ts` 的全部 `app.use(...)` 与各 `backend/src/routes/*.ts`，按 63 条权威权限目录（`scripts/auth/run_auth_migrations.ts` 的 `PERMISSIONS`，action 收敛 READ/WRITE/APPROVE/OPERATE，6 域）映射。
>
> **命名规则**：读=对应 `_READ`；增删改=`_WRITE`；高敏（锁定/激活停用/批量自动分配/导入/同步/中止/应用结果/批量清空/批量生成/库切换）=`_OPERATE`（治理提权用 `_APPROVE`）。
>
> **特别裁定**：
> - PD-5：`operation-qualifications` 与 `operation-qualification-requirements` 归 `MASTER_OPERATION_*`（**不**归 QUALIFICATION）。
> - PD-1：批次激活双入口（`POST /api/calendar/batch/:id/activate` 与 `POST /api/batch-plans/:id/activate`）统一归 `APS_BATCH_ACTIVATE`。
>
> **kind 取值**：
> - `READ` 读端点（不挂 scope，跨团队只读）
> - `WRITE` 写端点（挂 `requireScope`，仅对有 team 归属的资源限定）
> - `SENSITIVE` 高敏写/动作端点（OPERATE/APPROVE；通常也属写，按需挂 scope）
> - `SERVICE` 机器对机器（`requireServiceAuth`，**不挂** `requirePermission`）
> - `PUBLIC` 公开端点（不挂任何鉴权）
>
> **不在本表内**：`routes/specialShiftWindows.ts` 存在但 **未在 server.ts 挂载**（无 `app.use`），非活动端点，故不映射。`routes/calendar.ts` 与各 router 内部的 `router.use('*', ...)` 调试 404 兜底不是业务端点，亦不映射。

---

## 公开 / 机器端点（不挂 requirePermission）

| METHOD | 路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/api/health` | `PUBLIC` | PUBLIC |
| POST | `/api/auth/login` | `PUBLIC` | PUBLIC |
| POST | `/api/auth/logout` | `PUBLIC` | PUBLIC |
| GET | `/api/auth/me` | `PUBLIC` | PUBLIC |
| POST | `/api/auth/change-password` | `PUBLIC` | PUBLIC |
| POST | `/api/v4/scheduling/callback/progress` | `SERVICE` | SERVICE |
| POST | `/api/v4/scheduling/callback/result` | `SERVICE` | SERVICE |
| GET | `/api/v4/scheduling/runs/:runId/status` | `SERVICE` | SERVICE |

> 说明：`/api/auth/*` 由 `routes/auth.ts` 自行处理认证（login/logout 公开；me/change-password 内部挂 `requireAuth`），**不挂 requirePermission**，故标 PUBLIC。`/callback/*` 与 `runs/:runId/status` 由 `requireServiceAuth` 保护，标 SERVICE。

---

## routes/system.ts → `/api/system`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/holiday/status` | `SYSTEM_SETTING_READ` | READ |
| PATCH | `/holiday/key` | `SYSTEM_SETTING_WRITE` | WRITE |
| POST | `/holiday/import` | `SYSTEM_HOLIDAY_OPERATE` | SENSITIVE |
| GET | `/scheduling/settings` | `SYSTEM_SETTING_READ` | READ |
| PUT | `/scheduling/settings` | `SYSTEM_SETTING_WRITE` | WRITE |
| GET | `/db-config` | `SYSTEM_DB_READ` | READ |
| POST | `/db-config` | `SYSTEM_DB_SWITCH` | SENSITIVE |
| POST | `/sync-db` | `SYSTEM_DB_SYNC` | SENSITIVE |

## routes/employees.ts → `/api/employees`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/roles` | `MASTER_EMPLOYEE_READ` | READ |
| GET | `/` | `MASTER_EMPLOYEE_READ` | READ |
| POST | `/` | `MASTER_EMPLOYEE_WRITE` | WRITE |
| PUT | `/:id` | `MASTER_EMPLOYEE_WRITE` | WRITE |
| DELETE | `/:id` | `MASTER_EMPLOYEE_WRITE` | WRITE |
| PUT | `/:id/workload-profile` | `MASTER_EMPLOYEE_WRITE` | WRITE |
| PUT | `/:id/organization` | `MASTER_EMPLOYEE_WRITE` | WRITE |
| GET | `/:id/reporting` | `MASTER_EMPLOYEE_READ` | READ |
| PUT | `/:id/reporting` | `MASTER_EMPLOYEE_WRITE` | WRITE |
| GET | `/:id/organization-context` | `MASTER_EMPLOYEE_READ` | READ |
| GET | `/:id/assignments` | `MASTER_EMPLOYEE_READ` | READ |
| POST | `/:id/assignments` | `MASTER_EMPLOYEE_WRITE` | WRITE |
| PUT | `/:id/assignments/:assignmentId` | `MASTER_EMPLOYEE_WRITE` | WRITE |
| DELETE | `/:id/assignments/:assignmentId` | `MASTER_EMPLOYEE_WRITE` | WRITE |

## routes/qualifications.ts → `/api/qualifications`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/overview` | `MASTER_QUALIFICATION_READ` | READ |
| GET | `/matrix` | `MASTER_QUALIFICATION_READ` | READ |
| GET | `/shortages` | `MASTER_QUALIFICATION_READ` | READ |
| GET | `/shortages/monitoring` | `MASTER_QUALIFICATION_READ` | READ |
| GET | `/:id/impact` | `MASTER_QUALIFICATION_READ` | READ |
| GET | `/` | `MASTER_QUALIFICATION_READ` | READ |
| POST | `/` | `MASTER_QUALIFICATION_WRITE` | WRITE |
| PUT | `/:id` | `MASTER_QUALIFICATION_WRITE` | WRITE |
| DELETE | `/:id` | `MASTER_QUALIFICATION_WRITE` | WRITE |

## routes/employeeQualifications.ts → `/api/employee-qualifications`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `MASTER_QUALIFICATION_READ` | READ |
| GET | `/employee/:employeeId` | `MASTER_QUALIFICATION_READ` | READ |
| POST | `/` | `MASTER_QUALIFICATION_WRITE` | WRITE |
| PUT | `/:id` | `MASTER_QUALIFICATION_WRITE` | WRITE |
| DELETE | `/:id` | `MASTER_QUALIFICATION_WRITE` | WRITE |

## routes/qualificationMatrix.ts → `/api/qualification-matrix`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `MASTER_QUALIFICATION_READ` | READ |
| GET | `/statistics` | `MASTER_QUALIFICATION_READ` | READ |

## routes/operations.ts → `/api/operations`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/statistics` | `MASTER_OPERATION_READ` | READ |
| GET | `/next-code` | `MASTER_OPERATION_READ` | READ |
| GET | `/qualified-personnel` | `MASTER_OPERATION_READ` | READ |
| GET | `/` | `MASTER_OPERATION_READ` | READ |
| GET | `/:id` | `MASTER_OPERATION_READ` | READ |
| POST | `/` | `MASTER_OPERATION_WRITE` | WRITE |
| PUT | `/:id` | `MASTER_OPERATION_WRITE` | WRITE |
| DELETE | `/:id` | `MASTER_OPERATION_WRITE` | WRITE |

## routes/operationQualifications.ts → `/api/operation-qualifications`  (PD-5: 归 MASTER_OPERATION_*)

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/available` | `MASTER_OPERATION_READ` | READ |
| GET | `/:operationId` | `MASTER_OPERATION_READ` | READ |
| PUT | `/:operationId/position/:positionNumber` | `MASTER_OPERATION_WRITE` | WRITE |
| POST | `/:operationId/position/:positionNumber` | `MASTER_OPERATION_WRITE` | WRITE |
| POST | `/:operationId/copy-position` | `MASTER_OPERATION_WRITE` | WRITE |
| DELETE | `/requirement/:requirementId` | `MASTER_OPERATION_WRITE` | WRITE |

## routes/operationQualificationRequirements.ts → `/api/operation-qualification-requirements`  (PD-5)

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `MASTER_OPERATION_READ` | READ |

## routes/processTemplates.ts → `/api/process-templates`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `APS_TEMPLATE_READ` | READ |
| GET | `/export-data` | `APS_TEMPLATE_READ` | READ |
| POST | `/workbook/preview` | `APS_TEMPLATE_IMPORT` | SENSITIVE |
| POST | `/workbook/import` | `APS_TEMPLATE_IMPORT` | SENSITIVE |
| GET | `/:id/workbook/export` | `APS_TEMPLATE_READ` | READ |
| GET | `/:id/report-data` | `APS_TEMPLATE_READ` | READ |
| GET | `/:id` | `APS_TEMPLATE_READ` | READ |
| POST | `/` | `APS_TEMPLATE_WRITE` | WRITE |
| PUT | `/:id` | `APS_TEMPLATE_WRITE` | WRITE |
| PUT | `/:id/recalculate` | `APS_TEMPLATE_WRITE` | WRITE |
| DELETE | `/:id` | `APS_TEMPLATE_WRITE` | WRITE |
| POST | `/:id/copy` | `APS_TEMPLATE_WRITE` | WRITE |
| POST | `/:id/auto-schedule` | `APS_TEMPLATE_AUTOSCHEDULE` | SENSITIVE |
| GET | `/:id/personnel-curve` | `APS_TEMPLATE_READ` | READ |
| GET | `/:id/resource-planner` | `APS_TEMPLATE_READ` | READ |
| GET | `/:id/resource-editor` | `APS_TEMPLATE_READ` | READ |
| POST | `/:id/editor-validate` | `APS_TEMPLATE_WRITE` | WRITE |
| POST | `/:id/stage-operations/from-canvas` | `APS_TEMPLATE_WRITE` | WRITE |

## routes/processStages.ts → `/api/process-stages`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/template/:templateId` | `APS_TEMPLATE_READ` | READ |
| POST | `/template/:templateId` | `APS_TEMPLATE_WRITE` | WRITE |
| PUT | `/:stageId` | `APS_TEMPLATE_WRITE` | WRITE |
| DELETE | `/:stageId` | `APS_TEMPLATE_WRITE` | WRITE |
| PUT | `/template/:templateId/reorder` | `APS_TEMPLATE_WRITE` | WRITE |
| PUT | `/template/:templateId/schedule` | `APS_TEMPLATE_WRITE` | WRITE |

## routes/stageOperations.ts → `/api/stage-operations`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/available` | `APS_TEMPLATE_READ` | READ |
| GET | `/stage/:stageId` | `APS_TEMPLATE_READ` | READ |
| POST | `/stage/:stageId` | `APS_TEMPLATE_WRITE` | WRITE |
| POST | `/stage/:stageId/batch` | `APS_TEMPLATE_WRITE` | WRITE |
| PUT | `/:scheduleId` | `APS_TEMPLATE_WRITE` | WRITE |
| POST | `/:scheduleId/move-stage` | `APS_TEMPLATE_WRITE` | WRITE |
| DELETE | `/:scheduleId` | `APS_TEMPLATE_WRITE` | WRITE |
| PUT | `/stage/:stageId/reorder` | `APS_TEMPLATE_WRITE` | WRITE |

## routes/personnelSchedules.ts → `/api/personnel-schedules`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `ROSTER_SCHEDULE_READ` | READ |
| GET | `/available-employees` | `ROSTER_SCHEDULE_READ` | READ |
| GET | `/overview` | `ROSTER_SCHEDULE_READ` | READ |
| GET | `/shift-plans` | `ROSTER_SCHEDULE_READ` | READ |
| GET | `/metrics` | `ROSTER_SCHEDULE_READ` | READ |
| GET | `/:id(\d+)` | `ROSTER_SCHEDULE_READ` | READ |
| POST | `/` | `ROSTER_SCHEDULE_WRITE` | WRITE |
| PUT | `/:id` | `ROSTER_SCHEDULE_WRITE` | WRITE |
| DELETE | `/monthly` | `ROSTER_SCHEDULE_OPERATE` | SENSITIVE |
| DELETE | `/:id` | `ROSTER_SCHEDULE_WRITE` | WRITE |

> 注：`DELETE /monthly` 是“按月批量清空排班”，属高敏 → `ROSTER_SCHEDULE_OPERATE`（与目录定义“排班高敏操作(按月清空/班次锁定解锁)”一致）。

## routes/batchPlanning.ts → `/api/batch-plans`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/statistics` | `APS_BATCH_READ` | READ |
| GET | `/templates` | `APS_BATCH_READ` | READ |
| GET | `/templates/:templateId/day0-offset` | `APS_BATCH_READ` | READ |
| POST | `/bulk` | `APS_BATCH_WRITE` | WRITE |
| POST | `/from-package` | `APS_BATCH_WRITE` | WRITE |
| POST | `/from-package/bulk` | `APS_BATCH_WRITE` | WRITE |
| GET | `/` | `APS_BATCH_READ` | READ |
| GET | `/:id` | `APS_BATCH_READ` | READ |
| GET | `/:id/operations-tree` | `APS_BATCH_READ` | READ |
| POST | `/` | `APS_BATCH_WRITE` | WRITE |
| PUT | `/:id` | `APS_BATCH_WRITE` | WRITE |
| DELETE | `/:id` | `APS_BATCH_WRITE` | WRITE |
| POST | `/:id/activate` | `APS_BATCH_ACTIVATE` | SENSITIVE |
| POST | `/:id/deactivate` | `APS_BATCH_ACTIVATE` | SENSITIVE |

> PD-1：`/:id/activate` 与 `/:id/deactivate` 统一归 `APS_BATCH_ACTIVATE`。

## routes/mfgTemplatePackages.ts → `/api/mfg-template-packages`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `APS_MFG_PACKAGE_READ` | READ |
| POST | `/` | `APS_MFG_PACKAGE_WRITE` | WRITE |
| GET | `/:id` | `APS_MFG_PACKAGE_READ` | READ |
| PUT | `/:id` | `APS_MFG_PACKAGE_WRITE` | WRITE |
| DELETE | `/:id` | `APS_MFG_PACKAGE_WRITE` | WRITE |
| GET | `/:id/preview` | `APS_MFG_PACKAGE_READ` | READ |

## routes/batchWorkbenchV2.ts → `/api/batch-workbench-v2`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/context` | `APS_BATCH_READ` | READ |

## routes/calendar.ts → `/api/calendar`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/operations/day` | `APS_CALENDAR_READ` | READ |
| GET | `/operations/week` | `APS_CALENDAR_READ` | READ |
| GET | `/operations/month` | `APS_CALENDAR_READ` | READ |
| GET | `/operations/active` | `APS_CALENDAR_READ` | READ |
| GET | `/workdays` | `APS_CALENDAR_READ` | READ |
| POST | `/batch-operations` | `APS_CALENDAR_READ` | READ |
| GET | `/operations/:operationId` | `APS_CALENDAR_READ` | READ |
| PUT | `/operations/:operationId/schedule` | `APS_CALENDAR_WRITE` | WRITE |
| GET | `/operations/:operationId/recommended-personnel` | `APS_CALENDAR_READ` | READ |
| GET | `/operations/:operationId/available-employees` | `APS_CALENDAR_READ` | READ |
| POST | `/operations/:operationId/assign` | `APS_CALENDAR_WRITE` | WRITE |
| POST | `/operations/:operationId/assign-position` | `APS_CALENDAR_WRITE` | WRITE |
| POST | `/operations/:operationId/lock` | `APS_CALENDAR_OPERATE` | SENSITIVE |
| DELETE | `/operations/:operationId/lock` | `APS_CALENDAR_OPERATE` | SENSITIVE |
| POST | `/batch/:batchId/auto-assign` | `APS_CALENDAR_OPERATE` | SENSITIVE |
| POST | `/batch/:batchId/activate` | `APS_BATCH_ACTIVATE` | SENSITIVE |
| POST | `/batch/:batchId/deactivate` | `APS_BATCH_ACTIVATE` | SENSITIVE |
| GET | `/test` | `APS_CALENDAR_READ` | READ |
| GET | `/holidays/cache/stats` | `APS_CALENDAR_READ` | READ |
| POST | `/holidays/cache/cleanup` | `APS_CALENDAR_HOLIDAY_OPERATE` | SENSITIVE |
| POST | `/holidays/preload` | `APS_CALENDAR_HOLIDAY_OPERATE` | SENSITIVE |
| POST | `/holidays/import` | `APS_CALENDAR_HOLIDAY_OPERATE` | SENSITIVE |

> 注：`POST /batch/:batchId/activate` 与 `/deactivate` 是 PD-1 的日历侧批次激活入口 → `APS_BATCH_ACTIVATE`（与 batch-plans 侧统一）。`GET /test` 是占位探活，归读权限即可（不公开，落在 `/api/calendar` 鉴权域内）。日历节假日维护（cache cleanup/preload/import）归 `APS_CALENDAR_HOLIDAY_OPERATE`（与系统级 `SYSTEM_HOLIDAY_OPERATE` 区分：前者是“日历视图下的节假日数据”，后者是“系统设置里的节假日服务”）。

## routes/constraintRoutes.ts → `/api/constraints`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/template/:templateId` | `APS_CONSTRAINT_READ` | READ |
| GET | `/template/:templateId/gantt` | `APS_CONSTRAINT_READ` | READ |
| GET | `/batch/:batchPlanId/gantt` | `APS_CONSTRAINT_READ` | READ |
| GET | `/batches/gantt` | `APS_CONSTRAINT_READ` | READ |
| GET | `/template/:templateId/validate` | `APS_CONSTRAINT_READ` | READ |
| GET | `/template/:templateId/available-operations` | `APS_CONSTRAINT_READ` | READ |
| GET | `/operation/:scheduleId` | `APS_CONSTRAINT_READ` | READ |
| POST | `/` | `APS_CONSTRAINT_WRITE` | WRITE |
| PUT | `/:id` | `APS_CONSTRAINT_WRITE` | WRITE |
| DELETE | `/:id` | `APS_CONSTRAINT_WRITE` | WRITE |

## routes/shareGroupRoutes.ts → `/api/share-groups`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/template/:templateId` | `APS_CONSTRAINT_READ` | READ |
| GET | `/template/:templateId/gantt` | `APS_CONSTRAINT_READ` | READ |
| GET | `/batches/gantt` | `APS_CONSTRAINT_READ` | READ |
| GET | `/batch/:batchPlanId` | `APS_CONSTRAINT_READ` | READ |
| GET | `/operation/:scheduleId` | `APS_CONSTRAINT_READ` | READ |
| GET | `/batch-operation/:operationPlanId` | `APS_CONSTRAINT_READ` | READ |
| GET | `/:id` | `APS_CONSTRAINT_READ` | READ |
| POST | `/template/:templateId` | `APS_CONSTRAINT_WRITE` | WRITE |
| POST | `/assign` | `APS_CONSTRAINT_WRITE` | WRITE |
| POST | `/:groupId/operations` | `APS_CONSTRAINT_WRITE` | WRITE |
| POST | `/batch-operations/merge` | `APS_CONSTRAINT_WRITE` | WRITE |
| POST | `/batch-operations/bulk` | `APS_CONSTRAINT_WRITE` | WRITE |
| PUT | `/:id` | `APS_CONSTRAINT_WRITE` | WRITE |
| DELETE | `/operation/:scheduleId/group/:groupId` | `APS_CONSTRAINT_WRITE` | WRITE |
| DELETE | `/:groupId/operations/:operationPlanId` | `APS_CONSTRAINT_WRITE` | WRITE |
| DELETE | `/:id` | `APS_CONSTRAINT_WRITE` | WRITE |

> 注：共享组（share-group）属“排产约束”资源域 → `APS_CONSTRAINT_*`（目录定义 SCHEDULING_CONSTRAINT 含“时序/共享组”）。

## routes/organization.ts → `/api/organization`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/departments` | `MASTER_ORG_READ` | READ |
| POST | `/departments` | `MASTER_ORG_WRITE` | WRITE |
| PUT | `/departments/:id` | `MASTER_ORG_WRITE` | WRITE |
| DELETE | `/departments/:id` | `MASTER_ORG_WRITE` | WRITE |
| GET | `/teams` | `MASTER_ORG_READ` | READ |
| GET | `/solver-teams` | `MASTER_ORG_READ` | READ |
| POST | `/teams` | `MASTER_ORG_WRITE` | WRITE |
| PUT | `/teams/:id` | `MASTER_ORG_WRITE` | WRITE |
| DELETE | `/teams/:id` | `MASTER_ORG_WRITE` | WRITE |
| GET | `/roles` | `MASTER_ORG_READ` | READ |
| POST | `/roles` | `MASTER_ORG_WRITE` | WRITE |
| PUT | `/roles/:id` | `MASTER_ORG_WRITE` | WRITE |
| DELETE | `/roles/:id` | `MASTER_ORG_WRITE` | WRITE |
| GET | `/assignments` | `MASTER_ORG_READ` | READ |
| POST | `/assignments` | `MASTER_ORG_WRITE` | WRITE |
| PUT | `/assignments/:id` | `MASTER_ORG_WRITE` | WRITE |
| DELETE | `/assignments/:id` | `MASTER_ORG_WRITE` | WRITE |
| GET | `/unavailability` | `ROSTER_UNAVAILABILITY_READ` | READ |
| POST | `/unavailability` | `ROSTER_UNAVAILABILITY_WRITE` | WRITE |
| PUT | `/unavailability/:id` | `ROSTER_UNAVAILABILITY_WRITE` | WRITE |
| DELETE | `/unavailability/:id` | `ROSTER_UNAVAILABILITY_WRITE` | WRITE |

> 注：`/organization` 多数是组织架构主数据（部门/班组/员工角色/任职）→ `MASTER_ORG_*`（目录 ORGANIZATION 含“部门/班组/角色/任职/不可用”）。但 `/unavailability` 在语义上是“员工不可用/请假登记”，归 `ROSTER_UNAVAILABILITY_*`（与 `/api/unavailability` 同域，避免同一资源跨权限码）。

## routes/organizationHierarchy.ts → `/api/org-structure`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/tree` | `MASTER_ORG_READ` | READ |
| POST | `/units` | `MASTER_ORG_WRITE` | WRITE |
| PUT | `/units/:id` | `MASTER_ORG_WRITE` | WRITE |
| DELETE | `/units/:id` | `MASTER_ORG_WRITE` | WRITE |

## routes/shiftDefinitions.ts → `/api/shift-definitions`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `MASTER_SHIFT_DEF_READ` | READ |
| GET | `/:id` | `MASTER_SHIFT_DEF_READ` | READ |
| POST | `/` | `MASTER_SHIFT_DEF_WRITE` | WRITE |
| PUT | `/:id` | `MASTER_SHIFT_DEF_WRITE` | WRITE |
| DELETE | `/:id` | `MASTER_SHIFT_DEF_WRITE` | WRITE |

## routes/schedulingV4.ts → `/api/v4/scheduling`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/runs` | `SOLVER_RUN_READ` | READ |
| POST | `/solve` | `SOLVER_RUN_EXECUTE` | SENSITIVE |
| GET | `/runs/:runId/progress` | `SOLVER_RUN_READ` | READ |
| POST | `/callback/progress` | `SERVICE` | SERVICE |
| POST | `/callback/result` | `SERVICE` | SERVICE |
| GET | `/runs/:runId/result` | `SOLVER_RUN_READ` | READ |
| POST | `/runs/:runId/stop` | `SOLVER_RUN_ABORT` | SENSITIVE |
| GET | `/runs/:runId/status` | `SERVICE` | SERVICE |
| POST | `/runs/:runId/apply` | `SOLVER_RESULT_APPLY` | SENSITIVE |
| POST | `/precheck` | `SOLVER_RUN_READ` | READ |
| POST | `/preview-proposal` | `SOLVER_RUN_READ` | READ |

> 注：`/callback/progress`、`/callback/result`、`/runs/:runId/status` 走 `requireServiceAuth`，**不挂 requirePermission**（标 SERVICE）。`/precheck`、`/preview-proposal` 虽为 POST，但语义是“只读预检/预览、不落库” → `SOLVER_RUN_READ`（目录 SOLVER_RUN_READ 明确含“预检/预览”）。

## routes/scheduling.ts → `/api/scheduling`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| POST | `/shift-plans/:shiftPlanId/lock` | `ROSTER_SCHEDULE_OPERATE` | SENSITIVE |
| DELETE | `/shift-plans/:shiftPlanId/lock` | `ROSTER_SCHEDULE_OPERATE` | SENSITIVE |

> 注：班次计划锁定/解锁属“排班高敏操作” → `ROSTER_SCHEDULE_OPERATE`（目录定义含“班次锁定解锁”）。

## routes/dashboard.ts → `/api/dashboard`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/manpower-curve` | `SYSTEM_DASHBOARD_READ` | READ |
| GET | `/work-hours-curve` | `SYSTEM_DASHBOARD_READ` | READ |
| GET | `/daily-assignments` | `SYSTEM_DASHBOARD_READ` | READ |
| GET | `/shifts` | `SYSTEM_DASHBOARD_READ` | READ |

## routes/operationTypes.ts → `/api/operation-types`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `MASTER_OPERATION_READ` | READ |
| GET | `/grouped` | `MASTER_OPERATION_READ` | READ |
| GET | `/:id` | `MASTER_OPERATION_READ` | READ |
| POST | `/` | `MASTER_OPERATION_WRITE` | WRITE |
| PUT | `/:id` | `MASTER_OPERATION_WRITE` | WRITE |
| DELETE | `/:id` | `MASTER_OPERATION_WRITE` | WRITE |

> 注：操作类型（operation_type）属“操作主数据”资源域 → `MASTER_OPERATION_*`（目录 OPERATION 含“操作/操作类型/操作资质要求”）。

## routes/batchConstraints.ts → 挂在 `/api`（bare mount，子路径自带前缀）

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/batch-operation-plans/:operationPlanId/constraints` | `APS_CONSTRAINT_READ` | READ |
| GET | `/batches/:batchPlanId/available-operations` | `APS_CONSTRAINT_READ` | READ |
| GET | `/batch-operations/search` | `APS_CONSTRAINT_READ` | READ |
| GET | `/batch-operations/hierarchy` | `APS_CONSTRAINT_READ` | READ |
| POST | `/batch-constraints` | `APS_CONSTRAINT_WRITE` | WRITE |
| PUT | `/batch-constraints/:id` | `APS_CONSTRAINT_WRITE` | WRITE |
| DELETE | `/batch-constraints/:id` | `APS_CONSTRAINT_WRITE` | WRITE |
| GET | `/batches/:batchPlanId/validate` | `APS_CONSTRAINT_READ` | READ |

> 注：本 router 在 server.ts 以 `app.use('/api', batchConstraintsRoutes)` 裸挂，故子路径即完整 `/api/...` 路径。

## routes/personnelSchedulesV2.ts → `/api/personnel-schedules/v2`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/filters` | `ROSTER_SCHEDULE_READ` | READ |
| GET | `/shift-styles` | `ROSTER_SCHEDULE_READ` | READ |
| GET | `/grid` | `ROSTER_SCHEDULE_READ` | READ |

## routes/unavailability.ts → `/api/unavailability`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `ROSTER_UNAVAILABILITY_READ` | READ |
| POST | `/` | `ROSTER_UNAVAILABILITY_WRITE` | WRITE |
| PUT | `/:id` | `ROSTER_UNAVAILABILITY_WRITE` | WRITE |
| DELETE | `/:id` | `ROSTER_UNAVAILABILITY_WRITE` | WRITE |

## routes/resourceNodes.ts → `/api/resource-nodes`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `MASTER_RESOURCE_READ` | READ |
| POST | `/` | `MASTER_RESOURCE_WRITE` | WRITE |
| POST | `/rebuild/clear` | `MASTER_RESOURCE_OPERATE` | SENSITIVE |
| GET | `/:id/cleanable-targets` | `MASTER_RESOURCE_READ` | READ |
| PUT | `/:id/cleanable-targets` | `MASTER_RESOURCE_WRITE` | WRITE |
| PATCH | `/:id` | `MASTER_RESOURCE_WRITE` | WRITE |
| POST | `/:id/move` | `MASTER_RESOURCE_WRITE` | WRITE |
| DELETE | `/:id` | `MASTER_RESOURCE_WRITE` | WRITE |

> 注：`POST /rebuild/clear` 是“资源树清空/重建” → `MASTER_RESOURCE_OPERATE`（目录定义“资源树重建/清空”）。

## routes/resources.ts → `/api/resources`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `MASTER_RESOURCE_READ` | READ |
| POST | `/` | `MASTER_RESOURCE_WRITE` | WRITE |
| GET | `/:id` | `MASTER_RESOURCE_READ` | READ |
| PATCH | `/:id` | `MASTER_RESOURCE_WRITE` | WRITE |
| GET | `/:id/calendar` | `MASTER_RESOURCE_READ` | READ |
| POST | `/:id/calendar` | `MASTER_RESOURCE_WRITE` | WRITE |
| PATCH | `/:id/calendar/:eventId` | `MASTER_RESOURCE_WRITE` | WRITE |
| DELETE | `/:id/calendar/:eventId` | `MASTER_RESOURCE_WRITE` | WRITE |

## routes/maintenanceWindows.ts → `/api/maintenance-windows`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `MASTER_RESOURCE_READ` | READ |
| POST | `/` | `MASTER_RESOURCE_WRITE` | WRITE |
| PATCH | `/:id` | `MASTER_RESOURCE_WRITE` | WRITE |
| DELETE | `/:id` | `MASTER_RESOURCE_WRITE` | WRITE |

> 注：维保窗口（maintenance window）属“资源/设备”资源域 → `MASTER_RESOURCE_*`（目录 RESOURCE 含“资源树/资源/维保窗口”）。

## routes/templateStageOperationResources.ts → `/api/template-stage-operations`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/template/:templateId/bindings` | `APS_TEMPLATE_READ` | READ |
| GET | `/:scheduleId/resources` | `APS_TEMPLATE_READ` | READ |
| PUT | `/:scheduleId/resources` | `APS_TEMPLATE_WRITE` | WRITE |
| DELETE | `/:scheduleId/resources` | `APS_TEMPLATE_WRITE` | WRITE |
| GET | `/:scheduleId/resource-binding` | `APS_TEMPLATE_READ` | READ |
| PUT | `/:scheduleId/resource-binding` | `APS_TEMPLATE_WRITE` | WRITE |
| PUT | `/batch-binding` | `APS_TEMPLATE_WRITE` | WRITE |

> 注：模板阶段操作的资源绑定属“工艺模板”写范畴 → `APS_TEMPLATE_*`（目录 APS_TEMPLATE_WRITE 含“模板/阶段/操作/资源绑定”）。

## routes/batchOperationResources.ts → `/api/batch-operations`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/:operationPlanId/resources` | `APS_BATCH_READ` | READ |
| PUT | `/:operationPlanId/resources` | `APS_BATCH_WRITE` | WRITE |

> 注：批次操作资源属“批次计划”范畴 → `APS_BATCH_*`（目录 APS_BATCH_WRITE 含“批次操作资源”）。

## routes/v3Bioprocess.ts → `/api/v3/bioprocess`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/templates` | `MASTER_RECIPE_READ` | READ |
| GET | `/templates/:templateId` | `MASTER_RECIPE_READ` | READ |
| GET | `/master-data/sync-status` | `MASTER_RECIPE_READ` | READ |
| POST | `/master-data/sync` | `MASTER_RECIPE_SYNC` | SENSITIVE |
| POST | `/projections/preview` | `MASTER_RECIPE_READ` | READ |

> 注：V3 生物工艺=配方版本/主数据同步 → `MASTER_RECIPE_*`（目录 RECIPE_VERSION 含“配方版本/主数据同步(V3生物工艺)”）。`POST /master-data/sync` 是“遗留主数据→V3落库”高敏 → `MASTER_RECIPE_SYNC`。`POST /projections/preview` 只读预览 → `MASTER_RECIPE_READ`。

## routes/standaloneTaskRoutes.ts → `/api/standalone-tasks`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `ROSTER_TASK_READ` | READ |
| GET | `/assignments` | `ROSTER_TASK_READ` | READ |
| POST | `/generate-recurring` | `ROSTER_TASK_GENERATE` | SENSITIVE |
| POST | `/batch-delete` | `ROSTER_TASK_PURGE` | SENSITIVE |
| GET | `/:id` | `ROSTER_TASK_READ` | READ |
| POST | `/` | `ROSTER_TASK_WRITE` | WRITE |
| PUT | `/:id` | `ROSTER_TASK_WRITE` | WRITE |
| DELETE | `/:id` | `ROSTER_TASK_WRITE` | WRITE |
| POST | `/:id/complete` | `ROSTER_TASK_COMPLETE` | SENSITIVE |
| POST | `/:id/delete-instances` | `ROSTER_TASK_PURGE` | SENSITIVE |

> 注：`generate-recurring`→`ROSTER_TASK_GENERATE`（批量生成周期任务）；`batch-delete` 与 `delete-instances`→`ROSTER_TASK_PURGE`（批量删除/清空模板实例）；`:id/complete`→`ROSTER_TASK_COMPLETE`（状态推进）。

## routes/rosterExceptions.ts → `/api/roster-exceptions`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| POST | `/preview` | `ROSTER_EXCEPTION_PREVIEW` | READ |
| POST | `/apply-proposal` | `ROSTER_EXCEPTION_APPLY` | SENSITIVE |

> 注：`/preview` 是“预览修复方案、不落库” → `ROSTER_EXCEPTION_PREVIEW`（目录中 action=READ）；`/apply-proposal` 落库 → `ROSTER_EXCEPTION_APPLY`（OPERATE）。

## routes/rosterLeadershipCockpit.ts → `/api/roster-leadership-cockpit`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/` | `ROSTER_COCKPIT_READ` | READ |

## routes/batchGanttV4.ts → `/api/v4/gantt`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/hierarchy` | `APS_GANTT_READ` | READ |
| GET | `/dependencies` | `APS_GANTT_READ` | READ |

## routes/batchGanttV5.ts → `/api/v5/gantt`

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/hierarchy` | `APS_GANTT_READ` | READ |
| GET | `/dependencies` | `APS_GANTT_READ` | READ |
| PUT | `/operations/:id` | `APS_GANTT_WRITE` | WRITE |
| DELETE | `/operations/:id` | `APS_GANTT_WRITE` | WRITE |

## routes/governance.ts → `/api/governance`  (已挂载，现状记录)

| METHOD | 子路径 | permissionCode | kind |
|---|---|---|---|
| GET | `/permission-catalog` | `GOVERNANCE_ROLE_READ` | READ |
| GET | `/org-units` | `GOVERNANCE_ROLE_READ` | READ |
| GET | `/roles` | `GOVERNANCE_ROLE_READ` | READ |
| GET | `/roles/:id` | `GOVERNANCE_ROLE_READ` | READ |
| POST | `/roles` | `GOVERNANCE_ROLE_WRITE` | WRITE |
| PUT | `/roles/:id` | `GOVERNANCE_ROLE_WRITE` | WRITE |
| PUT | `/roles/:id/permissions` | `GOVERNANCE_ROLE_WRITE` | WRITE |
| DELETE | `/roles/:id` | `GOVERNANCE_ROLE_WRITE` | WRITE |
| GET | `/users` | `GOVERNANCE_USER_READ` | READ |
| GET | `/users/:id` | `GOVERNANCE_USER_READ` | READ |
| POST | `/users` | `GOVERNANCE_USER_WRITE` | WRITE |
| PUT | `/users/:id` | `GOVERNANCE_USER_WRITE` | WRITE |
| POST | `/users/:id/reset-password` | `GOVERNANCE_USER_OPERATE` | SENSITIVE |
| POST | `/users/:id/role-assignments` | `GOVERNANCE_ROLE_GRANT` | SENSITIVE |
| DELETE | `/users/:id/role-assignments/:assignmentId` | `GOVERNANCE_ROLE_GRANT` | SENSITIVE |

> 注：`/api/governance` 已在 `routes/governance.ts` 内逐端点挂好 `requirePermission(GOVERNANCE_*)`，此处仅作完整性登记，Phase 3 无需改动。`GOVERNANCE_ROLE_OPERATE`（启用/停用角色）目录里存在但当前路由未暴露独立端点（角色软删走 `DELETE /roles/:id` → `GOVERNANCE_ROLE_WRITE`）。

---

## 覆盖核对（zero-omission checklist）

server.ts 的 `app.use` 业务挂载点（除公开/机器/静态/错误处理）共 41 个 router 挂载 + bare-mount `batchConstraints`，本表已逐一覆盖：

system, employees, qualifications, employee-qualifications, qualification-matrix, operations, operation-qualifications, operation-qualification-requirements, process-templates, process-stages, stage-operations, personnel-schedules, batch-plans, mfg-template-packages, batch-workbench-v2, calendar, constraints, share-groups, organization, org-structure, shift-definitions, v4/scheduling, scheduling, dashboard, operation-types, batchConstraints(bare /api), personnel-schedules/v2, unavailability, resource-nodes, resources, maintenance-windows, template-stage-operations, batch-operations, v3/bioprocess, standalone-tasks, roster-exceptions, roster-leadership-cockpit, governance, v4/gantt, v5/gantt, auth(公开/自管)。
