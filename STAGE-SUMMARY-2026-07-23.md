# Stage Summary — fft-evquote-helper（阶段交接文档）

> **写给下一个 agent**：这是截至 2026-07-23 的项目完整画像。开工前通读本文 + `.cmm/REPORT.md`。
> 改任何已有文件前，先用 `trace_path` 查影响链。

---

## 1. 项目身份

| 项 | 值 |
|----|-----|
| 项目名 | FFT EV 充电桩报价与项目管理系统 |
| 当前版本 | v2.0（2026-07-03 发布，commit `a32e2d7`） |
| 生产地址 | `https://evquote.khtain.com` |
| 代码仓库 | `F:\claude-vs-projects\fft-evquote-helper` |
| 图谱节点/边 | 1,285 / 3,585（`.cmm/REPORT.md`） |

---

## 2. 业务全貌

覆盖 **客户自助提交 → 勘测 → 报价 → 电子签约 → 许可 → 安装 → 完工** 全链路。

| 维度 | 规模 |
|------|------|
| 客户端页面 | 9（Welcome → Step1 → Step2 → Submitted → StatusPage → QuoteView → QuoteApprove → SurveyConfirm） |
| 后台页面 | 15（Dashboard, Cases, CaseDetail 含 10 个 tab, Surveys, Permits, Installations, Users, Settings, Referrers, MaterialsManager, LoadCalc） |
| API 路由 | 147 条 |
| 数据库表 | 20 张 |
| 案件状态 | 13 个状态节点 |

---

## 3. 技术栈

```
前端（两个独立 Vite 应用）
  frontend/   → 客户端，端口 7220
  admin/      → 后台，端口 7221
  共用：React + Vite + TailwindCSS

后端
  backend/    → FastAPI + SQLAlchemy + Alembic + PostgreSQL 16，端口 7222

通知
  Email：SMTP + Jinja2 模板（DB 可编辑）
  SMS：Twilio + Jinja2 模板

部署
  Docker Compose 4 服务
  生产：Vultr VPS + 宝塔 Nginx 反代
```

---

## 4. 目录地图

```
fft-evquote-helper/
├── frontend/src/           # 客户端
│   ├── pages/
│   │   ├── Welcome.jsx      # 首页
│   │   ├── Step1.jsx        # 填写信息
│   │   ├── Step2.jsx        # 上传照片
│   │   ├── Submitted.jsx    # 提交成功
│   │   ├── StatusPage.jsx   # 案件状态跟踪
│   │   ├── QuoteView.jsx    # 查看报价
│   │   ├── QuoteApprove.jsx # 电子签约（手写签名）
│   │   └── SurveyConfirm.jsx# 勘测确认
│   ├── components/
│   │   └── PlacesAddressInput.jsx  # Google Places 地址自动完成
│   ├── services/api.js
│   └── i18n/index.js        # 国际化（t / useI18n）
│
├── admin/src/              # 后台
│   ├── App.jsx              # 路由入口
│   ├── pages/
│   │   ├── Dashboard.jsx    # 仪表盘（KPI + 活动时间线 + 管道）
│   │   ├── Cases.jsx        # 案件列表
│   │   ├── CaseDetail.jsx   # ⚠️ 案件工作台 — 688 行 / 复杂度 102
│   │   ├── Surveys.jsx      # 勘测管理
│   │   ├── Permits.jsx      # 许可管理
│   │   ├── Installations.jsx# 安装管理
│   │   ├── Users.jsx        # 用户管理
│   │   ├── Settings.jsx     # 系统设置（定价/品牌/邮件模板）
│   │   ├── Referrers.jsx    # 推荐人统计
│   │   ├── Login.jsx        # 登录
│   │   ├── LoadCalc.jsx     # CEC 8-200 负荷计算器（最近新增）
│   │   └── case/
│   │       ├── FinanceTab.jsx    # 财务 tab
│   │       ├── BomTab.jsx        # BOM tab
│   │       └── AttachmentsTab.jsx# 附件 tab
│   ├── components/
│   │   ├── MaterialsManager.jsx  # 材料库管理（add 函数 41 处引用）
│   │   ├── auth/RequireAuth.jsx
│   │   ├── layout/AdminShell.jsx
│   │   └── ui/（CalendarGrid, Card, Pill, Skeleton, StageFlow, StatusTag, PendingRequestList）
│   ├── services/api.js
│   └── utils/
│       ├── caseStatus.js    # 状态工具（toneForCaseStatus/statusLabel/isCaseStatusIn）
│       └── cecLoad.js       # CEC 8-200 负荷算法纯函数
│
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI 应用入口
│   │   ├── config.py        # pydantic-settings 配置
│   │   ├── database.py      # SQLAlchemy Base + session
│   │   ├── models/models.py # 全部 20 张表
│   │   ├── schemas/schemas.py
│   │   ├── api/v1/          # 路由（admin/ + public/）
│   │   ├── services/        # 业务逻辑
│   │   │   ├── case_service.py
│   │   │   ├── quote_service.py
│   │   │   ├── finance_service.py
│   │   │   ├── email_service.py
│   │   │   ├── sms_service.py
│   │   │   ├── notification_service.py
│   │   │   ├── status_machine.py     # 状态机核心
│   │   │   ├── bootstrap_service.py
│   │   │   ├── security.py
│   │   │   └── data_fix_service.py
│   │   ├── middleware/auth.py
│   │   ├── templates/        # 12 个 Jinja2 邮件/SMS 模板
│   │   └── utils/（reference, token, url_utils）
│   ├── migrations/versions/  # 5 个 Alembic 迁移
│   └── tests/                # 3 个测试文件
│
├── docs/                     # 部署/交接文档
├── scripts/                  # db-backup, db-restore, smoke 脚本
├── docker-compose*.yml
├── MEMORY.md                 # 人脑级记忆（必读）
├── .cmm/REPORT.md            # cmm 代码图谱报告（必读）
└── STAGE-SUMMARY-2026-07-23.md  # 本文
```

---

## 5. 核心数据模型（按引用次数排序）

| 模型 | 被引用 | 文件位置 |
|------|--------|---------|
| **AdminUser** | 58 | `backend/app/models/models.py` |
| **CaseStatus** | 27 | `backend/app/models/models.py` |
| **Case** | 17 | `backend/app/models/models.py` |
| **CaseStatusHistory** | 10 | `backend/app/models/models.py` |
| **CaseBomLine** | 6 | `backend/app/models/models.py` |
| **Customer** | 6 | `backend/app/models/models.py` |

> 改这些模型前必须 `trace_path("AdminUser", direction="both")` 等，查清所有调用方。

---

## 6. 高风险文件（改动需格外谨慎）

| 文件 | 复杂度 | 行数 | 风险原因 |
|------|--------|------|---------|
| `admin/src/pages/CaseDetail.jsx` | 102 | 688 | 单体巨兽，承载 10 个 tab 的状态，改一处可能波及多 tab |
| `frontend/src/components/PlacesAddressInput.jsx` | 28 | 233 | Google Maps API 集成，异步逻辑复杂 |
| `admin/src/pages/Settings.jsx` | 21 | 226 | 定价/品牌/模板全在这，改错影响全局配置 |
| `frontend/src/pages/QuoteApprove.jsx` | 15 | 307 | 手写签名 Canvas + 电子签约，涉及法律效力 |
| `admin/src/pages/case/BomTab.jsx` | 10 | 146 | BOM 增删改 + 报价生成 |
| `admin/src/pages/Installations.jsx` | 10 | 193 | 安装调度 + 完工邮件 |

### 全局依赖（改了影响面极大）

| 函数/模块 | 被引用 | 说明 |
|-----------|--------|------|
| `add`（MaterialsManager） | 41 | 材料库增改都走它 |
| `load`（CaseDetail） | 23 | 案件数据加载核心 |
| `Field`（CaseDetail） | 17 | 所有 tab 的字段渲染都调它 |
| `t` / `useI18n`（frontend i18n） | 20+ | 客户端所有文案 |
| `toneForCaseStatus` / `statusLabel` / `isCaseStatusIn` | 18+ | 状态展示 + 条件判断 |

---

## 7. 改动前检查清单（agent 必执行）

```
□ 1. 读了 MEMORY.md 和 .cmm/REPORT.md
□ 2. 对要改的函数/模型执行了 trace_path（至少 depth=2）
□ 3. 如果改 models.py，确认迁移是否需要新增（Alembic）
□ 4. 如果改 CaseDetail.jsx，确认影响哪些 tab
□ 5. 如果改 i18n 或 caseStatus 工具函数，确认所有调用方兼容
□ 6. 如果改后端路由，确认 admin 前端 api 调用匹配
□ 7. UI 改动走 ui-ux-pro-max skill
□ 8. 改完跑 build 验证（admin + frontend 都要）
□ 9. 如果改 cecLoad.js，跑 cecLoad.selfcheck.mjs 自检
```

---

## 8. 已知坑

1. **`FFTAdmin` 不是 `admin`** — 后台登录用户名是 `FFTAdmin`，不是 `admin`
2. **deploy.sh 依赖 GitHub 可达** — 如果 GitHub 不通，用 Tailscale 直传 VPS（见 MEMORY.md 部署两条路）
3. **Tailscale DNS 可能接管本机网络** — 现象是浏览器断网，跑 `tailscale set --accept-dns=false --accept-routes=false` 修复
4. **`docs/SYSTEM-OVERVIEW.md` 未提交** — 是个新增未跟踪文件，酌情提交
5. **根目录 `image.png` 是用户临时截图** — 未跟踪，勿提交
6. **LoadCalc subpanel 是最近补提交的** — 之前 memory 误记"已上线"，实际 2026-07-03 才真正提交部署，生产已验证
7. **admin/frontend 各有一个 ImageModal** — 实现相似但未共享，存在重复代码

---

## 9. 部署速查

| 环境 | 地址 | 端口 |
|------|------|------|
| 本地 frontend | localhost | 7220 |
| 本地 admin | localhost | 7221 |
| 本地 backend | localhost | 7222 |
| 本地 db | localhost | 7223 |
| VPS frontend | 127.0.0.1 | 7620 |
| VPS admin | 127.0.0.1 | 7621 |
| VPS backend | 127.0.0.1 | 7622 |
| 生产域名 | `https://evquote.khtain.com` | 443 → 宝塔 → 7620/7621 |

VPS：Vultr `45.76.242.112` / Tailscale `100.125.45.25`，目录 `/www/wwwroot/evquote.khtain.com/fft-evquote-helper`

---

## 10. 待办

1. Load Calc + subpanel 等用户实测反馈
2. `docs/SYSTEM-OVERVIEW.md` 酌情提交
3. CaseDetail.jsx 长期应考虑拆分（688 行 / 复杂度 102）
4. 两个 ImageModal 可考虑合并为共享组件

---

## 11. cmm 工具速查（agent 用）

```
# 查函数定义和调用链
search_graph(project="F-claude-vs-projects-fft-evquote-helper", query="<自然语言描述>")

# 追踪影响范围（改前必做）
trace_path(function_name="<函数名>", project="...", direction="both", depth=2)

# 读函数源码
get_code_snippet(qualified_name="<完整限定名>", project="...")

# 文本搜索
search_code(pattern="<正则>", project="...")

# 检测改动影响
detect_changes(project="F-claude-vs-projects-fft-evquote-helper")
```

---

> 本文由 Claude Code 在 2026-07-23 生成，综合了 MEMORY.md + .cmm/REPORT.md + 图谱数据。
> 下一个 agent 开工时，把本文和 `.cmm/REPORT.md` 都读一遍即可掌握全局。
