"""
core/hint_provider.py — solution hint 来源 + 注入（软 hint，绝不 fix）

设计依据：10_solver_design.md §4（D5 最高优先），20_IMPLEMENTATION_PLAN.md §1.6。

铁律（违反即回归破坏）：
  - 只 `model.AddHint(v, 1)`，绝不 `fix_variables_to_their_hinted_value=True`；
  - 绝不基于 hint 加任何硬约束（无 model.Add(...)）；
  - apply_hint 入口 try/except 大包围，任何异常静默降级为「无 hint」，绝不向上抛出；
  - 缺失变量 `.get()→None→跳过`（跨输入失配天然安全）。

来源双层兜底：
  1（首选）resolve_hint：优先 config.hint.previous_solution（backend 注入）；
  2（兜底）greedy_hint：无上次解时按负载最低候选生成贪心 hint。
"""

from typing import Any, Dict, List, Optional, Tuple

try:
    from utils.logger import get_logger
    logger = get_logger("Hint")
except Exception:  # pragma: no cover - 退化为标准 logging，绝不因日志失败影响求解
    import logging
    logger = logging.getLogger("Hint")


def _as_int_triple(item: Any, keys: Tuple[str, str, str]) -> Optional[Tuple[int, int, int]]:
    """
    将一条 hint 记录规整为 (int, int, int)。

    既容忍 dict（{op,pos,emp} / {emp,date,shift}），也容忍 list/tuple（[op,pos,emp]）。
    任何不可解析（类型错、缺字段、非整数）一律返回 None → 调用方跳过该条。
    date 这类非整数字段（shift hint 的中间元素）保留原值，由调用方按 vars_bundle 键决定。
    """
    try:
        if isinstance(item, dict):
            a, b, c = item.get(keys[0]), item.get(keys[1]), item.get(keys[2])
        elif isinstance(item, (list, tuple)) and len(item) >= 3:
            a, b, c = item[0], item[1], item[2]
        else:
            return None
        return (a, b, c)
    except Exception:
        return None


def apply_hint(model, vars_bundle, hint: Optional[Dict[str, Any]]) -> int:
    """
    把 hint 中点名、且本次模型存在的变量注入为软 hint。

    Args:
        model:        cp_model.CpModel
        vars_bundle:  含 .assignments / .shift_assignments 两个 dict 的轻量容器
                      - assignments:        {(op:int, pos:int, emp:int): BoolVar}
                      - shift_assignments:  {(emp:int, date:str, shift:int): BoolVar}
        hint:         {"assignments":[{op,pos,emp}...], "shifts":[{emp,date,shift}...]} 或 None

    Returns:
        实际注入的 hint 变量条数（用于日志/可视化）。异常时返回 0。

    安全保障：整段 try/except 包围；任何异常静默降级（退化为无 hint），绝不抛出。
    绝不设置 fix_variables_to_their_hinted_value；绝不加硬约束。
    """
    applied = 0
    try:
        if not hint or not isinstance(hint, dict):
            return 0

        assignments_map = getattr(vars_bundle, "assignments", None) or {}
        shifts_map = getattr(vars_bundle, "shift_assignments", None) or {}

        for item in (hint.get("assignments") or []):
            triple = _as_int_triple(item, ("op", "pos", "emp"))
            if triple is None:
                continue
            v = assignments_map.get((triple[0], triple[1], triple[2]))
            if v is not None:
                model.AddHint(v, 1)  # 软 hint：CP-SAT 仅可行时利用，不可行直接忽略
                applied += 1

        for item in (hint.get("shifts") or []):
            triple = _as_int_triple(item, ("emp", "date", "shift"))
            if triple is None:
                continue
            v = shifts_map.get((triple[0], triple[1], triple[2]))
            if v is not None:
                model.AddHint(v, 1)
                applied += 1

    except Exception as e:
        # 入口大包围：hint 失败必须等同于「无 hint」，不得中断 solve
        logger.warning("hint 注入异常，已静默跳过（退化为无 hint）：%s", e)
        return 0

    # ⛔ 绝不设置 solver.parameters.fix_variables_to_their_hinted_value = True
    # ⛔ 绝不 model.Add(...) 任何基于 hint 的硬约束
    return applied


def greedy_hint(req, vars_bundle) -> Dict[str, List[Dict[str, int]]]:
    """
    兜底贪心 hint：无上次解时生成「候选里当前负载最低且在模型中存在变量」的 assignment hint。

    策略：按 op 的 planned_start 排序；对每个 (op, pos)，在该 position 的候选里
    选当前累计负载最低、且 (op,pos,emp) 在 assignments 变量字典里存在的员工填 hint。
    shift 层不在贪心兜底里生成（保守，避免与 shift 约束冲突造成无效 hint）。

    全程 try/except；任何异常返回空 hint（等同无兜底），绝不抛出。

    Returns:
        {"assignments": [{"op":int,"pos":int,"emp":int}, ...], "shifts": []}
    """
    result: Dict[str, List[Dict[str, int]]] = {"assignments": [], "shifts": []}
    try:
        assignments_map = getattr(vars_bundle, "assignments", None) or {}
        if not assignments_map:
            return result

        load: Dict[int, int] = {}

        def _start_key(op):
            return getattr(op, "planned_start", "") or ""

        ops = sorted(getattr(req, "operation_demands", []) or [], key=_start_key)
        for op in ops:
            op_id = getattr(op, "operation_plan_id", None)
            if op_id is None:
                continue
            for pos in (getattr(op, "position_qualifications", None) or []):
                pos_num = getattr(pos, "position_number", None)
                if pos_num is None:
                    continue
                candidates = list(getattr(pos, "candidate_employee_ids", None) or [])
                # 仅保留模型里实际有变量的候选
                feasible = [
                    emp for emp in candidates
                    if (op_id, pos_num, emp) in assignments_map
                ]
                if not feasible:
                    continue
                # 选当前负载最低；同负载取较小 employee_id 稳定
                best_emp = min(feasible, key=lambda e: (load.get(e, 0), e))
                load[best_emp] = load.get(best_emp, 0) + 1
                result["assignments"].append(
                    {"op": op_id, "pos": pos_num, "emp": best_emp}
                )
    except Exception as e:
        logger.warning("greedy_hint 生成异常，已静默跳过：%s", e)
        return {"assignments": [], "shifts": []}

    return result


def resolve_hint(req, config: Dict[str, Any], vars_bundle) -> Tuple[Dict[str, Any], str]:
    """
    双层兜底解析最终 hint 来源。

    优先级：
      1. config.hint.previous_solution（backend 注入，结构已经后端校验）；
      2. greedy_hint（冷启动兜底）。

    Returns:
        (hint_dict, source)  source ∈ {"previous_solution", "greedy", "none"}

    全程容错：任何异常退回 greedy 或空 hint，绝不抛出。
    """
    try:
        cfg = config or {}
        hint_cfg = cfg.get("hint")
        if isinstance(hint_cfg, dict):
            prev = hint_cfg.get("previous_solution")
            if isinstance(prev, dict) and (prev.get("assignments") or prev.get("shifts")):
                return prev, "previous_solution"
    except Exception as e:
        logger.warning("解析 previous_solution 异常，回退贪心：%s", e)

    try:
        greedy = greedy_hint(req, vars_bundle)
        if greedy.get("assignments") or greedy.get("shifts"):
            return greedy, "greedy"
    except Exception as e:
        logger.warning("greedy_hint 回退异常，退化为无 hint：%s", e)

    return {"assignments": [], "shifts": []}, "none"


class _VarsBundle:
    """
    apply_hint / greedy_hint 所需的轻量变量容器。
    只暴露 assignments 与 shift_assignments 两个 dict，不持有模型其他状态。
    """

    __slots__ = ("assignments", "shift_assignments")

    def __init__(self, assignments=None, shift_assignments=None):
        self.assignments = assignments or {}
        self.shift_assignments = shift_assignments or {}
