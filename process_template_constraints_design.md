# 工艺模版约束与人员共享系统设计方案

## 📋 项目概述

### 背景
当前的APS系统中，工艺模版编辑器已支持基本的操作编排，但缺乏灵活的约束管理和人员优化功能。通过引入时间窗口、操作约束和人员共享机制，可以大幅提升系统的实用性和资源利用率。

### 核心目标
1. **增强约束管理**：支持多种时序约束类型（FS/SS/FF/SF）
2. **人员资源优化**：实现操作间的人员共享机制
3. **时间窗口调度**：利用已有的窗口时间字段实现柔性调度
4. **可视化编辑**：在甘特图中直观地编辑和展示约束关系

## 🎯 核心概念

### 1. 时序约束类型
- **FS (Finish-Start)**：前置操作完成后，后续操作才能开始
- **SS (Start-Start)**：两个操作必须同时开始
- **FF (Finish-Finish)**：两个操作必须同时完成
- **SF (Start-Finish)**：前置操作开始后，后续操作才能完成

### 2. 人员共享机制
将时序关系与人员分配分离，形成两个独立维度：

| 时序类型 | 独立人员 | 共享人员 |
|---------|---------|---------|
| **FS** | A完成后B开始<br>需要A+B人 | A完成后同组人做B<br>需要max(A,B)人 |
| **SS** | A和B同时开始<br>需要A+B人 | A和B同时进行<br>需要max(A,B)人 |
| **FF** | A和B同时结束<br>需要A+B人 | A和B同时结束<br>需要max(A,B)人 |

### 3. 时间窗口
利用已存在的数据库字段：
- `recommended_time`：推荐开始时间
- `window_start_time`：最早开始时间
- `window_end_time`：最晚开始时间

操作可在窗口范围内灵活调整，以满足约束和优化资源。

## 🗄️ 数据模型

### 现有表结构利用

#### stage_operation_schedules（已存在）
```sql
-- 已有的时间窗口字段
window_start_time DECIMAL(3,1)  -- 窗口开始时间
window_end_time DECIMAL(3,1)    -- 窗口结束时间
recommended_time DECIMAL(3,1)   -- 推荐时间
```

#### operation_constraints（扩展）
```sql
-- 添加人员共享字段
ALTER TABLE operation_constraints 
ADD COLUMN share_personnel BOOLEAN DEFAULT FALSE COMMENT '是否共享人员',
ADD COLUMN constraint_name VARCHAR(100) COMMENT '约束名称',
ADD INDEX idx_share_personnel (share_personnel);

-- constraint_type: 1=FS, 2=SS, 3=FF, 4=SF
-- constraint_level: 1=硬约束, 2=软约束
```

## 🎨 UI设计方案

### 1. 工艺模版编辑器主界面增强

```
┌─────────────────────────────────────────────────────────────┐
│ 工艺模版编辑器 - [模版名称]                                    │
├─────────────────────────────────────────────────────────────┤
│ 工具栏：                                                      │
│ [保存] [预览] | [添加约束] [约束验证] [人员优化] [导出报告]      │
├─────────────────────────────────────────────────────────────┤
│ 视图切换：[甘特图] [约束图] [资源图] [时间线]                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 甘特图视图：                                                  │
│        Day-1   Day0    Day1    Day2    Day3    Day4         │
│ 阶段1  [▓▓▓]──→[▓▓▓]                                       │
│        反应袋   电极准备                                      │
│        8-11h    9-11h                                        │
│         ↓FS,共享                                             │
│ 阶段2          [▓▓▓]══[▓▓▓]                               │
│                电极安装  保压测试                              │
│                9-12h    9-12h                                │
│                 ↔SS,共享                                      │
│                                                              │
│ 图例：→FS约束 ═SS约束 ↔共享人员 [▓]操作块 []时间窗口          │
└─────────────────────────────────────────────────────────────┘
```

### 2. 操作编辑面板（基于现有甘特图Modal设计）

根据现有的`EnhancedGanttEditor.tsx`组件设计，操作编辑面板采用Modal对话框形式：

```jsx
// 编辑模态框结构 - 扩展现有设计
<Modal title="编辑操作" width={700}>
  <Form layout="vertical">
    {/* 基本信息区 */}
    <Row gutter={16}>
      <Col span={12}>
        <Form.Item label="选择操作">
          <Select>
            {/* 显示操作代码、名称和标准时间 */}
            <Option>
              反应袋安装 - OPR001 (3.0h)
            </Option>
          </Select>
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="操作位置（相对于阶段原点）">
          <InputNumber addonBefore="阶段Day" />
        </Form.Item>
      </Col>
    </Row>

    {/* 时间设置区 */}
    <Form.Item label="推荐开始时间（当天内）">
      <InputNumber min={0} max={23.9} step={0.5} addonAfter="时" />
    </Form.Item>

    <Row gutter={16}>
      <Col span={12}>
        <Form.Item label="时间窗口开始">
          <InputNumber addonAfter="时" />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item label="时间窗口结束">
          <InputNumber addonAfter="时" />
        </Form.Item>
      </Col>
    </Row>

    {/* 新增：约束设置标签页 */}
    <Tabs defaultActiveKey="1">
      <TabPane tab="基本信息" key="1">
        {/* 上述基本表单内容 */}
      </TabPane>
      
      <TabPane tab="约束关系" key="2">
        <Space direction="vertical" style={{ width: '100%' }}>
          {/* 前置约束列表 */}
          <Card size="small" title="前置约束">
            <List dataSource={precedenceConstraints}>
              <List.Item actions={[
                <Tag>FS</Tag>,
                <Switch checkedChildren="共享" unCheckedChildren="独立" />,
                <Button icon={<DeleteOutlined />} />
              ]}>
                电极准备 → 当前操作
              </List.Item>
            </List>
            <Button icon={<PlusOutlined />}>添加前置约束</Button>
          </Card>

          {/* 后续约束列表 */}
          <Card size="small" title="后续约束">
            <List dataSource={successorConstraints}>
              <List.Item>
                当前操作 → 保压测试
              </List.Item>
            </List>
            <Button icon={<PlusOutlined />}>添加后续约束</Button>
          </Card>
        </Space>
      </TabPane>

      <TabPane tab="人员共享" key="3">
        {/* 人员共享组设置 */}
        <Form.Item label="人员共享组">
          <Select mode="tags" placeholder="选择或创建共享组">
            <Option value="group1">反应袋组</Option>
            <Option value="group2">电极组</Option>
          </Select>
        </Form.Item>
        
        <Alert 
          message="共享组说明" 
          description="同一共享组内的操作可以由相同人员依次完成，减少人员需求"
          type="info" 
        />
      </TabPane>
    </Tabs>

    {/* 时间锚定计算（保留现有功能） */}
    <div style={{ background: '#f6f6f6', padding: '16px' }}>
      <Text strong>📍 时间锚定计算：</Text>
      <div>阶段"反应袋准备"原点：Day-1</div>
      <div>操作绝对位置：Day-1 + Day0 = <Text strong>Day-1</Text></div>
    </div>

    {/* 按钮区 */}
    <Form.Item>
      <Space>
        <Button type="primary" htmlType="submit">保存</Button>
        <Button>取消</Button>
      </Space>
    </Form.Item>
  </Form>
</Modal>
```

#### 关键特性说明：

1. **保持现有结构**：基于`EnhancedGanttEditor.tsx`的Modal设计
2. **使用Tabs组织**：将复杂功能分组到不同标签页
3. **保留时间锚定**：维持现有的时间计算显示功能
4. **新增约束管理**：在新标签页中管理操作间的约束关系
5. **人员共享设置**：独立标签页管理人员共享组

### 3. 约束编辑对话框

```
┌────────────────────────────────────────┐
│ 添加/编辑约束                           │
├────────────────────────────────────────┤
│ 前置操作：反应袋安装 (3人)              │
│ 后续操作：保压测试 (3人)                │
│                                        │
│ 时序关系：                              │
│ ⦿ FS 完成-开始  ○ SS 开始-开始         │
│ ○ FF 完成-完成  ○ SF 开始-完成         │
│                                        │
│ 人员安排：                              │
│ ○ 独立人员（需6人）                     │
│ ⦿ 共享人员（需3人）                     │
│                                        │
│ 约束属性：                              │
│ 延迟时间：[0.5] 小时                    │
│ 约束级别：⦿ 硬约束 ○ 软约束             │
│                                        │
│ 说明：[同组人员完成反应袋安装后进行测试]  │
│                                        │
│ 影响预览：                              │
│ ┌──────────────────────────┐          │
│ │09:00-12:00 反应袋安装(3人)│          │
│ │12:30-15:30 保压测试(3人)  │          │
│ │总需求：3人（共享）         │          │
│ └──────────────────────────┘          │
├────────────────────────────────────────┤
│ [保存] [取消]                           │
└────────────────────────────────────────┘
```

### 4. 约束验证面板

```
┌────────────────────────────────────────┐
│ 约束验证结果                            │
├────────────────────────────────────────┤
│ ✓ 时序约束：所有约束可满足               │
│ ⚠ 人员需求：                           │
│   • Day1 09:00 峰值需求5人             │
│   • 建议：利用时间窗口错峰               │
│ ℹ 优化建议：                           │
│   • 操作A可调整至08:00减少人员冲突      │
│   • 操作B和C可设置为共享人员            │
├────────────────────────────────────────┤
│ [应用优化建议] [导出报告] [关闭]         │
└────────────────────────────────────────┘
```

### 5. 资源优化视图

```
┌────────────────────────────────────────┐
│ 人员需求分析                            │
├────────────────────────────────────────┤
│ 人员需求曲线图：                        │
│ 6│                                     │
│ 5│     ███                            │
│ 4│   ███████                          │
│ 3│ ███████████  ███                   │
│ 2│ █████████████████                  │
│ 1│ ███████████████████                │
│ 0└─────────────────────────────────    │
│  08 09 10 11 12 13 14 15 16 17 18    │
│                                        │
│ 优化前：峰值6人，平均3.5人              │
│ 优化后：峰值4人，平均3.2人              │
│                                        │
│ 共享人员组：                            │
│ • 组1：反应袋安装→保压测试（3人）        │
│ • 组2：电极准备→电极安装（2人）          │
└────────────────────────────────────────┘
```

## 🔧 交互设计

### 1. 约束创建方式

#### 拖拽连线
- 从操作A拖拽到操作B，自动创建FS约束
- 按住Shift拖拽创建SS约束
- 按住Ctrl拖拽创建共享人员约束

#### 右键菜单
```
右键点击操作 →
├── 添加前置约束
├── 添加后续约束
├── 设置共享人员
└── 查看约束详情
```

#### 快捷键
- `Ctrl+L`：链接选中的操作
- `Ctrl+S`：设置共享人员
- `Delete`：删除选中的约束

### 2. 时间窗口调整

#### 可视化调整
```
拖拽操作块边缘调整窗口：
[▓▓▓▓▓] → [──▓▓▓──]
固定块     可调窗口
```

#### 智能提示
- 调整时实时显示约束影响
- 冲突时边框变红并提示原因
- 显示建议的调整方案

### 3. 批量操作

#### 模板应用
- 保存常用约束配置为模板
- 一键应用到相似工艺

#### 智能建议
- 基于历史数据推荐约束
- 自动识别可共享人员的操作

## 🚀 实施计划

### Phase 1：基础功能（2周）
- [ ] 扩展operation_constraints表
- [ ] 实现约束CRUD接口
- [ ] 甘特图显示约束关系
- [ ] 基础约束编辑对话框

### Phase 2：人员共享（2周）
- [ ] 实现人员共享逻辑
- [ ] 更新批次生成算法
- [ ] 人员需求计算优化
- [ ] 共享组可视化

### Phase 3：时间窗口（2周）
- [ ] 窗口时间编辑UI
- [ ] 基于窗口的调度算法
- [ ] 约束冲突自动解决
- [ ] 实时验证反馈

### Phase 4：智能优化（3周）
- [ ] 人员峰值优化算法
- [ ] 约束模板系统
- [ ] 批量约束管理
- [ ] 优化报告生成

## 📊 预期效果

### 量化指标
- **人员利用率提升**：通过共享机制提升15-25%
- **排程可行性**：约束满足率从60%提升到95%
- **调度灵活性**：80%的操作支持时间窗口调整
- **配置效率**：约束配置时间减少50%

### 用户体验提升
- 直观的可视化约束编辑
- 实时的冲突检测和建议
- 灵活的人员资源管理
- 智能的优化建议

## 🔍 技术要点

### 1. 约束求解算法
```javascript
// 核心调度算法
function optimizeSchedule(operations, constraints) {
  // 1. 构建约束图
  const graph = buildConstraintGraph(operations, constraints);
  
  // 2. 拓扑排序确定顺序
  const order = topologicalSort(graph);
  
  // 3. 在时间窗口内调度
  for (const op of order) {
    scheduleOperation(op, constraints);
  }
  
  // 4. 优化人员分配
  optimizePersonnelAllocation(operations, constraints);
}
```

### 2. 人员共享计算
```javascript
function calculateSharedPersonnel(op1, op2, constraint) {
  if (constraint.share_personnel) {
    return Math.max(op1.required_people, op2.required_people);
  } else {
    return op1.required_people + op2.required_people;
  }
}
```

### 3. 冲突检测
```javascript
function detectConflicts(operations, constraints) {
  const conflicts = [];
  
  // 时序冲突
  checkTimeConstraints(operations, constraints, conflicts);
  
  // 资源冲突
  checkResourceConflicts(operations, constraints, conflicts);
  
  // 循环依赖
  checkCyclicDependencies(constraints, conflicts);
  
  return conflicts;
}
```

## 📝 注意事项

### 1. 数据兼容性
- 保持与现有数据的向后兼容
- 提供数据迁移工具

### 2. 性能优化
- 大规模约束的求解性能
- 实时验证的响应速度


---

**文档版本**: v1.0  
**创建日期**: 2024-12-21  
**作者**: APS系统开发团队