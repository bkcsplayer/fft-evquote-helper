import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Pill } from '../components/ui/Pill.jsx'
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
    setError('')
    Promise.all([api.get('/dashboard/stats'), api.get('/dashboard/recent-activity')])
      .then(([s, a]) => {
        if (!alive) return
        setStats(s.data)
        setActivity(a.data || [])
      })
      .catch((e) => alive && setError(e?.response?.data?.detail || 'Failed to load dashboard'))
    return () => {
      alive = false
    }
  }, [])

  return (
    <AdminShell>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-teal-900 px-6 py-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-white/70">Operations dashboard</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight">FFT SOP Control Center</div>
                <div className="mt-1 text-sm text-white/80">One screen. One flow. Fewer mistakes.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/admin/cases" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                  Cases
                </Link>
                <Link to="/admin/surveys" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                  Surveys
                </Link>
                <Link to="/admin/permits" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                  Permits
                </Link>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-white/90"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="mt-5">
              <SopFlow />
            </div>
          </div>

          {error ? <div className="m-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

          <div className="grid gap-4 p-4 lg:grid-cols-12">
            <div className="rounded-2xl border bg-white p-5 lg:col-span-7">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">KPI snapshot</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">What needs attention now</div>
                </div>
                <div className="text-xs text-slate-500">Live from database</div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Kpi label="Pending" value={stats?.pending_cases} tone="slate" />
                <Kpi label="To quote" value={stats?.cases_to_quote} tone="amber" />
                <Kpi label="Waiting approval" value={stats?.quoted_waiting_approval} tone="amber" />
                <Kpi label="Installs scheduled" value={stats?.installations_scheduled} tone="teal" />
                <Kpi label="Surveys next 7 days" value={stats?.surveys_next_7_days} tone="teal" />
                <Kpi label="Permits: revision" value={stats?.permits_revision_required} tone="amber" to="/admin/permits?quick=needs_action" />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Kpi label="Revenue (month)" value={moneyCAD(stats?.revenue_month)} tone="emerald" />
                <Kpi label="Revenue (quarter)" value={moneyCAD(stats?.revenue_quarter)} tone="emerald" />
                <Kpi label="Completed (month)" value={stats?.completed_month_count} tone="emerald" />
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 lg:col-span-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Work queue mix</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">Balance the flow</div>
              <div className="mt-4">
                <QueueMix
                  pending={stats?.pending_cases || 0}
                  toQuote={stats?.cases_to_quote || 0}
                  waitingApproval={stats?.quoted_waiting_approval || 0}
                  installsScheduled={stats?.installations_scheduled || 0}
                />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <QuickLink to="/admin/surveys?filter=reported_unpaid" label="Reported & unpaid deposits" value={stats?.surveys_reported_unpaid} />
                <QuickLink
                  to="/admin/installations?filter=completed_email_pending"
                  label="Completion email pending"
                  value={stats?.installations_completed_email_pending}
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 lg:col-span-7">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cases by status</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">Pipeline distribution</div>
              <div className="mt-4">
                <StatusBars statusCounts={stats?.status_counts || {}} />
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 lg:col-span-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent activity</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">Latest status changes</div>
              <div className="mt-4 space-y-2">
                {activity.slice(0, 8).map((a) => (
                  <div key={a.created_at + a.case_id} className="rounded-2xl border bg-slate-50 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        {new Date(a.created_at).toLocaleString()}
                      </div>
                      <Pill tone={toneForActivityRow(a)} className="shrink-0">
                        {a.to_status}
                      </Pill>
                    </div>
                    <div className="mt-1 text-slate-700">
                      {a.from_status || '—'} → <span className="font-semibold">{a.to_status}</span>
                    </div>
                    {a.note ? <div className="mt-1 text-xs text-slate-500">{a.note}</div> : null}
                  </div>
                ))}
                {activity.length === 0 ? <div className="text-sm text-slate-600">No activity yet.</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}

function Kpi({ label, value, tone = 'slate', to }) {
  const inner = (
    <div className={`rounded-2xl border px-4 py-3 ${kpiBg(tone)}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value ?? '—'}</div>
    </div>
  )
  if (to) return <Link to={to}>{inner}</Link>
  return inner
}

function kpiBg(tone) {
  switch (tone) {
    case 'teal':
      return 'bg-teal-50 border-teal-200'
    case 'amber':
      return 'bg-amber-50 border-amber-200'
    case 'emerald':
      return 'bg-emerald-50 border-emerald-200'
    case 'rose':
      return 'bg-rose-50 border-rose-200'
    case 'indigo':
      return 'bg-indigo-50 border-indigo-200'
    default:
      return 'bg-slate-50 border-slate-200'
  }
}

function QuickLink({ to, label, value }) {
  return (
    <Link to={to} className="rounded-2xl border bg-white px-4 py-3 hover:bg-slate-50">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value ?? '—'}</div>
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
          <div className="min-w-[150px] rounded-2xl border border-white/15 bg-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/80">{s.label}</div>
              <Pill tone={toneForCaseStatus(s.status)} className="shrink-0">
                {s.status}
              </Pill>
            </div>
            <div className="mt-1 text-xs text-white/75">{s.note}</div>
          </div>
          {idx < steps.length - 1 ? (
            <div className="hidden items-center md:flex">
              <ChevronRight />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white/60">
      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
    <div className="space-y-2">
      {items.map((i) => {
        const v = Number(statusCounts?.[i.status] || 0)
        const pct = Math.round((v / max) * 100)
        return (
          <div key={i.status} className="flex items-center gap-2">
            <div className="w-36 truncate text-xs font-semibold text-slate-700">{i.label}</div>
            <div className="flex-1">
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-3 rounded-full ${barClassForTone(toneForCaseStatus(i.status))}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="w-10 text-right text-xs font-semibold text-slate-700">{v}</div>
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
            className={barClassForTone(i.tone)}
            style={{ width: `${Math.round(((Number(i.v) || 0) / total) * 100)}%` }}
            title={`${i.label}: ${i.v}`}
          />
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <div key={i.label} className="flex items-center justify-between rounded-xl border bg-white px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${dotClassForTone(i.tone)}`} />
              <span className="text-slate-700">{i.label}</span>
            </div>
            <span className="font-semibold text-slate-900">{i.v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function barClassForTone(tone) {
  switch (tone) {
    case 'teal':
      return 'bg-teal-500'
    case 'amber':
      return 'bg-amber-500'
    case 'emerald':
      return 'bg-emerald-500'
    case 'rose':
      return 'bg-rose-500'
    case 'indigo':
      return 'bg-indigo-500'
    default:
      return 'bg-slate-500'
  }
}

function dotClassForTone(tone) {
  switch (tone) {
    case 'teal':
      return 'bg-teal-500'
    case 'amber':
      return 'bg-amber-500'
    case 'emerald':
      return 'bg-emerald-500'
    case 'rose':
      return 'bg-rose-500'
    case 'indigo':
      return 'bg-indigo-500'
    default:
      return 'bg-slate-500'
  }
}

function Stat({ label, value, to }) {
  const display = value ?? '—'
  const inner = (
    <div className="rounded-2xl border bg-slate-50 p-4 hover:bg-slate-100">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{display}</div>
    </div>
  )

  if (to) return <Link to={to}>{inner}</Link>
  return inner
}

