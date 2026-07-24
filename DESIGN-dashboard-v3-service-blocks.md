# DESIGN: Dashboard v3 — Diagnostic / Bird Netting / Cleaning 通栏大块 + FlowStrip 流程可视化(附 SOP 改进建议)

## 0. Task tier & Skill Manifest
- Tier: STANDARD — 多文件(Dashboard.jsx + ServiceBookings.jsx 最小改动 + services_dashboard 端点加法扩展 + pytest),API 响应 shape 有加法变更;无 schema/迁移/新路由。
- Skills: `cmm`, `codebase-memory`, `ponytail-review`(MANDATORY-INFRA);`ui-ux-pro-max`(UI 唯一权威,已咨询);Python/FastAPI(`ecc:python-review` 审查后端改动)。
- Planned advisor consults: 1(完工 sign-off)。

## 1. Goal

把 Dashboard 底部 Diagnostic / Bird Netting / Cleaning 三个等大小卡片,升级为与 EV Chargers 同级的**三个通栏大块**:每块含横向流程可视化条(阶段卡片 + 箭头 + 点击深链,复刻 EV LivePipeline 的交互语言)+ 一排更丰富的 KPI。后端只在既有 `GET /services/dashboard` 上做加法字段。另交付一份独立的 SOP 澄清与改进建议清单(§9),供 Kuo 拍板,不改 SOP 文件本身。

## 2. Current real flow

已逐文件核实(非凭记忆):

- **`admin/src/pages/Dashboard.jsx`**(392 行):
  - EV 大块:`LivePipeline`(L303-339)— `PIPELINE` 7 阶段(multi-status 归并 + `primary` 驱动深链 `/admin/cases?status=<primary>` + `toneForCaseStatus` per-stage 色 + busiest 高亮 `ring-2 ring-amber-400`)。
  - 三个小卡:`ServiceBlock`(L255-279,整卡一个 `<Link>`)+ `MiniStageStrip`(L283-295,非交互点状计数)。
  - 阶段常量已存在:`DIAGNOSTIC_STAGES`(5)/ `BIRD_STAGES`(7)/ `CLEANING_VISIT_STAGES`(4),键值已逐一对齐 `models.py` 枚举。
  - 数据加载:`Promise.allSettled` 三请求互不拖垮(L76-84),EV/服务两侧错误独立展示。
- **`backend/app/api/v1/admin/services.py` → `services_dashboard()`**(L406-483):已返回 `combined{new_bookings_this_month, active_cleaning_subscriptions, pending_bird_quotes}` + `per_service.diagnostic{count_this_month, revenue_this_month, status_counts}` + `bird_netting{同构}` + `cleaning{count_this_month, revenue_this_month, pricing_status_counts, visit_status_counts}`。实现方式:全表拉 `ServiceBooking` 单循环分流(bird 分支内每单一次 quote 子查询——既有代码,当前量级可接受)、全表拉 `CleaningSubscription` / `CleaningVisit` 各一循环。**所有新指标都能塞进这几个已有循环,零新查询。**
- **`backend/app/models/models.py`** 枚举权威值(L605-658):
  - `ServiceBookingStatus`:diagnostic 走 `submitted→scheduled→in_progress→completed|cancelled`;bird 走 `submitted→survey_scheduled→quoted→approved→install_scheduled→completed|cancelled`(转移由 `service_booking_flow.py` 把守,本任务不碰)。
  - `QuoteStatus`:`pending|approved|rejected`(BirdNettingQuote.status)。
  - `CleaningPricingStatus`:`quoted|pending_quote`;`CleaningPaymentStatus`:`unpaid|paid|refunded`;`CleaningVisitStatus`:`pending|notified|completed|skipped`;`CleaningTier`:`tier1|tier2|custom`。
  - 字段:`ServiceBooking.scheduled_at/completed_at/actual_hours/hardware_involved/hourly_rate_snapshot`;`BirdNettingQuote.total/status/approved_at`;`CleaningSubscription.start_date(Date)/annual_price/payment_status/pricing_status`;`CleaningVisit.quarter/scheduled_date/status`。
- **`admin/src/pages/services/ServiceBookings.jsx`**:已有完整 status PillButton 过滤 + API `status` 参数,但 URL 初始化只读 `type`(L31-34),**不读 `status`** —— 深链某状态需 3 行加法。
- **`admin/src/pages/services/CleaningSubscriptions.jsx`**:无任何 URL 过滤参数。
- 复用资产:`serviceIcons.jsx`(ServiceIcon 四 kind)、`serviceTone.js`(SERVICE_KIND_TONE:diagnostic=amber / bird_netting=teal / cleaning=emerald;`humanizeStatus`)、`tone.js`(accentClass/dotClass/pillClass)、`Card/SectionHeader/SkeletonKpi`。
- cmm 图谱(`.cmm/REPORT.md`,2026-07-23):Dashboard 属"admin 仪表盘"集群(内聚 0.91),对外仅依赖 tone/status 工具,改动血radius 小。

## 3. Chosen solution

**YAGNI 落点:第 5 级"对现有代码最小改动" + 一处第 6 级"最小新代码"(FlowStrip 组件)。**
- 第 1-2 级不成立:需求真实存在(Kuo 明示),现有 `MiniStageStrip` 是非交互点数,无法承载"流程图 + 深链";`LivePipeline` 直接复用需要 multi-status 归并、per-stage tone 两个 EV 特有自由度,硬套会给三个服务引入死参数(见 §4)。
- 第 3-4 级不成立:纯内部展示组件,无库可代;无配置可改出流程图。
- 故:**一个新的参数化 `FlowStrip`**(第 6 级,零臆测抽象,三服务共用)+ 其余全部是对 `Dashboard.jsx` / `services_dashboard()` / `ServiceBookings.jsx` 的最小加法(第 5 级)。已录 ADR-001/002。

### 3.1 布局(Dashboard.jsx §D 重排)

现 `grid sm:grid-cols-3` 三小卡 → 改为**三个竖直堆叠的通栏 `<Card className="p-5">`**,与 EV 块同宽同结构,顺序 Diagnostic → Bird Netting → Cleaning(与现有顺序、导航一致)。每块内部自上而下:

1. **头行**:`ServiceBlockHeader`(复用)+ 右侧本月概要(`{count_this_month} orders · {moneyCAD(revenue_this_month)}`,沿用现小卡的 headline 数据)+ 深链 `All →`(diagnostic/bird → `/admin/services/bookings?type=…`,cleaning → `/admin/services/cleaning`)。
2. **FlowStrip**(流程条,见 3.2)。
3. **KPI 行**:`grid gap-3 sm:grid-cols-3 lg:grid-cols-5`,复用现 `Kpi` 组件(见 3.3)。

现 `ServiceBlock` / `MiniStageStrip` 两个函数**删除**(被新结构整体取代;整卡 `<Link>` 包裹也随之取消——大块内部已有多个链接,嵌套 `<a>` 非法)。骨架屏:复用 EV 块的 loading 分支样式(7→N 个 `h-20` 脉冲块 + SkeletonKpi 行)。

### 3.2 FlowStrip 组件(Dashboard.jsx 内模块级函数,不单独建文件)

```jsx
function FlowStrip({ stages, counts, tone, linkFor, terminals })
// stages:    [{ key, label }]        线性主路径(不含终态)
// counts:    status_counts 对象      Number(counts?.[key] || 0)
// tone:      服务 tone(amber/teal/emerald),驱动卡片顶部 accentClass 色条
// linkFor:   (key) => route string   每个阶段卡的深链
// terminals: [{ key, label }]        cancelled / skipped —— 渲染为流程条右端独立小 chip(rose Pill,含计数),不进箭头流
```

- **节点卡**:复刻 LivePipeline 卡式样(`rounded-xl border bg-white p-3 shadow-sm`,顶部 `h-1` accent 条用 `accentClass(tone)`,label 小写间隔字 + 大号 tabular 计数),`<Link to={linkFor(key)}>`。
- **箭头**:同一枚 chevron SVG,`aria-hidden="true"`,`hidden md:flex`(与 EV 完全一致)。
- **busiest 高亮**:与 EV 同规则——`stages` 中排除最后一项(completed)后计数最大且 >0 者加 `ring-2 ring-amber-400` + "busiest" 角标。三块统一用 amber 环(与 EV 一致性优先;diagnostic 块本身 amber tone,环仍可辨,accent 条在卡顶、环在卡缘,不混淆)。
- **可访问性**(ui-ux-pro-max 红线):`<Link>` 天然可 Tab;补 `focus-visible:ring-2 focus-visible:ring-slate-400`;`cursor-pointer`;计数+文字标签并存(颜色非唯一信息载体);hover 用 transform(`-translate-y-0.5`)不引起布局位移;触达面积 p-3 卡整卡可点。

三块的实例化(节点严格对应真实枚举,不造状态):

| 服务 | stages(主路径) | terminals | linkFor |
|---|---|---|---|
| Diagnostic | Submitted → Scheduled → In progress → Completed(4) | Cancelled | `/admin/services/bookings?type=diagnostic&status=<key>` |
| Bird Netting | Submitted → Survey → Quoted → Approved → Install → Completed(6) | Cancelled | `/admin/services/bookings?type=bird_netting&status=<key>` |
| Cleaning(visit 流)| Pending → Notified → Completed(3) | Skipped | 一律 `/admin/services/cleaning`(该页无 visit 状态过滤,列表页内联展开即可定位;不为此给列表页新造过滤器) |

现有三个 `*_STAGES` 常量就地改造:拆出 `terminals`(把 cancelled/skipped 从线性数组移出),其余键值不动。

**`ServiceBookings.jsx` 最小加法**(让 status 深链生效):初始化 `useEffect` 里同时读 `searchParams.get('status')`,校验 `STATUSES.includes(s)` 后 `setStatus(s)` 并并入 `load({ type, status })`。约 3 行,页内 PillButton 行为不变。

### 3.3 KPI 行(每块 ≤5 格,复用 `Kpi` 组件)

| 服务 | KPI(label → 字段) |
|---|---|
| Diagnostic | Revenue (month) → `revenue_this_month`;Completed (month) → `count_this_month`;Next visit → `next_scheduled_at`(相对/本地时间,空为 —);Scheduled next 7d → `scheduled_next_7_days`;Avg hours/job → `avg_hours_completed`(保留 1 位,空为 —) |
| Bird Netting | Revenue (month) → `revenue_this_month`;Jobs won (month) → `count_this_month`;Outstanding quotes → `moneyCAD(outstanding_quote_value)`;Surveys next 7d → `surveys_next_7_days`;Awaiting install → `status_counts.approved`(与流程条数字同源,重复展示是刻意的行动队列强调) |
| Cleaning | Active subs → `combined.active_cleaning_subscriptions`;Unpaid → `payment_status_counts.unpaid`(副行 `moneyCAD(unpaid_value)`,tone amber);Pending price quotes → `pricing_status_counts.pending_quote`(custom 档待定价,tone amber);Visits next 7d → `visits_next_7_days`;Expiring ≤60d → `expiring_within_60_days` |

Cleaning 的 headline(orders/revenue this month)已在头行,KPI 行让位给行动型指标。

### 3.4 后端:`services_dashboard()` 加法字段(唯一后端改动)

全部在**既有循环内**派生,零新查询、零新路由、零迁移;响应向后兼容(只加键)。`now = datetime.now(timezone.utc)`,`week_end = now + timedelta(days=7)`:

```python
per_service.diagnostic += {
  "next_scheduled_at": str|None,      # min(scheduled_at) where status==scheduled and scheduled_at >= now,ISO
  "scheduled_next_7_days": int,       # status==scheduled and now <= scheduled_at <= week_end
  "avg_hours_completed": float|None,  # mean(actual_hours) over ALL completed diagnostics(全量,不按月——新业务样本小,月切片噪声大)
}
per_service.bird_netting += {
  "outstanding_quote_value": float,   # sum(q.total) where q.status == QuoteStatus.pending(循环内已取 q)
  "surveys_next_7_days": int,         # status==survey_scheduled and now <= scheduled_at <= week_end
}
per_service.cleaning += {
  "payment_status_counts": {str:int}, # subs 循环内按 payment_status.value 计数
  "unpaid_value": float,              # sum(annual_price) where payment unpaid and annual_price is not None
  "visits_next_7_days": int,          # visit 循环内:status in (pending, notified) and scheduled_date 在 [now, week_end]
  "expiring_within_60_days": int,     # subs 循环内:now.date() <= start_date + timedelta(days=365) <= now.date()+60d
}
```

实现注意:`scheduled_at`/`scheduled_date` 均 tz-aware DateTime,直接与 `now` 比较;`start_date` 是 `Date`,用 `now.date()` 做日期算术;`hardware_involved`/`avg` 分支对 None 显式跳过。bird 分支的 per-booking quote 子查询是既有 N+1,量级小,本次不动(`# ponytail: existing per-booking quote lookup, batch when bird volume grows`)。

### 3.5 测试(tester 执行)

- **pytest**(扩 `backend/tests/test_services_v3.py`):种子 1 条 scheduled 未来 3 天的 diagnostic、1 条 pending quote 的 bird、1 条 unpaid + start_date=11 个月前的 cleaning 订阅(带 1 次未来 5 天 pending visit)→ 断言 4 组新字段逐一正确;再断言旧字段 shape 未变(回归)。
- **前端手测清单**:三块渲染/骨架屏;每个阶段卡深链落到正确过滤的列表(含 ServiceBookings 读 URL status);busiest 环出现在正确阶段;`/services/dashboard` 请求失败时 EV 块不受影响(allSettled 既有行为);Tab 键可遍历全部阶段卡且焦点环可见;375px 宽度下流程条 flex-wrap 不横向溢出。

## 4. Rejected (cheaper) alternatives

1. **复用/改造 LivePipeline 服务三块共用**(第 2 级):EV 需要 multi-status→stage 归并与 per-stage tone,三个服务是单 status 单 tone;合并需给 LivePipeline 加 3 个参数化自由度,对已上线 EV 纯回归风险、零收益。→ ADR-001。
2. **保持三小卡只把 MiniStageStrip 加上链接**:满足不了"横向大块 + 流程图 + 更多数据"的明确要求(红线:明确要求不被 YAGNI 砍)。
3. **cleaning 流程图画"订阅生命周期"(pending_quote→quoted→paid→…)**:那是 pricing(2 态)× payment(3 态)两条正交小状态轴,不是 SOP 定义的作业流;硬拼成管线是发明状态机。作业流真身是 visit 4 态,pricing/payment 以 KPI 呈现。
4. **新建 /services/metrics 路由或加 Celery 做续订提醒**:违反硬约束/重基建。→ ADR-002。
5. **给三个服务加 Recent Activity 流**:需要新查询/新端点(服务侧无 activity 数据源),超出"扩展现有端点加字段"的授权,砍掉;EV activity 保持独占。

## 5. Components & data contracts

**改动文件(共 4 个,无新文件):**

| 文件 | 改动 |
|---|---|
| `backend/app/api/v1/admin/services.py` | `services_dashboard()` 循环内加 §3.4 字段 |
| `backend/tests/test_services_v3.py` | 新增 dashboard 字段断言 + 旧 shape 回归 |
| `admin/src/pages/Dashboard.jsx` | §D 重排为三通栏块;新增 `FlowStrip`;删 `ServiceBlock`/`MiniStageStrip`;`*_STAGES` 拆出 terminals |
| `admin/src/pages/services/ServiceBookings.jsx` | init 时读 URL `status`(校验 ∈ STATUSES)约 3 行 |

**不碰**:EV 状态机、Case model、CaseDetail.jsx、任何路由注册、任何迁移、serviceTone/serviceIcons(原样复用)。

FlowStrip props 契约见 §3.2;API 响应契约见 §3.4(纯加法,`docs/V3-DATA-CONTRACT.md` 若视为冻结契约,此加法不破坏既有键——见 §8 开放问题 3)。

## 6. Risks & red lines

- **信任边界**:端点已有 `get_current_admin` 门禁,GET 无新输入;`ServiceBookings.jsx` 读 URL status 时白名单校验(`STATUSES.includes`),非法值静默回落到 All——不把 URL 参数直接透传给 API。✔
- **数据丢失**:全链路只读,无写路径。✔
- **安全**:无密钥、无注入面(无字符串拼 SQL,全 ORM;无 dangerouslySetInnerHTML)。✔
- **可访问性**:阶段卡为原生 `<Link>`(键盘可达)+ focus-visible 环;箭头 `aria-hidden`;计数配文字标签,颜色非唯一指示;文字对比沿用 slate-900/slate-500 于白底(≥4.5:1);hover 只用 transform 不位移布局。✔
- **回归风险**:删 `ServiceBlock` 整卡 Link 后,原"点整卡跳列表"路径由头行 `All →` + 阶段卡深链取代(能力超集)。EV 块与 `Promise.allSettled` 错误隔离逻辑一行不动。
- **数据口径风险**:`expiring_within_60_days` 用 start_date+365d 近似"一年期",与未来 v3.1 cron 口径需一致(记录在 ADR-002,实现 cron 时以此为准或一并修订)。

## 7. ADRs recorded

- **ADR-001**:服务区块共用参数化 FlowStrip,EV LivePipeline 刻意不合并(拒绝:统一重构、三份重复组件)。
- **ADR-002**:扩展指标全部在既有 services_dashboard 循环内派生,不新建路由/表/cron;清洁临期以只读派生 KPI 先行,cron 通知留 v3.1(拒绝:新 metrics 路由、Celery 先行、按月均值)。

## 8. Open questions for Kuo

1. **三块堆叠 vs 混排**:方案为三块全部通栏竖直堆叠(与 EV 同宽,页面变长约 2 屏,靠滚动)。若你更想控制页面高度,可改为"每块通栏但 KPI 行折叠、点击展开"——默认按堆叠做,如需折叠请说。
2. **Bird "Awaiting install" KPI 与流程条 Approved 数字重复**是刻意强调(签了字就该排期,是最值钱的行动项);嫌重复可换成 "Avg quote value"(同样零成本可得)。默认保留。
3. **`docs/V3-DATA-CONTRACT.md` 冻结范围**:本设计对 `/services/dashboard` 只加键不改键。若该文档把 dashboard 响应也视为冻结项,实现时需同步在文档追加这批字段(文档改动一并交给 implementer)。请确认可以追加。
4. **§9 SOP 建议**哪些采纳、哪些进 v3.1,由你逐条拍板;其中 D2(硬件跟进)、B1(报价有效期)、C1(先付款后排期)三条对管理可见性影响最大。

---

## 9. SOP 澄清与改进建议(独立清单,仅建议,不改 SOP 文件)

> 逐条格式:**哪里模糊/缺定义 → 为什么不利于顾客或管理 → 建议怎么改**。标注〔SOP 文字即可〕= 只需改 SOP 措辞/口径,系统零改动;〔v3.1 系统项〕= 采纳后需要小的系统跟进(本设计一律不做)。

### 服务 2:光伏诊断(SOP §4)

- **D1. 计费粒度与最低收费未定义**〔SOP 文字即可〕:"$179/hr 从到达开始计时",但没说最小计费单位(半小时?15 分钟?)和是否有首小时保底。顾客无法预估最低花费,admin 录 `actual_hours` 时也无统一口径(1.2 还是 1.25?)。建议:明确"首小时起步,之后按 15 分钟递增取整",并写进客户端 Step 0 的计费说明。
- **D2. 硬件问题的后续动线断头**〔v3.1 系统项,影响最大〕:SOP 说硬件"另行报价、额外付费",但状态机在 `completed` 就终结了——`hardware_involved=true` 的单子之后谁跟进、怎么报价、记在哪,全无定义。这是最直接的二次营收漏斗,现在管理上不可见。建议:SOP 增加一步"完成后 48h 内出硬件报价并电话跟进";系统侧 v3.1 给 booking 加一个轻量 follow-up 标记/清单(本设计先通过 dashboard 暴露 `hardware` 计数不做,见 §3.3 已砍,理由:无字段支撑跟进闭环,只展示数字会造成"看得见管不了")。
- **D3. 客户不在家 / 改期规则缺失**〔SOP 文字即可〕:"服务时必须家中有人",但爽约/临时不在家怎么办?收不收空跑费?状态机没有 rescheduled(系统上改 `scheduled_at` 即可,无需新状态)。建议:SOP 写明"改期需提前 24h,否则按 1 小时最低收费",客户端确认页同步展示。
- **D4. 付款时点与方式未定义**〔SOP 文字 + v3.1 系统项〕:诊断做完钱怎么收(现场?事后发票?)SOP 没说;系统里诊断没有任何付款状态,`revenue_this_month` 是"应收"口径而非"实收"。建议:SOP 定义"完工现场结算(e-transfer/卡)";v3.1 给 ServiceBooking 加 paid 标记,dashboard 营收才能分应收/实收。

### 服务 3:鸟网安装(SOP §5)

- **B1. 报价有效期缺失**〔SOP 文字即可,管理价值高〕:`quoted` 状态可以无限挂着,待签报价队列只会越积越多,dashboard 的 "Outstanding quotes" 金额会虚高。建议:SOP 明确"报价 30 天有效,过期需重新确认价格",admin 以此为跟进/关单依据(系统先不做自动过期,人工按周清一次即可)。
- **B2. 客户拒签路径未定义**〔SOP 文字即可〕:`QuoteStatus` 有 `rejected` 但 SOP 状态机只写了 approved 一条路。客户明确说不要了,booking 应该走 `cancelled` 还是留着重报?建议:SOP 写明"拒签→电话确认一次:改报价(重新 quoted)或关单(cancelled)"。
- **B3. 付款条款完全缺失**〔SOP 文字即可〕:签字批准 = 承诺,但何时收钱(完工全款?批准时订金?)SOP 只字未提。建议:明确"完工验收后全款"或"批准时 30% 订金 + 完工尾款",并写进报价签字页免责声明区。
- **B4. 安装当天实际鸟窝数 > 报价数的处理**〔SOP 文字即可,顾客体验关键〕:无人机看不全板下,开工后多发现鸟窝很常见。是按签字价封顶、还是按实结($199/个 追加)?不定义就是现场扯皮。建议:签字报价页加一句"实际清理鸟窝数以现场为准,超出报价数量部分按 $199/个 据实结算,超过 N 个先电话确认"——把追加授权提前拿到,免二次签字。
- **B5. 受保护鸟巢导致的顺延无管理状态**〔SOP 文字即可〕:免责声明写了依法不得移除、安装顺延,但顺延的单子停在 `install_scheduled`(或 approved),日历上像正常单。建议:SOP 定义"顺延单在 booking 备注记 on-hold + 预计复查日期,并从排期日历撤下",admin 每月复查一次;暂不值得为它加新状态。
- **B6. 2 年质保的报修入口未定义**〔SOP 文字即可〕:质保条款有了,客户报修走哪条路(打电话?再提交一次表单?)没说。建议:SOP 写明"质保报修 = 电话/邮件进来后 admin 手工建一条 $0 的 booking 跟踪",让维修也进统一日历,不游离在系统外。

### 服务 4:清洁订阅(SOP §6)

- **C1. 未付款是否阻止排期未定义**〔SOP 文字即可,管理价值高〕:年费"一次性预付",但 SOP 没说没付钱前 Q1 能不能排。系统目前允许对 unpaid 订阅排 visit。建议:SOP 明确"payment_status=paid 之前不排任何 visit";dashboard 新增的 Unpaid KPI(§3.3)就是这条规则的抓手。
- **C2. custom 档(≥36 板)定价后客户如何确认**〔SOP 文字即可〕:鸟网有签字批准页,清洁 custom 价 admin 设完就直接生效,客户没有明确的"接受"动作,有争议风险。建议:SOP 定义"custom 定价后发邮件报价,客户回复确认(邮件留痕)方视为成交";暂不为它造第二个签字页(量少,邮件留痕够用)。
- **C3. skipped 的语义与补偿规则缺失**〔SOP 文字即可,顾客公平性〕:visit 可以 skipped,但因天气跳过和因客户原因跳过完全两码事——前者应改期(不消耗次数),后者算不算消耗?免责声明只写了"恶劣天气改期不视为违约"。建议:SOP 明确"天气原因 = 改期(改 scheduled_date,状态留 pending);客户主动放弃且不改期 = skipped,视为已消耗,不退该次"。admin 录 skipped 时在 notes 里写原因。
- **C4. 每季度的服务窗口期未定义**〔SOP 文字即可〕:"每季度 1 次"太粗,客户会问"到底哪个月来";admin 排期也没锚点。建议:SOP 定义"每季度首 6 周内完成该季 visit",客户端提交成功页同步告知。
- **C5. 订阅年到期与未执行次数的口径**〔SOP 文字 + 已在本设计部分落地〕:到期前 30 天提醒是 v3.1 的 cron(MEMORY.md 已记),但"年"从 `start_date` 起算、到期时未执行的 visit 作废还是顺延,SOP 没写。建议:明确"订阅期 = start_date 起 12 个月,期内未执行次数到期作废(客户原因)/顺延补做(我方原因)"。本设计的 `expiring_within_60_days` KPI 让 admin 在 cron 缺位期先人工盯到期。

### Admin 后台(SOP §7)

- **A1. Dashboard 分线层描述已过时**〔SOP 文字即可〕:SOP 写"四个服务各一张迷你 KPI 卡",实际已演进为"每线一个通栏大块 + 流程可视化"(EV 已上,本设计补齐其余三线)。建议 SOP §7 更新为按线大块口径,避免下一轮开发拿旧描述当依据。
- **A2. 全线缺 SLA/响应时限**〔SOP 文字即可,长线管理价值最大〕:所有"待处理"队列(新提交未排期、勘测完未报价、签字完未排装)都没有时限定义,"积压"无从判定,busiest 高亮只能比相对大小。建议:SOP 给三条最简 SLA——新提交 1 个工作日内响应、无人机勘测后 2 个工作日内出报价、签字后 5 个工作日内排装。有了口径,后续 dashboard 才谈得上"超时标红"(那是 v3.1+ 的事,先把规则立起来)。
