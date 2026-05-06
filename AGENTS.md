# MFG8APS Agent Entry

Default read set:

1. `AGENTS.md`
2. `.agent/index.md`
3. `docs/ARCHITECTURE.md`
4. `docs/README.md`

Rules for context hygiene:

- Treat `.agent/` as the only active agent-doc source of truth.
- Do not scan `.agent/` recursively by default.
- Load `.agent/workflows/multi-persona-task.md` only when the task needs extra review structure.
- Load a specific skill under `.agent/skills/` only when the task clearly matches that domain.

Runtime entrypoints:

- Legacy frontend: `frontend/src/App.tsx`
- Backend API: `backend/src/server.ts`
- Solver V4: `solver_v4/app.py`

If a task touches data semantics or scheduling behavior, prefer the durable docs under `docs/` over old prompt bundles.

## Frontend Design System — 强制规则

**所有前端 UI 代码必须使用 `wxb-ui` 设计系统组件**，不得使用 inline style 或手写 HTML 来实现已有组件能覆盖的功能。

具体要求：
- 按钮 → `WxbButton`，输入框 → `WxbInput`，搜索 → `WxbSearchInput`
- 弹窗 → `WxbModal`，抽屉 → `WxbDrawer`，折叠 → `WxbCollapse`
- 标签 → `WxbTag`，徽标 → `WxbBadge`，空状态 → `WxbEmpty`
- 分割线 → `WxbDivider`，提示 → `WxbTooltip`，复选框 → `WxbCheckbox`
- 表格 → `WxbTable` 或 `WxbDataTable`
- 所有颜色使用 CSS 变量（如 `var(--wx-blue-600)`），禁止硬编码十六进制值
- 主题：白色主题（wxb 默认），禁止暗色主题
- 禁止使用 Emoji 作为 UI 图标，使用 SVG 或 `WxbIcon`

组件库路径：`frontend/src/components/wxb-ui/`
