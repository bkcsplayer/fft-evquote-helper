# fft-evquote-helper v3.0 升级需求 — 四服务门户

> 本文是本次升级的唯一需求来源。开工前先读 `STAGE-SUMMARY-2026-07-23.md`、`MEMORY.md`、`.cmm/REPORT.md`,并执行第 12 节的改动前检查。
> 架构决策已在本文定死,执行中不要自行变更设计;发现冲突先停下来提出,不要边改边换方案。
>
> **2026-07-24 修订:** 第 4-7 节补充了 Fable 5(architect)在设计 Dashboard 服务区块时发现的 SOP
> 空白点(完整分析见 `DESIGN-dashboard-v3-service-blocks.md` §9),经 Kuo 拍板后并入正文。标记
> 〔v3.1〕的条目仅完善了 SOP 文字口径,对应的系统跟进(如硬件报价跟进清单、诊断实收标记)仍在
> v3.0 范围外,留到 v3.1。

---

## 1. 升级目标(一句话)

把系统从"EV 充电桩单服务报价系统"升级为 **FutureFrontier 四服务门户**:在客户端首页展示 4 个服务入口,新增 3 个服务的完整"提交 → 调度 → 完成"流程,并在 admin 后台增加对应管理模块。**现有 EV 充电桩全流程(Case / 13 状态 / CaseDetail)一行都不许破坏。**

四个服务:

| # | 服务 | 类型 | 现状 |
|---|------|------|------|
| 1 | EV 充电桩安装 | 完整 Case 流程 | 已有,保持不动,仅首页入口改版 |
| 2 | 户用光伏诊断 | 按小时上门服务 | 新增 |
| 3 | 户用太阳能鸟网安装 | 预约 → 无人机报价 → 批准 → 安装 | 新增 |
| 4 | 户用太阳能清洁 | 年度订阅,每季度 1 次 | 新增 |

---

## 2. 核心架构决策(已定,不可更改)

1. **新服务不复用 Case 模型。** CaseDetail.jsx(688 行 / 复杂度 102)和 13 状态机是高风险区,新服务生命周期简单得多,强行塞进 Case 会污染状态机。新建独立模型:
   - `ServiceBooking` — 承载诊断、鸟网两类一次性预约
   - `CleaningSubscription` + `CleaningVisit` — 承载清洁年度订阅及其 4 次上门
2. **复用而不修改现有基础设施:** 认证 (`middleware/auth.py`)、`PlacesAddressInput.jsx`、i18n (`t`/`useI18n`)、email/sms 通知服务、Jinja2 模板机制、secure-token 访问模式(客户无账号,凭链接查看)。修改这些共享模块前必须 `trace_path`,原则上只加不改。
3. **鸟网报价批准复用现有手写签名组件**(参考 `QuoteApprove.jsx` 的模式,抽取可复用部分时不得改动 EV 流程的行为)。
4. **v3.0 不做在线支付。** 清洁订阅的付款状态由 admin 手动标记(`unpaid / paid / refunded`),发票线下处理。
5. **所有新增 UI 走 ui-ux-pro-max skill,与现有绿色主题、卡片风格一致。**
6. 代码注释与 commit message 全部英文;客户可见文案全部走 i18n,EN + 简体中文双语齐全。

---

## 3. 客户端改版

### 3.1 首页 Welcome.jsx 改版

从单一 "Get a Free Quote" CTA 改为 **2×2 服务卡片**(移动端优先,参考现有卡片风格):

1. EV Charger Installation / EV 充电桩安装 → 进入现有 Step1 流程(路由不变)
2. Solar Diagnostic Service / 户用光伏诊断 → `/service/diagnostic`
3. Solar Bird Netting / 户用太阳能鸟网安装 → `/service/bird-netting`
4. Solar Panel Cleaning / 户用太阳能清洁 → `/service/cleaning`

**卡片视觉要求(硬性):**

- 每张卡片必须**带配图**,不是小图标——服务实拍感/插画感的视觉主体(EV 充电桩、屋顶光伏检修、板下鸟网、清洁刷洗板面),四张风格必须统一(同一插画风格,或同一色调处理的实拍图)
- 卡片构成:配图 + 服务名 + 一句话价值 + 起价标签(From $179/hr、From $599/roll、From $599/yr — 价格从 Settings 读,不许硬编码)
- 移动端 2×2 或纵向堆叠自行判断,但首屏必须能看到全部 4 个入口;点击目标区域为整张卡片
- **具体视觉设计(配图风格、配色、圆角、动效)委托给 frontend-design / ui-ux-pro-max skill 全权发挥**,要求有设计感、不像模板,但必须延续现有绿色品牌主题;配图资产放 `frontend/src/assets/services/`,若无现成素材先用高质量 SVG 插画占位并在交付说明中列出待替换清单

### 3.2 新服务通用提交流程

三个新服务共用一个三步式提交框架(仿现有 Step1/Step2 的分步交互,顶部带步骤指示器):

- **Step 0 服务介绍页(卡片点入先到这):** 服务是什么、怎么收费、流程几步、要不要在家——把 SOP 里客户关心的信息前置讲清,底部一个 CTA 进表单。价格在这一步就完整展示,不藏着
- **Step A 信息:** 姓名、电话、Email、地址(PlacesAddressInput)、光伏板数量;各服务差异字段见下节。手机端输入体验硬性要求:tel/email 字段用对键盘类型、单手可完成、必填项即时校验
- **Step B 确认:** 订单摘要 + **实时价格反馈**(规则见下)+ **免责声明(可滚动完整展示,必须勾选同意才能提交,记录勾选时间戳)** + 提交
- 提交成功页给出 secure-token 状态跟踪链接(复用 StatusPage 模式,新建 `ServiceStatusPage`),并发确认邮件/短信

**实时价格反馈规则(Step B 必须做到):**

- 诊断:固定展示 $179/hr 计费说明 + "硬件另计"提示,不给总价承诺
- 鸟网:展示计价公式(卷数 × $599 + 鸟窝 × $99)+ 明示"最终价格以无人机勘测报价为准"
- 清洁:客户填完板数,**立即显示所属档位与确切年费**($599 / $799 / 联系报价),这是三个服务里唯一能当场给准价的,要利用好

**服务差异化输入优化:**

- 诊断:问题描述不要裸 textarea——先给常见故障快捷选择 chips(完全不发电 / 发电量下降 / 逆变器报错 / 监控 App 离线 / 其他),选完再补充文字;可选上传逆变器报错屏照片(复用 Step2 的上传组件)
- 鸟网:可选上传屋檐/板下现况照片,帮助 admin 预判鸟窝数量,减少航拍后报价意外
- 清洁:板数字段旁加提示文案"不确定板数?填大概即可,技师首次上门核实"

---

## 4. 服务 2:户用光伏诊断(Solar Diagnostic)

**商业规则(SOP,原样实现):**

- 按小时收费 **$179 CAD/小时**,从技师到达客户家开始计时
- **计费粒度与最低收费:** 首小时按 $179 计(不足 1 小时按 1 小时收取,即最低消费 1 小时);超过首小时后,按 15 分钟为单位向上取整计费。admin 录 `actual_hours` 时按此口径折算(如 1 小时 20 分钟记 1.25)
- 服务范围:排查并修复系统故障("0 → 1 修好");**硬件问题不含在内**——光伏板、逆变器、线缆断裂等硬件更换需另行报价、客户额外付费(对标北美汽修:工时与配件分开)
- 仅需预约,不做提前上门勘查
- **服务时必须家中有人**;若客户爽约或临时不在家,需提前 24 小时通知改期,否则按 1 小时最低收费
- **硬件问题跟进〔v3.1〕:** `hardware_involved=true` 的工单,admin 须在完成后 48 小时内出具硬件更换报价并电话联系客户跟进(v3.0 仅要求人工执行此流程;系统侧的跟进清单/提醒留 v3.1)
- **付款:** 完工现场结算(e-transfer 或刷卡);v3.0 暂不记录实收状态,`revenue_this_month` 为应收口径(实收标记留 v3.1)

**提交表单差异字段:** 逆变器品牌/型号、当前出现的问题描述(必填,textarea)、期望上门时间段。

**状态机:** `submitted → scheduled → in_progress → completed / cancelled`
admin 在 scheduled 时填技师与上门时间(触发确认通知),completed 时录入实际工时数、故障描述、是否涉及硬件问题及备注。

**免责声明(EN/CN 双语,以下为内容要点,由你写成正式文案放入 i18n):**

- 收费为按小时计费的诊断与人工服务费,自技师抵达现场起计;首小时为最低消费,超过后按 15 分钟递增计费;不保证故障必然可修复,已产生的工时费不因结果退还
- 硬件部件(光伏板、逆变器、优化器、线缆等)的更换与材料费不包含在小时费内,如需更换将另行报价并经客户书面批准
- 服务期间需成年人在场;临时无法在家需提前 24 小时通知改期,否则按 1 小时最低收费

---

## 5. 服务 3:户用太阳能鸟网安装(Bird Netting)

**商业规则(SOP,原样实现):**

- 按卷收费:**1 卷 = 100 ft = $599 CAD**,含全部材料与 **2 年质保**
- 流程:客户预约(提交电话/地址/光伏板数量)→ 我方安排**无人机航拍**评估周长 → 出精确报价(N 卷 × $599 + 鸟窝清理费)→ **客户批准(手写签名)** → 安排安装
- 安装过程**不需要家中有人**
- 板下如有鸟窝**必须先清除**:每个鸟窝清理费 **$99 CAD**;必须确认无鸟类及鸟窝后方可围网
- **报价有效期:** 客户批准前的报价(`quoted` 状态)有效期 **30 天**;超期未签,admin 需重新核价后再出一次报价,不得沿用旧报价直接批准
- **客户拒签:** 客户明确表示不接受报价时,admin 电话确认一次,按客户意愿二选一:重新报价(退回 `quoted` 重新录入)或关单(`cancelled`)
- **付款条款:** 客户签字批准报价当下收取 **30% 订金**以锁定安装排期,完工验收合格后收取剩余 **70% 尾款**
- **超量结算:** 无人机勘测无法完全看清板下情况,开工后实际鸟窝数可能多于报价数。实际清理鸟窝数以现场为准;超出报价数量 **2 个以内**的,按 $99/个 据实结算,无需重新签字;**超出 2 个以上**的,admin 须先电话联系客户确认后方可据实结算
- **受保护鸟巢顺延的管理:** 受法律保护鸟类的活跃巢穴导致安装顺延时,admin 在该 booking 备注中记录 "on-hold" 及预计复查日期,并将其从排期日历中撤下,每月复查一次巢穴状态,不新增状态字段
- **质保报修入口:** 2 年质保期内客户报修,统一走电话或邮件联系 admin,由 admin 手工创建一条 **$0** 的报修 booking 并纳入统一日历跟踪,不游离于系统外

**状态机:** `submitted → survey_scheduled(无人机)→ quoted → approved → install_scheduled → completed / cancelled`
quoted 状态:admin 录入卷数、鸟窝数量、总价,系统生成报价页(secure link + 邮件/短信通知),客户在报价页签名批准 → 状态自动流转到 approved。

**免责声明要点:**

- 最终价格以无人机勘测后的正式报价为准,预约时的估价不构成承诺;报价有效期 30 天,超期需重新确认价格
- 签字批准报价即视为同意支付 30% 订金锁定排期,余款于完工验收合格后支付
- 实际清理鸟窝数量以现场为准;超出报价数量 2 个以内的部分,按 $99/个 据实结算,无需重新签字;超出 2 个以上,我方将先电话联系确认
- 存在活跃鸟窝时须先行清理(每窝 $99);**受法律保护鸟类(如候鸟)的活跃巢穴依法不得移除,如遇此情形安装将顺延至巢穴自然废弃,由此产生的延期我方不承担责任**
- 鸟网用于阻止鸟类进入板下空间,不构成对既有屋顶/线缆损伤的修复,也不担保杜绝一切动物侵入(如松鼠啃咬)
- 2 年质保覆盖网材与安装工艺,不覆盖人为破坏、极端天气及第三方施工造成的损坏;质保期内报修请电话或邮件联系我方

---

## 6. 服务 4:户用太阳能清洁(Panel Cleaning)

**商业规则(SOP,原样实现):**

- 订阅制,对标草坪养护:**每年 4 次,每季度 1 次**,年度一次性付费
- 每次上门前通过**邮件/短信提前通知**"即将进行清洁"
- 清洁过程**不需要家中有人**
- 工艺:手持双头旋转刷,人工屋顶作业,打泡沫清洗,使用**去离子/纯净水(water-fed pure water system)**——普通自来水干后会在板面留下白色矿物质斑块影响发电,纯水清洗无残留
- **不打开、不拆卸任何板子,不接触电气部分,无设备漏电风险**(此点须在服务说明与免责声明中明确写出)
- **付款前置:** `payment_status` 确认为已付款(`paid`)之前,不得为该订阅安排任何一次 visit(即使已完成定价)
- **custom 档确认流程:** ≥36 块板的 custom 档,admin 设定年费后通过邮件发送报价,客户回复确认(邮件留痕)方视为成交并生效计费;v3.0 不为此单独建签字页
- **skipped 的语义:** 因天气(雨/雪/大风/结冰)导致的改期,更新该次 visit 的 `scheduled_date`、状态保持 `pending`,不计入已消耗次数;因客户主动放弃且未要求改期的,标记 `skipped`,视为已消耗该次、不予退还,admin 需在 notes 中注明原因
- **服务窗口期:** 每季度的 visit 须在该季度前 6 周内完成排期与执行
- **订阅到期口径:** 订阅期为 `start_date` 起 12 个月;期满时因客户原因未执行的剩余次数作废,因我方原因(如排期延误)未执行的顺延补做

**定价(已定,写入 Settings 可改):** 按板数分档年费——
- ≤ 20 块板:**$599/年**(4 次)
- 21–35 块板:**$799/年**
- ≥ 36 块板:标注"联系报价",admin 手动定价

**数据模型:** `CleaningSubscription`(客户信息、板数、档位、年费、付款状态、起始日期)+ 4 条 `CleaningVisit`(季度、计划日期、状态 `pending → notified → completed / skipped`)。admin 排期某次 visit 时自动触发"即将清洁"通知;完成后可选发送完成通知。续订:到期前 30 天自动给 admin 提醒 + 给客户发续订邮件(v3.0 只发通知,不做在线续费)。

**免责声明要点:**

- 清洁为板面外部清洗,不涉及任何电气检修与部件拆装,不打开面板,无漏电风险
- 不承诺具体发电量提升数值;不承担清洁前已存在的板面损伤、划痕、热斑等责任(开工前技师拍照留档)
- 恶劣天气(雨、雪、大风、屋面结冰)导致的改期不视为违约,顺延安排且不计入已消耗次数;客户主动放弃某次服务且不要求改期的,视为已消耗、不予退还
- 订阅费为年度预付,覆盖 4 次服务,每季度需在该季度前 6 周内完成;订阅期为起始日起 12 个月,期满未执行次数中因客户原因未执行的作废、因我方原因未执行的顺延补做;客户单方面取消的退款政策:未执行次数按比例退还,扣除已执行部分

---

## 7. Admin 后台

**核心诉求:"分开看"与"合起来看"两套视角都要有,按以下原则实现,具体页面拆分由你自行决定任务分解:**

- **排期必须合看** —— 同一支队伍干四种活,排期冲突要一眼可见。新增**统一作业日历** `/services/schedule`:EV 的勘测/安装、诊断上门、鸟网航拍与安装、清洁 visit 全部聚合到一个日历(复用 CalendarGrid),按服务色标区分,点击跳对应详情页。对 EV 数据只读聚合展示,严禁改动 EV 模块本身
- **业务列表分看** —— 各服务生命周期不同,混在一张表里没法操作。列表页顶部用 segmented tabs:All / Diagnostic / Bird Netting;清洁因订阅模型不同单独成页
- **经营数据先合后分** —— Dashboard 顶部合计 KPI,下面按服务线拆分
- **响应时限(SLA):** 新提交 1 个工作日内响应;无人机勘测完成后 2 个工作日内出具报价;客户签字批准后 5 个工作日内安排安装。v3.0 先把口径立起来,不做超时预警;超时标红等提醒机制留 v3.1+

新增导航分组 "Services":

| 页面 | 路由 | 功能 |
|------|------|------|
| UnifiedSchedule | `/services/schedule` | 统一作业日历(四服务聚合,色标 + 图例,支持按服务筛选显隐) |
| ServiceBookings | `/services/bookings` | 诊断 + 鸟网预约列表,segmented tabs(All/Diagnostic/Bird Netting)+ 状态筛选,列表操作:排期、录报价、标记完成 |
| ServiceBookingDetail | `/services/bookings/:id` | 单条详情:客户信息、状态流转、通知历史、内部备注;鸟网含报价录入区 |
| CleaningSubscriptions | `/services/cleaning` | 订阅列表 + 每个订阅的 4 次 visit 排期日历视图(复用 CalendarGrid) |

Dashboard(2026-07-24 已按此口径落地,详见 `DESIGN-dashboard-v2.md` / `DESIGN-dashboard-v3-service-blocks.md`):合计层(公司公用块)展示跨线数据(合并营收、服务预约总数、EV 案件总数);分线层为四个服务**各一个通栏大区块**(而非早先设想的迷你 KPI 卡),EV 保留 LivePipeline 管道视图,其余三个服务各自一个基于真实状态机的可视化流程图(FlowStrip)+ 5 项 KPI,支持点击流程节点深链到对应筛选列表。

Settings 新增 "Service Pricing" 区块(全部可编辑,前端从 API 读):诊断时薪、鸟网每卷价、鸟窝清理费、清洁三档年费。

通知模板:沿用 DB 可编辑的 Jinja2 模板机制,新增约 8 个模板(各服务确认、排期通知、鸟网报价、清洁前通知、清洁续订等),EN/CN 双语。

---

## 8. 数据库(Alembic 新迁移)

```
service_bookings
  id, service_type ENUM('diagnostic','bird_netting'),
  customer_name, phone, email, address, panel_count,
  inverter_info TEXT NULL, problem_description TEXT NULL,   -- diagnostic only
  status, scheduled_at, technician, access_token,
  disclaimer_accepted_at TIMESTAMPTZ NOT NULL,
  created_at, updated_at

bird_netting_quotes
  id, booking_id FK, roll_count, nest_count,
  roll_price, nest_fee, total, status('pending','approved','rejected'),
  signature_data, approved_at

cleaning_subscriptions
  id, customer_name, phone, email, address, panel_count,
  tier, annual_price, payment_status('unpaid','paid','refunded'),
  start_date, disclaimer_accepted_at, access_token, created_at

cleaning_visits
  id, subscription_id FK, quarter(1-4), scheduled_date,
  status('pending','notified','completed','skipped'), completed_at, notes

service_pricing (或并入现有 settings 表机制,以现有 Settings 实现为准)
```

价格快照原则:booking/quote/subscription 创建时把当时价格写入自身记录,后续改 Settings 不影响已有订单。

---

## 9. API(挂在现有 `/api/v1` 下,public/ 与 admin/ 分目录)

Public(token 鉴权,无账号):
- `POST /public/services/bookings` 提交诊断/鸟网预约
- `GET /public/services/bookings/{token}` 状态跟踪
- `GET /public/services/bird-netting/quote/{token}` / `POST .../approve` 查看与签名批准报价
- `POST /public/services/cleaning/subscriptions` 提交清洁订阅
- `GET /public/services/cleaning/{token}` 订阅与 4 次排期查看

Admin(现有 JWT):bookings CRUD + 状态流转、quote 录入、subscription/visit 管理、pricing 读写。**新增路由的 admin 前端调用必须逐一对上,禁止出现前后端字段不一致。**

---

## 10. i18n 与免责声明落地

- 三份免责声明各写 EN + 简体中文完整文案,存 i18n(客户端展示)并在数据库记录同意时间戳
- 免责声明在 Step B 以可滚动区块完整展示,勾选框文案:"I have read and agree to the service terms & disclaimer / 我已阅读并同意服务条款与免责声明",未勾选禁用提交按钮

## 11. 明确不做(v3.0 范围外)

在线支付、在线续费、客户账号体系、EV Case 流程任何改动、CaseDetail.jsx 拆分、ImageModal 合并。

## 12. 执行与验收

1. 执行 STAGE-SUMMARY 第 7 节改动前检查清单;涉及共享模块(i18n、通知、auth、PlacesAddressInput)先 `trace_path`
2. 分阶段提交:① 迁移 + 后端模型/路由 ② 客户端首页 + 三个提交流程 ③ admin 模块 ④ 通知模板 + i18n 补全;每阶段单独 commit(英文 message)
3. 每阶段跑 `admin` 与 `frontend` 两个 build;后端补 pytest:booking 创建、鸟网报价批准流转、清洁 visit 状态流转至少各一条
4. 验收标准:EV 现有流程回归无任何变化;三个新服务从提交到 completed 全链路可走通;所有价格改 Settings 即时生效于新订单;双语切换下所有新增文案无缺失 key
