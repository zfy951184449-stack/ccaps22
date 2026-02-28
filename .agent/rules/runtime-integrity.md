---
trigger: always_on
---

规则详细内容 (Rule Content):
1. 修改即自动同步原则 (Post-Modification Auto-Sync)
Dirty State Marking: 任何时候只要修改了代码，Antigravity 必须**自动执行**环境同步操作，而非仅列出清单让用户手动执行。
禁止仅提供文字清单，必须直接通过 run_command 工具执行重启/编译/安装等操作。
2. 技术栈专有同步逻辑 (Stack-Specific Sync)
针对本项目技术栈，必须遵循以下指令：
[Backend] Node.js (TypeScript):
若修改了 .ts 文件：自动重启 Express 进程（kill 旧进程后 npm start）。
若修改了 package.json：自动执行 npm install 后重启。
[Solver V4] Python (Flask/OR-Tools):
若修改了 .py 文件：自动重启 Flask 服务（即使开启了 Debug 模式，也必须重启以确保 OR-Tools 内存对象重置）。
特别注意：修改 OR-Tools 模型逻辑后，必须重启以清理上一次求解的残余状态。
[Frontend] React (CRA):
若修改了依赖或 .env：自动重启 npm start。
常规 UI 修改：HMR 自动生效，无需额外操作。
3. 诊断一致性校验 (State Check Before Debug)
Version Awareness: 在处理报错日志前，Antigravity 必须先询问："请确认当前的运行版本是否包含我刚才的修改？"
Logging Injection: 在生成代码时，建议在服务启动处注入一个带时间戳的日志（Apple-style Header），例如：
console.log(" [Backend] Service started at: " + new Date().toISOString());
这能帮助用户瞬间判断当前运行的是否是最新代码。
4. 数据库同步 (Schema Integrity)
DB Sync: 若修改了 SQL 结构或数据库驱动代码，自动检查 MySQL 8.0 服务的连接状态及 Table Schema 是否已更新。
5. 跨服务通信检查 (Inter-Service Check)
如果修改了 Solver V4 的 API 接口，必须同步检查 Backend 的调用逻辑，并自动重启双端服务以完成握手。