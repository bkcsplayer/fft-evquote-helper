import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Card, SectionHeader } from '../components/ui/Card.jsx'
import { StatusTag } from '../components/ui/StatusTag.jsx'
import { SkeletonKpi } from '../components/ui/Skeleton.jsx'
import { describeActivity, toneForCaseStatus } from '../utils/caseStatus.js'
import { accentClass, dotClass, pillClass } from '../utils/tone.js'
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

        {/* §D Diagnostic / Bird Netting / Cleaning — one block per service, same shape */}
        {svcError ? (
          <Card className="p-5"><div className="text-sm font-medium text-rose-700">{svcError}</div></Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-3">
            {svcLoading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonKpi key={i} />)
            ) : (
              <>
                <ServiceBlock kind="diagnostic" tone="amber" title="Diagnostic" data={svc.per_service.diagnostic} to="/admin/services/bookings?type=diagnostic" />
                <ServiceBlock kind="bird_netting" tone="teal" title="Bird Netting" data={svc.per_service.bird_netting} to="/admin/services/bookings?type=bird_netting" />
                <ServiceBlock kind="cleaning" tone="emerald" title="Cleaning" data={svc.per_service.cleaning} to="/admin/services/cleaning" extraLabel="Active subscriptions" extraValue={svc.combined.active_cleaning_subscriptions} />
              </>
            )}
          </div>
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

function ServiceBlock({ kind, tone, title, data, to, extraLabel, extraValue }) {
  return (
    <Link to={to} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <ServiceBlockHeader kind={kind} tone={tone} title={title} />
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900">{data.count_this_month}</span>
        <span className="text-xs font-medium text-slate-500">orders this month</span>
      </div>
      <div className="mt-0.5 text-sm font-semibold text-emerald-700">{moneyCAD(data.revenue_this_month)}</div>
      {extraLabel ? (
        <div className="mt-3 border-t pt-3 text-xs text-slate-500">
          {extraLabel}: <span className="font-bold text-slate-900">{extraValue}</span>
        </div>
      ) : null}
    </Link>
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
