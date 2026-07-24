# CMM 项目分析报告：`fft-evquote-helper`

> 生成时间：2026-07-23 | 图谱节点：1285 | 边关系：3585

---

## 基本信息

| 指标 | 值 |
|------|-----|
| 索引节点数 | 1,285 |
| 边关系数 | 3,585 |
| 主要语言 | Python 57 文件 / JavaScript 52 文件 / HTML 14 文件 |
| 包/模块数 | 15（FastAPI, SQLAlchemy, Pydantic, Stripe, Twilio, bcrypt 等） |
| 磁盘占用 | ~5.7 MB |

---

## 架构层次

```
api 层（FastAPI 路由定义）
  └─ core 层（admin/src, frontend/src — 高扇入 44 in / 0 out）
       └─ entry 层（App.jsx, AdminShell — 仅出向调用）
```

三层清晰：API 定义路由，core 层承载业务逻辑和 UI，entry 层为启动入口。

### 模块集群（Leiden 社区检测）

| 集群 | 成员数 | 内聚度 | 关键节点 | 所在包 |
|------|--------|--------|----------|--------|
| **backend** | 50 | 0.94 | `_transition_case_status`, `ensure_defaults`, `_sync_survey_deposit` | backend, admin |
| **admin 主** | 38 | 0.98 | `CaseDetail`, `load`, `isCaseStatusIn` | admin |
| **admin 仪表盘** | 26 | 0.91 | `Dashboard`, `toneForCaseStatus`, `statusLabel` | admin |
| **frontend** | 27 | 0.95 | `t`, `useI18n`, `StatusPage`, `QuoteView`, `QuoteApprove` | frontend |
| **admin 案件操作** | 16 | 0.83 | `Permits`, `Cases`, `FinanceTab`, `setStatus` | admin, frontend |
| **backend 通知** | 14 | 0.95 | `render_email_from_db_or_files`, `notify_admin_event` | backend |
| **backend 测试辅助** | 11 | 1.00 | `_url`, `_submit_case`, `_admin_headers` | backend |

---

## 入口点 & 路由

### 前端入口

| 入口 | 文件 |
|------|------|
| `App` | `admin/src/App.jsx` |
| `AdminShell` | `admin/src/components/layout/AdminShell.jsx` |
| `RequireAuth` | `admin/src/components/auth/RequireAuth.jsx` |

### 关键 API 路由（按模块）

**认证**
- `POST /auth/login` — 管理员登录
- `GET /auth/me` — 当前用户信息

**案件管理**
- `POST /cases` — 客户提交新案件
- `GET /cases` — 案件列表
- `POST /cases/{case_id}/permit` — 创建许可
- `PATCH /permits/{permit_id}/status` — 更新许可状态
- `POST /cases/{case_id}/notes` — 添加备注

**BOM / 报价**
- `PATCH /bom/{line_id}` — 更新 BOM 行
- `DELETE /bom/{line_id}` — 删除 BOM 行

**文件 / 附件**
- `POST /cases/{case_id}/survey/photos` — 上传勘测照片
- `DELETE /attachments/{attachment_id}` — 删除附件
- `DELETE /survey/photos/{photo_id}` — 删除勘测照片

**通知**
- `POST /notifications/{notification_id}/resend` — 重发通知

**其他**
- `GET /charger-brands` — 充电桩品牌列表
- `GET /cases/{case_id}/timeline` — 案件时间线
- `GET /referrers/stats` — 推荐人统计
- `GET /users` — 用户列表

> 共 147 条路由，覆盖全链路：客户提交 → 勘测 → 报价 → 签约 → 许可 → 安装 → 完工。

---

## 核心函数（被调用最频繁 / 高扇入）

| 函数 | 被调用次数 | 所在文件 |
|------|-----------|---------|
| `add` (MaterialsManager) | 41 | `admin/src/components/MaterialsManager.jsx` |
| `load` (CaseDetail) | 23 | `admin/src/pages/CaseDetail.jsx` |
| `Field` (CaseDetail) | 17 | `admin/src/pages/CaseDetail.jsx` |
| `t` (i18n) | 13 | `frontend/src/i18n/index.js` |
| `load` (Settings) | 9 | `admin/src/pages/Settings.jsx` |
| `toneForCaseStatus` | 7 | `admin/src/utils/caseStatus.js` |
| `useI18n` | 7 | `frontend/src/i18n/index.js` |
| `statusLabel` | 6 | `admin/src/utils/caseStatus.js` |
| `setStatus` (FinanceTab) | 5 | `admin/src/pages/case/FinanceTab.jsx` |
| `isCaseStatusIn` | 5 | `admin/src/utils/caseStatus.js` |

---

## 核心类/模型（高连接度）

| 类 | 被引用次数 | 职责 |
|----|-----------|------|
| **AdminUser** | 58 | 管理员账号（最高引用模型） |
| **CaseStatus** | 27 | 案件状态枚举 |
| **Case** | 17 | 核心案件实体 |
| **CaseStatusHistory** | 10 | 状态变更审计 |
| **CaseBomLine** | 6 | BOM 行项 |
| **Customer** | 6 | 客户实体 |
| **AdminRole** | 3 | 角色枚举 |
| **InstallType** | 3 | 安装类型枚举 |
| **CaseAttachment** | 3 | 统一文件存储 |
| **CaseNote** | 3 | 案件备注 |

---

## 高复杂度热点（高风险改动区）

| 函数/组件 | 复杂度 | 认知复杂度 | 行数 | 文件 |
|-----------|--------|-----------|------|------|
| **CaseDetail** | 102 | 160 | 688 | `admin/src/pages/CaseDetail.jsx` |
| **PlacesAddressInput** | 28 | 37 | 233 | `frontend/src/components/PlacesAddressInput.jsx` |
| **Settings** | 21 | 31 | 226 | `admin/src/pages/Settings.jsx` |
| **QuoteApprove** | 15 | 16 | 307 | `frontend/src/pages/QuoteApprove.jsx` |
| **BomTab** | 10 | 14 | 146 | `admin/src/pages/case/BomTab.jsx` |
| **Installations** | 10 | 15 | 193 | `admin/src/pages/Installations.jsx` |
| **Permits** | 8 | 10 | 177 | `admin/src/pages/Permits.jsx` |

> ⚠️ **CaseDetail** 复杂度 102、688 行，是这个项目最大的单体组件，几乎承载了案件工作台所有 tab 的状态和操作。改动此处风险极高。

---

## 使用建议

### 改动前必查

1. **改 `AdminUser` / `Case` / `CaseStatus` 模型** → 用 `trace_path` 查出所有调用链，这些是高扇入核心实体
2. **改 `CaseDetail.jsx`** → 复杂度 102，改动前先用 `trace_path("CaseDetail", direction="outbound")` 看清所有下游依赖
3. **改 `caseStatus.js` 工具函数** → `toneForCaseStatus`/`statusLabel`/`isCaseStatusIn` 被 5-7 处引用，改签名会波及多处
4. **改 i18n (`t`/`useI18n`)** → 前端几乎所有页面都在用，合计 20+ 引用
5. **改 MaterialsManager** → `add` 函数被 41 处调用，是材料管理的核心枢纽

### 建议用 `trace_path` 追踪的关键函数

```
AdminUser          — 最高引用模型，任何 schema 改动需全量影响分析
CaseDetail         — 688 行巨兽，改动前必追踪
_transition_case_status — 状态机核心
t / useI18n        — 国际化全局依赖
render_email_from_db_or_files — 邮件渲染入口
```

### 架构风险

- `CaseDetail.jsx` 过大（688 行 / 复杂度 102），建议未来拆分到独立 tab 组件（已有部分 tab 如 FinanceTab、BomTab、AttachmentsTab 独立，但 CaseDetail 仍持有大量状态）
- LoadCalc (`admin/src/pages/LoadCalc.jsx` + `admin/src/utils/cecLoad.js`) 未出现在图谱热点中，但属于最近新增模块，算法正确性依赖 `cecLoad.selfcheck.mjs` 自检
- 前端两个 `ImageModal`（admin + frontend）是相似实现但不是共享组件，存在重复
