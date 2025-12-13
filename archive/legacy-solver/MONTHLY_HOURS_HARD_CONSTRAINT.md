# 月度工时约束升级说明

## 更新内容

将月度工时约束从**软约束**升级为**硬约束**，确保严格遵守工时范围。

## 变更对比

### 之前：软约束 🟡

```python
# 软约束：允许上下限存在松弛，避免无解
underflow = model.NewIntVar(0, lower_bound, f"month_under_{emp_id}_{m_key}")
overflow = model.NewIntVar(0, upper_bound, f"month_over_{emp_id}_{m_key}")
model.Add(total_month_minutes + underflow >= lower_bound)
model.Add(total_month_minutes - overflow <= upper_bound)
monthly_penalty_terms.extend([underflow, overflow])

# 目标函数中的罚分
obj += sum(monthly_penalty_terms) * 5  # 5分/分钟
```

**特点：**
- ✅ 可以违反工时限制
- ✅ 总能找到可行解
- ⚠️ 违反时有惩罚（5分/分钟）
- ⚠️ 无法保证100%合规

### 现在：硬约束 🔴

```python
# 硬约束：月度工时必须在范围内（不可违反）
model.Add(total_month_minutes >= lower_bound)
model.Add(total_month_minutes <= upper_bound)
```

**特点：**
- ✅ **必须**满足工时范围
- ✅ 100%保证合规
- ⚠️ 可能导致求解失败
- ⚠️ 需要更合理的人力配置

## 配置参数

月度工时范围由以下参数控制：

### monthlyMinHours（默认：0）
- 相对标准工时的**下限偏移**（小时）
- 示例：标准176小时，设为0，则下限=176小时

### monthlyMaxHours（默认：8）
- 相对标准工时的**上限偏移**（小时）
- 示例：标准176小时，设为8，则上限=184小时

### enforceMonthlyHours（默认：true）
- 是否启用月度工时约束
- 设为 `false` 可完全禁用此约束

## 计算示例

### 示例1：2025年10月
- 工作日：22天
- 标准工时：22 × 8 = 176小时
- `monthlyMinHours = 0` → 下限：176小时（10,560分钟）
- `monthlyMaxHours = 8` → 上限：184小时（11,040分钟）
- **允许范围：176-184小时**

### 示例2：2月（少工作日）
- 工作日：20天
- 标准工时：20 × 8 = 160小时
- `monthlyMinHours = 0` → 下限：160小时（9,600分钟）
- `monthlyMaxHours = 8` → 上限：168小时（10,080分钟）
- **允许范围：160-168小时**

## 硬约束的影响

### ✅ 优势

1. **严格合规**
   - 确保每个员工的月度工时在规定范围内
   - 符合劳动法和薪酬管理要求
   - 避免超时或工时不足导致的劳资纠纷

2. **可预测性**
   - 工资计算更准确
   - 避免意外的加班费支出
   - 人力成本更可控

3. **公平性**
   - 所有员工工时相对均衡
   - 避免个别员工长期超时或闲置

### ⚠️ 潜在风险

1. **求解失败风险增加**
   - 如果人手不足，无法在工时限制内完成所有操作
   - 求解器会返回 `INFEASIBLE`（无可行解）
   - 需要增加人员或调整操作计划

2. **灵活性降低**
   - 无法通过少量超时来应对紧急情况
   - 短期人手紧张时可能无解

3. **配置敏感性**
   - `monthlyMaxHours` 设置过小可能导致频繁失败
   - 需要根据实际情况合理配置

## 应对策略

### 如果出现求解失败

**情况1：工时不足（无法达到下限）**
```
原因：员工没有足够的工作可做
解决：
- 增加BASE班次（非操作工作日）
- 降低 monthlyMinHours
- 减少员工数量
```

**情况2：工时超标（超过上限）**
```
原因：操作太多，员工工作量过大
解决：
- 增加员工人数
- 提高 monthlyMaxHours
- 优化操作计划，减少操作数量
- 调整操作时间分布
```

### 推荐配置

#### 方案1：严格模式（当前默认）
```json
{
  "monthlyMinHours": 0,    // 不允许低于标准工时
  "monthlyMaxHours": 8,    // 最多加班8小时/月
  "enforceMonthlyHours": true
}
```

#### 方案2：宽松模式
```json
{
  "monthlyMinHours": -8,   // 允许少8小时
  "monthlyMaxHours": 16,   // 允许加班16小时/月
  "enforceMonthlyHours": true
}
```

#### 方案3：禁用约束
```json
{
  "enforceMonthlyHours": false  // 完全不限制月度工时
}
```

## 其他硬约束对比

升级后，求解器的硬约束列表：

| 约束 | 类型 | 说明 |
|------|------|------|
| 操作分配上限 | 硬约束 | 每个操作不超过需求人数 |
| Leader覆盖 | 硬约束 | 有生产日必须有leader |
| 夜班休息（第1天） | 硬约束 | 夜班后第1天必须休息 |
| **月度工时** | **硬约束** | **工时必须在范围内** ⭐️ |
| 季度工时 | 硬约束 | 季度工时≥标准（如开启） |

## 修改位置

**文件：** `solver/server.py`

**主要变更：**
- 第568-570行：改为硬约束
- 第944-946行：注释掉罚分项

## 回滚方法

如果需要恢复到软约束：

1. **恢复松弛变量**（第568-570行）：
   ```python
   underflow = model.NewIntVar(0, lower_bound, f"month_under_{emp_id}_{m_key}")
   overflow = model.NewIntVar(0, upper_bound, f"month_over_{emp_id}_{m_key}")
   model.Add(total_month_minutes + underflow >= lower_bound)
   model.Add(total_month_minutes - overflow <= upper_bound)
   monthly_penalty_terms.extend([underflow, overflow])
   ```

2. **恢复罚分**（第944-946行）：
   ```python
   if monthly_penalty_terms:
       obj += sum(monthly_penalty_terms) * 5
   ```

3. **重启求解器**

## 监控建议

实施硬约束后，建议监控：

1. **求解成功率**
   - 追踪求解失败的批次
   - 分析失败原因（工时不足 vs 工时超标）

2. **求解时间**
   - 硬约束可能增加求解时间
   - 如果时间过长，考虑优化

3. **工时分布**
   - 检查员工工时是否集中在上限或下限附近
   - 评估配置是否合理

## 后续优化

可以考虑的扩展：

1. **分级软约束**：核心范围为硬约束，扩展范围为软约束
2. **个性化限制**：不同职位不同的工时范围
3. **动态调整**：根据月份自动调整工时范围
4. **预警机制**：求解前检查是否可能违反工时限制

## 三倍工资日的处理

请注意，三倍工资日（如国庆节）的工时**不计入**月度工时统计：

```python
if is_triple:
    model.Add(billable == 0)  # 三倍工资日工时不计入月度限制
```

这意味着在三倍工资日加班**不会**占用月度工时配额。
