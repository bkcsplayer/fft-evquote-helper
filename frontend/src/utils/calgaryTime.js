// Calgary display helpers — every customer-facing time on the web uses these (ADR-018/021).
// en-US is mandatory: en-CA prints "a.m."; we build the AM/PM space ourselves so ICU's narrow
// no-break space never leaks. Notifications use commas (backend timefmt), the web uses "·".
// No tz abbreviation (ADR-021): pages carry "Calgary time" copy instead.
// Alberta Official Time Act: permanent UTC-6 from 2026-11-01 — browser ICU tz data may be stale
// (would show UTC-7 in winter), so instants from the switch on use a fixed UTC-6 zone.
const PERMANENT_UTC6_FROM = Date.UTC(2026, 10, 1, 8) // 2026-11-01T08:00:00Z
const tzFor = (d) => (d.getTime() >= PERMANENT_UTC6_FROM ? 'Etc/GMT+6' : 'America/Edmonton') // Etc/GMT+6 = UTC-6
const parts = (v, opts) => { const d = new Date(v); return Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tzFor(d), ...opts }).formatToParts(d).map((p) => [p.type, p.value])) }
const WHEN = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
export function fmtCalgary(iso) { const p = parts(iso, WHEN); return `${p.weekday}, ${p.month} ${p.day} · ${p.hour}:${p.minute} ${p.dayPeriod}` }
export function fmtCalgaryShort(iso) { const p = parts(iso, WHEN); return `${p.month} ${p.day}, ${p.hour}:${p.minute} ${p.dayPeriod}` }
export function fmtCalgaryDay(v) { const p = parts(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v, { weekday: 'short', month: 'short', day: 'numeric' }); return `${p.weekday}, ${p.month} ${p.day}` }
export function fmtCalgaryHour(iso) { const p = parts(iso, { hour: 'numeric', minute: '2-digit' }); return `${p.hour}:${p.minute} ${p.dayPeriod}` }
