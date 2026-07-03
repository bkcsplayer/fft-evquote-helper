# FFT EV 充电桩报价与项目管理系统 — 功能总览

> 生成日期：2026-07-02　｜　对应代码：`main` 分支
> 本文是对系统**当前已实现功能**的完整盘点,按"从整体到细节"组织,方便快速把握全貌,也可下钻到具体模块。

---

## 0. 一句话定位

这是一套面向 **Calgary EV 充电桩安装商** 的 **在线报价 + 全流程项目管理系统**：客户在网页自助提交需求 → 系统按"勘测→报价→签约→许可→安装→完工"推进 → 后台一站式管理每个案件的日程、报价、财务、文件与许可,全程自动 Email/SMS 通知客户。

**规模速览**

| 层 | 数量 |
|---|---|
| 客户端页面 | 9 个 |
| 后台页面 | 15 个(含案件工作台 10 个 tab) |
| 后端 API 端点 | **118 个**(后台 95 + 客户端 23) |
| 后端 service 模块 | 12 个 |
| 数据库表 | 20 张 |
| 案件状态 | 13 个(11 正常流转 + 取消/流失) |
| 数据库迁移 | 8 次(3 月至 6 月演进) |

---

## 1. 技术栈与部署架构

### 1.1 技术栈
- **客户端前端** (`frontend/`)：React 18 + Vite + TailwindCSS,Google Maps 地址自动补全
- **管理后台** (`admin/`)：React 19 + Vite + TailwindCSS + React Router
- **后端** (`backend/`)：FastAPI + SQLAlchemy + Alembic,JWT 管理员认证
- **数据库**：PostgreSQL 16
- **通知**：SMTP(Email) + Twilio(SMS),Jinja2 模板
- **容器化**：Docker Compose(4 服务)

### 1.2 服务与端口

| 服务 | 本地 dev 端口 | VPS 生产端口(仅本机,Nginx 反代) |
|---|---|---|
| frontend(客户端) | 7220 | 127.0.0.1:7620 |
| admin(后台) | 7221 | 127.0.0.1:7621 |
| backend(API) | 7222 | 127.0.0.1:7622 |
| db(Postgres) | 7223 | (不对外) |

- **本地** `docker-compose.yml`：4 服务全起;`docker-compose.dev.yml`：仅 db+backend 热重载调试。
- **生产** `docker-compose.vps.yml`：Vultr VPS(45.76.242.112,宝塔面板),域名 `https://evquote.khtain.com`,宝塔 Nginx 做 SSL 反代。
- **一键部署** `deploy.sh`：本地 `git push` → SSH 进 VPS → `git reset --hard` + `docker compose up -d --build` 重建。
- **容器启动**(`entrypoint.sh`)：等 DB 就绪 → `alembic upgrade head` 自动迁移 → 启动 uvicorn。

---

## 2. 业务主线：案件全生命周期

系统的核心聚合根是 **Case(案件)**,一切围绕它推进。状态机(`status_machine.py`)定义了 13 个状态:

```
pending(待处理)
  → survey_scheduled(已约勘测)
  → survey_completed(勘测完成)
  → quoting(报价中)
  → quoted(已发报价)
  → customer_approved(客户已签约)
  → permit_applied(许可已申请)
  → permit_approved(许可已批准)
  → installation_scheduled(已约安装)
  → installed(已安装)
  → completed(已完工) ← 终态

任意非终态可转 → cancelled(已取消) / lost(已流失) ← 终态
quoted 可回退 → quoting(重新报价)
```

**转移规则**：只能按顺序前进;`quoted` 可退回 `quoting` 改报价;任意非终态可标记取消/流失;每次状态变更都写入 `case_status_history` 审计并触发客户通知。后台还提供 **Admin Override**(输入管理员密码)可绕过状态机强改状态,用于异常处理。

---

## 3. 客户端(Customer)功能与旅程

客户**无需注册**,靠案件的 `access_token`(UUID)访问自己的案件,报价链接可分享。

### 3.1 提交报价(4 步)
1. **Welcome** (`/quote`)：品牌落地页,CTA 进入。
2. **Step 1** (`/quote/step1`)：昵称 + 电话(北美 +1 格式校验),存 sessionStorage 草稿。
3. **Step 2** (`/quote/step2`)：充电桩品牌(下拉)、EV 品牌、邮箱、**安装地址(Google Places 自动补全)**、提货日期、期望完工日期、推荐人、勘测时段偏好(上午/下午/晚上)、备注。
   - 提交前**服务区校验**：从地址提取邮编调 `/service-area/check`;超区则加入候补名单(waitlist)并提示;校验失败则放行(fail-open)。
4. **Submitted** (`/quote/submitted`)：显示参考号 + 跟踪链接,同时发出确认 Email+SMS。

### 3.2 跟踪与交互(状态页)
**StatusPage** (`/quote/status/:token`,15 秒自动轮询)——客户的自助中心:
- **勘测预约**：`pending` 时选时段提交请求(`/cases/survey/request/:token`),等后台确认。
- **定金支付(e-transfer)**：`SurveyConfirm` 页显示收款人/邮箱/金额/参考号,客户转账后填转账人姓名上报(`/payments/etransfer-notify`),后台核实后标记已付。
- **查看报价**：`quoted` 后出现"查看报价"入口。
- **安装预约**：`permit_approved` 后解锁,流程同勘测。
- **时间线**：展示全部状态变更历史。

### 3.3 报价查看与电子签约
- **QuoteView** (`/quote/view/:token`)：报价明细(安装类型、基础价、超距费、许可费、勘测抵扣、附加项、小计、GST 5%、总价 CAD)、包含项清单、**勘测照片库**(可预览)、签署状态。
- **QuoteApprove** (`/quote/approve/:token`)：展示 4 条条款 → 勾选同意 → 填签署人姓名 → **Canvas 手写签名**(支持鼠标/触屏、DPR 自适应)→ 提交。签名连同**签署语言 + 条款文本快照**一并存档(法律审计),案件进入 `customer_approved`。

---

## 4. 管理后台(Admin)功能

导航分两组:**Operations**(Dashboard / Cases / Surveys / Installations / Permits / Scheduling)与 **Admin**(Referrers / Settings / Users)。所有页面登录守卫,token 存 localStorage。

### 4.1 Dashboard(运营中心)
- **Live Pipeline**：7 阶段案件分布,可下钻。
- **KPI 快照**：待审核/待报价/待批准/已约安装/未来 7 天勘测/需修订许可 6 个待办;管道价值、本月/本季营收、本月完工 4 个财务指标。
- **Action Queue**：定金未付、待发完工邮件、需修订许可 3 个快捷入口。
- **最近活动**：最近 8 条状态变更。

### 4.2 Cases(案件库)
按姓名/电话/地址/参考号搜索 + 状态筛选,表格列出参考号、客户、状态、地址、创建日期,点击进入工作台。

### 4.3 CaseDetail(案件工作台 · 10 个 Tab)
单个案件的全生命周期操作台,tab 顺序即工作流顺序,未到阶段的 tab 锁定:

| Tab | 功能 |
|---|---|
| **Overview** | 生命周期流程图 + 客户信息(联系方式、设备品牌、EV 车型、备注、访问链接) |
| **Survey** | 确认/拒绝客户勘测时间请求;现场笔记;标记定金已收;完成勘测;**勘测照片**(6 类分类上传/预览/删除) |
| **Quote** | **负荷计算器入口(绿色按钮)**;创建报价版本(安装类型、基础价、超距、许可费、勘测抵扣、附加项);预览 HTML;发送报价 |
| **Permit** | 许可证信息(编号、状态、申请/预批/实批日期、备注);**许可附件**上传 |
| **Install** | 排期/确认安装;安装报告(已装项目、线规、最大充电电流、测试结果/备注);**安装照片**;发送安装报告;发送完工邮件 |
| **Files** | 附件中心,按类别(许可文件/签署报价/合同/发票/其它)分组管理,统一视图聚合各处文件 |
| **BOM** | 物料清单:从物料库选/自定义行项(数量、单位成本、单位售价、行合计);**从 BOM 一键生成报价** |
| **Finance** | 财务摘要(合同总额、收入 ex-GST、BOM 成本、毛利额+率、已收、待收)+ **收款台账**(定金/尾款/退款,e-transfer/现金/Stripe/其它) |
| **Signature** | 客户签约记录(签署人、时间、IP、语言、签名图、条款快照),只读法律凭证 |
| **Activity** | 状态时间线 + 内部备注 + **通知日志**(Email/SMS 发送状态,可重发)+ **Admin Override**(密码确认强改状态) |

### 4.4 Surveys / Installations(日程管理)
日历 + 列表双视图,按日期区间和状态(定金已付/未付/待完工邮件等)筛选,展示已确认预约 + 待确认的客户请求,支持 CSV 导出。Installations 多一个"完工邮件待发"筛选与快捷发送。

### 4.5 Permits(许可跟踪)
搜索 + 状态筛选,表格内**行内改状态**并"保存并通知"客户(SMS/Email),CSV 导出。

### 4.6 Scheduling(预约引擎配置)
- **服务区**：总开关 + 分区域(启用、FSA 邮编前缀、城市名)。
- **可用性与容量**：提前天数(lead)、最远天数(horizon)、每槽默认容量、每日起止时刻、工作日。
- **日期覆盖**：特定日期/小时的容量覆盖(0=关闭)。
- **未来预约**：只读列表,可取消。

### 4.7 Settings(系统设置 · 仅超管)
品牌资料(联系方式、质保年限、Logo 上传)、定价默认值、e-transfer 收款信息、**Email/SMS 模板(Jinja2,DB 可改无需部署)**、充电桩品牌字典、**物料目录管理**、全部设置只读预览。

### 4.8 Referrers / Users
- **Referrers**：推荐来源转化漏斗(来源、leads 数、完工数、转化率)。
- **Users**：管理员账户 CRUD(仅超管),角色 admin/super_admin。

### 4.9 LoadCalc(CEC 8-200 负荷计算器)★ 最近新增
入口在案件 Quote tab,独立页 `/admin/cases/:id/load-calc`:
- **面板搭建**：品牌、主开关(60/100/125/200A)、槽位数、拖拽 6 种断路器(单极/双极/Tandem/Quad/**EV 蓝**/**Solar 红**),可命名电路与设容量,可打印 A4 面板图。
- **CEC 8-200 负荷计算**：居住面积、**供热类型(电/燃气开关)**、电采暖(62-118 系数)、空调、电炉、即热热水/SPA/泳池、其它附加、EV(100%)→ 实时算总电流,对比服务容量给出"够用/需升级或上 EVEMS"结论。
- 结果存入 `case.load_calc`(JSONB)。
- 算法已按 Calgary 官方 worksheet 逐条核对(见 `admin/src/utils/cecLoad.js` + 自检)。

---

## 5. 后端数据模型(20 张表)

| 表 | 用途 | 关键字段 |
|---|---|---|
| **customers** | 客户主表 | nickname, phone, email |
| **cases** | 案件聚合根 | reference_number(唯一), status, charger_brand, ev_brand, install_address, preferred_survey_slots(JSONB), **load_calc(JSONB)**, access_token(唯一) |
| **case_status_history** | 状态变更审计 | from_status, to_status, changed_by, note |
| **admin_users** | 后台用户 | username, email, password_hash, role |
| **surveys** | 勘测记录 | scheduled_date, deposit_amount, deposit_paid, deposit_reported, stripe_payment_id |
| **survey_photos** | 勘测照片 | category(6 类), file_path, caption |
| **quotes** | 报价单(多版本) | version, install_type, base_price, permit_fee, gst_rate, total, is_active, sent_at |
| **quote_addons** | 报价附加项 | name, price, description |
| **quote_signatures** | 电子签名审计 | signature_data, signed_name, signed_at, ip_address, signed_language, terms_snapshot |
| **permits** | 许可证 | permit_number, status, applied/expected/actual_approval_date |
| **permit_attachments** | 许可文件 | file_path, file_name |
| **installations** | 安装记录 | scheduled_date, completed_at, installed_items, wire_gauge, max_charging_amps, test_passed |
| **installation_photos** | 安装照片 | file_path, caption |
| **notifications** | 通知日志 | channel, recipient, template_name, status, sent_at, error_message |
| **case_notes** | 内部备注 | admin_user_id, content |
| **case_attachments** | 统一文件仓库 | category(7 类), file_path, mime_type, size_bytes, source_table |
| **payments** | 收款台账 | kind(定金/尾款/退款), method, amount, status, recorded_by |
| **appointments** | 预约槽位(原子化) | kind(survey/install), start_at, status, created_by |
| **availability_overrides** | 容量覆盖规则 | day, hour, capacity |
| **system_settings** | 系统配置(JSONB) | key, value(booking_config / service_area / 模板 / 定价 等) |
| **charger_brands** | 充电桩品牌字典 | name, sort_order, is_active |
| **material_catalog** | 物料主表 | sku, name, category, default_unit_cost, default_sell_price |
| **case_bom_lines** | 案件 BOM 行 | material_id, qty, unit_cost, unit_price, line_total |

> 关键设计：**Case 为聚合根**;报价**多版本**(is_active 标识当前);收款用**结构化 Payment 台账**取代字符串备注;文件用 **CaseAttachment 统一仓库**聚合;审计链完整(状态历史 / 签名 / 通知 / 收款人)。

---

## 6. API 端点总览(118 个)

> 完整逐条清单见各 agent 明细;此处按模块归类概览。认证:管理员用 JWT,客户用案件 access_token。

### 6.1 管理员 API(95 个,需登录)
- **Auth**：登录、当前用户信息
- **Cases**：列表/详情/删除(超管)、状态更新、Override 强改、负荷计算读写
- **Case Extras**：时间线、通知记录、重发通知、内部备注
- **BOM / Materials**：BOM 行 CRUD + 一键生成报价;物料目录 CRUD
- **Finance / Payments**：单案财务、CSV 导出;收款记录 CRUD
- **Quotes**：创建报价、发送、HTML 预览、列表
- **Surveys / Survey Photos**：排期、拒绝请求、完成、标记定金、日历;照片上传/删除
- **Attachments**：统一附件上传/列表/删除(≤25MB)
- **Installations**：报告、照片、发送报告、排期、完成、完工邮件、日历
- **Permits**：CRUD、状态更新(触发通知)、附件
- **Scheduling**：booking 配置、服务区、容量覆盖、预约列表/取消、管理员直接下单
- **Referrers / Settings / Users / Dashboard**：转化统计;品牌/模板/品牌字典/Logo;用户 CRUD;仪表盘统计与最近活动

### 6.2 客户端 API(23 个,公开)
- **Branding**：品牌配置
- **Booking**：服务区检查、候补名单、可用时段、下单、取消
- **Cases**：提交案件、状态查询、时间线、勘测/安装时间请求
- **Charger Brands**：可选品牌列表
- **Payments**：e-transfer 收款信息、上报转账(Stripe 端点已停用返回 410)
- **Quotes**：查看报价、批准签署
- **Survey Photos**：客户查看勘测照片

---

## 7. 核心业务模块细节

### 7.1 报价(quote_service)
新建报价自动 version+1、旧版置 is_active=false;计算：`小计 = 基础价 + 超距费 + 许可费 + 附加项 - 勘测抵扣`,`GST = 小计 × 税率`,`总额 = 小计 + GST`。发送报价 → `quoted`;客户签署 → `customer_approved`(防重复签,409)。

### 7.2 财务(finance_service,只读计算)
`收入(ex-GST)=报价小计`;`成本=Σ(BOM 单位成本×数量)`;`毛利=收入-成本`;`已收=定金+尾款-退款`;`待收=合同总额-已收`。可按月导出完工案件 CSV。

### 7.3 预约系统(booking / availability / booking_flow)
- **配置**(booking_config)：槽长、每日起止、提前/最远天数、工作日、时区(America/Edmonton)、每槽容量。
- **候选槽生成**(纯函数)→ **容量过滤**(考虑 overrides)→ **原子下单**(`SELECT ... FOR UPDATE` 防超售)。
- **端到端**(booking_flow)：校验案件状态可约 → 单一活跃预约(改期先取消)→ 写 Appointment + 镜像到 Survey/Installation + 推进状态 + 发 SMS。
- **服务区**(service_area)：按 FSA 邮编前缀 / 城市名判断,目前仅 Calgary。

### 7.4 通知系统(notification_service)
- **Email**(SMTP)+ **SMS**(Twilio),每条写入 `notifications` 表(pending→sent/failed 审计)。
- 模板优先取 **DB(SystemSetting)**,回退文件模板,Jinja2 渲染(品牌变量注入)。
- **触发事件**(12+)：提交确认、新请求(→管理员)、报价就绪、客户签约(→双方)、勘测已约/完成、许可申请/批准、安装已约、安装报告、项目完成、定金已上报(→管理员)等。
- 管理员事件收件人：`ADMIN_NOTIFY_EMAIL`(回退 `BOOTSTRAP_ADMIN_EMAIL`)。

### 7.5 负荷计算(见 §4.9)
纯函数 `cecLoad.js`,CEC 8-200 单户住宅算法 + 电/燃气供热开关,结果存 `case.load_calc`。

---

## 8. 集成与配置(环境变量)

| 类别 | 变量 | 说明 |
|---|---|---|
| 应用 | APP_ENV, SECRET_KEY | 环境、JWT 密钥 |
| 数据库 | DB_USER/PASSWORD/NAME/HOST/PORT | Postgres 连接 |
| URL | FRONTEND_URL, ADMIN_URL | 前端/后台地址 |
| 品牌 | BRAND_SHORT/NAME/TAGLINE/SUPPORT_* /LOGO_URL | 品牌信息 |
| 通知 | ADMIN_NOTIFY_EMAIL | 管理员事件收件人 |
| SMS | TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER | 留空则禁用短信 |
| Email | SMTP_HOST/PORT/USER/PASSWORD/FROM_*/STARTTLS/USE_SSL | 邮件发送 |
| 引导 | BOOTSTRAP_ADMIN_USERNAME/EMAIL/PASSWORD | **仅首次空库时创建管理员** |
| 登录安全 | ADMIN_LOGIN_WINDOW/MAX_ATTEMPTS/BLOCK_SECONDS | 5 分钟 8 次锁 10 分钟 |
| 前端 | VITE_GOOGLE_MAPS_API_KEY | 地址自动补全(必需) |
| 支付 | STRIPE_*（已停用,保留兼容） | 当前走 e-transfer |

> **注意**：`BOOTSTRAP_ADMIN_*` 只在**数据库为空**时创建管理员;库里已有账号时**不会**用 .env 覆盖密码(当前管理员用户名为 `FFTAdmin`)。

---

## 9. 数据库迁移时间线(功能演进史)

| 迁移 | 日期 | 加了什么 |
|---|---|---|
| init | 2026-03-09 | 初始 15 表(客户/案件/用户/勘测/报价/许可/安装/通知/备注/状态历史/品牌/设置) |
| installation_report_and_photos | 2026-03-10 | 安装完工报告字段 + 安装照片表 |
| appointment_requests | 2026-03-11 | 勘测/安装的"客户提议→管理员确认"字段(老握手流程) |
| admin_notify_and_signature_audit | 2026-06-25 | 定金上报结构化标记;签名增加语言 + 条款快照审计 |
| case_aggregate_attachments_payments_bom | 2026-06-25 | 新增"流失"状态;统一附件仓库、收款台账、物料目录、BOM;回填历史定金 |
| booking_system | 2026-06-29 | 新预约系统(Appointment + 容量覆盖 + 候补名单),弃用老握手 |
| backfill_appointments | 2026-06-29 | 回填老案件到新预约系统(幂等) |
| case_load_calc | 2026-06-30 | 案件增加负荷计算字段(JSONB) |

**演进脉络**：3 月搭起基础全流程 → 6 月下旬集中升级(财务台账、统一附件、BOM、原子化预约系统、负荷计算器),从"能跑"走向"精细化运营 + 财务可视化"。

---

## 10. 现状小结

**已经做成的**：一套覆盖 **客户自助提交 → 勘测 → 报价 → 电子签约 → 许可 → 安装 → 完工** 全链路的项目管理系统,具备:
- 客户端零注册自助流程 + 实时状态跟踪 + 在线签约
- 后台案件工作台(10 tab)统管日程/报价/财务/文件/许可
- 结构化财务(BOM 成本 → 报价收入 → 收款台账 → 毛利)
- 原子化防超售预约引擎 + 可配置服务区/容量
- 双渠道(Email/SMS)自动通知 + 模板后台可改
- CEC 8-200 负荷计算器(电/燃气供热,EV/Solar 标注,可打印)
- Docker 一键部署 + 自动迁移

**几个可留意的点**(非缺陷,供决策)：
- Stripe 已停用,支付走 e-transfer(人工核实定金)。
- 服务区目前仅 Calgary。
- 后台无细粒度权限,super_admin 与 admin 仅在 Settings/Users 页区分。
- 通知为同步发送(失败记录在 notifications 表,可后台重发)。

---

*本报告由对代码库的系统性扫描生成,如某模块需要更深入的技术细节(如具体函数签名、字段类型),可指定模块进一步展开。*
