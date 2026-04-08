"""
Consecutive Work-Rest Pattern Constraint Module

当员工在排班窗口内有操作安排时，强制执行"连续上班 + 连续休息"的排班模式：
- 上班：连续至少 min_work 天，至多 max_work 天
- 休息：连续至少 min_rest 天，至多 max_rest 天

仅对"有操作安排"的员工生效——即至少是一个工序候选人的员工。

高级配置（data.config 字段）：
    enable_consecutive_work_rest_pattern  (bool): 开关，默认 False（在高级配置中暴露）
    min_consecutive_work_days_pattern     (int):  最少连续上班天数，默认 2
    max_consecutive_work_days_pattern     (int):  最多连续上班天数，默认 3
    min_consecutive_rest_days_pattern     (int):  最少连续休息天数，默认 2
    max_consecutive_rest_days_pattern     (int):  最多连续休息天数，默认 3

约束建模原理（W[d] = 1 表示第 d 天上班，0 表示休息）：

  MAX 连续上班：任意 (max_work+1) 天的窗口内，sum(W) <= max_work
  MAX 连续休息：任意 (max_rest+1) 天的窗口内，sum(W) >= 1
  MIN 连续上班：W[d+j] + W[d-1] >= W[d]，j=1..min_work-1
               含义：若 W[d-1]=0 且 W[d]=1（上班开始），则后续 j 天也必须上班
  MIN 连续休息：W[d+j] + W[d-1] - W[d] <= 1，j=1..min_rest-1
               含义：若 W[d-1]=1 且 W[d]=0（休息开始），则后续 j 天也必须休息
"""

from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Union

from constraints.base import BaseConstraint
from contracts.request import SolverRequest
from core.context import SolverContext


def _is_var(x) -> bool:
    """判断是否为 CP-SAT 变量（非 Python int 字面量）。"""
    return not isinstance(x, int)


class ConsecutiveWorkRestPatternConstraint(BaseConstraint):
    """
    员工连续上班/休息天数范围约束。

    同时约束：
      - 上班块长度 ∈ [min_work, max_work]
      - 休息块长度 ∈ [min_rest, max_rest]

    仅对有操作候选资格的员工生效。
    """

    name = "ConsecutiveWorkRestPattern"
    is_hard = True

    def apply(self, ctx: SolverContext, data: SolverRequest) -> int:
        model = ctx.model
        shift_assignments = ctx.shift_assignments

        if not shift_assignments:
            self.log("No shift assignments present. Skipping.", level="info")
            return 0

        # ── 读取配置 ──────────────────────────────────────────────
        cfg = data.config or {}
        min_work = self._safe_int(cfg, "min_consecutive_work_days_pattern", 2)
        max_work = self._safe_int(cfg, "max_consecutive_work_days_pattern", 3)
        min_rest = self._safe_int(cfg, "min_consecutive_rest_days_pattern", 2)
        max_rest = self._safe_int(cfg, "max_consecutive_rest_days_pattern", 3)

        # 基本合法性校验
        if min_work < 1 or max_work < min_work:
            self.log(
                f"Invalid work config: min={min_work}, max={max_work}. Skipping.",
                level="warning",
            )
            return 0
        if min_rest < 1 or max_rest < min_rest:
            self.log(
                f"Invalid rest config: min={min_rest}, max={max_rest}. Skipping.",
                level="warning",
            )
            return 0

        self.log(
            f"Work [{min_work}–{max_work}] days, Rest [{min_rest}–{max_rest}] days."
        )

        # ── 识别"工作班次" ─────────────────────────────────────────
        is_working_shift_map = {
            s.shift_id: (s.nominal_hours > 0.01)
            for s in (data.shift_definitions or [])
        }

        # ── 识别有操作安排的员工 ───────────────────────────────────
        operation_employees: set = set()
        for op in data.operation_demands:
            for pos in op.position_qualifications:
                operation_employees.update(pos.candidate_employee_ids)

        if not operation_employees:
            self.log("No employees with operations. Skipping.", level="info")
            return 0

        self.log(
            f"Pattern constraint applies to {len(operation_employees)} employees."
        )

        # ── 解析排班窗口 ───────────────────────────────────────────
        if not data.window:
            self.log("No window defined. Skipping.", level="warning")
            return 0

        try:
            w_start = datetime.strptime(data.window["start_date"], "%Y-%m-%d").date()
            w_end = datetime.strptime(data.window["end_date"], "%Y-%m-%d").date()
            total_days = (w_end - w_start).days + 1
        except Exception as e:
            self.log(f"Window parse error: {e}", level="error")
            return 0

        date_list = [
            (w_start + timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(total_days)
        ]
        T = total_days

        # ── 按员工 & 日期归集"工作班次变量" ────────────────────────
        emp_date_vars: dict = defaultdict(lambda: defaultdict(list))
        for (emp_id, date, shift_id), var in shift_assignments.items():
            if emp_id in operation_employees and is_working_shift_map.get(shift_id, False):
                emp_date_vars[emp_id][date].append(var)

        # ── 逐员工施加约束 ─────────────────────────────────────────
        constraints_added = 0

        for emp_id in operation_employees:
            date_vars = emp_date_vars.get(emp_id, {})

            # 构建每日"是否上班"表达式 W[0..T-1]
            # - 0（Python int）：该日无工作班次变量，必然休息
            # - BoolVar / LinearExpr：可以是 0 或 1
            W: List[Union[int, object]] = []
            for date_str in date_list:
                vars_today = date_vars.get(date_str, [])
                if not vars_today:
                    W.append(0)
                elif len(vars_today) == 1:
                    W.append(vars_today[0])
                else:
                    W.append(sum(vars_today))

            # 1. MAX 连续上班：滑动窗口 sum <= max_work
            win = max_work + 1
            if win <= T:
                for i in range(T - win + 1):
                    window = W[i : i + win]
                    # 若全为字面 0，无需添加约束
                    if any(_is_var(w) for w in window):
                        model.Add(sum(window) <= max_work)
                        constraints_added += 1

            # 2. MAX 连续休息：滑动窗口 sum >= 1
            win = max_rest + 1
            if win <= T:
                for i in range(T - win + 1):
                    window = W[i : i + win]
                    if any(_is_var(w) for w in window):
                        model.Add(sum(window) >= 1)
                        constraints_added += 1

            # 3. MIN 连续上班：W[d+j] + W[d-1] >= W[d]，j=1..min_work-1
            #    含义：上班开始（W[d-1]=0→W[d]=1）后必须连续至少 min_work 天
            if min_work >= 2:
                for d in range(1, T):
                    for j in range(1, min_work):
                        dj = d + j
                        if dj >= T:
                            break  # 窗口末尾允许截断，不强制
                        w_prev = W[d - 1]
                        w_curr = W[d]
                        w_next = W[dj]
                        c = self._add_min_work(model, w_prev, w_curr, w_next)
                        constraints_added += c

            # 4. MIN 连续休息：W[d+j] + W[d-1] - W[d] <= 1，j=1..min_rest-1
            #    含义：休息开始（W[d-1]=1→W[d]=0）后必须连续至少 min_rest 天
            if min_rest >= 2:
                for d in range(1, T):
                    for j in range(1, min_rest):
                        dj = d + j
                        if dj >= T:
                            break
                        w_prev = W[d - 1]
                        w_curr = W[d]
                        w_next = W[dj]
                        c = self._add_min_rest(model, w_prev, w_curr, w_next)
                        constraints_added += c

        self.log(
            f"Added {constraints_added} consecutive work-rest pattern constraints "
            f"for {len(operation_employees)} employees."
        )
        return constraints_added

    # ── 工具方法 ──────────────────────────────────────────────────

    def _safe_int(self, cfg: dict, key: str, default: int) -> int:
        try:
            return int(cfg.get(key, default))
        except (ValueError, TypeError):
            self.log(
                f"Invalid config value for '{key}', using default {default}.",
                level="warning",
            )
            return default

    def _add_min_work(self, model, w_prev, w_curr, w_next) -> int:
        """
        添加 MIN 连续上班约束：W[d+j] + W[d-1] >= W[d]

        当 w_prev=0, w_curr=1（上班块起点）时，强制 w_next=1。
        其余情况约束自动满足。
        返回实际添加的约束数量（0 或 1）。
        """
        # 全为字面量：直接计算
        if not _is_var(w_prev) and not _is_var(w_curr) and not _is_var(w_next):
            if w_prev == 0 and w_curr == 1 and w_next == 0:
                # 逻辑上无法满足（字面上违反），记录警告但不能在模型层阻止
                self.log(
                    "[WARN] Literal isolated work day detected in W array.",
                    level="warning",
                )
            return 0

        # w_curr 字面为 0 → 该日必然不上班，约束右侧 <= 0，天然满足
        if not _is_var(w_curr) and w_curr == 0:
            return 0

        # w_prev 字面为 1 → 非上班块起点，约束 w_next + 1 >= w_curr 天然满足
        if not _is_var(w_prev) and w_prev == 1:
            return 0

        # w_next 字面为 1 → 约束 1 + w_prev >= w_curr 天然满足
        if not _is_var(w_next) and w_next == 1:
            return 0

        # 通用情况：model.Add(w_next + w_prev >= w_curr)
        model.Add(w_next + w_prev >= w_curr)
        return 1

    def _add_min_rest(self, model, w_prev, w_curr, w_next) -> int:
        """
        添加 MIN 连续休息约束：W[d+j] + W[d-1] - W[d] <= 1

        当 w_prev=1, w_curr=0（休息块起点）时，强制 w_next=0。
        其余情况约束自动满足。
        返回实际添加的约束数量（0 或 1）。
        """
        # 全为字面量
        if not _is_var(w_prev) and not _is_var(w_curr) and not _is_var(w_next):
            return 0

        # w_curr 字面为 1 → 非休息块起点，约束 w_next + w_prev - 1 <= 1，天然满足
        if not _is_var(w_curr) and w_curr == 1:
            return 0

        # w_prev 字面为 0 → 非休息块起点，约束 w_next + 0 - w_curr <= 1，
        # 因 w_next <= 1 且 w_curr >= 0，天然满足
        if not _is_var(w_prev) and w_prev == 0:
            return 0

        # w_next 字面为 0 → 约束 0 + w_prev - w_curr <= 1，
        # 因 w_prev <= 1，天然满足
        if not _is_var(w_next) and w_next == 0:
            return 0

        # 通用情况：model.Add(w_next + w_prev - w_curr <= 1)
        model.Add(w_next + w_prev - w_curr <= 1)
        return 1
