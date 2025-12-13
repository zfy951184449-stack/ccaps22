# Legacy Solver (归档)

**归档日期**: 2025-12-03

## 归档原因

此求解器版本已被归档，因为需要进行全面重构以满足以下新需求：

### 已实现但需改进的功能

1. **标准工时计算** - 月度/季度工时基于工作日计算，但参数语义混乱
2. **节假日API集成** - Tianapi已集成，但三倍工资日最小人数逻辑缺失
3. **综合工时制约束** - 月度上下限、连续工作约束已实现，但需独立配置上下限
4. **夜班休息约束** - 第1天硬约束、第2天软约束已实现
5. **资质匹配** - 硬约束已实现，支持等级向下兼容
6. **共享组逻辑** - 已实现但逻辑不符合需求（应为软约束）
7. **班次匹配** - 已实现但缺少优先级（常日班优先）

### 缺失的功能

1. 三倍工资日最小人数配置
2. 车间工时（操作工时）统计输出
3. 班次优先级权重
4. 完整的前端配置界面

## 目录结构

```
legacy-solver/
├── app.py                    # Flask 应用入口
├── server.py                 # HTTP 服务器封装
├── core/
│   ├── solver.py            # 主求解器（1500+ 行）
│   ├── config_manager.py    # 配置参数管理
│   ├── objective_builder.py # 目标函数构建
│   ├── variable_factory.py  # 变量容器
│   └── result_generator.py  # 结果生成
├── constraints/
│   ├── monthly_hours.py     # 月度/季度工时约束
│   ├── consecutive_work.py  # 连续工作约束
│   ├── night_rest.py        # 夜班休息约束
│   ├── night_fairness.py    # 夜班公平性约束
│   ├── leader_coverage.py   # 主管覆盖约束
│   ├── pre_production.py    # 生产前约束
│   └── ...
├── shift_planning/
│   ├── builder.py           # 班次计划构建
│   └── matcher.py           # 班次定义匹配
├── utils/
│   ├── builders.py          # 数据结构构建
│   ├── time_utils.py        # 时间处理工具
│   └── logging.py           # 日志工具
└── logs/                     # 调试日志
```

## 技术栈

- **求解器**: Google OR-Tools CP-SAT
- **Web框架**: Flask
- **语言**: Python 3.10+

## 配置参数摘要

| 参数 | 默认值 | 说明 |
|------|--------|------|
| monthlyMinHours | -16 | 月度工时下限偏移（小时） |
| monthlyMaxHours | 16 | 月度工时上限偏移（小时） |
| maxConsecutiveWorkdays | 6 | 最大连续工作天数 |
| nightShiftPreferredRestDays | 2 | 夜班后优选休息天数 |
| solverTimeLimit | 30 | 求解器时间限制（秒） |

## 备注

如需参考此版本的实现细节，请查看各模块的源代码。新版求解器应基于 `REFACTOR_REQUIREMENTS.md` 中的需求进行设计。

