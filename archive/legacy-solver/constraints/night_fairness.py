"""夜班公平与健康保护约束模块"""
from __future__ import annotations
from typing import Dict, List, Tuple, Set
from ortools.sat.python import cp_model


def apply_night_fairness_constraints(
    model: cp_model.CpModel,
    employees: List[Dict],
    all_dates: List[str],
    day_night_flag: Dict[Tuple[int, str], cp_model.BoolVar],
    enforce_fairness: bool,
    max_consecutive_nights: int,
    window_days: int,
    max_nights_per_window: int,
    fairness_penalty_terms: List[cp_model.IntVar],
    frontline_ids: set[int] | None = None,
    frontline_fairness_terms: List[cp_model.IntVar] | None = None,
    min_gap_days: int = 0,
    month_buckets: Dict[str, Dict[str, List[str] | int]] | None = None,
    frontline_distribution_terms: List[cp_model.IntVar] | None = None,
    enable_frontline_distribution: bool = True,
    frontline_distribution_window_days: int = 7,
) -> None:
    """限制连续夜班并平衡夜班总次数

    Args:
        model: CP-SAT 模型
        employees: 员工列表
        all_dates: 全部日期有序列表
        day_night_flag: (员工ID, 日期) -> BoolVar，标记该天是否上夜班
        enforce_fairness: 是否启用约束
        max_consecutive_nights: 最大允许连续夜班天数（默认1表示禁止连班）
        window_days: 滑动窗口长度
        max_nights_per_window: 窗口内夜班上限
        fairness_penalty_terms: 目标函数的夜班公平性惩罚项列表
        month_buckets: 按月分组的日历桶
        frontline_distribution_terms: 一线员工月度均衡/分布惩罚项
        enable_frontline_distribution: 是否启用一线员工月度分布约束
        frontline_distribution_window_days: 月内分布的滑窗大小（默认按周平摊）
    """
    if not enforce_fairness or not all_dates:
        return

    # 对缺少夜班变量的日期视为0
    def get_night_var(emp_id: int, date_key: str) -> cp_model.LinearExpr:
        var = day_night_flag.get((emp_id, date_key))
        if var is None:
            return model.NewConstant(0)
        return var

    night_totals: List[Tuple[int, cp_model.IntVar]] = []

    for emp in employees:
        emp_id = int(emp["employeeId"])
        night_vars_seq = [get_night_var(emp_id, d) for d in all_dates]

        # 连续夜班限制：sum(window) <= max_consecutive_nights
        if max_consecutive_nights > 0 and len(night_vars_seq) > max_consecutive_nights:
            window_size = max_consecutive_nights + 1
            for start_idx in range(len(night_vars_seq) - max_consecutive_nights):
                window_vars = night_vars_seq[start_idx : start_idx + window_size]
                model.Add(sum(window_vars) <= max_consecutive_nights)

        # 夜班最小间隔：在 min_gap_days 窗口内最多 1 个夜班
        if min_gap_days > 0:
            window_size = min_gap_days + 1
            for start_idx in range(len(night_vars_seq) - min_gap_days):
                window_vars = night_vars_seq[start_idx : start_idx + window_size]
                model.Add(sum(window_vars) <= 1)

        # 滑动窗口夜班总量限制
        if window_days > 0 and max_nights_per_window >= 0 and len(night_vars_seq) >= window_days:
            for start_idx in range(len(night_vars_seq) - window_days + 1):
                window_vars = night_vars_seq[start_idx : start_idx + window_days]
                model.Add(sum(window_vars) <= max_nights_per_window)

        # 统计个人夜班总数
        total_var = model.NewIntVar(0, len(all_dates), f"night_total_{emp_id}")
        model.Add(total_var == sum(night_vars_seq))
        night_totals.append((emp_id, total_var))

    # 公平性：最小化夜班总数的极差 (max - min)
    if len(night_totals) >= 2:
        total_vars = [t for _, t in night_totals]
        max_total = model.NewIntVar(0, len(all_dates), "night_total_max")
        min_total = model.NewIntVar(0, len(all_dates), "night_total_min")
        model.AddMaxEquality(max_total, total_vars)
        model.AddMinEquality(min_total, total_vars)
        gap = model.NewIntVar(0, len(all_dates), "night_total_gap")
        model.Add(gap == max_total - min_total)
        fairness_penalty_terms.append(gap)

    # 仅对一线员工做均衡（若提供）
    if frontline_ids and frontline_fairness_terms is not None:
        frontline_totals = [t for emp_id, t in night_totals if emp_id in frontline_ids]
        if len(frontline_totals) >= 2:
            f_max = model.NewIntVar(0, len(all_dates), "night_total_frontline_max")
            f_min = model.NewIntVar(0, len(all_dates), "night_total_frontline_min")
            model.AddMaxEquality(f_max, frontline_totals)
            model.AddMinEquality(f_min, frontline_totals)
            f_gap = model.NewIntVar(0, len(all_dates), "night_total_frontline_gap")
            model.Add(f_gap == f_max - f_min)
            frontline_fairness_terms.append(f_gap)

    # 一线员工：在月度周期内均衡且分散夜班
    if (
        frontline_ids
        and frontline_distribution_terms is not None
        and enable_frontline_distribution
        and month_buckets
    ):
        apply_frontline_monthly_distribution(
            model,
            frontline_ids,
            all_dates,
            day_night_flag,
            month_buckets,
            frontline_distribution_terms,
            window_days=max(1, frontline_distribution_window_days),
        )


def apply_frontline_monthly_distribution(
    model: cp_model.CpModel,
    frontline_ids: Set[int],
    all_dates: List[str],
    day_night_flag: Dict[Tuple[int, str], cp_model.BoolVar],
    month_buckets: Dict[str, Dict[str, List[str] | int]],
    distribution_terms: List[cp_model.IntVar],
    window_days: int = 7,
) -> None:
    """鼓励一线员工夜班在月度周期内均匀分配

    - 在同一个月内，一线员工之间夜班总数尽量平均（最小化极差）
    - 每个一线员工的夜班在月内按周分散（最小化周间极差）
    """
    if not month_buckets or not frontline_ids:
        return

    date_set = set(all_dates)

    def get_night_var(emp_id: int, date_key: str) -> cp_model.LinearExpr:
        var = day_night_flag.get((emp_id, date_key))
        if var is None:
            return model.NewConstant(0)
        return var

    for month_key in sorted(month_buckets.keys()):
        month_dates_all = sorted(month_buckets[month_key].get("dates", []))
        month_dates = [d for d in month_dates_all if d in date_set]
        if not month_dates:
            continue

        monthly_totals: List[cp_model.IntVar] = []

        for emp_id in frontline_ids:
            night_vars = [get_night_var(emp_id, d) for d in month_dates]
            if not night_vars:
                continue

            total_var = model.NewIntVar(0, len(month_dates), f"night_total_frontline_{emp_id}_{month_key}")
            model.Add(total_var == sum(night_vars))
            monthly_totals.append(total_var)

            # 周维度分散：对同一月的连续 window_days 段求极差
            chunk_totals: List[cp_model.IntVar] = []
            for idx in range(0, len(month_dates), window_days):
                window_dates = month_dates[idx : idx + window_days]
                if not window_dates:
                    continue
                chunk_total = model.NewIntVar(0, len(window_dates), f"night_chunk_{emp_id}_{month_key}_{idx // window_days}")
                model.Add(chunk_total == sum(get_night_var(emp_id, d) for d in window_dates))
                chunk_totals.append(chunk_total)

            if len(chunk_totals) >= 2:
                chunk_max = model.NewIntVar(0, len(month_dates), f"night_chunk_max_{emp_id}_{month_key}")
                chunk_min = model.NewIntVar(0, len(month_dates), f"night_chunk_min_{emp_id}_{month_key}")
                model.AddMaxEquality(chunk_max, chunk_totals)
                model.AddMinEquality(chunk_min, chunk_totals)
                chunk_gap = model.NewIntVar(0, len(month_dates), f"night_chunk_gap_{emp_id}_{month_key}")
                model.Add(chunk_gap == chunk_max - chunk_min)
                distribution_terms.append(chunk_gap)

        if len(monthly_totals) >= 2:
            month_max = model.NewIntVar(0, len(month_dates), f"night_month_max_frontline_{month_key}")
            month_min = model.NewIntVar(0, len(month_dates), f"night_month_min_frontline_{month_key}")
            model.AddMaxEquality(month_max, monthly_totals)
            model.AddMinEquality(month_min, monthly_totals)
            month_gap = model.NewIntVar(0, len(month_dates), f"night_month_gap_frontline_{month_key}")
            model.Add(month_gap == month_max - month_min)
            distribution_terms.append(month_gap)
