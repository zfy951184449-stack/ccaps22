# Repo Mapping (Global)

本文件说明如何把全局工艺语义映射到仓库实现。

## 1. Source of truth and layering

- 全局语义源：`process-constraints.md`
- 仓库本地：仅做“字段映射 + UI 表达 + solver 接口适配”，不可修改术语定义。
- 如本地文档与全局冲突，必须删除本地冲突定义并引用全局。

## 2. API and DTO mapping

必备映射点：

- 约束输出：`constraint_code + severity + hard_or_soft + violation_message_template`
- 状态语义：`task_status`, `equipment_state`, `material_status`, `qc_status`
- 质量门禁：显式区分 `completed` 与 `released`

DTO 层要求：

- 后端 `snake_case` 到前端 `camelCase` 的纯函数映射
- 不得把 `released` 折叠为 `completed`
- 不得把 `cleaning_cip / sterilizing_sip / dirty_hold / clean_hold` 折叠为 `busy`

## 3. Solver contract mapping

- `FLOW_WINDOW`：zero-wait 与 max-hold 必须在求解时建模，不得后处理修补
- `QUALITY_GATE`：QC release 未满足时，下游任务必须阻断
- `EQUIPMENT_STATE`：DHT/CHT 建模为显式状态或计时器
- `UTILITY_CAPACITY`：WFI/CIP skid 归入共享容量约束
- `SPACE_SEGREGATION`：suite / pre-post viral 归入互斥资源
- `WORKFORCE_COVERAGE`：由排班 skill 或人员模块前置过滤资格与覆盖

## 4. UI and diagnostics mapping

UI 不应只显示“排好了没”，必须可诊断：

- 显示状态分层：`completed` 与 `released` 分列
- 显示设备态：`processing`, `cleaning_cip`, `dirty_hold` 等
- 显示违规：按 `constraint_code` 聚合，含时间窗口与受影响实体

禁止：

- 只给 toast 文案，不给约束编码
- 把 hard violation 当 warning 展示

## 5. Trigger governance (skill routing)

| 场景 | 触发 skill |
| --- | --- |
| 仅工艺链路/设备/清洗/放行/空间/公用工程 | `biopharma-cmo` |
| 仅班次、资质、交接、更衣、休息 | `biopharma-roster` |
| 工艺排产 + 人员覆盖同时出现 | `biopharma-cmo` + `biopharma-roster`（必须双触发） |

优先级：

1. 工艺与安全边界（`FLOW_WINDOW`, `QUALITY_GATE`, `SPACE_SEGREGATION`）
2. 设备与公用工程（`EQUIPMENT_STATE`, `UTILITY_CAPACITY`）
3. 人员覆盖（`WORKFORCE_COVERAGE`）
