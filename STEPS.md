# STEPS: 14 天无动作自动催单（stalled-order nudges）

> Task tier: **CRITICAL** · Skill Manifest (copied verbatim from DESIGN.md §0 — implementer/tester
> may invoke ONLY these skills):
> - MANDATORY-INFRA: `cmm`, `codebase-memory`, `ponytail-review`
> - DEV-CONDITIONAL: `ecc:python-patterns`, `ecc:python-testing`, `ecc:postgres-patterns`,
>   `ecc:database-migrations`, `ecc:docker-patterns`, `ecc:deployment-patterns`
> - 无 UI 工作，不含 `ui-ux-pro-max`。
>
> UI contract: none（纯后端 + cron，无前端改动）。
> NO-ADVISOR ZONE: executing these approved steps never triggers an advisor consult (economy
> policy F), except the stuck-escalation condition (policy D). DESIGN.md §0 planned 2 consults:
> one after T2 (redirect single-exit + counting judgement), one at completion sign-off.
>
> 术语见 `CONTEXT.md`：停滞 / 催单 / 球在客户 / 球在我们 / 催单重定向 / 待人工跟进。
> 全部三张票**串行**（DESIGN §5 已声明，复审确认不降级为并行）。
> 所有命令假设本地开发栈已起：`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`，
> backend 容器名记作 `<backend>`（`docker ps` 查真实名，通常 `fft-evquote-helper-backend-1`）。

---

## Ticket 1 — 停滞时钟落地（地基）  [Blocked by: none] [serial]
**Files**: `backend/migrations/versions/<new_revision>.py`（新建）、`backend/app/models/models.py`、
`backend/app/services/service_booking_flow.py`、`backend/app/config.py`、`.env.example`、
`backend/scripts/mock_data.py`

- [x] **Step 1.1** — 生成迁移骨架 — 运行
      `docker exec -w /app <backend> alembic revision -m "nudge_status_changed_at"`
      verify: 命令打印新文件路径，`backend/migrations/versions/` 下出现一个新 `*.py` 文件。

- [x] **Step 1.2** — `backend/migrations/versions/<new_revision>.py` — 把生成的骨架改成：
      `down_revision = "b1c2d3e4f5a6"`；`upgrade()` 依次执行：
      1) `op.add_column("service_bookings", sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()))`
      2) 同上对 `cleaning_subscriptions`
      3) `op.execute("UPDATE service_bookings SET status_changed_at = COALESCE(updated_at, created_at, now())")`
      4) 同上对 `cleaning_subscriptions`
      5) `op.alter_column("service_bookings", "status_changed_at", nullable=False)`
      6) 同上对 `cleaning_subscriptions`
      **必须用 `COALESCE(updated_at, created_at, now())`，不能只写 `= updated_at`**——这两张表在
      `b1c2d3e4f5a6` 建表时 `created_at`/`updated_at` 都没标 `nullable=False`，直接赋值遇到 NULL
      行会导致第 5/6 步 `SET NOT NULL` 失败。`downgrade()` 依次
      `op.drop_column("service_bookings", "status_changed_at")` 和对 `cleaning_subscriptions` 同样操作。
      verify: `docker exec -w /app <backend> alembic upgrade head` 退出码 0；
      `docker exec -w /app <backend> alembic downgrade -1 && alembic upgrade head` 往返无报错。

- [x] **Step 1.3** — `backend/app/models/models.py` — 在 `ServiceBooking` 类的 `updated_at`
      （继承自 `TimestampMixin`）之后新增一行：
      `status_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())`；
      在 `CleaningSubscription` 类同样位置加同一行。
      verify: `docker exec -w /app <backend> python -c "from app.models.models import ServiceBooking, CleaningSubscription; print(ServiceBooking.status_changed_at, CleaningSubscription.status_changed_at)"` 无报错打印出列对象。

- [x] **Step 1.4** — `backend/app/services/service_booking_flow.py` — 顶部 `from datetime import date, datetime`
      改成 `from datetime import date, datetime, timezone`；在 `_next_reference` 函数之前新增：
      ```python
      def _mark_status_changed(obj) -> None:
          obj.status_changed_at = datetime.now(timezone.utc)
      ```
      verify: `docker exec -w /app <backend> python -c "import app.services.service_booking_flow"` 无报错。

- [x] **Step 1.5** — `admin_schedule_booking` 函数 — `booking.status = new_status` 这一行改为：
      ```python
      if booking.status != new_status:
          _mark_status_changed(booking)
      booking.status = new_status
      ```
      verify: `grep -c "_mark_status_changed(booking)" backend/app/services/service_booking_flow.py` = 1。

- [x] **Step 1.6** — `admin_create_bird_quote` 函数 — `booking.status = ServiceBookingStatus.quoted`
      改为同 1.5 的 `if/then` 模式（比较值为 `ServiceBookingStatus.quoted`）。
      verify: 累计命中数为 2。

- [x] **Step 1.7** — `approve_bird_quote` 函数 — `booking.status = ServiceBookingStatus.approved`
      改为同模式（比较值 `ServiceBookingStatus.approved`）。
      verify: 累计命中数为 3。

- [x] **Step 1.8** — `admin_update_status` 函数 — `booking.status = new_status` 改为同模式。
      verify: 累计命中数为 4。

- [x] **Step 1.9** — `cancel_booking` 函数 — `booking.status = ServiceBookingStatus.cancelled`
      改为同模式。
      verify: 累计命中数为 5（`grep -c "_mark_status_changed(booking)"` = 5）。

- [x] **Step 1.10** — `admin_set_cleaning_price` 函数 — `sub.pricing_status = CleaningPricingStatus.quoted`
      改为：
      ```python
      if sub.pricing_status != CleaningPricingStatus.quoted:
          _mark_status_changed(sub)
      sub.pricing_status = CleaningPricingStatus.quoted
      ```
      verify: `grep -c "_mark_status_changed(sub)" backend/app/services/service_booking_flow.py` = 1。

- [x] **Step 1.11** — `admin_set_cleaning_payment` 函数 — `sub.payment_status = payment_status`
      改为：
      ```python
      if sub.payment_status != payment_status:
          _mark_status_changed(sub)
      sub.payment_status = payment_status
      ```
      verify: `grep -c "_mark_status_changed(sub)" backend/app/services/service_booking_flow.py` = 2。
      **不要**改 `create_service_booking` / `create_cleaning_subscription`——新建行的
      `status_changed_at` 由 Step 1.3 的 `server_default=now()` 自动对齐，不需要调用 helper。

- [x] **Step 1.12** — `backend/app/config.py` — 在 `admin_login_block_seconds` 字段之后新增 4 个字段：
      ```python
      nudge_run_key: str | None = Field(default=None, validation_alias="NUDGE_RUN_KEY")
      nudge_redirect: str | None = Field(default=None, validation_alias="NUDGE_REDIRECT")
      nudge_redirect_sms: str = Field(default="+15879669668", validation_alias="NUDGE_REDIRECT_SMS")
      nudge_redirect_email: str = Field(default="cool@khtain.com", validation_alias="NUDGE_REDIRECT_EMAIL")
      ```
      把 `nudge_run_key` 和 `nudge_redirect` 加进已有的 `_blank_str_to_none`
      `@field_validator(...)` 装饰器的字段列表里（与 `admin_notify_email` 等同一个校验器，
      让空字符串环境变量视为未设置）。
      verify: `docker exec -w /app <backend> python -c "from app.config import get_settings; s=get_settings(); print(s.nudge_run_key, s.nudge_redirect, s.nudge_redirect_sms, s.nudge_redirect_email)"` 打印
      `None None +15879669668 cool@khtain.com`（未设置任何 env 时）。

- [x] **Step 1.13** — `.env.example` — 新增一段：
      ```
      # Stalled-order nudges (see SPEC.md / CONTEXT.md). Missing NUDGE_RUN_KEY disables the endpoint
      # (returns 503). Missing/blank/anything-other-than-"off" NUDGE_REDIRECT keeps redirect ON —
      # only the literal value "off" sends nudges to real customers.
      NUDGE_RUN_KEY=
      NUDGE_REDIRECT=
      NUDGE_REDIRECT_SMS=+15879669668
      NUDGE_REDIRECT_EMAIL=cool@khtain.com
      ```
      verify: `grep -c "^NUDGE_" .env.example` = 4。

- [x] **Step 1.14** — `backend/scripts/mock_data.py` — `ServiceBooking(...)` 构造调用（`seed_services`
      函数内）新增一个关键字参数：
      ```python
      status_changed_at=days(-20) if sfx in ("01", "06", "07") else days(offset + 1),
      ```
      放在 `updated_at=days(offset + 1),` 之后一行。
      verify: `grep -n "status_changed_at" backend/scripts/mock_data.py` 命中数 ≥1（本步之后）。

- [x] **Step 1.15** — `backend/scripts/mock_data.py` — `CleaningSubscription(...)` 构造调用（`seed_cleaning`
      函数内）新增：`status_changed_at=days(-70),`（放在 `updated_at=days(-70),` 之后一行——
      三个订阅本来就统一用 `-70`，不需要按 idx 区分）。
      verify: `grep -c "status_changed_at" backend/scripts/mock_data.py` = 2。

- [x] **Step 1.16** — 重新种子并核对 —
      `docker exec -w /app <backend> python - seed < backend/scripts/mock_data.py`（Windows PowerShell：
      `Get-Content backend/scripts/mock_data.py | docker exec -i -w /app <backend> python - seed`）。
      verify:
      `docker exec <db容器> psql -U ev_charger -d ev_charger_quote -c "select reference_number, status_changed_at from service_bookings where reference_number in ('MOCK-DG-01','MOCK-BN-06','MOCK-BN-07');"`
      三行 `status_changed_at` 都是 `2026-07-08 00:00:00+00`（TODAY 2026-07-28 减 20 天；该列是
      `timestamptz`，psql 会打印完整时间戳而不是裸日期，看到这个格式属于验证通过，不是异常）；
      `select reference_number, status_changed_at from cleaning_subscriptions;` 三行都是
      `2026-05-19 00:00:00+00`（减 70 天）。

**Ticket 1 Test plan**: 上面 16 步各自的 verify 已覆盖；额外跑一次现有回归防手滑——
`docker compose -f docker-compose.test.yml --env-file .env up --build --abort-on-container-exit --exit-code-from tests`
（本票没碰任何被这套测试覆盖的行为，应保持全绿，证明没有误改到 `service_booking_flow.py`
其它逻辑）。

---

## Ticket 2 — 催单引擎  [Blocked by: 1] [serial]
**Files**: `backend/app/services/nudge_service.py`（新建）、`backend/app/services/bootstrap_service.py`、
`backend/tests/test_nudge_service.py`（新建）

### 模板种子

- [x] **Step 2.1** — `backend/app/services/bootstrap_service.py` — 在 `SERVICE_SMS_TEMPLATES`
      定义之后新增两个模块级常量：
      ```python
      NUDGE_EMAIL_TEMPLATES = {
          "nudge_admin_digest": {
              "subject": "Stalled-order digest",
              "html": (
                  '{% extends "base.html" %}{% block content %}'
                  '<h2 style="margin:0 0 8px 0;">Daily stalled-order digest — {{ date }}</h2>'
                  '{% if nudged %}<h3 style="margin:14px 0 6px 0;">Nudged today</h3><ul class="muted small">'
                  '{% for n in nudged %}<li>{{ n.ref }} — {{ n.state }} — {{ n.days }}d — #{{ n.count }} — '
                  'intended: {{ n.intended }}{% if n.redirected %} (redirected){% endif %}'
                  '{% if n.admin_url %} — <a href="{{ n.admin_url }}">view</a>{% endif %}</li>{% endfor %}</ul>{% endif %}'
                  '{% if our_side %}<h3 style="margin:14px 0 6px 0;">Waiting on us</h3><ul class="muted small">'
                  '{% for o in our_side %}<li>{{ o.ref }} — {{ o.state }} — {{ o.days }}d'
                  '{% if o.admin_url %} — <a href="{{ o.admin_url }}">view</a>{% endif %}</li>{% endfor %}</ul>{% endif %}'
                  '{% if needs_followup %}<h3 style="margin:14px 0 6px 0;">Needs manual follow-up</h3><ul class="muted small">'
                  '{% for f in needs_followup %}<li>{{ f.ref }} — {{ f.state }} — {{ f.days }}d'
                  '{% if f.admin_url %} — <a href="{{ f.admin_url }}">view</a>{% endif %}</li>{% endfor %}</ul>{% endif %}'
                  "{% endblock %}"
              ),
          },
      }
      NUDGE_SMS_TEMPLATES = {
          "nudge_customer": {
              "body": "{{ brand_name }}\nFriendly reminder — {{ reference_number }}\n"
                      "We're waiting on you to {{ action_text }}.\n{{ link }}",
          },
      }
      ```
      然后新增一个函数，逐字照抄 `_ensure_service_templates` 的结构（merge-without-overwrite，
      靠 `flag_modified`），一段合并 `DEFAULT_EMAIL_TEMPLATES_KEY` 里的 `NUDGE_EMAIL_TEMPLATES`，
      一段合并 `DEFAULT_SMS_TEMPLATES_KEY` 里的 `NUDGE_SMS_TEMPLATES`：
      ```python
      def _ensure_nudge_templates(db: Session) -> None:
          """Seed nudge email/sms templates; merge-without-overwrite (preserves admin edits)."""
          email_row = db.execute(select(SystemSetting).where(SystemSetting.key == DEFAULT_EMAIL_TEMPLATES_KEY)).scalar_one_or_none()
          if email_row:
              changed = False
              for k, v in NUDGE_EMAIL_TEMPLATES.items():
                  if k not in (email_row.value or {}):
                      email_row.value[k] = v
                      changed = True
              if changed:
                  flag_modified(email_row, "value")
                  db.add(email_row)
                  db.commit()
          sms_row = db.execute(select(SystemSetting).where(SystemSetting.key == DEFAULT_SMS_TEMPLATES_KEY)).scalar_one_or_none()
          if sms_row:
              changed = False
              for k, v in NUDGE_SMS_TEMPLATES.items():
                  if k not in (sms_row.value or {}):
                      sms_row.value[k] = v
                      changed = True
              if changed:
                  flag_modified(sms_row, "value")
                  db.add(sms_row)
                  db.commit()
      ```
      **不要忘 `flag_modified`**——这是本项目已经踩过一次的坑（v3.0 的 7 个模板曾因为漏这行
      静默丢失）。最后在 `ensure_defaults()` 里 `_ensure_service_templates(db)` 那一行之后加一行
      `_ensure_nudge_templates(db)`。
      verify: `docker compose -f docker-compose.yml -f docker-compose.dev.yml restart backend`
      （触发 `@app.on_event("startup")` 重跑 `ensure_defaults`），然后
      `docker exec <db> psql -U ev_charger -d ev_charger_quote -c "select value ? 'nudge_customer' from system_settings where key='sms_templates';"`
      返回 `t`；同样查 `email_templates` 的 `nudge_admin_digest` 也返回 `t`。**这两行 SystemSetting
      在本地库里早就存在**（v3.0 就种过），所以这个 verify 恰好复现了当年漏 `flag_modified` 的
      那个 bug 场景——如果验证失败先检查有没有漏 `flag_modified`。

### 引擎模块

- [x] **Step 2.2** — 新建 `backend/app/services/nudge_service.py`，写入模块 docstring + imports：
      ```python
      from __future__ import annotations

      from datetime import datetime, timedelta, timezone
      from typing import Literal, NamedTuple
      from zoneinfo import ZoneInfo

      from sqlalchemy import select, func
      from sqlalchemy.orm import Session

      from app.config import get_settings
      from app.models.models import (
          BirdNettingQuote, Case, CaseNote, CaseStatus, CaseStatusHistory,
          CleaningPaymentStatus, CleaningPricingStatus, CleaningSubscription,
          Notification, NotificationStatus, ServiceBooking, ServiceBookingStatus, ServiceType,
          SystemSetting,
      )
      from app.services.notification_service import (
          _get_system_setting, _templates_env, _with_brand_profile,
          admin_case_url, notify_sms, render_sms_from_db_or_fallback,
          _send_service_email, _send_service_sms,
      )
      from app.services.service_booking_flow import bird_quote_url, cleaning_status_url, service_status_url

      CALGARY_TZ = ZoneInfo("America/Edmonton")
      NUDGE_CUSTOMER_TEMPLATE = "nudge_customer"
      NUDGE_DIGEST_TEMPLATE = "nudge_admin_digest"
      NUDGE_CAP = 3
      NUDGE_INTERVAL_DAYS = 14
      Bucket = Literal["customer", "ours", "none"]


      class StalledTarget(NamedTuple):
          kind: Literal["ev", "diagnostic", "bird_netting", "cleaning"]
          id: str
          reference_number: str
          status_label: str
          stalled_days: int
          clock: datetime
          bucket: Bucket
          customer_name: str
          phone: str | None
          email: str | None
          action_text: str | None
          link: str | None
          admin_url: str | None
      ```
      verify: `docker exec -w /app <backend> python -c "import app.services.nudge_service"` 无报错。

- [x] **Step 2.3** — 追加 EV 分类表（穷举全部 13 个 `CaseStatus`）：
      ```python
      _EV_CLASSIFY: dict[CaseStatus, Bucket] = {
          CaseStatus.pending: "customer",
          CaseStatus.survey_scheduled: "none",
          CaseStatus.survey_completed: "ours",
          CaseStatus.quoting: "ours",
          CaseStatus.quoted: "customer",
          CaseStatus.customer_approved: "ours",
          CaseStatus.permit_applied: "ours",
          CaseStatus.permit_approved: "customer",
          CaseStatus.installation_scheduled: "none",
          CaseStatus.installed: "customer",
          CaseStatus.completed: "none",
          CaseStatus.cancelled: "none",
          CaseStatus.lost: "none",
      }
      _EV_ACTION: dict[CaseStatus, str] = {
          CaseStatus.pending: "book a site-survey time",
          CaseStatus.quoted: "review and sign your quote",
          CaseStatus.permit_approved: "book your installation time",
          CaseStatus.installed: "settle the final balance",
      }
      ```
      verify: `python -c "from app.services.nudge_service import _EV_CLASSIFY; from app.models.models import CaseStatus; assert set(_EV_CLASSIFY) == set(CaseStatus); print('ok')"` 打印 `ok`。

- [x] **Step 2.4** — 追加服务单分类表（穷举诊断 5 态 + 鸟网 7 态，键为 `(ServiceType, ServiceBookingStatus)`）：
      ```python
      _SERVICE_CLASSIFY: dict[tuple[ServiceType, ServiceBookingStatus], Bucket] = {
          (ServiceType.diagnostic, ServiceBookingStatus.submitted): "customer",
          (ServiceType.diagnostic, ServiceBookingStatus.scheduled): "none",
          (ServiceType.diagnostic, ServiceBookingStatus.in_progress): "none",
          (ServiceType.diagnostic, ServiceBookingStatus.completed): "none",
          (ServiceType.diagnostic, ServiceBookingStatus.cancelled): "none",
          (ServiceType.bird_netting, ServiceBookingStatus.submitted): "none",
          (ServiceType.bird_netting, ServiceBookingStatus.survey_scheduled): "ours",
          (ServiceType.bird_netting, ServiceBookingStatus.quoted): "customer",
          (ServiceType.bird_netting, ServiceBookingStatus.approved): "customer",
          (ServiceType.bird_netting, ServiceBookingStatus.install_scheduled): "none",
          (ServiceType.bird_netting, ServiceBookingStatus.completed): "none",
          (ServiceType.bird_netting, ServiceBookingStatus.cancelled): "none",
      }
      _SERVICE_ACTION: dict[tuple[ServiceType, ServiceBookingStatus], str] = {
          (ServiceType.diagnostic, ServiceBookingStatus.submitted): "confirm your diagnostic visit time",
          (ServiceType.bird_netting, ServiceBookingStatus.quoted): "review and sign your quote",
          (ServiceType.bird_netting, ServiceBookingStatus.approved): "settle the deposit so we can schedule your install",
      }
      ```
      verify: 先跑 `python -c "import app.services.nudge_service"` 确认无语法错误；完整穷举断言在 Step 2.13。

- [x] **Step 2.5** — 追加清洁订阅分类表（穷举全部 6 个 `(pricing_status, payment_status)` 组合）：
      ```python
      _CLEANING_CLASSIFY: dict[tuple[CleaningPricingStatus, CleaningPaymentStatus], Bucket] = {
          (CleaningPricingStatus.quoted, CleaningPaymentStatus.unpaid): "customer",
          (CleaningPricingStatus.quoted, CleaningPaymentStatus.paid): "none",
          (CleaningPricingStatus.quoted, CleaningPaymentStatus.refunded): "none",
          (CleaningPricingStatus.pending_quote, CleaningPaymentStatus.unpaid): "ours",
          (CleaningPricingStatus.pending_quote, CleaningPaymentStatus.paid): "ours",
          (CleaningPricingStatus.pending_quote, CleaningPaymentStatus.refunded): "none",
      }
      _CLEANING_ACTION = "complete payment for your cleaning subscription"
      ```
      verify: 语法检查通过（同上命令）。

- [x] **Step 2.6** — 追加纯函数（无 DB）：
      ```python
      def should_nudge(stalled_days: int, sent_count: int) -> bool:
          return sent_count < NUDGE_CAP and stalled_days >= NUDGE_INTERVAL_DAYS * (sent_count + 1)


      def redirect_enabled() -> bool:
          value = (get_settings().nudge_redirect or "").strip().casefold()
          return value != "off"


      def resolve_recipient(is_sms: bool, real_contact: str) -> tuple[str, bool]:
          if not redirect_enabled():
              return real_contact, False
          s = get_settings()
          return (s.nudge_redirect_sms if is_sms else s.nudge_redirect_email), True


      def _calgary_day_bounds_utc(now: datetime) -> tuple[datetime, datetime]:
          local = now.astimezone(CALGARY_TZ)
          start_local = local.replace(hour=0, minute=0, second=0, microsecond=0)
          return start_local.astimezone(timezone.utc), (start_local + timedelta(days=1)).astimezone(timezone.utc)
      ```
      verify: `python -c "from app.services.nudge_service import should_nudge as f; assert (f(13,0),f(14,0),f(27,1),f(28,1),f(42,2),f(56,3))==(False,True,False,True,True,False); print('ok')"` 打印 `ok`。

- [x] **Step 2.7** — 追加三个扫描函数 `_scan_ev(db, now)` / `_scan_services(db, now)` /
      `_scan_cleaning(db, now)`，各返回 `list[StalledTarget]`，只保留 `bucket != "none"`：
      - `_scan_ev`：SQL 用 `select(Case, func.coalesce(func.max(CaseStatusHistory.created_at), Case.created_at)).outerjoin(CaseStatusHistory, CaseStatusHistory.case_id == Case.id).group_by(Case.id)`
        （不必在 SQL 里按状态过滤——`_EV_CLASSIFY` 本就穷举全部 13 态，Python 里判 `bucket=="none"`
        就地跳过即可，避免以后分类表改了要同步改两处 SQL）。`clock` = 查出来的 coalesce 值
        （确保 tz-aware，缺省时 `.replace(tzinfo=timezone.utc)`）。`stalled_days = (now - clock).days`。
        `link = f"{get_settings().frontend_url.rstrip('/')}/quote/status/{case.access_token}"`。
        `admin_url = admin_case_url(str(case.id))`（EV 专属，恒有值）。`customer_name/phone/email`
        取 `case.customer.nickname/.phone/.email`（用 `db.get(Customer, case.customer_id)` 或依赖
        已有的 relationship）。`action_text = _EV_ACTION.get(case.status)`（只有 bucket=="customer"
        才非 None）。
      - `_scan_services`：`select(ServiceBooking)`，按 `(service_type, status)` 查
        `_SERVICE_CLASSIFY`（缺失 key 的组合视为 "none"）。`clock = booking.status_changed_at`。
        `link`：诊断用 `service_status_url(booking.access_token)`；鸟网用
        `bird_quote_url(booking.access_token)`。`admin_url = None`（ctx 契约已声明
        `admin_url: str|None`，服务单没有可复用的后台详情链接）。`action_text =
        _SERVICE_ACTION.get((service_type, status))`。`kind = "diagnostic"` 或 `"bird_netting"`
        按 `service_type`。
      - `_scan_cleaning`：`select(CleaningSubscription)`，按 `(pricing_status, payment_status)`
        查 `_CLEANING_CLASSIFY`。`clock = sub.status_changed_at`。`link = cleaning_status_url(sub.access_token)`。
        `action_text = _CLEANING_ACTION if bucket=="customer" else None`。`admin_url = None`。
      - **防御性降级（三个扫描函数共用同一条规则）**：分类结果为 `bucket=="customer"` 时，
        如果该目标的 `phone` 为空字符串或 `None`，**把 `bucket` 强制改成 `"ours"`**（连带
        `action_text`/`link` 保留原值，反正 "ours" 分支不使用它们；进摘要邮件"球在我们"节，
        而不是尝试发一条注定失败的短信）。EV/服务单/清洁订阅三张表的 `phone` 字段都是
        `NOT NULL`，正常情况下这个分支不会触发，纯属纵深防御——不加这一步的后果是：万一真出现
        空号数据，`_deliver_customer_sms` 会对着 `to_phone=""` 天天调 Twilio、天天记一条
        `failed` 通知，且这条"失败"会被 `_already_attempted_today` 当成"今天试过了"，永远不会
        被人发现也永远不会自愈。
      verify: 语法检查 `python -c "import app.services.nudge_service"` 通过；完整行为由 Step 2.13
      的测试文件验证。

- [x] **Step 2.8** — 追加三个基于 `Notification` 表的查询函数：
      ```python
      def _target_fk_filter(target: StalledTarget):
          if target.kind == "ev":
              return Notification.case_id == target.id
          if target.kind == "cleaning":
              return Notification.cleaning_subscription_id == target.id
          return Notification.service_booking_id == target.id


      def _sent_count(db: Session, target: StalledTarget) -> int:
          return db.execute(
              select(func.count()).select_from(Notification).where(
                  _target_fk_filter(target),
                  Notification.template_name == NUDGE_CUSTOMER_TEMPLATE,
                  Notification.status == NotificationStatus.sent,
                  Notification.created_at > target.clock,
              )
          ).scalar_one()


      def _already_attempted_today(db: Session, target: StalledTarget, now: datetime) -> bool:
          start, end = _calgary_day_bounds_utc(now)
          return db.execute(
              select(func.count()).select_from(Notification).where(
                  _target_fk_filter(target),
                  Notification.template_name == NUDGE_CUSTOMER_TEMPLATE,
                  Notification.created_at >= start, Notification.created_at < end,
              )
          ).scalar_one() > 0


      def _digest_already_sent_today(db: Session, now: datetime) -> bool:
          start, end = _calgary_day_bounds_utc(now)
          return db.execute(
              select(func.count()).select_from(Notification).where(
                  Notification.template_name == NUDGE_DIGEST_TEMPLATE,
                  Notification.created_at >= start, Notification.created_at < end,
              )
          ).scalar_one() > 0
      ```
      verify: 语法检查通过；行为由测试文件验证。

- [x] **Step 2.9** — 追加两个 deliver 函数（**全模块唯一允许调用 `notify_sms` /
      `_send_service_sms` / `_send_service_email` 的两处**）：
      ```python
      def _deliver_customer_sms(db: Session, target: StalledTarget, now: datetime) -> Literal["sent", "failed"]:
          real_contact = target.phone or ""
          recipient, redirected = resolve_recipient(True, real_contact)
          body = render_sms_from_db_or_fallback(
              db, template_key=NUDGE_CUSTOMER_TEMPLATE,
              ctx={"reference_number": target.reference_number, "action_text": target.action_text, "link": target.link},
              fallback="{{ brand_name }}\nFriendly reminder — {{ reference_number }}\nWe're waiting on you to {{ action_text }}.\n{{ link }}",
          )
          if redirected:
              body = f"[→ {target.customer_name} {real_contact}] " + body
          if target.kind == "ev":
              n = notify_sms(db, case_id=target.id, to_phone=recipient, template_name=NUDGE_CUSTOMER_TEMPLATE, body=body)
          else:
              n = _send_service_sms(
                  db, to_phone=recipient, template_name=NUDGE_CUSTOMER_TEMPLATE, body=body,
                  service_booking_id=target.id if target.kind != "cleaning" else None,
                  cleaning_subscription_id=target.id if target.kind == "cleaning" else None,
              )
          db.commit()
          return "sent" if n is not None and n.status == NotificationStatus.sent else "failed"


      def _deliver_digest_email(db: Session, ctx: dict, now: datetime) -> None:
          merged = _with_brand_profile(db, ctx)
          templates = _get_system_setting(db, "email_templates") or {}
          tpl = templates.get(NUDGE_DIGEST_TEMPLATE)
          if isinstance(tpl, dict) and tpl.get("html"):
              subject = str(tpl.get("subject") or f"Stalled-order digest — {ctx['date']}")
              html = _templates_env().from_string(str(tpl["html"])).render(**merged)
          else:
              subject = f"Stalled-order digest — {ctx['date']}"
              html = _templates_env().from_string(
                  '{% extends "base.html" %}{% block content %}<p>No template found.</p>{% endblock %}'
              ).render(**merged)
          s = get_settings()
          _send_service_email(
              db, to_email=s.nudge_redirect_email, template_name=NUDGE_DIGEST_TEMPLATE,
              subject=subject, html=html, service_booking_id=None, cleaning_subscription_id=None,
          )
          db.commit()
      ```
      （Step 2.7 的防御性降级已保证走到这里的 `target.phone` 一定非空，所以 `real_contact = target.phone or ""`
      这里的 `""` 分支实际不可达，保留只是为了类型安全。）
      **`db.commit()` 必须紧跟在每次 `_record_notification`（即 `notify_sms`/`_send_service_sms`/
      `_send_service_email` 返回）之后，不能等整批扫描结束再统一提交**——原因见 DESIGN.md
      `## Review` 红线核对表：`run_daily_nudges` 一次跑几十个目标，中途崩溃如果只有一次收尾
      commit，会丢失"已经真实发送但未落库"的 notifications 行，次日（或同日第二条 cron）会
      误判"没催过"从而对真实客户重复发短信。
      verify: `grep -n "notify_sms\|_send_service_sms\|_send_service_email" backend/app/services/nudge_service.py`
      的命中行必须全部落在 `_deliver_customer_sms` 或 `_deliver_digest_email` 函数体内（人工核对，
      不应出现在 `run_daily_nudges` 或任何 `_scan_*` 函数里）。

- [x] **Step 2.10** — 追加待人工跟进的 CaseNote 去重写入函数（仅 EV）：
      ```python
      def _needs_followup_case_note(db: Session, target: StalledTarget) -> None:
          exists = db.execute(
              select(func.count()).select_from(CaseNote).where(
                  CaseNote.case_id == target.id,
                  CaseNote.content.like("NUDGE:%"),
                  CaseNote.created_at > target.clock,
              )
          ).scalar_one() > 0
          if exists:
              return
          db.add(CaseNote(
              case_id=target.id, admin_user_id=None,
              content=f"NUDGE: reached {NUDGE_CAP} auto-reminders at {target.stalled_days} days stalled "
                      f"({target.status_label}); needs manual follow-up.",
          ))
          db.commit()
      ```
      verify: 语法检查通过。

- [x] **Step 2.11** — 追加 `_build_digest_ctx(nudged, our_side, needs_followup, now) -> dict`
      纯函数，按 DESIGN §3.5 的 ctx 契约组装（`date` 用 `now.astimezone(CALGARY_TZ).date().isoformat()`；
      `nudged` 每项 `{"ref","state","days","count","intended","redirected","admin_url"}`，
      `intended = f"{t.customer_name} {t.phone or t.email or ''}"`；`our_side`/`needs_followup`
      每项 `{"ref","state","days","admin_url"}`）。
      verify: 语法检查通过；行为由测试文件验证。

- [x] **Step 2.12** — 追加编排函数 `run_daily_nudges(db: Session, *, now: datetime | None = None) -> dict`：
      1. `now = now or datetime.now(timezone.utc)`
      2. `targets = _scan_ev(db, now) + _scan_services(db, now) + _scan_cleaning(db, now)`
      3. 拆分 `customer_targets`（`bucket=="customer"`）与 `ours_targets`（`bucket=="ours"`）
      4. 对每个 `customer_targets`：若 `_already_attempted_today` 为真 → `skipped_today += 1` 并
         `continue`；否则算 `sent_count = _sent_count(db, t)`；若 `sent_count >= NUDGE_CAP` →
         加入 `needs_followup`，若 `t.kind=="ev"` 调 `_needs_followup_case_note`，`continue`；
         否则若 `not should_nudge(t.stalled_days, sent_count)` → `continue`（还没到点）；
         否则调 `_deliver_customer_sms`，按返回值累加 `customer_nudges_sent`/`customer_nudges_failed`，
         成功的加入 `nudged` 列表。
      5. 若 `nudged` 或 `ours_targets` 或 `needs_followup` 三者任一非空，且
         `not _digest_already_sent_today(db, now)` → 用 `_build_digest_ctx` 组装 ctx，调
         `_deliver_digest_email`，`digest_sent = True`；否则 `digest_sent = False`。
      6. 返回
         `{"date": now.astimezone(CALGARY_TZ).date().isoformat(), "scanned": len(targets),
           "customer_nudges_sent": ..., "customer_nudges_failed": ..., "skipped_today": ...,
           "our_side": len(ours_targets), "needs_followup": len(needs_followup), "digest_sent": digest_sent}`
      verify: `python -c "import app.services.nudge_service"` 无报错；`grep -n "def run_daily_nudges"`
      命中且签名为 `run_daily_nudges(db: Session, *, now: datetime | None = None) -> dict`。

#### Round-2 追加（必改1/必改2，DESIGN.md Review 核签 APPROVE-WITH-CHANGES 后落地）

- [x] **必改1** — `run_daily_nudges` 里 `targets = _scan_ev(...) + _scan_services(...) + _scan_cleaning(...)`
      之后、拆分 `customer_targets`/`ours_targets` 之前，加一行咽喉点过滤：
      `targets = [t for t in targets if not t.reference_number.startswith("MOCK-")]`（附
      `ponytail:` 注释说明原因：生产 mock 数据的联系方式本不可送达，但催单重定向会把收件人替换
      成真实手机号，抵消这层保护；且 "ours" 分支没有任何每日幂等门，`MOCK-` 记录会永久污染
      digest）。**不放进三个 `_scan_*` 函数内**，保持它们可被裸调用做普查。
      verify: 见 Step 2.13 round-2 追加的 `test_mock_prefix_excluded_everywhere`。
- [x] **必改2** — 模块级常量 `NUDGE_MAX_PER_RUN = 10`（不进 config）。`run_daily_nudges` 的
      customer 循环里，在 `should_nudge` 判定通过、真正要发之前插入：
      `if customer_nudges_sent + customer_nudges_failed >= NUDGE_MAX_PER_RUN: flood_capped += 1; continue`
      ——不写 Notification 行、不计入 `failed`、不影响 `_already_attempted_today`/`needs_followup`
      的判定（被闸掉的目标当天没有任何记录，同日重跑或次日 cron 自然继续排空积压）。返回 dict
      新增 `flood_capped` 键。
      verify: 见 Step 2.13 round-2 追加的 `test_flood_cap_limits_sends_and_flags_flood_capped`。

### 测试文件

- [x] **Step 2.13** — 新建 `backend/tests/test_nudge_service.py`。**不 `import pytest`**，仿照
      `backend/tests/test_booking_logic.py` 的写法：普通 `assert`、函数名 `test_*`、文件末尾
      ```python
      if __name__ == "__main__":
          fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
          for fn in fns:
              fn()
              print(f"  ok  {fn.__name__}")
          print(f"\nAll {len(fns)} nudge-service tests passed.")
      ```
      测试内容（对照 DESIGN §5 测试接缝 1/2/4，逐条落地）：
      1. `test_ev_classify_exhaustive` — `assert set(_EV_CLASSIFY) == set(CaseStatus)`。
      2. `test_service_classify_exhaustive` — 对 `DIAGNOSTIC_TRANSITIONS`/`BIRD_TRANSITIONS`
         的全部 key 并上 value 集合（即 5 诊断态 + 7 鸟网态），断言
         `(ServiceType.diagnostic/bird_netting, status)` 都在 `_SERVICE_CLASSIFY` 里，且这两组
         并起来恰好等于 `_SERVICE_CLASSIFY` 的 key 集合（无多余、无遗漏）。
      3. `test_cleaning_classify_exhaustive` — `assert set(_CLEANING_CLASSIFY) == {(p, m) for p in CleaningPricingStatus for m in CleaningPaymentStatus}`。
      4. `test_should_nudge_boundaries` — 断言 `(13,0)→False (14,0)→True (27,1)→False (28,1)→True (42,2)→True (56,3)→False`。
      5. `test_redirect_default_on_and_off` — **必须 patch `app.services.nudge_service.get_settings`
         这个模块属性，不是 `app.config.get_settings`**——`nudge_service.py` 用
         `from app.config import get_settings` 把函数对象绑到了自己的模块命名空间，改
         `app.config.get_settings` 对已经绑定的引用不生效；且 `get_settings` 本身带
         `@lru_cache`，不能指望改配置就让它重新求值。具体做法：
         ```python
         import app.services.nudge_service as ns
         from app.config import Settings

         def test_redirect_default_on_and_off():
             original = ns.get_settings
             try:
                 ns.get_settings = lambda: Settings(nudge_redirect=None)
                 assert ns.redirect_enabled() is True
                 ns.get_settings = lambda: Settings(nudge_redirect="off")
                 assert ns.redirect_enabled() is False
                 ns.get_settings = lambda: Settings(nudge_redirect="FALSE")
                 assert ns.redirect_enabled() is True  # 不是精确的 "off"，仍重定向
             finally:
                 ns.get_settings = original
         ```
         **`finally` 里必须还原 `ns.get_settings`**——不还原会让本文件里排在它后面的其它测试
         （尤其 `test_run_daily_nudges_*` 系列和下面第 11 条）读到被打过补丁的假配置。
      6. `test_run_daily_nudges_ev_quoted_sends_redirected` — 用 `SessionLocal()` 直连 DB，插入一个
         **打 `MOCK-`/`Mock-` 标记**的临时 `Customer`+`Case`（status=quoted）+一条
         `CaseStatusHistory`（`created_at` = `now - 20 days`），调用
         `run_daily_nudges(db, now=<固定 now>)`，断言：`notifications` 表里恰好新增 1 条
         `template_name="nudge_customer"` 行，`recipient == "+15879669668"`，`content` 以 `"[→ "` 开头；
         同一 `now` 下再跑一次 `run_daily_nudges`，断言这次 0 条新增（当日幂等）。测试结束在
         `finally` 里删除自己插入的行（`Case`/`Customer`/`CaseStatusHistory`/`Notification`）,
         **不要依赖 `mock_data.py purge`**（避免和它的固定数据集打架）。
      7. `test_run_daily_nudges_needs_followup_writes_case_note_once` — 同上手法插入一个 EV case，
         预先手工插入 3 条 `status="sent", template_name="nudge_customer"` 的 `Notification` 行
         （`created_at` 均晚于 case 的 stalled clock），跑 `run_daily_nudges`，断言：不产生第 4 条
         `nudge_customer` 行；产生恰好 1 条 `content LIKE 'NUDGE:%'` 的 `CaseNote`；同一 `now` 下
         再跑一次，`CaseNote` 数量仍为 1（不重复写）。
      8. `test_run_daily_nudges_service_booking_customer_side` — 对一个临时 `ServiceBooking`
         （`service_type=bird_netting, status=quoted`, `status_changed_at = now - 20 days`）跑一遍，
         断言产生 1 条 `service_booking_id` 匹配的 `nudge_customer` 行，`content` 含
         `bird_quote_url` 的路径片段 `/service/bird-netting/quote/`。
      9. `test_run_daily_nudges_cleaning_customer_side` — 同上手法对 `CleaningSubscription`
         （`pricing_status=quoted, payment_status=unpaid`, `status_changed_at = now - 20 days`）验证。
      10. `test_digest_is_one_row_per_day` — 构造至少 1 个 "ours" 目标 + 1 个上面产生的 "customer"
          目标，跑 `run_daily_nudges`，断言恰好新增 1 条 `template_name="nudge_admin_digest"` 且
          三个 FK 全 NULL 的 `Notification` 行；同一天再跑一次断言仍是 1 条。
      11. `test_redirect_recipient_never_real_contact` — 红线测试，**必须自成一体，不依赖其它
          测试留下的行**（其它测试大多在 `finally` 里把自己插入的行删掉了，如果这条测试只是
          去"遍历本文件所有测试产生的行"，很可能遍历到一个空集合，断言在空集合上永远为真，
          等于没测）：自己新插入一条打 `MOCK-`/`Mock-` 标记、`phone` 为真实构造值（如
          `"+15550009999"`）的 EV case（`status=quoted`，clock 设为 `now - 20 days`），默认配置
          （不 monkeypatch）下调用 `run_daily_nudges`，断言产生的那条 `nudge_customer` 行
          `recipient == "+15879669668"` 且 `recipient != "+15550009999"`（即真实构造的 phone），
          `finally` 里清理自己插入的行。
      verify: `docker exec -w /app <backend> python -m tests.test_nudge_service`（注意用
      `-m tests.test_nudge_service` 而不是 `python tests/test_nudge_service.py`——后者以文件路径
      启动时 `/app` 不在 `sys.path`，`from app...` 会 `ModuleNotFoundError`，本容器没设
      `PYTHONPATH`；`docker-compose.dev.yml` 已经 bind-mount 了 `./backend:/app`，本地改完文件
      容器内直接可见，不需要 `docker cp`）输出 `All 11 nudge-service tests passed.`，退出码 0。
      >
      > **Round-2 追加（必改3，见 DESIGN.md Review 核签）**：新增
      > `test_mock_prefix_excluded_everywhere` + `test_flood_cap_limits_sends_and_flags_flood_capped`
      > 两条，用例总数变为 13。为配合 `run_daily_nudges` 新增的 `MOCK-` 前缀咽喉点过滤（见 Ticket 2
      > 引擎模块 round-2 追加小节），测试辅助函数 `_ref()` 改为生成 `TEST-` 前缀（而不是
      > `MOCK-` 前缀）的 `reference_number`——否则所有跑真实 `run_daily_nudges()` 的现有测试都会
      > 因为自己的测试行被咽喉点过滤掉而失败。`customer_name`/`email` 仍保留 `Mock-`/`mock+` 内容
      > 标记（不受过滤影响，纯用于人眼识别）。新增 `_mock_ref()`（**DOES** 生成 `MOCK-` 前缀）
      > 专供 `test_mock_prefix_excluded_everywhere` 验证过滤本身。verify 命令与用例总数改为
      > `All 13 nudge-service tests passed.`。

**Ticket 2 Test plan**: Step 2.13 的 13 个 assert 用例（round-2 后）是主体；额外跑一次
`docker exec -w /app <backend> python -m tests.test_booking_logic` 和上面 Ticket 1 提到的 docker
pytest e2e，确认没有把 `notification_service.py`（未改动，只读）或 `service_booking_flow.py`
其它函数带出回归。

---

## Ticket 3 — 端点 + 调度  [Blocked by: 2] [serial]
**Files**: `backend/app/api/v1/internal_nudges.py`（新建）、`backend/app/api/v1/router.py`、
`backend/tests/test_nudge_endpoint.py`（新建）、`docker-compose.test.yml`

- [x] **Step 3.1** — 新建 `backend/app/api/v1/internal_nudges.py`：
      ```python
      from __future__ import annotations

      import hmac

      from fastapi import APIRouter, Depends, Header, HTTPException
      from sqlalchemy.orm import Session

      from app.config import get_settings
      from app.database import get_db
      from app.services.nudge_service import run_daily_nudges

      router = APIRouter(prefix="/internal")


      @router.post("/nudges/run")
      def run_nudges(
          db: Session = Depends(get_db),
          x_nudge_key: str | None = Header(default=None, alias="X-Nudge-Key"),
      ):
          settings = get_settings()
          if not settings.nudge_run_key:
              raise HTTPException(status_code=503, detail="Nudges are not configured")
          if not hmac.compare_digest(x_nudge_key or "", settings.nudge_run_key):
              raise HTTPException(status_code=401, detail="Invalid key")
          return run_daily_nudges(db)
      ```
      **顺序不能反**：先判断 key 是否配置（否则 503），再做 `compare_digest`（否则 401）——反过来
      会导致"没配置密钥"时也回 401 而不是 503，掩盖了"整个功能没开"这一更重要的状态。
      verify: `docker exec -w /app <backend> python -c "import app.api.v1.internal_nudges"` 无报错。

- [x] **Step 3.2** — `backend/app/api/v1/router.py` — 新增
      `from app.api.v1 import internal_nudges` 和
      `api_router.include_router(internal_nudges.router, tags=["internal"])`
      （放在 Admin 分组之后即可，顺序不影响功能）。
      verify: `docker compose -f docker-compose.yml -f docker-compose.dev.yml restart backend`
      后 `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:7222/api/v1/internal/nudges/run`
      返回 `503`（本地 `.env` 默认没配 `NUDGE_RUN_KEY`）。

- [x] **Step 3.3** — `docker-compose.test.yml` — 在 `backend` 服务的 `environment` 块里新增一行：
      `NUDGE_RUN_KEY: ${NUDGE_RUN_KEY:-test-nudge-key-do-not-use-in-prod}`
      （不加 `NUDGE_REDIRECT`，保持默认重定向 ON，这样测试栈里发出的任何催单短信/邮件走的
      收件人都是 `+15879669668`/`cool@khtain.com`，不会真的发给测试数据里的联系方式——虽然
      测试栈本来 SMTP/Twilio 也是禁用的，两层保险都在）。同时在 `tests` 服务的 `environment`
      块加一行 `NUDGE_RUN_KEY: ${NUDGE_RUN_KEY:-test-nudge-key-do-not-use-in-prod}`（供
      test_nudge_endpoint.py 的 httpx 请求携带同一把 key）。
      verify: `grep -c "NUDGE_RUN_KEY" docker-compose.test.yml` = 2。

- [x] **Step 3.4** — 新建 `backend/tests/test_nudge_endpoint.py`，仿 `test_admin_notifications.py`
      的 httpx + `needs_stack` 风格（**这个文件走 `docker-compose.test.yml` 的独立 `tests`
      容器，是 pytest 可用的那一套，和 Step 2.13 不同**）：
      ```python
      import os
      import httpx
      import pytest

      def _api_base() -> str:
          return os.environ.get("API_BASE", "http://backend:8000").rstrip("/")

      def _url(path: str) -> str:
          return f"{_api_base()}{path}"

      def _stack_up() -> bool:
          try:
              return httpx.get(_url("/health"), timeout=5).status_code == 200
          except Exception:
              return False

      needs_stack = pytest.mark.skipif(not _stack_up(), reason="live backend stack not reachable")

      @needs_stack
      def test_wrong_key_returns_401():
          r = httpx.post(_url("/api/v1/internal/nudges/run"), headers={"X-Nudge-Key": "wrong"}, timeout=20)
          assert r.status_code == 401

      @needs_stack
      def test_correct_key_returns_200_with_summary():
          key = os.environ.get("NUDGE_RUN_KEY", "test-nudge-key-do-not-use-in-prod")
          r = httpx.post(_url("/api/v1/internal/nudges/run"), headers={"X-Nudge-Key": key}, timeout=30)
          assert r.status_code == 200, r.text
          body = r.json()
          for k in ("date", "scanned", "customer_nudges_sent", "customer_nudges_failed",
                    "skipped_today", "our_side", "needs_followup", "digest_sent"):
              assert k in body
      ```
      verify: `docker compose -f docker-compose.test.yml --env-file .env up --build --abort-on-container-exit --exit-code-from tests`
      退出码 0，日志里两条新测试均 PASSED。

- [ ] **Step 3.5**（手工，非自动化，Kuo 上线前执行）— 验证"缺 key → 503"分支：本地 `.env` 里 `NUDGE_RUN_KEY`
      本就默认留空（Step 1.13 已是空），Step 3.2 的 verify 已经做过这个检查，此步骤只是明确
      写进 runbook：部署到生产前，先确认 `.env` 里**没有**意外把 `NUDGE_RUN_KEY` 设成空字符串
      以外的东西就直接上线（应该先设置真实 key 再启用 cron，见下）。

### 部署 runbook（手工，不在自动化 verify 范围内，供 Kuo 执行）

- [ ] 生产 `.env` 追加真实 `NUDGE_RUN_KEY`（随机字符串，不进 git）、保持 `NUDGE_REDIRECT` 留空
      （= 重定向默认 ON）。
- [ ] **迁移预检（真跑前）**：`alembic current` 确认生产版本戳确实是 `a5b6c7d8e9f0`
      （`case_load_calc`，2026-07-24 那次部署的最后一次迁移）。若生产落后得比这更多，说明待打
      的迁移不止 `b1c2d3e4f5a6` + `655efc445c97` 两个，干跑必须覆盖完整链条，不能只测这两个。
      同时确认临时库的 PostgreSQL 大版本号（`SELECT version();`）与生产一致——干跑结果只在
      同版本下才可信。
- [ ] **`pg_dump` 全量备份，在干跑之前、真跑之前都要有**：本次迁移链条含
      `ALTER TYPE ... ADD VALUE`（`b1c2d3e4f5a6` 的 `appointment_kind` 枚举扩容）——这个操作
      **不可回滚**，枚举值一旦加上，`downgrade()` 不会把它删掉，没有其它办法撤销。备份是唯一的
      安全网。
- [ ] **先在 VPS 复制一份生产库到临时库跑 `alembic upgrade head` 干跑一次**，确认本次新迁移
      和从未上过生产的 `b1c2d3e4f5a6`（v3.0，含 `ALTER TYPE ... ADD VALUE` autocommit 块）能连续
      跑通——MEMORY.md 记录 v3.0 从未部署过生产，这次可能是它们第一次一起上生产。
      确认无误后才对生产库跑 `alembic upgrade head`。
- [ ] **失败重试语义（心里有数，不必现在做）**：`ALTER TYPE ... ADD VALUE` 跑在 autocommit
      块里，如果迁移在这一步之后、之前的某处中途失败，这个 `ADD VALUE` 已经真实持久化到库里了
      （不会随失败回滚）——但迁移文件对它加了 `IF NOT EXISTS`，所以**同一条迁移重跑是安全的**，
      不会因为"枚举值已存在"报错。中途失败时按此处理，不要慌着手工改库。
- [ ] **给 Kuo 报预期条数前的普查（census）口径**：预计会催单多少条，**必须**按
      `bucket == "customer"` 且 `should_nudge(stalled_days, sent_count)` 为真来数，**不能只数
      `_scan_*` 命中数**——单纯 `_scan_*` 命中会把 our-side（`bucket=="ours"`，不发短信）和
      "还没到 14 天整数倍"的 customer-side 目标也算进去，报出来的数字会虚高。`our_side` /
      `needs_followup` 这两个数字（digest 里"我们方"/"待人工跟进"两节）单独报，不要和
      customer 端将要发短信的条数混在一起。
- [ ] 生产 crontab 加两行（`crontab -e`，抄 DESIGN.md §3.6 原文，`.env` 路径按实际部署目录改）：
      ```cron
      0 16 * * * curl -fsS -m 120 -X POST -H "X-Nudge-Key: $(grep '^NUDGE_RUN_KEY=' /www/wwwroot/evquote.khtain.com/fft-evquote-helper/.env | cut -d= -f2-)" http://127.0.0.1:7622/api/v1/internal/nudges/run >> /var/log/fft-nudge.log 2>&1
      0 17 * * * curl -fsS -m 120 -X POST -H "X-Nudge-Key: $(grep '^NUDGE_RUN_KEY=' /www/wwwroot/evquote.khtain.com/fft-evquote-helper/.env | cut -d= -f2-)" http://127.0.0.1:7622/api/v1/internal/nudges/run >> /var/log/fft-nudge.log 2>&1
      ```
- [ ] **上线后首次调端点前**，核对生产 `.env` 三项：①`NUDGE_RUN_KEY` 已设置（否则端点返回
      503，cron 会一直静默失败）；②`NUDGE_REDIRECT` 没被误设成字面值 `off`（除此之外任何
      值/留空都保持重定向 ON）；③`NUDGE_REDIRECT_SMS`/`NUDGE_REDIRECT_EMAIL` 确实是 Kuo 本人的
      手机/邮箱——digest 第一封信、第一条催单短信都会直接发到这两个地址。
- [ ] **首次调用生产链路的验证方式（不要用 mock 数据穿透验证）**：`run_daily_nudges` 现在会在
      咽喉点过滤掉全部 `MOCK-` 前缀记录（见 `nudge_service.py` 的 ponytail 注释），所以 mock 数据
      **不会**再出现在催单短信或 digest 里，靠 mock 数据验证不了真实链路。改用一条
      real-shaped 测试记录：用 Kuo 自己的手机号新建一条真实 booking/case（非 `MOCK-` 编号），
      SQL 把它的 `status_changed_at`（或 EV 案子对应的 `CaseStatusHistory.created_at`）回拨 15
      天，保持 `NUDGE_REDIRECT` 为 ON，手动调一次端点，确认短信 + digest 都送达（走的仍是重定向
      地址，不是这条测试记录本身的手机号——因为重定向对非 mock 数据同样生效），验证完**清理掉
      这条记录**（删行或状态改回，避免留下测试脏数据）。
      约 8 月 10 日之后，`FFT-2026-0002`（Raju，非 mock）应会自然命中"球在客户·等付尾款"，
      是观察真实链路的另一个天然时机——确认那条催单**没有**被真的发给 Raju
      （`notifications.recipient` 应为 `+15879669668`）。
- [ ] **关闭重定向是独立的决策门，不随本次部署自动发生**：把 `NUDGE_REDIRECT` 拨到字面值
      `off`（让真实客户开始收到催单短信）必须由 Kuo 显式批准，不是"部署完就顺手关掉"。
      建议：先让重定向 ON 跑几天，逐日看 digest 摘要（`我们方`/`待人工跟进`/预计催单数）符合
      预期后，再单独决定何时拨 `off`。拨 `off` 前，如果要让真实客户"从第 1 次催起"（而不是
      带着重定向期间已经计过的 `sent_count`），执行（DESIGN §3.3 提到的一次性 SQL，仅作参考，
      执行前 Kuo 自行核对目标）：
      `DELETE FROM notifications WHERE template_name = 'nudge_customer' AND recipient IN ('+15879669668', 'cool@khtain.com');`
- [ ] **未来新增独立表的服务线**（像 cleaning 当年另起一张表那样）不会被任何穷举测试捕获——
      `test_ev_classify_exhaustive` / `test_service_classify_exhaustive` / `test_cleaning_classify_exhaustive`
      三条哨兵各自只穷举自己那张表的枚举值，谁都不知道"天上又掉下来一张新表"这件事。
      新服务线上线时必须手工把它的分类规则接入 `_EV_CLASSIFY`/`_SERVICE_CLASSIFY`/`_CLEANING_CLASSIFY`
      同款模式（新增一张 `_<NEW>_CLASSIFY` 穷举表 + 对应扫描函数 + 对应穷举测试），并把它接进
      `run_daily_nudges` 的 `targets = _scan_ev(...) + _scan_services(...) + _scan_cleaning(...)`
      拼接列表——写进上线 checklist，不要指望测试会替你发现遗漏。

**Ticket 3 Test plan**：
- Step 3.4 的两个 httpx 用例（401 / 200+summary）覆盖端点主路径。
- Step 3.2 的 curl 覆盖"缺 key → 503"。
- **Single-exit 静态核查**（对应 Review 里的红线复核项，跑一次即可）：
  `grep -n "notify_sms\|_send_service_sms\|_send_service_email" backend/app/services/nudge_service.py`，
  人工确认全部命中都在 `_deliver_customer_sms`/`_deliver_digest_email` 函数体内。
- **红线抽查**：Step 2.13 的 `test_redirect_recipient_never_real_contact` 已覆盖"默认配置下
  recipient 永不等于真实联系方式"；Step 2.13 新增的 `test_mock_prefix_excluded_everywhere` 已覆盖
  "`MOCK-` 前缀记录既不发短信也不进 digest 任何一节"。本票额外用 `curl` 对本地栈实跑一次
  `POST /internal/nudges/run`（正确 key），然后
  `docker exec <db> psql ... -c "select recipient, content, created_at from notifications where template_name='nudge_customer' order by created_at desc limit 5;"`
  人工确认 `recipient` 全部是 `+15879669668`——**注意**：本地栈的 `mock_data.py` 种子数据全部是
  `MOCK-` 前缀，会被咽喉点过滤掉，这一步很可能查不到新的一行（本地库没有非-mock 的、真到期的
  customer-side stalled 目标），这是**预期行为，不是回归**；如果确实想现场看到一条真实产生的
  `nudge_customer` 行，改用下方部署 runbook 里"real-shaped 测试记录"的做法现造一条。
- **鸟网 `approved` 落地页人工检查**（无代码改动，纯人工验收，本次新增的 `approved` 分流点是否
  真的有地方可去）：浏览器打开
  `http://localhost:7220/service/bird-netting/quote/<MOCK-BN-08 的 access_token>`
  （`MOCK-BN-08` 是 `approved` 状态那条 mock 数据），确认页面渲染出可操作内容（哪怕只是显示
  "已批准，等待安排安装"之类状态文案），而不是一个死链接/报错页——如果这个页面对
  `approved` 状态完全没有可展示内容，催单短信会把客户导向一个空白页，需要回头找 Kuo 确认是否
  仍要发这条催单（不属于本次代码改动范围，只是验收阶段的一次风险确认）。
- **DB → 引擎 → API → （重定向）收件人 全链路验证**：round-2 review 加了 `MOCK-` 前缀咽喉点过滤
  （见 nudge_service.py `run_daily_nudges` 的 ponytail 注释）之后，`mock_data.py` 种下的
  `MOCK-` 数据**不再**是可用于穿透验证生产链路的手段——这条原计划里"全部标的都是 `Mock-`"的
  end-to-end 验收**在改动之后已不可达，不要再按这个标准验收**。Step 2.13 的
  `test_run_daily_nudges_ev_quoted_sends_redirected` /
  `test_run_daily_nudges_service_booking_customer_side` /
  `test_run_daily_nudges_cleaning_customer_side` /
  `test_digest_is_one_row_per_day` 四条已经在测试层面把 EV / 诊断 / 鸟网 / 清洁三类
  `nudge_customer` 行 + 1 条 `nudge_admin_digest` 行的全链路验证覆盖了（用非-`MOCK-`前缀的
  `TEST-` 测试记录）。生产上线后的对应验证见"部署 runbook"里的 real-shaped 测试记录做法
  （新建一条 Kuo 本人手机号的真实记录，回拨 `status_changed_at`，验证完清理）。
