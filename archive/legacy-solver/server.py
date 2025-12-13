#!/usr/bin/env python3
"""求解器门面 - 统一使用模块化核心求解器。

保持原有 `_build_assignments` 接口，以兼容 `app.py` 和后端代理。
"""
from __future__ import annotations

from typing import Dict

from core.solver import build_assignments_unified


def _build_assignments(payload: Dict) -> Dict:
    """向后兼容的封装，直接调用模块化求解器。"""
    return build_assignments_unified(payload)


# 兼容旧调用名
_build_assignments_unified = build_assignments_unified
