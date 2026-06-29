# 排班求解器「最小变更 / 稳定性」目标 — 设计文档（评审稿）

> 范围：给 `solver_v4`（活跃链，端口 5005）新增一个真正的「最小变更」目标，使**重排**（请假/缺勤后的再求解）直接最小化「相对已发布排班表改了几处」，取代现状的「缩小求解范围」假稳定。改完镜像到 `solver_v5`。
> 基线：当前 `main`。所有代码引用为 `文件:行号`，均已核对。本文档**不修改任何源码**。
> 必读前置：`docs/solver_v5/research/04_objectives.md`（目标体系与真实权重表）、`docs/solver_v5/research/01_solver_core.md`（变量与求解流程）。
> 口径决策（已由排班员拍板，见 §11）：① 一次「换人」按 **2 处**变更计；② 默认力度 **偏保守·尽量别动（高权重）**；③ 本期先出本设计文档评审，暂不实现。
> 文案中文、代码符号英文，不用 emoji。

---

## 1. 背景与问题

重排是排班员每天都在做的事：任何一个人请假/缺勤，都要把那一版已经发布、车间已经看到的排班表打补丁。补丁的第一原则是**改动越小越好**——只动该动的，别人的班别尽量别碰，否则白白产生一片通知和重新确认。

现状不是这么做的。`RosterExceptionPreviewService`（`backend/src/services/rosterException/RosterExceptionPreviewService.ts`）在 `repairMode === 'MINIMAL_CHANGE'` 时，把「只把受影响的几个岗位喂给求解器、其余岗位干脆不让它看见」（`localOperationDemands` 过滤），靠「看不见就不会动」来近似稳定。代码自己挂了能力缺口标记：

```
RosterExceptionPreviewService.ts:1150-1158
capabilityGap = MINIMIZE_CHANGE_OBJECTIVE_ADAPTER_SCOPE
"solver_v4 当前没有显式人员变更最小化目标；最小变更模式通过局部 demand scope 实现"
```

这是**局部启发式，不是最小化**，三个硬伤：

1. 挡得住「不该动的岗位被动」，挡不住**它能看见的范围内乱动**——同窗口里把 A 拿下、把 B 放上，它无所谓动几次。
2. 做不了全局权衡：补 X 这个缺，是挪一个闲置的人来（动 1 处），还是从 Y 调一个再回填 Y（动 2 处）？缩窗看不到 Y，选不了更省的那条。
3. 它不是目标，没法和其它目标（均衡、工时）一起做加权权衡，也没法让排班员调「宁可多动求更优 ↔ 尽量别动」。

**本设计**给求解器加一个真正的目标项：以已发布的那版排班为基线，逐个决策变量罚「和原值不一样」，加权进总目标。求解器在满足覆盖的前提下，全局地挑「最像原版」的可行解。

---

## 2. 设计目标与不变量

**要做到：**
- 重排时**全局**最小化相对基线的变更处数，能做 1-vs-2 权衡。
- 力度可调（排班员一个三档选择），默认偏保守。
- 永远**不为省改动而牺牲覆盖**——补缺优先级绝对高于稳定性。

**不变量铁律（违反任一即废）：**

| 不变量 | 保障方式 |
|---|---|
| 关闭时逐字节等旧 | 新增 `enable_minimize_change`（默认 `False`）+ `objective_weight_change`（默认 `0`）+ 基线为空时目标 `return None`。三道闸任一成立即旧行为，无任何现有 config 键改默认值。 |
| 覆盖永远压稳定 | 权重标定在所有「软覆盖」权重之下一个数量级（§6）。批次岗位本就是硬约束（`solver.py:226` `== 1`），稳定性根本碰不到它。 |
| 目标数学不破 | 末尾 `model.Minimize(sum(objective_terms))`（`solver.py:489`）不动，新项只是 `objective_terms` 里多一项。 |
| v4/v5 等价 | solver_v5 逐字节镜像同样改动，跑 A 轮回归门禁验绿。 |

---

## 3. 数学模型：线性、零辅助变量、「换人=2 处」天然成立

每个人员/班次分配在求解器里是一个二元变量 `x ∈ {0,1}`。重排前，已发布的那版给每个变量一个**常数**基线 `b ∈ {0,1}`（原来排了=1，没排=0）。单变量变更罚分 `|x − b|` 对 0/1 变量直接线性展开，**不需要任何辅助变量**：

- `b = 1`（原来排了）→ 罚 `1 − x`（被取消则罚 1，保留则 0）
- `b = 0`（原来没排）→ 罚 `x`（新排上则罚 1，不排则 0）

总目标项（班次 + 操作两类变量都算）：

```
change_penalty
  = Σ over shift vars      [ b=1 ? (1 - x) : x ]
  + Σ over operation vars  [ b=1 ? (1 - x) : x ]
```

纯线性，OR-Tools 直接接受。`b=1` 那支的 `+1` 常数不影响 argmin，可保留（实现省一个分支）也可提出来（日志干净）。

**「换人」天然按 2 处计**（排班员口径①）：把 A 从某岗 `(op,pos)` 拿下 = 该 `(op,pos,A)` 变量 `b=1→x=0`，罚 1；把 B 放上 = `(op,pos,B)` 变量 `b=0→x=1`，罚 1。合计 2，无需任何 swap 识别逻辑。这正是排班员选的口径，也是最简实现——v1 不做 swap=1 合并。

**关于 `b=0` 那支会不会误罚新需求填补**：`b=0` 项对「新排上一个人」也罚 1，但补一个真实缺口要么被批次硬约束（`==1`）强制、要么被岗位空缺权重（1 万）强制，两者都比 `change_penalty` 权重高一个数量级（§6），所以新缺口照样补上；软罚只在「反正都可行」的多个解里把天平推向复用原班人马。

---

## 4. 数据契约变更（`solver_v4/contracts/request.py`）

完全镜像现有 `FrozenShift` / `FrozenAssignment`（`request.py:102-114`），新增两个 dataclass：

```python
@dataclass
class BaselineShift:
    """已发布排班表中的班次分配，作为最小变更目标的基线"""
    employee_id: int
    date: str            # YYYY-MM-DD
    shift_id: int

@dataclass
class BaselineAssignment:
    """已发布排班表中的操作人员分配，作为最小变更目标的基线"""
    operation_plan_id: int
    position_number: int
    employee_id: int
```

在 `SolverRequest`（`request.py:172-192`）`frozen_assignments`（:191）之后追加两个可选字段，默认空：

```python
    baseline_shifts: List[BaselineShift] = field(default_factory=list)
    baseline_assignments: List[BaselineAssignment] = field(default_factory=list)
```

并在 `from_dict`（:194 起）按现有 frozen 的解析方式补两段解析。

**为什么新开字段、不复用 `frozen_*`**：语义不同。`frozen_*` 是**区间外硬钉死**（`frozen_range.py` 把窗口外变量 `Add(var == value)` 固定），`baseline_*` 是**窗口内「还能改、但希望别改」的软目标**。混用会把软愿望误变成硬约束，导致本可调的重排变不可行。两者必须分开。

**配置键**（放进 `config` dict，与现有权重键同构，**不动** `SolverRequest` 顶层结构）：

| 键 | 类型 | 默认 | 含义 |
|---|---|---|---|
| `enable_minimize_change` | bool | `False` | 总开关 |
| `objective_weight_change` | int | `0` | 权重（§6 三档映射） |

命名对齐现有 `enable_minimize_deviation` / `objective_weight_deviation`（`solver.py:410,430`）。

---

## 5. 求解器改动（`solver_v4/objectives/` + `core/solver.py`）

### 5.1 新目标模块 `solver_v4/objectives/minimize_change.py`

继承 `ObjectiveBase`，定制签名同时收 `assignments` 与 `shift_assignments` 两个 dict（现有 `MinimizeSpecialCoverageImpactObjective` 也用定制签名，有先例）：

```python
from typing import Any, Dict, Optional
from ortools.sat.python import cp_model
from objectives.base import ObjectiveBase

class MinimizeChangeObjective(ObjectiveBase):
    """最小变更：相对已发布基线，惩罚每一处不同的分配（线性，无辅助变量）"""

    def build_expression(self, model, assignments, shift_assignments, data) -> Optional[cp_model.LinearExpr]:
        baseline_shifts = getattr(data, "baseline_shifts", []) or []
        baseline_assign = getattr(data, "baseline_assignments", []) or []
        if not baseline_shifts and not baseline_assign:
            return None  # 无基线 → 不贡献任何项，等价旧行为

        terms = []

        base_shift_keys = {(b.employee_id, b.date, b.shift_id) for b in baseline_shifts}
        for key, var in shift_assignments.items():
            terms.append(1 - var if key in base_shift_keys else var)

        base_assign_keys = {(b.operation_plan_id, b.position_number, b.employee_id) for b in baseline_assign}
        for key, var in assignments.items():
            terms.append(1 - var if key in base_assign_keys else var)

        return sum(terms) if terms else None
```

**键逐字对齐已核**：
- 班次变量键 `(emp_id, date, shift_id)` — `solver.py:263`。
- 操作变量键 `(operation_plan_id, position_number, emp_id)` — `solver.py:199`。
- 两者都是 `NewBoolVar`，二元，故 §3 线性展开成立。
- ID 稳定性：`employee_id` / `shift_id` / `operation_plan_id` / `position_number` 全来自请求级主数据，重排前后不变，键对齐成立。

### 5.2 注册点 `core/solver.py`

> **已核实**：`_build_objectives` 签名（`solver.py:361-362`）本就带 `assignments` 参数——操作级分配字典在作用域内，**无需额外传参改造**。原设计里「操作级是否要改方法签名」的待定项不存在，v1 班次级与操作级可一起做。

在权重区（`solver.py:408-414`）加一行：

```python
w_change = int(config.get("objective_weight_change", 0))
```

在 O7 三倍薪（`solver.py:466-472`）之后、O8（:474）之前插入一段，**严守 `开关 True 且 weight>0 且有变量`**：

```python
# O7.5: Minimize Change (最小变更 / 稳定性)
if (config.get("enable_minimize_change", False) and w_change > 0
        and (assignments or shift_assignments)):
    from objectives.minimize_change import MinimizeChangeObjective
    expr_change = MinimizeChangeObjective(logger=logger).build_expression(
        self.model, assignments, shift_assignments, req)
    if expr_change is not None and not isinstance(expr_change, int):
        objective_terms.append(w_change * expr_change)
        objective_desc.append(f"最小变更(×{w_change})")
```

末尾 `model.Minimize(sum(objective_terms))`（:489）不动。

---

## 6. 权重标定（关键）— 让覆盖永远赢

排班员选了「偏保守·尽量别动」，但「保守」是相对**软目标**而言；它**绝不能**压过覆盖。现有目标权重（来自 `docs/solver_v5/research/04_objectives.md` 实测表）：

| 层级 | 目标 | 权重 |
|---|---|---|
| 硬约束 | 批次岗位覆盖（`==1`，非软项） | 不可违反 |
| 软覆盖·高 | 专项欠配 O0 | 5万 / 10万 / 20万（按 priority） |
| 软覆盖 | 岗位空缺 O1 | 1万（批次）/ 5千（独立） |
| 软·其它 | 特殊班次 O4 | 100 |
| 软·其它 | 三倍薪 O7 | 10 |
| 软·其它 | 夜班/周末均衡 O5/O6 | 5 / 5 |
| 软·其它 | 工时偏差 O3 | 1 |

**天花板规则**：`objective_weight_change × (一次重排合理的最大级联移动数) < 最低软覆盖权重`。最低软覆盖 = 独立任务空缺 5千。取「合理级联 ≤ 约 9 步」，则 `weight ≤ 500` 时，哪怕动 9 个人（4500）也仍便宜于丢一个独立任务缺口（5千）——覆盖始终赢。批次缺口本就是硬约束，更碰不到。

**三档映射**（排班员侧三档下拉 → 后端 `objective_weight_change`）：

| 档位 | 权重 | 效果 |
|---|---|---|
| 偏优化：宁可多动求更优 | 50 | 比均衡(5)/工时(1)高，仍会为更优解动一动 |
| 平衡 | 200 | 明显偏向不动，但明显更优时仍调整 |
| **偏保守：尽量别动（默认，排班员所选）** | **500** | 结果最像原版、通知量最小；恰在天花板内，永不牺牲覆盖 |

> 评审需确认：你们重排的「合理最大级联移动数」是不是 ≤9。若实际可能更大，把 `500` 相应调小（保持 `weight × maxCascade < 5000`）。

---

## 7. 后端取数（`DataAssemblerV4.ts`）— 基线从哪来

基线 = **当前已发布的现态**（车间看到的那版），不是某个历史 run 快照。两张表，分别仿现有 frozen 取法、把 WHERE 从「区间外」改成「整窗口内」：

- **班次** → `employee_shift_plans`。参照 `fetchFrozenShifts`（`DataAssemblerV4.ts:1360-1384`）：取窗口内 `plan_state <> 'VOID'` 的 `(employee_id, plan_date→YYYY-MM-DD, shift_id)`。
- **操作分配** → `batch_personnel_assignments`。参照 `fetchFrozenAssignments`（`DataAssemblerV4.ts:1390-1422`）：取窗口内 `assignment_status IN ('PLANNED','CONFIRMED')` 的 `(batch_operation_plan_id, position_number, employee_id)`。

新增私有方法 `fetchBaselineShifts(...)` / `fetchBaselineAssignments(...)`（直接复制 frozen 两方法改 WHERE），在 `assemble()` 末尾、仅当 `enable_minimize_change === true` 时调用并填入 `baseline_shifts` / `baseline_assignments`；默认不查、保持空数组（门禁安全）。

> 可审计增强（v2）：基线绑定具体 `scheduling_run_id`，区分「最近 APPLIED 版」与「含手改的当前态」。v1 用当前态即可。

---

## 8. 替换现状兜底（`RosterExceptionPreviewService.ts`）

`MINIMAL_CHANGE` 路径（约 `:1029-1235`）从「缩窗装稳定」改为「开窗 + 传基线 + 给权重」：

1. **放开 scope**：不再用 `localOperationDemands` 过滤，传完整 `operation_demands`（让求解器全局可见，才能做 1-vs-2 权衡）。
2. **传基线**：填 `baseline_shifts` / `baseline_assignments`（§7 取数）。
3. **开目标 + 给权重**：config 加 `enable_minimize_change: true` + `objective_weight_change: <三档所选>`。
4. **放宽时限**：全局求解比缩窗慢，`max_time_seconds` 相应调大。
5. **去标记**：删/改 `MINIMIZE_CHANGE_OBJECTIVE_ADAPTER_SCOPE`（:1150-1158）为「已启用真目标」。

迁移期可用 `enable_minimize_change` 做新旧路径开关，缩窗代码暂留作 fallback，稳定后再删。

---

## 9. 已发生时段的处理

早上 10 点来的病假，今天上午的班已经发生、不能改。这部分走**现有硬冻结**（`frozen_*` / `locked_*`，`request.py:102-114` + `frozen_range.py`），**不进** `baseline_*` 软目标——软目标只管「未来还能改、但希望别改」的部分。粒度按天（与现有冻结一致）：今天及之前硬冻死，明天起才进最小变更软目标。子日（小时级）冻结是另一个独立缺口（当前 `solve_range` 只到「天」），不在本设计范围。

---

## 10. 门禁安全 + v5 镜像

**三道闸**任一成立即逐字节等旧：
- 开关默认 `False` → O7.5 整段不进入，目标类不实例化。
- 权重默认 `0` → 即便误开开关，`w_change > 0` 不成立，照样跳过。
- 基线为空 → `build_expression` 首句 `return None`，不追加项。

无任何现有 config 键改默认值；旧请求 `config={}` 走的代码路径与今天逐字节相同（变量数、约束数、目标项数全不变）。

**solver_v5 镜像**：把 `objectives/minimize_change.py`、`contracts/request.py` 两 dataclass + 两字段、`core/solver.py` 注册段同样落到 `solver_v5/`，跑 v5 A 轮逐字节回归门禁确认绿。

---

## 11. 排班员口径决策

**已拍板（本设计已据此固化）：**

| # | 决策 | 选择 | 落地 |
|---|---|---|---|
| ① | 一次「换人」算几处变更 | **2 处**（逐人计） | §3 天然成立，v1 不做 swap 合并 |
| ② | 默认「别动」力度 | **偏保守·尽量别动（高权重）** | §6 默认档 = 500 |
| ③ | 本期范围 | **先出设计文档评审，暂不实现** | 本文档 |

**留待 v2 的口径（v1 先不做，记录在案）：**
- 「同一个人改时间」vs「换不同人」是否不同价（车间扰动其实前者更小）。v1 一律同价。
- swap 识别（换一个人合并计 1）。
- 连续滑杆暴露权重（v1 先三档下拉）。

---

## 12. 分阶段实现与验收

**v1（最小可用）**
- 班次级 + 操作级最小变更（作用域已具备，§5.2）。
- 全部变更同价、无 swap、无分级。
- 仅在 `RosterExceptionPreviewService` 的 `MINIMAL_CHANGE` 路径开启，三档下拉给权重，默认偏保守(500)。

**v2（细化）**
- 换人 vs 改时间分级罚分；可选 swap 识别。
- 连续滑杆；基线绑定 `scheduling_run_id` 做审计。
- 已发生时段的子日（小时级）冻结与基线切分（依赖另一项 `solve_range` 小时化缺口）。

**验收**
- **门禁（关）逐字节**：`config={}`、`enable_minimize_change=False`、以及 `enable=True 但 weight=0` 三种，跑现有回归套件（参照 `solver_v4/tests/test_config_toggles.py` 的 `create_mock_request`），目标值/解哈希必须与 golden 完全一致。solver_v5 同跑 A 轮。
- **定向场景（开）**：构造「已知排班表 + 某人某天病假」的重排请求，传基线 + 开目标。断言：(a) 缺被补上、覆盖不退化；(b) 相对基线变更处数显著少于「不开目标」同场景；(c) 提高权重时变更处数单调不增。
- 两端 `tsc` 过、后端 `npm run test:ci`、求解器 `python3 -m unittest`。

---

## 13. 改动文件清单（实现时）

| 文件 | 改动 | 锚点 |
|---|---|---|
| `solver_v4/contracts/request.py` | 加 2 dataclass + 2 字段 + `from_dict` 解析 | :102-114 / :172-192 / :194 |
| `solver_v4/objectives/minimize_change.py` | 新建目标类 | — |
| `solver_v4/core/solver.py` | 加 `w_change` 权重 + O7 后插注册段 | :408-414 / :466-474 / :489 |
| `backend/src/services/schedulingV4/DataAssemblerV4.ts` | 加 `fetchBaseline*` 两方法 + 装配 | 仿 :1360-1384 / :1390-1422 |
| `backend/src/services/rosterException/RosterExceptionPreviewService.ts` | 去缩窗、传基线、开目标、删 capabilityGap | :1029-1235 / :1150-1158 |
| `solver_v5/`（全部镜像） | 同 v4 改动 + A 轮回归 | — |

前端：三档下拉接入 `MINIMAL_CHANGE` 重排面板（具体组件待 §11 评审后定）。

---

## 14. 待评审决策（open）

1. **级联上限 → 权重天花板**：你们一次重排合理的最大级联移动数是不是 ≤9？决定偏保守档是否取 500（§6）。
2. **基线源**：用「当前 `batch_personnel_assignments`/`employee_shift_plans` 现态（含手改）」还是「最近 APPLIED run 快照」？v1 建议前者（更贴排班员心里的「原来那版」）。
3. **区间重解语义**：`solve_range` 子区间重排时，基线只取区间内、还是整窗口都取来惩罚远端扰动？建议整窗口取（更稳），需与求解侧确认。
4. **独立任务（standalone）基线键**：独立任务无标准 `position_number`，基线键用 `(operation_plan_id, position_number, employee_id)` 是否对所有 standalone 成立？需核 standalone 的 position 生成方式。
5. **前端力度控件落点**：三档下拉挂在分诊台处置抽屉还是重排预览页？
