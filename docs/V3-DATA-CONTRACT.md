# v3.0 Data Contract — FutureFrontier Four-Service Portal

> **Status:** Frozen contract. Written before any migration ("先契约后迁移").
> **Scope:** Adds 3 new services (Diagnostic / Bird Netting / Cleaning) alongside the existing
> EV Charger Case flow. EV external behavior and data are unchanged; the shared scheduling
> module is extended backward-compatibly.
> **Source of truth:** `evquote-v3-claude-code-kickoff (1).md` + the scheduling revision (shared
> capacity pool). This document resolves those into concrete DB / API / i18n contracts.

---

## 0. Non-negotiables (from kickoff + scheduling revision)

1. New services do **not** reuse the `Case` model / 13-state machine / `CaseDetail.jsx`.
2. All four services share **one company-wide hourly capacity pool** via the existing
   `Appointment` + `AvailabilityOverride` anti-oversell system (this doc, §2).
3. Reuse-not-modify shared infra: `middleware/auth.py`, `PlacesAddressInput.jsx`, i18n
   (`t`/`useI18n`), email/sms services, Jinja2 template mechanism, secure-token access.
   Extending the `Appointment` model is allowed but must be backward compatible.
4. No online payment/renewal in v3.0. Cleaning payment status is admin-set.
5. Price snapshot: booking/quote/subscription copies the live price into its own row at
   creation time; later Settings edits never mutate existing orders.
6. Code + commit messages in English. All customer-facing copy via i18n, EN + zh-CN complete.

---

## 1. Terminology

| Term | Meaning |
|------|---------|
| **Capacity pool** | Company-wide number of appointments servable in one hour slot. Shared by EV survey/install and all three new services. |
| **Touchpoint** | A moment a slot is consumed (customer self-book at submission, or admin schedule). |
| **Service booking** | A one-off Diagnostic or Bird-Netting job (`service_bookings` row). |
| **Subscription / Visit** | A Cleaning annual subscription (`cleaning_subscriptions`) with 4 quarterly `cleaning_visits`. |

---

## 2. Generalized `Appointment` (the crux)

### 2.1 Structure (after generalization)

`Appointment` becomes a polymorphic scheduling row. Exactly **one** target FK is set.

| Column | Type | Change | Notes |
|--------|------|--------|-------|
| `id` | UUID PK | — | |
| `case_id` | UUID FK→cases.id | **NULLABLE now** (was NOT NULL) | EV survey/install |
| `service_booking_id` | UUID FK→service_bookings.id | **NEW, nullable** | Diagnostic / Bird netting |
| `cleaning_visit_id` | UUID FK→cleaning_visits.id | **NEW, nullable** | Cleaning quarterly visit |
| `kind` | enum `appointment_kind` | **enum extended** | see §2.2 |
| `start_at` | timestamptz | — | slot start |
| `duration_min` | int, default 60 | — | v3.0 fixed; not used for capacity |
| `status` | enum `appointment_status` (`booked`/`cancelled`/`completed`) | — | |
| `created_by` | str(20) `customer`/`admin` | — | |
| `created_at`, `updated_at` | timestamptz | — | |

**Integrity:** DB CHECK constraint `num_nonnull(case_id, service_booking_id, cleaning_visit_id) = 1`.
Index `ix_appt_slot` changes from `(kind, start_at, status)` to `(start_at, status)` because the
capacity count is now kind-agnostic (shared pool). Keep `ix_appointments_case_id`; add
`ix_appointments_service_booking_id`, `ix_appointments_cleaning_visit_id`.

### 2.2 `appointment_kind` enum — extended (additive, backward compatible)

| Value | Existing? | Target | Touchpoint |
|-------|-----------|--------|-----------|
| `survey` | existing | case | EV customer self-book |
| `install` | existing | case | EV customer self-book |
| `diagnostic` | **new** | service_booking | Customer self-book at submission |
| `bird_survey` | **new** | service_booking | Customer self-book at submission (drone survey) |
| `bird_install` | **new** | service_booking | Admin schedules after approval |
| `cleaning` | **new** | cleaning_visit | Admin schedules each visit |

Postgres: `ALTER TYPE appointment_kind ADD VALUE ...` (idempotent guard in migration).

### 2.3 Capacity pool rules (SEMANTIC CHANGE — documented)

**Before:** capacity was counted **per kind** — a slot could hold `cap` surveys *and* `cap`
installs independently.
**After (v3.0):** capacity is a **single shared pool per (day, hour)** — the count sums **all**
`booked` appointments in that slot **regardless of kind / service**.

- Effective capacity for a slot = `AvailabilityOverride` per-slot > per-day > `default_capacity`
  (unchanged resolution; value is already service-agnostic).
- `book_slot` locks all `booked` rows for the slot (`start_at == slot`, any kind) `FOR UPDATE`,
  re-counts under the lock, rejects if `count >= cap`. No-oversell now holds across the whole pool.
- `list_available_slots` counts all `booked` rows per slot (kind filter removed).
- v3.0: every appointment consumes **exactly 1** unit. No per-service duration weighting (v3.1).

**Impact on EV (acknowledged):** EV's *available slots* now reflect consumption by installs and
by the three new services (and vice versa). EV **endpoints, request/response shapes, data rows,
and self-booking flow are unchanged**; only the availability *numbers* reflect the shared pool.
EV self-book/cancel regression tests must pass (hard acceptance).

**Pure core untouched:** `available_slots()` / `generate_candidate_slots()` signatures are
unchanged (they already accept an aggregate `booked_counts`); only the DB wrappers
`list_available_slots()` / `book_slot()` drop the `kind ==` filter. `test_booking_logic.py`
(pure, no DB) stays green.

### 2.4 Touchpoint consumption timing (authoritative table)

| # | Service | When slot is consumed | kind | created_by | On failure (slot full/closed) |
|---|---------|----------------------|------|-----------|-------------------------------|
| 1 | EV survey | Customer self-books from status page | `survey` | customer | 409 → pick another (existing) |
| 2 | EV install | Customer self-books after permit approved | `install` | customer | 409 → pick another (existing) |
| 3 | Diagnostic | **At submission** (booking + appointment in one tx) | `diagnostic` | customer | 409 → whole submission rolled back, re-pick slot |
| 4 | Bird survey | **At submission** (booking + appointment in one tx) | `bird_survey` | customer | 409 → rolled back, re-pick slot |
| 5 | Bird install | Admin sets install time after `approved` | `bird_install` | admin | 409 → admin picks another |
| 6 | Cleaning visit | Admin schedules a visit (per quarter) | `cleaning` | admin | 409 → admin picks another |

Cancel/reschedule of a new-service appointment frees the slot (status→cancelled) via the same
atomic path used for EV.

### 2.5 Service layering (what changes vs. what's added)

```
availability.py       ← MODIFY  list_available_slots: drop kind filter (shared pool)
booking.py            ← MODIFY  book_slot: accept target FK (case/service_booking/cleaning_visit),
                                 drop kind filter in lock+count (shared pool)
booking_flow.py       ← UNCHANGED (EV survey/install → Survey/Installation + case status mirror)
service_booking_flow.py ← NEW   book/cancel/reschedule for diagnostic/bird/cleaning, mirrors into
                                 service_bookings / cleaning_visits status; NEVER touches Case
```

`booking_flow.py` keeps calling `booking.book_slot(..., case_id=case.id, kind=survey|install)`.
`service_booking_flow.py` calls `booking.book_slot(..., service_booking_id=... | cleaning_visit_id=..., kind=...)`.

---

## 3. New data models

### 3.1 `service_bookings` (Diagnostic + Bird Netting)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `service_type` | enum `service_type` (`diagnostic`,`bird_netting`) | |
| `status` | enum `service_booking_status` | see §4.1 / §4.2 |
| `customer_name` | str(100) | |
| `phone` | str(20) | |
| `email` | str(255) | |
| `address` | text | |
| `panel_count` | int | |
| `preferred_window` | str(50) null | customer's preferred time text (EV parity: informational) |
| `inverter_info` | text null | diagnostic only (brand/model) |
| `problem_description` | text null | diagnostic only |
| `problem_tags` | JSONB null | diagnostic quick-select chips |
| `photo_urls` | JSONB (list) default [] | optional uploads (reuse upload dir) |
| `technician` | str(100) null | admin-set on schedule |
| `scheduled_at` | timestamptz null | mirrors the active Appointment.start_at |
| `completed_at` | timestamptz null | |
| `actual_hours` | numeric(5,2) null | diagnostic completion |
| `hardware_involved` | bool default false | diagnostic completion |
| `completion_notes` | text null | |
| `hourly_rate_snapshot` | numeric(10,2) null | diagnostic price snapshot at submission |
| `access_token` | str(64) unique index | secure-link status tracking |
| `disclaimer_accepted_at` | timestamptz NOT NULL | consent timestamp |
| `created_at`, `updated_at` | timestamptz | |

### 3.2 `bird_netting_quotes` (1:1 with a bird-netting `service_booking`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `booking_id` | UUID FK→service_bookings.id, unique | |
| `roll_count` | int | |
| `nest_count` | int default 0 | |
| `roll_price_snapshot` | numeric(10,2) | per-roll price at quote time |
| `nest_fee_snapshot` | numeric(10,2) | per-nest fee at quote time |
| `total` | numeric(10,2) | roll_count*roll_price + nest_count*nest_fee |
| `status` | enum `quote_status` (`pending`,`approved`,`rejected`) | |
| `signature_data` | text null | base64 PNG (reuse signature capture pattern) |
| `signed_name` | str(120) null | |
| `approved_at` | timestamptz null | |
| `created_at`, `updated_at` | timestamptz | |

### 3.3 `cleaning_subscriptions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `customer_name` | str(100) | |
| `phone` | str(20) | |
| `email` | str(255) | |
| `address` | text | |
| `panel_count` | int | |
| `tier` | enum `cleaning_tier` (`tier1`,`tier2`,`custom`) | ≤20 / 21–35 / ≥36 |
| `annual_price` | numeric(10,2) null | null when `custom` awaiting admin price |
| `pricing_status` | enum `cleaning_pricing_status` (`quoted`,`pending_quote`) | `pending_quote` for `custom` tier until admin sets price |
| `payment_status` | enum `payment_status_v3` (`unpaid`,`paid`,`refunded`) default `unpaid` | admin-set |
| `start_date` | date | |
| `access_token` | str(64) unique index | |
| `disclaimer_accepted_at` | timestamptz NOT NULL | |
| `created_at`, `updated_at` | timestamptz | |

### 3.4 `cleaning_visits` (4 rows per subscription)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `subscription_id` | UUID FK→cleaning_subscriptions.id, index | |
| `quarter` | int (1–4) | |
| `scheduled_date` | timestamptz null | mirrors active Appointment.start_at |
| `status` | enum `cleaning_visit_status` (`pending`,`notified`,`completed`,`skipped`) default `pending` | |
| `completed_at` | timestamptz null | |
| `notes` | text null | |
| `created_at`, `updated_at` | timestamptz | |

4 `cleaning_visits` (quarter 1–4) are created together with the subscription (scheduled_date null,
status `pending`). Admin schedules each later (consumes a slot, §2.4 #6).

---

## 4. State machines (new services)

### 4.1 Diagnostic (`service_booking_status` subset)
```
submitted → scheduled → in_progress → completed
         ↘ cancelled (from submitted|scheduled)
```
- `submitted`: created with a customer-chosen slot already booked (appointment kind=diagnostic).
- `scheduled`: admin sets technician (+ optionally reschedules); confirmation notification.
- `in_progress`: admin marks arrival (optional; may go straight to completed).
- `completed`: admin records actual_hours, hardware_involved, completion_notes.

### 4.2 Bird netting (`service_booking_status` subset)
```
submitted → survey_scheduled → quoted → approved → install_scheduled → completed
         ↘ cancelled (any pre-completed state)
```
- `submitted`/`survey_scheduled`: customer self-books drone survey slot at submission
  (kind=bird_survey) → status `survey_scheduled` immediately (survey time chosen).
- `quoted`: admin enters roll_count/nest_count → creates `bird_netting_quotes` (pending) → notify.
- `approved`: customer signs on quote page → quote.status=approved, booking.status=approved.
- `install_scheduled`: admin schedules install (kind=bird_install).
- `completed`: admin marks done.

> Both diagnostic and bird netting use one `service_booking_status` enum containing the union of
> values: `submitted, scheduled, survey_scheduled, quoted, approved, in_progress,
> install_scheduled, completed, cancelled`. Only the relevant subset is valid per `service_type`;
> transitions guarded in `service_booking_flow.py`.

### 4.3 Cleaning
- Subscription has no lifecycle enum beyond `payment_status` + `pricing_status`.
- Each `cleaning_visit`: `pending → notified → completed | skipped`.
  - `notified`: admin schedules the visit → "upcoming cleaning" notification, slot consumed.
  - `completed`: admin marks done (optional completion notice).
  - `skipped`: weather/other; frees slot.

---

## 5. Pricing config (SystemSetting)

New `SystemSetting` row, key **`service_pricing`** (single JSONB, no new table). Seeded in
`bootstrap_service.ensure_defaults` with merge-without-overwrite (same pattern as existing).

```json
{
  "diagnostic_hourly_rate": 179.00,
  "bird_netting_roll_price": 599.00,
  "bird_netting_nest_fee": 199.00,
  "cleaning_tier1_price": 599.00,   // ≤20 panels
  "cleaning_tier2_price": 799.00,   // 21–35 panels
  "cleaning_tier1_max_panels": 20,
  "cleaning_tier2_max_panels": 35,
  "currency": "CAD"
}
```
- Public endpoint `GET /public/service-pricing` exposes this (read-only) for the customer app
  (homepage "From $X" tags + Step B live pricing).
- Admin reads/writes via existing `PUT /admin/settings/{key}` with `key=service_pricing`.
- **Snapshot**: on submission/quote, copy the relevant number into the row's `*_snapshot` field.

Tier resolution (server-authoritative, also mirrored client-side for live feedback):
```
panel_count <= tier1_max            → tier1, annual_price = tier1_price,  pricing_status=quoted
tier1_max < panel_count <= tier2_max→ tier2, annual_price = tier2_price,  pricing_status=quoted
panel_count > tier2_max             → custom, annual_price = null,        pricing_status=pending_quote
```

---

## 6. API contract

Base: existing `/api/v1`. Public router mounted with no extra prefix (like `booking.router`);
admin router with `prefix="/admin"`. **New admin front-end calls must match these exactly.**

### 6.1 Public — service pricing & slots
| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/public/service-pricing` | — | `service_pricing` JSON (§5) |
| GET | `/public/services/slots` | `?from=<iso?>` | `{ "slots": [iso,...] }` shared-pool availability (kind-agnostic) |

> New services query one shared-pool slots endpoint (kind-agnostic). EV keeps its own
> `/cases/{token}/slots?kind=` endpoint (now shared-pool counted).

### 6.2 Public — Diagnostic / Bird netting bookings
| Method | Path | Body (key fields) | Response |
|--------|------|-------------------|----------|
| POST | `/public/services/bookings` | `service_type, customer_name, phone, email, address, panel_count, preferred_window?, inverter_info?, problem_description?, problem_tags?, photo_urls?, start_at, disclaimer_accepted (bool)` | `{ token, reference, status }` — books slot atomically; 409 if slot gone |
| GET | `/public/services/bookings/{token}` | — | booking public view (status, service_type, scheduled_at, quote summary if bird) |
| POST | `/public/services/bookings/{token}/cancel` | — | `{ ok }` |

### 6.3 Public — Bird netting quote approval
| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/public/services/bird-netting/quote/{token}` | — | quote detail (roll_count, nest_count, prices, total, status) |
| POST | `/public/services/bird-netting/quote/{token}/approve` | `signature_data, signed_name` | `{ ok, status: "approved" }` → booking→approved |

### 6.4 Public — Cleaning subscription
| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/public/services/cleaning/subscriptions` | `customer_name, phone, email, address, panel_count, start_date?, disclaimer_accepted` | `{ token, tier, annual_price, pricing_status }` (creates 4 pending visits) |
| GET | `/public/services/cleaning/{token}` | — | subscription + 4 visits (dates/status) |

### 6.5 Admin — service bookings
| Method | Path | Notes |
|--------|------|------|
| GET | `/admin/services/bookings?type=&status=` | list, filter by service_type + status |
| GET | `/admin/services/bookings/{id}` | detail incl. quote, notifications, appointment |
| POST | `/admin/services/bookings/{id}/schedule` | `{ start_at, technician? }` → book/reschedule slot (diagnostic scheduled / bird install_scheduled) |
| POST | `/admin/services/bookings/{id}/status` | `{ status, ...completion fields }` guarded transition |
| POST | `/admin/services/bookings/{id}/quote` | bird only: `{ roll_count, nest_count }` → create/replace quote (pending) + notify |
| POST | `/admin/services/bookings/{id}/cancel` | frees slot |

### 6.6 Admin — cleaning
| Method | Path | Notes |
|--------|------|------|
| GET | `/admin/services/cleaning?payment_status=` | subscription list |
| GET | `/admin/services/cleaning/{id}` | detail + 4 visits |
| POST | `/admin/services/cleaning/{id}/price` | custom tier: `{ annual_price }` → pricing_status=quoted |
| POST | `/admin/services/cleaning/{id}/payment` | `{ payment_status }` |
| POST | `/admin/services/cleaning/visits/{visit_id}/schedule` | `{ start_at }` → book slot + notify (status→notified) |
| POST | `/admin/services/cleaning/visits/{visit_id}/status` | `{ status, notes? }` (completed/skipped) |

### 6.7 Admin — unified schedule & pricing & dashboard
| Method | Path | Notes |
|--------|------|------|
| GET | `/admin/services/schedule?from=&to=` | aggregated calendar: EV appointments (survey/install) + service_booking appointments + cleaning visits; each item `{ id, kind, service, start_at, title, ref, link }` |
| GET | `/admin/services/pricing` | convenience read of `service_pricing` (or reuse settings) |
| GET | `/admin/services/dashboard` | KPI aggregates (new bookings this month, active cleaning subs, pending bird quotes, per-service revenue). `per_service.{diagnostic,bird_netting}` additionally carry `status_counts` (per-stage counts, mirrors `ServiceBookingStatus`) plus service-specific derived fields (`next_scheduled_at`, `scheduled_next_7_days`, `avg_hours_completed` for diagnostic; `outstanding_quote_value`, `surveys_next_7_days` for bird netting). `per_service.cleaning` additionally carries `pricing_status_counts`, `visit_status_counts`, `payment_status_counts`, `unpaid_value`, `visits_next_7_days`, `expiring_within_60_days`. All additive, derived from existing queried rows — no schema change. |

> Unified schedule data source = generalized `Appointment` table + `cleaning_visits`
> (per scheduling revision §6). EV rows are **read-only aggregate**; never mutated here.

---

## 7. Notification templates (DB-editable Jinja2, EN + zh-CN copy via i18n on client;
email/sms bodies seeded like existing). ~8 new keys added to `email_templates` & `sms_templates`:

| Key | Trigger |
|-----|---------|
| `service_submission_confirm` | Diagnostic/Bird booking submitted |
| `service_scheduled` | Diagnostic scheduled / confirmed by admin |
| `bird_survey_scheduled` | Bird drone survey time confirmed |
| `bird_quote_ready` | Bird quote created → link to approve |
| `bird_install_scheduled` | Bird install scheduled |
| `service_completed` | Diagnostic/Bird completed |
| `cleaning_subscription_confirm` | Cleaning subscription created |
| `cleaning_visit_upcoming` | A cleaning visit scheduled ("upcoming cleaning") |
| `cleaning_visit_completed` | Cleaning visit completed (optional) |
| `cleaning_renewal_reminder` | 30 days before subscription end (v3.0 notice only) |

Seeded via `bootstrap_service` merge-without-overwrite. Template context variables documented in
the seed constants. Best-effort send (never blocks a booking), row recorded in `notifications`.

---

## 8. i18n key namespace (frontend, EN + zh-CN)

- `home.*` — new 4-card homepage (title, per-service card name/tagline/from-price label).
- `svc.common.*` — shared step framework (progress, next/back, confirm, disclaimer checkbox).
- `svc.diagnostic.*` — intro copy, form fields, problem chips, live-pricing note, disclaimer body.
- `svc.bird.*` — intro, form, pricing formula note, disclaimer body, quote/approve page.
- `svc.cleaning.*` — intro, form, tier live-price, disclaimer body, status page.
- `svc.status.*` — ServiceStatusPage labels.
Disclaimers are full legal paragraphs (three services) authored in both languages.
**Acceptance:** no missing key under either language for any new screen.

---

## 9. Migration plan (Alembic, new revision, down_revision = `a5b6c7d8e9f0` — the true chain head)

1. `ALTER TYPE appointment_kind ADD VALUE` × 4 (`diagnostic`,`bird_survey`,`bird_install`,`cleaning`), idempotent.
2. `appointments`: `case_id` → nullable; add `service_booking_id`, `cleaning_visit_id`
   (nullable FKs + indexes); drop+recreate `ix_appt_slot` as `(start_at, status)`; add CHECK
   `num_nonnull(...) = 1`.
3. Create enums: `service_type`, `service_booking_status`, `quote_status`, `cleaning_tier`,
   `cleaning_pricing_status`, `payment_status_v3`, `cleaning_visit_status`.
4. Create tables: `service_bookings`, `bird_netting_quotes`, `cleaning_subscriptions`,
   `cleaning_visits` (+ indexes + FKs).
5. Data: none required (additive). `service_pricing` SystemSetting seeded by bootstrap, not migration.

> Postgres note: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block with some
> setups; the migration commits the enum additions before creating dependent tables, or uses
> `op.execute` with autocommit as needed.

---

## 10. Test plan (pytest, acceptance)

- **Regression (hard):** EV survey self-book + cancel still works; `test_booking_logic.py` green.
- Shared pool: a `diagnostic` booking consumes the same slot capacity an EV `survey` would
  (fill the pool with one kind → other kind sees the slot as full).
- Diagnostic booking create (submission books slot; disclaimer timestamp recorded).
- Bird netting: submit → admin quote → customer approve (signature) → status `approved`.
- Cleaning: subscription create makes 4 pending visits; visit schedule → `notified`; status flow.
- Tier resolution: ≤20 / 21–35 / ≥36 → tier1/tier2/custom(pending_quote).

---

## 11. Frontend routes

Customer app (`frontend/`), keep the existing `/quote/*` for EV. New services under `/service/*`
top-level; the 4-card landing becomes the app entry (`/` → 4 cards; EV card → `/quote/step1`).

| Route | Page |
|-------|------|
| `/` | ServicesHome (4 cards) |
| `/service/diagnostic` | Diagnostic intro → steps |
| `/service/bird-netting` | Bird netting intro → steps |
| `/service/cleaning` | Cleaning intro → steps |
| `/service/status/:token` | ServiceStatusPage (booking or subscription) |
| `/service/bird-netting/quote/:token` | Bird quote view + sign approve |
| `/quote`, `/quote/*` | **unchanged** EV flow |

Admin app (`admin/`), nav group "Services":

| Route | Page |
|-------|------|
| `/admin/services/schedule` | UnifiedSchedule (four-service calendar, color-coded, filterable) |
| `/admin/services/bookings` | ServiceBookings (segmented All/Diagnostic/Bird Netting) |
| `/admin/services/bookings/:id` | ServiceBookingDetail (incl. bird quote entry) |
| `/admin/services/cleaning` | CleaningSubscriptions (+ per-sub 4-visit calendar) |
| Settings | add "Service Pricing" block |
| Dashboard | add combined KPIs + per-service mini cards |

---

## 12. Build / commit phases

1. Migration + backend models + services (shared pool, service_booking_flow) + routes + pytest.
2. Customer app: 4-card home + 3 submission flows + ServiceStatusPage + bird quote/approve.
3. Admin: UnifiedSchedule + ServiceBookings(+detail) + CleaningSubscriptions + Settings + Dashboard.
4. Notification templates + i18n completion (EN/zh-CN) + disclaimers + final build/test.

Each phase: separate English commit; run `admin` and `frontend` builds; backend pytest per phase.
