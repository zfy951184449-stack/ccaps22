# Harness Runs

这个目录保存由 `harness/manager.py` 生成的运行工件。

- 每个 run 使用独立 `<run-id>/`
- 运行工件默认不纳入 git 跟踪
- 目录内容用于恢复、审计、复盘和 evaluator 回流

如果需要保留一次运行的结果，请显式复制或整理到 `docs/exec-plans/active/` 或 `completed/` 的版本化计划中。
