import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'
import { Link, useSearchParams } from 'react-router-dom'
import { downloadCsv } from '../components/ui/csv.js'
import { Pill, PillButton } from '../components/ui/Pill.jsx'
import { CalendarGrid } from '../components/ui/CalendarGrid.jsx'
import { toneForCaseStatus } from '../utils/caseStatus.js'

function iso(d) {
  return d.toISOString()
}

export default function Surveys() {
  const [searchParams] = useSearchParams()
  const [start, setStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d
  })
  const [end, setEnd] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d
  })
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all') // all | reported_unpaid | unpaid | paid
  const [view, setView] = useState('calendar') // calendar | list

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/surveys/calendar', { params: { start: iso(start), end: iso(end) } })
      setItems(res.data || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load surveys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const f = searchParams.get('filter')
    if (f === 'all' || f === 'reported_unpaid' || f === 'unpaid' || f === 'paid') setFilter(f)
    const v = searchParams.get('view')
    if (v === 'calendar' || v === 'list') setView(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end])

  const sorted = useMemo(() => {
    const base = [...items]
    let filtered = base
    if (filter === 'reported_unpaid') {
      filtered = base.filter((x) => !!x.deposit_reported_at && !x.deposit_paid)
    } else if (filter === 'unpaid') {
      filtered = base.filter((x) => !x.deposit_paid)
    } else if (filter === 'paid') {
      filtered = base.filter((x) => !!x.deposit_paid)
    }
    return filtered.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
  }, [items])

  const events = useMemo(() => {
    return sorted
      .filter((s) => !!s.scheduled_date)
      .map((s) => {
        const dt = new Date(s.scheduled_date)
        const ref = s.reference_number || ''
        const who = s.customer_nickname || ''
        const addr = s.install_address || ''
        const titleParts = [ref, who].filter(Boolean)
        const subtitleParts = [addr].filter(Boolean)
        const depositPill = s.deposit_paid ? (
          <Pill tone="emerald">paid</Pill>
        ) : s.deposit_reported_at ? (
          <Pill tone="amber">reported</Pill>
        ) : (
          <Pill tone="slate">unpaid</Pill>
        )
        const statusPill = s.case_status ? <Pill tone={toneForCaseStatus(s.case_status)}>{s.case_status}</Pill> : null
        return {
          id: `${s.case_id}-${s.scheduled_date}`,
          start: dt,
          href: `/admin/cases/${s.case_id}`,
          tone: s.case_status ? toneForCaseStatus(s.case_status) : 'teal',
          title: (
            <div className="flex flex-wrap items-center gap-2">
              <span>{titleParts.length ? titleParts.join(' · ') : 'Survey'}</span>
              {statusPill}
            </div>
          ),
          subtitle: subtitleParts.length ? subtitleParts.join('') : s.case_id,
          pill: depositPill,
        }
      })
  }, [sorted])

  function exportCsv() {
    const rows = [
      ['scheduled_date', 'case_id', 'deposit_paid', 'deposit_reported_at', 'completed_at'],
      ...sorted.map((s) => [
        s.scheduled_date || '',
        s.case_id || '',
        s.deposit_paid ? 'yes' : 'no',
        s.deposit_reported_at || '',
        s.completed_at || '',
      ]),
    ]
    downloadCsv(`surveys-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <AdminShell>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Surveys</h1>
          <div className="mt-1 text-sm text-slate-600">Calendar feed (MVP list view).</div>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block">
            <div className="text-sm font-medium text-slate-800">Start</div>
            <input
              type="date"
              value={start.toISOString().slice(0, 10)}
              onChange={(e) => setStart(new Date(e.target.value + 'T00:00:00'))}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-800">End</div>
            <input
              type="date"
              value={end.toISOString().slice(0, 10)}
              onChange={(e) => setEnd(new Date(e.target.value + 'T23:59:59'))}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
            />
          </label>
          <button
            type="button"
            onClick={load}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Apply range
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filter</div>
          <div className="flex flex-wrap items-center gap-2">
            <PillButton active={filter === 'all'} tone="slate" onClick={() => setFilter('all')}>
              All
            </PillButton>
            <PillButton active={filter === 'reported_unpaid'} tone="amber" onClick={() => setFilter('reported_unpaid')}>
              Reported & unpaid
            </PillButton>
            <PillButton active={filter === 'unpaid'} tone="slate" onClick={() => setFilter('unpaid')}>
              Unpaid
            </PillButton>
            <PillButton active={filter === 'paid'} tone="emerald" onClick={() => setFilter('paid')}>
              Paid
            </PillButton>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">View</div>
          <div className="flex flex-wrap items-center gap-2">
            <PillButton active={view === 'calendar'} tone="teal" onClick={() => setView('calendar')}>
              Calendar
            </PillButton>
            <PillButton active={view === 'list'} tone="slate" onClick={() => setView('list')}>
              List
            </PillButton>
          </div>
        </div>

        {loading ? <div className="text-sm text-slate-600">Loading…</div> : null}
        {error ? <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

        {view === 'calendar' ? (
          <div className="mt-3">
            <CalendarGrid start={start} end={end} events={events} emptyMessage="No surveys in range." />
          </div>
        ) : (
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Scheduled</th>
                  <th className="px-3 py-2">Case ID</th>
                  <th className="px-3 py-2">Deposit</th>
                  <th className="px-3 py-2">Deposit report</th>
                  <th className="px-3 py-2">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((s) => (
                  <tr
                    key={s.case_id + s.scheduled_date}
                    className={s.deposit_reported_at && !s.deposit_paid ? 'bg-amber-50' : ''}
                  >
                    <td className="px-3 py-2">{new Date(s.scheduled_date).toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link className="text-teal-700 hover:underline" to={`/admin/cases/${s.case_id}`}>
                        {s.case_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Pill tone={s.deposit_paid ? 'emerald' : 'slate'}>{s.deposit_paid ? 'paid' : 'not paid'}</Pill>
                    </td>
                    <td className="px-3 py-2">
                      {s.deposit_reported_at ? (
                        <Pill tone="amber">reported {new Date(s.deposit_reported_at).toLocaleString()}</Pill>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{s.completed_at ? new Date(s.completed_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {!loading && sorted.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                      No surveys in range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  )
}

