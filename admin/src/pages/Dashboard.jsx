import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Card, SectionHeader } from '../components/ui/Card.jsx'
import { StatusTag } from '../components/ui/StatusTag.jsx'
import { SkeletonKpi } from '../components/ui/Skeleton.jsx'
import { describeActivity, toneForCaseStatus } from '../utils/caseStatus.js'
import { accentClass, dotClass, pillClass, textClass } from '../utils/tone.js'
import { ServiceIcon } from '../utils/serviceIcons.jsx'

function moneyCAD(amount) {
  if (amount === null || amount === undefined) return '—'
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)
}

function relativeTime(iso) {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (!Number.isFinite(diff)) return ''
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString('en-CA')
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-CA') : '—'
}

// Pipeline stages map to one or more raw statuses. `primary` drives the deep-link + tone.
const PIPELINE = [
  { label: 'Request', statuses: ['pending'], primary: 'pending' },
  { label: 'Survey', statuses: ['survey_scheduled', 'survey_completed'], primary: 'survey_scheduled' },
  { label: 'Quote', statuses: ['quoting', 'quoted'], primary: 'quoted' },
  { label: 'Approved', statuses: ['customer_approved'], primary: 'customer_approved' },
  { label: 'Permit', statuses: ['permit_applied', 'permit_approved'], primary: 'permit_applied' },
  { label: 'Install', statuses: ['installation_scheduled', 'installed'], primary: 'installation_scheduled' },
  { label: 'Done', statuses: ['completed'], primary: 'completed' },
]

// Each service's own (simpler) lifecycle — mirrors ServiceBookingStatus / CleaningVisitStatus in
// backend/app/models/models.py. `stages` is the linear main path (feeds FlowStrip's arrow chain);
// `terminals` are off-path end states (cancelled/skipped) shown as a separate chip, not a stage —
// a cancelled job isn't "further along" than a completed one.
const DIAGNOSTIC_STAGES = [
  { label: 'Submitted', key: 'submitted' },
  { label: 'Scheduled', key: 'scheduled' },
  { label: 'In progress', key: 'in_progress' },
  { label: 'Completed', key: 'completed' },
]
const DIAGNOSTIC_TERMINALS = [{ label: 'Cancelled', key: 'cancelled' }]

const BIRD_STAGES = [
  { label: 'Submitted', key: 'submitted' },
  { label: 'Survey', key: 'survey_scheduled' },
  { label: 'Quoted', key: 'quoted' },
  { label: 'Approved', key: 'approved' },
  { label: 'Install', key: 'install_scheduled' },
  { label: 'Completed', key: 'completed' },
]
const BIRD_TERMINALS = [{ label: 'Cancelled', key: 'cancelled' }]

const CLEANING_VISIT_STAGES = [
  { label: 'Pending', key: 'pending' },
  { label: 'Notified', key: 'notified' },
  { label: 'Completed', key: 'completed' },
]
const CLEANING_VISIT_TERMINALS = [{ label: 'Skipped', key: 'skipped' }]

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [svc, setSvc] = useState(null)
  const [evError, setEvError] = useState('')
  const [svcError, setSvcError] = useState('')

  useEffect(() => {
    let alive = true
    // allSettled, not all: a down /services/dashboard must never blank out the EV view (and
    // vice versa) — each line's data loads and fails independently.
    Promise.allSettled([api.get('/dashboard/stats'), api.get('/dashboard/recent-activity'), api.get('/services/dashboard')])
      .then(([s, a, v]) => {
        if (!alive) return
        if (s.status === 'fulfilled') setStats(s.value.data)
        else setEvError(s.reason?.response?.data?.detail || 'Failed to load EV dashboard data')
        if (a.status === 'fulfilled') setActivity(a.value.data || [])
        if (v.status === 'fulfilled') setSvc(v.value.data)
        else setSvcError(v.reason?.response?.data?.detail || 'Failed to load services dashboard data')
      })
    return () => { alive = false }
  }, [])

  const evLoading = !stats && !evError
  const svcLoading = !svc && !svcError
  const counts = stats?.status_counts || {}
  const evCasesTotal = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0)

  const hasFullRevenue = !!stats && !!svc
  const combinedRevenue = (Number(stats?.revenue_month) || 0)
    + (Number(svc?.per_service?.diagnostic?.revenue_this_month) || 0)
    + (Number(svc?.per_service?.bird_netting?.revenue_this_month) || 0)
    + (Number(svc?.per_service?.cleaning?.revenue_this_month) || 0)

  return (
    <AdminShell>
      <div className="space-y-6 animate-fade-in">
        {/* Hero */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Operations Dashboard</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">FFT Control Center</h1>
              <p className="mt-1 text-sm text-slate-400">All four service lines — one screen.</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="cursor-pointer rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* §A Company — cross-line data only; per-line revenue lives on each service block below */}
        <Card className="p-5">
          <SectionHeader eyebrow="Company" title="Across every service line" />
          {evLoading && svcLoading ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => <SkeletonKpi key={i} />)}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Kpi label={hasFullRevenue ? 'Combined revenue' : 'Combined revenue (partial)'} value={moneyCAD(combinedRevenue)} tone="emerald" />
              <Kpi label="Service bookings (month)" value={svc ? svc.combined.new_bookings_this_month : '—'} tone="teal" to="/admin/services/bookings" />
              <Kpi label="EV cases (total)" value={stats ? evCasesTotal : '—'} tone="indigo" to="/admin/cases" />
            </div>
          )}
        </Card>

        {/* §2 Needs attention — cross-line queue */}
        <Card className="p-5">
          <SectionHeader eyebrow="Needs Attention" title="Queues waiting on you, across every line" />
          {evLoading && svcLoading ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
            </div>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {stats ? <QuickLink to="/admin/surveys?filter=reported_unpaid" label="Reported & unpaid deposits" value={stats.surveys_reported_unpaid} tone="amber" /> : null}
              {stats ? <QuickLink to="/admin/installations?filter=completed_email_pending" label="Completion email pending" value={stats.installations_completed_email_pending} tone="teal" /> : null}
              {stats ? <QuickLink to="/admin/permits?quick=needs_action" label="Permits needing revision" value={stats.permits_revision_required} tone="rose" /> : null}
              {svc ? <QuickLink to="/admin/services/bookings?type=bird_netting" label="Pending bird quotes" value={svc.combined.pending_bird_quotes} tone="amber" /> : null}
            </div>
          )}
          {evError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{evError}</div> : null}
          {svcError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{svcError}</div> : null}
        </Card>

        {/* §C EV Chargers — one big service block. Wider than the solar blocks below (the pipeline
            strip needs the width); trimmed to drop what's already visible on the pipeline strip
            or in Needs Attention above, instead of cramming every KPI from the old 4-card layout in. */}
        {evError ? (
          <Card className="p-5"><div className="text-sm font-medium text-rose-700">{evError}</div></Card>
        ) : (
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <ServiceBlockHeader kind="ev" tone="indigo" title="EV Chargers" />
              <Link to="/admin/cases" className="text-xs font-semibold text-indigo-700 hover:underline">All cases &rarr;</Link>
            </div>

            <div className="mt-4">
              {evLoading ? (
                <div className="flex gap-2 overflow-hidden">
                  {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-20 flex-1 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              ) : (
                <LivePipeline counts={counts} />
              )}
            </div>

            {evLoading ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => <SkeletonKpi key={i} />)}
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Kpi label="Revenue (month)" value={moneyCAD(stats.revenue_month)} tone="emerald" />
                <Kpi label="Revenue (quarter)" value={moneyCAD(stats.revenue_quarter)} tone="emerald" />
                <Kpi label="Pipeline value" value={moneyCAD(stats.pipeline_value)} tone="teal" />
                <Kpi label="Completed (month)" value={stats.completed_month_count} tone="emerald" />
                <Kpi label="Surveys next 7d" value={stats.surveys_next_7_days} tone="teal" />
              </div>
            )}

            <div className="mt-5 border-t pt-4">
              <SectionHeader eyebrow="Recent Activity" title="Who did what, just now" />
              <div className="mt-3">
                {evLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                  </div>
                ) : activity.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No activity yet.</p>
                ) : (
                  <ActivityTimeline rows={activity.slice(0, 5)} />
                )}
              </div>
            </div>
          </Card>
        )}

        {/* §D Diagnostic / Bird Netting / Cleaning — each its own full-width block, same shape as
            EV Chargers: icon header, flow diagram, KPI row. Stacked (not side-by-side) since each
            needs the same width as EV for its flow strip to read well. */}
        {svcError ? (
          <Card className="p-5"><div className="text-sm font-medium text-rose-700">{svcError}</div></Card>
        ) : (
          <>
            <ServiceFlowBlock
              kind="diagnostic" tone="amber" title="Diagnostic"
              loading={svcLoading} data={svc?.per_service?.diagnostic}
              allTo="/admin/services/bookings?type=diagnostic"
              stages={DIAGNOSTIC_STAGES} terminals={DIAGNOSTIC_TERMINALS}
              linkFor={(key) => `/admin/services/bookings?type=diagnostic&status=${key}`}
              kpis={svc ? [
                { label: 'Revenue (month)', value: moneyCAD(svc.per_service.diagnostic.revenue_this_month), tone: 'emerald' },
                { label: 'Completed (month)', value: svc.per_service.diagnostic.count_this_month, tone: 'emerald' },
                { label: 'Next visit', value: fmtDate(svc.per_service.diagnostic.next_scheduled_at), tone: 'amber' },
                { label: 'Scheduled next 7d', value: svc.per_service.diagnostic.scheduled_next_7_days, tone: 'amber' },
                { label: 'Avg hours/job', value: svc.per_service.diagnostic.avg_hours_completed ?? '—', tone: 'slate' },
              ] : []}
            />

            <ServiceFlowBlock
              kind="bird_netting" tone="teal" title="Bird Netting"
              loading={svcLoading} data={svc?.per_service?.bird_netting}
              allTo="/admin/services/bookings?type=bird_netting"
              stages={BIRD_STAGES} terminals={BIRD_TERMINALS}
              linkFor={(key) => `/admin/services/bookings?type=bird_netting&status=${key}`}
              kpis={svc ? [
                { label: 'Revenue (month)', value: moneyCAD(svc.per_service.bird_netting.revenue_this_month), tone: 'emerald' },
                { label: 'Jobs won (month)', value: svc.per_service.bird_netting.count_this_month, tone: 'emerald' },
                { label: 'Outstanding quotes', value: moneyCAD(svc.per_service.bird_netting.outstanding_quote_value), tone: 'amber' },
                { label: 'Surveys next 7d', value: svc.per_service.bird_netting.surveys_next_7_days, tone: 'teal' },
                { label: 'Awaiting install', value: Number(svc.per_service.bird_netting.status_counts?.approved || 0), tone: 'amber' },
              ] : []}
            />

            <ServiceFlowBlock
              kind="cleaning" tone="emerald" title="Cleaning"
              loading={svcLoading} data={svc?.per_service?.cleaning}
              allTo="/admin/services/cleaning"
              stages={CLEANING_VISIT_STAGES} terminals={CLEANING_VISIT_TERMINALS}
              linkFor={() => '/admin/services/cleaning'}
              kpis={svc ? [
                { label: 'Active subs', value: svc.combined.active_cleaning_subscriptions, tone: 'emerald' },
                { label: 'Unpaid', value: svc.per_service.cleaning.payment_status_counts?.unpaid || 0, sub: moneyCAD(svc.per_service.cleaning.unpaid_value), tone: 'amber' },
                { label: 'Pending price quotes', value: svc.per_service.cleaning.pricing_status_counts?.pending_quote || 0, tone: 'amber' },
                { label: 'Visits next 7d', value: svc.per_service.cleaning.visits_next_7_days, tone: 'teal' },
                { label: 'Expiring ≤60d', value: svc.per_service.cleaning.expiring_within_60_days, tone: 'amber' },
              ] : []}
            />
          </>
        )}
      </div>
    </AdminShell>
  )
}

function ServiceBlockHeader({ kind, tone, title }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${pillClass(tone)}`}>
        <ServiceIcon kind={kind} className="h-4.5 w-4.5" />
      </span>
      <div className="text-sm font-bold tracking-tight text-slate-900">{title}</div>
    </div>
  )
}

// One full-width service block: icon header + FlowStrip (visual flow diagram) + KPI row —
// same shape as the EV Chargers block above, parametrized per service instead of one-off per card.
function ServiceFlowBlock({ kind, tone, title, loading, data, allTo, stages, terminals, linkFor, kpis }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <ServiceBlockHeader kind={kind} tone={tone} title={title} />
        {data ? (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{data.count_this_month} this month · {moneyCAD(data.revenue_this_month)}</span>
            <Link to={allTo} className={`font-semibold hover:underline ${textClass(tone)}`}>All &rarr;</Link>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex gap-2 overflow-hidden">
            {stages.map((s) => <div key={s.key} className="h-20 flex-1 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : (
          <FlowStrip stages={stages} terminals={terminals} counts={data?.status_counts || data?.visit_status_counts} tone={tone} linkFor={linkFor} />
        )}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonKpi key={i} />)}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass(k.tone)}`} />
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k.label}</div>
              </div>
              <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{k.value ?? '—'}</div>
              {k.sub ? <div className="mt-0.5 text-xs font-medium text-slate-500">{k.sub}</div> : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// Visual flow diagram for a service's own (simpler) lifecycle — same interaction language as
// LivePipeline (EV) but parametrized so the 3 solar/diagnostic services share one implementation
// instead of 3 near-duplicates. EV keeps its own LivePipeline: it needs multi-status-per-stage
// merging and per-stage tone, freedoms these single-status, single-tone services don't need.
function FlowStrip({ stages, terminals, counts, tone, linkFor }) {
  const steps = stages.map((s) => ({ ...s, count: Number(counts?.[s.key] || 0) }))
  const lastKey = stages[stages.length - 1]?.key
  const active = steps.filter((s) => s.key !== lastKey)
  const maxCount = Math.max(0, ...active.map((s) => s.count))

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {steps.map((s, idx) => {
        const isHot = s.count > 0 && s.count === maxCount && s.key !== lastKey
        return (
          <div key={s.key} className="flex flex-1 items-stretch gap-2">
            <Link
              to={linkFor(s.key)}
              className={`group relative flex-1 cursor-pointer overflow-hidden rounded-xl border bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${isHot ? 'ring-2 ring-amber-400' : 'border-slate-200'}`}
            >
              <span className={`absolute inset-x-0 top-0 h-1 ${accentClass(tone)}`} />
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums text-slate-900">{s.count}</span>
                {isHot ? <span className="text-[10px] font-semibold uppercase text-amber-600">busiest</span> : null}
              </div>
            </Link>
            {idx < steps.length - 1 ? (
              <div className="hidden items-center text-slate-300 md:flex">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ) : null}
          </div>
        )
      })}
      {terminals?.length ? (
        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
          {terminals.map((t) => (
            <Link
              key={t.key}
              to={linkFor(t.key)}
              className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 shadow-sm transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider">{t.label}</span>
              <span className="text-lg font-bold tabular-nums">{Number(counts?.[t.key] || 0)}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ── Sub-components ── */

function sumStatuses(counts, statuses) {
  return statuses.reduce((a, s) => a + Number(counts?.[s] || 0), 0)
}

function LivePipeline({ counts }) {
  const steps = PIPELINE.map((s) => ({ ...s, count: sumStatuses(counts, s.statuses) }))
  // Highlight the busiest active (non-done) stage as the backlog needing attention.
  const active = steps.filter((s) => s.primary !== 'completed')
  const maxCount = Math.max(0, ...active.map((s) => s.count))

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {steps.map((s, idx) => {
        const tone = toneForCaseStatus(s.primary)
        const isHot = s.count > 0 && s.count === maxCount && s.primary !== 'completed'
        return (
          <div key={s.label} className="flex flex-1 items-stretch gap-2">
            <Link
              to={`/admin/cases?status=${s.primary}`}
              className={`group relative flex-1 cursor-pointer overflow-hidden rounded-xl border bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${isHot ? 'ring-2 ring-amber-400' : 'border-slate-200'}`}
            >
              <span className={`absolute inset-x-0 top-0 h-1 ${accentClass(tone)}`} />
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums text-slate-900">{s.count}</span>
                {isHot ? <span className="text-[10px] font-semibold uppercase text-amber-600">busiest</span> : null}
              </div>
            </Link>
            {idx < steps.length - 1 ? (
              <div className="hidden items-center text-slate-300 md:flex">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ActivityTimeline({ rows }) {
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-4">
      {rows.map((a, i) => {
        const { label, tone } = describeActivity(a)
        return (
          <li key={`${a.case_id || 'x'}|${a.created_at || ''}|${i}`} className="relative">
            <span className={`absolute -left-[1.30rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white ${dotClass(tone)}`} />
            <div className="flex items-start justify-between gap-2">
              <Link to={`/admin/cases/${a.case_id}`} className="text-sm font-semibold text-slate-900 hover:text-emerald-700 hover:underline">
                {a.customer_nickname || a.reference_number || 'Case'}
              </Link>
              <span className="shrink-0 text-[11px] font-medium text-slate-400">{relativeTime(a.created_at)}</span>
            </div>
            <div className="mt-0.5 text-sm text-slate-600">{label}</div>
            <div className="mt-1.5 flex items-center gap-2">
              <StatusTag status={a.to_status} />
              {a.phone ? <span className="text-xs text-slate-400">{a.phone}</span> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Kpi({ label, value, tone = 'slate', to }) {
  const inner = (
    <div className={`h-full rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md ${to ? 'cursor-pointer' : ''}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass(tone)}`} />
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value ?? '—'}</div>
    </div>
  )
  if (to) return <Link to={to}>{inner}</Link>
  return inner
}

function QuickLink({ to, label, value, tone = 'slate' }) {
  return (
    <Link to={to} className="group flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-slate-50">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass(tone)}`} />
        <div className="text-sm font-medium text-slate-600 group-hover:text-slate-900">{label}</div>
      </div>
      <div className="text-xl font-bold tabular-nums text-slate-900">{value ?? '—'}</div>
    </Link>
  )
}
