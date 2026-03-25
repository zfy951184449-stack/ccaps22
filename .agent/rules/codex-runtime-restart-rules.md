---
trigger: always_on
description: Codex runtime sync and restart rules for the APS monorepo. Use to avoid false manual test results caused by stale backend, frontend, or solver processes.
---

# Codex Runtime Sync Rules

这份规则的目标不是把“重启”当作验证，而是避免手动测试命中旧进程、旧配置、旧内存状态，产生假结果。

先读：

- `AGENTS.md`
- `.agent/rules/codex-coding-rules.md`
- 触发本次改动的专项规则文件

## 1. 核心原则

1. **运行环境同步** 和 **正确性验证** 是两回事：
   - 重启用于让最新代码真正进入运行态
   - build/test/script 用于证明改动没有破坏功能
2. 如果改动属于“需要重启才会生效”的类型，Codex 不应只提醒用户手动重启，而应直接执行对应重启动作。
3. 在交付前，只要用户后续要做手工测试，就必须明确说明：
   - 哪些服务已重启
   - 哪些服务未重启
   - 用户当前手测应连接哪个进程

## 2. 重启矩阵 (When Restart Is Required)

### Backend / Express / TypeScript

以下改动后，必须重启 backend 进程：

- `backend/src/**/*.ts` 中影响路由注册、controller/service 初始化、环境变量读取、数据库连接、定时任务、启动逻辑的改动
- `backend/package.json`
- `backend/.env`
- 会影响应用启动时缓存或单例状态的逻辑

如果只是纯类型声明且确认不进入运行时代码，可不强制重启；但只要手测依赖该改动，优先重启而不是赌热更新。

推荐动作：

- 先停止旧 backend 进程
- 再在 `backend/` 下启动 `npm run dev` 或等价当前开发命令

命令模板（默认端口 `3001`）：

```bash
# stop backend on 3001
if lsof -ti:3001 >/dev/null 2>&1; then
  kill $(lsof -ti:3001) 2>/dev/null || true
  sleep 1
fi

# start backend dev server
cd /Users/zhengfengyi/MFG8APS/backend && npm run dev
```

可选健康检查：

```bash
curl --silent --fail http://127.0.0.1:3001/api/health
```

### Frontend / CRA / React

以下改动后，必须重启 frontend dev server：

- `frontend/.env`
- `frontend/package.json`
- CRA dev server 启动配置、代理配置、构建配置相关改动
- 明确怀疑 HMR 没有正确吃到最新状态时

以下改动通常 **不需要** 强制重启，可先依赖 HMR：

- 普通组件 JSX / CSS / hooks / 页面交互改动

但如果用户接下来要做关键手测，且页面表现与预期不一致，Codex 应优先执行一次 frontend 重启，避免继续在脏运行态上排查。

推荐动作：

- 停止旧 frontend dev server
- 再在 `frontend/` 下启动 `npm start`

命令模板（默认端口 `3000`）：

```bash
# stop frontend on 3000
if lsof -ti:3000 >/dev/null 2>&1; then
  kill $(lsof -ti:3000) 2>/dev/null || true
  sleep 1
fi

# start CRA dev server
cd /Users/zhengfengyi/MFG8APS/frontend && npm start
```

可选可达性检查：

```bash
curl --silent --fail http://127.0.0.1:3000
```

### Solver V4 / Python / OR-Tools

以下改动后，必须重启 solver 进程：

- `solver_v4/**/*.py`
- solver contract、constraint module、求解流程、日志、Flask API 的改动
- 任何可能受内存残留、模型残留、缓存残留影响的求解逻辑

OR-Tools 相关改动默认视为必须重启；不要依赖“debug 模式可能自动刷新”。

推荐动作：

- 停止旧 solver 进程
- 在 `solver_v4/` 下重新启动当前开发入口

命令模板（默认端口 `5005`）：

```bash
# stop solver v4 on 5005
if lsof -ti:5005 >/dev/null 2>&1; then
  kill $(lsof -ti:5005) 2>/dev/null || true
  sleep 1
fi

# start solver v4
cd /Users/zhengfengyi/MFG8APS/solver_v4
source .venv/bin/activate
FLASK_DEBUG=1 SOLVER_V4_PORT=5005 python app.py
```

可选健康检查：

```bash
curl --silent --fail http://127.0.0.1:5005/api/v4/health
```

## 3. 跨服务联动

1. 如果修改影响 backend 与 frontend 的接口契约，至少重启 backend；若前端依赖启动时环境或代理配置，也要重启 frontend。
2. 如果修改影响 backend 与 solver 的请求/响应契约、V4 组装逻辑、apply 逻辑，必须重启 solver；必要时同步重启 backend 完成握手。
3. 不允许在一侧已经是新代码、另一侧还是旧进程的状态下，直接把联调结果当真。

常用组合模板：

```bash
# backend + frontend
if lsof -ti:3001 >/dev/null 2>&1; then kill $(lsof -ti:3001) 2>/dev/null || true; fi
if lsof -ti:3000 >/dev/null 2>&1; then kill $(lsof -ti:3000) 2>/dev/null || true; fi
sleep 1
cd /Users/zhengfengyi/MFG8APS/backend && npm run dev
# new terminal
cd /Users/zhengfengyi/MFG8APS/frontend && npm start
```

```bash
# backend + solver v4
if lsof -ti:3001 >/dev/null 2>&1; then kill $(lsof -ti:3001) 2>/dev/null || true; fi
if lsof -ti:5005 >/dev/null 2>&1; then kill $(lsof -ti:5005) 2>/dev/null || true; fi
sleep 1
cd /Users/zhengfengyi/MFG8APS/backend && npm run dev
# new terminal
cd /Users/zhengfengyi/MFG8APS/solver_v4 && source .venv/bin/activate && FLASK_DEBUG=1 SOLVER_V4_PORT=5005 python app.py
```

```bash
# full V4 stack
if lsof -ti:3001 >/dev/null 2>&1; then kill $(lsof -ti:3001) 2>/dev/null || true; fi
if lsof -ti:3000 >/dev/null 2>&1; then kill $(lsof -ti:3000) 2>/dev/null || true; fi
if lsof -ti:5005 >/dev/null 2>&1; then kill $(lsof -ti:5005) 2>/dev/null || true; fi
sleep 1
cd /Users/zhengfengyi/MFG8APS && ./start_v4.sh
```

## 4. 执行要求

1. 重启前应尽量结束旧进程，避免同端口残留多个实例。
2. 若重启失败，要明确报告失败原因，不要默认用户已处于最新运行态。
3. 如果当前环境不适合直接拉起长期驻留进程，至少要明确说明“本次未重启，手测前需先重启哪些服务”。
4. 如果使用了端口级 kill，重启后应至少用健康检查或启动日志确认新进程已接管端口。

## 5. 交付要求

交付时必须明确写出：

1. 本次改动是否属于需要重启才能生效
2. 已实际重启的服务
3. 未重启但建议在手测前重启的服务
4. 已执行的验证命令

结论不能只写“代码已修改完成”。
