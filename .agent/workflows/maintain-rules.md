---
description: How to add, change, or retire agent rules without reintroducing drift
---

# 维护规则体系

当你修改 `AGENTS.md`、`.agent/rules/`、`.agent/workflows/` 或 `docs/` 中与 agent 导航和规则相关的内容时，按这个流程执行。

## 1. 先判断应该改哪里

1. 顶层路由、硬约束、验证矩阵、交付契约：改 `AGENTS.md`
2. 当前可执行规则：改 `.agent/rules/`
3. 手动步骤或操作流程：改 `.agent/workflows/`
4. 持久领域知识、架构地图、语义真源：改 `docs/`

不要把持久知识塞进 rule，也不要把执行规则塞进 `docs/`。

## 2. 质量门槛

1. 只在 `.agent/rules/README.md` manifest 中保留 active rule
2. rule 要短、可路由、可验证，避免大而全手册
3. 能机械检查的要求，优先写进 lint、脚本或测试
4. 文档改动要带回链，避免孤儿文件
5. 删除或迁移旧规则时，要一起清理旧引用和 trigger 面

## 3. 变更检查清单

- 是否选对了承载位置：`AGENTS.md` / rule / workflow / docs
- 是否更新了 `.agent/rules/README.md` 或 `docs/README.md` 的导航
- 如果规则覆盖面发生变化，是否更新了 `docs/agent-rule-coverage-matrix.md`
- 如果前端风格口径发生变化，是否同时更新了 `docs/frontend-visual-language.md` 与 `.agent/rules/codex-frontend-ui-rules.md`
- 是否新增了新的 source-of-truth 文档回链
- 是否删掉了重复或失效文案，而不是只追加一层说明
- 是否需要把 review 反馈沉淀进 lint 或 workflow

## 4. 机械验证

至少运行：

```bash
scripts/lint_agent_docs.sh
```

必要时补充：

```bash
rg -n "run_command|runtime-integrity|or-tool-rules|ortool-rule|ortool-rules|ortool-model" -S . --glob '!scripts/lint_agent_docs.sh'
```

```bash
rg -n "\\.agent/rules/(biopharma-cmo-domain|biopharma-cmo-rules|db-consistency-rules|codex-v4-verification)" -S .
```

## 5. 交付时必须说明

1. 哪些规则/文档被新增、收口、迁移或删除
2. 哪个文件现在是该主题的唯一真源
3. 实际运行了哪些 lint / grep / CI 相关检查
4. 还有哪些质量风险暂时只能靠人工 review
