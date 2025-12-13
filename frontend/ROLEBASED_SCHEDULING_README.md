# RoleBasedPersonnelScheduling 组件恢复说明

## ✅ 已恢复的功能

已成功恢复包含**指挥中心视图**的基于角色的人员排班组件，位于：
- **组件文件**: `/frontend/src/components/RoleBasedPersonnelScheduling.tsx`
- **样式文件**: `/frontend/src/components/RoleBasedPersonnelScheduling.css`（已存在）
- **页面路由**: `/frontend/src/pages/PersonnelSchedulingPage.tsx`（已更新）

## 🎯 三大视图模式

### 1. 指挥中心 (Command Center) 视图 ⭐
- **功能**: 全局人员排班指挥中心
- **特点**:
  - 批次操作实时监控
  - 人员配置缺口警告
  - 员工排班概览表格
  - 日期导航（前一天/后一天）
  - 精美的卡片式布局

### 2. Leader 视图
- **功能**: Leader 排班管理
- **特点**:
  - 在岗 Leader 统计
  - 一线人员统计
  - 待完善的详细功能

### 3. 一线人员 (Frontline) 视图
- **功能**: 一线人员排班管理
- **特点**: 待完善

## 🔧 所需后端API

该组件依赖以下后端API端点，请确保它们可用：

### 1. 获取排班数据
```http
GET /api/personnel-schedules/shift-plans
参数:
- start_date: YYYY-MM-DD
- end_date: YYYY-MM-DD
```

### 2. 获取批次操作数据
```http
GET /api/batch-planning/operations-by-date
参数:
- date: YYYY-MM-DD

返回格式:
Array<{
  batch_plan_id: number;
  batch_code: string;
  batch_name: string;
  operations: Array<{
    operation_plan_id: number;
    operation_code: string;
    operation_name: string;
    stage_code?: string;
    stage_name?: string;
    operation_start: string; // ISO datetime
    operation_end: string;   // ISO datetime
    required_people: number;
    assigned_employee_ids: number[];
  }>;
}>
```

## 🎨 样式系统

CSS文件包含完整的样式定义：
- `.role-scheduling` - 主容器
- `.command-view` - 指挥中心视图
- `.command-roster-table` - 排班表格
- `.watch-page` - 值班页面布局
- `.watch-card` - 批次卡片
- `.watch-op` - 操作项
- `.plan-chip` - 排班芯片（支持动画警告）

## 🚀 使用方法

### 方式1: 当前默认配置（已启用）
访问 `/personnel-scheduling` 路由即可看到指挥中心视图

### 方式2: 切换回原日历视图
编辑 `/frontend/src/pages/PersonnelSchedulingPage.tsx`：
```tsx
// 注释掉这一行
// return <RoleBasedPersonnelScheduling />;

// 取消注释这一行
return <PersonnelCalendar />;
```

## 📋 组件状态

| 视图 | 状态 | 说明 |
|------|------|------|
| 指挥中心 | ✅ 核心功能完成 | 可显示批次操作、员工排班、人员配置缺口 |
| Leader | 🚧 基础框架 | 需要补充详细功能 |
| 一线人员 | 🚧 基础框架 | 需要补充详细功能 |

## 🎯 下一步开发建议

1. **完善Leader视图**: 添加 Leader 专属的排班管理功能
2. **完善一线人员视图**: 添加一线人员的排班查看和操作功能
3. **添加更多日期导航选项**: 周视图、月视图等
4. **添加交互功能**: 点击单元格编辑排班、拖拽分配人员等
5. **性能优化**: 大量数据时的虚拟化滚动

## 💡 特色功能

### 动画警告效果
排班芯片支持多种警告动画：
- **红色脉冲** (`.plan-chip-warning`): 加班警告
- **橙色脉冲** (`.plan-chip-warning-rest`): 休息警告
- **深橙色脉冲** (`.plan-chip-warning-op`): 操作警告

### 精美的玻璃态设计
- 纸质卡片效果 (`.paper-card`)
- 3D按钮效果 (`.watch-nav-btn`)
- 渐变背景和阴影

### 响应式布局
支持不同屏幕尺寸的自适应布局

## 📝 注意事项

1. **API依赖**: 确保后端API正常运行，否则会显示空数据
2. **日期格式**: 所有日期使用 `YYYY-MM-DD` 格式
3. **员工组织角色**: 需要正确设置 `employee_org_role` 字段（FRONTLINE, SHIFT_LEADER等）
4. **时区**: 使用dayjs处理日期时间，注意时区一致性

## 🔍 调试

如果遇到问题：
1. 打开浏览器开发者工具查看Console
2. 检查Network标签页的API请求和响应
3. 确认后端API返回的数据格式是否符合要求
4. 检查CSS文件是否正确加载
