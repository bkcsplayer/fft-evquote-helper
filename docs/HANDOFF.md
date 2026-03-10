## 交付手册（本地 Windows + Docker）

### 一键跑通（推荐）
在仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-ci.ps1 -WithDockerTests -BackupAfter
```

这条命令会完成：
- 启动 Docker 全栈（db + backend + frontend + admin）
- 跑端到端 smoke（含 UI 可访问性 + 业务闭环）
- 跑 Docker pytest e2e（独立 test DB，不污染主数据）
- 备份主库到 `.\backups\*.sql`
- 最后打印交付摘要（URL/账号/备份路径）

### 访问地址（Docker）
- 顾客端：`http://localhost:7220/quote`
- Admin：`http://localhost:7221/admin`
- API docs：`http://localhost:7222/docs`

默认 Admin（development 首次启动自动创建）：
- username：`admin`
- password：`admin1234`

### 常见问题
- **端口冲突**：确保本机未占用 `7220/7221/7222/7223`
- **页面能打开但 API 404**：确认 `docker compose ps` 里 backend 为 healthy；前端/后台通过 Nginx 反代 `/api` 到 backend
- **邮件/短信**：不配置 SMTP/Twilio 也能跑通主流程；需要真实发送再配置 `.env` 相关变量
  - 本地验收建议用 Mailpit（不依赖 Gmail 投递）：`docker compose -f docker-compose.yml -f docker-compose.mailpit.yml --env-file .env up --build -d`，然后打开 `http://localhost:7224`

### 验收清单
见 `docs/UAT-CHECKLIST.md`

