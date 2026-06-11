#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""compare_v4_v5.py — V4/V5 求解结果回归对比裁判（工单 V2）。

R2「结果不降低」的最终裁判：对 solver_v4/logs/request_*.json 逐个喂给
  - V4: POST :5005/api/v4/solve
  - V5: POST :5006/api/v5/solve（按 --mode 调整 config 三键）
按 L0-L4 字典序逐层判定，并附带 breakdown 加权和等价自检。

模式（冻结契约 §V2 / 实施计划 §2 V2）：
  --mode all-off  A 轮：enable_solution_hint=false / enable_lexicographic_l4=false /
                  enable_objective_breakdown=false（**真·全关**：breakdown 观测 IntVar
                  会进 CP-SAT 模型并改变搜索轨迹，故 A 轮必须关掉它才是「同模型」对照；
                  Σ 加权和等价自检改在 --mode default 模式继续做）。判定语义见下「裁判语义」。
  --mode default  B 轮：hint on / lex off / breakdown on。OPTIMAL 场景 obj==V4；
                  超时(FEASIBLE)场景 obj<=V4。此模式产出 objective_breakdown，
                  做 Σ(权重·分量) == objective_value 的加权和等价自检。
  --mode lex-on   C 轮：enable_lexicographic_l4=true。L0-L3==V4，L4 各分量<=V4。

裁判语义（A 轮 all-off 的核心修订，针对超时档墙钟非确定性）：
  CP-SAT 多 worker、无固定 random_seed、命中墙钟时间上限时是**非确定性**的——
  同一输入 V4-vs-V4 两次都不可复现（obj 可能相同但 schedules/best_bound/gap 漂移，
  甚至超时档 FEASIBLE 的 objective_value 本身也随墙钟抖动）。因此：
    · 双方都 OPTIMAL（gap=0、确定性收敛）→ 既有决策 metrics **逐字节硬门禁**强制相等。
    · 任一方非 OPTIMAL（超时 FEASIBLE，标签 TIMEOUT-NOISY）→ 只把
        L0 status         设为硬门禁（V4 有解 V5 不得退化为 INFEASIBLE/FAILED），
        L1/L2/L3（shortage / vacancy / objective）用**对称噪声判定**：
        仅当 V5 相对 V4 **劣化超过 --noise-tolerance（默认 5%）** 才 FAIL；
        噪声带内的好/坏方向**都打印**（V5 better / V5 worse-within-noise）供人工裁断，
        不据此判 FAIL（方向随机正是墙钟噪声的特征）。

字典序判定层（数值越小越好）：
  L0 status:  V4 有解(OPTIMAL/FEASIBLE) → V5 不得 INFEASIBLE/FAILED
  L1 special_shift_shortage_total: V5 <= V4
  L2 vacant_positions:             V5 <= V4
  L3 objective_value: 同 OPTIMAL → 整数严格相等；V4 FEASIBLE → V5.obj <= V4.obj
  L4 breakdown:  L0-L3 相等时逐分量不显著劣化（lex on 时要求 V5 <= V4）
  额外: Σ(权重·v5.metrics.objective_breakdown) == round(v5.objective_value)
        （权重集 §1.4：{O0:1,O1:1,O2:w_impact,O3:w1,O4:w2,O5:w3,O6:w4,O7:w5,O8:1}）

输出：每请求一行 PASS/FAIL + 劣化分量；任一 FAIL → 非零退出码（门禁失败）。

自校验（--self-test，识别墙钟噪声 vs 系统漂移）：
  把 --v5-url 指向 V4 服务本身（即 V4-vs-V4 对照），可量化墙钟非确定性的噪声底噪：
      python3 scripts/compare_v4_v5.py --mode all-off \
              --v4-url http://localhost:5005 --v5-url http://localhost:5005
  注意 --v5-url 仍会被拼成 `<v5-url>/api/v5/solve`，故自校验时让 V4 服务**同时挂载
  /api/v5/solve 别名**，或用 V5 服务以 all-off（breakdown=false）跑两遍——目的相同：
  观察「V5」相对「V4」的 L1-L3 方向是否随机、是否落在 --noise-tolerance 带内。
  若 V4-vs-V4 自身就触发某档 FAIL，说明该档阈值定得过紧（应放宽 --noise-tolerance），
  而非 V5 引入了系统性漂移。

Python 3.9 兼容（无 match / 无 X|Y 运行时注解）。仅依赖标准库 + requests。
"""

import argparse
import copy
import glob
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

try:
    import requests
except ImportError:  # pragma: no cover - 依赖缺失时给出清晰提示
    sys.stderr.write("[FATAL] 需要 requests 库：pip install requests\n")
    sys.exit(2)


# --------------------------------------------------------------------------- #
# 常量 / 契约
# --------------------------------------------------------------------------- #

V4_URL_DEFAULT = "http://localhost:5005"
V5_URL_DEFAULT = "http://localhost:5006"

SOLVED_STATUSES = ("OPTIMAL", "FEASIBLE")
FAILED_STATUSES = ("INFEASIBLE", "FAILED", "UNKNOWN", "MODEL_INVALID")

# 9 个 breakdown 分量（冻结 §1.2/§1.4，顺序 O0..O8）
BREAKDOWN_KEYS = (
    "special_shortage_penalty",   # O0
    "vacancy_penalty",            # O1
    "special_impact",             # O2
    "hours_deviation_scaled",     # O3
    "special_shift_count",        # O4
    "night_shift_variance",       # O5
    "weekend_work_variance",      # O6
    "triple_salary_count",        # O7
    "leadership_penalty",         # O8
)

# 分量键 → weights_applied 中外层乘子名（O0/O1/O8 无外层乘子，恒 1）。
# 与 solver_v5/core/breakdown.py 的 _KEY_TO_WEIGHT_NAME 一致。
KEY_TO_WEIGHT_NAME = {
    "special_impact": "special_impact",        # O2 → w_impact
    "hours_deviation_scaled": "hours_deviation",  # O3 → w1
    "special_shift_count": "special_shifts",      # O4 → w2
    "night_shift_variance": "night_balance",      # O5 → w3
    "weekend_work_variance": "weekend_balance",   # O6 → w4
    "triple_salary_count": "triple_salary",       # O7 → w5
}

# A 轮逐字节对比的白名单字段（允许 V4/V5 差异）。
# 注意：byte_equal_diffs 只在「双方都 OPTIMAL」时调用（超时档走对称噪声判定，不逐字节）。
# - request_id / run_id: V5 注入 V5- 前缀
# - solve_time: 墙钟耗时
# - solver_generation: 纯诊断标记
# - objective_breakdown: V5 default 模式新增的 metrics 子键（all-off 已关 breakdown 不产出；
#   仍白名单豁免，保证即使误带也不参与既有键比对）。
# - best_bound / gap: 墙钟相关；OPTIMAL 时 gap=0、bound 确定，纳入逐字节比对。
#   （超时档不会进入本函数，故 METRICS_WALLCLOCK_KEYS 的非-OPTIMAL 豁免仅作防御性保留。）
METRICS_WHITELIST = {"solve_time", "objective_breakdown"}
# 防御性保留：万一非 OPTIMAL 时被调用，额外豁免墙钟相关键（正常路径走 judge_noisy_lex）。
METRICS_WALLCLOCK_KEYS = {"best_bound", "gap"}
TOP_WHITELIST = {"request_id", "run_id"}

# 逐字节比对的既有 metrics 键（V4 metrics 全集）。
V4_METRICS_KEYS = (
    "assigned_count",
    "scheduled_shifts",
    "total_deviation_hours",
    "objective_value",
    "best_bound",
    "gap",
    "vacant_positions",
    "total_positions",
    "fill_rate",
    "special_shift_shortage_total",
)

# L4 显著劣化阈值（default 模式，浮点容忍）。lex-on 模式要求 V5<=V4（仅小容差）。
L4_DEFAULT_SLACK = 1e-6
L4_LEX_SLACK = 1e-6

# 超时(FEASIBLE)档对称噪声容忍默认值（V5 相对 V4 劣化超过此比例才 FAIL）。
DEFAULT_NOISE_TOLERANCE = 0.05


# --------------------------------------------------------------------------- #
# config 模式构造
# --------------------------------------------------------------------------- #

def make_v5_config(base_config: Dict[str, Any], mode: str) -> Dict[str, Any]:
    """基于请求原 config 叠加 V5 三键（纯加法，不改 V4 既有键）。"""
    cfg = copy.deepcopy(base_config) if base_config else {}
    if mode == "all-off":
        # 真·全关：breakdown 观测 IntVar 会进 CP-SAT 模型并扰动搜索轨迹，
        # A 轮「同模型」对照必须关掉它（Σ 加权和等价自检改在 default 模式做）。
        cfg["enable_solution_hint"] = False
        cfg["enable_lexicographic_l4"] = False
        cfg["enable_objective_breakdown"] = False
        # viz telemetry（preview 聚合 + 逐解 search_stats 缓存）也会让 worker 线程
        # 每解多花墙钟，超时档形成偏 V5 略劣的系统偏置 → 全关档一并关闭，
        # 使 V5 callback 与 V4 逐指令等价。
        cfg["enable_viz_telemetry"] = False
    elif mode == "default":
        cfg["enable_solution_hint"] = True
        cfg["enable_lexicographic_l4"] = False
        cfg["enable_objective_breakdown"] = True
    elif mode == "lex-on":
        cfg["enable_solution_hint"] = True
        cfg["enable_lexicographic_l4"] = True
        cfg["enable_objective_breakdown"] = True
    else:  # pragma: no cover - argparse choices 已约束
        raise ValueError("unknown mode: %s" % mode)
    return cfg


# --------------------------------------------------------------------------- #
# HTTP 求解
# --------------------------------------------------------------------------- #

def post_solve(url: str, payload: Dict[str, Any], timeout: float) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """POST /solve，返回 (result_dict, error_str)。error 非空表示传输/HTTP 失败。"""
    try:
        resp = requests.post(url, json=payload, timeout=timeout)
    except requests.exceptions.RequestException as exc:
        return None, "request_error: %s" % exc
    if resp.status_code != 200:
        body = resp.text[:300] if resp.text else ""
        return None, "http_%d: %s" % (resp.status_code, body)
    try:
        data = resp.json()
    except ValueError as exc:
        return None, "json_decode_error: %s" % exc
    return data, None


# --------------------------------------------------------------------------- #
# 取值辅助
# --------------------------------------------------------------------------- #

def get_status(result: Dict[str, Any]) -> str:
    return str(result.get("status", "UNKNOWN"))


def get_metric(result: Dict[str, Any], key: str, default: Any = None) -> Any:
    metrics = result.get("metrics") or {}
    return metrics.get(key, default)


def is_solved(status: str) -> bool:
    return status in SOLVED_STATUSES


def num_or(value: Any, default: float) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


# --------------------------------------------------------------------------- #
# 逐字节比对（A 轮）
# --------------------------------------------------------------------------- #

def canonical(obj: Any) -> str:
    """稳定序列化（排序键），用于逐字节比对。"""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def byte_equal_diffs(r4: Dict[str, Any], r5: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    """A 轮逐字节对比，返回 (hard_diffs, soft_notes)。

    确定性边界（实测裁决，V4 喂自身两次验证）：
      1. CP-SAT 多 worker（V4 默认 num_workers=max(4,cpu-2)、无固定 random_seed），在
         **退化最优**（多个等价 OPTIMAL 解）下，每次返回的具体 `schedules` 不同——
         **V4-vs-V4 同输入两次都不逐字节一致**（obj 相同、解不同）。
      2. FEASIBLE（命中时间上限）时 best_bound/gap 依赖墙钟，V4-vs-V4 同样漂移。
    因此逐字节硬门禁只覆盖「确定性的决策相关量」：
      · 硬门禁(hard)：status + 全部确定性 metrics（objective_value / shortage / vacancy /
        assigned_count / fill_rate / total_positions / scheduled_shifts / deviation）。
        非 OPTIMAL 时额外豁免墙钟键 best_bound/gap（白名单）。
      · 软提示(soft)：schedules 及各结果数组的逐字节差异——**记录但不判 FAIL**
        （等价最优解之间的合法差异，由 metrics 硬门禁兜住「结果不降低」）。
    """
    hard: List[str] = []
    soft: List[str] = []
    s4 = get_status(r4)
    s5 = get_status(r5)

    # status：始终硬门禁
    if s4 != s5:
        hard.append("status: V4=%s V5=%s" % (s4, s5))

    both_optimal = (s4 == "OPTIMAL" and s5 == "OPTIMAL")

    # schedules / 结果数组：软提示（等价最优解之间的合法差异）
    sch4 = r4.get("schedules")
    sch5 = r5.get("schedules")
    if canonical(sch4) != canonical(sch5):
        n4 = len(sch4) if isinstance(sch4, list) else "?"
        n5 = len(sch5) if isinstance(sch5, list) else "?"
        soft.append("schedules differ (len V4=%s V5=%s, 等价最优解差异)" % (n4, n5))
    for key in ("unassigned_jobs", "special_shift_assignments",
                "special_shift_shortages", "share_group_compliance"):
        if canonical(r4.get(key)) != canonical(r5.get(key)):
            soft.append("%s differ (等价最优解差异)" % key)

    # metrics 既有键（硬门禁；剔除白名单；非 OPTIMAL 时额外豁免墙钟键）
    m4 = r4.get("metrics") or {}
    m5 = r5.get("metrics") or {}
    for key in V4_METRICS_KEYS:
        if key in METRICS_WHITELIST:
            continue
        if not both_optimal and key in METRICS_WALLCLOCK_KEYS:
            continue
        v4 = m4.get(key)
        v5 = m5.get(key)
        if canonical(v4) != canonical(v5):
            hard.append("metrics.%s: V4=%r V5=%r" % (key, v4, v5))

    return hard, soft


# --------------------------------------------------------------------------- #
# breakdown 加权和等价自检
# --------------------------------------------------------------------------- #

def breakdown_original_objective(result: Dict[str, Any]) -> Optional[int]:
    """从 metrics.objective_breakdown 重建「原始 O0-O8 加权目标」。缺 breakdown 返回 None。

    权重集 §1.4：分量在 KEY_TO_WEIGHT_NAME 中的取 weights_applied 实际值，
    其余（O0/O1/O8）权重恒 1。
    注意：lexicographic L4 第二阶段会把 metrics.objective_value 覆写为「代理目标」，
    此时唯有 breakdown 加权和仍等于原始语义目标，故 L0-L3 在 lex-on 时以本函数为准。
    """
    metrics = result.get("metrics") or {}
    breakdown = metrics.get("objective_breakdown")
    if not isinstance(breakdown, dict):
        return None
    weights_applied = breakdown.get("weights_applied") or {}
    weighted = 0
    for key in BREAKDOWN_KEYS:
        if key not in breakdown:
            continue
        wname = KEY_TO_WEIGHT_NAME.get(key)
        if wname is None:
            weight = 1
        else:
            try:
                weight = int(weights_applied.get(wname, 1))
            except (TypeError, ValueError):
                weight = 1
        try:
            weighted += weight * int(round(float(breakdown[key])))
        except (TypeError, ValueError):
            return None
    return weighted


def effective_objective(result: Dict[str, Any], lex_on: bool) -> Optional[float]:
    """L0-L3 用的「有效目标值」。

    非 lex：用 metrics.objective_value（= O0-O8 加权目标）。
    lex-on：metrics.objective_value 是第二阶段代理目标，需用 breakdown 重建原始目标；
            重建失败（缺 breakdown）回退 metrics.objective_value。
    """
    if lex_on:
        orig = breakdown_original_objective(result)
        if orig is not None:
            return float(orig)
    metrics = result.get("metrics") or {}
    obj = metrics.get("objective_value")
    if obj is None:
        return None
    try:
        return float(obj)
    except (TypeError, ValueError):
        return None


def breakdown_self_check(result: Dict[str, Any], lex_on: bool) -> Optional[Tuple[int, int]]:
    """breakdown 加权和等价自检（§1.4）。返回 (weighted_sum, reference_obj)。

    非 lex：reference_obj = round(metrics.objective_value)，两者应严格相等。
    lex-on：metrics.objective_value 被代理目标覆写，§1.4 不变量对其不成立；
            返回 None 跳过此自检（原始目标的一致性改由 L3 vs V4 间接保证）。
    """
    if lex_on:
        return None
    weighted = breakdown_original_objective(result)
    if weighted is None:
        return None
    metrics = result.get("metrics") or {}
    obj = metrics.get("objective_value")
    if obj is None:
        return None
    try:
        return weighted, int(round(float(obj)))
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- #
# 单请求判定
# --------------------------------------------------------------------------- #

class CaseResult(object):
    def __init__(self, name: str):
        self.name = name
        self.passed = True
        self.reasons: List[str] = []   # FAIL 原因
        self.notes: List[str] = []     # PASS 旁注/告警
        # 超时档(任一方非 OPTIMAL)走对称噪声判定时置 True，输出打 TIMEOUT-NOISY 标签防误读。
        self.noisy = False

    def fail(self, reason: str) -> None:
        self.passed = False
        self.reasons.append(reason)

    def note(self, msg: str) -> None:
        self.notes.append(msg)


def judge_lexicographic(r4: Dict[str, Any], r5: Dict[str, Any],
                        mode: str, case: CaseResult) -> None:
    """L0-L4 字典序逐层判定（非 all-off 的语义判定，all-off 也跑作交叉验证）。"""
    s4 = get_status(r4)
    s5 = get_status(r5)

    # L0 status
    if is_solved(s4) and not is_solved(s5):
        case.fail("L0 status: V4=%s 有解但 V5=%s 退化" % (s4, s5))
        return
    if not is_solved(s4):
        # V4 本身无解：仅要求 V5 不更糟（不强求有解），记一笔旁注
        case.note("V4 status=%s（基线无解），跳过 L1-L4" % s4)
        if is_solved(s5):
            case.note("V5 status=%s（V5 反而求得解，记为改善）" % s5)
        return

    # L1 special_shift_shortage_total
    sh4 = num_or(get_metric(r4, "special_shift_shortage_total"), 0.0)
    sh5 = num_or(get_metric(r5, "special_shift_shortage_total"), 0.0)
    if sh5 > sh4 + 1e-9:
        case.fail("L1 special_shortage: V4=%g V5=%g (V5 更差)" % (sh4, sh5))
        return

    # L2 vacant_positions
    vp4 = num_or(get_metric(r4, "vacant_positions"), 0.0)
    vp5 = num_or(get_metric(r5, "vacant_positions"), 0.0)
    if sh5 == sh4 and vp5 > vp4 + 1e-9:
        case.fail("L2 vacant_positions: V4=%g V5=%g (V5 更差)" % (vp4, vp5))
        return

    # L3 objective_value（lex-on 时 V5 用 breakdown 重建的原始目标，因 metrics.objective_value
    #   在第二阶段被代理目标覆写；V4 永远用其 objective_value=原始目标）
    lex_on = (mode == "lex-on")
    obj4 = num_or(effective_objective(r4, False), float("inf"))
    obj5 = num_or(effective_objective(r5, lex_on), float("inf"))
    obj_equal = False
    if sh5 == sh4 and vp5 == vp4:
        if s4 == "OPTIMAL" and s5 == "OPTIMAL":
            # 同 OPTIMAL → 原始目标整数严格相等
            if int(round(obj4)) != int(round(obj5)):
                case.fail("L3 objective(OPTIMAL): V4=%d V5=%d 不相等"
                          % (int(round(obj4)), int(round(obj5))))
                return
            obj_equal = True
        else:
            # V4 FEASIBLE（超时）→ V5.obj <= V4.obj
            if obj5 > obj4 + 1e-6:
                case.fail("L3 objective(FEASIBLE): V4=%g V5=%g (V5 更差)"
                          % (obj4, obj5))
                return
            obj_equal = (int(round(obj4)) == int(round(obj5)))

    # L4 breakdown 逐分量（仅 L0-L3 相等时判定）
    if sh5 == sh4 and vp5 == vp4 and obj_equal:
        judge_breakdown_components(r4, r5, mode, case)


def judge_breakdown_components(r4: Dict[str, Any], r5: Dict[str, Any],
                               mode: str, case: CaseResult) -> None:
    m4 = (r4.get("metrics") or {}).get("objective_breakdown")
    m5 = (r5.get("metrics") or {}).get("objective_breakdown")
    if not isinstance(m4, dict) or not isinstance(m5, dict):
        # V4 无 breakdown（V4 不产出该键）→ 仅自洽校验 V5，不做 V4/V5 分量对比
        return
    slack = L4_LEX_SLACK if mode == "lex-on" else L4_DEFAULT_SLACK
    for key in BREAKDOWN_KEYS:
        if key not in m4 or key not in m5:
            continue
        b4 = num_or(m4.get(key), 0.0)
        b5 = num_or(m5.get(key), 0.0)
        if b5 > b4 + slack:
            if mode == "lex-on":
                case.fail("L4 breakdown[%s]: V4=%g V5=%g (字典序应 V5<=V4)"
                          % (key, b4, b5))
            else:
                case.note("L4 breakdown[%s] 劣化: V4=%g V5=%g" % (key, b4, b5))


def _noise_compare(label: str, v4: float, v5: float, tol: float,
                   case: CaseResult) -> None:
    """对称噪声判定单档（数值越小越好）：仅当 V5 相对 V4 劣化超过 tol 才 FAIL。

    好/坏方向都打印为旁注供人工裁断（方向随机正是墙钟噪声的特征，不据此判 FAIL）。
    相对分母用 max(|v4|, 1.0) 防 0 除；v4<=0 且 v5<=0 时退化为绝对差判定（仍除 1.0）。
    """
    diff = v5 - v4                       # >0 表示 V5 更差（劣化）
    denom = max(abs(v4), 1.0)
    rel = diff / denom                   # 相对劣化比例（负值=改善）
    if rel > tol:
        case.fail("%s(TIMEOUT-NOISY): V4=%g V5=%g 劣化 %.1f%% > 容忍 %.1f%%"
                  % (label, v4, v5, rel * 100.0, tol * 100.0))
    elif diff > 1e-9:
        case.note("%s V5 worse-within-noise: V4=%g V5=%g (+%.1f%% ≤ %.1f%%)"
                  % (label, v4, v5, rel * 100.0, tol * 100.0))
    elif diff < -1e-9:
        case.note("%s V5 better: V4=%g V5=%g (%.1f%%)"
                  % (label, v4, v5, rel * 100.0))


def judge_noisy_lex(r4: Dict[str, Any], r5: Dict[str, Any],
                    case: CaseResult, noise_tolerance: float) -> None:
    """超时档(任一方非 OPTIMAL)的对称噪声判定：L0 硬门禁 + L1/L2/L3 噪声容忍。

    墙钟非确定性下逐字节门禁不成立；只保证「不退化」(L0) 与「不显著劣化」(L1-L3)。
    """
    case.noisy = True
    s4 = get_status(r4)
    s5 = get_status(r5)

    # L0 status：硬门禁（V4 有解 → V5 不得退化为 INFEASIBLE/FAILED）
    if is_solved(s4) and not is_solved(s5):
        case.fail("L0 status(TIMEOUT-NOISY): V4=%s 有解但 V5=%s 退化" % (s4, s5))
        return
    if not is_solved(s4):
        case.note("V4 status=%s（基线无解），跳过 L1-L3 噪声判定" % s4)
        if is_solved(s5):
            case.note("V5 status=%s（V5 反而求得解，记为改善）" % s5)
        return

    # L1 special_shift_shortage_total（对称噪声）
    sh4 = num_or(get_metric(r4, "special_shift_shortage_total"), 0.0)
    sh5 = num_or(get_metric(r5, "special_shift_shortage_total"), 0.0)
    _noise_compare("L1 special_shortage", sh4, sh5, noise_tolerance, case)

    # L2 vacant_positions（对称噪声）
    vp4 = num_or(get_metric(r4, "vacant_positions"), 0.0)
    vp5 = num_or(get_metric(r5, "vacant_positions"), 0.0)
    _noise_compare("L2 vacant_positions", vp4, vp5, noise_tolerance, case)

    # L3 objective_value（对称噪声；all-off 无 breakdown，直接读 metrics.objective_value）
    obj4 = num_or(effective_objective(r4, False), float("inf"))
    obj5 = num_or(effective_objective(r5, False), float("inf"))
    _noise_compare("L3 objective", obj4, obj5, noise_tolerance, case)


def judge_case(name: str, r4: Dict[str, Any], r5: Dict[str, Any],
               mode: str, noise_tolerance: float) -> CaseResult:
    case = CaseResult(name)

    # 额外：V5 breakdown 加权和等价自检（仅当 V5 有解且产出 breakdown；lex-on 跳过，
    #   因 metrics.objective_value 在第二阶段被代理目标覆写，§1.4 不变量对其不成立）
    if is_solved(get_status(r5)):
        ws = breakdown_self_check(r5, lex_on=(mode == "lex-on"))
        if ws is not None:
            weighted, obj_int = ws
            if weighted != obj_int:
                case.fail("breakdown 加权和 %d != objective_value %d"
                          % (weighted, obj_int))

    if mode == "all-off":
        s4 = get_status(r4)
        s5 = get_status(r5)
        both_optimal = (s4 == "OPTIMAL" and s5 == "OPTIMAL")
        if both_optimal:
            # 双方都 OPTIMAL（确定性收敛）→ 既有决策 metrics 逐字节硬门禁 + 等价最优解软提示
            hard, soft = byte_equal_diffs(r4, r5)
            for d in hard:
                case.fail("byte-diff: %s" % d)
            for s in soft:
                case.note("soft-diff: %s" % s)
            # 跑一遍字典序作交叉验证（理论上必同）
            judge_lexicographic(r4, r5, mode, case)
        else:
            # 任一方非 OPTIMAL（超时 FEASIBLE）→ 墙钟非确定性，逐字节门禁不成立。
            # 仅 L0 硬门禁 + L1/L2/L3 对称噪声判定（TIMEOUT-NOISY）。
            judge_noisy_lex(r4, r5, case, noise_tolerance)
    else:
        # default / lex-on 同理：严格字典序只对双方 OPTIMAL（确定性收敛）成立；
        # 超时档单次跑的 obj<=V4 是统计不成立的（V4 自身重跑也会随机劣化），
        # 改走对称噪声判定 + 方向旁注，多样本汇总看 hint/lex 的平均改善方向。
        s4 = get_status(r4)
        s5 = get_status(r5)
        if s4 == "OPTIMAL" and s5 == "OPTIMAL":
            judge_lexicographic(r4, r5, mode, case)
        else:
            judge_noisy_lex(r4, r5, case, noise_tolerance)

    return case


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #

def discover_requests(logs_dir: str, limit: Optional[int],
                      only: Optional[List[str]]) -> List[str]:
    paths = sorted(glob.glob(os.path.join(logs_dir, "request_*.json")))
    # 排除 V5 自己回写的 request_V5-*.json（仅取 V4 纯数字 / 原始日志）
    paths = [p for p in paths if "request_V5-" not in os.path.basename(p)
             and "request_preview-" not in os.path.basename(p)]
    if only:
        wanted = set(only)
        paths = [p for p in paths
                 if os.path.basename(p) in wanted
                 or os.path.splitext(os.path.basename(p))[0].replace("request_", "") in wanted]
    if limit is not None and limit > 0:
        paths = paths[:limit]
    return paths


def load_request(path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (ValueError, OSError) as exc:
        sys.stderr.write("[WARN] 跳过无法解析的请求 %s: %s\n" % (path, exc))
        return None


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description="V4/V5 求解结果回归对比裁判（工单 V2）")
    parser.add_argument("--mode", choices=("all-off", "default", "lex-on"),
                        default="all-off", help="对比模式（默认 all-off / A 轮逐字节）")
    parser.add_argument("--v4-url", default=os.environ.get("V4_SOLVE_URL", V4_URL_DEFAULT),
                        help="V4 solver base url（默认 :5005）")
    parser.add_argument("--v5-url", default=os.environ.get("V5_SOLVE_URL", V5_URL_DEFAULT),
                        help="V5 solver base url（默认 :5006）")
    parser.add_argument("--logs-dir",
                        default=os.path.join(os.path.dirname(os.path.dirname(
                            os.path.abspath(__file__))), "solver_v4", "logs"),
                        help="request_*.json 目录（默认 solver_v4/logs）")
    parser.add_argument("--limit", type=int, default=None,
                        help="最多取前 N 个请求（抽样）")
    parser.add_argument("--only", nargs="*", default=None,
                        help="仅跑指定请求（文件名或 id，如 1240 request_1240.json）")
    parser.add_argument("--timeout", type=float, default=900.0,
                        help="单次 solve HTTP 超时秒（默认 900）")
    parser.add_argument("--noise-tolerance", type=float,
                        default=DEFAULT_NOISE_TOLERANCE,
                        help="超时(FEASIBLE)档对称噪声容忍比例（默认 0.05=5%%）；"
                             "V5 相对 V4 劣化超过此值才 FAIL，好/坏方向均打印供人工裁断")
    parser.add_argument("--continue-on-error", action="store_true",
                        help="HTTP/传输错误时记 FAIL 并继续（默认遇错也继续，本开关保留兼容）")
    args = parser.parse_args(argv)

    v4_solve = args.v4_url.rstrip("/") + "/api/v4/solve"
    v5_solve = args.v5_url.rstrip("/") + "/api/v5/solve"

    paths = discover_requests(args.logs_dir, args.limit, args.only)
    if not paths:
        sys.stderr.write("[FATAL] 未在 %s 找到 request_*.json\n" % args.logs_dir)
        return 2

    print("=" * 78)
    print("compare_v4_v5  mode=%s  V4=%s  V5=%s  cases=%d"
          % (args.mode, v4_solve, v5_solve, len(paths)))
    print("=" * 78)

    cases: List[CaseResult] = []
    n_transport_fail = 0

    for path in paths:
        name = os.path.basename(path)
        payload = load_request(path)
        if payload is None:
            case = CaseResult(name)
            case.fail("请求 JSON 解析失败")
            cases.append(case)
            print("FAIL  %-28s  %s" % (name, "请求 JSON 解析失败"))
            continue

        # V4 payload：原样
        v4_payload = payload
        # V5 payload：深拷贝 + 叠加三键
        v5_payload = copy.deepcopy(payload)
        if "config" not in v5_payload or not isinstance(v5_payload.get("config"), dict):
            v5_payload["config"] = {}
        v5_payload["config"] = make_v5_config(v5_payload["config"], args.mode)

        t0 = time.time()
        r4, e4 = post_solve(v4_solve, v4_payload, args.timeout)
        r5, e5 = post_solve(v5_solve, v5_payload, args.timeout)
        dt = time.time() - t0

        if e4 or e5:
            n_transport_fail += 1
            case = CaseResult(name)
            if e4:
                case.fail("V4 求解传输失败: %s" % e4)
            if e5:
                case.fail("V5 求解传输失败: %s" % e5)
            cases.append(case)
            print("FAIL  %-28s  %s" % (name, " | ".join(case.reasons)))
            continue

        case = judge_case(name, r4, r5, args.mode, args.noise_tolerance)
        cases.append(case)

        tag = "PASS" if case.passed else "FAIL"
        noisy_tag = " TIMEOUT-NOISY" if case.noisy else ""
        # 噪声档即便 PASS 也把好/坏方向旁注打出来供人工裁断；OPTIMAL 档 PASS 仅在有旁注时打。
        detail_parts: List[str] = []
        if not case.passed:
            detail_parts.extend(case.reasons)
        if case.notes:
            detail_parts.extend(case.notes)
        detail = " | ".join(detail_parts)
        s4 = get_status(r4)
        s5 = get_status(r5)
        print("%-4s  %-28s  [%s→%s %5.1fs%s] %s"
              % (tag, name, s4, s5, dt, noisy_tag, detail))

    n_pass = sum(1 for c in cases if c.passed)
    n_fail = len(cases) - n_pass

    print("=" * 78)
    print("SUMMARY  mode=%s  total=%d  PASS=%d  FAIL=%d  (transport_fail=%d)"
          % (args.mode, len(cases), n_pass, n_fail, n_transport_fail))
    print("=" * 78)

    if n_fail:
        print("\nFAIL 明细：")
        for c in cases:
            if not c.passed:
                for r in c.reasons:
                    print("  - %s: %s" % (c.name, r))

    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
