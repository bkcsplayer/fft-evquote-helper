# DESIGN: Admin 后台信息架构重组 — 四业务线统一叙事（v3.0.1）

## 0. Task tier & Skill Manifest
- Tier: **STANDARD** — 纯 admin 前端多文件重组（约 7 个 jsx 文件），零后端/零 schema/零 API 契约改动，但属于 IA 级决策，需要 reviewer 把关 EV 红线。
- Skills: `cmm`、`codebase-memory`、`ponytail-review`（强制基础设施）+ `ui-ux-pro-max`（UI 唯一权威，本设计已咨询其导航/一致性/可访问性规则）。不需要 Python/FastAPI、Docker、deployment 等技能——本任务不碰后端、不部署。
- Planned advisor consults: **1**（完工 sign-off）。

---

## 1. Goal

Kuo 的反馈：v3.0 把 "Services" 组直接钉在旧侧边栏下面，后台像两套系统硬拼。目标：

1. 回答"四条业务线（EV / 诊断 / 鸟网 / 清洁）里哪些模块共用、哪些分开"；
2. 给出新的侧边栏导航结构 + 各页面职责边界，消除"两份日历并存""Dashboard 两段堆叠"的割裂感；
3. **红线**：EV 的 Case 数据模型、13 状态机、CaseDetail.jsx、全部 EV 后端契约一行不动，只调整组织与展示。

## 2. Current real flow

依据 `.cmm/REPORT.md`（2026-07-23，1285 节点/3585 边）+ 实读代码。**关键事实：v3 的 4 个 commit 均只在本地 main，从未 push/部署 → admin 路由改名是零成本的（无生产链接需兼容）。**

| 文件 | 现状 | 问题 |
|---|---|---|
| `admin/src/components/layout/AdminShell.jsx` L5-33 | `NAV_ITEMS` 三组：Operations（Dashboard/Cases/Surveys/Installations/Permits/Scheduling）+ Services（Unified Schedule/Bookings/Cleaning）+ Admin | "Services" 是平行拼贴；"Operations" 其实全是 EV；"Scheduling" 名字像日历实为容量配置 |
| `admin/src/pages/Surveys.jsx` | EV 勘测页：`GET /surveys/calendar`，calendar/list 双视图（**默认 calendar**），押金筛选（paid/reported/unpaid）、PendingRequestList（客户请求待确认）、CSV 导出；Dashboard 深链 `?filter=reported_unpaid` | 与统一日历构成"第二份日历" |
| `admin/src/pages/Installations.jsx` | EV 安装页：同构，外加 completion-email 补发动作、`?filter=completed_email_pending` 深链 | 同上，"第三份日历" |
| `admin/src/pages/services/UnifiedSchedule.jsx` | `GET /services/schedule` 读泛化 `Appointment`（**仅 status=booked**，6 种 kind：survey/install/diagnostic/bird_survey/bird_install/cleaning）+ 按服务色标/显隐，EV 只读。技术上已实现"公用日历" | 只挂在 Services 组下，没有取代 Surveys/Installations 的日历地位 → 三份日历并存 |
| `admin/src/pages/Scheduling.jsx` | booking-config / service-area / availability-overrides / bookings 取消 —— 容量配置页。后端 `availability.py` L76-84 确认容量是**全公司共享池、kind-agnostic**（四条线同一支队伍） | 名字误导；它其实是四线共用的基础设施，却待在"EV 组"里 |
| `admin/src/pages/Dashboard.jsx` | EV 区块（LivePipeline/KPI/Action Queue/StatusGroups/Activity）+ 底部整块 "Services" Card 简单堆叠；`Promise.all(/dashboard/stats, /dashboard/recent-activity, /services/dashboard)` | 两段式堆叠无统一叙事；**Promise.all 意味着 services 端点一挂整个 Dashboard 全挂（含 EV）** |
| `admin/src/pages/services/ServiceBookings.jsx` / `ServiceBookingDetail.jsx` / `CleaningSubscriptions.jsx` | 诊断+鸟网列表（segmented tabs）/ 详情 / 清洁订阅+4 次 visit 内联管理 | 页面本身职责清晰，不需要动 |
| `admin/src/App.jsx` | 全部 admin 路由注册处 | 路由改名只动这一处 |

CalendarGrid 事件契约（两边共用，已统一，不需改）：`{ id, start: Date, href, tone, title, subtitle, pill }`。

## 3. Chosen solution

**YAGNI 台阶：第 5 级（对现有代码做最小改动）** —— 纯展示层重组：改 `NAV_ITEMS` 数据、1 个路由改名、2 个默认值、Dashboard 重排 + 1 个健壮性修复。零新组件、零后端改动、零新依赖。

### 3.1 模块归属判定（回答"哪些共用、哪些分开"）

| 模块 | 归属 | 依据 |
|---|---|---|
| Dashboard | **共用**（先合后分） | kickoff §7 原则，维持 |
| 日历/排期 | **共用，且只保留一个入口**（统一日历） | 同一支队伍干四种活；容量池本来就是共享的 |
| Availability 容量配置（现 Scheduling 页） | **共用** | `availability.py` 确认 kind-agnostic 共享池 |
| Settings（含 Service Pricing）/ Users / 通知模板 | 共用 | 现状即如此 |
| Cases / Surveys 队列 / Installations 队列 / Permits / LoadCalc | **EV 专属** | 13 状态机生命周期独有 |
| Bookings（诊断+鸟网）/ Cleaning | **Services 专属** | 独立模型（V3 冻结契约） |
| Referrers | 现为 EV 专属，暂留 Admin 组 | 见开放问题 2 |

**Bookings 要不要和 Cases 统一列表？——不要**（ADR-003）。13 状态 EV 生命周期 vs 2 类型/9 状态 booking，列名、动作、筛选几乎零交集，合并只能得到一张最小公分母表，且迫使新代码耦合进冻结的 EV 区。kickoff §7 "业务列表分看" 原则**予以确认，不推翻**。跨线只统一两个轴：**时间轴（统一日历）+ 钱/注意力轴（Dashboard）**。

**Surveys/Installations 与统一日历的关系**：统一日历只含**已确认**的预约（Appointment.status=booked）；EV 的"客户已请求、待确认"条目和押金/完工邮件追办**是工作队列语义，不是日历语义**。因此：统一日历 = 唯一"看时间"的地方；Surveys/Installations 降格为 **EV 工作队列**（默认 list 视图），calendar 视图保留为页内次级开关（已建成、有押金 pill 等 EV 专属上下文，删掉反而损功能）。**不删任何页面、不删任何功能。**

### 3.2 新侧边栏（AdminShell.jsx `NAV_ITEMS` 重写，5 组）

```
OVERVIEW
  Dashboard          /admin
SCHEDULE                                  ← 四线共用
  Calendar           /admin/calendar      ← 原 /admin/services/schedule 改名迁移
  Availability       /admin/scheduling    ← 原 "Scheduling" 改标签，页面职责不变
EV CHARGERS                               ← 原 Operations 更名，只留 EV 专属项
  Cases              /admin/cases
  Surveys            /admin/surveys       （副标题改为工作队列口径）
  Installations      /admin/installations
  Permits            /admin/permits
SOLAR SERVICES
  Bookings           /admin/services/bookings
  Cleaning           /admin/services/cleaning
ADMIN
  Referrers / Settings / Users            （不变）
```

图标全部复用现有 inline SVG（Calendar 用现 IconSurveys 日历形；Availability 用现 IconServicesSchedule 列表形），不引新图标库。

### 3.3 各页面职责边界与具体改动

1. **App.jsx**：`/admin/services/schedule` → `/admin/calendar`（元素不变仍指 UnifiedSchedule 组件）；旧路径加一行 `<Route path="/admin/services/schedule" element={<Navigate to="/admin/calendar" replace />} />` 照顾本地肌肉记忆。文件名 `UnifiedSchedule.jsx` **不改**（避免无谓 churn）。
2. **UnifiedSchedule.jsx**：页标题 "Unified Schedule" → **"Calendar"**；副标题改为 "All four service lines on one calendar. EV rows are read-only; unconfirmed EV requests live in the Surveys / Installations queues."。其余（色标、显隐、CalendarGrid）不动。
3. **Surveys.jsx**：`useState('calendar')` → `useState('list')`（1 行，默认列表）；副标题 → "EV survey work queue — deposits & pending requests. Cross-service calendar lives in Schedule → Calendar."。深链兼容性：`?view=calendar`/`?filter=...` 逻辑在 L32-37 原样保留，Dashboard 现有深链全部不受影响。
4. **Installations.jsx**：同 3（默认 list + 副标题），completion-email 动作、CSV、筛选全不动。
5. **Scheduling.jsx**：仅文案——标题 "Scheduling" → **"Availability & Capacity"**，副标题注明 "Shared capacity pool across all four service lines."。功能零改动。
6. **Dashboard.jsx**：重排为四段叙事（组件内部全部复用，不新建端点）：
   - **§1 Company topline**（新排布）：合并营收 KPI = `stats.revenue_month + per_service.diagnostic.revenue_this_month + per_service.bird_netting.revenue_this_month + per_service.cleaning.revenue_this_month`（纯前端加法，容错：svc 为 null 时只显示 EV 值并标注 "EV only"）；旁列四线各自月收入迷你条（EV / Diagnostic / Bird / Cleaning，复用 Kpi/ServiceMiniCard）。
   - **§2 Needs attention**（跨线队列）：现有 3 条 EV QuickLink + 新增 1 条 "Pending bird quotes" QuickLink（`svc.combined.pending_bird_quotes` → `/admin/services/bookings?type=bird_netting`，该数据现已在页面 state 里）。
   - **§3 EV Chargers**：现 LivePipeline + KPI Snapshot + StatusGroups + Activity 区块**内部零改动**，仅包进带 "EV Chargers" SectionHeader 的分组。
   - **§4 Solar Services**：现三张 ServiceMiniCard + 合计 KPI 保留（合计里与 §1/§2 重复的两项——combined revenue 拆项、pending bird quotes——移除以免同屏重复）。
   - **健壮性修复（红线级）**：`Promise.all` → `Promise.allSettled`（或分别 catch）：`/services/dashboard` 失败时 EV 仪表盘照常渲染，services 区显示局部错误条；反之亦然。

### 3.4 不改的东西（明确划界）

后端全部文件；`CaseDetail.jsx`、`Cases.jsx`、`Permits.jsx`、`caseStatus.js`、`CalendarGrid.jsx`、`serviceTone.js`；`ServiceBookings/ServiceBookingDetail/CleaningSubscriptions`（仅其在导航中的位置变化）；客户端 `frontend/` 一个字不碰。

## 4. Rejected (cheaper) alternatives

- **台阶 1（删需求）**：不成立——三份日历并存 + Dashboard 拼贴是真实混乱，Kuo 的抱怨有据。
- **台阶 4（只改 NAV_ITEMS 数据不动页面）**：能解决分组感，但"两份日历、谁是正主"和 Dashboard 堆叠仍在 → 不满足需求本体。
- **更贵方案 A（否决）**：扩展 `GET /services/schedule` 把 EV pending 请求、押金 pill 并进统一日历，然后删除 Surveys/Installations。触碰 EV 数据聚合逻辑、把 EV 专属语义塞进泛化端点，违背"EV 一行不动"的精神，且删掉的是在用的工作流（ADR-002 记录）。
- **更贵方案 B（否决）**：四线合一的"所有工单"大表（ADR-003 记录理由）。
- **更贵方案 C（否决）**：把 Surveys/Installations 合并成一个带 tab 的新页面。新结构、迁移深链、无新增信息量——纯 churn。

## 5. Components & data contracts

**改动文件清单（共 6 个，全部 admin 前端）**：`AdminShell.jsx`（NAV_ITEMS 重写）、`App.jsx`（1 路由改名 + 1 redirect）、`UnifiedSchedule.jsx`（标题/副标题）、`Surveys.jsx`（默认视图 + 副标题）、`Installations.jsx`（同）、`Scheduling.jsx`（标题文案）、`Dashboard.jsx`（重排 + allSettled + 1 QuickLink + 合并营收算式）。

**不新增/不修改任何 API。** 消费的既有端点与形状：
- `GET /services/schedule?from&to` → `[{ id, kind, service, start_at, title, ref, link }]`（UnifiedSchedule，已有）
- `GET /surveys/calendar` / `GET /installations/calendar`（EV 队列页，已有，不动）
- `GET /dashboard/stats`、`GET /dashboard/recent-activity`、`GET /services/dashboard`（Dashboard，已有；combined revenue 为前端求和，公式见 §3.3-6，null 安全：任一字段缺失按 0 计并在 UI 标注部分数据）
- NAV_ITEMS 项形状不变：`{ to, label, icon, end? }`；新增第 4、5 组仅是数据行。
- CalendarGrid 事件契约不变。

**验收口径（给 tester）**：① EV 深链回归：`/admin/surveys?filter=reported_unpaid`、`/admin/installations?filter=completed_email_pending&view=calendar` 行为与现在完全一致；② `/admin/services/schedule` 302 到 `/admin/calendar`；③ 断开 `/services/dashboard`（mock 500）时 EV 仪表盘仍渲染；④ admin `npm run build` 通过；⑤ EV pytest 回归常绿（本任务理论上不触发后端，跑一遍作红线抽查）。

## 6. Risks & red lines

- **EV 冻结红线**：本设计对 EV 相关文件只改 2 个默认值 + 2 句副标题文案（Surveys/Installations），不触碰任何 EV 数据获取、状态机、CaseDetail。reviewer 应逐 diff 核对这两个文件改动 ≤ 3 行。
- **数据丢失防护**：不删除任何页面/功能/导出；深链参数逻辑原样保留（显式 `?view=calendar` 仍覆盖新默认值）。
- **错误处理**（红线，本次顺手修复而非新增风险）：Dashboard `Promise.all` → `allSettled`，消除 services 端点故障连坐 EV 视图的现存缺陷。
- **可访问性**：沿用 NavLink（active 态自带样式，键盘可达）；分组标题保持现有 uppercase 小标签模式；日历色标从不单独承载语义（每个事件都有文字 pill），符合 ui-ux-pro-max "color is not the only indicator"；无新增交互元素，无触控目标变化。
- **安全/信任边界**:无新输入、无新端点、无密钥相关改动。
- 残余风险：Dashboard 重排是 7 个文件里唯一"结构性" diff，最大文件 375 行 → 建议 implementer 按 §3.3-6 的四段顺序机械搬移现有 JSX 块，禁止改写子组件内部。

## 7. ADRs recorded

已写入项目 ADR（`manage_adr`，project `F-claude-vs-projects-fft-evquote-helper`，首建）：
- **ADR-002**:侧边栏 = 共用功能组 + 业务线组;统一日历是唯一日历入口;Surveys/Installations 降格为 EV 工作队列（默认 list），不删除（承载统一日历没有的 EV 工作流）。
- **ADR-003**:Cases 与 Service Bookings 列表永久分开;跨线只统一时间轴与钱/注意力轴。
- **ADR-004**:Dashboard 四段叙事（公司合计 → 跨线待办 → EV → Solar Services）;合并营收纯前端计算,不加端点。
- **ADR-005**:v3 未部署前 admin 路由改名零成本;部署后改名必须带 redirect。

## 8. Open questions for Kuo

1. **统一日历要不要显示"已请求待确认"的 EV 时段（琥珀色）？** 本设计按"日历只放已确认承诺"处理（待确认项在队列页）。若你希望日历上也看到，需给 `GET /services/schedule` 加只读聚合（v3 文件，不碰 EV 端点），建议 v3.1 再做。
2. **Referrers（EV 推荐人）放 Admin 组还是 EV CHARGERS 组？** 本设计暂留 Admin 组（最小改动）；若你认为它是 EV 业务的一部分，挪一行数据即可。
3. 侧边栏分组名用 "EV CHARGERS / SOLAR SERVICES" 这对命名可以吗？备选："EV LINE / SERVICE LINES"。admin 后台现为纯英文界面，本设计不引入 admin 端 i18n。
