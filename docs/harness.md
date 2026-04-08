# MFG8APS Harness

`MFG8APS` 的 harness 用于把一次实现类需求拆成固定角色和阶段，而不是依赖单个 LLM 对话线程长期保持上下文。

支持多个 LLM 后端：**claude**（默认）、**codex**、**dryrun**（本地调试）。

## 入口

| 入口方式 | 命令 |
|---|---|
| 推荐入口（后端无关） | `scripts/harness_entry.sh "<任务描述>"` |
| 指定后端 | `scripts/harness_entry.sh --backend claude "<任务描述>"` |
| Codex 兼容入口 | `scripts/codex_harness_entry.sh "<任务描述>"` |
| 直接调用 manager | `python3 harness/manager.py --task "<任务描述>"` |
| 恢复运行 | `python3 harness/manager.py --resume <run-id>` |
| 本地测试（不调 LLM） | `python3 harness/manager.py --dry-run --task "<任务描述>"` |

## 架构

1. 用户通过入口脚本或直接调用 manager 提交任务。
2. wrapper 校验仓库根目录，然后启动 `harness/manager.py`。
3. manager 按状态机依次调用 4 个 worker：

```
planning → reviewing → implementing → evaluating → done/blocked
    ↑           |                           |
    └───replan──┘                           └──repair loop──→ implementing
```

### Worker 职责和模型配置

| Worker | 默认模型 | effort | 权限 | 职责 |
|--------|----------|--------|------|------|
| **planner** | opus | medium | read-only | 分析需求，产出结构化 `plan.json`（含 `file_read_hints`） |
| **reviewer** | opus | medium | read-only | 审查 plan 质量，把关设计合理性，可触发 replan |
| **generator** | opus | high | write | 按 spec 实现代码，产出实现报告 |
| **evaluator** | sonnet | medium | write | 跑验证命令，按 4 条 criteria 打分 |

**设计原则**：planner 和 reviewer 用 opus 确保设计质量（gold in, gold out）；evaluator 主要跑命令和打分，sonnet 够用，节省 token。

### Reviewer 阶段

planner 产出 plan 后，reviewer 审查 4 条标准：
- **SCOPE** — 是否克制，没有 scope creep
- **SPECIFICITY** — acceptance criteria 是否可验证
- **FEASIBILITY** — 文件引用和验证命令是否真实可用
- **SEPARATION** — planner 只说 WHAT，没有 over-specify HOW

reviewer fail → 携带 `replan_guidance` 回到 planner 重做。最多 `max_replan_rounds`（默认 3）次。

### Token 效率设计

**Push 模式（文件摘要注入）**：
- planner 在 `file_read_hints` 中为每个文件指定精准读取指令
- manager 在启动 generator 前预取摘要，写入 `file_excerpts_round_N.json`，注入 generator bundle
- generator 不需要读整个文件，直接从 bundle 里读预蒸馏内容

**禁止重复读系统上下文**：
- `reading_policy.do_not_re_read` 列出 `AGENTS.md`、`.agent/rules/`、`docs/ARCHITECTURE.md`
- 这些文件已在 Claude Code 自动加载的系统 context 中，重读等于两倍 token 消耗

**结构化 grading**：
- evaluator 按 4 条明确 criteria 打分（CORRECTNESS/COMPLETENESS/COHERENCE/SCOPE）
- 主要依赖命令 exit code，不读取大量源文件

## 后端配置

后端在 `harness/config/settings.json` 中配置：

```json
{
  "backend": "claude",
  "claude": {
    "default_model": "opus",
    "workers": {
      "planner":   { "model": "opus",   "reasoning_effort": "medium" },
      "reviewer":  { "model": "opus",   "reasoning_effort": "medium" },
      "generator": { "model": "opus",   "reasoning_effort": "high"   },
      "evaluator": { "model": "sonnet", "reasoning_effort": "medium" }
    }
  }
}
```

### Claude 后端注意事项

- 使用 claude.ai OAuth 认证（不需要 ANTHROPIC_API_KEY）
- 不使用 `--bare` 模式（OAuth 不兼容），AGENTS.md 和 CLAUDE.md 自动加载
- 用 `--permission-mode` 和 `--allowedTools` 控制每个 worker 的权限范围

### Dry-run 模式

```bash
python3 harness/manager.py --dry-run --task "test"
```

走完整状态机但不调任何 LLM。用途：
- 验证 bundle 生成和工件写入逻辑
- 本地调试 settings.json 配置变更
- CI 冒烟测试

## 工件目录

每次运行写入 `docs/exec-plans/active/harness-runs/<run-id>/`：

| 文件 | 内容 |
|------|------|
| `user_prompt.md` | 原始任务描述 |
| `planner_input.json` | planner context bundle |
| `plan.json` | planner 产出（含 file_read_hints） |
| `spec.md` | 人可读的 spec |
| `reviewer_input.json` | reviewer context bundle |
| `review.json` | reviewer 产出 |
| `file_excerpts_round_N.json` | manager 预取的文件摘要 |
| `generator_input_round_N.json` | generator context bundle |
| `generator_round_N.md` | generator 实现报告 |
| `evaluator_input_round_N.json` | evaluator context bundle |
| `evaluation.json` | evaluator 产出 |
| `qa_report_round_N.md` | 人可读的 QA 报告 |
| `implementation_log.md` | 累计实现日志 |
| `timeline.jsonl` | 所有阶段事件的时间线 |
| `run_state.json` | 当前运行状态（断点续跑用） |
| `final_summary.md` | 最终汇总报告 |

## 验证路由

manager 按变更路径自动选择验证命令：

| 变更路径 | 验证命令 |
|---|---|
| `backend/` | `cd backend && npm run build` |
| `backend/src/routes/` 等逻辑层 | + `cd backend && npm run test:ci` |
| `frontend/` | `cd frontend && npm run build` |
| `frontend/src/` | + `cd frontend && npm run test:ci` |
| `frontend-next/` | `cd frontend-next && npm run build && npm run test:ci` |
| `frontend-next/src/app/` 等 UI 层 | + `cd frontend-next && npm run e2e`（需要 Playwright browsers） |
| `solver_v4/` | `cd solver_v4 && python3 -m unittest discover -s tests` |
| `AGENTS.md` / `.agent/` / `docs/` | `scripts/lint_agent_docs.sh` |

## 运行约束

- 新建 run 默认要求 git worktree 干净，避免把历史未提交改动和 harness 结果混在一起
- 可用 `--allow-dirty` 启动；manager 会记录 baseline hashes，只将本次 run 新增变更视为 changed-files
- `MFG8APS_HARNESS_ACTIVE=1` 防止 worker 递归触发 harness

## 升级路径

随着模型能力提升，可逐步简化：

- reviewer 如果 plan 质量持续稳定 → 降低 max_replan_rounds 或关闭
- evaluator 对简单任务可配置跳过（`skip_evaluator_when`）
- effort 可按任务复杂度动态调整

## 相关文件

- `harness/manager.py` — 主 orchestrator，状态机实现
- `harness/backends/` — LLM 后端实现（codex / claude / dryrun）
- `harness/prompts/` — 各 worker 的 prompt 模板
- `harness/schemas/` — JSON Schema 验证文件
- `harness/config/settings.json` — 模型配置、验证路由
- `scripts/harness_entry.sh` — 推荐入口脚本
