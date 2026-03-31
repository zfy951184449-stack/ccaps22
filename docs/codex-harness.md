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
   - planner：读取 `planner_input.json`，生成 `plan.json`（含 `file_read_hints`）和 `spec.md`
   - manager（在启动 generator 前）：根据 `file_read_hints` 预取文件摘要，写入 `file_excerpts_round_N.json`，注入 `generator_input_round_N.json`
   - generator：从 context bundle 的 `file_excerpts` 直接读取预蒸馏内容并改代码，禁止重复读 `AGENTS.md` 等系统上下文文件
   - evaluator：读取 `evaluator_input_round_N.json`，按 4 条 grading criteria 打分并输出 `evaluation.json`
5. 如果 evaluator 返回 `fail` 且还有轮次预算，manager 自动回流到下一轮 generator。
6. 最终结果写入工件目录，并在 Codex 主线程打印阶段摘要和结论。

## 工件目录

每次运行固定写入：

- `docs/exec-plans/active/harness-runs/<run-id>/user_prompt.md`
- `plan.json`（含 `file_read_hints`：planner 指定的文件读取指令）
- `spec.md`
- `planner_input.json`
- `file_excerpts_round_N.json`（manager 预取的文件摘要）
- `generator_input_round_N.json`（含 `file_excerpts` 和 `reading_policy`）
- `evaluator_input_round_N.json`（含 `grading_policy`）
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

## Token 效率设计

这是 harness V2 最核心的变化，解决 input token 过高的问题：

### Push 模式（文件摘要注入）

planner 在 `file_read_hints` 字段中为每个 `files_of_interest` 指定精准读取指令（strategy: head/grep/rg + max_lines + pattern）。manager 在启动 generator 前，按这些指令预取文件摘要并注入 bundle。

**效果**：generator 不再需要 `sed -n '1,220p' largefile.ts`，直接从 bundle 里读已蒸馏好的内容。

### 禁止重复读系统上下文

manager 在 generator bundle 的 `reading_policy.do_not_re_read` 字段中明确列出：`AGENTS.md`、`.agent/rules/`、`docs/ARCHITECTURE.md`。

这些文件通过 `codex exec --cd REPO_ROOT` 已经注入系统 context，重复 `sed` 读取等同于在 input 里把它们塞两遍。

### 结构化 grading criteria

evaluator 按 4 条明确 criteria 打分（CORRECTNESS / COMPLETENESS / COHERENCE / SCOPE），主要依赖命令 exit code，而不是阅读源文件内容。

## 运行约束

- 新建 run 默认要求 git worktree 干净，避免把历史未提交改动和 harness 结果混在一起。
- 如确有需要，可手动使用 `--allow-dirty` 启动新 run；manager 会记录启动时的 dirty baseline，只将本次 run 新增或进一步修改的文件视为 changed-files。
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
