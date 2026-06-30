import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Card, SectionHeader } from '../components/ui/Card.jsx'
import { StatusTag } from '../components/ui/StatusTag.jsx'
import { SkeletonKpi } from '../components/ui/Skeleton.jsx'
import { describeActivity, statusLabel, toneForCaseStatus } from '../utils/caseStatus.js'
import { accentClass, barClass, dotClass } from '../utils/tone.js'

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
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([api.get('/dashboard/stats'), api.get('/dashboard/recent-activity')])
      .then(([s, a]) => {
        if (!alive) return
        setStats(s.data)
        setActivity(a.data || [])
      })
      .catch((e) => alive && setError(e?.response?.data?.detail || 'Failed to load dashboard'))
    return () => { alive = false }
  }, [])

  const loading = !stats
  const counts = stats?.status_counts || {}

  return (
    <AdminShell>
      <div className="space-y-6 animate-fade-in">
        {/* Hero */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Operations Dashboard</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">FFT Control Center</h1>
              <p className="mt-1 text-sm text-slate-400">Live pipeline, queues, and money — one screen.</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="cursor-pointer rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
            >
              Refresh
            </button>
          </div>
          {error ? (
            <div className="mx-4 mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        {/* Live pipeline */}
        <Card className="p-5">
          <SectionHeader eyebrow="Live Pipeline" title="Cases at each stage — click to drill in" />
          <div className="mt-4">
            {loading ? (
              <div className="flex gap-2 overflow-hidden">
                {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-20 flex-1 animate-pulse rounded-xl bg-slate-100" />)}
              </div>
            ) : (
              <LivePipeline counts={counts} />
            )}
          </div>
        </Card>

        {/* KPI + Queue */}
        <div className="grid gap-5 lg:grid-cols-12">
          <Card className="p-5 lg:col-span-7">
            <SectionHeader eyebrow="KPI Snapshot" title="What needs attention now" action={<span className="text-xs text-slate-400">Live</span>} />
            {loading ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 9 }).map((_, i) => <SkeletonKpi key={i} />)}
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Kpi label="Pending" value={stats.pending_cases} tone="slate" to="/admin/cases?status=pending" />
                  <Kpi label="To quote" value={stats.cases_to_quote} tone="amber" />
                  <Kpi label="Waiting approval" value={stats.quoted_waiting_approval} tone="amber" to="/admin/cases?status=quoted" />
                  <Kpi label="Installs scheduled" value={stats.installations_scheduled} tone="teal" to="/admin/cases?status=installation_scheduled" />
                  <Kpi label="Surveys next 7d" value={stats.surveys_next_7_days} tone="teal" />
                  <Kpi label="Permits: revision" value={stats.permits_revision_required} tone="amber" to="/admin/permits?quick=needs_action" />
                </div>
                <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi label="Pipeline value" value={moneyCAD(stats.pipeline_value)} tone="teal" />
                  <Kpi label="Revenue (month)" value={moneyCAD(stats.revenue_month)} tone="emerald" />
                  <Kpi label="Revenue (quarter)" value={moneyCAD(stats.revenue_quarter)} tone="emerald" />
                  <Kpi label="Completed (month)" value={stats.completed_month_count} tone="emerald" />
                </div>
              </>
            )}
          </Card>

          <Card className="p-5 lg:col-span-5">
            <SectionHeader eyebrow="Action Queue" title="Things waiting on you" />
            {loading ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => <SkeletonKpi key={i} />)}
              </div>
            ) : (
              <div className="mt-4 grid gap-2">
                <QuickLink to="/admin/surveys?filter=reported_unpaid" label="Reported & unpaid deposits" value={stats.surveys_reported_unpaid} tone="amber" />
                <QuickLink to="/admin/installations?filter=completed_email_pending" label="Completion email pending" value={stats.installations_completed_email_pending} tone="teal" />
                <QuickLink to="/admin/permits?quick=needs_action" label="Permits needing revision" value={stats.permits_revision_required} tone="rose" />
              </div>
            )}
          </Card>

          {/* Cases by status (grouped) */}
          <Card className="p-5 lg:col-span-7">
            <SectionHeader eyebrow="Cases by Status" title="Pipeline distribution" />
            <div className="mt-4">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 flex-1 animate-pulse rounded-full bg-slate-200" />
                      <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                    </div>
                  ))}
                </div>
              ) : (
                <StatusGroups counts={counts} />
              )}
            </div>
          </Card>

          {/* Recent activity timeline */}
          <Card className="p-5 lg:col-span-5">
            <SectionHeader eyebrow="Recent Activity" title="Who did what, just now" />
            <div className="mt-4">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No activity yet.</p>
              ) : (
                <ActivityTimeline rows={activity.slice(0, 8)} />
              )}
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
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

const STATUS_GROUPS = [
  { label: 'Intake', statuses: ['pending'] },
  { label: 'Survey', statuses: ['survey_scheduled', 'survey_completed'] },
  { label: 'Quote', statuses: ['quoting', 'quoted'] },
  { label: 'Approved', statuses: ['customer_approved'] },
  { label: 'Permit', statuses: ['permit_applied', 'permit_approved'] },
  { label: 'Install', statuses: ['installation_scheduled', 'installed'] },
  { label: 'Closed', statuses: ['completed', 'cancelled'] },
]

function StatusGroups({ counts }) {
  const grand = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0) || 1

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wider">Stage</span>
        <span className="font-semibold uppercase tracking-wider">{grand} total</span>
      </div>
      {STATUS_GROUPS.map((g) => {
        const subs = g.statuses
          .map((s) => ({ s, v: Number(counts?.[s] || 0), tone: toneForCaseStatus(s) }))
          .filter((x) => x.v > 0)
        const total = g.statuses.reduce((a, s) => a + Number(counts?.[s] || 0), 0)
        const widthPct = Math.round((total / grand) * 100)
        const sumPositive = subs.reduce((a, b) => a + b.v, 0) || 1
        const title = g.statuses.map((s) => `${statusLabel(s)}: ${Number(counts?.[s] || 0)}`).join('  •  ')
        return (
          <div key={g.label} className="flex items-center gap-3" title={title}>
            <div className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-600">{g.label}</div>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="flex h-3" style={{ width: `${widthPct}%` }}>
                {subs.map((sub) => (
                  // flexGrow weights avoid per-segment rounding gaps (segments always fill exactly).
                  <div
                    key={sub.s}
                    className={`${barClass(sub.tone)} transition-all duration-500`}
                    style={{ flexGrow: sub.v / sumPositive }}
                  />
                ))}
              </div>
            </div>
            <div className="w-20 shrink-0 text-right text-xs font-bold tabular-nums text-slate-700">
              {total}
              <span className="ml-1 font-medium text-slate-400">{Math.round((total / grand) * 100)}%</span>
            </div>
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
