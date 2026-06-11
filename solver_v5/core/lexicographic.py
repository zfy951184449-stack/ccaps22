"""
lexicographic L4 第二阶段（S6，D5 次优先，**默认关**）

设计权威：10_solver_design §5（§5.2 两阶段 Clone / §5.3 C 常量动态上界 /
§5.4 超时预算 / §5.5 失败安全回退）+ 实施计划 §1.6 config 键。

核心算法（§5.2）：
  阶段一：与 V4 完全相同的单层加权求解，得 objective_value v* 和最优解 S1。
  阶段二（仅 enable_lexicographic_l4 且 status1==OPTIMAL 且有时间预算）：
    phase2_model = phase1_model.Clone()           # 保留变量 proto 索引
    锁死 L0-L3：
      Add(obs_special_shortage == v_special_shortage)   # O0 ==
      Add(obs_vacancy          == v_vacancy)            # O1 ==
      Add(obs_total            <= v*)                   # L3 总目标不劣（<= 给 L4 腾挪）
    重定目标：Minimize(C3·O3 + C4·O4 + C5·O5 + C6·O6 + C7·O7 + C8·O8)   # §5.3 量级隔离
    phase2_solver = CpSolver()（重用 phase-1 参数）
    status2 ∈ {OPTIMAL, FEASIBLE} 且锁定校验通过 → 采用 S2；否则回退 S1（§5.5）。

铁律：
  · 默认 off：enable_lexicographic_l4 缺省 False → 完全不进本模块，V5 == V4。
  · 失败任意环节回退 S1，phase2_solver 废弃，明确切回 phase1_solver 读值（§5.5）。
  · 统一 Clone()，绝不在新 CpModel 上重建变量（§5.2）。
  · obs_total 必须在 phase-1 建好（enable_objective_breakdown=True）；否则无法进 phase-2。

Python 3.9 兼容（无 match、无 X|Y 运行时注解）。
"""

import logging
from typing import Dict, List, Optional, Tuple

from ortools.sat.python import cp_model

logger = logging.getLogger("lexicographic")

# L4 次级分量（§5.3，按优先级从高到低；C3 >> C4 >> ... >> C8）。
# 与 breakdown.BREAKDOWN_KEYS 的 O3..O8 一一对应。
L4_KEYS = [
    "hours_deviation_scaled",  # O3 —— 最高优先 L4 分量
    "special_shift_count",     # O4
    "night_shift_variance",    # O5
    "weekend_work_variance",   # O6
    "triple_salary_count",     # O7
    "leadership_penalty",      # O8 —— 最低优先
]

# C·UB 估算安全上限（§5.3）：超过即降级为 O5+O6 等权近似，避免整数溢出 / LP 精度退化。
_MAGNITUDE_CEILING = 10 ** 15


def map_var_to_clone(clone_model, phase1_var):
    """把 phase-1 变量映射到 clone 上的对应变量（按 proto 索引，§5.2 Clone 保留索引）。

    OR-Tools 9.15：CpModel.Clone() 保留变量 proto 索引，
    GetIntVarFromProtoIndex(idx) 取回 clone 里的同位变量。
    """
    return clone_model.GetIntVarFromProtoIndex(phase1_var.Index())


def _compute_ub(key, employee_count, day_count):
    """按输入规模（员工数 E、排班天数 D）粗略估每个 L4 分量的上界 UB_k（§5.3）。

    只需「足够大但不爆炸」的保守上界用于量级隔离常量累乘，无需精确。
    所有估值取整、最小为 1（避免 0 让累乘塌缩）。
    """
    E = max(1, int(employee_count))
    D = max(1, int(day_count))
    if key == "hours_deviation_scaled":
        # O3 在 30 人规模可达 ~5e5（设计文档原话）；按 E·D·缩放给宽松上界。
        return E * D * 4000
    if key == "special_shift_count":
        # 专项班次数：≤ E·D。
        return E * D
    if key == "night_shift_variance":
        # 夜班次数方差和：每人夜班次数 ≤ D，平方 ≤ D²，求和 ≤ E·D²。
        return E * D * D
    if key == "weekend_work_variance":
        return E * D * D
    if key == "triple_salary_count":
        # 三倍薪次数：≤ E·D。
        return E * D
    if key == "leadership_penalty":
        # 领导参与惩罚：≤ E·D（保守）。
        return E * D
    return E * D


def compute_proxy_coefficients(employee_count, day_count):
    """计算 L4 代理目标的量级隔离常量 C_k（§5.3，从末位往前累乘）。

    C_k = prod(UB_{k+1} .. UB_n) + 1，保证高位分量被压到最小前低位无法翻盘。
    返回 (coeffs_dict{key->C_k}, degrade_to_o5o6:bool, max_estimate:int)。

    若任一 C_k · UB_k 估算超 _MAGNITUDE_CEILING → degrade_to_o5o6=True
    （调用方改用 O5+O6 等权近似，§5.3）。
    """
    ubs = {key: max(1, int(_compute_ub(key, employee_count, day_count))) for key in L4_KEYS}

    coeffs: Dict[str, int] = {}
    running = 1  # prod(UB_{k+1}..UB_n)
    # 从末位（最低优先）往前累乘。
    for key in reversed(L4_KEYS):
        coeffs[key] = running + 1
        running = running * ubs[key]

    # 估算最坏量级：每项 C_k·UB_k 的最大值。
    max_estimate = 0
    for key in L4_KEYS:
        est = coeffs[key] * ubs[key]
        if est > max_estimate:
            max_estimate = est

    degrade = max_estimate > _MAGNITUDE_CEILING
    return coeffs, degrade, max_estimate


def _build_proxy_objective(phase2_model, clone_obs, employee_count, day_count, callback):
    """在 clone 上构建 L4 代理目标（§5.3）。返回 degrade 标志（仅供日志/测试）。

    clone_obs: dict{key -> clone 里对应的 L4 观测变量}（已映射）。
    正常：Minimize(Σ C_k · obs_k)；量级超限：降级 Minimize(O5 + O6) 等权（§5.3）。
    """
    coeffs, degrade, max_estimate = compute_proxy_coefficients(employee_count, day_count)

    if degrade:
        msg = (
            "L4 代理目标量级估算 %d 超安全上限 %d，降级为 O5+O6（夜班/周末方差）等权近似"
            % (max_estimate, _MAGNITUDE_CEILING)
        )
        logger.info(msg)
        if callback is not None:
            try:
                callback.log_metric("L4降级", msg)
            except Exception:
                pass
        terms = []
        for key in ("night_shift_variance", "weekend_work_variance"):
            if key in clone_obs:
                terms.append(clone_obs[key])
        if terms:
            phase2_model.Minimize(sum(terms))
        return True

    terms = []
    for key in L4_KEYS:
        if key in clone_obs:
            terms.append(coeffs[key] * clone_obs[key])
    if terms:
        phase2_model.Minimize(sum(terms))
    return False


def run_phase2(solver_obj, req, config, callback,
               phase1_status, phase1_solver):
    """lexicographic 第二阶段编排（§5.2 / §5.4 / §5.5）。

    入参：
      solver_obj    —— SolverV5 实例（持 self.model / self.breakdown）。
      req/config    —— 求解请求与配置。
      callback      —— phase-1 callback（用于 reset_phase2 + 日志）；可为 None。
      phase1_status —— phase-1 求解状态（cp_model 常量）。
      phase1_solver —— phase-1 的 CpSolver（回退/读值用）。

    返回 (use_phase2: bool, phase2_solver_or_None)：
      · use_phase2=True  → 采用 phase-2 解，调用方用 phase2_solver 做 _extract_solution(solver_override=phase2_solver)。
      · use_phase2=False → 回退 S1，调用方用 phase1_solver 提取（§5.5，与 V4 逐字节一致）。

    任何异常/超时/锁定校验失败一律回退 S1（绝不返回比 V4 差的解）。
    """
    try:
        # ── 进入门槛（§5.2 / §5.5）──
        if not bool(config.get("enable_lexicographic_l4", False)):
            return False, None
        # 仅 status1 == OPTIMAL 才进 phase-2（FEASIBLE 超时解不进，§5.5 边界）。
        if phase1_status != cp_model.OPTIMAL:
            return False, None

        breakdown = getattr(solver_obj, "breakdown", None)
        if breakdown is None or not getattr(breakdown, "enabled", False):
            # obs_total / 分量观测变量缺失（enable_objective_breakdown 关）→ 无法锁定，跳过。
            logger.info("lex phase-2 跳过：未建 breakdown 观测变量（enable_objective_breakdown 关）")
            return False, None
        if breakdown.obs_total is None:
            logger.info("lex phase-2 跳过：obs_total 未建（无 objective_terms）")
            return False, None

        # ── 预算计算（§5.4）──
        phase2_budget = _compute_phase2_budget(config, solver_obj)
        min_seconds = float(config.get("lex_phase2_min_seconds", 30))
        if phase2_budget < min_seconds:
            logger.info("lex phase-2 跳过：剩余预算 %.1fs < 最小 %.1fs", phase2_budget, min_seconds)
            return False, None

        # ── 读 phase-1 锁定基准值（§5.2）──
        obs_total_p1 = breakdown.obs_total
        try:
            v_star = int(phase1_solver.Value(obs_total_p1))
        except Exception as e:
            logger.warning("lex phase-2 跳过：读 phase-1 obs_total 失败 %s", e)
            return False, None

        obs_vars_p1 = breakdown.obs_vars  # dict{key -> phase-1 IntVar}
        locks_p1 = {}  # key -> (phase1_var, value) 用于 O0/O1 ==
        for key in ("special_shortage_penalty", "vacancy_penalty"):
            var = obs_vars_p1.get(key)
            if var is not None:
                try:
                    locks_p1[key] = (var, int(phase1_solver.Value(var)))
                except Exception:
                    pass

        # ── Clone phase-1 model（§5.2，保留变量索引）──
        phase1_model = solver_obj.model
        phase2_model = phase1_model.Clone()

        # 映射观测变量到 clone。
        obs_total_clone = map_var_to_clone(phase2_model, obs_total_p1)
        # L3 上界：obs_total_clone <= v*（<= 而非 ==，给 L4 腾挪空间，§5.2）。
        phase2_model.Add(obs_total_clone <= v_star)
        # L0/L1 锁定：O0/O1 == phase-1 值。
        for key, (var_p1, val) in locks_p1.items():
            var_clone = map_var_to_clone(phase2_model, var_p1)
            phase2_model.Add(var_clone == val)

        # L4 分量观测变量映射到 clone。
        clone_obs = {}
        for key in L4_KEYS:
            var = obs_vars_p1.get(key)
            if var is not None:
                clone_obs[key] = map_var_to_clone(phase2_model, var)

        # 代理目标（§5.3）。
        employee_count = len(getattr(req, "employee_profiles", []) or [])
        window = getattr(req, "window", {}) or {}
        day_count = _day_span(window)
        _build_proxy_objective(phase2_model, clone_obs, employee_count, day_count, callback)

        # ── monitor 基准重置（§5.4）：phase-2 新预算窗口 ──
        if callback is not None:
            try:
                callback.reset_phase2(phase2_budget)
            except Exception as e:
                logger.warning("reset_phase2 异常（忽略，继续）：%s", e)
            try:
                callback.log_metric("L4阶段二", "进入 L4 第二阶段优化（预算 %.0fs）" % phase2_budget)
            except Exception:
                pass

        # ── phase-2 求解（独立 solver，重用 phase-1 参数）──
        phase2_solver = cp_model.CpSolver()
        _copy_solver_params(phase1_solver, phase2_solver, phase2_budget)

        if callback is not None:
            # 复用同 callback（phase 仍 SOLVING），让 phase-2 解流入可视化 + 缓存。
            phase2_solver.parameters.max_time_in_seconds = phase2_budget + 10.0
            status2 = phase2_solver.Solve(phase2_model, callback)
        else:
            status2 = phase2_solver.Solve(phase2_model)

        # ── phase-2 结果校验（§5.5 失败安全回退）──
        if status2 not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            _log_fallback(callback, "L4 优化未找到更优解（status=%s），采用阶段一最优"
                          % phase2_solver.StatusName(status2))
            return False, None

        # 防御性校验：phase-2 解的 L0-L3 读数 == phase-1 / 不破 L3 上界（§5.5）。
        try:
            total2 = int(phase2_solver.Value(obs_total_clone))
        except Exception as e:
            _log_fallback(callback, "L4 阶段二读 obs_total 失败，回退阶段一：%s" % e)
            return False, None
        if total2 > v_star:
            _log_fallback(callback, "L4 阶段二破 L3 上界（%d > %d），回退阶段一" % (total2, v_star),
                          level="error")
            return False, None
        for key, (var_p1, val) in locks_p1.items():
            var_clone = map_var_to_clone(phase2_model, var_p1)
            try:
                if int(phase2_solver.Value(var_clone)) != val:
                    _log_fallback(
                        callback,
                        "L4 阶段二 L0-L3 读数漂移（%s 变了），回退阶段一" % key,
                        level="error")
                    return False, None
            except Exception:
                _log_fallback(callback, "L4 阶段二校验读值失败，回退阶段一", level="error")
                return False, None

        _log_info(callback, "L4 第二阶段优化成功，采用阶段二解（总目标 %d ≤ 阶段一 %d）"
                  % (total2, v_star))
        return True, phase2_solver

    except Exception as e:
        # 最外层大包围：任何异常一律回退 S1（§5.5 R2 不降低硬保障）。
        logger.exception("lex phase-2 异常，安全回退阶段一：%s", e)
        _log_fallback(callback, "L4 第二阶段异常，已回退阶段一最优解")
        return False, None


# ──────────────────────────────────────────────
# 辅助
# ──────────────────────────────────────────────

def _day_span(window):
    """窗口天数（含首尾）。解析失败保守返回 1。"""
    try:
        from datetime import date
        start = str(window.get("start_date"))
        end = str(window.get("end_date"))
        y1, m1, d1 = (int(x) for x in start.split("-")[:3])
        y2, m2, d2 = (int(x) for x in end.split("-")[:3])
        delta = (date(y2, m2, d2) - date(y1, m1, d1)).days + 1
        return max(1, delta)
    except Exception:
        return 1


def _compute_phase2_budget(config, solver_obj):
    """phase-2 预算 = 总预算 - 阶段一实耗，且 ≥ lex_phase2_min_seconds（§5.4）。

    阶段一提前 OPTIMAL 时省下的时间全让给 phase-2。
    """
    total = float(config.get("max_time_seconds", 300))
    min_seconds = float(config.get("lex_phase2_min_seconds", 30))
    phase1_elapsed = float(getattr(solver_obj, "_phase1_elapsed", 0.0) or 0.0)
    remaining = total - phase1_elapsed
    if remaining < min_seconds:
        return remaining  # 调用方判 < min 则跳过
    return remaining


def _copy_solver_params(src_solver, dst_solver, budget):
    """把 phase-1 求解参数搬到 phase-2 solver（§5.2 重用相同参数）。"""
    try:
        dst_solver.parameters.num_workers = src_solver.parameters.num_workers
        dst_solver.parameters.linearization_level = src_solver.parameters.linearization_level
        dst_solver.parameters.symmetry_level = src_solver.parameters.symmetry_level
        dst_solver.parameters.log_search_progress = src_solver.parameters.log_search_progress
        dst_solver.parameters.absolute_gap_limit = src_solver.parameters.absolute_gap_limit
    except Exception as e:
        logger.warning("拷贝 phase-1 参数部分失败（用默认）：%s", e)
    dst_solver.parameters.max_time_in_seconds = budget


def _log_info(callback, msg):
    logger.info(msg)
    if callback is not None:
        try:
            callback.log_metric("L4阶段二", msg)
        except Exception:
            pass


def _log_fallback(callback, msg, level="info"):
    if level == "error":
        logger.error(msg)
    else:
        logger.info(msg)
    if callback is not None:
        try:
            callback.log_metric("L4回退", msg)
        except Exception:
            pass
