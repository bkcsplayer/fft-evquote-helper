# Cleanup Report — fft-evquote-helper

> Generated during the Phase 2 conservative dead-code pass. Policy: only delete what is
> provably unreferenced; everything uncertain is listed under "待你确认" for sign-off.

## ✅ 已删 / 已合并 (done — safe, verified no external references)

| Item | Location | Action |
|---|---|---|
| Duplicate `_is_local_url` | `app/services/notification_service.py` | Removed; now imports `is_local_url` from `app/utils/url_utils.py` (single source). Verified only call site was `_with_brand_profile`. |
| Duplicate Jinja env factory `_string_env` | `app/services/notification_service.py` | Removed; merged into `_templates_env` (they were byte-identical). All 3 call sites repointed. |
| Unused `urlparse` import | `app/services/notification_service.py` | Removed (only used by the deleted `_is_local_url`). |

App import + `py_compile` verified green after each change.

## 🔧 已收敛 (kept but clarified — not deleted)

| Item | Location | Note |
|---|---|---|
| Stripe checkout / webhook | `app/api/v1/public/payments.py` | Both already `raise 410`. Added an explicit comment: disabled, manual e-transfer only, kept until the Payment ledger (Phase 5) supersedes them. Frontend may still reference the routes, so not removed. |
| Dashboard `surveys_reported_unpaid` | `app/api/v1/admin/dashboard.py` | Was matching `CaseStatusHistory.note == "Customer reported e-transfer sent"`. Switched to the structured `Survey.deposit_reported` flag (Phase 1). More robust; old string-matching path retired. |

## ❓ 待你确认 (candidates — NOT deleted, need your decision)

These are "once useful, now likely redundant." They are migration/compat scaffolding that
is safe to remove **only once all deployments have run past the relevant upgrade**.

| # | Item | Location | Why it's a candidate | Risk if removed |
|---|---|---|---|---|
| 1 | `OLD_*` template constants + "safe upgrade" replace logic | `app/services/bootstrap_service.py` | One-shot migration: replaces a DB template only if it still equals the old default. Dead weight once every env has upgraded. | If an un-upgraded DB exists, it won't auto-refresh stale default templates. Low. |
| 2 | `repair_charger_brand_seed` | `app/services/data_fix_service.py` (called at startup) | Best-effort idempotent patch for garbled Chinese brand names (Windows encoding fix) at `sort_order` 9/10. | If a DB still has garbled seeds, they won't auto-repair. Low. |
| 3 | `Survey.stripe_payment_id` column + Stripe config | `app/models/models.py`, `app/config.py` | Stripe is fully disabled (410). Column is always set to `None`. `stripe_secret_key`/`stripe_webhook_secret` unused. | Superseded by Payment ledger (Phase 5). Removing now needs a migration; defer to Phase 5 where `method=stripe` replaces it cleanly. |
| 4 | Legacy Google Places branch | `frontend/src/components/PlacesAddressInput.jsx` (`modeRef='legacy'`) | `g.maps.places.Autocomplete` path is "blocked for new projects" per code comments — effectively unreachable; fallback-only. | If an old Google project key is used, the legacy fallback disappears. Low–medium. Recommend keeping as fallback. |
| 5 | Deprecated startup hook | `app/main.py` `@app.on_event("startup")` | Deprecated in favor of FastAPI lifespan handlers. Not dead, but aging. | None functionally; modernization only. Suggested as a Part F follow-up. |

### Recommendation
- Items **1 & 2**: safe to delete after confirming production DB has booted at least once on the current code (templates/brands already seeded). Quick win.
- Item **3**: fold into Phase 5 (Payment ledger) so the Stripe column/config removal rides one migration.
- Item **4**: keep (cheap fallback, low maintenance).
- Item **5**: optional modernization, low priority.

---

## 🔐 Security review follow-ups (Phase 4)

Fixed during Phase 4 (Python + security review):
- Notification failures can no longer roll back / 500 a customer transaction (`notify_admin_event` try/except + SAVEPOINT-isolated `_record_notification`).
- e-transfer replay guard (idempotent on `deposit_reported`).
- Dev super-admin: kept the strict `APP_ENV == "development"` gate + an explicit warning log. (A secondary "refuse if SMTP/Twilio present" guard was tried but reverted — dev boxes legitimately configure SMTP/mailpit, so it produced false positives and broke the dev/test admin bootstrap.)
- Size caps on customer-supplied fields (`signature_data`, `terms_text`, `signed_name`, `sender_name`, `note`, `token`).
- Calendar + dashboard now read the structured `deposit_reported`/`deposit_reported_at` columns.

### 二期 review (Phases 5–8) — fixed
- **CSV formula injection** in monthly export (`_csv_safe` prefixes risky cells).
- **Deposit/refund desync**: `_sync_survey_deposit` now nets received deposits against refunds and runs on every payment mutation (refunds correctly flip `deposit_paid` back).
- **Signed-quote protection**: `generate-quote-from-bom` refuses (409) if the active quote is already customer-signed.
- Payment update uses `exclude_unset` (can clear reference/note) + clears `received_at` on status revert; BOM `material_id` validated as UUID (400 not 500); BOM-generated quote permit fee defaults to 349.00; attachment delete logs file errors + extension whitelist.
- **Frontend**: permit-number field now locks after approval; BOM material picker id compare hardened; non-image attachments open directly (no broken `<img>` preview); finance margin null-safe.

**Deferred —二期 (low impact at this scale):**
- N+1 in `GET /admin/finance/export` (3 queries per completed case). For this business (small completed-cases/month, rare manual export) it's sub-second; revisit with bulk-loading if volume grows.

**Deferred — need your decision (not done, out of conservative scope / require new infra):**
| # | Finding | Why deferred | Suggested action |
|---|---|---|---|
| S1 | **No rate limiting** on public unauthenticated POSTs (`/payments/etransfer-notify`, `/quotes/approve`) | Needs a new dep (`slowapi`) + Redis; system-wide architectural gap, pre-existing | Add `slowapi` limiter (e.g. 5/min/IP) before next deploy |
| S2 | `X-Forwarded-Host`/`-Proto` trusted unconditionally in `url_utils.public_base_url` → SMS deep-link could be spoofed if backend is directly reachable | Pre-existing; changing it alters existing proxy behavior | In production, trust only configured `FRONTEND_URL`, or use `ProxyHeadersMiddleware` with a trusted-proxy allowlist |
| S3 | `terms_snapshot` stores customer-supplied text verbatim | Mitigated now by 50k cap; full sanitization needs `bleach` (new dep) | Phase 7 must render `terms_snapshot` as **plain text** (React escapes by default — do NOT use `dangerouslySetInnerHTML`); add `bleach` only if rich-text is ever needed |
| S4 | `APP_ENV` defaults to `"development"` | Changing default to required could break dev flows; secondary guard added instead | Optional: make `APP_ENV` explicit (no default) in a future hardening pass |
