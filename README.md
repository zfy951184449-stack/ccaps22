# APS系统管理界面

基于React + TypeScript + Ant Design + Node.js + MySQL的APS系统管理界面，支持直接编辑数据库。

## 项目结构

```
├── database/                  # 数据库文件和脚本
│   ├── aps_system/           # 数据库本体文件
│   ├── create_aps_database.sql  # 数据库创建脚本
│   ├── common_queries.sql    # 常用查询脚本
│   └── README.md            # 数据库说明
├── frontend/                 # 前端项目
│   ├── src/
│   │   ├── components/      # React组件
│   │   ├── services/        # API服务
│   │   ├── types/          # TypeScript类型定义
│   │   └── App.tsx         # 主应用组件
│   └── package.json
├── backend/                  # 后端API服务
│   ├── src/
│   │   ├── config/         # 配置文件
│   │   ├── controllers/    # 控制器
│   │   ├── routes/         # 路由
│   │   └── server.ts       # 服务器入口
│   └── package.json
└── start.sh                # 启动脚本
```

## 功能特性

- ✅ 数据库表格直接编辑
- ✅ 增删改查操作
- ✅ 响应式界面设计
- ✅ 中文本地化
- ✅ 实时数据同步
- 🔄 支持所有9个核心表

## 快速开始

### 1. 启动项目
```bash
chmod +x start.sh
./start.sh
```

### 2. 手动启动

**启动后端:**
```bash
cd backend
npm install
npm run dev
```

**启动前端:**
```bash
cd frontend
npm install
npm start
```

### 3. 访问应用

- 前端界面: http://localhost:3000
- 后端API: http://localhost:3001

### 局域网访问

- 启动脚本与前端开发服务器已固定监听 `0.0.0.0`，同一局域网内的其他设备可直接访问。
- 启动后终端会显示形如 `http://192.168.x.x:3000` 的访问地址；若未显示，可手动运行 `ipconfig getifaddr en0`（Wi-Fi）或 `ipconfig getifaddr en1`（有线）查询本机 IP。
- 访问端需与服务器位于同一家庭路由器/子网，必要时放行防火墙端口 `3000` 与 `3001`。

## 数据库管理

### 核心表

1. **人员库**
   - `employees` - 人员基础信息
   - `qualifications` - 资质信息
   - `employee_qualifications` - 人员资质关联

2. **操作库**
   - `operations` - 操作信息
   - `operation_qualification_requirements` - 操作资质要求

3. **工艺模版库**
   - `process_templates` - 工艺模版
   - `process_stages` - 工艺阶段
   - `stage_operation_schedules` - 阶段操作安排

4. **约束管理**
   - `operation_constraints` - 操作约束条件

### 当前可用功能

- ✅ **人员管理** - 完整的CRUD操作
- 🔄 其他表管理功能开发中

## 技术栈

### 前端
- React 18
- TypeScript
- Ant Design 5
- Axios

### 后端
- Node.js
- Express
- TypeScript
- MySQL2

### 数据库
- MySQL 8.0
- InnoDB存储引擎