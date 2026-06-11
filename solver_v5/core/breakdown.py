"""
ObjectiveBreakdown — O0-O8 分量观测变量工厂（S3，R2 验收基石）

设计铁律（10_solver_design §3.1-3.3 + 实施计划 §1.4 / S3）：
  · "观测不改优化"：不动 model.Minimize 的任何 term，只**额外**为每个分量
    建一个显式观测 IntVar `obs == exprN_unweighted`。
  · 用与 objective_terms 完全相同的 exprN 对象（同一引用），不可能漂移。
  · 等价断言（运行期 + CI）：
        Σ (外层权重_k × obs_value_k) == solver.ObjectiveValue()  （整数严格相等）
    权重集冻结：{O0:1, O1:1, O2:w_impact, O3:w1, O4:w2, O5:w3, O6:w4, O7:w5, O8:1}
    O0/O1/O8 的全部权重已内嵌进表达式，外层乘子恒为 1（不得再乘 base_weight）。
  · enable_objective_breakdown=false → 不建任何观测变量、result/callback 均省略 breakdown 字段。
  · lex（S6）路径必需 obs_total（== sum(objective_terms) 的总目标观测变量）。

Python 3.9 兼容（无 match、无 X|Y 运行时注解）。
"""

from typing import Dict, List, Optional, Tuple
from ortools.sat.python import cp_model


# 9 个分量键（冻结，与 §1.2 callback / §1.4 result schema 逐字符一致）
# 顺序对应 O0..O8。
BREAKDOWN_KEYS = [
    "special_shortage_penalty",  # O0
    "vacancy_penalty",           # O1
    "special_impact",            # O2
    "hours_deviation_scaled",    # O3
    "special_shift_count",       # O4
    "night_shift_variance",      # O5
    "weekend_work_variance",     # O6
    "triple_salary_count",       # O7
    "leadership_penalty",        # O8
]

# 每个分量键 → 外层乘子在 weights_applied 里用的名字（O0/O1/O8 无外层乘子，恒 1）。
# 用于运行期等价断言重建权重集，以及 result.metrics.objective_breakdown.weights_applied。
KEY_TO_WEIGHT_NAME = {
    "special_impact": "special_impact",       # O2 → w_impact
    "hours_deviation_scaled": "hours_deviation",  # O3 → w1
    "special_shift_count": "special_shifts",      # O4 → w2
    "night_shift_variance": "night_balance",      # O5 → w3
    "weekend_work_variance": "weekend_balance",   # O6 → w4
    "triple_salary_count": "triple_salary",       # O7 → w5
}

# 观测变量上界（非负惩罚/成本和；CP-SAT 域；留足余量，不影响最优）。
_OBS_UB = 1 << 40  # ~1.1e12，> O3 在 30 人规模 ~528000 的最坏估算，安全且不触 LP 精度风险


class ObjectiveBreakdown:
    """O0-O8 分量观测变量注册表（挂在 SolverV5 实例上）。

    用法（solver._build_objectives 内）：
        self.breakdown = ObjectiveBreakdown(self.model, enabled=...)
        ...
        # term 同时：(1) 乘外层权重塞 objective_terms（与 V4 一致）
        #            (2) 注册未乘权重的原始 exprN
        objective_terms.append(w1 * expr1)
        self.breakdown.register("hours_deviation_scaled", expr1, weight=w1)
        ...
        self.breakdown.finalize_total(objective_terms)   # 建 obs_total
    """

    def __init__(self, model: cp_model.CpModel, enabled: bool = True):
        self._model = model
        self.enabled = bool(enabled)
        # key → 观测 IntVar
        self._obs_vars: Dict[str, cp_model.IntVar] = {}
        # key → 外层权重（O0/O1/O8 恒 1）
        self._weights: Dict[str, int] = {}
        # 总目标观测变量（lex 路径 + 等价自检）
        self._obs_total: Optional[cp_model.IntVar] = None

    def register(self, key: str, expr, weight: int = 1):
        """为分量 key 建观测变量 obs == expr（expr 是与 objective_terms 同一个未乘权重对象）。

        enabled=False 时直接返回（不建变量，省略字段）。
        weight 是该分量的**外层乘子**（O0/O1/O8 传 1）。整数常量 expr 跳过（无变量可观测）。
        """
        if not self.enabled:
            return None
        if key not in BREAKDOWN_KEYS:
            raise ValueError("Unknown breakdown key: %s" % key)
        if expr is None or isinstance(expr, int):
            # 退化为常量的分量（无 term 进入 objective）——记权重但不建观测变量。
            self._weights[key] = int(weight)
            return None
        obs = self._model.NewIntVar(-_OBS_UB, _OBS_UB, "obs_%s" % key)
        # 用同一个 exprN 对象建等式约束 —— 与 objective_terms 里的 expr 引用一致，不可能漂移。
        self._model.Add(obs == expr)
        self._obs_vars[key] = obs
        self._weights[key] = int(weight)
        return obs

    def finalize_total(self, objective_terms: List):
        """建 obs_total == sum(objective_terms)（lex 第二阶段必需；等价自检亦用）。

        必须在所有 register() 之后、与 model.Minimize(sum(objective_terms)) 用**同一个**
        objective_terms 列表调用，保证 obs_total 与最终目标逐项一致。
        """
        if not self.enabled:
            return None
        if not objective_terms:
            return None
        obs_total = self._model.NewIntVar(-_OBS_UB, _OBS_UB, "obs_total")
        self._model.Add(obs_total == sum(objective_terms))
        self._obs_total = obs_total
        return obs_total

    @property
    def obs_total(self) -> Optional[cp_model.IntVar]:
        return self._obs_total

    @property
    def obs_vars(self) -> Dict[str, cp_model.IntVar]:
        return dict(self._obs_vars)

    def weight_of(self, key: str) -> int:
        return int(self._weights.get(key, 1))

    def read_values(self, value_getter) -> Dict[str, int]:
        """用 value_getter(var)->int 读出每个已注册观测变量的当前值。

        value_getter 应是兼容缓存回退的取值器（如 solver.Value，或 get_var_value 包装）。
        未注册的分量（disabled term / 常量退化）省略 —— 与 V4 "无该 term 即省略" 行为一致；
        但为下游 schema 完整性，未建变量的已知分量补 0（仅当该 key 曾被 register 记权重）。
        返回 dict 含且仅含 BREAKDOWN_KEYS 子集；调用方负责组装最终 schema。
        """
        out: Dict[str, int] = {}
        for key in BREAKDOWN_KEYS:
            if key in self._obs_vars:
                out[key] = int(value_getter(self._obs_vars[key]))
            elif key in self._weights:
                # term 退化为常量（无变量），分量值视为 0（该 term 对目标无变量贡献）。
                out[key] = 0
        return out

    def read_total(self, value_getter) -> Optional[int]:
        if self._obs_total is None:
            return None
        return int(value_getter(self._obs_total))

    def build_metrics_breakdown(self, value_getter,
                                weights_applied: Dict[str, int]) -> Optional[Dict]:
        """组装 result.metrics.objective_breakdown（含 9 分量 + weights_applied）。

        enabled=False → 返回 None（调用方省略键）。
        weights_applied 是外层 w_impact/w1..w5 的实际值（O0/O1/O8 不含其中，恒 1 内嵌）。
        """
        if not self.enabled:
            return None
        values = self.read_values(value_getter)
        # 保证 9 键齐全（未建变量的分量补 0），便于前端区块 d 渲染。
        breakdown = {}
        for key in BREAKDOWN_KEYS:
            breakdown[key] = int(values.get(key, 0))
        breakdown["weights_applied"] = dict(weights_applied)
        return breakdown

    def assert_equivalence(self, value_getter, objective_value) -> Tuple[int, int]:
        """运行期等价自检：Σ(外层权重_k × obs_k) == round(objective_value)。

        返回 (weighted_sum, objective_value_int)。调用方/测试断言两者相等。
        权重集 {O0:1,O1:1,O2:w_impact,O3:w1,O4:w2,O5:w3,O6:w4,O7:w5,O8:1}，
        其中 O0/O1/O8 的 weight_of() 恒为 1（register 时传 1，权重已内嵌表达式）。
        """
        values = self.read_values(value_getter)
        weighted_sum = 0
        for key, val in values.items():
            weighted_sum += self.weight_of(key) * int(val)
        obj_int = int(round(float(objective_value)))
        return weighted_sum, obj_int
