# V4 求解器目标函数体系精读报告

> 适读对象：从零实现 V5 求解器的工程师。  
> 所有代码引用格式为 `文件路径:行号`。

---

## 1. 目标函数的组合方式

### 1.1 整体架构：单层加权求和

V4 使用单一 `model.Minimize(sum(objective_terms))` 调用，将所有目标合并为一个整数线性（或伪线性）表达式。  
入口在 `solver_v4/core/solver.py:362`（`_build_objectives` 方法），组合逻辑在 `solver_v4/core/solver.py:488`：

```python
self.model.Minimize(sum(objective_terms))
```

没有层次化目标（Lexicographic）、也没有 Pareto 前沿枚举，**完全依赖权重差异形成优先级**。

### 1.2 目标注册顺序与权重一览

`_build_objectives` 按固定顺序向 `objective_terms` 列表追加各项；OR-Tools 对各项相加后一视同仁，顺序不影响结果，**只有权重决定优先级**。

| 编号 | 目标名称 | config 开关 | config 权重键 | 默认权重 | 说明 |
|------|----------|-------------|--------------|----------|------|
| O0 | 专项班次欠配惩罚 (`MinimizeSpecialCoverageShortage`) | 无独立开关（靠数据是否存在） | 内部硬编码 PRIORITY_WEIGHTS | CRITICAL:200000 / HIGH:100000 / NORMAL:50000 | 最高优先级；按需求 priority_level 分档 |
| O1 | 岗位空缺最小化 (`MinimizeVacancies`) | 无独立开关（靠 vacancy_vars 是否存在） | `objective_weight_vacancy`(默 10000) / `objective_weight_standalone_vacancy`(默 5000) | 10000 / 5000 | 第二高优先级；动态乘数使峰值日和非标准时段权重更高 |
| O2 | 专项班次工艺影响 (`MinimizeSpecialCoverageImpact`) | 同 O0 | `objective_weight_special_coverage_impact` | **1** | 极低权重；仅在候选人有 impact_cost 时生效 |
| O3 | 工时偏差最小化 (`MinimizeHoursDeviation`) | `enable_minimize_deviation` (默 True) | `objective_weight_deviation` | **1** | SCALE_FACTOR=100 已内含精度；权重还是 1 → 量纲极小 |
| O4 | 特殊班次数量最小化 (`MinimizeSpecialShifts`) | `enable_minimize_special_shifts` (默 True) | `objective_weight_special_shifts` | **100** | 每个 SPECIAL 班次计 1；权重 100 |
| O5 | 夜班均衡 (`BalanceNightShifts`) | `enable_balance_night_shifts` (默 True) | `objective_weight_night_balance` | **5** | L2 范数（平方和），量纲约为 0~961/员工 |
| O6 | 周末均衡 (`BalanceWeekendWork`) | `enable_balance_weekend_work` (默 True) | `objective_weight_weekend_balance` | **5** | 同 L2 范数 |
| O7 | 三倍薪日成本 (`MinimizeTripleSalaryCost`) | `enable_minimize_triple_salary` (默 True) | `objective_weight_triple_salary` | **10** | 节假日工作班次数，每个计 1 |
| O8 | 管理岗偏好惩罚 (LeadershipCoverage soft) | `enable_leadership_coverage` (默 True) | 多个：见下方 | 20/10/30/50 | 非独立目标对象，由约束模块注入 ctx.leadership_penalty_vars |

> **权重来源**：全部来自 `data.config`（即 `SolverRequest.config`，对应后端下发的 JSON `config` 字段）。`ObjectiveBase.weight` 属性目前未被任何地方读取，仅注释说"For future multi-objective weighted sum"。

### 1.3 管理岗偏好惩罚权重（O8）

由 `solver_v4/constraints/leadership_coverage.py:203-237` 在约束阶段注入 `ctx.leadership_penalty_vars`（`List[Tuple[BoolVar, int]]`），`_build_objectives` 直接 `sum(var * weight)`：

| config 键 | 默认值 | 含义 |
|-----------|--------|------|
| `objective_weight_leader_nonworkday` | 20 | 领导在非工作日上班 |
| `objective_weight_leader_workday_rest` | 10 | 领导在工作日休息 |
| `objective_weight_leader_ops` | 30 | soft-policy 领导参与生产操作 |
| `objective_weight_leader_special` | 50 | 领导使用 SPECIAL 班次 |

---

## 2. 各目标最小化内容、表达式构造与量纲

### 2.1 O0 — `MinimizeSpecialCoverageShortageObjective`

**文件**：`solver_v4/objectives/minimize_special_coverage_shortage.py`  
**最小化**：专项班次需求的未满足人数（加权）  
**表达式**：

```
Σ(PRIORITY_WEIGHTS[req.priority_level] × shortage_var[req.occurrence_id])
  for req in data.special_shift_requirements
```

- `shortage_var[occurrence_id]`：`NewIntVar(0, required_people, ...)`，即单次需求最多缺少 `required_people` 人
- 权重分档：CRITICAL=200000，HIGH=100000，NORMAL=50000（第 13-17 行）
- **量纲**：整数，0 ~ Σ(required_people × priority_weight)；每缺 1 人产生 50000~200000 惩罚

### 2.2 O1 — `MinimizeVacanciesObjective`

**文件**：`solver_v4/objectives/minimize_vacancies.py`  
**最小化**：岗位空缺数（加动态权重）  
**表达式**：

```
Σ(final_weight[op_id, pos_num] × vacancy_var[op_id, pos_num])
  for (op_id, pos_num) in vacancy_vars
```

其中 `final_weight = base_weight × peak_mult × off_hours_mult`：

- `base_weight`：BATCH 岗位取 `config["objective_weight_vacancy"]`（默 10000）；STANDALONE 取 `config["objective_weight_standalone_vacancy"]`（默 5000）
- `peak_mult`：0.5 ~ 2.0，由当天总需人数 / 全周期日均需人数计算
- `off_hours_mult`：操作开始时间在 08:00 前或 17:00 后时，取 `config["off_hours_multiplier"]`（默 1.5），否则 1.0
- **量纲**：整数，0 ~ Σ(10000 × 2.0 × 1.5) per vacancy = 最高 30000 per vacancy

### 2.3 O2 — `MinimizeSpecialCoverageImpactObjective`

**文件**：`solver_v4/objectives/minimize_special_coverage_impact.py`  
**最小化**：专项班次排班对候选人的工艺影响成本  
**表达式**：

```
Σ(candidate.impact_cost × cover_var[occurrence_id, employee_id])
  for requirement in data.special_shift_requirements
  for candidate in requirement.candidates
  if impact_cost > 0
```

- `impact_cost`：`SpecialShiftCandidate.impact_cost`（整数，由后端计算），量纲由业务定义
- 全局乘以 `w_impact = config["objective_weight_special_coverage_impact"]`（默 **1**）
- **量纲**：极低；设计为"成本差异"而非绝对惩罚，实际影响几乎被 O0/O1 掩盖

### 2.4 O3 — `MinimizeHoursDeviationObjective`

**文件**：`solver_v4/objectives/minimize_deviation.py`  
**最小化**：每个员工实际排班工时与标准工时的绝对偏差之和  
**表达式**：

```
Σ deviation_var[emp_id]  (SCALE_FACTOR=100 内含)
  s.t. deviation_var[e] >= actual_hours_expr[e] - standard_hours_scaled
       deviation_var[e] >= standard_hours_scaled - actual_hours_expr[e]
```

- `standard_hours = workday_count × 8.0h`（优先用 `data.calendar.is_workday` 计数，回退按周一到周五）
- `standard_hours_scaled = standard_hours × 100`；`actual_hours_expr = Σ(shift.nominal_hours × 100 × var)`
- `max_deviation = standard_hours_scaled × 2`（上界）
- 最终权重 `w1 = config["objective_weight_deviation"]`（默 **1**）
- **量纲**：缩放后整数；例如 22 个工作日 × 8h = 176h，scaled = 17600；绝对偏差 1h = 100 单位；乘权重 1 → 对 O4 (weight=100) 影响极小

### 2.5 O4 — `MinimizeSpecialShiftsObjective`

**文件**：`solver_v4/objectives/minimize_special_shifts.py`  
**最小化**：`plan_category == "SPECIAL"` 的班次使用总次数  
**表达式**：

```
Σ shift_var[emp_id, date, shift_id]
  where ShiftDefinition.plan_category == "SPECIAL"
  and shift.nominal_hours > 0.01  (排除 REST)
```

- 每使用一次 SPECIAL 班次计 1
- 权重 `w2 = config["objective_weight_special_shifts"]`（默 **100**）
- **量纲**：0 ~ E×D（员工数 × 排班天数），权重 100 × 次数

### 2.6 O5 — `BalanceNightShiftsObjective`

**文件**：`solver_v4/objectives/balance_night_shifts.py`  
**最小化**：所有员工夜班次数的平方和（L2 范数）  
**表达式**：

```
Σ squared_count_var[emp_id]
  s.t. count_var[e] = Σ shift_var[e,d,s] for s in night_shift_ids
       squared_count_var[e] = count_var[e] * count_var[e]
```

- `night_shift_ids`：`ShiftDefinition.is_night_shift == True` 的所有班次
- `count_var` 上界 31（每月最多 31 天）；`squared_count_var` 上界 961
- 使用 `model.AddMultiplicationEquality` 实现平方（非线性！）
- 权重 `w3 = config["objective_weight_night_balance"]`（默 **5**）
- **量纲**：每人 0~961，N 人时最大 961N；L2 范数在总夜班固定时，均匀分配时值最小

### 2.7 O6 — `BalanceWeekendWorkObjective`

**文件**：`solver_v4/objectives/balance_weekend_work.py`  
**最小化**：所有员工周末/节假日工作天数的平方和  
**表达式**：与 O5 同构，区别：

- 统计的班次是：`date in non_workday_dates`（`CalendarDay.is_workday == False`）且 `nominal_hours > 0.01`
- `count_var` 上界 = 该员工可能在周末排班的最大次数（实际槽数）
- 权重 `w4 = config["objective_weight_weekend_balance"]`（默 **5**）
- **量纲**：同 O5 结构

### 2.8 O7 — `MinimizeTripleSalaryCostObjective`

**文件**：`solver_v4/objectives/minimize_triple_salary.py`  
**最小化**：法定节假日（三倍薪日）上的工作班次总次数  
**表达式**：

```
Σ shift_var[emp_id, date_str, shift_id]
  where date_str in triple_salary_dates
  and shift_id not in rest_shift_ids
```

- `triple_salary_dates`：`CalendarDay.is_triple_salary == True` 的所有日期
- 权重 `w5 = config["objective_weight_triple_salary"]`（默 **10**）
- **量纲**：0 ~ E×|triple_salary_dates|，每次计 1

### 2.9 O8 — LeadershipCoverage 软惩罚

**文件**：由 `solver_v4/constraints/leadership_coverage.py` 注入，在 `_build_objectives` 的末尾追加  
**不是独立 Objective 类**，而是 `ctx.leadership_penalty_vars: List[Tuple[BoolVar, int]]`：

| 场景 | BoolVar | 权重 |
|------|---------|------|
| 领导在非工作日上班（Rule 3） | `shift_var[leader, non_workday, work_shift]` | 20 |
| 领导在工作日休息（Rule 3） | `shift_var[leader, workday, rest_shift]` | 10 |
| soft-policy 领导被分配操作（Rule 4a） | `assign_var[op, pos, leader]` | 30 |
| 领导使用 SPECIAL 班次（Rule 4b） | `shift_var[leader, date, special_shift]` | 50 |

---

## 3. 目标之间的冲突权衡

### 3.1 主要冲突对

| 冲突 | 原因 | 在 V4 的解决方式 |
|------|------|----------------|
| **O1（空缺惩罚）vs O3（工时偏差）** | 填满岗位需要人员多上班，工时增加，偏差扩大 | O1 权重(10000) >> O3 权重(1×100缩放=≈100)，O1 绝对主导 |
| **O4（减少 SPECIAL 班次）vs O1（减少空缺）** | 某些时段只能用 SPECIAL 班覆盖，减少 SPECIAL 会留空缺 | O1(10000) >> O4(100)，优先填满岗位 |
| **O5/O6（均衡）vs O7（减少节假日上班）** | 均衡要求把假日班分散给更多人，减少三倍薪则要减少假日上班总量 | 三者权重相近(5/5/10)，实际由问题规模决定主次 |
| **O0（专项需求满足）vs 所有其他目标** | 专项班次占用员工，可能影响普通操作排班 | O0 权重最高(50000~200000)，绝对优先 |
| **O8 领导偏好 vs O1 空缺填充** | 减少 GROUP_LEADER 参与操作(w=30)，但某时段只有领导有资质 | 硬约束 Rule 1（有操作日必须有领导在岗）已限定上界；软惩罚被 O1(10000) 碾压 |

### 3.2 量级对比（典型数值估算）

以 30 天、20 名员工、50 个操作的典型月排班为例：

| 目标 | 典型贡献量级 |
|------|------------|
| O0 每缺 1 人（HIGH） | 100,000 |
| O1 每个空缺（BATCH，峰值日，非标准时段） | 30,000 |
| O1 每个空缺（BATCH，平均） | 10,000 |
| O4 每个 SPECIAL 班次 | 100 |
| O3 工时偏差 1h（1 人） | 100（缩放后，权重 1） |
| O5/O6 夜班/周末分配完全不均 | 5 × 最大方差（最高数千） |
| O7 每个三倍薪日班次 | 10 |
| O8 领导每次违偏好 | 10~50 |

**结论**：O0 > O1 >> O4 ≈ O3（量级） ≈ O5/O6（方差项） >> O7 > O8 各项。

---

## 4. 求解结果中目标分量是否单独上报

### 4.1 上报内容（`_extract_solution` 返回的 `metrics` 字段）

`solver_v4/core/solver.py:908-919`：

```python
"metrics": {
    "assigned_count": ...,
    "scheduled_shifts": ...,
    "total_deviation_hours": total_deviation,   # objective_value / 100 (注意：这是总目标值÷100，非O3单项)
    "objective_value": objective_value,          # 总加权目标值（未分解）
    "best_bound": best_bound,
    "gap": gap_percent,
    "vacant_positions": vacant_count,
    "total_positions": total_positions,
    "fill_rate": fill_rate,
    "special_shift_shortage_total": ...,        # Σ shortage_people
}
```

**没有各目标的 breakdown**。`total_deviation_hours = objective_value / 100` 这个命名有误导性：它实际是**总加权目标值**除以 100（源于历史仅有 MinimizeHoursDeviation 时的遗留），而非工时偏差小时数。

### 4.2 可间接推算的数量

| 可推算项 | 方法 |
|---------|------|
| 空缺数 | `metrics.vacant_positions` |
| 专项欠配总人次 | `metrics.special_shift_shortage_total` + 明细列表 `special_shift_shortages[]` |
| 是否最优 | `metrics.gap == 0` |
| 工时偏差（需重算） | 对比员工班次工时与 workday_count×8h，需后端重算 |

---

## 5. 给定相同输入，如何客观对比两次求解结果优劣

### 5.1 优先级规则（V5 验收框架建议）

1. **主目标（硬性门槛）**：`special_shift_shortage_total == 0`（专项班次需求完全满足）
2. **主目标 2**：`fill_rate == 100%`（无岗位空缺）；若有允许空缺场景，则比较 `vacant_positions` 更小者胜
3. **次目标**：`objective_value` 更小者胜（但注意：总目标值混合了多个量级不同的项，需谨慎使用）
4. **质量指标**（目标值相近时）：
   - 夜班方差：重算 `Var(NightCount[e])`，更小者更均衡
   - 周末方差：重算 `Var(WeekendWorkCount[e])`
   - 三倍薪日班次总数：比较 `Σ(work_shifts on triple_salary_dates)`
   - 工时偏差：重算 `Σ|actual_hours[e] - standard_hours[e]|`

### 5.2 V5 验证接口建议

V5 结果 JSON 应新增 `objective_breakdown` 字段：

```json
{
  "objective_breakdown": {
    "special_shortage_penalty": ...,
    "vacancy_penalty": ...,
    "hours_deviation_scaled": ...,
    "special_shift_count": ...,
    "night_shift_variance": ...,
    "weekend_work_variance": ...,
    "triple_salary_count": ...,
    "leadership_penalty": ...
  }
}
```

这样才能做到 V4 vs V5 按分量逐项比对，而不是只看不透明的总加权值。

---

## 6. 关键实现细节与踩坑点

### 6.1 `minimize_hours.py` 注册但从未被 `_build_objectives` 调用

`MinimizeTotalHoursObjective` 在 `__init__.py:5` 被 export，但 `_build_objectives` **从未实例化它**。它是一个"备用"目标，V4 已用 `MinimizeHoursDeviation`（O3）替代了直接最小化工时的思路。V5 实现时不要误以为存在"最小化总工时"目标。

### 6.2 O3 权重过低导致其实际无效

`objective_weight_deviation` 默认值为 1，缩放后每工时偏差 = 100 单位，而 O4 每个 SPECIAL 班次 = 100 × 100 = 10000 单位。在有 SPECIAL 班次的场景下，工时偏差目标几乎被淹没，排班结果的工时均衡完全靠约束（`standard_hours` 硬限）而非此目标保证。V5 若想真正做到工时均衡，需要大幅提升 `w1` 或重新设计。

### 6.3 非线性目标（O5/O6 平方）的性能影响

`AddMultiplicationEquality` 引入辅助 IntVar 和乘法约束，使模型变为非线性 MIP（实质上 CP-SAT 会用分支定界处理）。员工人数多时这两项会显著增加搜索空间。V5 若员工 > 100 人，建议改用线性近似（如 MaxMinNight 差值的线性化）。

### 6.4 vacancy_vars 触发 O1 的条件

O1 只在 `vacancy_vars` 非空时激活（`solver_v4/core/solver.py:384`），而 `vacancy_vars` 只在 `allow_vacancy = True` 且候选人存在时被创建。若全部岗位都强制必须填满（`allow_position_vacancy=False` 且 `allow_standalone_vacancy=False`），`vacancy_vars` 为空，O1 完全不生效——此时 vacancy 由硬约束 `sum == 1` 处理，而非目标函数。

### 6.5 `total_deviation_hours` 字段命名误导

`solver_v4/core/solver.py:812-813`：

```python
if objective_value is not None and objective_value > 0:
    total_deviation = objective_value / 100.0
```

这个 `total_deviation_hours` 是**总加权目标值 ÷ 100**，并非真实的工时偏差小时数。由于 O0 权重达 100000 级，当有专项欠配时该字段值可能高达数百万"小时"，完全脱离工时物理意义。前端/后端不应将其解读为工时。

### 6.6 O0/O1 无独立 config 开关

与 O3~O7（有 `enable_*` 开关）不同，O0 和 O1 没有 `enable_*` config 键。它们通过数据是否存在来决定激活：`special_shortage_vars` 为空时 O0 不生效；`vacancy_vars` 为空时 O1 不生效。V5 应为其补充显式开关。

### 6.7 LeadershipCoverage 权重由约束层注入

O8 的 penalty 变量是在 `_apply_constraints` 阶段（Phase 3）写入 `ctx.leadership_penalty_vars`，然后在 `_build_objectives`（Phase 4）读取。如果 Phase 3 执行时 `enable_leadership_coverage=False`，`ctx.leadership_penalty_vars` 为空列表，O8 自动消失。这个跨阶段耦合是个隐式依赖，V5 设计时应避免。

### 6.8 `absolute_gap_limit = 0.99` 意味着整数最优即停

`solver_v4/core/solver.py:43`：
```python
self.solver.parameters.absolute_gap_limit = 0.99
```
由于所有目标项均为整数，当 `objective_value - best_bound < 1` 时等价于找到整数最优解，求解器自动停止。这避免了 callback 中手动检测 gap==0 的开销。V5 应保留这个参数。
