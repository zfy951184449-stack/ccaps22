# APS系统数据库

## 概述

本目录包含APS系统的完整数据库设计和脚本文件，基于MySQL实现的分层数据库模型。

## 文件说明

- `create_aps_database.sql` - 数据库和表结构创建脚本
- `common_queries.sql` - 常用查询SQL语句
- `README.md` - 本说明文档

## 数据库架构

### 分层设计
```
┌─────────────────────────────┐
│      应用层 (Application)     │  
├─────────────────────────────┤
│      业务层 (Business)        │
├─────────────────────────────┤
│      数据层 (Data)            │
└─────────────────────────────┘
```

### 核心表结构

1. **人员库**
   - `employees` - 人员基础信息表
   - `qualifications` - 资质信息表
   - `employee_qualifications` - 人员资质关联表

2. **操作库**
   - `operations` - 操作信息表
   - `operation_qualification_requirements` - 操作资质要求表

3. **工艺模版库**
   - `process_templates` - 工艺模版表
   - `process_stages` - 工艺阶段表
   - `stage_operation_schedules` - 阶段操作安排表

4. **约束管理**
   - `operation_constraints` - 操作约束条件表

## 安装说明

### 1. 创建数据库
```bash
mysql -u root -p < create_aps_database.sql
```

### 2. 数据库连接配置
```properties
spring.datasource.url=jdbc:mysql://localhost:3306/aps_system?useUnicode=true&characterEncoding=utf8mb4
spring.datasource.username=aps_user
spring.datasource.password=aps_password
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
```

## 时间轴说明

- **工艺模版时间轴**：以day0为原点，day0=第1天，day1=第2天，以此类推
- **阶段开始时间**：相对于工艺模版的day0开始计算
- **操作执行时间**：相对于阶段开始时间计算
- **操作绝对天数** = 阶段开始天数 + 操作相对天数

## 约束类型说明

### 操作约束类型
- **FS (Finish-to-Start)**: 前置操作完成后，当前操作才能开始
- **SS (Start-to-Start)**: 前置操作开始后，当前操作才能开始  
- **FF (Finish-to-Finish)**: 前置操作完成后，当前操作才能完成
- **SF (Start-to-Finish)**: 前置操作开始后，当前操作才能完成

### 约束级别
- **强制约束(1)**: 必须严格遵守，违反会导致工艺失败
- **优选约束(2)**: 优先考虑，可在资源冲突时调整
- **建议约束(3)**: 参考性约束，可根据实际情况灵活处理

### 时间滞后
- **正数**: 前置操作结束后需等待指定时间
- **零**: 前置操作结束后立即开始
- **负数**: 前置操作结束前指定时间可以开始（重叠执行）

## 常用查询

详细的查询语句请参考 `common_queries.sql` 文件，包含：

1. 查询人员完整信息
2. 查询操作及其资质要求
3. 查询工艺模版完整结构
4. 查询特定模版的绝对时间线
5. 查询阶段操作安排及其资质需求
6. 查询操作约束关系
7. 约束冲突检查查询

## 版本信息

- **版本**: v2.3
- **创建日期**: 2025-09-15
- **包含模块**: 人员库、操作库、工艺模版库、约束管理