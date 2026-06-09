# solver_v4 求解效率优化行动清单

**总体判断：** 当前最大瓶颈是**建模层变量爆炸与 Python 回调阻塞的双重叠加**——`shift_assignments` 对全员无过滤建变量、FrozenRange 子求解模式下 67% 变量被建后立即锁定、以及 `on_solution_callback` 内同步 HTTP push 直接阻塞 CP-SAT 工作线程，三者共同造成搜索时间大量浪费；"快赢"在于将回调改为异步队列（零模型改动、立竿见影）和将 `shift_assignments` 范围收缩到真实候选员工（改动量小、收益确定）。

---

## P0：高收益低风险，优先实施

### P0-1 on_solution_callback 内同步 HTTP push 阻塞 CP-SAT 工作线程

**位置：** `solver_v4/core/callback.py:100-112`

**为何影响效率：** CP-SAT 工作线程在 HTTP 返回前完全暂停搜索，单次最坏阻塞 7 秒（2s timeout × 2 retry + 0.5s delay）。早期高解频阶段可累计浪费 30–70 秒 worker 时间。

**怎么改：** 在 `on_solution_callback` 中仅将 payload 放入 `queue.Queue`（`put_nowait`），由独立 sender 线程负责取出后发送，每 1 秒批量发送一次最新状态。callback 本体不做任何网络 IO。

**风险/注意：** sender 线程需处理队列满和发送失败；`StopSearch` 信号仍需在 callback 线程中执行（不可移入 sender 线程），仅网络推送异步化。

---

### P0-2 shift_assignments 对全体 employee_profiles 建变量，未限定为操作候选人

**位置：** `solver_v4/core/solver.py:222-229`（变量建立），同 `solver_v4/objectives/balance_night_shifts.py:71-95`、`balance_weekend_work.py:64-87`

**为何影响效率：** 典型场景（80 人含 20 名无关领导）相比只建候选员工（60 人）多出 20×30×5=3000 个 BoolVar，以及对应的 one-shift-per-day 等式约束、工时偏差变量、夜班计数平方变量等。无关员工还被拉进均衡目标，干扰搜索方向。

**怎么改：** 将外层循环从 `{ep.employee_id for ep in req.employee_profiles}` 替换为 `index.get_all_employees()`（仅出现在至少一个 `candidate_employee_ids` 中的员工）。如业务上领导层也需排班，应由 backend `DataAssemblerV4` 显式传入 `scheduled_employee_ids`，而非默认展开全量。

**风险/注意：** 需同步检查均衡目标（`balance_night_shifts`、`balance_weekend_work`）遍历员工的来源集合也一并收窄；若某些全局班次约束（StandardHours、ConsecutiveDays）依赖"全员"，需确认语义兼容性。

---

### P0-3 _cache_current_solution 每次目标值改进时全量遍历所有变量

**位置：** `solver_v4/core/callback.py:201-217`

**为何影响效率：** 每次 `obj_value < best_objective` 即触发全量 `self.Value(var)` 遍历，约 13000 次串行调用，全部阻塞 CP-SAT worker 线程。前 60 秒内 20 次改进可累积 100–400 ms 停顿。

**怎么改：** ① 仅在 gap 下降超过 1% 阈值时才更新缓存；② 若 `StopSearch` 后仍可调用 `solver.Value()`，根本不需缓存——只在确实需要 `StopSearch` 时才触发全量写；③ 可优先只缓存 `assignments` 和 `shift_assignments`，`vacancy`/`special` 变量数量少可后补。

**风险/注意：** 确认 `FEASIBLE` 状态下 `solver.Value()` 可正常调用，否则保留最后一次缓存路径作保底。

---

### P0-4 push_progress 对每个解无条件推送（含非改进解）

**位置：** `solver_v4/core/callback.py:99-112`

**为何影响效率：** 多 worker 模式下 LNS 子问题可频繁找到非最优可行解，每次都触发网络推送，解频高（>1/s）时产生大量无用 HTTP 流量，额外加重 P0-1 的阻塞。

**怎么改：** 在 `push_progress` 调用前加条件：`if obj_value < self.best_objective or self.solution_count <= 3`，仅推送改进解和最初几个解（保证进度条有反应）。

**风险/注意：** 前端进度条依赖推送频率，确保最终解和超时退出仍强制推送一次。

---

### P0-5 绝对最优间隙未在 CP-SAT 参数层设置，依赖 Python callback 判断

**位置：** `solver_v4/core/solver.py:36-41`

**为何影响效率：** 当前通过 Python callback 计算 gap 后调用 `StopSearch()`，多一次 GIL 获取和 HTTP push 开销。设置 C++ 层参数可内部自动终止，无需触发 Python 层。

**怎么改：** 在初始化中加一行：`self.solver.parameters.absolute_gap_limit = 0.99`。callback 中的 `abs_gap < 0.99` 检测可保留作日志，但 `StopSearch` 可删除（C++ 已处理）。

**风险/注意：** 两行改动，零风险，可立即回滚。

---

### P0-6 extend_rest 软惩罚：3 条半归约约束可压缩为 1 条 AddMinEquality（与维度三 P0 合并）

**位置：** `solver_v4/constraints/night_shift.py:410-422`

**为何影响效率：** 为每个 (emp, night_date, offset, working_shift) 四元组创建 1 个 BoolVar + 3 条 `OnlyEnforceIf` 约束。典型规模产生 4500 个 BoolVar + 13500 条约束，是全模型中单一建模决策带来最多中间变量的地方。

**怎么改：** 用 `model.AddMinEquality(penalty_var, [is_night, var])` 替代 3 条半归约约束——对布尔变量等价于 AND，CP-SAT 内部有专用传播器，只生成 1 条约束。

**风险/注意：** `AddMinEquality` 的语义与 AND 等价需验证（布尔域 `min(a,b) == a AND b`），可用单元测试覆盖。

---

## P1：高收益中等改动，次优先

### P1-1 FrozenRange 子求解模式下全月班次变量被大量建立后立刻 pin 为常数

**位置：** `solver_v4/core/solver.py:219-229`（变量建立），`solver_v4/constraints/frozen_range.py:66-86`（pin 约束）

**为何影响效率：** 月初只求前 10 天时仍为整月 30 天建全量变量，FrozenRange 随后为窗口外每个变量添加 `var == expected`。以 60 人×5 班×20 冻结天为例，6000 个变量立刻被固定，占总班次变量的 67%。

**怎么改：** 在 `_build_variables` 中读取 `solve_range`，仅为 `solve_range` 内日期建 `shift_assignments`；冻结日期直接从 `frozen_shifts` 读取常数值用于边界约束，不建 BoolVar。

**风险/注意：** 需同步更新 `ConsecutiveDays`、`NightShift` 等约束的 `boundary` 处理逻辑（已有 `historical_shifts` 支撑，但需确认跨窗口边界语义正确）。改动量较大，需充分回归测试。

---

### P1-2 is_working_shift_map 在 10+ 个约束文件中各自独立重建（公共结构预计算）

**位置：** `constraints/night_shift.py:74-80`、`consecutive_days.py:58-60`、`work_days_limit.py:47-53`、`consecutive_work_rest_pattern.py:91-94`、`leadership_coverage.py:135-145`、`standard_hours.py:56-68` 及另 5 个文件

**为何影响效率：** 11 个约束文件各自循环 `data.shift_definitions` 独立构建 `is_working_shift_map`、`night_shift_ids`、`rest_shift_ids` 等集合。分散在多处还存在一致性风险：某处修改判断标准（如改用 `plan_category` 字段）其他处不同步就会产生语义不一致。

**怎么改：** 在 `SolverContext`（`core/context.py`）中预计算并缓存这些衍生结构：`working_shift_ids`、`rest_shift_ids`、`night_shift_ids`、`window_dates` 列表。builder 在 `_apply_constraints` 前统一填充，所有约束直接读取 `ctx.working_shift_ids`。

**风险/注意：** 改动涉及文件多，建议分批替换并保留回归测试覆盖各约束语义。

---

### P1-3 shift_assignments 被 8+ 个模块重复全量遍历（统一预建分组索引）

**位置：** `constraints/standard_hours.py:117`、`constraints/night_shift.py:144-160`、`constraints/consecutive_days.py:86-88`、`objectives/minimize_deviation.py:89-91`、`objectives/balance_night_shifts.py:64-66`、`objectives/balance_weekend_work.py:59-61`、`objectives/minimize_special_shifts.py:86-88`、`objectives/minimize_triple_salary.py:56-58`

**为何影响效率：** 8 次独立全量遍历，大规模请求（>50 员工×31 天×5 班）建模阶段可累积数秒 Python 层开销，与短时求解竞争。

**怎么改：** 在 `SolverContext` 中一次性预建：`emp_shift_vars: Dict[int, List[(date,shift_id,var)]]`、`emp_night_vars: Dict[int, List[var]]`、`emp_date_shift_map: Dict[(int,str), List[(shift_id,var)]]`。由 `_build_variables` 末尾统一构建，所有模块从 `ctx` 取用。

**风险/注意：** 与 P1-2 共用 `SolverContext` 扩展路径，可合并为一次重构。

---

### P1-4 增量重排场景缺少 warm-start（AddHint），每次从零开始搜索

**位置：** `solver_v4/core/solver.py:47-102`、`solver_v4/constraints/frozen_range.py:1-121`

**为何影响效率：** 每次增量重排从随机初始点搜索，对「全月模型+只改动 3–7 天」的主要使用模式，首个可行解出现时间可能比带 hint 慢 3–5 倍。

**怎么改：** ① 在 `SolverRequest` 增加 `hinted_assignments` 和 `hinted_shifts` 字段；② backend `DataAssemblerV4` 在增量解时从上次 `result_summary` 填充；③ 在 `_build_variables` 末尾遍历 `req.hinted_*` 调用 `model.AddHint()`；④ 设置 `self.solver.parameters.repair_hint = True`。

**风险/注意：** 需 backend、contracts、solver 三层联动改动；hint 不改变可行域，不影响最优性，安全。

---

### P1-5 LeadershipCoverageConstraint 全量遍历 assignments 两次，未用 AssignmentIndex

**位置：** `solver_v4/constraints/leadership_coverage.py:191`（Rule 2）和 `:245`（Rule 4a）

**为何影响效率：** Rule 2 和 Rule 4a 均用 `for key, var in assignments.items()` 全量扫描后过滤，`AssignmentIndex` 已提供按员工 ID 的倒排索引。大规模（500+ 操作）时拖慢建模阶段数秒。

**怎么改：** 改写为 `for emp_id in ops_banned_emp_ids: for (op_id, pos_num, var) in ctx.index.get_assignments_for_emp(emp_id): model.Add(var == 0)`。Rule 4a 同理。

**风险/注意：** 纯建模阶段优化，不改变约束语义，风险极低。

---

### P1-6 目标函数权重量级悬殊：空缺 10000 vs 均衡 5，差距约 2000 倍

**位置：** `solver_v4/core/solver.py:374-379`、`solver_v4/objectives/minimize_vacancies.py:35`

**为何影响效率：** 均衡目标在 LP 松弛中对目标下界贡献极低，CP-SAT 事实上忽略均衡目标直到空缺已最小化，相当于搜索树携带"死重"目标却无引导信号。

**怎么改：** 短期将 `w3`/`w4` 从 5 提升至 50–200；中期方案：将目标拆分两层（lexicographic priority），第一层最小化空缺和专项短缺，第二层最小化其余软目标，将第一层最优值作为硬约束后再求解第二层。

**风险/注意：** 权重调整会改变排班结果，需业务侧评估均衡目标与空缺目标的优先级边界；层级优化需两次 solve，增加总耗时（但每次更专注）。

---

### P1-7 L2 平方目标引入 O(N×D) LP 行膨胀，改为 min-max 极差线性化

**位置：** `solver_v4/objectives/balance_night_shifts.py:80-94`、`solver_v4/objectives/balance_weekend_work.py:73-86`

**为何影响效率：** `AddMultiplicationEquality` 在 `linearization_level=2` 下对每个乘积生成约 (D+1) 条分段线性切割，50 员工两个目标合计约 3200 条额外 LP 行，每个 B&B 节点的 LP 子问题规模显著增大（约 16 倍 LP 行膨胀）。

**怎么改：** 引入 `max_night_var`/`min_night_var` 两个 IntVar，对每位员工 `count_var` 各加两条线性约束（`count <= max` 和 `count >= min`），目标改为 `w3*(max_night - min_night)`。总额外变量从 100 降至 4，约束从约 3200 LP 行降至 200 线性行。

**风险/注意：** 语义从最小化方差改为最小化极差，对"尽量平均"的排班场景实践中结果接近，但需业务确认接受极差目标。可通过对比测试验证。

---

### P1-8 stagnation_limit 默认与 max_time_seconds 等值（300s），停滞检测实际无效

**位置：** `solver_v4/core/solver.py:111`

**为何影响效率：** 困难实例"找到可行解但 5 分钟无改进"时应尽早返回已有最佳解，但当前默认下必须等满 300 秒。

**怎么改：** 将 `stagnation_limit` 默认值从 300 改为 60–90 秒，或在 `DataAssemblerV4`/`solveOrchestrator` 中显式传入独立的 `stagnation_limit=60`。同步修正 `callback.py` 中默认 60s 与 `solver.py` 中 300s 的文档不一致。

**风险/注意：** 对于确实需要长时间搜索才能收敛的实例，过短的停滞限制会导致次优结果，建议先在真实数据上测试合适阈值。

---

### P1-9 NightExtRest 惩罚变量聚合：one-shift-per-day 保证只需 1 个 penalty_var 每员工每夜班日

**位置：** `solver_v4/constraints/night_shift.py:410-423`（与 P0-6 互补，面向变量数量聚合）

**为何影响效率：** 当前为每个 (is_night=1, working_shift=1) 组合建独立 penalty BoolVar，而 one-shift-per-day 已保证同一天至多一个工作班次为 1，各工作班次的 penalty 可聚合为一个变量。

**怎么改：** 将同一员工同一夜班日的所有工作班次 penalty 聚合为单一 `penalty_var`（因 one-shift-per-day 保证至多一个工作班次为 1），约束数从 `shift * working_count` 降为 `shift` 数，配合 P0-6 的 `AddMinEquality` 改写。

**风险/注意：** P0-6 和 P1-9 应一起实施，完成后做约束语义等价性验证。

---

### P1-10 工时偏差 SCALE_FACTOR=100 造成 w1 权重语义失真

**位置：** `solver_v4/objectives/minimize_deviation.py:39`、`solver_v4/core/solver.py:375`

**为何影响效率：** `w1=1` 的"真实有效权重"是 100（每小时偏差惩罚），但文档和调参者均以为是 1，导致调参时设置出数值不合理的目标组合，间接使求解器陷入相互冲突的大权重目标中长时间搜索。

**怎么改：** 在 `minimize_deviation.py` 注释中明确标注"w1 的实际每小时惩罚 = w1×SCALE_FACTOR"；建议将 `w1 * expr1 / SCALE_FACTOR` 使 w1 语义统一为每小时偏差惩罚，与其他权重基础单位对齐。

**风险/注意：** 改动权重语义会改变数值配置，需同步更新所有调用方的 w1 传参值（乘以 100）；可分两步：先加文档注释，再做数值归一化。

---

### P1-11 IsNight 聚合变量：2 条半归约约束换为 1 条 AddMaxEquality

**位置：** `solver_v4/constraints/night_shift.py:157-159`

**为何影响效率：** 为每个 (emp, date) 创建 `is_night` BoolVar 并用两条 half-reification，50 员工×30 天产生 1500 BoolVar 和 3000 约束。`AddMaxEquality` 是 CP-SAT 原生全局约束，传播比两条线性半归约约束更高效。

**怎么改：** 替换为 `model.AddMaxEquality(is_night, night_vars)`（对布尔变量，`MaxEquality` 等价于逻辑 OR）。

**风险/注意：** 语义等价性需验证（`max(a,b)==1` 等价于 `a OR b`），改动量小，风险低。

---

### P1-12 monitor_loop 每秒 GET 轮询后端 stop 状态，已有 abort 端点可替代

**位置：** `solver_v4/core/solver.py:503-531`、`solver_v4/core/callback.py:61,277-290`

**为何影响效率：** 300 秒求解产生 300 次 GET 请求；`poll_interval` 字段已定义但从未使用（每次都无条件轮询）。高网络延迟环境（局域网目标机）下 monitor 线程积压会拉长 `sleep(1.0)` 精度。

**怎么改：** ① 短期：用 `if now - self.last_poll_time > 5.0` 将轮询间隔从 1s 改为 5s（`last_poll_time` 字段已存在但未接入）；② 长期：完全删除 server-poll，改为 abort 端点直接调用 `callback.request_stop()`（`ACTIVE_CALLBACKS` + `callback.request_stop()` 已实现，`app.py` abort endpoint 已有此路径）。

**风险/注意：** 删除 server-poll 后，abort 端点是唯一中断路径，需确认其可靠性。

---

### P1-13 parse_iso_to_unix 在全流程超过 1000 次重复调用，可统一预建缓存

**位置：** `solver_v4/constraints/prefer_standard_shift.py:79,105`、`solver_v4/constraints/unique_employee.py:87-93`、`solver_v4/constraints/employee_availability.py`

**为何影响效率：** 同一 op 的 `planned_start`/`planned_end` 不变但被多处重复 parse，全流程超过 1000 次字符串 parse 调用。

**怎么改：** 在 `_apply_constraints` 入口统一预建 `ctx.op_times: Dict[int, Tuple[int,int]] = {op.operation_plan_id: (parse_iso_to_unix(op.planned_start), parse_iso_to_unix(op.planned_end)) for op in req.operation_demands}`，所有约束从 `ctx.op_times` 取用。

**风险/注意：** 需确认所有使用 `parse_iso_to_unix` 的地方都改为从 `ctx` 取，防止遗漏导致不一致。

---

## P2：低优先级，有代码依据但收益有限或改动成本较高

### P2-1 consecutive_work_rest_pattern 与 consecutive_days 约束在启用时产生冗余

**位置：** `solver_v4/constraints/consecutive_work_rest_pattern.py:154-171`、`solver_v4/constraints/consecutive_days.py:134-144,191-200`

**问题：** 当 `ConsecutiveWorkRestPatternConstraint` 启用时（默认 OFF），较紧的 pattern 约束（max_work=3）逻辑上蕴含较松的 consecutive_days 约束（max_work=6），后者完全冗余但 CP-SAT 不能自动检测跨约束蕴含。50 员工×30 天约产生 2500 条冗余约束。

**怎么改：** 在 `ConsecutiveDaysConstraint` 中接受 `exclude_emps` 参数跳过已被 pattern 覆盖的员工；或在 registry 层用配置分支——启用 pattern 时自动跳过对应员工的 consecutive_days 约束。

**风险/注意：** 默认关闭状态无影响，仅在 pattern 约束启用时生效。

---

### P2-2 对称性破缺仅依赖 CP-SAT 自动检测（symmetry_level=2），未做手工辅助提示

**位置：** `solver_v4/core/solver.py:41`（及 `solver_v4/core/solver.py:162-166` assignments 变量建立）

**问题：** 当同一操作多个岗位的候选员工集合完全相同时，存在 P!（岗位数阶乘）倍的置换对称性；`symmetry_level=2` 不能保证完全消除应用层对称。

**怎么改：** 当操作的所有 `position_qualifications` 的 `candidate_employee_ids` 集合相同时，添加 lexicographic 约束：对候选员工排序后，要求较小 `emp_id` 优先占较小 `pos_number`。

**风险/注意：** 此问题的实际收益需 profiling 确认（标见下节），引入额外约束有增加模型复杂度的风险，建议在确认对称性确实是瓶颈后再实施。

---

### P2-3 FLEXIBLE 任务提取的 O(P×F) 全表扫描

**位置：** `solver_v4/core/solver.py:700-715`

**问题：** 每个已赋值的 FLEXIBLE 任务都对整个 `ctx.task_placements` 字典做完整遍历（`p_op_id == op_id` 内层过滤），总复杂度 O(assigned_flexible × D×S×F)。

**怎么改：** 维护 `op_placement_map: Dict[int, List[Tuple[str,int,IntVar]]]` 二级索引（在 `FlexibleSchedulingConstraint.apply` 完成后存入 ctx），提取时直接 O(D×S) 查找。

**风险/注意：** 改动范围小，风险低，但 FLEXIBLE 任务在当前实际使用频率需确认。

---

### P2-4 vacancy 变量建模使用两个 OnlyEnforceIf 约束，存在冗余

**位置：** `solver_v4/core/solver.py:186-191`

**问题：** 每个允许空缺的岗位用两条 reified 约束编码 `var_vacant == (sum == 0)`，可用单一线性等式替代。

**怎么改：** 替换为 `model.Add(var_vacant + sum(candidates_vars) == 1)` + `model.Add(sum(candidates_vars) <= 1)`，两条约束取代两个 reified 约束。

**风险/注意：** 语义等价性需在单元测试中验证（`sum <= 1` 由前一条约束保证是前提）。

---

### P2-5 Python sum() 替代 LinearExpr.Sum()

**位置：** `objectives/minimize_vacancies.py:82`、`objectives/balance_night_shifts.py:99`、`objectives/balance_weekend_work.py:96`、`objectives/minimize_deviation.py:128`、`objectives/minimize_special_shifts.py:95`、`constraints/standard_hours.py:131`、`constraints/consecutive_days.py:98,143`

**问题：** Python 内置 `sum()` 逐个创建中间 `LinearExpr` 对象，OR-Tools 的 `LinearExpr.WeightedSum()` 在 C++ 层一次性构建，无中间对象。

**怎么改：** 将 `sum(terms)` 替换为 `cp_model.LinearExpr.Sum(terms)`，将 `sum(w*v for w,v in ...)` 替换为 `cp_model.LinearExpr.WeightedSum(vars, weights)`。

**风险/注意：** 仅影响建模阶段（求解耗时通常是建模的 10–100 倍），收益有限，作为代码清理项统一处理。

---

### P2-6 NightCount 变量域硬编码为 31，未收紧到实际可达上界

**位置：** `solver_v4/objectives/balance_night_shifts.py:80`

**问题：** `count_var = model.NewIntVar(0, 31, ...)` 使用固定上界，实际最大值是 `len(night_vars)`（约 15–25），域越宽分段线性切割点越多。

**怎么改：** 将 `0, 31` 改为 `0, len(night_vars)`，与 `balance_weekend_work` 保持一致的紧界做法。

**风险/注意：** 一行改动，零风险。

---

### P2-7 share_group._get_operation_candidates 与 extract_solution share group 合规检查的 O(N) 扫描

**位置：** `solver_v4/constraints/share_group.py:132-139`（建模阶段），`solver_v4/core/solver.py:820-856`（提取阶段）

**问题：** 两处均对全量 `operation_demands` 或 `assignments` 字典做 O(N) 线性扫描，而 `AssignmentIndex` 提供 O(1) 查找。

**怎么改：** 建模阶段在 `apply()` 入口预建 `op_map = {op.operation_plan_id: op for op in data.operation_demands}`；提取阶段传入 index 或预建临时 `op_id→assigned_emps` 字典。

**风险/注意：** 影响偏低，可合并为一次代码清理。

---

## 需 profiling/实测验证的假设

以下发现在静态审核中无法确定净收益，需用真实排班请求跑过才能定论：

| 假设 | 来源位置 | 需验证内容 |
|---|---|---|
| `linearization_level=2` 是否优于默认值 1 | `solver_v4/core/solver.py:40` | 对同一批典型请求，level=1 vs 2 各跑一次，比较 wall_time 和 solution_count 曲线；若 level=1 提前达到相同 gap，恢复默认值 |
| 对称性破缺（P2-2）实际是否是搜索瓶颈 | `solver_v4/core/solver.py:41` | 开启 `log_search_progress=True`，观察同一目标值等价分支数量（solution count 快速增长但 objective 不改善则是信号）；若无此现象，手工对称破缺无必要 |
| UniqueEmployee 最大团过滤 O(cliques²) 是否是建模热点 | `solver_v4/constraints/unique_employee.py:170-176` | 仅在某员工是数十个密集重叠操作的候选人时触发 O(D⁴) 最坏情况；先用 Python profiler（`cProfile`）在大规模请求上定位 `_build_variables` 热点后再决定是否优化 |
| monitor_loop GIL 竞争对搜索的实际影响 | `solver_v4/core/solver.py:503-531` | 高网络延迟（>100ms）部署时用 `time.perf_counter` 在 callback 中测量实际 GIL 等待时间；低延迟局域网环境可能影响微乎其微 |
| Python sum() 建模开销的绝对量 | 各 objectives 文件 | 在大规模请求（200 员工×31 天）下用 `cProfile` 测量 `_build_objectives` 总耗时，若建模时间 < 2 秒则 P2-5 可推迟 |