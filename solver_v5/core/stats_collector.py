"""
StatsCollector — 约束计时 / 计数采集器（S2 工单）

铁律：不修改任何约束类。在 solver.py 的 registry 调用处包一层 measure() 上下文。
Python 3.9 兼容：contextmanager 来自 contextlib，无 3.10+ 语法。
"""

import os
import time
from contextlib import contextmanager
from typing import Dict, Any, Optional


class StatsCollector:
    """
    模型规模 / 约束统计采集器。

    用法（solver._apply_constraints 内）：
        collector = StatsCollector()
        with collector.measure(cls.name):
            count = cls(...).apply(ctx, req)
        collector.record(cls.name, count)
        # 或关闭时：
        collector.record(cls.name, "OFF")
        # 全部约束跑完后：
        collector.set_layers(...)
        payload = collector.to_payload()
    """

    def __init__(self):
        # { name -> {"count": int|"OFF", "ms": float, "vars": int} }
        self._by_constraint: Dict[str, Dict[str, Any]] = {}
        self._layers: Dict[str, int] = {}
        self._last_ms: float = 0.0
        # 总变量数（assignment+shift+vacancy+special+placement）
        self._num_vars: int = 0

    # ------------------------------------------------------------------
    # 计时上下文管理器
    # ------------------------------------------------------------------

    @contextmanager
    def measure(self, name: str):
        """包裹 apply() 调用，记录 wall-time（time.perf_counter）。"""
        t0 = time.perf_counter()
        try:
            yield
        finally:
            self._last_ms = (time.perf_counter() - t0) * 1000.0

    # ------------------------------------------------------------------
    # 结果记录
    # ------------------------------------------------------------------

    def record(self, name: str, count):
        """
        记录约束 name 的结果。
        count: int（启用时的约束条数）或 "OFF"（禁用）。
        """
        if count == "OFF":
            self._by_constraint[name] = {"count": "OFF", "ms": 0.0, "vars": 0}
        else:
            self._by_constraint[name] = {
                "count": count,
                "ms": round(self._last_ms, 2),
                "vars": 0,   # 由 set_layers 后在 to_payload() 时按层对齐
            }

    # ------------------------------------------------------------------
    # 变量分层规模
    # ------------------------------------------------------------------

    def set_layers(
        self,
        num_assignments: int = 0,
        num_shift: int = 0,
        num_vacancy: int = 0,
        num_special_cover: int = 0,
        num_special_shortage: int = 0,
        num_task_placement: int = 0,
        num_vars: Optional[int] = None,
    ):
        """
        记录变量分层规模，供 to_payload() 的 by_layer 字段使用。
        num_vars 若不传，则自动求和各层作为 num_vars。
        """
        self._layers = {
            "assignments":      num_assignments,
            "shift":            num_shift,
            "vacancy":          num_vacancy,
            "special_cover":    num_special_cover,
            "special_shortage": num_special_shortage,
            "task_placement":   num_task_placement,
        }
        if num_vars is not None:
            self._num_vars = num_vars
        else:
            self._num_vars = sum(self._layers.values())

    # ------------------------------------------------------------------
    # 输出 payload
    # ------------------------------------------------------------------

    def to_payload(self) -> dict:
        """
        返回符合冻结契约 model_stats schema 的 dict。
        num_constraints = Σ by_constraint[*].count（"OFF" 计 0）。
        """
        num_constraints = sum(
            v["count"] if v["count"] != "OFF" else 0
            for v in self._by_constraint.values()
        )

        payload: Dict[str, Any] = {
            "num_vars":        self._num_vars,
            "num_constraints": num_constraints,
            "by_layer":        dict(self._layers),
            "by_constraint":   dict(self._by_constraint),
        }

        # presolve 可选：仅 SOLVER_DEBUG=1 时由外部调 set_presolve() 填入
        if hasattr(self, "_presolve") and self._presolve:
            payload["presolve"] = self._presolve

        return payload

    def set_presolve(self, vars_before: int, vars_after: int,
                     ctrs_before: int, ctrs_after: int):
        """仅 SOLVER_DEBUG=1 时调用，解析 CP-SAT presolve 摘要后填入。"""
        self._presolve = {
            "vars_before":  vars_before,
            "vars_after":   vars_after,
            "ctrs_before":  ctrs_before,
            "ctrs_after":   ctrs_after,
        }

    # ------------------------------------------------------------------
    # 辅助
    # ------------------------------------------------------------------

    @property
    def num_vars(self) -> int:
        return self._num_vars

    @property
    def by_constraint(self) -> dict:
        return dict(self._by_constraint)
