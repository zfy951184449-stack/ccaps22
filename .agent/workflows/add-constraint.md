---
description: How to add a new constraint module to the V4 solver
---

# 新增约束模块

## 1. 创建约束文件
// turbo
```bash
cp solver_v4/constraints/base.py /dev/null  # 仅确认路径存在
```
在 `solver_v4/constraints/` 下新建 `your_constraint_name.py`，使用以下模板：

```python
"""
[约束名] Constraint
目标：[一句话]
Config 开关：enable_your_constraint (默认 True)
"""
from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext

class YourConstraintName(BaseConstraint):
    name = "YourConstraintName"

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        index = ctx.index
        # shift_assignments = ctx.shift_assignments  # if needed
        config = data.config or {}
        count = 0
        # ... 约束逻辑 ...
        self.log(f"Added {count} constraints")
        return count
```

## 2. 注册到 solver.py
在 `solver_v4/core/solver.py` 的 `_apply_constraints()` 方法中添加（ctx 已在方法开头构建）：

```python
from constraints.your_constraint_name import YourConstraintName
your_count = 0
if config.get("enable_your_constraint", True):
    your_count = YourConstraintName(logger=logger).apply(ctx, req)
```

## 3. 前端配置（可选）
在 `frontend/src/components/SolverV4/SolverConfigurationModal.tsx`：
1. `SolverConfig` interface 加 `enable_your_constraint: boolean;`
2. `DEFAULT_SOLVER_CONFIG` 加 `enable_your_constraint: true,`
3. JSX 中加 Switch 组件

## 4. 验证
// turbo-all
```bash
cd solver_v4 && python3 -c "import py_compile; py_compile.compile('constraints/your_constraint_name.py', doraise=True); print('OK')"
```
```bash
cd solver_v4 && python3 -m pytest tests/ -v
```
```bash
lsof -ti:5005 | xargs kill -9 2>/dev/null; sleep 1; cd solver_v4 && python3 app.py
```
