# FFT EV Charger Quote System

基于 `SKILL.md` 的 EV 户用充电桩安装报价与项目管理系统（Customer Mobile Web + Admin Panel + FastAPI + PostgreSQL）。

## 支付方式（Survey Deposit）

- **默认使用 e-transfer**：顾客端在 Survey Confirm 页面会显示收款邮箱/金额/备注（案件编号），并可提交 “我已完成转账”。
- **Admin 核对**：在 `CaseDetail -> Survey` 可一键标记 “deposit paid (e-transfer)” 并自动发送通知（邮件/短信模板可在 Settings 编辑）。
- **Stripe 已禁用**：`/api/v1/payments/create-checkout` 和 `/api/v1/payments/webhook` 会返回 **410**（保留仅为兼容旧前端/脚本）。

## 本地开发（推荐）

1) 复制环境变量

```bash
cp .env.example .env
```

2) 启动数据库 + 后端（含热重载）

```bash
docker compose -f docker-compose.dev.yml --env-file .env up --build
```

3) 初始化数据库（首次）

```bash
cd backend
alembic upgrade head
```

4) 启动顾客端与 Admin（两个终端）

```bash
cd frontend
npm install
npm run dev -- --port 7230
```

```bash
cd admin
npm install
npm run dev -- --port 7231
```

## 生产部署（docker-compose）

```bash
docker compose --env-file .env up --build -d
```

### VPS + 宝塔（同域名 /admin）

推荐用宝塔的 Nginx 做 HTTPS 与路由，Docker 仅绑定到 `127.0.0.1`：

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml --env-file .env up --build -d
```

然后在宝塔站点 `evquote.khtain.com` 的 Nginx 配置里，把：

- `/` 反代到 `http://127.0.0.1:7620`
- `/admin/` 反代到 `http://127.0.0.1:7621`
- `/api/` 与 `/uploads/`（可选）反代到 `http://127.0.0.1:7622`

## 本地 Docker（全栈，一键跑通）

如果你希望 **db + backend + customer frontend + admin** 全都在 Docker 里跑：

1) 复制环境变量（并确保 `APP_ENV=development`，这样会自动创建默认超级管理员）

```bash
cp .env.example .env
```

2) 一键启动

```bash
docker compose --env-file .env up --build
```

### 本地邮件收件箱（推荐用于测试）

如果你希望在本地**100% 可见**每一封系统邮件（不依赖 Gmail 投递/垃圾箱策略），可以启动内置的 Mailpit：

```bash
docker compose -f docker-compose.yml -f docker-compose.mailpit.yml --env-file .env up --build -d
```

然后打开 Mailpit Web UI：

- `http://localhost:7224`

说明：

- 这个模式会把 backend 的 SMTP 指向 Mailpit（不对外投递），用于你本地验收与模板预览。

说明：

- `FRONTEND_URL` / `ADMIN_URL` 在 Docker 场景由 `docker-compose.yml` 提供默认值（分别是 `http://localhost:7220` / `http://localhost:7221`），用于短信/邮件里的跳转链接。

常用脚本（PowerShell）：

- 端到端 smoke：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-docker.ps1`
- 一键本地 CI（up + smoke）：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-ci.ps1`
- 一键本地 CI（up + smoke + docker pytest）：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-ci.ps1 -WithDockerTests`
- 一键本地 CI（最后顺便备份 DB）：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-ci.ps1 -BackupAfter`
- 备份数据库：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1`
- 恢复数据库：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-restore.ps1 -File .\backups\<file>.sql`

交付建议（你最后一起测试就跑这个）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-ci.ps1 -WithDockerTests -BackupAfter
```

## Docker 测试（可选）

如果你希望用 Docker 跑一遍完整 API 端到端测试（会启动独立的 test DB）：

```bash
docker compose -f docker-compose.test.yml --env-file .env up --build --abort-on-container-exit --exit-code-from tests
```

访问：

- 顾客端（Docker）: `http://localhost:7220/quote`
- Admin（Docker）: `http://localhost:7221/admin`
- API（Docker）: `http://localhost:7222/docs`

默认 Admin（仅 development 环境首次启动会自动创建）：

- username: `admin`
- password: `admin1234`

## 访问地址

- 顾客端（dev）: `http://localhost:7230/quote`
- Admin（dev）: `http://localhost:7231/admin`
- API（dev/prod）: `http://localhost:7222/docs`

## 目录结构

见 `SKILL.md` 的 “项目结构” 一节（本仓库按同样约定组织）。

## 交付与验收

- 交付手册：`docs/HANDOFF.md`
- UAT 清单：`docs/UAT-CHECKLIST.md`
