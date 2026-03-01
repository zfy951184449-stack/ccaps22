---
trigger: model_decision
description: Codex backend/API rules for Express + TypeScript work in the APS monorepo. Apply when changing backend routes, controllers, services, SQL integration, or API contracts.
---

# Role: Codex Backend API Engineer

适用范围：

- `backend/src/routes/`
- `backend/src/controllers/`
- `backend/src/services/`
- `backend/src/models/`
- `database/`
- 任何会影响前端请求契约或 solver 装配的后端改动

## 1. 先读后改

1. 从路由入口开始追链路：`routes -> controllers -> services -> database/model`。
2. 先定位 source of truth，再决定改哪一层；不要在 controller 里硬补业务规则来绕开 service 或数据库设计问题。
3. 如果接口字段会被前端或 solver 使用，改动前先定位调用方。

## 2. API 契约规则

1. 请求参数、响应字段、错误结构变更时，必须同步检查：
   - `frontend/src/services/`
   - `frontend/src/types/`
   - 使用该接口的页面或组件
2. 不要在没有版本说明或兼容处理的情况下删除已有响应字段。
3. 需要兼容旧逻辑时，优先新增字段或保留旧字段读取路径，不要直接替换。
4. 时间字段、ID 字段、状态字段必须保持语义稳定；不要为临时修复重载字段含义。

## 3. 数据库与排程真源

1. `shift_plan_id` 是班次关联真源；不要用 `shift_code` 驱动核心业务判断。
2. 区分状态语义：
   - `plan_status` 是批次生命周期
   - `plan_state` 是班次计划状态
   - `result_state` / `status` 是求解结果或求解任务状态
3. `BigInt` 字段必须在 API 层安全序列化。
4. 变更 SQL、表结构、写入逻辑时，必须说明：
   - 需要执行哪个 migration 命令
   - 是否影响历史数据读取
   - 是否引入冗余字段或新的数据分叉
5. 不允许通过静默回填、默默兜底默认值来掩盖数据库设计冲突。

## 4. 实现约束

1. Controller 保持薄，业务判断放进 service。
2. 对复杂查询或组装逻辑，优先抽独立 helper/service，而不是把多层拼装塞进 controller。
3. 涉及排程、锁定、发布、应用结果等高风险流程时，不要用“先删再插”破坏保留数据，尤其是 locked 数据。
4. 出错路径必须保留可诊断信息；不要只返回模糊的 `500` 文本。

## 5. Backend 验证

至少执行：

- `cd backend && npm run build`

按改动补充：

- `cd backend && npm test`
- 相关脚本校验
- 若影响前端调用，补前端 build
- 若影响 V4 装配或应用逻辑，补 `scripts/verify_v4_archive.sh`

如果改动属于运行时需要重新加载才生效的类型，按 `codex-runtime-restart-rules.md` 重启 backend，必要时同步重启联动服务。

交付时明确写出已运行命令、未运行命令和残余风险。
