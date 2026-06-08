# MFG8APS 局域网服务器部署(企业锁定 Mac / 无 sudo / 一键)

把本仓库部署到**一台常驻的 Apple Silicon MacBook**,作为**局域网服务器**。全程**用户级 LaunchAgent，不需要 sudo**。设计目标:在 MDM 锁定、现场难调试的机器上,把失败前置、一次成功。

## 架构(单 node 进程对外,省掉 nginx)

```
局域网设备 ──http://<本机IP>:8080──►  node (前端静态 + /api + SSE 求解进度)
                                          ├─► solver gunicorn  127.0.0.1:5005
                                          └─► MySQL            127.0.0.1:3306
   守护:3 个用户级 LaunchAgent(backend / solver / caffeinate)+ 崩溃自动重启
```

- 前端由 backend 的 `express.static` 直接托管(`backend/src/server.ts:194-203`),前端 API 全是相对 `/api`,**同源、无 CORS、无 nginx**。
- solver 只绑环回,仅 backend 内部调用;MySQL 同机。对外只暴露 `8080` 一个口。

## 0. 前置(一次性)

- Homebrew(已装 `/opt/homebrew`)、Node、Python3、MySQL(`brew services start mysql`)。
- 构建产物就绪(任选其一):
  - 直接带 `backend/dist`、`frontend/build`、`solver_v4/.venv`(**离线推荐**:规避企业代理/CA 拦截);
  - 或部署时加 `--build` 现场构建(需能联网装依赖)。
- `backend/.env` 配好且 `DB_HOST` 指向本地、含 `SOLVER_CALLBACK_SECRET`。

## 1. 一键部署

**全新机器(能访问 GitHub)——用 `bootstrap.sh` 一条龙**(拉代码 → 装依赖 → 构建 → 建库 → 起服务):

```bash
git clone -b feature/auth-rbac-config-ui https://github.com/zfy951184449-stack/ccaps22.git
cd ccaps22
./deploy/bootstrap.sh
```

幂等可反复跑;需人工的几步会**停下提示**,不假装成功:① 装 Homebrew / Xcode CLT(装 brew 可能需管理员密码) ② 填 `backend/.env` 的 `DB_PASSWORD / JWT_SECRET / SOLVER_CALLBACK_SECRET` ③ MySQL root 密码与 `.env` 的 `DB_PASSWORD` 对齐 ④ 业务数据用 `backup-db.sh` / `restore-db.sh` 迁移(git 里只有 schema)。

**产物已就绪 / 更新代码后——直接部署:**

```bash
cd /Users/zhengfengyi/MFG8APS
./deploy/install.sh            # 先跑只读自检,再生成+加载 LaunchAgent,最后健康自检
# 可选:
./deploy/install.sh --build    # 部署前先本地构建 backend + frontend
./deploy/preflight.sh          # 只想先体检、不部署
```

部署完成后:
- 本机 `http://localhost:8080`;
- 局域网 `http://<本机IP>:8080`(脚本会打印实际 IP 与 `xxx.local`)。

> 端口/路径要改:编辑 `deploy/config.sh`(如 `BACKEND_PORT`)。

## 2. 自检(preflight)怎么读

`install.sh` 第一段是**纯只读自检**,逐项打印 `PASS / WARN / BLOCK`,结尾一行 `SUMMARY`。
- **BLOCK** = 会卡死部署,必须先解决(见第 3 节两大阻塞);
- **WARN** = 可继续,但要知道风险(防火墙弹窗、夜间休眠等);
- 末尾 `SUMMARY: MDM=.. FileVault=.. AutoLogin=.. Firewall=.. Proxy=.. Ports=.. 产物=..` 一眼看全。

**务必在目标机上跑** —— 别拿开发机现状外推。

## 3. 两个真正的硬阻塞(锁定机才会遇到)

### ① 重启后不自动起(FileVault 开 + 没有自动登录)
用户级 LaunchAgent 只在**图形登录后**才运行(Apple 设计,无 sudo 绕不过)。
- 若 `FileVault=On` 且无自动登录 → 每次开机**需有人输密码登录到桌面**,服务才拉起。
- 要"断电后无人值守自启" → 见第 6 节,找 IT。

### ② 局域网连不进来(防火墙 = 阻止所有传入)
- `Firewall=BLOCKALL` → 端口对局域网**必不可达**,本地无法自助放行 → 找 IT,或用第 7 节隧道兜底。
- `Firewall=ON`(非 block-all)→ 首次 node 监听会弹"允许接受传入连接",**部署当天需有人在本机点一次**(node 是 ad-hoc 签名,可能每次重启再问)。

## 4. 日常运维

```bash
./deploy/status.sh       # 看三个服务状态 + 健康 + 访问地址
./deploy/uninstall.sh    # 停止并卸载(不动 MySQL/日志/产物)
./deploy/install.sh      # 重新部署(幂等,可反复跑)

# 更新代码后(重点:前端改了必须重新 build)
cd backend  && npm run build
cd frontend && CI=false npm run build
./deploy/install.sh      # 重新加载即生效

# 看日志
tail -f ~/Library/Logs/MFG8APS/backend.err.log
tail -f ~/Library/Logs/MFG8APS/solver.err.log
```

> 停服务**别用 `kill`**:`KeepAlive` 会秒级重启。用 `./deploy/uninstall.sh`(内部 `launchctl bootout`)。

## 5. 数据库备份

```bash
./deploy/backup-db.sh    # dump 到 database/backups/,保留最近 14 份
```

挂成每日定时(用户级 LaunchAgent,无需 sudo):创建 `~/Library/LaunchAgents/local.mfg8aps.backup.plist`,
`ProgramArguments` 指向 `/bin/bash <仓库>/deploy/backup-db.sh`,加 `StartCalendarInterval`(如每天 02:00),
再 `launchctl bootstrap gui/$(id -u) <plist>`。

## 6. 必须交给用户 / IT 的事

**部署当天现场(需人在场,无需 IT):**
1. FileVault 开启时,开机后输一次密码登录到桌面(否则服务不起)。
2. 防火墙开启时,点一次"允许接受传入连接"弹窗。
3. 物理形态:盖子常开,**或**外接电源+显示器+键鼠做 clamshell,并**保持插电**(`caffeinate -s` 仅交流电有效)。
4. 从**另一台**局域网机验证:`curl http://<本机IP>:8080/api/health` 应返回 JSON。

**确需 IT / MDM 权限(无 sudo 无解):**
1. **断电后无人值守自启** → 请 IT 配自动登录+关 FileVault,或把服务做成 `LaunchDaemon`(需一次性 admin)。
2. **防火墙 BLOCKALL / 被 profile 锁** → 请 IT 在 MDM `com.apple.security.firewall` 放行(注意:裸 node/python 无 BundleID,白名单不生效,需先打包成带 `CFBundleIdentifier` 的 .app)。
3. **MDM 强制休眠压过 caffeinate** → 请 IT 放宽 Sleep Timer;**断电自启**用 `pmset autorestart`(需 IT)或 UPS 兜底。

## 7. 防火墙改不动时的兜底(无 sudo,绕开入站)

服务保持绑 `0.0.0.0`,从客户端建**出站**隧道:
- 远端 `ssh -L 8080:localhost:8080 <user>@<本机IP>` 端口转发;
- 或装 **Tailscale**(用户态,常无需 admin;但其网络扩展可能需 MDM 批准),其他设备走 `100.x` 访问。

## 8. 故障排查速查

| 现象 | 多半原因 | 处理 |
|---|---|---|
| 局域网连不上、本机 OK | 防火墙拦入站 | 看 `SUMMARY` 的 `Firewall`;点允许 / 找 IT / 隧道 |
| 求解卡 0%、进度不动 | solver 回调被 401 | 确认 `backend/.env` 有 `SOLVER_CALLBACK_SECRET`,`solver.err.log` 看报错 |
| 重启后全没了 | FileVault 开、没登录 | 登录一次桌面;或找 IT 配自启 |
| 服务起不来 | 路径/权限 | `~/Library/Logs/MFG8APS/*.err.log`;`launchctl print gui/$(id -u)/local.mfg8aps.backend` |
| 半夜掉线 | 休眠 | 保持插电+盖开;MDM 节能策略找 IT |
| 连错数据库 | `.env` 指向遗留远程库 | 确认 `DB_HOST=127.0.0.1`,不是 Zeabur 地址 |
