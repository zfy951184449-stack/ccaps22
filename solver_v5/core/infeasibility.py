"""
Infeasibility Diagnosis Pass (无解诊断 pass) — S7 / R6 / D6

仅在主求解 status == INFEASIBLE 时触发（可行 / 超时 / 任何有解路径零额外开销，
主模型保持干净、不挂任何 assumption）。开关 config.enable_infeasibility_diagnosis（默认 on）。

方案 B（诊断时重建，10_solver §6.3）：
  - 新建 diag_model = cp_model.CpModel() 与 diag_ctx（diag_ctx.model = diag_model），
    重新走一遍同样的 registry，使**全部** 16 个非关键约束真正落进 diag_model
    → 诊断模型与主模型**同构**。
  - 七个业务关键组在 diag_model 上挂 OnlyEnforceIf(lit)（等价重写：数学与原约束一致，
    仅多挂 literal），再 diag_model.AddAssumptions([七组 lits])。
  - 实现：用 _LiteralTaggingModel 代理包住 diag_model；某组 apply 期间 arm(lit)，
    该期间所有 .Add(...) 自动 .OnlyEnforceIf(lit)（assumption 全 True 时 == 原约束，
    故 lits 全 True 的 diag_model 与主模型逐约束等价 → 同构性回归门禁可过）。

七组 group / lit_key（§1.5 / §6.2 冻结，三方逐字符一致）：
  STANDARD_HOURS / LOCKED_OPERATIONS / CONSECUTIVE_DAYS / SPECIAL_SHIFT_COVERAGE /
  LEADERSHIP_COVERAGE / LOCKED_SHIFTS / POSITION_MUST_FILL
"""

from datetime import datetime, timezone

from ortools.sat.python import cp_model

from contracts.request import SolverRequest
from core.context import SolverContext
from core.index import AssignmentIndex, ShiftIndex
from utils.time_utils import get_date_range
from utils.logger import get_logger

logger = get_logger("Infeasibility")


# ──────────────────────────────────────────────────────────────────────────
# 七组冻结映射（§1.5 / §6.2）。group 字符串三方逐字符一致；config_keys → 跳配置开关。
# lit_key 为诊断用稳定键；solver 端 IIS 命中后据 lit.Index() → lit_key → 本表。
# ──────────────────────────────────────────────────────────────────────────

LITERAL_TO_BUSINESS_TEXT = {
    "lit_hours": {
        "group": "STANDARD_HOURS",
        "lit_key": "lit_hours",
        "message_zh": "工时下限太紧（假期多的月份易撞墙），月度工时上下限无法同时满足。",
        "suggestion_zh": "建议在高级设置放宽月度工时容差（H9 下限 monthly_hours_lower_offset）。",
        "config_keys": ["enable_standard_hours"],
    },
    "lit_locked_op": {
        "group": "LOCKED_OPERATIONS",
        "lit_key": "lit_locked_op",
        "message_zh": "锁定的员工不是对应工序的候选人，无法满足锁定分配。",
        "suggestion_zh": "建议核对锁定工序的强制员工是否仍为该工序候选人，或解除该锁定。",
        "config_keys": ["enable_locked_operations"],
    },
    "lit_consec": {
        "group": "CONSECUTIVE_DAYS",
        "lit_key": "lit_consec",
        "message_zh": "员工连续工作/休息天数超限且无人可替，排班窗口内无法满足。",
        "suggestion_zh": "建议放宽连续工作/休息天数上限，或增加可替换的候选人。",
        "config_keys": ["enable_max_consecutive_work_days", "enable_max_consecutive_rest_days"],
    },
    "lit_special": {
        "group": "SPECIAL_SHIFT_COVERAGE",
        "lit_key": "lit_special",
        "message_zh": "专项班次候选人不足，硬覆盖要求无法满足。",
        "suggestion_zh": "建议增加专项班次候选人，或将该专项需求改为软覆盖（SOFT）。",
        "config_keys": ["enable_special_shift_coverage"],
    },
    "lit_leader": {
        "group": "LEADERSHIP_COVERAGE",
        "lit_key": "lit_leader",
        "message_zh": "存在生产日没有可用领导在岗，领导生产日覆盖无法满足。",
        "suggestion_zh": "建议关闭领导生产日覆盖（enable_leader_production_coverage），或增加领导排班能力。",
        "config_keys": ["enable_leadership_coverage", "enable_leader_production_coverage"],
    },
    "lit_locked_shift": {
        "group": "LOCKED_SHIFTS",
        "lit_key": "lit_locked_shift",
        "message_zh": "锁定班次数据缺失（strict 模式），无法满足锁定班次约束。",
        "suggestion_zh": "建议核对锁定班次数据，或关闭严格锁定班次（strict_locked_shifts）。",
        "config_keys": ["enable_locked_shifts"],
    },
    "lit_fill": {
        "group": "POSITION_MUST_FILL",
        "lit_key": "lit_fill",
        "message_zh": "存在岗位无合格候选人 / 需求超过可用人数，必须有人的岗位无法填满。",
        "suggestion_zh": "建议为相关岗位增加候选人，或在高级设置允许岗位空缺（allow_position_vacancy）。",
        "config_keys": ["allow_position_vacancy"],
    },
}

# 诊断时走「带 literal 等价版」的七个关键约束类名（其余约束走原 apply）。
# 与 §6.2 对应；这些约束类的 hard Add 在诊断模型上整体挂对应 literal。
_KEY_CONSTRAINT_LITERALS = {
    "StandardHours": "lit_hours",
    "LockedOperations": "lit_locked_op",
    "ConsecutiveDays": "lit_consec",
    "SpecialShiftJointCoverage": "lit_special",
    "LeadershipCoverage": "lit_leader",
    "LockedShifts": "lit_locked_shift",
}


# ──────────────────────────────────────────────────────────────────────────
# Literal-tagging CpModel 代理：arm(lit) 期间所有 .Add() 自动 .OnlyEnforceIf(lit)。
# 其余方法（NewBoolVar / NewIntVar / NewConstant / Minimize / AddAssumptions...）
# 透传给真实 diag_model。lit 全 True 时与原约束逐约束等价（同构铁律）。
# ──────────────────────────────────────────────────────────────────────────

class _LiteralTaggingModel:
    """包住真实 cp_model.CpModel，按 _armed_lit 给 Add() 返回的约束挂 OnlyEnforceIf。"""

    def __init__(self, real_model):
        # 用 object.__setattr__ 避免触发 __getattr__/__setattr__ 递归。
        object.__setattr__(self, "_real_model", real_model)
        object.__setattr__(self, "_armed_lit", None)

    def arm(self, lit):
        object.__setattr__(self, "_armed_lit", lit)

    def disarm(self):
        object.__setattr__(self, "_armed_lit", None)

    def Add(self, *args, **kwargs):
        ct = self._real_model.Add(*args, **kwargs)
        lit = self._armed_lit
        if lit is not None and ct is not None:
            try:
                ct.OnlyEnforceIf(lit)
            except Exception:
                # 极少数返回的「平凡约束」可能不支持 OnlyEnforceIf；静默跳过（不破坏同构：
                # 平凡真约束无论 lit 与否都恒真）。
                pass
        return ct

    def __getattr__(self, name):
        # 未显式覆盖的属性/方法一律透传真实 model。
        return getattr(self._real_model, name)


# ──────────────────────────────────────────────────────────────────────────
# 诊断模型重建（同构）+ 求解 + IIS → 七组定位。
# ──────────────────────────────────────────────────────────────────────────

def _build_diag_variables(diag_model, tagger, req, config, lit_fill):
    """在 diag_model 上重建变量层，与 solver._build_variables 逐字节同构。

    POSITION_MUST_FILL 的「不许空岗」Add(sum==1) 整体挂 lit_fill（其余结构 Add 不挂）。
    返回 (assignments, vacancy_vars, shift_assignments, special_cover_vars,
          special_shortage_vars, index, shift_index)，或在「无候选且不允许空缺」时返回 None
    （主求解会走早退 INFEASIBLE，诊断不会被触发；此处仅为防御性对齐）。
    """
    assignments = {}
    vacancy_vars = {}
    special_cover_vars = {}
    special_shortage_vars = {}
    mandatory_ops = set(config.get("mandatory_operation_ids", []))

    for op in req.operation_demands:
        for pos in op.position_qualifications:
            for emp_id in pos.candidate_employee_ids:
                assignments[(op.operation_plan_id, pos.position_number, emp_id)] = \
                    diag_model.NewBoolVar(
                        "DAssign_Op%s_Pos%s_Emp%s" % (op.operation_plan_id, pos.position_number, emp_id))

            candidates_vars = [
                assignments[(op.operation_plan_id, pos.position_number, emp_id)]
                for emp_id in pos.candidate_employee_ids
            ]

            is_standalone = getattr(op, "source_type", "BATCH") == "STANDALONE"
            if is_standalone:
                allow_vacancy_cfg = config.get("allow_standalone_vacancy", True)
            else:
                allow_vacancy_cfg = config.get("allow_position_vacancy", False)

            if candidates_vars:
                is_mandatory = op.operation_plan_id in mandatory_ops
                allow_vacancy = allow_vacancy_cfg and not is_mandatory
                if allow_vacancy:
                    diag_model.Add(sum(candidates_vars) <= 1)
                    var_vacant = diag_model.NewBoolVar(
                        "DVacant_Op%s_Pos%s" % (op.operation_plan_id, pos.position_number))
                    diag_model.Add(sum(candidates_vars) == 0).OnlyEnforceIf(var_vacant)
                    diag_model.Add(sum(candidates_vars) >= 1).OnlyEnforceIf(var_vacant.Not())
                    vacancy_vars[(op.operation_plan_id, pos.position_number)] = var_vacant
                else:
                    # POSITION_MUST_FILL：不许空岗的硬等式，经 tagger 挂 lit_fill。
                    # 必须走 tagger.Add（而非 diag_model.Add）才会附 OnlyEnforceIf(lit_fill)。
                    tagger.arm(lit_fill)
                    tagger.Add(sum(candidates_vars) == 1)
                    tagger.disarm()
            else:
                if allow_vacancy_cfg:
                    var_vacant = diag_model.NewConstant(1)
                    vacancy_vars[(op.operation_plan_id, pos.position_number)] = var_vacant
                else:
                    # 主求解此分支会早退 INFEASIBLE（不触诊断），防御性返回 None。
                    return None

    index = AssignmentIndex(assignments)

    shift_assignments = {}
    shift_index = None
    if req.window and req.shift_definitions:
        shift_index = ShiftIndex(req)
        dates = get_date_range(req.window["start_date"], req.window["end_date"])
        all_employees = _shift_relevant_employee_ids(req, index)
        for date in dates:
            for emp_id in all_employees:
                for shift in req.shift_definitions:
                    shift_assignments[(emp_id, date, shift.shift_id)] = \
                        diag_model.NewBoolVar(
                            "DAssign_Shift_%s_%s_%s" % (emp_id, date, shift.shift_id))

    for requirement in req.special_shift_requirements:
        special_shortage_vars[requirement.occurrence_id] = diag_model.NewIntVar(
            0, requirement.required_people,
            "DSpecialShortage_%s" % requirement.occurrence_id)
        candidate_ids = [
            c.employee_id for c in getattr(requirement, "candidates", [])
        ] or list(requirement.eligible_employee_ids)
        for employee_id in candidate_ids:
            key = (requirement.occurrence_id, employee_id)
            special_cover_vars[key] = diag_model.NewBoolVar(
                "DSpecialCover_%s_Emp%s" % (requirement.occurrence_id, employee_id))

    return (assignments, vacancy_vars, shift_assignments,
            special_cover_vars, special_shortage_vars, index, shift_index)


def _shift_relevant_employee_ids(req, index):
    """与 solver._shift_relevant_employee_ids 同构（避免实例化 SolverV5 即可调用）。"""
    from constraints.leadership_coverage import LEADER_ROLES
    emps = set(index.get_all_employees())
    emps |= {ep.employee_id for ep in req.employee_profiles
             if getattr(ep, "org_role", "FRONTLINE") in LEADER_ROLES}
    for r in req.special_shift_requirements:
        emps |= set(getattr(r, "eligible_employee_ids", None) or [])
        emps |= {c.employee_id for c in (getattr(r, "candidates", None) or [])}
    for lo in req.locked_operations:
        emps |= set(getattr(lo, "enforced_employee_ids", None) or [])
    emps |= {ls.employee_id for ls in req.locked_shifts}
    emps |= {fs.employee_id for fs in req.frozen_shifts}
    emps |= {fa.employee_id for fa in req.frozen_assignments}
    return emps


def build_diag_model(req: SolverRequest, config: dict):
    """重建同构诊断模型，七组挂 literal + AddAssumptions。

    Returns:
        (diag_model, lit_index_to_key) — diag_model 已 AddAssumptions(七组 lits)；
        lit_index_to_key: {lit.Index(): lit_key} 供 IIS 反查。
        若变量层早退（无候选且不许空缺），返回 (None, {})。
    """
    diag_model = cp_model.CpModel()
    tagger = _LiteralTaggingModel(diag_model)

    # 七组 assumption literal（一律 True；IIS 找最小需翻 False 子集）。
    lits = {}
    for lit_key in ("lit_hours", "lit_locked_op", "lit_consec", "lit_special",
                    "lit_leader", "lit_locked_shift", "lit_fill"):
        lits[lit_key] = diag_model.NewBoolVar(lit_key)
    lit_index_to_key = {lits[k].Index(): k for k in lits}

    # 变量层（含 POSITION_MUST_FILL lit_fill）。
    built = _build_diag_variables(diag_model, tagger, req, config, lits["lit_fill"])
    if built is None:
        return None, {}
    (assignments, vacancy_vars, shift_assignments,
     special_cover_vars, special_shortage_vars, index, shift_index) = built

    # diag_ctx.model = tagger（代理）。约束类内 ctx.model.Add(...) 会经代理；
    # 非关键约束期间 tagger 未 arm → 等同直接落 diag_model（同构）。
    diag_ctx = SolverContext(
        model=tagger,
        assignments=assignments,
        index=index,
        shift_assignments=shift_assignments or {},
        shift_index=shift_index,
        vacancy_vars=vacancy_vars or {},
        special_cover_vars=special_cover_vars or {},
        special_shortage_vars=special_shortage_vars or {},
        config=config,
    )

    from constraints.registry import CORE_CONSTRAINTS, SHIFT_CONSTRAINTS

    def _run(cls):
        enabled = config.get(cls.config_key, cls.default_enabled) if cls.config_key else True
        if not enabled:
            return
        lit_key = _KEY_CONSTRAINT_LITERALS.get(cls.name)
        if lit_key is not None:
            tagger.arm(lits[lit_key])
        try:
            cls(logger=logger).apply(diag_ctx, req)
        finally:
            tagger.disarm()

    for cls in CORE_CONSTRAINTS:
        _run(cls)

    if shift_assignments:
        for cls in SHIFT_CONSTRAINTS:
            _run(cls)

    # 目标函数无关诊断可行性，不重建（诊断只判可行/不可行）。
    diag_model.AddAssumptions(list(lits.values()))
    return diag_model, lit_index_to_key


def diagnose(req: SolverRequest, config: dict, callback=None):
    """无解诊断 pass 入口。仅在主求解 INFEASIBLE 时调用。

    Returns:
        infeasibility dict（实时路径 schema）：
          {"located": bool, "groups": [ {group, lit_key, message_zh, suggestion_zh, config_keys}, ... ]}
        异常时返回 located=False、空 groups（回退通用建议）。
    """
    result = {"located": False, "groups": []}
    try:
        diag_model, lit_index_to_key = build_diag_model(req, config)
        if diag_model is None:
            return result

        diag_solver = cp_model.CpSolver()
        diag_solver.parameters.max_time_in_seconds = float(config.get("diag_time_seconds", 30))
        # 诊断求解单线程足够（小问题 + 找最小 IIS），避免与主线程争核。
        diag_solver.parameters.num_workers = 1

        status = diag_solver.Solve(diag_model)

        if status == cp_model.INFEASIBLE:
            lit_indices = diag_solver.SufficientAssumptionsForInfeasibility()
            seen_groups = set()
            groups = []
            for idx in lit_indices:
                lit_key = lit_index_to_key.get(idx)
                if lit_key is None:
                    continue
                entry = LITERAL_TO_BUSINESS_TEXT.get(lit_key)
                if entry is None or entry["group"] in seen_groups:
                    continue
                seen_groups.add(entry["group"])
                groups.append(dict(entry))
            if groups:
                result["located"] = True
                result["groups"] = groups
        # status 为 FEASIBLE/OPTIMAL：七组外原因 → located=False（回退通用建议）。
        # status 为 UNKNOWN（诊断超时）：保持 located=False。

    except Exception as exc:  # 诊断绝不影响主结果：任何异常静默降级。
        logger.warning("无解诊断 pass 异常，回退通用建议：%s", exc)
        return {"located": False, "groups": []}

    return result


def build_infeasibility_analysis(infeasibility: dict):
    """实时 infeasibility → result 落库路径 infeasibility_analysis（§6.5）。

    组项字段集与实时路径完全相同（group/lit_key/message_zh/suggestion_zh/config_keys
    + 可选 related_*），仅外层键名/数组名不同。
    """
    located = bool(infeasibility.get("located", False)) if infeasibility else False
    groups = list(infeasibility.get("groups", [])) if infeasibility else []
    return {
        "is_infeasible": True,
        "located": located,
        "diagnosed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "minimal_conflict_groups": groups,
    }
