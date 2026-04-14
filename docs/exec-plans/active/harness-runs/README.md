# Harness Runs

这个目录仅保留历史工件。

当前仓库已经下线 in-repo harness，旧 manager 和对应入口脚本都不再是受支持能力。

- 每个历史 run 仍使用独立 `<run-id>/`
- 这些工件只用于审计、复盘和历史参考
- 不要再把这个目录当作新的运行输出位置或可恢复入口

如果需要保留一次运行的结果，请显式复制或整理到 `docs/exec-plans/active/` 或 `completed/` 的版本化计划中。
