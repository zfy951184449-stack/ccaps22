# Codex Harness

`MFG8APS` 的 Codex harness 用于把一次实现类需求拆成固定角色和阶段，而不是依赖单个 Codex 对话线程长期保持上下文。

## 入口

- 用户入口：Codex App
- 触发方式：全局 skill `mfg8aps-harness`
- repo 内入口：`scripts/codex_harness_entry.sh "<任务描述>"`
- manager：`python3 harness/manager.py --task "<任务描述>"`
- 恢复：`python3 harness/manager.py --resume <run-id>`

## 架构

1. Codex App 接收用户需求。
2. `mfg8aps-harness` skill 将任务路由到 repo 内 wrapper。
3. wrapper 校验仓库根目录和 Codex 登录态，然后启动 `harness/manager.py`。
4. manager 依次调用：
   - planner：生成结构化 `plan.json` 和 `spec.md`
   - generator：按 spec 改代码并输出实现报告
   - evaluator：按固定验证路由执行检查并输出 `evaluation.json`
5. 如果 evaluator 返回 `fail` 且还有轮次预算，manager 自动回流到下一轮 generator。
6. 最终结果写入工件目录，并在 Codex 主线程打印阶段摘要和结论。

## 工件目录

每次运行固定写入：

- `docs/exec-plans/active/harness-runs/<run-id>/user_prompt.md`
- `plan.json`
- `spec.md`
- `implementation_log.md`
- `evaluation.json`
- `qa_report_round_N.md`
- `run_state.json`
- `timeline.jsonl`
- `final_summary.md`

这些文件用于：

- 断点恢复
- 问题复盘
- 审计和追踪
- 向 evaluator 回灌上一轮缺陷

## 状态机

- `planning`
- `implementing`
- `evaluating`
- `needs_fix`
- `done`
- `blocked`

说明：

- V1 只支持按 phase 恢复，不恢复中途中断的单次 agent turn。
- 默认允许 1 次初始实现 + 2 次修复回流，总计最多 3 次 generator 尝试。

## 验证路由

manager 按变更路径自动选择验证命令：

- `backend/`：`npm run build`；逻辑层改动再跑 `npm run test:ci`
- `frontend/`：`npm run build`；交互/状态改动再跑 `npm run test:ci`
- `frontend-next/`：`npm run build`、`npm run test:ci`；UI 入口改动且 Playwright 浏览器可用时再跑 `npm run e2e`
- `solver_v4/`：`python3 -m unittest discover -s tests`
- `AGENTS.md` / `.agent/` / `docs/`：`scripts/lint_agent_docs.sh`

## 运行约束

- 新建 run 默认要求 git worktree 干净，避免把历史未提交改动和 harness 结果混在一起。
- 如确有需要，可手动使用 `--allow-dirty` 启动新 run。
- child Codex worker 会继承 `MFG8APS_HARNESS_ACTIVE=1`，以避免全局 skill 递归重入。

## 升级路径

当前版本复用本机 `codex exec` 和已有登录态。

如果后续需要：

- 更强的实时 trace
- 跨进程/跨机器 orchestration
- 更完整的 UI 控制台

可以保留现有工件协议不变，把 manager 升级为：

- Codex App Server 客户端
- Agents SDK + API key
