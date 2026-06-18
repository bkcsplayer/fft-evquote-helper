import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Pill } from '../components/ui/Pill.jsx'
import { SkeletonKpi } from '../components/ui/Skeleton.jsx'
import { toneForCaseStatus } from '../utils/caseStatus.js'

function toneForActivityRow(a) {
  const note = String(a?.note || '')
  const to = String(a?.to_status || '')
  if (note.includes('Deposit marked paid')) return 'emerald'
  if (note.includes('Customer reported e-transfer')) return 'amber'
  if (note.includes('Completion email sent')) return 'emerald'
  if (note.includes('Permit approved')) return 'emerald'
  if (note.toLowerCase().includes('revision')) return 'amber'
  if (to === 'cancelled') return 'rose'
  if (to === 'customer_approved') return 'emerald'
  if (to === 'quoted') return 'teal'
  if (to === 'installation_scheduled') return 'teal'
  return 'slate'
}

function moneyCAD(amount) {
  if (amount === null || amount === undefined) return '—'
  const n = typeof amount === 'string' ? Number(amount) : amount
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError('')
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

  return (
    <AdminShell>
      <div className="space-y-6 animate-fade-in">
        {/* Hero header */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 shadow-lg">
          <div className="px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Operations Dashboard</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">FFT SOP Control Center</h1>
                <p className="mt-1 text-sm text-slate-400">One screen. One flow. Fewer mistakes.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/admin/cases" className="rounded-lg bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20">
                  Cases
                </Link>
                <Link to="/admin/surveys" className="rounded-lg bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20">
                  Surveys
                </Link>
                <Link to="/admin/permits" className="rounded-lg bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20">
                  Permits
                </Link>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-all hover:bg-slate-100 active:scale-95"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="mt-5">
              <SopFlow />
            </div>
          </div>

          {error ? (
            <div className="mx-4 mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        {/* KPI + Queue section */}
        <div className="grid gap-5 lg:grid-cols-12">
          {/* KPI snapshot */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-7">
            <div className="mb-4 flex items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">KPI Snapshot</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">What needs attention now</p>
              </div>
              <span className="text-xs text-slate-400">Live</span>
            </div>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 9 }).map((_, i) => <SkeletonKpi key={i} />)}
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Kpi label="Pending" value={stats.pending_cases} tone="slate" />
                  <Kpi label="To quote" value={stats.cases_to_quote} tone="amber" />
                  <Kpi label="Waiting approval" value={stats.quoted_waiting_approval} tone="amber" />
                  <Kpi label="Installs scheduled" value={stats.installations_scheduled} tone="teal" />
                  <Kpi label="Surveys next 7d" value={stats.surveys_next_7_days} tone="teal" />
                  <Kpi label="Permits: revision" value={stats.permits_revision_required} tone="amber" to="/admin/permits?quick=needs_action" />
                </div>
                <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3">
                  <Kpi label="Revenue (month)" value={moneyCAD(stats.revenue_month)} tone="emerald" />
                  <Kpi label="Revenue (quarter)" value={moneyCAD(stats.revenue_quarter)} tone="emerald" />
                  <Kpi label="Completed (month)" value={stats.completed_month_count} tone="emerald" />
                </div>
              </>
            )}
          </div>

          {/* Queue mix */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Work Queue Mix</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Balance the flow</p>
            <div className="mt-4">
              {loading ? (
                <div className="space-y-3">
                  <div className="h-3 animate-pulse rounded-full bg-slate-200" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
                  </div>
                </div>
              ) : (
                <QueueMix
                  pending={stats.pending_cases || 0}
                  toQuote={stats.cases_to_quote || 0}
                  waitingApproval={stats.quoted_waiting_approval || 0}
                  installsScheduled={stats.installations_scheduled || 0}
                />
              )}
            </div>
            {!loading && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <QuickLink to="/admin/surveys?filter=reported_unpaid" label="Reported & unpaid deposits" value={stats.surveys_reported_unpaid} />
                <QuickLink to="/admin/installations?filter=completed_email_pending" label="Completion email pending" value={stats.installations_completed_email_pending} />
              </div>
            )}
          </div>

          {/* Status bars */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cases by Status</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Pipeline distribution</p>
            <div className="mt-4">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 flex-1 animate-pulse rounded-full bg-slate-200" />
                      <div className="h-3 w-10 animate-pulse rounded bg-slate-200" />
                    </div>
                  ))}
                </div>
              ) : (
                <StatusBars statusCounts={stats?.status_counts || {}} />
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent Activity</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Latest status changes</p>
            <div className="mt-4 space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-xl border p-3">
                    <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-200" />
                  </div>
                ))
              ) : activity.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No activity yet.</p>
              ) : (
                activity.slice(0, 8).map((a) => (
                  <div key={a.created_at + a.case_id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-sm transition-colors hover:bg-slate-100/70">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                      <Pill tone={toneForActivityRow(a)}>{a.to_status}</Pill>
                    </div>
                    <div className="mt-1.5 text-slate-700">
                      <span className="text-slate-400">{a.from_status || '—'}</span>
                      <span className="mx-1 text-slate-300">→</span>
                      <span className="font-semibold">{a.to_status}</span>
                    </div>
                    {a.note ? <div className="mt-1 text-xs text-slate-500">{a.note}</div> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}

/* ── Sub-components ── */

function Kpi({ label, value, tone = 'slate', to }) {
  const borders = { teal: 'border-l-teal-500', amber: 'border-l-amber-500', emerald: 'border-l-emerald-500', rose: 'border-l-rose-500', slate: 'border-l-slate-400' }
  const inner = (
    <div className={`rounded-xl border border-l-2 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md ${borders[tone] || borders.slate}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value ?? '—'}</div>
    </div>
  )
  if (to) return <Link to={to}>{inner}</Link>
  return inner
}

function QuickLink({ to, label, value }) {
  return (
    <Link to={to} className="group rounded-xl border bg-white px-4 py-3 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 group-hover:text-slate-700">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value ?? '—'}</div>
    </Link>
  )
}

function SopFlow() {
  const steps = [
    { label: 'Request', status: 'pending', note: 'Customer submits request' },
    { label: 'Schedule survey', status: 'survey_scheduled', note: 'Pick a date/time' },
    { label: 'Complete survey', status: 'survey_completed', note: 'Upload photos & notes' },
    { label: 'Quote', status: 'quoted', note: 'Create, preview, send' },
    { label: 'Customer approve', status: 'customer_approved', note: 'Signature unlocks next steps' },
    { label: 'Permit', status: 'permit_applied', note: 'Apply/track approval' },
    { label: 'Installation', status: 'installation_scheduled', note: 'Schedule & mark installed' },
    { label: 'Done', status: 'completed', note: 'Completion email' },
  ]
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {steps.map((s, idx) => (
        <div key={s.label} className="flex items-stretch gap-2">
          <div className="min-w-[150px] rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{s.label}</span>
              <Pill tone={toneForCaseStatus(s.status)}>{s.status}</Pill>
            </div>
            <div className="mt-1 text-xs text-slate-400">{s.note}</div>
          </div>
          {idx < steps.length - 1 ? (
            <div className="hidden items-center md:flex">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white/40">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function StatusBars({ statusCounts }) {
  const items = [
    { status: 'pending', label: 'Pending' },
    { status: 'survey_scheduled', label: 'Survey scheduled' },
    { status: 'survey_completed', label: 'Survey completed' },
    { status: 'quoted', label: 'Quoted' },
    { status: 'customer_approved', label: 'Approved' },
    { status: 'permit_applied', label: 'Permit applied' },
    { status: 'permit_approved', label: 'Permit approved' },
    { status: 'installation_scheduled', label: 'Install scheduled' },
    { status: 'installed', label: 'Installed' },
    { status: 'completed', label: 'Completed' },
    { status: 'cancelled', label: 'Cancelled' },
  ]
  const values = items.map((i) => Number(statusCounts?.[i.status] || 0))
  const max = Math.max(1, ...values)
  return (
    <div className="space-y-2.5">
      {items.map((i) => {
        const v = Number(statusCounts?.[i.status] || 0)
        const pct = Math.round((v / max) * 100)
        return (
          <div key={i.status} className="flex items-center gap-3">
            <div className="w-36 truncate text-[11px] font-semibold uppercase tracking-wider text-slate-600">{i.label}</div>
            <div className="flex-1">
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${barClass(toneForCaseStatus(i.status))}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="w-9 text-right text-xs font-bold tabular-nums text-slate-700">{v}</div>
          </div>
        )
      })}
    </div>
  )
}

function QueueMix({ pending, toQuote, waitingApproval, installsScheduled }) {
  const items = [
    { label: 'Pending', v: pending, tone: 'slate' },
    { label: 'To quote', v: toQuote, tone: 'amber' },
    { label: 'Waiting approval', v: waitingApproval, tone: 'amber' },
    { label: 'Installs scheduled', v: installsScheduled, tone: 'teal' },
  ]
  const total = items.reduce((a, b) => a + (Number(b.v) || 0), 0) || 1
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {items.map((i) => (
          <div
            key={i.label}
            className={barClass(i.tone)}
            style={{ width: `${Math.round(((Number(i.v) || 0) / total) * 100)}%` }}
            title={`${i.label}: ${i.v}`}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <div key={i.label} className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${dotClass(i.tone)}`} />
              <span className="text-slate-600">{i.label}</span>
            </div>
            <span className="font-bold tabular-nums text-slate-900">{i.v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function barClass(tone) {
  switch (tone) {
    case 'teal': return 'bg-teal-500'
    case 'amber': return 'bg-amber-500'
    case 'emerald': return 'bg-emerald-500'
    case 'rose': return 'bg-rose-500'
    case 'indigo': return 'bg-indigo-500'
    default: return 'bg-slate-500'
  }
}

function dotClass(tone) {
  switch (tone) {
    case 'teal': return 'bg-teal-500'
    case 'amber': return 'bg-amber-500'
    case 'emerald': return 'bg-emerald-500'
    case 'rose': return 'bg-rose-500'
    case 'indigo': return 'bg-indigo-500'
    default: return 'bg-slate-500'
  }
}
