# 待决策与待填坑登记 (Pending Decisions & Backlog)

> 集中登记所有「待后续决策 / 待做 / 待详细讨论」的坑，避免散落遗忘。
> 状态图例：🔴 待决策 ｜ 🟡 待做 ｜ 🟢 已定待执行 ｜ ✅ 已处理。
> 新坑随时往这里加。

---

## 一、RBAC / 鉴权体系

### PD-1 批次生命周期管理（含「双激活入口」）— 🔴 待详细讨论
- **背景**：批次激活有两套后端入口：
  - `POST /api/batch-plans/:id/activate`（`activateBatchPlan`）— **前端在用**（`BatchManagementV4` 调 `batchPlanApi.activate`）。
  - `POST /api/calendar/batch/:batchId/activate`（`activateBatch`）— **前端无任何调用**。
- **核实**：App.tsx 无 calendar 路由、无「生产日历」页面；`calendar.ts` 整套（activate / lock / auto-assign）疑为早期功能残留，当前无前端入口。
- **临时决策**：权限上 **双激活统一归 `APS_BATCH_ACTIVATE`**（不再分给 `APS_CALENDAR_OPERATE`）。
- **待讨论**：批次生命周期（状态机 DRAFT/ACTIVATED/… 、谁能激活/停用、`calendar.ts` 这套端点整体废弃还是重新接入、是否需要 IN_PROGRESS/COMPLETED 执行态）需专门开题讨论后定。

### PD-2 specialShiftWindows（特殊班次窗口）启用 or 弃用 — 🔴 待决策
- **背景**：`backend/src/routes/specialShiftWindows.ts`（8 端点，含 `/:id/activate`、`/cancel`）**未在 server.ts 挂载**；但前端 `specialShiftWindowApi`（`api.ts`）完整、`special_shift_windows` 表**有 2 行数据**、求解器有 `special_shift_joint_coverage` 约束、App.tsx 有 `/special-shift-windows → /personnel-scheduling` 重定向。属「前后端+表+约束都备齐、只差后端挂载」的搁置功能（前端现在调它会 404）。
- **待决策**：
  - 启用 → 挂载路由 + 在 ROSTER 域新增资源 `SPECIAL_SHIFT_WINDOW`（READ/WRITE，activate/cancel 用 OPERATE，约 3-4 条权限）。
  - 弃用 → 删后端路由 + 前端 `specialShiftWindowApi` + 重定向，清理表。

### PD-3 回调口服务间鉴权 — ✅ 已处理（backend + solver 两端都已实现）
- **背景**：`/api/v4/scheduling/callback/progress|result` 无鉴权，可被伪造求解结果污染排班库并被 apply；solver 还轮询 `GET /runs/:id/status`。
- **backend 端 ✅ 已实现**：`requireServiceAuth`（`crypto.timingSafeEqual`）已挂 `/callback/progress`、`/callback/result`、`/runs/:id/status`；密钥不符→401，`SOLVER_CALLBACK_SECRET` 未配置→503。密钥已写入 `backend/.env`。
- **solver 端 ✅ 已实现**：`solver_v4/core/callback.py` 在 `__init__` 读取 `SOLVER_CALLBACK_SECRET`，经 `_auth_headers()` 在三处都带上 header `X-Solver-Callback-Token`：进度 POST、结果 POST、status 轮询 GET（status 路由在 backend 同样挂了 `requireServiceAuth`，故必须带）。env 注入：`start_all.sh` 启动 solver 前自动从 `backend/.env` 同步并 export，`solver_v4/.env.sample` 文档化。密钥未配置时 callback 仅打 warning 不带头（由 backend 决定 401/503）。回归测试：`solver_v4/tests/test_callback_auth.py`。

### PD-4 求解器算力防刷 — ✅ 已定（不做）
- `precheck` / `preview-proposal` 归 `SOLVER_RUN_READ`。本地求解器、不担心算力，不单拆 OPERATE 权限；如需防刷由现有 rate-limit 兜底。

### PD-5 operation-qualifications 权限归属 — ✅ 已定
- `/api/operation-qualifications` 与 `/api/operation-qualification-requirements`（共用 `operationQualificationController`）端点 → 归 **`MASTER_OPERATION_*`**（操作/工艺管理员维护操作时一并定义资质要求），**不**归 `MASTER_QUALIFICATION_*`。
- 已落实：`permission_catalog_meta` 资源描述调整（QUALIFICATION 去掉「操作资质要求」、OPERATION 加上）。挂中间件时 operation-qualifications 路由用 `MASTER_OPERATION_READ/WRITE`。

### PD-6 GOVERNANCE 前瞻权限 — ✅ 已定（已落库）
- USER/ROLE 治理 7 条权限已落库（`rbacTypes.ts` 有数据模型支撑），稳定 permission_code 供配置界面引用。

### PD-7 新 auth 代码的部署生效 — 🟡 部署注意（重要）
- **launchd 跑的是编译产物**：服务 `com.codex.mfg8aps.backend`（PID 由 launchd 托管、KeepAlive）跑 `dist/server.js`，是**旧代码、不含 auth**；新 auth 在 `src/`。kill 进程会被 launchd 立即 respawn（这就是为什么端到端 curl 打到旧 server）。
- **要让新 auth 生效**：① `npm --prefix backend run build`(tsc→dist) ② 重启该 launchd 服务（或临时停 launchd 用 `npm run dev`）。仅改 src 不重新 build+重启，3001 上永远是旧代码。
- **部署顺序**：先做 PD-3 solver 端(发 token) → backend build → 重启 launchd → `AUTH_ENFORCE` 暂保持 `false`(影子)联调前端登录 → 全链路 OK 后再切 `true` 强制 → 之后逐路由挂 `requirePermission`。

### PD-8 影子模式下治理写 API 的网络层保护 — 🟢 已定待执行（已部分加固）
- **背景**：`AUTH_ENFORCE=false`(默认影子) 时 `requirePermission` 对匿名/缺权限只 `console.warn` 后放行。前端 `ProtectedRoute` 仅是体验级拦截（客户端可绕过）。因此匿名直连 `POST /api/governance/users`、`POST /api/governance/users/:id/role-assignments`、`PUT /api/governance/roles/:id/permissions` 等会被真正执行。
- **已加固（本轮）**：`requirePermission` 新增 `requireAuthenticatedEvenInShadow` 选项；`routes/governance.ts` 所有写/授权/启停端点（POST/PUT/DELETE）已挂该选项 → 影子模式下也要求「已认证」(匿名→401)，但仍不强制具体权限码（保持影子语义不破坏前端）。READ 端点保持完全影子放行。
- **前端镜像**：新增 `REACT_APP_AUTH_ENFORCE`（默认 false）镜像后端；`App.tsx` 根 `ProtectedRoute allowAnonymousInShadow` 在影子模式放行匿名进入现有页面，`/governance/*` 仍按 `requiredPermission` 把关。
- **仍待执行**：① 生产部署/启动检查里对生产环境断言 `AUTH_ENFORCE=true`（避免忘记切开关，治理面裸奔）。② 切强制模式后前端同步设 `REACT_APP_AUTH_ENFORCE=true`，并按权限过滤顶部菜单。

### PD-9 backend/.env 被 git 跟踪且含 secret — 🔴 安全债（待处理）
- `backend/.env` 是 **tracked** 文件且现含 `JWT_SECRET` / `SOLVER_CALLBACK_SECRET` 等真实密钥。commit `038d13f` 已**故意排除** `.env`（secret 未入库），但该文件本身仍在版本控制中（历史可能已有旧值）。
- 待处理：`git rm --cached backend/.env` + 确认 `.gitignore` 含 `backend/.env`；密钥改由环境/密钥管理注入；历史若含敏感值需考虑清史。与报告中「217MB 整库 dump 被 git 跟踪」属同类数据保护债。

---

## 二、排班 / 调度

### PD-10 排班 apply 责任域隔离 — standalone 求解行为变更 + 测试缺口 — 🟢 已定待执行
- **背景**：修复「只跑单团队（如 USP）求解并 apply，会覆盖其他团队已应用排班，每日操作人员分配只剩最后一个团队」。根因：apply 原本按时间窗全删未锁定的 bpa/esp/standalone，删除粒度（整窗全部）≠ 求解粒度（单团队）。已改为「替换边界 = 本次求解责任域」，批次/员工/独立任务三维度各自独立收窄；责任域快照存于 `scheduling_runs.summary_json.scope`（零 DDL）。改动文件：`applyResultController.ts` / `DataAssemblerV4.ts` / `solveOrchestrator.ts` / `helpers.ts`；集成测试 `applyScopeIsolationV4.test.ts`。
- **行为变更（需团队知晓）**：`DataAssemblerV4.fetchAndEnrichStandaloneTasks` 现在在**局部团队求解**时只取「本团队子树(含) 或 team_id IS NULL（无归属=全局任务）」的独立任务；以前不分团队全取（却只能用本团队员工排，排不上还被 apply 误删）。即**局部求解不再尝试给别团队的独立任务派人**——符合「局部只管本团队」直觉，但属求解侧行为改变。
- **边界**：`team_id IS NULL` 的独立任务被任何局部求解纳入（视为全局任务），会被每次局部 apply 重排/覆盖；当前数据 standalone `team_id` 全为 2(USP)，暂不触发跨团队场景。
- **测试缺口（待补）**：apply 端隔离已有集成测试（3 用例）；但 **assembler 端的 team 过滤**（局部求解只取本团队 standalone）尚无专项集成测试，待补。
- **未做（更大范围，本次不碰）**：apply 之外其它 6+ 个写入口（手工编辑 `calendarController`、旧 V2/V3 `schedulingPersistenceService` 等）仍各用各的隐含删除范围，缺统一的「数据归属/scope」契约——更底层的债（原 L2 方案），需要时再开题。

### PD-11 排班结果缺「未排根因」诊断 — 🟡 待议（需 solver 支持）
- **背景**：操作分配明细（`SolveResultV4Page` → `AssignmentsView`）已重做为「日历总览 + 按日清单」，空缺岗位的手动分配按资质筛选候选人——result 接口（`solveResultHandler.getSolveResultV4`）为每个岗位返回 `qualification_requirements` + `eligible_employee_ids`（口径与 `DataAssemblerV4` 一致：mandatory 且 level 达标，独立任务叠加 `allowed_employee_ids` 白名单；集成测试 `solveResultQualificationsV4.test.ts`）。
- **缺口**：界面上的「当天 N 人可选 / 无人可选」是**前端代理诊断**（当天有班次 ∩ 资质合格）；「求解器为什么没排上」的真实根因（资质不足 / 工时上限 / 夜班间隔 / 约束冲突等）solver 不返回，排班员只能猜。
- **若做**：需 solver_v4 在 solve 结果中输出 per-operation 未分配归因（infeasibility 原因），涉及 `solver_v4/contracts/`（response 契约）+ `core/solver.py`/`callback.py`，backend 透传、前端在空缺操作详情展示。成本不小，待有真实「排不满且看不懂」的场景再立项。

### PD-12 原生全屏下浮层 getContainer 不重算 — 🟢 已定待执行（已加宿主兜底）
- **背景**：甘特进入浏览器原生全屏（top layer）后，portal 到 document.body 的浮层会被全屏元素遮挡，故 wxb-ui 用 `_internal/portalContainer.ts` 的 `resolvePortalContainer`/`resolvePopupContainer` 在全屏时改挂全屏元素。但 antd 只在浮层**挂载那一刻**求值 `getContainer`，**已打开**的 Modal/Drawer 在用户退全屏（ESC / 工具栏）后容器不会重算，可能错位或残留在已折叠的旧子树里。
- **已加兜底（宿主侧，无 wxb-ui 公共 API 改动）**：`ProcessTemplateV3Editor` 监听 `fullscreenchange`，**退全屏时**主动关闭其作为甘特同级渲染的业务弹窗（QuickCreate/编辑、ShareGroup、建设备、加阶段、删阶段、删操作）；`GanttChart` 本身已在同一事件里关掉右键菜单等瞬态浮层。只在「退出」时关、不动「全屏中打开」的常规流程。
- **未做（更通用方案，待需要再议）**：把全屏态经 `onFullscreenChange` 回调/context 上抬给 `WxbGanttChart` 的所有消费者，让任意父级在退全屏后强制重渲染相关浮层；属设计系统公共 API 扩展，超出本次最小改动范围。其它会在全屏甘特上叠业务弹窗的页面若出现，应照此宿主兜底模式各自处理。

---

## 三、已清理
- ✅ `backend/src/routes/independentOperations.ts` + `backend/src/controllers/independentOperationController.ts`：纯死代码（未挂载、前后端零引用），已删除。
- ✅ `frontend/src/components/SolverV4/views/` 下 `TimelineView` / `OverviewView` / `PersonnelView` / `PrecheckView` 及 `components/SegmentedControl`：零引用死代码，随操作分配明细重构一并删除。

---

## 四、鉴权后续阶段（来自实施计划，非"坑"但需跟踪）
- 🟡 后端 auth 模块（JwtService / AuthService / 可插拔 provider / `/api/auth/login` / requireAuth·requirePermission·requireServiceAuth）+ `user_role_assignments` 加 `scope_unit_id`。
- 🟡 RBAC 管理 API（角色 CRUD / 权限目录查询 / 用户授权+scope）。
- 🟡 **配置界面**（管理员自定义权限组+分配+组织树范围）。
- 🟡 数据范围过滤（写按 scope、读跨团队只读、全局角色豁免）。
- 🟡 灰度挂全局 `requireAuth`（`AUTH_ENFORCE` 影子开关）+ 前端登录页/拦截器/菜单按权限过滤。
- 完整方案见 `~/.claude/plans/glimmering-wibbling-wand.md`。
