# Process Constraints (Global Semantic Baseline)

本文件是生物制药 CMO 工艺与排产语义的**唯一基线**。

- 所有仓库本地规则仅可做适配，不可重定义术语含义。
- 所有约束输出必须可映射为统一“约束代码接口”。
- 禁止将违规通过“自动后移任务”静默消除。

## 1. Core hierarchy

- `Campaign`: 同一分子或产品族的连续批次生产窗口。
- `Batch`: 单个端到端生产循环。
- `USP`: Seed / 扩增 / 生产反应阶段，通常长时、连续、不可随意中断。
- `DSP`: 捕获、纯化、UF/DF、病毒相关处理、灌装前步骤。
- `Ancillary`: Media/Buffer Prep、EM、校验、消毒等配套任务。

## 2. Unified constraint categories

所有规则必须归类到以下类别之一：

1. `FLOW_WINDOW`: zero-wait / max-hold / shelf-life / transfer windows
2. `QUALITY_GATE`: QC release / sterility blind period / sampling gate
3. `EQUIPMENT_STATE`: CIP/SIP/DHT/CHT/changeover/turnover
4. `UTILITY_CAPACITY`: WFI/PW/CIP skid/shared utility peaks
5. `SPACE_SEGREGATION`: suite mutex / pre-viral vs post-viral boundaries
6. `WORKFORCE_COVERAGE`: qualification / handover / gowning / rest

## 3. Constraint contract interface (required)

每条规则必须能表达为以下接口：

- `constraint_code`: 稳定且可追踪的编码（例如 `FLOW_MAX_HOLD`, `QUALITY_QC_RELEASE_GATE`）
- `severity`: `info | warning | critical`
- `hard_or_soft`: `hard | soft`
- `violation_message_template`: 可实例化文案模板（必须包含关键对象和时间边界）

推荐扩展字段：

- `category`: 对应第 2 节类别
- `evidence_fields`: 判定所需字段名列表
- `suggested_action`: 明确处理动作（不得包含“自动后移”）

## 4. Status semantics interface (required)

任务、设备、物料、质检状态必须使用固定词表，不允许同义词混用。

### 4.1 Task status

- `draft`
- `scheduled`
- `running`
- `completed`
- `released`
- `blocked`
- `infeasible`

规则：`released` 不是 `completed` 的同义词。未通过质量放行时，任务即使 `completed` 也不能进入可执行下游。

### 4.2 Equipment state

- `idle`
- `processing`
- `cleaning_cip`
- `sterilizing_sip`
- `dirty_hold`
- `clean_hold`
- `changeover`
- `maintenance`

规则：如场景含 DHT/CHT，禁止退化为 `idle/busy` 二元状态。

### 4.3 Material status

- `not_prepared`
- `prepared`
- `in_hold`
- `expired`
- `consumed`
- `quarantined`

### 4.4 QC status

- `not_sampled`
- `sampled`
- `in_test`
- `released`
- `rejected`

## 5. Violation decision template

判定违规时必须输出：

- `constraint_code`
- `hard_or_soft`
- `is_violated`
- `violation_reason`
- `affected_entities`
- `time_window`（例如 `end(A)=...`, `start(B)=...`, `max_hold=...`）

禁止输出“模糊建议”。必须明确：

- `hard` 违规：报告 `infeasible` 或阻断执行
- `soft` 违规：报告 penalty 与可解释代价

## 6. Non-negotiables

- 不将 Biopharma CMO 视为通用离散制造 job shop。
- 不静默修复违规时间窗。
- 不将 QC gate 隐藏在普通 task status。
- 不忽略 DHT/CHT 与清洗/灭菌状态转换。
- 不以“简化展示”为理由删除关键工艺语义。
