---
trigger: always_on
---

规则详细内容 (Rule Content):
1. 变量域与规模控制 (Variable Domain & Scale Control)
紧致域原则 (Tight Bounds)：严禁默认使用 [0, 1000000]。必须根据业务逻辑计算出物理上限，定义尽可能窄的 IntVar 范围。
布尔优先 (Boolean over Int)：如果一个状态只有 0/1，必须使用 NewBoolVar。CP-SAT 在底层会将整数拆解为布尔，直接使用布尔变量能显著减少解空间。
稀疏结构 (Sparse Modeling)：严禁创建全量的三维/四维嵌套列表。
Bad: vars[i][j][k] (若 
i
,
j
,
k
i,j,k
 组合中 90% 是非法的)。
Good: 使用 Dict 存储变量，仅为合法的业务组合创建变量：vars[(i,j,k)] = model.NewBoolVar(...)。
2. 高效约束表达 (Efficient Constraint Design)
全局约束优先 (Global Constraints)：严禁使用大量的 if 或手动循环模拟逻辑。
必须优先使用 model.AddAllowedAssignments (Table constraints) 处理复杂的排列组合。
使用 model.AddElement 代替手动索引查找。
在排程问题中强制使用 model.AddCumulative (资源容量) 或 model.AddCircuit (路径闭环)。
避免 Big-M (No Big-M)：在 CP-SAT 中，Big-M 会导致传播效率低下。应尽可能使用 OnlyEnforceIf 结合布尔指示变量。
矢量化约束：优先使用 model.AddLinearConstraint(sum(vars), min, max) 而非在循环中多次调用 model.Add(v == 0)。
3. 目标函数设计 (Objective Function Optimization)
数值缩放 (Integer Scaling)：OR-Tools 仅处理整数。若涉及小数（如价格 12.55），必须显式缩放（如乘以 100 转换为 1255）。
惩罚项权重 (Penalty Balancing)：
避免目标函数中各系数差异过大（如 
1
1
 和 
10
9
10 
9
 
），这会导致求解器数值不稳定。
必须对不同维度的目标（如成本、延迟）进行权重对齐，并注释说明缩放倍数。
多目标策略：若存在主次目标，优先推荐“分阶段求解”或“Lexicographic Optimization”（先求 A，锁定 A 后再求 B）。
4. 路由求解器特有优化 (Routing Solver Specialization)
回调缓存 (Callback Caching)：在 RegisterTransitCallback 中，必须确保回调逻辑极快，严禁在回调内进行数据库查询或重计算，应预计算 Matrix。
搜索策略 (Search Strategy)：
对于大规模 VRP 问题，必须显式配置 PATH_CHEAPEST_ARC 和 GUIDED_LOCAL_SEARCH。
必须设置 time_limit 并在日志中输出 ObjectiveValue()。
5. 诊断与 Debug (Diagnostic & Log)
自审计 (Self-Audit)：模型生成后，必须自动打印变量总数和约束总数：print(f"Vars: {len(model.Proto().variables)}")。
不可行性诊断 (Infeasibility)：如果求解结果为 INFEASIBLE，必须包含一个可选的调试模块，利用 model.AddAssumptions 或通过放宽软约束来定位冲突。
