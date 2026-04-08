# Frontend Development Rules (前端开发防错规则)

以下规则从 MFG8APS 旧前端（frontend/）的技术选型审计中提炼而来。
所有前端开发（包括 frontend/ 和 frontend-next/）**必须**遵守这些规则。

---

## 规则 1：禁止硬编码 API 地址

**错误做法：**
```typescript
await axios.post('http://localhost:3001/api/employees', data);
const API_BASE_URL = 'http://localhost:3001/api';
```

**正确做法：**
```typescript
// 使用相对路径，由 proxy/rewrite 配置处理转发
await axios.post('/api/employees', data);

// 或者使用环境变量
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';
```

**原因**：硬编码地址会导致部署到其他环境时需要手动修改多处代码。旧前端曾有 23 处硬编码。

---

## 规则 2：必须使用统一的 API 服务层

**错误做法：** 每个组件各自调用 axios

```typescript
// ComponentA.tsx
const res = await axios.get('http://localhost:3001/api/employees');

// ComponentB.tsx（又写了一遍一模一样的）
const res = await axios.get('http://localhost:3001/api/employees');
```

**正确做法：** 集中到 services/ 或 hooks/ 中

```typescript
// services/employeeApi.ts
export const getEmployees = () => apiFetch('/api/employees');

// ComponentA.tsx
const employees = await getEmployees();
```

**原因**：避免重复代码，且修改 API 路径或参数时只需改一处。

---

## 规则 3：合理使用状态管理

- 页面级状态（如表单输入）：`useState` 即可
- 跨组件共享状态（如当前选中的批次）：使用 React Context 或 Zustand
- 服务端数据缓存（如员工列表）：使用 React Query / SWR 或 Zustand

**禁止**：每个组件各自发请求获取相同数据。

---

## 规则 4：统一 CSS 方案

- **frontend-next**：统一使用 Tailwind CSS 4，禁止新增 .css 文件
- **frontend（旧）**：允许现有 .css 文件，但新增样式优先使用 Tailwind 类名

**禁止**：同一个组件混用 Tailwind 类名、AntD theme token 和手写 CSS。

---

## 规则 5：组件文件组织规范

```
src/
  pages/              ← 页面级组件（对应路由）
    BatchManagement/
      index.tsx
      components/     ← 该页面专用的子组件
      hooks/          ← 该页面专用的 hooks
  components/         ← 全局可复用的小组件
    Button/
    Modal/
  services/           ← API 调用封装
  hooks/              ← 全局可复用的 hooks
  types/              ← 全局类型定义
```

**禁止**：
- 将完整页面放在 `components/` 下
- 在源码目录中存放 `.bak`、`.backup`、`.legacy` 文件
- 单个组件文件超过 500 行（应拆分为子组件 + hooks）

---

## 规则 6：错误响应格式统一

所有后端 API 的错误响应必须使用统一格式：

```json
{
  "success": false,
  "error": "错误描述信息",
  "code": "ERROR_CODE"
}
```

前端应使用统一的 axios 拦截器处理此格式。

**禁止**：在控制器的 catch 块中使用硬编码的错误消息隐藏真实错误信息。

---

## 规则 7：备份文件管理

- **禁止**在源码目录中创建 `.bak`、`.backup`、`.old` 等备份文件
- 使用 Git 版本控制来管理历史版本
- 在 `.gitignore` 中添加 `*.bak` 和 `*.backup`
