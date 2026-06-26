# MFG8APS 目标机运维手册

> 生产部署在一台**企业 MDM 锁定的 MacBook**(药明 wuxibiologics 域内)上,作**局域网服务器 + 兼开发机**。
> 本文是该机的完整运维档案;脚本/部署说明见同目录 `README.md`。最后更新:2026-06-08。

## 1. 目标机信息
| 项 | 值 |
|---|---|
| 主机名 | `CHN01MOCKY6MXQ9` |
| 登录用户 | `zheng.fengyi` |
| 局域网访问 | `http://10.245.72.69:8080`(建议绑固定内网 IP) |
| 芯片/系统 | Apple Silicon / macOS |
| 运行时 | Homebrew 5.x、node 26、python 3.9(系统自带)、MySQL、OR-Tools |
| 系统约束 | MDM=纳管;FileVault=开(**无自动登录→重启后需登录一次桌面**服务才起);防火墙=ON 但非 block-all(首次 node 监听需点一次「允许传入连接」);MDM 未锁节能(caffeinate 可用) |

## 2. 架构与端口
- **对外**:`node :8080` —— 前端静态 + `/api` + SSE,Express 同源托管(`backend/src/server.ts:194-203`),无 nginx。
- **内部**:`solver gunicorn 127.0.0.1:5005`;`MySQL 127.0.0.1:3306`。
- **守护**(全用户级 LaunchAgent,无 sudo):
  - `local.mfg8aps.backend` / `.solver` / `.caffeinate` —— 三服务 + 防休眠
  - `local.mfg8aps.px` —— 开机自启代理(见 §4)
  - `local.mfg8aps.autoupdate` —— 每 5 分钟自动更新(见 §6)
- **部署分支**:`main`(开发机 push main,目标机 pull main)。

## 3. 关键路径
| 用途 | 路径 |
|---|---|
| 目标机代码 | `~/ccaps22`(开发机为 `~/MFG8APS`) |
| 应用配置 | `~/ccaps22/backend/.env`(**不入 git**;密钥目标机现生成) |
| 代理账号密码 | `~/.config/mfg8aps/px.env`(权限 600,含**域密码明文**) |
| 日志 | `~/Library/Logs/MFG8APS/{backend,solver,px,autoupdate,auto-update}.log` |
| 守护配置 | `~/Library/LaunchAgents/local.mfg8aps.*.plist` |

## 4. 企业网代理(NTLM)——最大的坑
- 公司强制 **NTLM 代理**(McAfee/Skyhigh):PAC `http://proxy.wuxibiologics.com:4713/files/proxy.pac` → 实际 `proxy.wuxibiologics.com:8080`。命令行直连被 RST/407,只认 NTLM。
- 解法:**px 本地中继**(`127.0.0.1:3128`)替所有命令行工具做 NTLM,读公司 PAC **智能分流**(外网走代理 / 本地·内网直连)。开机自启(`local.mfg8aps.px`)。
- **运行时三服务不需要 px**(都是 127.0.0.1 本地通信);px 只为命令行下载/更新/开发(codex)服务。
- **域密码过期时**(公司常 90 天一换):编辑 `~/.config/mfg8aps/px.env` 的 `PX_PASSWORD`,再
  `launchctl kickstart -k gui/$(id -u)/local.mfg8aps.px`。

## 5. 日常运维速查
| 想干啥 | 命令(目标机) |
|---|---|
| 看服务状态 | `~/ccaps22/deploy/status.sh` |
| 看自动更新动静 | `tail -f ~/Library/Logs/MFG8APS/auto-update.log` |
| 手动更新 | `cd ~/ccaps22 && ./deploy/update.sh` |
| 备份数据库 | `~/ccaps22/deploy/backup-db.sh` → `database/backups/` |
| 恢复数据库 | `~/ccaps22/deploy/restore-db.sh <dump.sql>` |
| 停/重装服务 | `./deploy/uninstall.sh` / `./deploy/install.sh --force` |
| 暂停自动更新 | `launchctl bootout gui/$(id -u)/local.mfg8aps.autoupdate` |
| 改域密码 | 见 §4 |
| 改 MySQL 密码 | `mysqladmin -u root -p旧 password 新` + 同步改 `backend/.env` 的 `DB_PASSWORD`/`DATABASE_URL` |

> 停服务**别用 `kill`**(KeepAlive 秒重启),用 `uninstall.sh`(内部 `launchctl bootout`)。

## 6. 更新流程(已全自动)
- **开发机**:改代码 → `git push`(到 `main`)。
- **目标机**:`autoupdate` 每 5 分钟拉 `main`,有新版自动 `update.sh`:**只重建改动到的区域**(前端没改跳过),重启服务,自检。
- **护栏**:① migration 含**改/删既有结构或数据**(改表/删表/删索引/`UPDATE`/`DELETE`)→ **暂停 + 弹通知**,需人工跑 SQL 后 `./deploy/update.sh`;**纯 INSERT 配置种子**与**幂等建新表**(`CREATE TABLE IF NOT EXISTS`)属安全新增,自动应用、不暂停;② 构建/自检失败 → **自动回滚**上版 + 弹通知;③ mkdir 锁防并发。
- **重启目标机后**:登录一次桌面 → px + 服务 + 自动更新全自动恢复。

## 7. 已知坑 / 教训
- **求解器回调**:`run-solver.sh` 必须注入 `BACKEND_API_URL` 指向 backend 实际端口(8080);缺它 solver 默认连 `localhost:3001` → `Connection refused`、求解卡「等待求解器日志」。(已修)
- **Express 保持 4.x**:5.x 的 `app.get('*')` 会 path-to-regexp 报错,使 SPA fallback 静默失效。
- **npm**:用官方源 `registry.npmjs.org` + `maxsockets 3`(npmmirror 经 px 不稳 502);pip 清华源 OK。
- **数据迁移**:目标机 USB 被禁、业务数据不能上 GitHub(合规+>100MB)→ 用 **Teams** 传 dump → `restore-db.sh`。
- **装 brew/MySQL 需 admin** → 走公司**临时提权**(可能限时,需 sudo 的步骤尽量集中做)。
- **.env 历史泄露**:`backend/.env` 曾入 git(含旧 JWT/回调/DB 密码);现已移出跟踪,但 git 历史仍有,需 `git filter-repo` 清理 + 轮换。`scripts/migrate_to_zeabur.py` 也有明文生产库密码。

## 8. 待办
- [ ] MySQL root 密码轮换(曾在部署对话中出现,宜换)
- [ ] 给目标机绑**固定内网 IP**(路由器按 MAC)
- [ ] 从**另一台设备**验证 `http://10.245.72.69:8080` 局域网可达(确认防火墙「允许传入」已点)
- [ ] 稳定后把 `backend/.env` 的 `AUTH_ENFORCE=true`(强制登录;先确认有可用账号)
- [ ] 清理 git 历史泄露的旧 `.env` 凭证 + `migrate_to_zeabur.py` 明文密码(已挂后台任务)
- [ ] 给 `backup-db.sh` 挂每日定时(launchd `StartCalendarInterval`)
