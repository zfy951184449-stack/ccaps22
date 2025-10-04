# APS 管理后台（Admin）

独立于主前端的后台管理界面，主要面向管理员维护基础数据（工艺模版、阶段、操作、人员、班次、节假日等）并执行批量校验、导入导出和监控任务。

## 技术栈
- Vite + React + TypeScript
- Ant Design 组件体系（后续接入）
- Axios 请求封装（计划与主系统共享 API 类型定义）

## 目录规划
```
admin/
├── src/
│   ├── modules/         # 各业务模块（如 templates、employees、scheduling）
│   ├── components/      # 通用组件（表格、表单、图表、布局）
│   ├── pages/           # 路由页面（Dashboard、Login 等）
│   ├── hooks/           # 数据拉取与表单逻辑
│   ├── services/        # API 封装、权限控制
│   ├── layouts/         # 主布局、认证布局
│   └── router/          # React Router 配置
└── README.md
```

## 近期目标
1. 接入登录/权限占位，构建基础布局（侧边导航 + 顶部工具条 + 面包屑）。
2. 搭建模板管理模块原型（数据表格 + 详情表单 + 基本 CRUD 调用）。
3. 与主仓库共享接口类型定义和请求封装，避免重复造轮子。

## 启动
```
npm install
npm run dev
```

默认开发端口为 `http://localhost:5173`，可在 `.env` 中调整。部署时可独立发布或通过反向代理挂载在 `admin/` 子路径。
