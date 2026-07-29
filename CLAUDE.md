# CLAUDE.md — fft-evquote-helper

> 本项目遵循全局多模型开发流水线。可复用框架在 `~/.claude/`：
> 4 个 agent（architect→reviewer→implementer→tester）+ `/build` 命令 +
> `~/.claude/rules/common/pipeline.md` + `skill-routing.md`。
> 本文件只放**项目特定**信息；通用规则不在此重复。

## 开发方式

- 非平凡改动（>1 行）默认走 **`/build "<任务>"`**：架构→审核→实现→测试，
  架构后停下等我批准。单行级改动可直接做。
- **技能清单协议**：architect 在 DESIGN.md §0 解析任务分级
  （TRIVIAL/STANDARD/CRITICAL）+ Skill Manifest；下游 agent 只准调清单内技能。
- **顾问检查点**：按 /build 的 Advisor Economy Policy 执行——TRIVIAL 零咨询；
  STANDARD 1 次（完成闸门）；CRITICAL 2 次（+实现中期审查）；
  同一错误连败 2 次强制升级顾问，禁止第 3 次盲试；裁决即落 ADR，跨会话复用。
- 思考阶段就爬 YAGNI 台阶（ponytail），红线（校验/数据丢失/安全/可访问性）不砍。
- 改已存在文件前先读 `.cmm/REPORT.md`（cmm 图谱）定位再改。
- 涉及部署/组网/资源放置的设计，先读 `~/.claude/infra/SERVERS.md`。
- 开工先读 `MEMORY.md`，收尾更新它。

## 语言

默认中文回复；代码与注释用英文。

## 项目特定

- 一句话目标：FFT（Calgary）的 EV 充电桩报价与项目管理系统 + 三条新服务线
  （光伏诊断 / 鸟网 / 板面清洁），覆盖客户自助提交 → 勘测 → 报价 → 电子签约 →
  许可 → 安装 → 完工 → 开票全链路。已上线 `https://evquote.khtain.com`。
- 技术栈：前端 `frontend/`（客户端）+ `admin/`（后台）React 18 + Vite +
  Tailwind；后端 `backend/` FastAPI + SQLAlchemy + Alembic + PostgreSQL 16；
  通知 SMTP + Twilio + Jinja2 模板（DB 可改）；WeasyPrint 出 PDF 发票。
  **没有 Celery / Redis / 任何调度器**——定时任务只能靠 VPS cron 打后端端点。
- 端口范围：本地 frontend 7220 / admin 7221 / backend 7222 / db 7223；
  生产 VPS 127.0.0.1:7620 / 7621 / 7622（宝塔 Nginx 反代）。
- 部署目标：Vultr VPS（公网 `45.76.242.112` / Tailscale `100.125.45.25`），
  目录 `/www/wwwroot/evquote.khtain.com/fft-evquote-helper`，
  compose 文件 `docker-compose.vps.yml`。**三端同步铁律**：本地 commit →
  push GitHub → VPS `git reset --hard origin/main` + 重建容器，一步都不能省
  （绕过 GitHub 直传会让 VPS 领先 origin，下次 deploy 就被冲掉）。
- 项目特定红线/约定：
  1. **绝不给真实客户发邮件/短信**。生产库里只有 `FFT-2026-0002`（Raju）是真
     实业务记录，其余全部带 `MOCK-` 编号 / `Mock-` 名字标记。任何会对外发消息
     的新功能必须内建"收件人重定向到 Kuo"开关（SMS `+15879669668`、邮件
     `cool@khtain.com`），默认在生产打开。
  2. 演示数据只能由 `backend/scripts/mock_data.py` 种进数据库并打双标记，
     前端禁止写死假数据。
  3. e-Transfer 收款邮箱固定 `bruce@khtain.com`，不得再出现占位地址。
  4. 金额计算（报价/发票/GST）属业务红线：改动必须有断言级测试
     （见 `backend/tests/test_invoice_items.py` 的写法）。
  5. 后台部分端点（permit 状态、安排安装、标记完工）会**自动发通知且无静默
     开关**——补录历史数据一律直写数据库，不要走这些端点。
