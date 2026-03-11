<div align="center">
  <img src="./assets/banner.png" alt="FFT EV Quote System Banner" width="100%">
</div>

# ⚡ FFT EV Charger Quote System

<p align="center">
  <b>企业级 EV 户用充电桩智能报价与全流程项目管理系统</b>
</p>

<p align="center">
  <a href="#-系统简介">系统简介</a> •
  <a href="#-核心特性">核心特性</a> •
  <a href="#-技术栈">技术栈</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-部署指南">部署指南</a>
</p>

---

## 📖 系统简介

**FFT EV Quote System** 是一款面向现代化电动车（EV）充电桩安装服务商的端到端管理平台。系统集成了 **C端移动化自适应报价流程 (Customer Mobile Web)** 与 **B端强大的后台管理面板 (Admin Panel)**，辅以高性能的 **FastAPI** 接口和 **PostgreSQL** 数据库驱动，助力企业实现无纸化、自动化的报价与现场服务流转。

<div align="center">
  <img src="./assets/dashboard.png" alt="System Dashboard Preview" width="100%">
</div>

---

## ✨ 核心特性

- 📱 **移动优先的顾客端**：引导式 Survey 流程，顾客上传电表/现场照片，获取即时报价估算。
- 💼 **专业级 B端管理面板**：一站式查阅所有案件（Case），从线索（Lead）到派单安装（Install）全生命周期追踪。
- 💳 **灵活的支付方案**：
  - **默认使用 e-transfer**：顾客在确认阶段可见收款邮箱，一键提交 "我已完成转账"。
  - **Admin 核对付款**：管理员可在 `CaseDetail` 一键确认收款，自动触发短信/邮件通知。
- 📨 **智能自动化通知**：内置基于模板的邮件与短信（Twilio等）提醒机制。
- 🔒 **企业级安全与架构**：RBAC 权限管理，通过 HTTPS 提供标准级安全认证结构。

---

## 🛠️ 技术栈

| 模块 | 技术选型 | 说明 |
| --- | --- | --- |
| **前端 (顾客+管理后台)** | React / Next.js / Tailwind CSS | 响应式设计，极致化用户体验 |
| **后端 API** | [FastAPI](https://fastapi.tiangolo.com/) (Python) | 高性能异步处理，自动 OpenAPI 文档 |
| **数据库** | PostgreSQL + SQLAlchemy | 可靠的数据持久化与 ORM 映射 |
| **部署与容器化** | Docker & Docker Compose | 一键构建，环境隔离，极易迁移部署 |

---

## 🚀 快速开始（本地开发）

推荐使用 Docker 从零开始一键拉起整个开发与测试环境。

### 1. 环境变量配置
```bash
cp .env.example .env
# 确保 APP_ENV=development，系统会自动创建初始超级管理员
```

### 2. 一键启动 (Docker)
包含数据库、后端、顾客前端和 Admin 后台：
```bash
docker compose --env-file .env up --build
```
> **提示**：为方便本地测试通知发送，可启动内置的 Mailpit（对内测试拦截邮箱）：
> `docker compose -f docker-compose.yml -f docker-compose.mailpit.yml --env-file .env up --build -d`
> 访问 Mailpit 取件箱: `http://localhost:7224`

### 3. 访问系统
- 🚗 **顾客端 (Customer)**: `http://localhost:7230/quote` (或 Docker 内 `http://localhost:7220/quote`)
- 💻 **管理后台 (Admin)**: `http://localhost:7231/admin` (或 Docker 内 `http://localhost:7221/admin`)
- 🔧 **API 文档 (Swagger UI)**: `http://localhost:7222/docs`

> 默认初始管理员账号（仅 Dev 环境首次启动创建）：
> - **Username**: `admin`
> - **Password**: `admin1234`

---

## 🚢 生产部署

对于 VPS 或云服务器，推荐使用宝塔面板通过 Nginx 进行反向代理。

### 1. 启动生产容器
后台服务与前端容器不直接暴露外网，仅绑定到 `127.0.0.1`：
```bash
docker compose -f docker-compose.vps.yml --env-file .env up --build -d
```

### 2. Nginx 反向代理示例
- `/` 代理分配到 `http://127.0.0.1:7620` (顾客端)
- `/admin/` 代理分配到 `http://127.0.0.1:7621` (管理后台)
- `/api/` 及 `/uploads/` 代理分配到 `http://127.0.0.1:7622` (后端服务)

---

## 🧪 测试与验收 (QA)

项目包含完善的自动化与端到端测试脚本（PowerShell环境）：

- 🚦 **端到端 Smoke 测试**: 
  `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-docker.ps1`
- ⚙️ **带单元测试的一键 CI**: 
  `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-ci.ps1 -WithDockerTests`
- 📦 **自动备份数据库并运行 CI**:
  `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-ci.ps1 -WithDockerTests -BackupAfter`
- 💾 **单独的数据库备份/恢复**:
  `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\db-backup.ps1`

> **验收文档参考**：交付清单与手册请参见 `docs/HANDOFF.md` 和 `docs/UAT-CHECKLIST.md`

---

<p align="center">
  <i>构建下一代智能无纸化充电网络项目管理方案 ⚡ Powered by FFT</i>
</p>
