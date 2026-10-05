# DESIGN: 鸟网服务线流程与 UX 重整（+ 全线 Calgary 时区 / GST 统一 / 全局通知重定向）

> Architect: Fable 5 · 2026-10-05 · 覆盖上一轮（催单）的 DESIGN.md。
> 输入：SPEC.md（决策 1–9 已拍板，不重开）、CONTEXT.md 术语、冻结 UI 契约 `design/mockups/v1.html`、
> MEMORY.md、项目 CLAUDE.md 红线、`.cmm/REPORT-2026-07-29.md`、`~/.claude/infra/SERVERS.md`（仅部署段）。

## 0. Task tier & Skill Manifest
- Tier: **CRITICAL** — 金额逻辑（GST / 30% 定金 / 尾款，项目红线 4）+ 不可回滚的 Postgres 枚举扩容迁移 + 生产库镜像到本地 + 生产部署（真实客户 SVC-2026-0001 在库）+ 影响面 > 10 个符号（`service_booking_flow.py` 7 个函数、2 个 API 模块、3 个客户端页、后台详情页整页重写、4 份 compose）。
- Skills: `cmm`, `codebase-memory`, `ponytail-review`, `ui-ux-pro-max`（唯一 UI 权威）, Python/FastAPI, TypeScript/React（本项目是 JSX+Vite，按 React 规则）, Postgres, Docker, deployment
- Planned advisor consults: **2** — ① T1+T2 合入后的实现中期审查（金额/草稿可见性/重定向三条红线逐行核）；② T5 本地验证通过、T6 部署前的完工核签。

## 1. Goal
把鸟网订单做成清晰的阶段流（约勘测 → 录入勘测结果 → 已勘测 → 报价草稿（可反复改、可预览）→ **发送报价**（唯一通知客户的动作，写明收件人 + 二次确认）→ 客户签字 → 定金 → 排安装 → 完工），后台详情页按 `v1.html` 改成阶段引导式；所有对客时间（四条线、邮件 + 短信 + 两端页面）显示 Calgary 本地时间；鸟网/诊断/清洁统一"不含税 + 5% GST"，定金 = 含税总额 × 30%、尾款 = 含税总额 − 定金；新增全局 `NOTIFY_REDIRECT` 保护本地开发；先镜像生产库到本地验证，再按三端同步铁律部署。**全程不给 Nick（SVC-2026-0001）或任何真实客户发任何消息。**

## 2. Current real flow（来自真实文件，已逐一核对）

### 2.1 鸟网状态机与报价（`backend/app/services/service_booking_flow.py`）
- `BIRD_TRANSITIONS`（L53）：`submitted→survey_scheduled→quoted→approved→install_scheduled→completed`，无 `surveyed`。
- `create_service_booking`（L133）：鸟网直接 `status=survey_scheduled`，`_book(kind=bird_survey)`，发 `service_submission_confirm`，时间文本 `start_at.astimezone().strftime("%Y-%m-%d %H:%M %Z")`（L196）→ 容器无 TZ → "2026-10-09 14:00 UTC"（Nick 收到的就是这个）。
- `admin_schedule_booking`（L218）：鸟网分支只接受 `approved/install_scheduled`（L229），在 `survey_scheduled` 点 Confirm schedule → **400**，勘测时间无法改（SPEC 列出的 bug）。
- `admin_create_bird_quote`（L278）：`total = rolls*roll_price + nests*nest_fee`（**无 GST**），立即 `status=quoted` 并 `notify_service("bird_quote_ready")`——没有草稿、没有预览、没有确认。
- `approve_bird_quote`（L345）：`deposit = total*0.30`（float，未定义四舍五入），Deposit Invoice PDF 走 `build_invoice_pdf(gst_rate=0, gst_amount=0)`。
- `admin_update_status`（L430）：按 `BIRD_TRANSITIONS` 放行任意合法跳转——后台 Status 下拉可在 `survey_scheduled` 直接选 `quoted`，**不需要报价存在**。
- `_build_completion_invoice`（L495）：诊断 `hours*rate` 无 GST；鸟网 Balance Invoice `amount_paid = total*0.30`，无 GST。
- `create_cleaning_subscription`（L560）：年费发票无 GST；`admin_schedule_visit`（L674）时间文本同样是 UTC bug。

### 2.2 数据（`backend/app/models/models.py`）
- `ServiceBookingStatus`（L610）9 个值，无 `surveyed`。`service_bookings`（L660）有诊断专用列块（`inverter_info/problem_*`）和客户自传 `photo_urls`，**无勘测结果列**。
- `BirdNettingQuote`（L707）：`roll_count, nest_count, roll_price_snapshot, nest_fee_snapshot, total, status(quote_status: pending/approved/rejected), signature_data, signed_name, approved_at`。无小计/GST/定金/发送时间/改卷原因。
- 迁移链头：`655efc445c97`（催单，已在生产）← `b1c2d3e4f5a6`（v3，`ALTER TYPE ... ADD VALUE` 放在 `autocommit_block()`，精确先例）。

### 2.3 API
- 后台 `backend/app/api/v1/admin/services.py`：`_booking_admin_view` 总是带 `quote`；端点 `schedule / status / quote / cancel`。
- 公开 `backend/app/api/v1/public/services.py`：`_booking_public_view` **只要 quote 行存在就暴露 `total`**（L102）；`GET /public/services/bird-netting/quote/{token}` 只要有行就返回价格——引入草稿后会**泄露未发送的草稿价格**（红线）。`POST /public/services/upload`（L48）：扩展名白名单 + 25MB 上限，返回 `/uploads/services/<uuid>.<ext>`；`main.py` L42 挂载 `/uploads` 静态目录。
- `/public/payments/etransfer-info/{token}` 只服务 EV case token，新服务页没有收款邮箱来源。

### 2.4 通知与重定向
- 所有对客消息最终经 `notification_service.py` 的 4 个记录函数：`notify_email`(L267) / `notify_sms`(L312)（EV）、`_send_service_email`(L509) / `_send_service_sms`(L551)（三条新线 + 催单）；它们各自先构造 `Notification(recipient=...)` 再调 `email_service.send_email` / `sms_service.send_sms`。
- 唯一的重定向在 `nudge_service.resolve_recipient`（L127，`NUDGE_REDIRECT`，默认 ON，目标 `settings.nudge_redirect_sms/email` = `+15879669668 / cool@khtain.com`）。
- 时间文本 `astimezone().strftime(...)` 共 8 处对客使用：`service_booking_flow.py` L196/L256/L694；`booking_flow.py` L53/L102；`admin/installations.py` L462/L665；`admin/surveys.py` L113；另 `admin/quotes.py` L150 报价 PDF `generated_at` 印 "UTC"，`notification_service.build_invoice_pdf` L163 发票日期取 UTC 日期。`nudge_service.py` 已有 `CALGARY_TZ = ZoneInfo("America/Edmonton")`（`tzdata==2025.1` 在 requirements，容器可用）。
- `docker-compose{,.dev,.vps,.test}.yml` 的 `environment:` 是显式白名单（MEMORY 坑）；本地 `.env` 含**真实** SMTP/Twilio 凭据（`tests/test_nudge_service.py` 文档头明说）。

### 2.5 催单（`nudge_service.py`）
`_SERVICE_CLASSIFY`（L86）穷举 (type,status)；`tests/test_nudge_service.py::test_service_classify_exhaustive` 从 `BIRD_TRANSITIONS` 推导可达状态做哨兵——新增 `surveyed` 必须同时进 `BIRD_TRANSITIONS` 与分类表，否则该测试红。

### 2.6 前端
- 后台 `admin/src/pages/services/ServiceBookingDetail.jsx`（263 行）：诊断 + 鸟网共用；通用 Schedule 卡 + 自由 Status 下拉 + "Save quote & notify customer"。`AdminSlotPicker.jsx` 用浏览器本地时区格式化。`ServiceBookings.jsx` L9 `STATUSES` 硬编码状态列表。`serviceTone.js` 状态色表。
- 客户端 `frontend/src/pages/service/{BirdNettingFlow,BirdQuoteApprove,ServiceStatusPage}.jsx`、`ServiceSlotPicker.jsx`、`PhotoUpload.jsx`（已封装多图上传到 `/public/services/upload`）、i18n `frontend/src/i18n/index.js`（`svc.bird.*` / `svc.status.*` en L295–382，zh L690–773）。
- 路由不变：客户端 `/service/status/:token`、`/service/bird-netting/quote/:token`；后台 `/admin/services/bookings/:id`。

### 2.7 生产现状
VPS 库在 `655efc445c97`；唯一真实鸟网单 **SVC-2026-0001（Nick Li）`survey_scheduled`**，带一条 `bird_survey` Appointment，尚无 quote 行。迁移对它只是追加可空列 + 枚举值，行保持合法。

## 3. Chosen solution

### 3.1 YAGNI 台阶（每个决策落在哪一级、为什么不更低）
| 决策 | 落点 | 更低台阶为何不行 |
|---|---|---|
| 1 时区 | **5 最小改动** + 一个 15 行纯函数 `fmt_calgari`（`app/utils/timefmt.py`） | 改容器 `TZ` 环境变量（台阶 4）：`astimezone()` 无参依赖进程时区，compose 里一行 `TZ=America/Edmonton` 就能修——但 `strftime("%Z")` 会印 "MDT" 只是副作用，且本地 Windows/pytest 环境不受控、以后任何人删那一行就静默回归；显式 `ZoneInfo` 是 SPEC 要求（"不依赖容器 TZ"）。 |
| 2 GST | **6 新代码但最小**：`app/utils/money.py` 纯函数 + 3 列 | 复用 EV `quote_service._compute_totals`（台阶 2）：它绑死 EV 字段（base_price/permit_fee/addons），抽通用会动 EV（SPEC Out of Scope）。 |
| 3 定金 | 同上一个函数 `deposit_split(total)` + 快照列 `deposit_amount` | 纯计算不存（台阶 5）：以后改 30% 会让旧单尾款变——金额红线，快照赢。 |
| 4 勘测结果 | **5 最小改动**：`service_bookings` 加 5 列（沿用"诊断专用列块"先例） | 新表 `bird_survey_results`（台阶 7）：1:1、4 个字段、删掉它复杂度只回到一个调用方——删除测试不过，是穿透模块。 |
| 4 照片上传 | **2 复用**：后台直接调现有 `POST /public/services/upload`（同 `AdminSlotPicker` 调公开 slots 的先例），URL 存 `survey_photo_urls` JSONB | 新建带鉴权的后台上传端点：公开端点本就无鉴权对外开放，再包一层不增加任何安全性，只增加代码。 |
| 5 草稿/发送 | **5 最小改动**：`bird_netting_quotes.sent_at`（NULL = 草稿）；阶段真相仍是 `booking.status` | 给 `quote_status` 枚举加 `draft/sent`：又一次不可回滚枚举扩容，且两处真相（booking.status 与 quote.status）会打架。见 §4 设计两遍。 |
| 5 预览客户页 | **3 用已装库**：`python-jose` 签 30 分钟 `scope=bird_quote_preview` 的 JWT，客户页同一 URL 加 `?preview=` | 后台复制一份客户报价页（台阶 2？）：两个 app 不共享组件，复制必漂移，契约写明"opens exactly this page"。 |
| 6 后台阶段页 | **6 新代码**：鸟网专用 `BirdBookingDetail.jsx` + 6 个小卡片组件；诊断页保留原样 | 在现有页用 `if` 堆：原页 263 行已混两条线，再叠 6 阶段会超 800 行红线。 |
| 6 去自由下拉 | **5**：后端 `admin_update_status` 对鸟网只放行 `completed/cancelled` | 只改前端：API 仍能无报价跳 quoted，红线（信任边界）。 |
| 6 勘测改期 400 | **5**：`admin_schedule_booking` 鸟网分支加 `survey_scheduled` 分支 | — |
| 7 全局重定向 | **5 最小改动**：一个 `_apply_redirect()` 在 4 个记录函数首行调用；复用 `nudge_redirect_sms/email` 两个目标设置 | 在 `send_email/send_sms` 传输层改（2 处更少）：`Notification.recipient` 会记成真实客户而实际发给了 Kuo——审计撒谎，见 §4。合并催单重定向：SPEC Out of Scope 不动催单逻辑，二者叠加时"目标已是 Kuo 则不动"自然兼容。 |
| 8 镜像 | **2 复用**：`scripts/db-backup.ps1` / `db-restore.ps1` + `pg_dump` 经 ssh alias | — |
| 催单识别 surveyed | **4 改数据**：分类表加一行 `"ours"` | — |

### 3.2 数据契约（迁移 `c7d8e9f0a1b2_bird_survey_quote_gst.py`，revises `655efc445c97`）
```
-- 1. 枚举（autocommit_block，照抄 b1c2d3e4f5a6；IF NOT EXISTS 保证重跑安全；不可回滚）
ALTER TYPE service_booking_status ADD VALUE IF NOT EXISTS 'surveyed' AFTER 'survey_scheduled';

-- 2. service_bookings（鸟网专用勘测结果块；全部可空/有默认，Nick 的行不受影响）
survey_perimeter_ft   INTEGER        NULL
survey_nest_count     INTEGER        NULL
survey_notes          TEXT           NULL
survey_photo_urls     JSONB NOT NULL DEFAULT '[]'
surveyed_at           TIMESTAMPTZ    NULL

-- 3. bird_netting_quotes
subtotal              NUMERIC(10,2) NOT NULL DEFAULT 0
gst_rate              NUMERIC(4,2)  NOT NULL DEFAULT 0      -- 百分比，新报价写 5.00
gst_amount            NUMERIC(10,2) NOT NULL DEFAULT 0
deposit_amount        NUMERIC(10,2) NULL                    -- 发送/保存时快照
roll_override_reason  TEXT          NULL
sent_at               TIMESTAMPTZ   NULL                    -- NULL = 报价草稿

-- 4. 回填（SPEC：历史单不补 GST，诚实记录为 0 税）
UPDATE bird_netting_quotes SET subtotal = total, sent_at = created_at,
       deposit_amount = round(total * 0.30, 2);
-- downgrade：drop 以上列；枚举值留着（与 b1c2d3e4f5a6 同样说明）
```
ORM：`ServiceBookingStatus.surveyed = "surveyed"`；`ServiceBooking` 加 5 个字段（注释块 `# bird-netting-only survey result`）；`BirdNettingQuote` 加 6 个字段。`total` 语义改为**含税总额**。

### 3.3 金额（`backend/app/utils/money.py`，纯 Decimal，零依赖）
```python
CENTS = Decimal("0.01"); GST_RATE_PERCENT = Decimal("5.00"); DEPOSIT_RATE = Decimal("0.30")
def to_money(x) -> Decimal                      # Decimal(str(x)).quantize(CENTS, ROUND_HALF_UP)
def with_gst(subtotal) -> (subtotal, gst_amount, total)   # gst = subtotal*5/100 四舍五入到分(HALF_UP)；total = subtotal+gst
def deposit_split(total) -> (deposit, balance)  # deposit = total*0.30 HALF_UP 到分；balance = total - deposit（精确互补）
def suggested_rolls(perimeter_ft: int) -> int   # ceil(ft/100)；ft<=0 → 0
@dataclass(frozen=True) class BirdQuoteMoney: subtotal, gst_rate, gst_amount, total, deposit, balance
def bird_quote_money(roll_count, nest_count, roll_price, nest_fee) -> BirdQuoteMoney
```
不变量：`total == subtotal + gst_amount`；`deposit + balance == total`；全部恰好两位小数。契约向量：3 卷 + 1 窝 → 1896.00 / 94.80 / **1990.80** / 定金 **597.24** / 尾款 **1393.56**（与 v1.html 一致）。舍入显式 `ROUND_HALF_UP`（税务惯例；EV 线用的 `quantize` 默认 HALF_EVEN 不动）。诊断：`subtotal = hours*rate` 再 `with_gst`；清洁：`subtotal = annual_price` 再 `with_gst`。

### 3.4 时间（`backend/app/utils/timefmt.py`）
```python
CALGARY_TZ = ZoneInfo("America/Edmonton")
def to_calgary(dt) -> datetime          # naive 视为 UTC
def fmt_calgary(dt) -> str              # "Fri, Oct 9, 8:00 AM MDT"（分隔符见 §8 告警，默认逗号）
def calgary_date_iso(dt) -> str         # "2026-10-09"（发票日期）
```
实现：`d = to_calgary(dt); f"{d:%a}, {d:%b} {d.day}, {int(d.strftime('%I'))}:{d:%M} {d:%p} {d:%Z}"`（不用 `%-d`，Windows 不支持）。`nudge_service.py` 改为 `from app.utils.timefmt import CALGARY_TZ`。替换 §2.4 列出的全部 10 处（8 处 `scheduled_text/when/completed_text` + `quotes.py generated_at` + `build_invoice_pdf invoice_date`）。

前端：`admin/src/utils/calgaryTime.js` 与 `frontend/src/utils/calgaryTime.js`（同一段 20 行，两 app 不共享代码）：
```js
const TZ = 'America/Edmonton'
export const fmtCalgary = (iso, opts = {}) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', ...opts }).format(new Date(iso))
// → "Fri, Oct 9, 8:00 AM MDT"；fmtCalgaryDay / fmtCalgaryHour 供 slot picker（必须 en-US：en-CA 会出 "Fri., Oct. 9, 8:00 a.m."）
```

### 3.5 全局通知重定向（`notification_service.py`）
```python
# config.py
notify_redirect: str | None = Field(default=None, validation_alias="NOTIFY_REDIRECT")   # 加入 _blank_str_to_none
def notify_redirect_enabled() -> bool: return (get_settings().notify_redirect or "").strip().casefold() == "on"
# notification_service.py
def _apply_redirect(*, is_sms: bool, to: str, subject: str | None, body: str) -> tuple[str, str | None, str]:
    """ON 且 to != 目标 时：收件人换成 nudge_redirect_sms/email；SMS 正文前缀
    "[REDIRECTED — intended for {to}]\n"；邮件主题前缀 "[REDIRECTED → {to}] " 且 html 前插一个
    <div> 横幅。to 已是目标（催单路径）则原样返回。"""
```
在 `notify_email / notify_sms / _send_service_email / _send_service_sms` 构造 `Notification(...)` **之前**各调一次 → `Notification.recipient` 记录的是**实际**收件人（Kuo），正文带原收件人——审计真实。
compose：`docker-compose.yml` 与 `docker-compose.dev.yml`、`docker-compose.test.yml` 写死 `NOTIFY_REDIRECT: "on"`（本地强制，.env 不可覆盖）；`docker-compose.vps.yml` 写 `NOTIFY_REDIRECT: ${NOTIFY_REDIRECT:-off}`（生产默认关，SPEC 决策 7）。四份文件都必须加这一行（白名单坑）。

### 3.6 鸟网流程（`service_booking_flow.py`）
```python
BIRD_TRANSITIONS = {
  submitted:        {survey_scheduled, cancelled},
  survey_scheduled: {surveyed, cancelled},
  surveyed:         {quoted, cancelled},
  quoted:           {approved, surveyed, cancelled},      # surveyed = revise（撤回草稿）
  approved:         {install_scheduled, cancelled},
  install_scheduled:{completed, cancelled},
}
BIRD_STATUS_ENDPOINT_ALLOWED = {completed, cancelled}     # 通用 /status 端点对鸟网只放行这两个
```
| 函数 | 前置 | 做什么 | 通知 |
|---|---|---|---|
| `admin_schedule_booking` | 鸟网 `survey_scheduled` → kind `bird_survey`、状态不变（改期）；`approved/install_scheduled` → `bird_install` → `install_scheduled`；其它 400 | 取消旧 Appointment、`_book`、`scheduled_at = start_at` | 改期发 `service_scheduled`（现有模板，"Appointment confirmed for …"）；安装发 `bird_install_scheduled`；时间全用 `fmt_calgary` |
| **新** `admin_record_survey_result(db, booking, *, perimeter_ft, nest_count, notes, photo_urls)` | 鸟网；状态 ∈ {survey_scheduled, surveyed} | 校验 `perimeter_ft>0`、`nest_count>=0`、`photo_urls` 为 `list[str]` 且每项以 `/uploads/services/` 开头（信任边界：不允许外链图进客户页）；写 5 列；首次写 `surveyed_at=now`；活动 `bird_survey` Appointment → `completed`；状态 → `surveyed`（`_mark_status_changed` 仅首次） | **无** |
| **新** `admin_save_bird_quote_draft(db, booking, *, roll_count, nest_count, roll_override_reason)` | 鸟网；状态 == `surveyed`（`quoted` 时 400 "Revise the sent quote first"） | `roll_count>=0, nest_count>=0, 和>0`；`roll_count != suggested_rolls(survey_perimeter_ft)` 时 `reason` 必填（否则 400），相等时 reason 存 NULL；价格快照 `get_service_pricing`；`bird_quote_money` 写 subtotal/gst_rate=5.00/gst_amount/total/deposit_amount；upsert quote，`status=pending`，签名清空，`sent_at=None`。状态**不变** | **无** |
| **新** `admin_send_bird_quote(db, booking)` | 状态 == `surveyed` 且 quote 存在且 `sent_at is None` | `sent_at=now`；状态 → `quoted` | `bird_quote_ready`，ctx 加 `subtotal, gst_amount, deposit_amount`，正文 "total **$1,990.80** (incl. GST)" |
| **新** `admin_revise_bird_quote(db, booking)` | 状态 == `quoted` 且 `quote.status == pending` | `sent_at=None`；状态 → `surveyed` | **无** |
| `approve_bird_quote` | 加 `quote.sent_at is not None` | 定金取 `quote.deposit_amount`；PDF `subtotal=quote.subtotal, gst_rate=5.0, gst_amount, total=quote.total, due_now=deposit` | 不变 |
| `admin_update_status` | 鸟网 `new_status ∉ BIRD_STATUS_ENDPOINT_ALLOWED` → 400 "Use the survey / quote actions for this step." | — | 完工时 `service_completed` ctx 加 `balance_amount`（鸟网），模板句 `{% if balance_amount %}Balance due: <strong>${{ balance_amount }}</strong> — invoice attached.{% endif %}` |
| `_build_completion_invoice` | — | 诊断 `with_gst(hours*rate)`；鸟网 subtotal/gst/total 来自 quote，`amount_paid=quote.deposit_amount` | — |
| `create_cleaning_subscription` | — | 发票 `with_gst(annual_price)`；ctx 加 `annual_total` | 正文 "Annual price: $599.00 + 5% GST = **$628.95**" |
| **删** `admin_create_bird_quote` + 端点 `POST /quote` | — | 立即通知的旧路径没有调用方后必须删除，避免绕过发送确认 | — |

`bootstrap_service.SERVICE_EMAIL/SMS_TEMPLATES` 的 `bird_quote_ready` / `service_completed` / `cleaning_subscription_confirm` 默认文案同步改（merge-without-overwrite：**已存在的生产模板行不会被覆盖**，数字仍正确只是缺 "(incl. GST)" 字样——Settings 里可改，见 §6）。

预览令牌（放 `service_booking_flow.py`，用 `python-jose` 同 `security.py` 的 HS256 + `settings.secret_key`）：
`make_preview_token(booking_id) -> jwt{sub=booking_id, scope="bird_quote_preview", exp=now+30min}`；`verify_preview_token(token, booking_id) -> bool`（scope 与 sub 都必须匹配；后台登录 JWT 无此 scope 不会被接受，预览令牌也不含 role 不能登后台）。

### 3.7 API 契约
后台（`/api/v1/admin`，全部 `get_current_admin`）
| 端点 | Body | 返回 / 错误 |
|---|---|---|
| `GET /services/bookings/{id}` | — | `_booking_admin_view` 新增 `surveyed_at, survey: {perimeter_ft, nest_count, notes, photo_urls, suggested_rolls}`（无结果时 `survey: null`）；`quote` 新增 `subtotal, gst_rate, gst_amount, total(含税), deposit_amount, balance_amount, roll_override_reason, sent_at, preview_url`（`preview_url` 仅 detail 端点、仅 quote 存在时生成 = `bird_quote_url(token) + "?preview=" + jwt`；list 端点不生成） |
| `POST /services/bookings/{id}/survey-result` | `{perimeter_ft:int, nest_count:int, notes:str|null, photo_urls:[str]}` | 200 view；400 校验失败/状态不对 |
| `PUT /services/bookings/{id}/quote-draft` | `{roll_count:int, nest_count:int, roll_override_reason:str|null}` | 200 view；400 reason 缺失/状态不对 |
| `POST /services/bookings/{id}/quote/send` | `{}` | 200 view；400 无草稿/状态不对 |
| `POST /services/bookings/{id}/quote/revise` | `{}` | 200 view；400 已签字/状态不对 |
| `POST /services/bookings/{id}/schedule` | 不变 | 鸟网 `survey_scheduled` 现在 200（改勘测时间） |
| `POST /services/bookings/{id}/status` | 不变 | 鸟网非 completed/cancelled → 400 |
| `POST /services/bookings/{id}/quote` | **删除** | 404 |
| 照片上传 | 后台复用 `POST /api/v1/public/services/upload`（`api.post(..., { baseURL: '/api/v1' })`） | `{url}` |

公开（token 作用域）
| 端点 | 变化 |
|---|---|
| `GET /public/services/bookings/{token}` | 加 `surveyed_at`、`etransfer_email`（读 `etransfer_settings.recipient_email`，fallback `DEFAULT_ETRANSFER_RECIPIENT_EMAIL`）；**`quote` 仅当 `quote.sent_at is not None`** 才出现，且带 `subtotal, gst_rate, gst_amount, total, deposit_amount, balance_amount, status, sent_at`；`survey {perimeter_ft, nest_count, photo_urls, surveyed_at}` 仅随 `quote` 一起出现（勘测数字/照片在报价发出前对客不可见；`surveyed` 态客户只看到"已勘测于 X 日"） |
| `GET /public/services/bird-netting/quote/{token}?preview=<jwt>` | 无 quote，或 `sent_at is None` 且无有效预览令牌 → 404 "No quote yet"（保持现有前端识别文案）。返回 `{reference_number, customer_name, address, roll_count, nest_count, roll_price, nest_fee, subtotal, gst_rate, gst_amount, total, deposit_amount, balance_amount, status, approved_at, sent_at, survey:{...}, preview: bool}` |
| `POST .../quote/{token}/approve` | 加守卫：`sent_at is None` → 400 "This quote has not been sent."；**绝不**接受 preview 参数 |

### 3.8 催单
`_SERVICE_CLASSIFY[(bird_netting, surveyed)] = "ours"`（球在我们：我们欠报价）；`_SERVICE_ACTION` 不加（ours 不发短信）。`revise` 回到 surveyed 时 `_mark_status_changed` 重置停滞时钟——符合"真正进入下一阶段才算"的反向等价。

### 3.9 前端——严格按 `v1.html` 1:1
后台（`admin/`）
- `ServiceBookingDetail.jsx`：保留加载 + 诊断视图（去掉所有鸟网分支）；`service_type === 'bird_netting'` 时渲染 `<BirdBookingDetail b={b} reload={load} />`。
- 新 `admin/src/pages/services/BirdBookingDetail.jsx`（编排 + header/Cancel + 左栏 Customer/Timeline）与 `admin/src/components/services/bird/`：`BirdStepper.jsx`（6 步，`aria-current="step"`）、`SurveyStageCard.jsx`（勘测时间 + `<details>` 改期 + 录入表单 + 照片格子，复用 `AdminSlotPicker`、上传走 `/api/v1/public/services/upload`）、`SurveySummaryCard.jsx`、`QuoteDraftCard.jsx`（卷/窝输入、建议卷数提示、改卷原因框、价格明细含 GST/定金、Save draft / Preview / Send quote…）、`SendQuoteDialog.jsx`（`role="dialog" aria-modal` 写明 To/SMS/Total，Back / Send now）、`QuoteSummaryCard.jsx`、`InstallStageCard.jsx`（排安装 + 改期 `<details>` + 完工备注 + "Mark completed & send balance invoice ($X)"）、`CompletedCard.jsx`。
- Timeline 数据源：现有 view 字段（`created_at / surveyed_at / quote.sent_at / quote.approved_at / scheduled_at / completed_at`）按契约文案拼 6 条，不新增历史表。
- `ServiceBookings.jsx` `STATUSES` 加 `surveyed`；`serviceTone.js` 加 `surveyed: 'indigo'`（契约 PILL 第 2 格 indigo）；`AdminSlotPicker.jsx` 用 `fmtCalgaryDay/Hour`；页面所有时间用 `fmtCalgary`。
- 状态标签：`humanizeStatus('survey_scheduled')` 现为 "Survey Scheduled"，契约胶囊写 "Survey booked"——在 `serviceTone.js` 加 `BIRD_STATUS_LABEL` 映射（Survey booked / Surveyed / Quoted / Approved / Install scheduled / Completed）。

客户端（`frontend/`）
- `BirdNettingFlow.jsx`：文案改 i18n（价格段加 "Prices before GST (5%)"，流程第 2/4 步加"看得到照片""30% 定金"，时间选择下加 "All times are Calgary time."），摘要时间用 `fmtCalgary`。
- `ServiceStatusPage.jsx`（鸟网分支）：5 格进度条（Survey/Quote/Approve/Install/Done；映射 `survey_scheduled→0, surveyed→1, quoted→2, approved→3, install_scheduled→3, completed→全勾`）+ 6 态文案（含 ④ 的 `etransfer_email`、⑥ 的 deposit+balance=total）；`surveyed` 态**不显示任何金额**（API 本就不给）；诊断/清洁分支只改时间格式。
- `BirdQuoteApprove.jsx`：读 `?preview=` 透传给 API；增 "What we measured"（周长/鸟窝 + 横向照片条，`alt` 用 "Drone survey photo N"）、明细 4 行 + Subtotal/GST/Total、定金/尾款蓝框、"2-year warranty" 行；`preview` 为真 → 顶部 "Preview — not sent" 横幅、签字区禁用。
- `ServiceSlotPicker.jsx` / `SlotPicker.jsx` / `DiagnosticFlow.jsx` / EV `StatusPage.jsx` / `SurveyConfirm.jsx`：仅把时间格式化换成 `fmtCalgary*`（SPEC：EV 只修时区显示）。
- i18n：新增 key（en + zh 成对）：`svc.bird.intro_gst`, `svc.bird.calgary_hint`, `svc.bird.intro_how_2/4`（改文案）, `svc.status.label.surveyed`, `svc.status.bird.step.{survey,quote,approve,install,done}`, `svc.status.bird.{s1,s2,s3,s4,s5,s6}.{title,body}`（按契约 C 数组逐条）, `svc.bird.quote.measured`, `svc.bird.quote.perimeter`, `svc.bird.quote.nests_found`, `svc.bird.quote.photos_caption`, `svc.bird.quote.netting_line`, `svc.bird.quote.nest_line`, `svc.bird.quote.subtotal`, `svc.bird.quote.gst`, `svc.bird.quote.deposit_box`, `svc.bird.quote.warranty`, `svc.bird.quote.preview_banner`。**通知保持纯英文（不动）。**

### 3.10 UI 规范折叠（ui-ux-pro-max 审查要点，契约不改样式）
- 对话框：`role="dialog" aria-modal="true" aria-labelledby`，打开时焦点进 "Back"，Esc 关闭，关闭后焦点回 "Send quote…"。
- 步进条 `<ol>` + `aria-current="step"`；完成/当前/未到不只靠颜色（勾/数字/粗体已在契约中）。
- 所有输入有 `<label>`；错误信息贴近字段（改卷原因缺失直接在琥珀框下显示）；异步按钮 `disabled` + 文案变化；所有可点元素 `cursor-pointer`；按钮最小高 44px（契约 `py-2.5/py-3` 已满足）。
- 照片 `<img alt>`、`loading="lazy"`；`prefers-reduced-motion` 由契约 CSS 已覆盖；正文 ≥ 16px 手机端（契约 `text-sm` 在手机壳内——保持契约，不改）。

### 3.11 环境与部署（SERVERS.md ID1 vultr-vps；规则 4 公网生产在 BaoTa VPS；无新端口、无新服务，不触碰放置规则）
T5 镜像（PowerShell，经 Git Bash ssh alias `vultr-vps`；**绝不在本机 shell 里写密码**）：
```
1  .\scripts\db-backup.ps1                                     # 本地库先备份到 .\backups\（可回退）
2  ssh vultr-vps "cd /www/wwwroot/evquote.khtain.com/fft-evquote-helper && docker compose -f docker-compose.vps.yml exec -T db pg_dump -U <DB_USER> --clean --if-exists <DB_NAME>" > .\backups\prod-mirror-<ts>.sql
3  docker compose stop backend                                  # 断开连接才能整库覆盖
4  .\scripts\db-restore.ps1 -File .\backups\prod-mirror-<ts>.sql   # --clean 已含 DROP/CREATE 语句
5  （可选）scp -r vultr-vps:.../uploads/services ./uploads/services   # 客户照片/品牌 logo 本地可见
6  确认 docker-compose.yml 的 NOTIFY_REDIRECT: "on" 已写死 → docker compose up -d --build backend
   entrypoint 自动 alembic upgrade head（655efc445c97 → c7d8e9f0a1b2）
7  docker compose exec backend python -c "from app.services.notification_service import notify_redirect_enabled as f; print(f())"  必须 True，否则停
8  Admin 登录 admin / 生产密码（MEMORY）；在 SVC-2026-0001 上走完整流程；所有邮件/短信到 Kuo 并带 [REDIRECTED] 标记
```
T6 部署（三端同步铁律）：本地 commit → `git push origin main`（**Kuo 自己终端**，沙箱够不到 GitHub）→ `ssh vultr-vps`：先 `pg_dump` 生产全量到 `/root/backups/evquote-full-<ts>.sql`（枚举扩容不可回滚，备份是唯一安全网）→ `git reset --hard origin/main` → 生产 `.env` **不**设 `NOTIFY_REDIRECT`（默认 off）→ `docker compose -f docker-compose.vps.yml up -d --build`（backend entrypoint 跑迁移）→ `docker compose ... exec backend alembic current` = `c7d8e9f0a1b2` → 后台打开 SVC-2026-0001 确认仍是 "Survey booked" 且勘测时间显示 `Fri, Oct 9, 8:00 AM MDT` → **不点任何会通知的按钮**。Nick 的真实时间由 Kuo 亲自告知（决策 9）。

## 4. Rejected (cheaper) alternatives
- **容器 `TZ=America/Edmonton` 代替代码修**：一行配置，但隐式、不可测、易被删；SPEC 明确要求显式 zoneinfo。
- **设计两遍 ①（载荷接口：草稿/已发送的真相在哪）**
  A. `booking.status` 唯一阶段真相 + `quote.sent_at` 时间戳（**选 A**）：催单/看板/步进条/公开可见性全部已经按 `booking.status` 工作；`sent_at` 直接给契约要的 "Quote · sent Oct 9, 3:12 PM MDT"；零枚举改动。
  B. `quote_status` 加 `draft/sent`，`booking.status` 由它推导：二次不可回滚枚举扩容；两处真相要同步；`approved` 已在 quote_status 里造成三态耦合。
- **设计两遍 ②（重定向放哪）**
  A. 传输层 `send_email/send_sms`（2 处）：最少改动，但 `Notification.recipient` 记真实客户而实际发到 Kuo——审计行撒谎，测试也无法从行里断言重定向发生。
  B. 记录层 4 处调一个 helper（**选 B**）：行记录实际收件人 + 正文标原收件人；催单路径（收件人已是 Kuo）自然 no-op。
- **后台内嵌一份客户报价页做预览**：两个 Vite app 不共享组件，必漂移；契约要求"exactly this page"。
- **勘测结果独立表**：1:1、删除测试不过。
- **把 GST 存进 `service_pricing` 设置可改**：SPEC 钉死 5%，不做可配置；常量在 `money.py`。
- **给 `POST /quote/send` 加 `confirm: true` 字段**：二次确认是 UI 职责；后端的保护是"必须有草稿 + 状态 surveyed"。

## 5. Components, data contracts, test seams & ticket split

### 5.1 模块与测试接缝（每模块一个接缝，测外部行为）
| 模块 | 接口（调用方须知） | 测试接缝 | 测试文件 |
|---|---|---|---|
| `app/utils/money.py` | §3.3 纯函数；Decimal 进出；HALF_UP；不变量 | 函数直接调用 | `backend/tests/test_money.py`（pytest，断言级：契约向量 1896/94.80/1990.80/597.24/1393.56；`599→29.95/628.95/188.69/440.26` 验证 HALF_UP 与互补；`suggested_rolls(0)=0,(1)=1,(100)=1,(101)=2,(230)=3`；诊断 2.5h×179=447.50→22.38/469.88） |
| `app/utils/timefmt.py` | §3.4；naive 视 UTC | 函数直接调用 | `backend/tests/test_timefmt.py`（`2026-10-09T14:00Z → "Fri, Oct 9, 8:00 AM MDT"`；`2026-01-15T16:00Z → "... 9:00 AM MST"`；naive 输入；`calgary_date_iso` 晚间跨日） |
| `notification_service._apply_redirect` + 4 记录函数 | ON/OFF 语义、目标、标记文案、no-op 规则 | 记录函数（stub `send_email/send_sms`，查 `Notification` 行） | `backend/tests/test_notify_redirect.py`（standalone，同 `test_nudge_service.py` 风格：ON→行 recipient = Kuo 且 content 含 `[REDIRECTED`；OFF→真实；to 已是目标→不加标记；邮件主题前缀） |
| `service_booking_flow` 鸟网 5 个函数 | §3.6 前置/副作用/通知 | HTTP（admin + public 端点，live stack） | `backend/tests/test_services_v3.py::test_bird_netting_quote_and_approve` 重写为新流程 + 4 个新用例：改期勘测 200；草稿期 public status 无 `quote`、quote 端点 404、`?preview=` 有效令牌 200 带 `preview:true`；rolls≠建议且无 reason→400；`/status` 跳 quoted→400；approve 后 `deposit_amount + balance_amount == total` |
| `nudge_service` 分类表 | `(bird_netting, surveyed) → ours` | 已有哨兵 | `test_nudge_service.py::test_service_classify_exhaustive`（不改断言，必须绿） |
| 前端两 app | 契约 1:1 | tester 真实浏览器逐阶段点一遍（MEMORY 教训：静态检查会漏） | 验收清单在 T3/T4 票内 |

### 5.2 票化拆分（稳妥第一）
| 票 | 交付（端到端） | 阻塞于 | 文件集（独占） | 并行 |
|---|---|---|---|---|
| **T0 地基** | 迁移 + ORM 字段 + `money.py` + `timefmt.py` + `config.notify_redirect` + 4 份 compose 注入 `NOTIFY_REDIRECT` + `nudge_service` 改 import `CALGARY_TZ`（仅这一行）+ 两份纯函数测试绿；`alembic upgrade head` 在本地库通过且 `downgrade` 可跑（枚举值除外） | — | `backend/migrations/versions/c7d8e9f0a1b2_bird_survey_quote_gst.py`(新), `backend/app/models/models.py`, `backend/app/utils/money.py`(新), `backend/app/utils/timefmt.py`(新), `backend/app/config.py`, `backend/app/services/nudge_service.py`(仅 L32 import), `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.vps.yml`, `docker-compose.test.yml`, `backend/tests/test_money.py`(新), `backend/tests/test_timefmt.py`(新) | 串行，最先 |
| **T1 鸟网后端 + 三线 GST** | §3.6/3.7/3.8 全部；旧 `/quote` 删除；mock 种子更新（鸟网行补勘测结果/含税金额/`sent_at`；新增一条 `surveyed` 草稿态 `MOCK-BN-12`；3 张 1×1 PNG 写到 `uploads/services/mock-survey-{1..3}.png` 作为照片）；`test_services_v3.py` 新流程绿；`test_nudge_service.py` 哨兵绿 | T0 | `backend/app/services/service_booking_flow.py`, `backend/app/api/v1/admin/services.py`, `backend/app/api/v1/public/services.py`, `backend/app/services/nudge_service.py`(仅分类表一行), `backend/app/services/bootstrap_service.py`(仅三条默认文案), `backend/scripts/mock_data.py`, `backend/tests/test_services_v3.py` | **PARALLEL-SAFE 与 T2**（文件集不相交；T1 只调用 `notify_service`/`fmt_calgary` 既有签名，T2 不改任何签名） |
| **T2 全局重定向 + 全线 Calgary 时间** | §3.5 + §2.4 的 10 处时间替换（`service_booking_flow.py` 内 3 处由 T1 顺手做，T2 不碰该文件）；`test_notify_redirect.py` 绿；`test_nudge_service.py` 仍绿（若某用例在 `NOTIFY_REDIRECT=on` 容器里因收件人被重定向而红，正确修法是该用例同时 patch `notif_svc.get_settings`，**不许改断言**） | T0 | `backend/app/services/notification_service.py`, `backend/app/services/booking_flow.py`, `backend/app/api/v1/admin/installations.py`, `backend/app/api/v1/admin/surveys.py`, `backend/app/api/v1/admin/quotes.py`, `backend/tests/test_notify_redirect.py`(新), `backend/tests/test_nudge_service.py`(仅 settings patch) | PARALLEL-SAFE 与 T1 |
| **T3 后台阶段页** | §3.9 后台全部；6 阶段用 mock 行 `MOCK-BN-06/12/07/08/09/10` 各一条真实点过；发送确认对话框键盘可达；时间全是 Calgary | T1 | `admin/src/pages/services/ServiceBookingDetail.jsx`, `admin/src/pages/services/BirdBookingDetail.jsx`(新), `admin/src/components/services/bird/*.jsx`(新 8 个), `admin/src/components/services/AdminSlotPicker.jsx`, `admin/src/pages/services/ServiceBookings.jsx`, `admin/src/utils/serviceTone.js`, `admin/src/utils/calgaryTime.js`(新) | **PARALLEL-SAFE 与 T4**（`admin/` 与 `frontend/` 不相交；API 已由 T1 钉死） |
| **T4 客户端页** | §3.9 客户端全部 + i18n en/zh 成对无缺 key；6 态进度页、报价页（含预览横幅）、预约页文案 | T1 | `frontend/src/pages/service/BirdNettingFlow.jsx`, `frontend/src/pages/service/BirdQuoteApprove.jsx`, `frontend/src/pages/service/ServiceStatusPage.jsx`, `frontend/src/pages/service/DiagnosticFlow.jsx`, `frontend/src/pages/StatusPage.jsx`, `frontend/src/pages/SurveyConfirm.jsx`, `frontend/src/components/ServiceSlotPicker.jsx`, `frontend/src/components/SlotPicker.jsx`, `frontend/src/i18n/index.js`, `frontend/src/utils/calgaryTime.js`(新) | PARALLEL-SAFE 与 T3 |
| **T5 生产镜像 + 本地验证** | §3.11 镜像 runbook 固化为 `scripts/mirror-prod-db.ps1`（调用 `db-backup.ps1` 再覆盖；ssh 走 alias，不含任何凭据）；在镜像库上用 SVC-2026-0001 走完 6 阶段；所有消息到 Kuo 并带标记；再 `mock_data.py purge && seed` 确认种子在新 schema 下可跑 | T1–T4 | `scripts/mirror-prod-db.ps1`(新), `docs/`(runbook 记录，可选) | 串行 |
| **T6 部署** | §3.11 三端同步；生产备份；`alembic current` 核对；SVC-2026-0001 只读核对 | T5 + 完工核签 | 无代码；`MEMORY.md` 收尾由流水线 close-out 写 | 串行 |

并行上限 2：T1 ∥ T2，然后 T3 ∥ T4。其余串行。

## 6. Risks & red lines
| 红线 / 风险 | 如何满足 |
|---|---|
| **信任边界校验** | 新端点全部 Pydantic + 流程层二次校验（周长>0、窝≥0、和>0、改卷原因、照片 URL 前缀白名单、预览令牌 scope+sub+exp）；`/status` 对鸟网只放行 completed/cancelled；approve 必须 `sent_at` 且不认 preview |
| **草稿不外泄**（SPEC 红线） | 唯一可见性规则 `quote.sent_at is not None`，在 `_booking_public_view` 与 quote 端点两处实施；勘测数字/照片随 quote 一起受控；T1 有端到端用例覆盖 |
| **金额**（项目红线 4） | `money.py` 断言级测试 + HTTP 用例验证 `deposit+balance==total`；舍入显式 HALF_UP；定金快照 |
| **数据丢失** | 迁移纯追加 + 回填；`downgrade` 存在；生产与本地各先 `pg_dump`；枚举值不可回滚已写入 runbook；`revise` 不删 quote 行只清 `sent_at` |
| **不打扰真实客户**（项目红线 1） | 本地 `NOTIFY_REDIRECT` compose 写死 on，T5 第 7 步必须验证 True 才允许操作；T6 后对 Nick 只做只读核对；SPEC 决策 7 生产默认 off，靠发送确认对话框 + "只有发送报价会通知"的文案；旧的即时通知端点删除 |
| **安全** | 预览 JWT 用现有 `SECRET_KEY`，30 分钟过期，独立 scope；无新密钥、无硬编码；上传沿用现有白名单/体积限制 |
| **可访问性** | §3.10：对话框焦点管理、`aria-current`、label、44px、alt、reduced-motion |
| 白名单坑 | 4 份 compose 都加 `NOTIFY_REDIRECT`；T0 验收含 `docker compose config` 查看变量落地 |
| 模板 merge-without-overwrite | 生产 `email_templates.bird_quote_ready` 旧文案不会自动更新（数字正确、缺 "(incl. GST)"）；T6 后 Kuo 在 Settings 把三条模板"重置为默认"或手改——写进 T6 清单 |
| 看板口径 | `services_dashboard` 鸟网 `revenue_this_month` 改用 `quote.subtotal`（不含税，与 EV finance 口径一致），`outstanding_quote_value` 用 `total`——T1 内一行 |
| 催单哨兵 | `surveyed` 同时进 `BIRD_TRANSITIONS` 与分类表，否则 `test_service_classify_exhaustive` 红 |
| 旧 UI 字符串 | `ServiceBookings.jsx` STATUSES、`serviceTone.js` 不加 `surveyed` 会显示灰色/漏筛——T3 必做 |
| 本地 `.env` 真实凭据 | 正因为如此，T5 第 7 步是硬闸；测试 compose 另有 SMTP/Twilio 置空双保险 |
| cmm | 本设计基于 `.cmm/REPORT-2026-07-29.md`（催单后）；本轮完成后 `/cmm` 重建 |

## 7. ADRs recorded
已写入 codebase-memory（project `F-claude-vs-projects-fft-evquote-helper`，`manage_adr`）：
- **ADR-015** 鸟网阶段真相 = `booking.status`，草稿 = `quote.sent_at IS NULL`；拒绝扩 `quote_status` 枚举。
- **ADR-016** 三条新线金额统一走 `app/utils/money.py`（Decimal、HALF_UP、GST 5%、定金 30% 快照）；历史报价不补税（gst=0 诚实记录）。
- **ADR-017** 全局 `NOTIFY_REDIRECT` 放在通知记录层（4 个记录函数首行），不放传输层；复用催单的两个目标设置；本地 compose 写死 on，生产默认 off。
- **ADR-018** 对客时间统一 `timefmt.fmt_calgary`（显式 `America/Edmonton`），前端 `Intl` `en-US` + `timeZone`；禁止无参 `astimezone()` 进通知。
- **ADR-019** 鸟网后台通用 `/status` 端点只放行 completed/cancelled，阶段推进只走专用动作端点；预览客户页用 30 分钟 scope-限定 JWT 而非复制页面。

## 8. Open questions for Kuo — 全部已决（Gate 2，2026-10-05，Kuo 批准，均取设计默认值）
**已决结果**（下方 1–5 为原提问，保留作上下文）：
1. **已决**：短信/邮件时间格式用逗号 `Fri, Oct 9, 8:00 AM MDT`（GSM-7 安全，不触发 UCS-2 双倍计费）；**网页保留 "·"**（`Fri, Oct 9 · 8:00 AM MDT`，与冻结契约一致）。§3.4 里前端 JS 样例（输出逗号）据此作废，网页各处的精确格式见 STEPS.md T3/T4 的"时间格式表"。
2. **已决**：预览令牌 30 分钟有效 —— 可以。
3. **已决**：鸟网"改勘测时间"复用现有 `service_scheduled` 模板，不另造 `bird_survey_scheduled`。
4. **已决**：T5 镜像时 `uploads/` 随数据库一并镜像。
5. **已决**：迁移回填历史报价 `sent_at = created_at`（无需保留"未知"）。

（原提问如下，保留供追溯）
1. **【价格/性能折中·短信字符集】** 契约通知样例用了中点 "·"（`Fri, Oct 9 · 8:00 AM MDT`）。"·" 不在 GSM-7 字符集，Twilio 会把整条短信切成 UCS-2（每段 70 字符而非 160），现有短信约 120–150 字符会从 1 段变 2 段，**每条短信费用翻倍**。建议：短信与邮件用逗号 `Fri, Oct 9, 8:00 AM MDT`（本设计默认），网页 UI 保留 "·"（与契约一致）。**原样实现要：接受短信双倍计费；简化成逗号只要：改 §3.4 一个字符串。** 请拍板；若坚持原样，`fmt_calgary` 改用 "·" 即可。
2. **预览令牌有效期 30 分钟**是否够用（后台页每次刷新都会重新生成，过期只需重新点 Preview）？
3. 鸟网"改勘测时间"复用现有 `service_scheduled` 模板（"Appointment confirmed for …"），不另造 `bird_survey_scheduled` 第二封信（延续 MEMORY 2026-07-23 的决定）——可接受？
4. T5 镜像是否同步 `uploads/`（生产客户照片 + 品牌 logo）？不同步则本地看镜像单的客户自传照片会 404，但对本次验证无阻碍。
5. 迁移回填把历史报价的 `sent_at` 设为 `created_at`（旧代码保存即发送，语义等价）——确认无需保留"未知"。

## Review
> Reviewer（Sonnet）· 2026-10-05 · 审对象：Gate 2 已批准的本设计。依据：SPEC / CONTEXT / MEMORY / 项目 CLAUDE.md / `.cmm/REPORT-2026-07-29.md` / 冻结契约 `design/mockups/v1.html` / 全部将被触碰的源文件（逐一读过，含 compose、迁移、测试、前端）。
> **结论：无 BLOCKER。** 发现 **1 处红线缺口（R1）**——设计所称"4 个记录函数是唯一发信出口"不成立——已**直接并入 STEPS.md 的 T2**（改动机械、不改架构，无需回炉）；其余为精简与精度修订。**STEPS.md 与本设计冲突之处以 STEPS.md 为准**，差异全部列在下面。

### A. 红线核查
| 红线 | 结论 |
|---|---|
| 不给真实客户（Nick `SVC-2026-0001`、Raju `FFT-2026-0002`）发任何消息 | **缺口 → 已补（R1）**。其余成立：本地 compose 写死 `"on"`、T5 硬闸、T6 对 Nick 只读核对。 |
| 草稿不外泄 | 成立。全仓只有 `public/services.py` 两处读 `BirdNettingQuote`（grep 核实）；可见性规则唯一 `sent_at is not None`；`/approve` 同守卫；预览令牌 scope+sub+exp，且与管理员 JWT 互不通用（令牌 `sub` 是 booking UUID，`get_current_admin` 按 `AdminUser` 查必空）。 |
| 金额断言测试 | 成立并加强：`test_money.py` 字面值向量（含 HALF_UP 与 HALF_EVEN 结果不同的 `100.10→5.01`、`628.95→188.69`）+ HTTP 契约向量（230 ft/3 卷/1 窝 → 1896.00 / 94.80 / 1990.80 / 597.24 / 1393.56；只断言 `deposit+balance==total` 会在二者同错时仍通过，故断言字面值）+ 发票行项目求和测试（沿用 `test_invoice_items.py` 写法，防重演 Raju 漏行事故）。 |
| compose 环境白名单 | 成立：4 份都加；`"on"` 必须带引号（YAML 裸 `on` 会被解析成布尔）；验证一律 `config \| Select-String`（无过滤的 `docker compose config` 会展开 `.env` 真实密钥）。现有测试只断言 `template_name`、不断言 `recipient`，测试 compose 写死 `on` 不会误伤。 |
| 不可逆枚举迁移前备份 | 成立：T0 本地备份；T5 二进制安全备份（见 R6）；T6 生产 `pg_dump -Fc` + 体积/魔数校验 + `git reset --hard` 前预检（VPS 无领先提交、无脏文件）。 |
| 信任边界 | 成立并加强：新端点全部流程层 400 校验（含上限常量、照片 URL 白名单正则、状态前置）。 |
| 数据丢失 | 成立；新增：取消订单 / 标记完工两个不可逆动作加确认框；镜像脚本的覆盖步骤要求键入 `MIRROR`。 |
| 可访问性 | 成立；契约未达标处按"微调白名单（颜色）"修正：步进条未到步骤文字 `slate-400→slate-500`（对比度 2.6:1 不达 AA）、状态加 sr-only 文本。 |

### B. 设计修订（均已写入 STEPS.md）
- **R1【红线缺口，已补】** `backend/app/api/v1/admin/case_extras.py:97` 的 `POST /admin/notifications/{id}/resend` 直接 `send_email(to_email=payload.to_email or n.recipient, ...)`，绕过 `_apply_redirect`。T5 镜像后本地库带有 Raju（真实客户）与 Nick 的历史通知行，本地 `.env` 又是真实 SMTP 凭据——后台点一次 Resend 就会真发给真实客户。修法：resend 端点在 `send_email` 前同样走 `_apply_redirect`（T2.5）；T2 末尾做全仓 `send_email(`/`send_sms(` 调用点盘点，**必须恰好 5 处**；T5 硬闸除读开关外再加行为探针（真调 `_apply_redirect` 看输出）。可选加固（建议顾问咨询①评估）：传输层 fail-closed 守卫。
- **R2 票序：并行全部降为串行**，顺序 **T0 → T2 → T1 → ⟦咨询①⟧ → T3 → T4 → T5 → ⟦咨询②⟧ → T6**（T1 增加阻塞边 T2）。文件集虽不相交、接口已钉死，但共享可变夹具：① T1 的实机验证会在带真实 SMTP/Twilio 的 dev 栈上触发通知，而 T2 才让 `NOTIFY_REDIRECT` 生效，T2 又不依赖 T1，先做免费；② `mock_data.py purge/seed` 会删掉名字带 `Mock-` 的行，与 T2 的 DB 测试同库相撞；③ T3/T4 的验收会推进同一批 mock 行（T3 点 Send 会把 `MOCK-BN-12` 从草稿推到已报价，而 T4 需要它仍是草稿来证明"草稿阶段客户看不到任何金额"）。
- **R3** `notify_redirect_enabled()` 定义在 `notification_service.py`（`config.py` 只放字段），便于 T5 硬闸引用、测试只需 patch 一个 `get_settings`。
- **R4 哨兵顺序** DB 枚举值在 T0 迁移里加；Python 侧 `ServiceBookingStatus.surveyed` 推迟到 T1，与 `BIRD_TRANSITIONS`、分类表一行同票落地——否则 T0 之后 `test_service_classify_exhaustive`（哨兵 2）变红。`models.py` 因此同时出现在 T0、T1 文件集（串行，无冲突）。
- **R5 漏掉的枚举消费者** `admin/src/pages/Dashboard.jsx` 的 `BIRD_STAGES`（流程条）写死状态列表，`surveyed` 订单会从流程条里消失——T3 加一行。
- **R6 镜像机制** 设计 §3.11 用 PowerShell `>` 重定向和 `db-backup.ps1` 的 `| Out-File`：Windows PowerShell 5.1 会把文本管道重编码（`>` 产出 UTF-16；`—`、`→` 等非 ASCII 会被损坏），备份与镜像都不可信。改为：容器内 `pg_dump -Fc` → `scp` / `docker compose cp`（二进制安全）→ `pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction`；`uploads/` 用远端 `tar` + `scp` 单文件再解包（避免 `uploads/uploads` 嵌套）；覆盖前再备一份本地 `-Fc`。`db-restore.ps1` 不再使用。
- **R7 契约保真** ① 契约时间轴"Install scheduled"的事件时间无存储字段（`scheduled_at` 是安装时刻而非排期时刻）——详情端点加 `install_booked_at`（最新 `bird_install` Appointment 的 `created_at`）；② 网页时间格式因决议 1 与 §3.4 JS 样例矛盾——STEPS 给出逐处精确格式表（含 `fmtCalgaryShort`，网页用 "·"，通知用逗号）。
- **R8 旧数据** 迁移前的已报价行没有勘测结果：`survey: null` 取 `surveyed_at is None`；`admin_save_bird_quote_draft` 在 `survey_perimeter_ft is None` 时 400（否则 `ceil(None/100)` 崩溃）；后台对"`surveyed` 且无勘测结果"的订单显示录入表单。生产真实单只有 Nick（无 quote），受影响的只是 MOCK 行。
- **R9 校验形态与上限** 流程层统一抛 400（Pydantic 约束会给 422，与 §3.7 "400" 不符）；加上限常量（周长 ≤ 50000 ft、卷/窝 ≤ 1000、照片 ≤ 30）防止 `Numeric(10,2)` 溢出变 500；照片 URL 必须匹配 `^/uploads/services/[A-Za-z0-9_-][A-Za-z0-9._-]*$`（挡 `..` 与外链）。
- **R10 看板** `outstanding_quote_value` 额外要求 `sent_at is not None`（草稿不算未结报价）；`revenue_this_month` 用 `subtotal`（同设计 §6）。
- **R11 新增两个纯函数接缝**（红线驱动，同 `test_invoice_items.py` 风格）：`bird_invoice_items(quote)`（并掉 `approve`/`completion` 里重复的两段行项目代码，测"行项目之和 == subtotal"）与预览令牌 `verify_preview_token`（有效 / 错 booking / 无 scope / 过期 / 乱码）。`approve_bird_quote` 的 PDF 取 `quote.gst_rate`（快照），不写死 5.0——否则历史 0 税报价会印错税率。
- **R12 测试基建** ① 每个 import `app.*` 的新测试文件必须加进 `docker-compose.test.yml` 的 `--ignore` 清单（否则整个 pytest 收集中止）——T0 一次性预加；② 无 pytest 的 backend 镜像里纯函数测试按 `test_nudge_service.py` 写法（无 pytest import + `__main__` 运行器，`python -m tests.<名>`）；③ `test_services_v3.py` 顶层 `from app...` 使其在测试镜像里无法收集（现被 `--ignore`）：把两处 import 挪进 `test_cleaning_tier_resolution` 并 `importorskip`，T1 去掉该 `--ignore`，鸟网 HTTP 测试因此在 SMTP/Twilio 置空的隔离测试栈里可跑；④ 重定向测试断言记录函数**返回的 `Notification` 对象**（不查表）。
- **R13 数据丢失/可访问性小修** 取消订单、标记完工（发尾款发票，终态）加 `window.confirm`；步进条对比度；`sr-only` 状态文本；预览/Send 按钮在"未保存草稿"时禁用。
- **R14 发布** T6 提交只用显式路径（工作区有未跟踪的 `.playwright-mcp/`、`image.png`），不用 `git add -A`；T6 增加 `SECRET_KEY` 长度检查（只打印长度）与"部署后 30 分钟内无新增通知"的零通知证明；避开 cron 的 16:00–17:10 UTC。

### C. 过度设计删除清单（ponytail）
| # | 删除/简化 | 更便宜的替代 |
|---|---|---|
| D1 | `BirdQuoteMoney` dataclass + `bird_quote_money()`（只有 `admin_save_bird_quote_draft` 一个调用方） | 在该函数里直接 `with_gst` + `deposit_split` 三行；`money.py` 只留 `to_money / with_gst / deposit_split / suggested_rolls` |
| D2 | 前端 `fmtCalgary(iso, opts)` 的 `opts` 展开（无人使用的投机参数） | 固定签名的 4 个函数（`fmtCalgary / fmtCalgaryShort / fmtCalgaryDay / fmtCalgaryHour`） |
| D3 | `CompletedCard.jsx`（6 行 JSX 的独立文件） | 内联进 `BirdBookingDetail.jsx`（bird/ 组件 7 个而非 8 个） |
| D4 | T5 的 `docs/` runbook（设计标"可选"） | STEPS.md 本身就是 runbook，删 |
| D5 | `scripts/mirror-prod-db.ps1` | 保留（破坏性覆盖需要护栏），但单一用途、线性、仅 `-DryRun` 一个开关 |
| 保留 | 预览 JWT（台阶 5，复用已装 jose + `decode_token`）、`sent_at` 而非枚举（ADR-015）、勘测列放 `service_bookings`、复用公开上传端点、记录层重定向 | 均已论证不可再降 |

### D. SPEC Out of Scope 核对
未违反：催单只加一行分类（阈值/逻辑不动；T0 对 `nudge_service.py` 仅换一处 import）；迁移回填只给**新列**填值，金额/发票/通知记录不改（Kuo 决议 5 已确认）；无照片逐张勾选、无无人机导入；EV 文件（`booking_flow.py` / `installations.py` / `surveys.py` / `quotes.py`）只换时间格式化表达式，STEPS 明令"不得改动其余任何一行"；通知保持纯英文；全程不向真实客户发任何消息。

### E. 票拆分核对
所有并行标记已降级（见 R2）。T0 因 `ServiceBookingStatus.surveyed` 推迟（R4）、`docker-compose.test.yml` 的 `--ignore` 预加（R12）而与 T1 共享 `models.py` / `docker-compose.test.yml`——串行，无冲突。T2 新增文件 `case_extras.py`（R1）。T3 新增 `Dashboard.jsx`（R5）。T4 新增 `frontend/src/utils/renderBold.jsx`（i18n 句内加粗，4 行，替代约 25 个碎 key）。

### F. 已接受的残余风险
- 管理员 revise 与客户签字在同一毫秒竞争（无行锁）：单管理员低并发，后果是需要人工修一行，不加 `FOR UPDATE`。
- 预览链接在 30 分钟内对持链接者可见草稿（决议 2 已接受）。
- 契约时间轴首行"survey 时间"后缀：改期/排装后 `scheduled_at` 被覆盖，无存储来源——只在 `survey_scheduled` 阶段显示该后缀。
- 契约客户预约页 "(MDT)" 在冬季是 MST：按设计 §3.9 用 "All times are Calgary time."。
- 后台服务预约流程之外的页面（CaseDetail 等）仍用浏览器本地时间格式（Kuo 的浏览器在 Calgary）；本轮不动。
- 顺带发现、不在范围：`utils/reference.py::current_year()` 取 UTC 年（除夕晚间编号年份会错）。

## GATE 1 verdict (fable-advisor, 2026-10-05) — APPROVE-WITH-CHANGES

### ADR-020 Transport-layer fail-closed guard when NOTIFY_REDIRECT=on
(manage_adr write_error this session — recorded here; re-sync to the ADR store at close-out.)
Addendum to ADR-017. When NOTIFY_REDIRECT=on, `email_service.send_email` / `sms_service.send_sms` raise RuntimeError for any recipient other than NUDGE_REDIRECT_EMAIL / NUDGE_REDIRECT_SMS (strip+casefold), as their first statements (before the SMTP/Twilio configured checks and before the twilio import). Redirect stays at the record layer (audit row truthful); transports only refuse, so a bypassing call site fails loudly instead of delivering. Must land before T5 Step 5.0. Rejected: grep inventory only; redirect inside transports; moving notify_redirect_enabled into config. Note: nudge `redirect_enabled()` is `!= "off"` (default ON) vs `notify_redirect_enabled()` `== "on"` (default OFF) — intentional, do not harmonize.

Required changes: (1) guard in email_service.send_email; (2) guard in sms_service.send_sms; (3) test_notify_redirect tests 9/10 (non-target → RuntimeError containing NOTIFY_REDIRECT; target incl. "  COOL@Khtain.com " → passes through to the "not configured" error), runner prints "All 10 notify-redirect tests passed."; re-run send-site inventory (5) and test_nudge_service (13). Optional: Step 5.7 probe send_email to probe@example.com expecting RuntimeError; no live SMS probe.
Accepted LOW: admin_send_bird_quote re-check of roll override reason vs current suggested_rolls (one-line re-check in send — orchestrator: do it).

## ADR-021 (2026-10-05, orchestrator, Kuo delegated "你来安排") — Alberta permanent UTC-6; display "Calgary time", no abbreviation
Fact (verified): Alberta Bill 31 / Official Time Act — permanent UTC-06 from 2026-11-01 (clocks no longer fall back). IANA tzdata 2026c encodes America/Edmonton = UTC-6 forever after 2026-11-01 with abbreviation "CST". Backend container system zoneinfo is 2026c (correct); pip tzdata 2025a and Node/browser ICU 2025b are stale (would show UTC-7 "MST" in winter → off by one hour).
Decision:
1. All customer-facing and admin time strings drop the tz abbreviation and say "Calgary time": notifications/PDF "Fri, Oct 9, 8:00 AM (Calgary time)" (comma style, GSM-7); web "Fri, Oct 9 · 8:00 AM" with the existing "All times are Calgary time" note where the contract has it (contract "MDT" suffix → "(Calgary time)" is a copy-whitelist tweak). Reason: "CST" reads as US Central to customers; abbreviation changes mid-year.
2. Backend: keep zoneinfo America/Edmonton; bump pip `tzdata` in backend/requirements.txt to a release containing IANA 2026c or later (verify with tzdata.IANA_VERSION) so correctness does not depend on the image's system tzdata.
3. Frontend (admin + frontend calgaryTime.js, byte-identical): do not trust the browser's ICU tz data for future instants — for instants >= 2026-11-01T08:00:00Z format with timeZone 'Etc/GMT+6' (fixed UTC-6), else 'America/Edmonton'. One constant + comment `// Alberta Official Time Act: permanent UTC-6 from 2026-11-01`.
4. Tests: test_timefmt case 6 expectation updated to the legal reality (2026-11-01 08:30Z → "Sun, Nov 1, 2:30 AM (Calgary time)"); add a case far in the future (e.g. 2027-01-15 15:00Z → "9:00 AM") and a node check of the JS util on both sides of the boundary. This is a spec correction driven by law, not loosening a test to pass.
5. Add test_timefmt to the hermetic stack (remove from docker-compose.test.yml ignore list if it is pure) so it is not silently skipped.
Also: zh money display "CA$" → "$" (copy whitelist), consistent with en.

## GATE 2 / completion sign-off (fable-advisor, 2026-10-05) — APPROVE-WITH-CHANGES
### ADR-022 Safe boot upgrade of changed service templates
Changed service templates (`bird_quote_ready`, `service_completed`, `cleaning_subscription_confirm`; email html + SMS body) are upgraded at boot in `bootstrap_service._ensure_service_templates` only when the stored text still equals the previous default (same OLD_* mechanism as `_ensure_message_templates`, with flag_modified); admin-edited rows are left to Settings. Context: merge-without-overwrite left prod rows on pre-GST wording; Jinja default Undefined means they render but omit "(incl. GST)" / balance / annual_total; the cleaning email states a pre-tax price against a GST invoice. Rejected: one-off prod SQL on JSONB, a bootstrap overwrite flag, hand-editing the whole-blob templates JSON in Settings, leave-as-is.
### ADR-023 Deploy invariants
Deploy with NOTIFY_REDIRECT off in prod (SPEC 7) and NUDGE_REDIRECT left default-on (prod .env must not contain `NUDGE_REDIRECT=off`). Invariants: -Fc backup validated by PGDMP header + `pg_restore -l` (not a byte threshold), alembic precheck 655efc445c97, zero-notification window check, code rollback only while no row is `surveyed`. Admin timeline omits survey-reschedule rows for now (derivable later from cancelled bird_survey appointments, no schema change).
