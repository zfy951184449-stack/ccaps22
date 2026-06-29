> 范围：重设计「异常修复」前端（已嵌入 V4/V5 求解器界面的 tab）以匹配新后端语义（全局最小重排 / 基线 diff）。本文档**不修改源码**，评审通过后再实现。
> 锁定决策（用户已拍板）：① 应用 = **整套应用（全有或全无）**，删掉逐条勾选；② 变更按 **直接顶替 / 连带重排 / 无法覆盖** 三组呈现。
> 前置：后端行为改写已完成并 live 验证（见 docs/solver-minimize-change-objective-design.md 与项目记忆）。

---

# 异常修复 UI 重设计提案：从「逐岗挑人」到「评审一份最小重排方案」

适用文件：
- 前端组件：`frontend/src/components/roster/RosterExceptionRepair.tsx`（+ 同名 `.css`）
- 前端服务：`frontend/src/services/rosterExceptionApi.ts`
- 后端服务：`backend/src/services/rosterException/RosterExceptionPreviewService.ts`（`applySelectedProposal` 约 :1464）
- 契约类型：`backend/src/domain/rosterException/rosterExceptionTypes.ts`

---

## 1. 背景：旧 UI 和新后端为什么对不上

旧界面是「以人为中心、逐岗挑人」的模型。后端重写后变成「全局最小重排 + 基线 diff」。两套语义在三处直接冲突。

**（1）以人为中心 vs 全局重排。**
旧界面假设：每个空缺独立，给每个空缺挑一个候选人。这套假设体现在两处代码里：
- `replacementCandidates` 诊断表（`RosterExceptionRepair.tsx:1294–1303`，列定义 `:924–935`），按 `vacancyId` 分组（`candidatesByVacancy` memo `:655–662`），展示「每个空缺的所有可选候选人 + 推荐等级 + 评分」。这是「人来挑」的交互残留。
- 变更表的 `proposedEmployeeOnShift`、`hasOvertimeRisk`、`hasTimeConflict` 列（`:901–903`），原本是给人做单条挑选时的「候选质量信号」。

新后端不再有「挑人」这一步：求解器一次性算出一份互相咬合的完整重排方案。`assignmentChanges` 里的每一条不再是「某空缺的某个推荐人选」，而是「这份方案里某个人从 A 挪到 B」。其中一部分人(`originalEmployeeId` 不在不可用名单里)是被连带挪动的——求解器为了腾位置、保覆盖，顺手重排了其他人。候选池这个概念在新模型里不存在了。

**（2）独立勾选 vs 互相咬合会双占。**
旧界面允许逐条勾选(`selectedChangeIds` 状态 `:602`；`rowSelection` 挂在表上 `:937–943`；自动勾选所有 `canApply=true` 的变更 `:648–653`；应用按钮门控在 `selectedChangeIds.length > 0` `:740`)。这建立在「每条变更可独立施加」的前提上。

新方案是一个互相依赖的整体：A 让位给 B、B 才能去顶 C 腾出的岗。如果用户只勾「B 顶 C」却不勾「A 让位给 B」,B 就会在同一时段被排两处——双占。后端 `applySelectedProposal`（`RosterExceptionPreviewService.ts:1490–1578`）逐条施加、跳过失败项、不回滚已成功项，它本身不阻止这种危险子集。因此**逐条勾选必须从 UI 层彻底拿掉**,改为「整套应用或不应用」。

**（3）应用文案与计数也对不上。**
确认弹窗写「将应用 {selectedChangeIds.length} 条 assignment-only 变更」(`:1330–1333`),在「全有或全无」模型下这个可变计数是错的——计数恒等于方案全部变更条数。

---

## 2. 重设计目标与原则

1. **重构心智模型**:界面从「为每个空缺挑替补」改为「评审一份连贯的最小重排 diff(原→新)」。用户做的是一个二元决定:接受这份方案,或不接受。
2. **应用 = 全有或全无**(用户锁定决策)。删掉一切「可选子集」交互。点应用就发送方案里全部 `changeId`。不允许樱桃式挑选,以杜绝双占。
3. **变更分三组呈现**(用户锁定决策):直接顶替 / 连带重排 / 无法覆盖。让用户一眼看清「哪些是不可用的人的岗被回填了」「哪些人被连带挪了」「哪些岗仍没人」。
4. **后端零改动优先**。新契约已支持(详见 §6),本期只动前端 UI 纪律。
5. **遵守前端铁律**:wxb-ui 组件、CSS 变量、白主题、无 emoji 图标、API 收口在 `services/`。

---

## 3. 新界面结构(自上而下)

整体仍在 `WxbPageShell` 内,`embedded` 时隐藏页头(`:945–958` 保留不动)。

### 3.1 录入区(基本保留)

保留现有表单与控制栏(`:960–1100`),不动:
- 异常类型(禁用,恒 `EMPLOYEE_UNAVAILABLE`)、Team 筛选、员工多选、不可用时间窗、原因。
- 修复模式分段(`MINIMAL_CHANGE | MAX_COVERAGE`)、保护锁定排班、同部门边界、允许加班建议。
- 两个动作按钮:「查看影响」(`runPreview('IMPACT_ONLY')`)、「生成修复方案」(`runPreview('SOLVER_REPAIR')`)。
- 进度面板(`:1101–1140`)、反馈卡 / 错误 Alert(`:1141–1167`)全部保留。

任一录入项变更仍触发 `clearPreviewState()`(已有行为,保留)。

### 3.2 结论条(新增,一句话总览)

在生成方案后、变更评审区之前,加一条 `WxbAlert`(`type` 按状态:`READY`→success,`PARTIAL`/`UNCOVERED`→warning),配一行 `WxbKpiCard`。

文案(从 DTO 直接拼,详见 §5):

> 为覆盖 **N** 个受影响岗位,本方案共调整 **M** 处人员安排(直接顶替 **X** + 连带重排 **Y**),仍有 **Z** 个岗位无法覆盖。

- N = 受影响岗位数 = 直接顶替组条数 + 无法覆盖组条数(即不可用的人原本占的岗 = 被回填的 + 没填上的)。
- M = `proposal.changedAssignmentCount`(= 直接顶替 X + 连带重排 Y)。
- X = 直接顶替组条数,Y = 连带重排组条数,Z = `proposal.uncoveredVacancyCount`。

KPI 卡(`WxbKpiCard` × 3~4,复用现有 `:1181–1185` 网格):
- 「方案状态」:`proposalStatusLabel(proposal.status)`。
- 「覆盖率」:`Math.round(coverageRate * 100)%`。
- 「调整处数」:`changedAssignmentCount`,副标题 `直接顶替 X · 连带重排 Y`。
- 「无法覆盖」:`uncoveredVacancyCount`,Z>0 时卡片用警示色。

`supervisorAttentionItems` 和 `capabilityGaps`(`:1226–1241`)继续以 `WxbAlert` 列在结论条下方,保留。

### 3.3 变更评审区(diff,按三组)

核心改造区。用三个 `WxbPageSection`,每段一个 `WxbTable`(无 `rowSelection`),数据源由前端从 DTO 派生(§5)。每段标题带计数 `WxbBadge`。空组直接用 `WxbEmpty` 占位或隐藏该段。

**A. 直接顶替**(标题:`直接顶替 (X)`)
数据 = `assignmentChanges.filter(c => unavailableIds.has(c.originalEmployeeId))`。
列:
- 岗位:`batchCode` + `operationName`,副行 `plannedStart ~ plannedEnd`。
- 原→新:`originalEmployeeName(originalEmployeeCode)` → `proposedEmployeeName(proposedEmployeeCode)`,复用现有 before-after 版式(CSS `:438–449`)。
- 角色:`role` + `positionNumber`。
- 部门:`originalDepartmentName` → `proposedDepartmentName`,`sameDepartment` 为 true 显示 `WxbTag`「同部门」,false 显示警示 `WxbTag`「跨部门」。
- 资质:`requiredQualificationNames`(`WxbTag` 列),配 `proposedEmployeeHasQualification` 的「资质匹配 / 不匹配」标记。
- 班次:`proposedShiftCode`(为 null 显示「无对应班次」警示)。
- 标记列(只读,合并冲突信号):`hasTimeConflict` → `WxbTag`「时间冲突」;`canApply=false` → `WxbTag`「阻止:{applyBlockReason}」。

**B. 连带重排**(标题:`连带重排 (Y)`)
数据 = `assignmentChanges.filter(c => !unavailableIds.has(c.originalEmployeeId))`。
列与 A 完全相同(同一 `columns` 定义复用)。差异仅在语义:这里的「原」是被连带挪走的其他人。段首加一行说明文字:`这些人未被标记不可用,是为了腾出岗位、保住覆盖而被连带调整。`

**C. 无法覆盖**(标题:`无法覆盖 (Z)`)
数据 = `proposal.uncoveredVacancies`(`SolverRepairUncoveredVacancyDto[]`)。复用现有未覆盖表(`:1270–1279`)。
列:`batchCode` + `operationName`、`plannedStart ~ plannedEnd`、`role` + `positionNumber`、`requiredQualificationNames`、`reason`(译为中文短语)。
Z=0 时用 `WxbEmpty`「全部岗位均已覆盖」。

> 说明:三组里只有 A、B 会被应用;C 是只读警示,不进入应用请求。

### 3.4 整套应用(一个按钮 + 确认弹窗)

替换现有应用按钮行(`:1242–1255`):
- 一个 `WxbButton`「整套应用」(`type="primary"`)。
- 禁用门控:仅 `proposal.applyAllowed`(**删掉** `selectedChangeIds.length > 0`)。禁用时旁注 `proposal.applyDisabledReason`。
- 旁注文案改为诊断式:`方案含 M 处变更(可应用 K 处)`,其中 K = `assignmentChanges.filter(c => c.canApply).length`。若 K < M,用警示色提示「{M-K} 处被阻止,应用时将跳过」。

点击打开 `WxbModal` 确认弹窗(改造 `:1321–1334`):
- 标题:`确认应用完整修复方案`。
- 正文:摘要 + 警示(§6 文案)。
- 按钮:「确认应用」→ `handleApplyConfirmed()`,「返回检查」→ 关闭。
- `confirmLoading={applyLoading}`。

应用成功后,结果区(`WxbKpiCard` 网格 + 写边界 `WxbAlert`,`:1281–1292`)保留不动。

---

## 4. 逐块 KEEP / CHANGE / REMOVE 清单

### KEEP(原样保留)
- 页面外壳、`embedded` 头逻辑:`:945–958`。
- 录入表单 + 控制栏:`:960–1100`。
- 进度面板:`:1101–1140`。反馈卡 / 错误 Alert:`:1141–1167`。
- 影响分析区(IMPACT_ONLY 用):日历 `ShiftPlanCalendar`(`:479–577`,渲染于 `:1195`)、受影响岗位表(`impactedRoleColumns` `:847–870`,数据 `impactedRoleRows` `:664–685`)。这些展示基线状态,只在「查看影响」阶段用,与方案 diff 无冲突,保留。
- 未覆盖表 → 复用为「无法覆盖」组(`:1270–1279`)。
- 应用结果区 + 写边界 Alert:`:1281–1292`。
- 风险告警区:`:1305–1317`。
- CSS:表单网格、日历、表格、before-after 版式全部复用,无需新增选择态样式。
- 后端契约 DTO(`SolverRepairAssignmentChangeDto` 等)字段全部保留。

### CHANGE(语义 / 字段调整)
- **应用按钮**(`:1242–1255`):文案「应用已选方案」→「整套应用」;门控删 `selectedChangeIds.length`,只留 `proposal.applyAllowed`;旁注改诊断式 `方案含 M 处变更(可应用 K 处)`。
- **`canApply` 门控**(`applyDisabledReason` / `canApply` 计算 `:733–740`):删除对 `selectedChangeIds.length` 的依赖,只看 `hasSolverProposal && proposal?.applyAllowed`。
- **确认弹窗**(`:1321–1334`):标题、正文改全有或全无文案(§6)。
- **`handleApplyConfirmed`**(`:821–845`):不再传 `selectedChangeIds` 状态,改传 `proposal.assignmentChanges.map(c => c.changeId)`(全部 changeId)。
- **变更评审区**(原单表 `:1258–1268`):拆成 §3.3 的三段;`columns` 删掉 `proposedEmployeeOnShift`(`:901`)与 `hasOvertimeRisk`(`:903`)两列——它们是逐条挑人时代的候选质量信号,在咬合方案里单条展示会误导;`hasTimeConflict` 保留(仍是可执行的告警);「应用状态」列改为「冲突/阻止」(`canApply=false` 时显 `applyBlockReason`)。
- **结论条**:新增 §3.2 的 `WxbAlert` 一句话 + KPI(可在现有 `:1181–1185` KPI 网格上扩展)。

### REMOVE(新模型下完全废弃)
- **逐条勾选 / `rowSelection`**:`:937–943` 整个对象删除;表上 `rowSelection={rowSelection}` 属性去掉。
- **`selectedChangeIds` 状态**:`:602` 删除。
- **自动勾选 useEffect**:`:648–653` 删除(方案本身即「选择」,无需初始化)。
- **候选人诊断表整段**:`:1294–1303` 连同 `candidateColumns`(`:924–935`)删除。理由:求解器已选定人选,「列出每个空缺所有可能候选人」在新模型里既无对应交互、又会让用户误以为还能挑人。
- **`candidatesByVacancy` memo**:`:655–662` 删除(仅服务于已删的候选表)。注意:`impactedRoleRows`(`:664–685`)目前用它算 `viableCandidateCount`——若保留影响表的该列,需把这段依赖一并简化(去掉 `viableCandidateCount` 或改为不依赖候选池);建议本期直接去掉该派生列。
- **`preview.replacementCandidates` 在 UI 的所有消费点**:随候选表一并移除。

---

## 5. 数据映射(UI 元素 → DTO 字段)

不可用名单(分组判定的基准):
```ts
const unavailableIds = new Set((preview?.employees ?? []).map(e => e.employeeId));
```
> `preview.employees`(`RosterExceptionPreviewResponse.employees`,types `:200`)是录入的不可用员工,后端在 preview 响应里已回带,前端拿到即用。响应另有单数 `employee` 字段(`:199`),分组一律用复数 `employees[]`。

分组:
```ts
const direct   = changes.filter(c =>  unavailableIds.has(c.originalEmployeeId)); // 直接顶替
const knockOn  = changes.filter(c => !unavailableIds.has(c.originalEmployeeId)); // 连带重排
const uncovered = proposal.uncoveredVacancies;                                  // 无法覆盖
```

| UI 元素 | DTO 字段 |
|---|---|
| 结论条 M | `proposal.changedAssignmentCount` |
| 结论条 X / Y | `direct.length` / `knockOn.length` |
| 结论条 N | `direct.length + uncovered.length` |
| 结论条 Z | `proposal.uncoveredVacancyCount` |
| 方案状态 | `proposal.status`(`READY`/`PARTIAL`/`UNCOVERED`) |
| 覆盖率 | `proposal.coverageRate` |
| 应用按钮可用 | `proposal.applyAllowed` / 禁用因 `proposal.applyDisabledReason` |
| 可应用条数 K | `changes.filter(c => c.canApply).length` |
| 岗位列 | `batchCode` + `operationName` + `plannedStart`/`plannedEnd` |
| 原→新 | `originalEmployeeName/Code` → `proposedEmployeeName/Code` |
| 角色 | `role` + `positionNumber` |
| 部门 / 同部门标记 | `originalDepartmentName` → `proposedDepartmentName` + `sameDepartment` |
| 资质 / 匹配标记 | `requiredQualificationNames` + `proposedEmployeeHasQualification` |
| 班次 | `proposedShiftCode`(null → 「无对应班次」) |
| 时间冲突标记 | `hasTimeConflict` |
| 阻止标记 | `canApply`(false 显 `applyBlockReason`) |
| 无法覆盖行 | `uncoveredVacancies[].{batchCode,operationName,role,positionNumber,plannedStart,plannedEnd,requiredQualificationNames,reason}` |
| 应用请求体 | 全部 `changes.map(c => c.changeId)` |

> 「直接顶替 vs 连带重排」纯前端按 `originalEmployeeId ∈ unavailableIds` 判定,后端不预分组,DTO 无 `changeType` 字段——分组只是展示层关切,两组走同一应用路径。

---

## 6. 应用流程(全有或全无)

1. 用户点「整套应用」(`proposal.applyAllowed` 为真才可点)。
2. 打开 `WxbModal` 确认弹窗,正文:
   - 摘要:`将原子式应用本方案,共 M 处变更(直接顶替 X · 连带重排 Y)。`
   - 跨部门 / 阻止提示(K<M 时):`其中 {M-K} 处因跨部门或排班失效被阻止,应用时将自动跳过,不影响其余变更。`
   - 无法覆盖提示(Z>0 时):`仍有 Z 个岗位无人可补,需另行报增援。`
   - 写边界声明(沿用现有文案):`应用只更新 batch_personnel_assignments 的 employee_id / shift_plan_id,不改操作时间、生产计划或排班结果。`
3. 确认 → `handleApplyConfirmed()` → `rosterExceptionApi.applySelectedProposal(preview, allChangeIds, { supervisorConfirmation: true, reasonCode })`,其中 `allChangeIds = proposal.assignmentChanges.map(c => c.changeId)`。
4. 后端 `applySelectedProposal`(`RosterExceptionPreviewService.ts:1464`)逐条校验施加:`canApply`、行存在、未锁定、未取消、`batchOperationPlanId` 匹配、当前 `employee_id === originalEmployeeId`(防陈旧)、同部门边界。成功的进 `appliedChanges`,失败的进 `skippedChanges`,事务提交;DB 约束错才整体回滚。
5. 成功后:写 `applySummary`,渲染结果区(KPI + 写边界 Alert),并重新拉一次 preview / 上层排班结果刷新基线。

**后端是否需要改:预期不需要。**
`RosterExceptionApplyRequest.selectedChangeIds: string[]`(types `:219`)对条数和子集无语义约束,前端传全部即达成「整套应用」。后端逐条 `canApply` 校验恰好充当「自动跳过被阻止条目」的安全网。这里的「全有或全无」指**不允许樱桃式挑选**(UI 不再给子集入口),而非「一条失败全部失败」——后者由 DB 事务原子性兜底,语义已足够。

> 可选的后端加固(非本期必须):若要严格拒绝「传入子集」,可在 `applySelectedProposal` 入口校验 `selectedChangeIds` 是否等于 `proposal.assignmentChanges` 全集,不等则报错。鉴于 UI 已不暴露子集入口,本期可不做,留作后续。

---

## 7. 边界与文案(去 AI 味,直接)

- **PARTIAL(有空缺)**:结论条用 warning,文案点明 Z;「无法覆盖」组照常列出;应用仍可点(填上能填的)。不写「很遗憾」「请注意」之类铺垫,直接说「仍有 Z 个岗位无法覆盖,需报增援」。
- **UNCOVERED / 覆盖率为 0**:结论条用 warning,「直接顶替」「连带重排」组可能为空,用 `WxbEmpty`「本次未生成可用替换」;应用按钮按 `applyAllowed` 决定是否可点。
- **求解器失败 / 不可用**:`capabilityGaps` 与 `supervisorAttentionItems` 以 `WxbAlert` 列出(沿用 `:1226–1241`);`uncoveredVacancies[].reason` 形如 `SOLVER_V4_PREVIEW_FAILED` 映射为中文「求解器预览失败」。错误态走现有 error Alert(`:1163–1167`)。
- **无变更(原样即最优)**:`assignmentChanges` 为空且 `uncoveredVacancies` 为空 → 结论条 success,文案「当前排班已是最优,无需调整」,三组表全用 `WxbEmpty`,应用按钮可隐藏或禁用。
- **跨部门 / 被阻止条目**:`canApply=false` 的行在其所属组内正常显示,标记列显「阻止:{applyBlockReason 中文化}」(如 `CROSS_DEPARTMENT_BLOCKED`→「跨部门,不可应用」)。不单独拉出一张表,避免再造一个「可选子集」的错觉;应用时后端自动跳过。

文案统一原则:陈述句、不堆排比、不用「为您」「请放心」营销腔、无 emoji。

---

## 8. 分阶段实现 + 验证

**阶段 1 — 拆表分组(纯展示,低风险)。**
在现有单变更表基础上,按 `unavailableIds` 派生 `direct`/`knockOn`/`uncovered` 三数据源,渲染三段 `WxbTable`。此阶段先不动应用逻辑(`rowSelection` 暂留)。可独立预览实证分组正确。

**阶段 2 — 删选择、改应用(行为变更)。**
删 `selectedChangeIds`(`:602`)、`rowSelection`(`:937–943`)、自动勾选 effect(`:648–653`);`handleApplyConfirmed` 改传全量 changeId;按钮 / 弹窗文案与门控按 §3.4 / §6 改。

**阶段 3 — 删候选表 + 结论条。**
删候选诊断表(`:1294–1303`)、`candidateColumns`(`:924–935`)、`candidatesByVacancy`(`:655–662`),简化 `impactedRoleRows` 去掉 `viableCandidateCount`;加结论条 `WxbAlert` + KPI。

**验证。**
- **预览实证**(live):造一例「A、B 同时不可用」且求解器产生连带重排的场景,确认:① 直接顶替组 = A、B 原岗;② 连带重排组确含 `originalEmployeeId` 不在不可用名单的条目;③ 结论条 N/M/X/Y/Z 计数自洽(M = X+Y,N = X+Z 项);④ 整套应用后 `appliedCount` 合理、双占未发生;⑤ 跨部门条目被后端跳过且界面如实呈现。
- **现有 15 组件测试调整**:
  - 删/改断言逐条勾选、`selectedChangeIds`、候选表渲染的用例(它们测的是已删行为)。
  - 新增/改写:三组分组渲染(给定不可用名单与 `assignmentChanges` mock,断言三段条数);应用请求体断言(发送的 changeId 集合 = `assignmentChanges` 全集);应用按钮门控只依赖 `applyAllowed`(不再依赖选择计数);结论条计数文案断言。
  - 影响分析 / 日历 / 录入表单相关用例不应受影响(对应区块 KEEP),若它们当前断言里包含候选表或选择态,需相应剥离。

---

**风险提示**:`impactedRoleRows`(`:664–685`)目前依赖 `candidatesByVacancy`。删候选池时必须同步处理这条依赖,否则影响表的 `viableCandidateCount` 列会取到空 Map——建议直接移除该派生列。这是删除候选池时最容易漏的连带点。
