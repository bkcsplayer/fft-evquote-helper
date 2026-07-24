# DESIGN: Dashboard v2 — 一服务一大区块（4 服务块 + 公司公用块）

> 本文件是 `DESIGN.md`（v3.0.1 admin IA 重组）的**补充**，只覆盖 Dashboard.jsx 一页的结构方案，
> 取代其 §3.3-6 的"四段叙事"排布（ADR-004 → 本文 ADR-006）。其余 DESIGN.md 内容继续有效。

## 0. Task tier & Skill Manifest
- Tier: **STANDARD** — 单文件（仅 `admin/src/pages/Dashboard.jsx`）纯展示层重排，零后端/零 API/零 schema；但它推翻已记录的 ADR-004 版式、且是后台主页的 IA 级决策，故按 STANDARD 走而非 TRIVIAL。
- Skills: `cmm`、`codebase-memory`、`ponytail-review`（强制基础设施）+ `ui-ux-pro-max`（UI 唯一权威，本设计已按其层级/图标/加载态/可访问性规则约束结构）。不需要任何后端/部署技能。
- Planned advisor consults: **1**（完工 sign-off）。

## 1. Goal

Kuo 原话要求（2026-07-24）：
1. Dashboard 按 4 条服务线各成**一个独立大区块**（EV Chargers / Diagnostic / Bird Netting / Cleaning），块内展示该服务自己的统计；
2. 每个服务块顶部用 **icon** 标识服务类型（复用已建的 `ServiceIcon`，4 个 kind，不新造图标）；
3. **财务公用数据（合并营收）与"总预约数字"类公用指标单独成一个大区块**，不混进 4 个服务块、也不混进 Needs attention 队列。

硬约束：presentation-layer only——不动 EV 状态机 / Case model / CaseDetail.jsx，不加后端接口，只用 Dashboard.jsx 现已拉取的数据（`/dashboard/stats`、`/dashboard/recent-activity`、`/services/dashboard`）重新摆放。

## 2. Current real flow

`admin/src/pages/Dashboard.jsx`（414 行，commit 65ff472/1e7c01c 后的现状，实读核对）：

- **数据获取**（L47-61）：`Promise.allSettled([GET /dashboard/stats, GET /dashboard/recent-activity, GET /services/dashboard])`，EV / services 各自独立失败（`evError`/`svcError`），已是容错正确形态，**保持不动**。
- **现有 4 段**：§1 Company topline（Combined revenue + EV/Diag/Bird/Cleaning 四个分线营收 KPI）→ §2 Needs attention（4 个 QuickLink）→ §3 EV Chargers 大段（LivePipeline 卡 + KPI Snapshot 卡 10 个 KPI + StatusGroups 卡 + ActivityTimeline 卡，共 4 张卡）→ §4 Solar Services（一张卡装 combined 2 KPI + 3 张 ServiceMiniCard）。
- **实际可用字段**（以页面已渲染为准，不发明新指标）：
  - `stats`（EV）：`revenue_month`、`revenue_quarter`、`pipeline_value`、`completed_month_count`、`status_counts`（13 状态计数，LivePipeline/StatusGroups 都在求和渲染）、`pending_cases`、`cases_to_quote`、`quoted_waiting_approval`、`installations_scheduled`、`surveys_next_7_days`、`permits_revision_required`、`surveys_reported_unpaid`、`installations_completed_email_pending`。
  - `activity`：EV 案件动态数组（现渲染前 8 条）。
  - `svc`：`combined.{new_bookings_this_month, active_cleaning_subscriptions, pending_bird_quotes}` + `per_service.{diagnostic|bird_netting|cleaning}.{count_this_month, revenue_this_month}`。
- **可复用资产**：`ServiceIcon({ kind, className })`（`utils/serviceIcons.jsx`，ev/diagnostic/bird_netting/cleaning 四 kind，24x24/stroke-1.5 与侧栏同规格）；`SERVICE_KIND_TONE`（`utils/serviceTone.js`：ev=indigo, diagnostic=amber, bird_netting=teal, cleaning=emerald）；页内 `Kpi`/`QuickLink`/`LivePipeline`/`ActivityTimeline`/`ServiceMiniCard` 组件；`Card`/`SectionHeader`/`SkeletonKpi`。

**问题对照需求**：现在 EV 是"一段四卡"不是"一个大块"；3 个 solar 服务挤在一张卡里没有各自的块和 icon；分线营收混在公司块里（与服务块职责重叠）。

## 3. Chosen solution

**YAGNI 台阶：第 5 级（对现有代码做最小改动）** —— 只改 `Dashboard.jsx` 一个文件：现有子组件全部复用或删减，新增的唯一结构是一个薄薄的"服务块卡头"（icon + 名称 + 跳转链接），零新端点、零新依赖、零新指标（所有数字都是页面今天已渲染或已在 state 里的字段/其求和）。

### 3.1 新块序（自上而下）

```
Hero（不变，含 Refresh 按钮）
§A Company        —— 公用财务 + 公用总量，一张卡
§B Needs attention —— 跨线待办队列，一张卡（内容零改动）
§C EV Chargers    —— 服务块 1，通栏一张大卡
§D Diagnostic | Bird Netting | Cleaning —— 服务块 2/3/4，同一行三张卡
```

排序依据（ui-ux-pro-max 层级规则：总览 → 可行动 → 明细）：公司总量先给"生意好不好"，队列给"现在该干啥"，服务块给分线明细。§C 通栏在 §D 之上：EV 是深管线主业务且 LivePipeline 七阶段条本身需要横向宽度——"一服务一块"不要求四块等大。

### 3.2 §A Company（公用块）—— 只放跨线公用数据

3 个 KPI（复用 `Kpi` 组件）：

| KPI | 数据来源 | 备注 |
|---|---|---|
| Combined revenue (month) | 现有 `combinedRevenue` 客户端求和（L68-71），公式不变 | `hasFullRevenue` 为 false 时标签仍带 "(partial)"（现有逻辑保留） |
| Service bookings (month) | `svc.combined.new_bookings_this_month` | 标签注明范围是 solar 三线（EV 无对应月度新增字段，**不发明**） |
| EV cases (total) | `status_counts` 全量求和 | 即现 StatusGroups 头部展示的 `grand` 值，纯前端求和，非新指标 |

**从公司块移出**：现 §1 的 EV/Diagnostic/Bird/Cleaning 四个分线营收 KPI —— 分线营收不是"公用"数据，下沉到各自服务块（§3.4/§3.5），消除同屏重复。

### 3.3 §B Needs attention —— 内容零改动

4 个 QuickLink（reported_unpaid / completion_email_pending / permits_revision / pending_bird_quotes）与 evError/svcError 错误条原样保留。决策：**行动项只住这里**——`pending_bird_quotes` 不在 Bird Netting 块里重复出现（一个数字一个家）。

### 3.4 §C EV Chargers 服务块（信息过载的处理答案：混合式）

既不"四卡整体塞进一块"（块体积是别家 4 倍，"一服务一块"名存实亡，且 StatusGroups 与 LivePipeline 本就重复），也不"精简到与 solar 三块同密度"（丢掉主业务最有价值的一眼管线视图）。取中：**一张通栏大卡，保留独有高价值内容，砍掉页内重复**。

块内结构（自上而下）：
1. **卡头**：`ServiceIcon kind="ev"` + "EV Chargers" 标题（indigo tone，来自 SERVICE_KIND_TONE）+ 右侧 "All cases →" 链接（`/admin/cases`）。
2. **LivePipeline 七阶段条**：组件内部一行不改，原样搬入。
3. **精简 KPI 行（10 → 5）**：Revenue (month) / Revenue (quarter) / Pipeline value / Completed (month) / Surveys next 7d。
   - **砍掉的 5 个及理由**：Pending / To quote / Waiting approval / Installs scheduled —— 与 LivePipeline 的 Request/Quote/Approved/Install 阶段计数重复（且条上可点击深链）；Permits: revision —— 已在 §B Needs attention。
4. **Recent activity**：ActivityTimeline 组件不改，渲染条数 8 → **5**（`activity.slice(0, 5)`），作为块内次级区域。
5. **StatusGroups 分布条：从 Dashboard 整体移除**（连同 `STATUS_GROUPS` 常量与 `StatusGroups` 函数一起删）——它是 LivePipeline 的更粗粒度重复；分布明细在 Cases 页按状态筛选可得。
6. `evError` 时整块降级为错误条（沿用现 §3 的处理形态）。

### 3.5 §D 三个 solar 服务块（同构，一行三卡）

把 `ServiceMiniCard` 升级为带 icon 卡头的服务块（改这一个函数即可，无需新文件）。每块：

| 块 | icon kind / tone | 块内统计（全部现有字段） | 整卡跳转 |
|---|---|---|---|
| Diagnostic | `diagnostic` / amber | Orders (month) = `per_service.diagnostic.count_this_month`；Revenue (month) = `.revenue_this_month` | `/admin/services/bookings?type=diagnostic` |
| Bird Netting | `bird_netting` / teal | Orders (month)、Revenue (month)（pending quotes 不在此重复，见 §3.3） | `/admin/services/bookings?type=bird_netting` |
| Cleaning | `cleaning` / emerald | Orders (month)、Revenue (month)、**Active subscriptions** = `combined.active_cleaning_subscriptions`（该字段虽挂在 combined 下，语义是 cleaning 专属，归位到本块） | `/admin/services/cleaning` |

`svcError` 时三块区域整体降级为一条错误条（沿用现 §4 形态）。加载态：各块沿用 `SkeletonKpi` 骨架。

### 3.6 结构性守则（给 implementer 的零决策边界）

- 配色只用 `SERVICE_KIND_TONE` 既有映射 + 现有 `dotClass/accentClass` 工具，**不发明新色**；块内间距/字号等视觉细节遵循页面现有 Card/Kpi 模式，不做新视觉决策（ui-ux-pro-max 域）。
- ServiceIcon 永远伴随文字标签（不做 icon-only），svg 传 `aria-hidden="true"`（装饰性；卡头 icon 需要比默认 `h-3.5` 大的 className，具体尺寸由 implementer 按侧栏图标既例取）。
- 数据获取 useEffect、`moneyCAD`、`relativeTime`、`PIPELINE` 常量、`Kpi`/`QuickLink`/`LivePipeline`/`ActivityTimeline` 组件内部：**一行不改**。

## 4. Rejected (cheaper) alternatives

- **台阶 1（删需求）**：不成立，Kuo 明确点名要这个版式。
- **台阶 4（只调现有 4 段顺序/标题，不改块模型）**：不满足"一服务一大块 + icon 卡头 + 公用数据独立块"的需求本体——现在 EV 是四卡一段、3 个 solar 挤一张卡。
- **EV 四卡整体塞进一个大块（只视觉压缩不删减）**：否决——块体积失衡且 StatusGroups/半数 KPI 是页内重复信息，违反 ponytail（重复即待删）。
- **EV 精简到与 solar 同密度（2 个数字 + 链接）**：否决——LivePipeline 是主业务日常最高价值视图，砍掉是功能损失而非简化。
- **分线营收同时留在公司块和服务块**：否决——同屏双份同一数字；Kuo 原话公司块只要"公用"数据。

## 5. Components & data contracts

**改动文件：仅 `admin/src/pages/Dashboard.jsx`（1 个文件）。** 不新增/不修改任何 API；三个既有端点与消费字段见 §2/§3 表格，全部现存。

Diff 轮廓（给 implementer）：
1. §1 Company 卡：KPI 由 5 个换成 §3.2 的 3 个（新增 `grand` 求和一行：`Object.values(counts).reduce(...)`，与被删的 StatusGroups 内同式）。
2. §2 卡原样保留。
3. §3 整段替换为一张 Card：卡头（ServiceIcon+标题+All cases 链接）+ LivePipeline + 5-KPI 行 + `activity.slice(0, 5)` 的 ActivityTimeline；删除 StatusGroups 卡与 `STATUS_GROUPS`/`StatusGroups` 定义。
4. §4 替换为三张升级版服务块卡（改 `ServiceMiniCard` 增加 icon 卡头与可选第三行统计）；`combined` 两个 KPI 从此段移除（new_bookings → §A，active subs → Cleaning 块）。
5. 顶部 import 增加 `ServiceIcon`、`toneForServiceKind`（或直接用 tone 字符串常量，与现文件风格一致）。

**验收口径（给 tester）**：
① `npm run build`（admin）通过；
② 块序 = Hero → Company(3 KPI) → Needs attention(4 QuickLink) → EV 大卡 → 3 solar 卡；4 个服务卡头各有对应 icon；
③ mock `/services/dashboard` 500：EV 块照常渲染，Company 显示 "(partial)"，solar 区域显示错误条；mock `/dashboard/stats` 500 反向同理；
④ LivePipeline 各阶段深链、Needs attention 4 条深链、3 个 solar 块整卡跳转与现在一致；
⑤ 页面不再出现 StatusGroups 分布条与被砍的 5 个 EV KPI；`pending_bird_quotes` 全页只出现一次（§B）；
⑥ EV pytest 回归常绿（本任务不触后端，跑一遍作红线抽查）。

## 6. Risks & red lines

- **EV 冻结红线**：只动 Dashboard.jsx 的 JSX 摆放；不碰 EV 后端、Case model、CaseDetail.jsx、caseStatus.js；LivePipeline/ActivityTimeline 组件内部零改动。
- **错误处理红线（已达标，禁止回退）**：`Promise.allSettled` + evError/svcError 双独立错误条是现存正确形态，重排时必须原样保留——任一端点挂掉不得连坐另一条线。
- **数据丢失/功能删减透明化**：本设计从 Dashboard 移除的展示项——StatusGroups 分布条、5 个重复 KPI、activity 第 6-8 条——均为页内重复或在 Cases/Needs attention 可达，**不删除任何后端数据与任何其它页面功能**；删减清单已列 §3.4，Kuo 可逐项否决（见开放问题）。
- **可访问性**：icon 永不单独承载语义（必配文字标签，svg aria-hidden）；tone 色点沿用"色彩非唯一指示"既例；所有可点卡片仍是 `Link`（键盘可达），无新交互原语。
- **安全/信任边界**：无新输入、无新端点、无密钥相关改动。
- 残余风险：Dashboard.jsx 是唯一结构性 diff（414 行文件）。implementer 须按 §5 的 5 条轮廓机械执行，禁止改写保留组件内部。

## 7. ADRs recorded

**ADR-006（本设计核心决策）已起草，但 `manage_adr` 两次返回 `write_error`（2026-07-24），未能落库**——reviewer 接手时请重试写入（内容即下条摘要 + §3 全文口径）：
- **ADR-006**（取代 ADR-004 的版式部分）：Dashboard = 一服务一大块模型。公司块只放跨线公用数据（合并营收/服务月预约数/EV 案件总数），分线营收下沉各服务块；行动项只住 Needs attention；EV 块通栏（保 LivePipeline + 5 KPI + 5 条 activity，删 StatusGroups 与重复 KPI）；三 solar 块同构（icon 卡头 + orders/revenue + 线内专属计数）。ADR-004 仍有效的部分：combined revenue 纯前端计算、无新端点、allSettled 隔离。

## 8. Open questions for Kuo

1. **StatusGroups 分布条彻底从 Dashboard 移除**（理由：与 LivePipeline 重复，明细在 Cases 页可筛），可以吗？若想留，唯一去处是 EV 大卡内折叠区，块会明显变高。
2. **Recent activity 保留在 EV 块内（5 条）**——还是你希望 Dashboard 完全不放动态、只在案件页看？两种都是删行级改动。
3. Company 块的 "EV cases (total)" 是**全量案件数**（含 completed/cancelled，即现 StatusGroups 的 grand total）。若你更想要"在途案件数"（排除 completed/cancelled），同一求和加一行过滤即可——用哪个口径？
