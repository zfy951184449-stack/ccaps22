# 求解器模块划分结构

## 📦 总体架构

```
solver/
├── app.py                    # Flask服务入口
├── server.py                 # 向后兼容门面
├── core/                     # 核心求解器
├── constraints/              # 约束模块
├── shift_planning/           # 班次规划
└── utils/                    # 工具函数
```

---

## 1️⃣ Core 包 - 核心求解器

**路径**: `core/`

### `solver.py` (1107行)
**职责**: 主求解逻辑

**核心函数**:
- `build_assignments_unified(payload: Dict) -> Dict`
  - 统一建模的主入口函数
  - 整合所有约束
  - 使用 OR-Tools CP-SAT 求解
  - 生成操作分配和班次计划

- `enforce_day_has_production_consistency()`
  - 确保 day_has_production 变量的一致性

---

## 2️⃣ Constraints 包 - 约束模块

**路径**: `constraints/`

### `pre_production.py` (61行)
**职责**: 生产前缓冲期约束

**核心函数**:
- `apply_pre_production_constraints()`
  - 在第一个生产操作前N天
  - 工作日强制上班，非工作日强制休息

### `night_rest.py` (61行)
**职责**: 夜班后休息约束

**核心函数**:
- `apply_night_rest_constraints()`
  - 硬约束: 夜班后第1天必须休息
  - 软约束: 夜班后第2天尽量休息

### `monthly_hours.py` (67行)
**职责**: 月度/季度工时约束

**核心函数**:
- `apply_month_quarter_constraints()`
  - 月度工时硬约束（标准工时±配置偏移）
  - 季度工时硬约束（完整季度）

### `leader_coverage.py` (138行)
**职责**: 主管覆盖约束

**核心函数**:
- `apply_leader_coverage_constraints()`
  - 硬约束: 有生产的日期至少1个主管上班
  - 软约束: 根据人数动态调整主管数量（分级）

### `base_ratio.py` (58行)
**职责**: 非工作日基础班/生产班比例

**核心函数**:
- `apply_non_workday_base_ratio()`
  - 软约束: 非工作日基础班与生产班比例在0.3-1.0

---

## 3️⃣ Shift_Planning 包 - 班次规划

**路径**: `shift_planning/`

### `matcher.py` (221行)
**职责**: 班次定义匹配

**核心函数**:
- `match_shift_definition()` - 智能匹配最合适的班次定义
- `create_operation_shift_plan()` - 为操作创建生产班次计划
- `create_base_shift_plan()` - 创建基础班/休息班计划
- `determine_shift_label()` - 确定操作的班次标签

### `builder.py` (179行)
**职责**: 班次计划构建

**核心函数**:
- `build_shift_plans()` - 构建所有员工的班次计划（主函数）
- `plan_requires_night_rest()` - 判断班次是否需要夜班休息

---

## 4️⃣ Utils 包 - 工具函数

**路径**: `utils/`

### `logging.py` (17行)
**职责**: 日志工具

**核心函数**:
- `log_lines()` - 批量写入日志

### `time_utils.py` (268行)
**职责**: 时间日期处理

**核心函数**:
- `parse_iso_datetime()` - 解析ISO日期时间
- `parse_iso_date()` - 解析ISO日期
- `calculate_duration_minutes()` - 计算时长（分钟）
- `get_primary_work_date()` - 获取跨天操作的主工作日
- `is_night_operation()` - 判断是否为夜班操作
- `combine_date_time()` - 组合日期和时间
- `windows_overlap()` - 判断时间窗口重叠
- `resolve_shift_window()` - 解析班次时间窗口
- `shift_date_key()` - 计算日期偏移
- `get_quarter_key()` - 获取季度键
- `get_quarter_bounds()` - 获取季度边界

### `builders.py` (321行)
**职责**: 数据结构构建

**核心函数**:
- `build_calendar_structs()` - 构建日历数据结构
- `build_share_groups()` - 构建人员共享组
- `build_locked_operation_map()` - 构建锁定操作映射
- `build_employee_lookups()` - 构建员工查找表
- `identify_leaders()` - 识别领导/主管
- `group_unavailability()` - 员工不可用时间分组
- `prepare_shift_definitions()` - 预处理班次定义
- `is_employee_unavailable()` - 检查员工可用性
- `extract_operation_window()` - 提取操作时间窗口
- `find_conflicting_operation_pairs()` - 查找冲突操作对

---

## 🔗 模块依赖关系

```
app.py
  └── server.py (门面)
        └── core/solver.py
              ├── constraints/
              │     ├── pre_production.py
              │     ├── night_rest.py
              │     ├── monthly_hours.py
              │     ├── leader_coverage.py
              │     │     └── base_ratio.py
              │     └── base_ratio.py
              ├── shift_planning/
              │     ├── builder.py
              │     │     ├── matcher.py
              │     │     └── utils/time_utils.py
              │     └── matcher.py
              │           └── utils/time_utils.py
              └── utils/
                    ├── logging.py
                    ├── time_utils.py
                    └── builders.py
                          └── time_utils.py
```

---

## 📊 代码统计

| 包 | 文件数 | 总行数 | 平均行数/文件 |
|---|---|---|---|
| **core/** | 1 | 1107 | 1107 |
| **constraints/** | 5 | 385 | 77 |
| **shift_planning/** | 2 | 400 | 200 |
| **utils/** | 3 | 606 | 202 |
| **总计** | **11** | **2498** | **227** |

---

## 🎯 设计原则

1. **单一职责**: 每个模块负责一种约束或功能
2. **高内聚**: 相关功能放在同一个包内
3. **低耦合**: 通过清晰的函数接口通信
4. **可测试**: 每个模块可独立测试
5. **可扩展**: 添加新约束只需新建文件

---

## 📝 使用示例

### 添加新约束
```python
# 1. 在 constraints/ 创建新文件
# constraints/custom_constraint.py

def apply_custom_constraint(model, ...):
    """你的约束逻辑"""
    pass

# 2. 在 core/solver.py 中导入并使用
from constraints.custom_constraint import apply_custom_constraint

# 3. 在主函数中调用
apply_custom_constraint(model, ...)
```

### 添加工具函数
```python
# 在 utils/ 的相应文件中添加
# utils/time_utils.py

def new_time_function():
    """新的时间处理函数"""
    pass
```

---

## ✅ 向后兼容

原有调用方式**完全兼容**:
```python
from server import _build_assignments_unified
# 实际调用的是 core.solver.build_assignments_unified
```
